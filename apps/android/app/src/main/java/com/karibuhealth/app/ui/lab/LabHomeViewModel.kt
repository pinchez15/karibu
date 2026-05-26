package com.karibuhealth.app.ui.lab

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.karibuhealth.app.data.local.datastore.AuthTokenStore
import com.karibuhealth.app.data.repository.StaffRepository
import com.karibuhealth.app.data.repository.VisitRepository
import com.karibuhealth.app.data.repository.WorklistRepository
import com.karibuhealth.app.domain.model.NeedsLabItem
import com.karibuhealth.app.domain.model.Staff
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class LabHomeUiState(
    val staff: Staff? = null,
    val items: List<NeedsLabItem> = emptyList(),
    val isLoading: Boolean = true,
    val error: String? = null,
    val actionVisitId: String? = null,
)

@HiltViewModel
class LabHomeViewModel @Inject constructor(
    private val authTokenStore: AuthTokenStore,
    private val staffRepository: StaffRepository,
    private val worklistRepository: WorklistRepository,
    private val visitRepository: VisitRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(LabHomeUiState())
    val uiState: StateFlow<LabHomeUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            val clerkUserId = authTokenStore.getClerkUserId() ?: return@launch
            val staff = staffRepository.fetchAndCacheStaff(clerkUserId) ?: return@launch
            _uiState.update { it.copy(staff = staff) }
            refresh()
        }
    }

    fun refresh() {
        val staff = _uiState.value.staff ?: return
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            val items = worklistRepository.getNeedsLab(staff.clinicId)
            _uiState.update { it.copy(items = items, isLoading = false) }
        }
    }

    fun startLab(visitId: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(actionVisitId = visitId) }
            runCatching { visitRepository.startLab(visitId) }
                .onFailure { e ->
                    _uiState.update { it.copy(error = e.message) }
                }
            refresh()
            _uiState.update { it.copy(actionVisitId = null) }
        }
    }

    fun recordResult(visitId: String, result: String, abnormal: Boolean) {
        val staffId = _uiState.value.staff?.id ?: return
        viewModelScope.launch {
            _uiState.update { it.copy(actionVisitId = visitId) }
            runCatching { visitRepository.recordLabResult(visitId, result, abnormal, staffId) }
                .onFailure { e ->
                    _uiState.update { it.copy(error = e.message) }
                }
            refresh()
            _uiState.update { it.copy(actionVisitId = null) }
        }
    }
}
