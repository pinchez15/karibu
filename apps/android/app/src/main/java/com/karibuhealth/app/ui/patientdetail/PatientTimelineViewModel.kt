package com.karibuhealth.app.ui.patientdetail

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.karibuhealth.app.data.local.datastore.AuthTokenStore
import com.karibuhealth.app.data.repository.PatientRepository
import com.karibuhealth.app.data.repository.VisitRepository
import com.karibuhealth.app.domain.model.Visit
import com.karibuhealth.app.domain.model.Patient
import com.karibuhealth.app.domain.model.PatientLatestVitals
import com.karibuhealth.app.domain.model.PatientTimelineEvent
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Phase 3 patient timeline.
 *
 * Single screen surface for a clinician opening one patient: longitudinal
 * context (visits, notes, vitals, payments) chronologically, plus the
 * latest-known value for each vital so today's missing weight/temp/BP doesn't
 * mean the clinician is operating blind.
 *
 * Pagination is cursor-based — the server's rpc_get_patient_timeline takes
 * the oldest event_at from the previous page as an exclusive cursor and
 * returns the next slice.
 */
data class PatientTimelineUiState(
    val patient: Patient? = null,
    val latestVitals: PatientLatestVitals? = null,
    val events: List<PatientTimelineEvent> = emptyList(),
    val isLoading: Boolean = true,
    val isLoadingMore: Boolean = false,
    val hasMore: Boolean = true,
    val error: String? = null,
    /** Today's visit for lab/pharmacy pathway badges on the chart header. */
    val todayVisit: Visit? = null,
)

@HiltViewModel
class PatientTimelineViewModel @Inject constructor(
    private val patientRepository: PatientRepository,
    private val visitRepository: VisitRepository,
    @Suppress("unused") private val authTokenStore: AuthTokenStore,
) : ViewModel() {

    private val _uiState = MutableStateFlow(PatientTimelineUiState())
    val uiState: StateFlow<PatientTimelineUiState> = _uiState.asStateFlow()

    private var loadedPatientId: String? = null

    private companion object {
        // Server-side default is 50 — keep mobile-bandwidth sensible. If a
        // page comes back shorter than this we treat it as the end.
        const val PAGE_SIZE = 50
    }

    /**
     * Fire the initial fetch for a patient. Idempotent across recomposition
     * — repeated calls with the same id are ignored. Patient row, latest
     * vitals, and first timeline page are fetched in parallel.
     */
    fun loadPatient(patientId: String) {
        if (loadedPatientId == patientId) return
        loadedPatientId = patientId
        fetch(patientId, resetState = true)
    }

    /**
     * Refresh the currently-loaded patient. Used when the timeline screen
     * resumes after navigating away (e.g. returning from Phase 4 patient
     * vitals capture or a future patient-only note edit) so the new row
     * appears without requiring a manual pull-to-refresh.
     */
    fun refresh() {
        val patientId = loadedPatientId ?: return
        fetch(patientId, resetState = false)
    }

    private fun fetch(patientId: String, resetState: Boolean) {
        if (resetState) {
            _uiState.update { PatientTimelineUiState(isLoading = true) }
        }

        viewModelScope.launch {
            // Patient cache might already have the row (Phase 1 caches every
            // patient seen). Fall through to "no patient" gracefully if not.
            val patientDeferred = async {
                runCatching { patientRepository.getPatientByIdOnce(patientId) }.getOrNull()
                    ?: runCatching { patientRepository.getPatientById(patientId).first() }.getOrNull()
            }
            val vitalsDeferred = async { patientRepository.getPatientLatestVitals(patientId) }
            val timelineDeferred = async {
                patientRepository.getPatientTimeline(patientId = patientId, limit = PAGE_SIZE)
            }
            val todayVisitDeferred = async {
                visitRepository.getLatestVisitForPatientToday(patientId)
            }

            val patient = patientDeferred.await()
            val vitals = vitalsDeferred.await()
            val events = timelineDeferred.await()
            val todayVisit = todayVisitDeferred.await()

            _uiState.update {
                it.copy(
                    patient = patient ?: it.patient,
                    latestVitals = vitals ?: it.latestVitals,
                    todayVisit = todayVisit,
                    events = events,
                    isLoading = false,
                    hasMore = events.size >= PAGE_SIZE,
                    error = if (events.isEmpty() && vitals == null && patient == null && it.patient == null) {
                        "Couldn't load patient — check your connection."
                    } else null,
                )
            }
        }
    }

    /**
     * Paginate the next slice of timeline events using the oldest event_at
     * from the current page as the cursor. No-ops if we're already loading,
     * the previous page hit the end, or we have no anchor event yet.
     */
    fun loadMore() {
        val state = _uiState.value
        if (state.isLoadingMore || !state.hasMore || state.isLoading) return
        val patientId = loadedPatientId ?: return
        val cursor = state.events.lastOrNull()?.eventAt ?: return

        _uiState.update { it.copy(isLoadingMore = true) }
        viewModelScope.launch {
            val next = patientRepository.getPatientTimeline(
                patientId = patientId,
                cursor = cursor,
                limit = PAGE_SIZE,
            )
            _uiState.update {
                it.copy(
                    events = it.events + next,
                    isLoadingMore = false,
                    hasMore = next.size >= PAGE_SIZE,
                )
            }
        }
    }
}
