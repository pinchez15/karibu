package com.karibuhealth.app.ui.processing

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.karibuhealth.app.data.repository.NoteRepository
import com.karibuhealth.app.data.repository.VisitRepository
import com.karibuhealth.app.domain.model.Visit
import com.karibuhealth.app.domain.model.VisitStatus
import com.karibuhealth.app.util.NetworkMonitor
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ProcessingUiState(
    val visit: Visit? = null,
    val isProcessing: Boolean = true,
    val isReady: Boolean = false,
    val error: String? = null,
)

@HiltViewModel
class ProcessingViewModel @Inject constructor(
    private val visitRepository: VisitRepository,
    private val noteRepository: NoteRepository,
    private val networkMonitor: NetworkMonitor,
) : ViewModel() {

    private val _uiState = MutableStateFlow(ProcessingUiState())
    val uiState: StateFlow<ProcessingUiState> = _uiState.asStateFlow()

    fun startPolling(visitId: String) {
        viewModelScope.launch {
            // Observe local visit state
            visitRepository.getVisitById(visitId).collect { visit ->
                _uiState.update {
                    it.copy(
                        visit = visit,
                        isReady = visit?.status == VisitStatus.review,
                        isProcessing = visit?.status in listOf(
                            VisitStatus.uploading,
                            VisitStatus.processing,
                        ),
                        error = visit?.errorMessage,
                    )
                }
            }
        }

        // Poll server every 10 seconds for status updates
        viewModelScope.launch {
            while (true) {
                delay(10_000)
                if (networkMonitor.isOnline()) {
                    visitRepository.refreshVisit(visitId)
                    noteRepository.refreshNotes(visitId)
                }
                if (_uiState.value.isReady) break
            }
        }
    }
}
