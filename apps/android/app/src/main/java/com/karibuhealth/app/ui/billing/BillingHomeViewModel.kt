package com.karibuhealth.app.ui.billing

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.karibuhealth.app.data.local.datastore.AuthTokenStore
import com.karibuhealth.app.data.repository.BillingRepository
import com.karibuhealth.app.data.repository.StaffRepository
import com.karibuhealth.app.domain.model.BillingPaymentItem
import com.karibuhealth.app.domain.model.ChargeItem
import com.karibuhealth.app.domain.model.PatientBalanceItem
import com.karibuhealth.app.domain.model.PatientBillingBalance
import com.karibuhealth.app.domain.model.StaffRole
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
    val patients: List<PatientBalanceItem> = emptyList(),
    val error: String? = null,
)

@HiltViewModel
class BillingHomeViewModel @Inject constructor(
    private val billingRepository: BillingRepository,
    private val authTokenStore: AuthTokenStore,
) : ViewModel() {

    private val _uiState = MutableStateFlow(BillingHomeUiState())
    val uiState: StateFlow<BillingHomeUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            fetch()
            _uiState.update { it.copy(isLoading = false) }
        }
    }

    fun refresh() {
        viewModelScope.launch {
            _uiState.update { it.copy(isRefreshing = true, error = null) }
            fetch()
            _uiState.update { it.copy(isRefreshing = false) }
        }
    }

    private suspend fun fetch() {
        val clinicId = authTokenStore.getClinicId() ?: return
        runCatching {
            billingRepository.getPatientBalances(clinicId)
        }.onSuccess { patients ->
            _uiState.update { it.copy(patients = patients.sortedByDescending { p -> p.balance }) }
        }.onFailure { e ->
            _uiState.update { it.copy(error = e.message ?: "Could not load billing") }
        }
    }
}
