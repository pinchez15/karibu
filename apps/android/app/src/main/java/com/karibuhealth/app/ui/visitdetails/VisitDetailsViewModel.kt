package com.karibuhealth.app.ui.visitdetails

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.karibuhealth.app.data.local.db.converter.toDomain
import com.karibuhealth.app.data.local.db.dao.SyncQueueDao
import com.karibuhealth.app.data.remote.api.DictationApiClient
import com.karibuhealth.app.data.remote.api.SupabaseApi
import com.karibuhealth.app.data.remote.dto.AiReviewSuggestionDto
import com.karibuhealth.app.data.remote.dto.RecordCriticalAlertResponseRequest
import com.karibuhealth.app.data.remote.dto.UpsertCriticalAlertRequest
import com.karibuhealth.app.data.remote.dto.VisitCriticalAlertDto
import com.karibuhealth.app.domain.CriticalAlertRules
import com.karibuhealth.app.ui.components.filterTimelineAiNotes
import com.karibuhealth.app.data.repository.NoteRepository
import com.karibuhealth.app.data.repository.StaffRepository
import com.karibuhealth.app.data.repository.VisitRepository
import com.karibuhealth.app.data.repository.VitalsRepository
import com.karibuhealth.app.data.local.db.entity.SyncQueueEntry
import com.karibuhealth.app.data.remote.dto.RecordReviewResponseRequest
import com.karibuhealth.app.data.sync.SyncEngine
import com.karibuhealth.app.data.sync.SyncQueueHelper
import com.karibuhealth.app.util.NetworkMonitor
import com.karibuhealth.app.domain.model.*
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonPrimitive
import java.util.UUID
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
     * AI review questions for this visit (migration 033). Actionable via swipe
     * on the visit screen; responses go through rpc_record_review_response.
     */
    val aiReviewSuggestions: List<AiReviewSuggestionDto> = emptyList(),
    val criticalAlerts: List<VisitCriticalAlertDto> = emptyList(),
    // Outbreak (migration 052/060): true when this clinic's region is on the
    // ebola protocol; the screening record gates the interruptive VHF banner.
    val ebolaProtocolActive: Boolean = false,
    val ebolaScreening: com.karibuhealth.app.data.local.db.entity.EbolaScreeningEntity? = null,
    val aiReviewError: String? = null,
    val isSendingToPharmacy: Boolean = false,
    val pharmacyMessage: String? = null,
    val pendingSyncCount: Int = 0,
    val isOnline: Boolean = true,
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

val VisitDetailsUiState.pendingAiReviewCount: Int
    get() = aiReviewSuggestions.count { it.clinicianResponse == null }

val VisitDetailsUiState.timelineAiNotes: List<AiReviewSuggestionDto>
    get() = filterTimelineAiNotes(
        aiReviewSuggestions,
        visit?.documentationComplete == true,
    ).take(3)

val VisitDetailsUiState.activeCriticalAlerts: List<VisitCriticalAlertDto>
    get() = criticalAlerts.filter { it.clinicianResponse == null }

