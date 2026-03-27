package com.karibuhealth.app.ui.payment

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.karibuhealth.app.data.local.datastore.AuthTokenStore
import com.karibuhealth.app.data.repository.PaymentRepository
import com.karibuhealth.app.data.repository.VisitRepository
import com.karibuhealth.app.domain.model.PaymentMethod
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

data class PaymentUiState(
    val amount: String = "",
    val paymentMethod: PaymentMethod = PaymentMethod.cash,
    val serviceType: String = "Consultation",
    val notes: String = "",
    val isRecording: Boolean = false,
    val isComplete: Boolean = false,
    val error: String? = null,
)

@HiltViewModel
class PaymentViewModel @Inject constructor(
    private val paymentRepository: PaymentRepository,
    private val visitRepository: VisitRepository,
    private val authTokenStore: AuthTokenStore,
) : ViewModel() {

    private val _uiState = MutableStateFlow(PaymentUiState())
    val uiState: StateFlow<PaymentUiState> = _uiState.asStateFlow()

    fun updateAmount(v: String) = _uiState.update { it.copy(amount = v.filter { c -> c.isDigit() }) }
    fun updatePaymentMethod(v: PaymentMethod) = _uiState.update { it.copy(paymentMethod = v) }
    fun updateServiceType(v: String) = _uiState.update { it.copy(serviceType = v) }
    fun updateNotes(v: String) = _uiState.update { it.copy(notes = v) }

    fun recordPayment(visitId: String) {
        val state = _uiState.value
        val amountUgx = state.amount.toIntOrNull()
        if (amountUgx == null || amountUgx <= 0) {
            _uiState.update { it.copy(error = "Please enter a valid amount") }
            return
        }

        viewModelScope.launch {
            _uiState.update { it.copy(isRecording = true) }
            try {
                val clinicId = authTokenStore.getClinicId() ?: throw Exception("No clinic ID")
                val staffId = authTokenStore.getStaffId() ?: throw Exception("No staff ID")
                val visit = visitRepository.getVisitByIdOnce(visitId)
                    ?: throw Exception("Visit not found")

                paymentRepository.recordPayment(
                    visitId = visitId,
                    clinicId = clinicId,
                    patientId = visit.patientId,
                    amountUgx = amountUgx,
                    paymentMethod = state.paymentMethod,
                    collectedBy = staffId,
                    serviceType = state.serviceType.takeIf { it.isNotBlank() },
                    notes = state.notes.takeIf { it.isNotBlank() },
                )

                _uiState.update { it.copy(isComplete = true, isRecording = false) }
            } catch (e: Exception) {
                _uiState.update { it.copy(error = e.message, isRecording = false) }
            }
        }
    }

    fun skipPayment() {
        _uiState.update { it.copy(isComplete = true) }
    }
}
