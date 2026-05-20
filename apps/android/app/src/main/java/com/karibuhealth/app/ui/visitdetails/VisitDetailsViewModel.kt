package com.karibuhealth.app.ui.visitdetails

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.karibuhealth.app.data.local.db.converter.toDomain
import com.karibuhealth.app.data.local.db.dao.SyncQueueDao
import com.karibuhealth.app.data.remote.api.SupabaseApi
import com.karibuhealth.app.data.remote.dto.AiReviewSuggestionDto
import com.karibuhealth.app.data.repository.NoteRepository
import com.karibuhealth.app.data.repository.StaffRepository
import com.karibuhealth.app.data.repository.VisitRepository
import com.karibuhealth.app.data.repository.VitalsRepository
import com.karibuhealth.app.data.sync.SyncEngine
import com.karibuhealth.app.util.NetworkMonitor
import com.karibuhealth.app.domain.model.*
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

data class VisitDetailsUiState(
    val visit: Visit? = null,
    val patient: Patient? = null,
    val providerNote: ProviderNote? = null,
    val patientNote: PatientNote? = null,
    /** Plain-language AI summary, distinct from the clinician's `patientNote`. */
    val aiPatientNote: PatientNote? = null,
    val latestVitals: PatientVitals? = null,
    /** Signed-in staff. Drives role-gated lifecycle actions (addend/cosign/etc). */
    val currentStaff: Staff? = null,
    val isLoading: Boolean = true,
    val isSyncing: Boolean = false,
    val connectionStatus: NetworkMonitor.ConnectionStatus = NetworkMonitor.ConnectionStatus(
        isOnline = false,
        quality = NetworkMonitor.ConnectionQuality.offline,
        downKbps = 0,
        upKbps = 0,
        transportLabel = "No signal",
    ),
    val syncErrors: List<SyncErrorInfo> = emptyList(),
    /**
     * AI review questions for this visit (migration 033). Surfaced as amber
     * banners on the visit screen — these are Uganda HC III guideline
     * conflicts or red-flag prompts the AI raised against the clinician's
     * note. Read-only for now; the response action ships once the
     * record_review_response RPC lands.
     */
    val aiReviewSuggestions: List<AiReviewSuggestionDto> = emptyList(),
)

data class SyncErrorInfo(
    val operationType: String,
    val attempts: Int,
    val lastError: String,
)

val VisitDetailsUiState.hasLocalDraft: Boolean
    get() = providerNote?.transcript?.isNotBlank() == true && visit?.status == VisitStatus.pending

val VisitDetailsUiState.hasPendingVisitSync: Boolean
    get() = visit?.isSynced == false || patient?.isSynced == false

val VisitDetailsUiState.canUseAiDictation: Boolean
    get() = connectionStatus.isGoodForAi

val VisitDetailsUiState.aiAvailabilityMessage: String
    get() = when {
        !connectionStatus.isOnline -> "AI unavailable: offline"
        hasPendingVisitSync -> "AI will sync patient and visit before submit"
        !connectionStatus.isGoodForAi ->
            "AI unavailable: weak ${connectionStatus.transportLabel.lowercase()} signal (${connectionStatus.barsLabel})"
        else -> "AI ready on ${connectionStatus.transportLabel} (${connectionStatus.barsLabel})"
    }

@HiltViewModel
class VisitDetailsViewModel @Inject constructor(
    private val visitRepository: VisitRepository,
    private val noteRepository: NoteRepository,
    private val vitalsRepository: VitalsRepository,
    private val staffRepository: StaffRepository,
    private val networkMonitor: NetworkMonitor,
    private val syncEngine: SyncEngine,
    private val syncQueueDao: SyncQueueDao,
    private val supabaseApi: SupabaseApi,
) : ViewModel() {

    private val _uiState = MutableStateFlow(VisitDetailsUiState())
    val uiState: StateFlow<VisitDetailsUiState> = _uiState.asStateFlow()

    fun loadVisit(visitId: String) {
        viewModelScope.launch {
            val me = staffRepository.getCurrentStaff()
            _uiState.update { it.copy(currentStaff = me) }
        }

        viewModelScope.launch {
            visitRepository.getVisitWithDetails(visitId).collect { details ->
                if (details != null) {
                    _uiState.update {
                        it.copy(
                            visit = details.visit.toDomain(),
                            patient = details.patient.toDomain(),
                            providerNote = details.providerNote?.toDomain(),
                            patientNote = details.clinicianPatientNote?.toDomain(),
                            aiPatientNote = details.aiPatientNote?.toDomain(),
                            isLoading = false,
                        )
                    }
                }
            }
        }

        viewModelScope.launch {
            networkMonitor.connectionStatusFlow.collect { status ->
                _uiState.update { it.copy(connectionStatus = status) }
            }
        }

        viewModelScope.launch {
            syncQueueDao.observeFailingEntries().collect { entries ->
                _uiState.update {
                    it.copy(
                        syncErrors = entries.map { e ->
                            SyncErrorInfo(
                                operationType = e.operationType,
                                attempts = e.attempts,
                                lastError = e.lastError.orEmpty(),
                            )
                        },
                    )
                }
            }
        }

        // Latest vitals for this visit — surfaced as inline chips on the
        // designed visit-details screen.
        viewModelScope.launch {
            vitalsRepository.getByVisit(visitId).collect { list ->
                _uiState.update { it.copy(latestVitals = list.firstOrNull()) }
            }
        }

        // Also try to refresh from server
        viewModelScope.launch {
            visitRepository.refreshVisit(visitId)
            noteRepository.refreshNotes(visitId)
        }

        // Best-effort fetch of AI review suggestions. Swallow errors — the
        // banner just stays hidden if the call fails (offline, RLS, etc.)
        // and the rest of the screen is unaffected.
        viewModelScope.launch {
            try {
                val suggestions = supabaseApi.getAiReviewSuggestions(visitId = "eq.$visitId")
                _uiState.update { it.copy(aiReviewSuggestions = suggestions) }
            } catch (e: Exception) {
                android.util.Log.w("VisitDetailsVM", "AI review fetch failed: ${e.message}")
            }
        }
    }

    fun trySync(visitId: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isSyncing = true) }
            try {
                // Manual sync is also "give up and retry" — un-fail any
                // entries that hit max_attempts so a server-side fix has a
                // chance to land without uninstalling the app.
                syncQueueDao.resetFailed()
                syncEngine.processQueue()
                visitRepository.refreshVisit(visitId)
                noteRepository.refreshNotes(visitId)
            } finally {
                _uiState.update { it.copy(isSyncing = false) }
            }
        }
    }

    // Lifecycle actions (migration 044). Each goes through the repository's
    // direct-write-or-queue path so they Just Work offline too.
    fun addendCurrentNote(addendumText: String) {
        val noteId = _uiState.value.providerNote?.id ?: return
        viewModelScope.launch {
            noteRepository.addendNote(noteId = noteId, addendumText = addendumText)
        }
    }

    fun amendCurrentNote(transcript: String, reason: String) {
        val noteId = _uiState.value.providerNote?.id ?: return
        viewModelScope.launch {
            noteRepository.amendNote(noteId = noteId, transcript = transcript, reason = reason)
        }
    }

    fun voidCurrentNote(reason: String) {
        val noteId = _uiState.value.providerNote?.id ?: return
        viewModelScope.launch {
            noteRepository.voidNote(noteId = noteId, reason = reason)
        }
    }

    fun cosignCurrentNote() {
        val noteId = _uiState.value.providerNote?.id ?: return
        viewModelScope.launch {
            noteRepository.cosignNote(noteId = noteId)
        }
    }
}
