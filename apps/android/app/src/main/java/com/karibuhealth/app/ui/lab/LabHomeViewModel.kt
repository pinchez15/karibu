package com.karibuhealth.app.ui.lab

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.karibuhealth.app.data.local.datastore.AuthTokenStore
import com.karibuhealth.app.data.repository.StaffRepository
import com.karibuhealth.app.data.remote.api.DictationApiClient
import com.karibuhealth.app.data.repository.VisitRepository
import com.karibuhealth.app.util.NetworkMonitor
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
    val searchQuery: String = "",
    val isLoading: Boolean = true,
    val error: String? = null,
    val actionKey: String? = null,
) {
    val filteredItems: List<NeedsLabItem>
        get() {
            val q = searchQuery.trim()
            if (q.isBlank()) return items
            return items.filter { item ->
                item.patientName.contains(q, ignoreCase = true) ||
                    (q.all { it.isDigit() } && item.queuePosition?.toString()?.contains(q) == true)
            }
        }
}

@HiltViewModel
class LabHomeViewModel @Inject constructor(
    private val authTokenStore: AuthTokenStore,
    private val staffRepository: StaffRepository,
    private val worklistRepository: WorklistRepository,
    private val visitRepository: VisitRepository,
    private val dictationApiClient: DictationApiClient,
    private val networkMonitor: NetworkMonitor,
) : ViewModel() {

    private val _uiState = MutableStateFlow(LabHomeUiState())
    val uiState: StateFlow<LabHomeUiState> = _uiState.asStateFlow()

    /** WP2 type-ahead by name or today's number. */
    val filteredItems: List<NeedsLabItem>
        get() {
            val q = _uiState.value.searchQuery.trim().lowercase().removePrefix("#")
            if (q.isEmpty()) return _uiState.value.items
            return _uiState.value.items.filter { item ->
                item.patientName.lowercase().contains(q) ||
                    item.queuePosition?.toString()?.contains(q) == true
            }
        }

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
            _uiState.update { it.copy(isLoading = true) }
            val items = worklistRepository.getNeedsLab(staff.clinicId)
            _uiState.update { it.copy(items = items, isLoading = false) }
        }
    }

    fun updateSearch(query: String) {
        _uiState.update { it.copy(searchQuery = query) }
    }

    fun dismissError() {
        _uiState.update { it.copy(error = null) }
    }

    fun updateSearch(query: String) {
        _uiState.update { it.copy(searchQuery = query) }
    }

    fun startLabTest(visitId: String, testName: String) {
        viewModelScope.launch {
            val key = "$visitId:$testName"
            _uiState.update { it.copy(actionKey = key, error = null) }
            runCatching { visitRepository.startLabTest(visitId, testName) }
                .onFailure { e -> _uiState.update { it.copy(error = e.message) } }
            refresh()
            _uiState.update { it.copy(actionKey = null) }
        }
    }

    fun recordLabTestResult(visitId: String, testName: String, result: String, abnormal: Boolean) {
        val staffId = _uiState.value.staff?.id ?: return
        viewModelScope.launch {
            val key = "$visitId:$testName"
            _uiState.update { it.copy(actionKey = key, error = null) }
            runCatching {
                visitRepository.recordLabTestResult(visitId, testName, result, abnormal, staffId)
            }.onSuccess {
                if (networkMonitor.isOnline() && networkMonitor.currentStatus().isGoodForAi) {
                    runCatching { dictationApiClient.requestLabAiAssist(visitId) }
                }
            }.onFailure { e ->
                _uiState.update { it.copy(error = e.message) }
            }
            refresh()
            _uiState.update { it.copy(actionKey = null) }
        }
    }
}
