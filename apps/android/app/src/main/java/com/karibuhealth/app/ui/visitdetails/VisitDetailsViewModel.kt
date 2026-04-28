package com.karibuhealth.app.ui.visitdetails

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.karibuhealth.app.data.local.db.converter.toDomain
import com.karibuhealth.app.data.repository.NoteRepository
import com.karibuhealth.app.data.repository.VisitRepository
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
    val isLoading: Boolean = true,
    val connectionStatus: NetworkMonitor.ConnectionStatus = NetworkMonitor.ConnectionStatus(
        isOnline = false,
        quality = NetworkMonitor.ConnectionQuality.offline,
        downKbps = 0,
        upKbps = 0,
        transportLabel = "No signal",
    ),
)

val VisitDetailsUiState.hasLocalDraft: Boolean
    get() = providerNote?.transcript?.isNotBlank() == true && visit?.status == VisitStatus.pending

val VisitDetailsUiState.hasPendingVisitSync: Boolean
    get() = visit?.isSynced == false || patient?.isSynced == false

val VisitDetailsUiState.canUseAiDictation: Boolean
    get() = connectionStatus.isGoodForAi && !hasPendingVisitSync

val VisitDetailsUiState.aiAvailabilityMessage: String
    get() = when {
        !connectionStatus.isOnline -> "AI unavailable: offline"
        hasPendingVisitSync -> "AI unavailable until patient and visit finish syncing"
        !connectionStatus.isGoodForAi ->
            "AI unavailable: weak ${connectionStatus.transportLabel.lowercase()} signal (${connectionStatus.barsLabel})"
        else -> "AI ready on ${connectionStatus.transportLabel} (${connectionStatus.barsLabel})"
    }

@HiltViewModel
class VisitDetailsViewModel @Inject constructor(
    private val visitRepository: VisitRepository,
    private val noteRepository: NoteRepository,
    private val networkMonitor: NetworkMonitor,
) : ViewModel() {

    private val _uiState = MutableStateFlow(VisitDetailsUiState())
    val uiState: StateFlow<VisitDetailsUiState> = _uiState.asStateFlow()

    fun loadVisit(visitId: String) {
        viewModelScope.launch {
            visitRepository.getVisitWithDetails(visitId).collect { details ->
                if (details != null) {
                    _uiState.update {
                        it.copy(
                            visit = details.visit.toDomain(),
                            patient = details.patient.toDomain(),
                            providerNote = details.providerNote?.toDomain(),
                            patientNote = details.patientNote?.toDomain(),
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

        // Also try to refresh from server
        viewModelScope.launch {
            visitRepository.refreshVisit(visitId)
            noteRepository.refreshNotes(visitId)
        }
    }
}
