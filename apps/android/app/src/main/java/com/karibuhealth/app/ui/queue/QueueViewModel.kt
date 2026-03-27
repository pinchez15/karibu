package com.karibuhealth.app.ui.queue

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.karibuhealth.app.data.local.datastore.AuthTokenStore
import com.karibuhealth.app.data.local.db.entity.VisitWithPatient
import com.karibuhealth.app.data.remote.api.RealtimeClient
import com.karibuhealth.app.data.remote.api.RealtimeConnectionState
import com.karibuhealth.app.data.repository.VisitRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

data class QueueUiState(
    val queueItems: List<VisitWithPatient> = emptyList(),
    val isLoading: Boolean = true,
    val isRealtimeConnected: Boolean = false,
)

@HiltViewModel
class QueueViewModel @Inject constructor(
    private val visitRepository: VisitRepository,
    private val authTokenStore: AuthTokenStore,
    private val realtimeClient: RealtimeClient,
) : ViewModel() {

    private val _uiState = MutableStateFlow(QueueUiState())
    val uiState: StateFlow<QueueUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            val clinicId = authTokenStore.getClinicId() ?: return@launch

            // Connect Realtime for live updates
            realtimeClient.connect(clinicId)

            // Observe Realtime connection state
            realtimeClient.connectionState.collect { state ->
                _uiState.update {
                    it.copy(isRealtimeConnected = state == RealtimeConnectionState.CONNECTED)
                }
            }
        }

        viewModelScope.launch {
            val clinicId = authTokenStore.getClinicId() ?: return@launch
            // Room Flow auto-updates when Realtime writes to the DAO
            visitRepository.getTodayQueue(clinicId).collect { queue ->
                _uiState.update { it.copy(queueItems = queue, isLoading = false) }
            }
        }
    }

    fun refresh() {
        viewModelScope.launch {
            val clinicId = authTokenStore.getClinicId() ?: return@launch
            visitRepository.refreshTodayVisits(clinicId)
        }
    }

    override fun onCleared() {
        super.onCleared()
        realtimeClient.disconnect()
    }
}
