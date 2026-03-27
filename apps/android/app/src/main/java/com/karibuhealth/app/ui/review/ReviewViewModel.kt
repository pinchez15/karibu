package com.karibuhealth.app.ui.review

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.karibuhealth.app.data.repository.NoteRepository
import com.karibuhealth.app.data.repository.VisitRepository
import com.karibuhealth.app.domain.model.PatientNote
import com.karibuhealth.app.domain.model.ProviderNote
import com.karibuhealth.app.domain.model.Visit
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ReviewUiState(
    val visit: Visit? = null,
    val providerNote: ProviderNote? = null,
    val patientNote: PatientNote? = null,
    val isLoading: Boolean = true,
    val isApproving: Boolean = false,
    val error: String? = null,
)

@HiltViewModel
class ReviewViewModel @Inject constructor(
    private val visitRepository: VisitRepository,
    private val noteRepository: NoteRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(ReviewUiState())
    val uiState: StateFlow<ReviewUiState> = _uiState.asStateFlow()

    fun loadVisit(visitId: String) {
        viewModelScope.launch {
            // Refresh from server
            noteRepository.refreshNotes(visitId)

            // Observe local state
            visitRepository.getVisitById(visitId).collect { visit ->
                _uiState.update { it.copy(visit = visit) }
            }
        }

        viewModelScope.launch {
            noteRepository.getProviderNote(visitId).collect { note ->
                _uiState.update { it.copy(providerNote = note, isLoading = note == null) }
            }
        }

        viewModelScope.launch {
            noteRepository.getPatientNote(visitId).collect { note ->
                _uiState.update { it.copy(patientNote = note) }
            }
        }
    }

    fun approveNote(visitId: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isApproving = true) }
            try {
                // Update visit status locally -- sync will push to server
                visitRepository.updateStatus(
                    visitId,
                    com.karibuhealth.app.domain.model.VisitStatus.sent,
                )
                _uiState.update { it.copy(isApproving = false) }
            } catch (e: Exception) {
                _uiState.update { it.copy(error = e.message, isApproving = false) }
            }
        }
    }
}
