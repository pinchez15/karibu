package com.karibuhealth.app.ui.billing

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.karibuhealth.app.data.local.datastore.AuthTokenStore
import com.karibuhealth.app.data.repository.WorklistRepository
import com.karibuhealth.app.domain.model.NeedsPaymentItem
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class BillingHomeUiState(
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val items: List<NeedsPaymentItem> = emptyList(),
)

@HiltViewModel
class BillingHomeViewModel @Inject constructor(
    private val worklistRepository: WorklistRepository,
    private val authTokenStore: AuthTokenStore,
) : ViewModel() {

    private val _uiState = MutableStateFlow(BillingHomeUiState())
    val uiState: StateFlow<BillingHomeUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }
            fetch()
            _uiState.update { it.copy(isLoading = false) }
        }
    }

    fun refresh() {
        viewModelScope.launch {
            _uiState.update { it.copy(isRefreshing = true) }
            fetch()
            _uiState.update { it.copy(isRefreshing = false) }
        }
    }

    private suspend fun fetch() {
        val clinicId = authTokenStore.getClinicId() ?: return
        val items = worklistRepository.getNeedsPayment(clinicId)
        _uiState.update { it.copy(items = items) }
    }
}
