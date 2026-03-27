package com.karibuhealth.app.ui.queue

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.karibuhealth.app.data.local.datastore.AuthTokenStore
import com.karibuhealth.app.data.local.db.converter.toDomain
import com.karibuhealth.app.data.local.db.entity.VisitWithPatient
import com.karibuhealth.app.data.repository.VisitRepository
import com.karibuhealth.app.domain.model.Patient
import com.karibuhealth.app.domain.model.Visit
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

data class QueueUiState(
    val queueItems: List<VisitWithPatient> = emptyList(),
    val isLoading: Boolean = true,
)

@HiltViewModel
class QueueViewModel @Inject constructor(
    private val visitRepository: VisitRepository,
    private val authTokenStore: AuthTokenStore,
) : ViewModel() {

    private val _uiState = MutableStateFlow(QueueUiState())
    val uiState: StateFlow<QueueUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            val clinicId = authTokenStore.getClinicId() ?: return@launch
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
}
