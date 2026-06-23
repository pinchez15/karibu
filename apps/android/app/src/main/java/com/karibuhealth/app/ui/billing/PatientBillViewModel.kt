package com.karibuhealth.app.ui.billing

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.karibuhealth.app.data.local.datastore.AuthTokenStore
import com.karibuhealth.app.data.repository.BillingRepository
import com.karibuhealth.app.domain.model.BillingPaymentItem
import com.karibuhealth.app.domain.model.ChargeItem
import com.karibuhealth.app.domain.model.PatientBillingBalance
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class PatientBillUiState(
    val isLoading: Boolean = true,
    val patientName: String = "Patient",
    val balance: PatientBillingBalance = PatientBillingBalance(0, 0, 0),
    val charges: List<ChargeItem> = emptyList(),
    val payments: List<BillingPaymentItem> = emptyList(),
    val payMethod: String = "cash",
    val payCash: String = "",
    val payBarter: String = "",
    val payBarterDesc: String = "",
    val isSaving: Boolean = false,
    val error: String? = null,
    val successMessage: String? = null,
)

@HiltViewModel
class PatientBillViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val billingRepository: BillingRepository,
    private val authTokenStore: AuthTokenStore,
) : ViewModel() {

    private val patientId: String = checkNotNull(savedStateHandle.get<String>("patientId"))

    private val _uiState = MutableStateFlow(PatientBillUiState())
    val uiState: StateFlow<PatientBillUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            val clinicId = authTokenStore.getClinicId()
            if (clinicId == null) {
                _uiState.update { it.copy(isLoading = false, error = "Not signed in") }
                return@launch
            }
            runCatching {
                val name = billingRepository.getPatientName(patientId) ?: "Patient"
                val balance = billingRepository.getPatientBalance(clinicId, patientId)
                val charges = billingRepository.getCharges(clinicId, patientId)
                val payments = billingRepository.getPayments(clinicId, patientId)
                Triple(name, balance, charges to payments)
            }.onSuccess { (name, balance, data) ->
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        patientName = name,
                        balance = balance,
                        charges = data.first,
                        payments = data.second,
                    )
                }
            }.onFailure { e ->
                _uiState.update {
                    it.copy(isLoading = false, error = e.message ?: "Could not load bill")
                }
            }
        }
    }

    fun updatePayMethod(method: String) {
        _uiState.update { it.copy(payMethod = method, successMessage = null, error = null) }
    }

    fun updatePayCash(value: String) {
        _uiState.update { it.copy(payCash = value, successMessage = null, error = null) }
    }

    fun updatePayBarter(value: String) {
        _uiState.update { it.copy(payBarter = value, successMessage = null, error = null) }
    }

    fun updatePayBarterDesc(value: String) {
        _uiState.update { it.copy(payBarterDesc = value, successMessage = null, error = null) }
    }

    fun voidCharge(chargeId: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(isSaving = true, error = null) }
            runCatching { billingRepository.voidCharge(chargeId) }
                .onSuccess { load() }
                .onFailure { e ->
                    _uiState.update { it.copy(error = e.message ?: "Could not remove charge") }
                }
            _uiState.update { it.copy(isSaving = false) }
        }
    }

    fun recordPayment() {
        val state = _uiState.value
        val cash = when (state.payMethod) {
            "barter" -> 0
            else -> state.payCash.toIntOrNull() ?: 0
        }
        val barter = when (state.payMethod) {
            "cash", "mtn_momo", "airtel_money" -> 0
            else -> state.payBarter.toIntOrNull() ?: 0
        }
        if (cash + barter <= 0) {
            _uiState.update { it.copy(error = "Enter a payment amount") }
            return
        }
        viewModelScope.launch {
            val clinicId = authTokenStore.getClinicId() ?: return@launch
            _uiState.update { it.copy(isSaving = true, error = null, successMessage = null) }
            runCatching {
                billingRepository.recordBillingPayment(
                    clinicId = clinicId,
                    patientId = patientId,
                    amountCashUgx = cash,
                    amountBarterUgx = barter,
                    paymentMethod = state.payMethod,
                    barterDescription = state.payBarterDesc.takeIf { it.isNotBlank() },
                )
            }.onSuccess { receipt ->
                _uiState.update {
                    it.copy(
                        payCash = "",
                        payBarter = "",
                        payBarterDesc = "",
                        successMessage = receipt?.let { r -> "Payment recorded (#$r)" }
                            ?: "Payment recorded",
                    )
                }
                load()
            }.onFailure { e ->
                _uiState.update { it.copy(error = e.message ?: "Payment failed") }
            }
            _uiState.update { it.copy(isSaving = false) }
        }
    }
}
