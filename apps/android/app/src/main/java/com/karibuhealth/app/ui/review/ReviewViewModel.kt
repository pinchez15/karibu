package com.karibuhealth.app.ui.review

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.karibuhealth.app.data.remote.api.DictationApiClient
import com.karibuhealth.app.data.remote.api.DictationException
import com.karibuhealth.app.data.repository.NoteRepository
import com.karibuhealth.app.data.repository.VisitRepository
import com.karibuhealth.app.domain.model.PatientNote
import com.karibuhealth.app.domain.model.ProviderNote
import com.karibuhealth.app.domain.model.Visit
import com.karibuhealth.app.util.Analytics
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import javax.inject.Inject

data class ReviewUiState(
    val visit: Visit? = null,
    val providerNote: ProviderNote? = null,
    val patientNote: PatientNote? = null,
    val isLoading: Boolean = true,
    val isApproving: Boolean = false,
    val isRejecting: Boolean = false,
    val approved: Boolean = false,
    val rejected: Boolean = false,
    val error: String? = null,
)

@HiltViewModel
class ReviewViewModel @Inject constructor(
    private val visitRepository: VisitRepository,
    private val noteRepository: NoteRepository,
    private val dictationApi: DictationApiClient,
    private val analytics: Analytics,
) : ViewModel() {

    private val _uiState = MutableStateFlow(ReviewUiState())
    val uiState: StateFlow<ReviewUiState> = _uiState.asStateFlow()

    fun loadVisit(visitId: String) {
        viewModelScope.launch {
            noteRepository.refreshNotes(visitId)

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
            _uiState.update { it.copy(isApproving = true, error = null) }
            try {
                withContext(Dispatchers.IO) {
                    dictationApi.approveDictation(visitId)
                }
                analytics.capture(Analytics.Events.NOTE_APPROVED, mapOf("visit_id" to visitId))
                // Pull fresh state so the local Room cache reflects 'sent' /
                // 'reviewed' before navigation drops the user back to Home.
                noteRepository.refreshNotes(visitId)
                visitRepository.refreshVisit(visitId)
                _uiState.update { it.copy(isApproving = false, approved = true) }
            } catch (e: DictationException) {
                _uiState.update { it.copy(isApproving = false, error = e.message) }
            } catch (e: Exception) {
                _uiState.update { it.copy(isApproving = false, error = "Approve failed: ${e.message}") }
            }
        }
    }

    fun rejectNote(visitId: String, reason: String? = null) {
        viewModelScope.launch {
            _uiState.update { it.copy(isRejecting = true, error = null) }
            try {
                withContext(Dispatchers.IO) {
                    dictationApi.rejectDictation(visitId, reason)
                }
                analytics.capture(Analytics.Events.NOTE_REJECTED, mapOf("visit_id" to visitId))
                noteRepository.refreshNotes(visitId)
                visitRepository.refreshVisit(visitId)
                _uiState.update { it.copy(isRejecting = false, rejected = true) }
            } catch (e: DictationException) {
                _uiState.update { it.copy(isRejecting = false, error = e.message) }
            } catch (e: Exception) {
                _uiState.update { it.copy(isRejecting = false, error = "Reject failed: ${e.message}") }
            }
        }
    }

    fun dismissError() {
        _uiState.update { it.copy(error = null) }
    }
}