@HiltViewModel
class VisitDetailsViewModel @Inject constructor(
    private val visitRepository: VisitRepository,
    private val noteRepository: NoteRepository,
    private val vitalsRepository: VitalsRepository,
    private val staffRepository: StaffRepository,
    private val regionProtocolRepository: com.karibuhealth.app.data.repository.RegionProtocolRepository,
    private val authTokenStore: com.karibuhealth.app.data.local.datastore.AuthTokenStore,
    private val networkMonitor: NetworkMonitor,
    private val syncEngine: SyncEngine,
    private val syncQueueDao: SyncQueueDao,
    private val syncQueueHelper: SyncQueueHelper,
    private val supabaseApi: SupabaseApi,
    private val dictationApiClient: DictationApiClient,
    private val json: Json,
) : ViewModel() {

    private var loadedVisitId: String? = null

    private val _uiState = MutableStateFlow(VisitDetailsUiState())
    val uiState: StateFlow<VisitDetailsUiState> = _uiState.asStateFlow()

    fun loadVisit(visitId: String) {
        loadedVisitId = visitId
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
                            patient = details.patient?.toDomain(),
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
                _uiState.update {
                    it.copy(connectionStatus = status, isOnline = status.isOnline)
                }
            }
        }

        viewModelScope.launch {
            syncQueueDao.getPendingCountForVisit(visitId).collect { count ->
                _uiState.update { it.copy(pendingSyncCount = count) }
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

        // Outbreak gating: is this clinic's region on the ebola protocol, and is
        // there a screening on this visit? Drives the interruptive VHF banner.
        viewModelScope.launch {
            regionProtocolRepository.observeIsOnProtocol(com.karibuhealth.app.domain.OutbreakScreeningRules.EBOLA)
                .collect { active -> _uiState.update { it.copy(ebolaProtocolActive = active) } }
        }
        viewModelScope.launch {
            regionProtocolRepository.observeVisitScreening(visitId)
                .collect { s -> _uiState.update { it.copy(ebolaScreening = s) } }
        }
        viewModelScope.launch {
            authTokenStore.getClinicId()?.let { regionProtocolRepository.refreshProtocols(it) }
            regionProtocolRepository.refreshVisitScreening(visitId)
        }

        // Latest vitals for this visit — surfaced as inline chips on the
        // designed visit-details screen.
        viewModelScope.launch {
            vitalsRepository.getByVisit(visitId).collect { list ->
                val vitals = list.firstOrNull()
                _uiState.update { it.copy(latestVitals = vitals) }
                val patient = _uiState.value.patient
                val visit = _uiState.value.visit
                if (patient != null && vitals != null && visit?.documentationComplete != true) {
                    syncCriticalAlerts(visitId, patient, vitals)
                }
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
                refreshAiSuggestions(visitId)
                refreshCriticalAlerts(visitId)
            } catch (e: Exception) {
                android.util.Log.w("VisitDetailsVM", "AI review fetch failed: ${e.message}")
            }
        }
    }

    /**
     * Run the VHF suspect-case screen for this visit and record it. Fever comes
     * from the latest vitals; the rest from the screening checklist. Records the
     * result (suspect or not) so it is auditable and the banner persists.
     */
    fun recordEbolaScreening(
        epiContact: Boolean,
        unexplainedBleeding: Boolean,
        symptoms: Set<com.karibuhealth.app.domain.OutbreakScreeningRules.VhfSymptom>,
    ) {
        val s = _uiState.value
        val patient = s.patient ?: return
        val visit = s.visit ?: return
        val result = com.karibuhealth.app.domain.OutbreakScreeningRules.screenEbola(
            com.karibuhealth.app.domain.OutbreakScreeningRules.Input(
                tempC = s.latestVitals?.tempC,
                epidemiologicalContact = epiContact,
                unexplainedBleeding = unexplainedBleeding,
                symptoms = symptoms,
            ),
        )
        viewModelScope.launch {
            val clinicId = authTokenStore.getClinicId() ?: return@launch
            runCatching {
                regionProtocolRepository.recordScreening(
                    clinicId = clinicId,
                    patientId = patient.id,
                    visitId = visit.id,
                    tempC = s.latestVitals?.tempC,
                    epiContact = epiContact,
                    unexplainedBleeding = unexplainedBleeding,
                    symptoms = symptoms.joinToString(",") { it.name },
                    isSuspect = result.isSuspect,
                    actionTaken = if (result.isSuspect) "isolation_initiated" else null,
                )
            }.onFailure { e -> _uiState.update { it.copy(aiReviewError = e.message) } }
        }
    }

    private suspend fun syncCriticalAlerts(visitId: String, patient: Patient, vitals: PatientVitals) {
        if (!networkMonitor.isOnline()) return
        val candidates = CriticalAlertRules.evaluate(patient, vitals)
        for (c in candidates) {
            runCatching {
                supabaseApi.rpcUpsertCriticalAlert(
                    UpsertCriticalAlertRequest(
                        visitId = visitId,
                        ruleSlug = c.ruleSlug,
                        confirmQuestion = c.confirmQuestion,
                        clinicalPrompt = c.clinicalPrompt,
                        librarySlug = c.librarySlug,
                    ),
                )
            }
        }
        refreshCriticalAlerts(visitId)
    }

    private suspend fun refreshCriticalAlerts(visitId: String) {
        runCatching {
            supabaseApi.getVisitCriticalAlerts(visitId = "eq.$visitId")
        }.onSuccess { alerts ->
            _uiState.update { it.copy(criticalAlerts = alerts) }
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

    fun dismissAiSuggestion(suggestionId: String) {
        recordAiReviewResponse(suggestionId, "dismissed")
    }

    fun acknowledgeAiSuggestion(suggestionId: String) {
        recordAiReviewResponse(suggestionId, "considered_proceeded")
    }

    fun incorporateAiSuggestion(suggestionId: String, onNavigate: () -> Unit) {
        recordAiReviewResponse(suggestionId, "reopened_note", onSuccess = onNavigate)
    }

    fun respondToCriticalAlert(alertId: String, response: String) {
        viewModelScope.launch {
            _uiState.update {
                it.copy(criticalAlerts = it.criticalAlerts.filter { a -> a.id != alertId })
            }
            runCatching {
                if (networkMonitor.isOnline()) {
                    supabaseApi.rpcRecordCriticalAlertResponse(
                        RecordCriticalAlertResponseRequest(alertId, response),
                    )
                }
            }.onFailure { e ->
                _uiState.update { it.copy(aiReviewError = e.message) }
            }
            loadedVisitId?.let { refreshCriticalAlerts(it) }
        }
    }

    private fun recordAiReviewResponse(
        suggestionId: String,
        response: String,
        onSuccess: (() -> Unit)? = null,
    ) {
        viewModelScope.launch {
            _uiState.update { state ->
                state.copy(
                    aiReviewSuggestions = state.aiReviewSuggestions.filter { it.id != suggestionId },
                    aiReviewError = null,
                )
            }
            val request = RecordReviewResponseRequest(
                suggestionId = suggestionId,
                response = response,
            )
            runCatching {
                if (networkMonitor.isOnline()) {
                    val result = supabaseApi.rpcRecordReviewResponse(request)
                    if (!result.isSuccessful) {
                        val body = result.errorBody()?.string().orEmpty()
                        throw IllegalStateException(
                            "record_review_response HTTP ${result.code()} ${body.take(200)}".trim(),
                        )
                    }
                } else {
                    syncQueueHelper.enqueue(
                        SyncQueueEntry(
                            id = UUID.randomUUID().toString(),
                            operationType = "record_review_response",
                            entityType = "ai_review_suggestion",
                            entityId = suggestionId,
                            payload = json.encodeToString(request),
                            status = "pending",
                            createdAt = System.currentTimeMillis(),
                        ),
                    )
                    syncEngine.processQueue()
                }
                onSuccess?.invoke()
            }.onFailure { e ->
                _uiState.update { state ->
                    state.copy(aiReviewError = e.message ?: "Could not save AI response")
                }
                refreshAiSuggestions(_uiState.value.visit?.id)
            }
        }
    }

    private fun refreshAiSuggestions(visitId: String?) {
        if (visitId == null) return
        viewModelScope.launch {
            runCatching {
                supabaseApi.getAiReviewSuggestions(visitId = "eq.$visitId")
            }.onSuccess { suggestions ->
                _uiState.update { it.copy(aiReviewSuggestions = suggestions) }
            }
        }
    }

    fun sendToPharmacy() {
        val visit = _uiState.value.visit ?: return
        val staffId = _uiState.value.currentStaff?.id ?: return
        val meds = visit.medications?.trim().orEmpty()
        if (meds.isEmpty()) {
            _uiState.update { it.copy(pharmacyMessage = "Add medications before sending to pharmacy") }
            return
        }
        viewModelScope.launch {
            _uiState.update { it.copy(isSendingToPharmacy = true, pharmacyMessage = null) }
            runCatching {
                visitRepository.submitPharmacyOrder(visit.id, meds, staffId)
                visitRepository.refreshVisit(visit.id)
            }.onSuccess {
                _uiState.update { it.copy(pharmacyMessage = "Sent to pharmacy") }
            }.onFailure { e ->
                _uiState.update { it.copy(pharmacyMessage = e.message ?: "Could not send to pharmacy") }
            }
            _uiState.update { it.copy(isSendingToPharmacy = false) }
        }
    }
}
