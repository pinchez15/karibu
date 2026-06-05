package com.karibuhealth.app.ui.patientdetail

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.karibuhealth.app.data.local.datastore.AuthTokenStore
import com.karibuhealth.app.data.local.datastore.RecentPatientsStore
import com.karibuhealth.app.data.local.db.dao.SyncQueueDao
import com.karibuhealth.app.data.repository.PatientRepository
import com.karibuhealth.app.data.repository.StaffRepository
import com.karibuhealth.app.data.repository.VisitRepository
import com.karibuhealth.app.domain.model.Visit
import com.karibuhealth.app.domain.model.Patient
import com.karibuhealth.app.domain.model.PatientLatestVitals
import com.karibuhealth.app.domain.model.PatientTimelineEvent
import com.karibuhealth.app.util.NetworkMonitor
import dagger.hilt.android.lifecycle.HiltViewModel
import com.karibuhealth.app.ui.util.formatPatientName
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
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
    val pendingSyncCount: Int = 0,
    val isOnline: Boolean = true,
    val enabledProtocolSlugs: List<String> = emptyList(),
    val protocolActivating: String? = null,
    val protocolMessage: String? = null,
)

@HiltViewModel
class PatientTimelineViewModel @Inject constructor(
    private val patientRepository: PatientRepository,
    private val visitRepository: VisitRepository,
    private val staffRepository: StaffRepository,
    private val authTokenStore: AuthTokenStore,
    private val syncQueueDao: SyncQueueDao,
    private val networkMonitor: NetworkMonitor,
    private val recentPatientsStore: RecentPatientsStore,
) : ViewModel() {

    private val _uiState = MutableStateFlow(PatientTimelineUiState())
    val uiState: StateFlow<PatientTimelineUiState> = _uiState.asStateFlow()

    private var loadedPatientId: String? = null
    private var syncObserversJob: Job? = null

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
        observeSyncForPatient(patientId)
        fetch(patientId, resetState = true)
    }

    private fun observeSyncForPatient(patientId: String) {
        syncObserversJob?.cancel()
        syncObserversJob = viewModelScope.launch {
            launch {
                syncQueueDao.getPendingCountForPatient(patientId).collect { count ->
                    _uiState.update { it.copy(pendingSyncCount = count) }
                }
            }
            launch {
                networkMonitor.isOnlineFlow.collect { online ->
                    _uiState.update { it.copy(isOnline = online) }
                }
            }
        }
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

    suspend fun refreshAndAwait() {
        val patientId = loadedPatientId ?: return
        fetch(patientId, resetState = false)
        // fetch() launches async work — brief wait so pull-to-refresh doesn't
        // snap shut before the timeline repaints.
        delay(400)
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
            val protocolsDeferred = async {
                val clinicId = authTokenStore.getClinicId() ?: return@async emptyList()
                staffRepository.getClinic(clinicId).first()
                    ?.workflowConfig
                    ?.enabledProtocolSlugs
                    .orEmpty()
            }

            val patient = patientDeferred.await()
            val vitals = vitalsDeferred.await()
            val events = timelineDeferred.await()
            val todayVisit = todayVisitDeferred.await()
            val protocolSlugs = protocolsDeferred.await()

            val resolvedPatient = patient ?: _uiState.value.patient
            _uiState.update {
                it.copy(
                    patient = resolvedPatient,
                    latestVitals = vitals ?: it.latestVitals,
                    todayVisit = todayVisit,
                    enabledProtocolSlugs = protocolSlugs,
                    events = events,
                    isLoading = false,
                    hasMore = events.size >= PAGE_SIZE,
                    error = if (events.isEmpty() && vitals == null && resolvedPatient == null) {
                        "Couldn't load patient — check your connection."
                    } else null,
                )
            }
            resolvedPatient?.let { p ->
                val name = formatPatientName(p.firstName, p.lastName, p.displayName)
                recentPatientsStore.recordTouch(p.id, name, todayVisit?.id)
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

    fun activateProtocol(slug: String) {
        val patientId = loadedPatientId ?: return
        if (!_uiState.value.isOnline) {
            _uiState.update { it.copy(protocolMessage = "Protocol activation requires connection.") }
            return
        }
        viewModelScope.launch {
            _uiState.update { it.copy(protocolActivating = slug, protocolMessage = null) }
            try {
                visitRepository.activateClinicalProtocol(
                    patientId = patientId,
                    protocolSlug = slug,
                    visitId = _uiState.value.todayVisit?.id,
                )
                _uiState.update {
                    it.copy(
                        protocolActivating = null,
                        protocolMessage = "Protocol activated: $slug",
                    )
                }
                refresh()
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        protocolActivating = null,
                        protocolMessage = e.message ?: "Protocol activation failed",
                    )
                }
            }
        }
    }
}
