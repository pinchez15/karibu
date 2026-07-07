package com.karibuhealth.app.ui.checkin

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.karibuhealth.app.data.local.datastore.AuthTokenStore
import com.karibuhealth.app.data.repository.PatientRepository
import com.karibuhealth.app.data.repository.VisitRepository
import com.karibuhealth.app.domain.model.Patient
import com.karibuhealth.app.domain.model.VisitPriority
import com.karibuhealth.app.util.formatPhoneNumber
import com.karibuhealth.app.util.isValidUgandaPhone
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

data class CheckInUiState(
    val phoneNumber: String = "",
    val chiefComplaint: String = "",
    val priority: VisitPriority = VisitPriority.normal,
    val foundPatient: Patient? = null,
    val isSearching: Boolean = false,
    val isCheckingIn: Boolean = false,
    val checkedInVisitId: String? = null,
    val error: String? = null,
    val phoneValid: Boolean = false,
)

@HiltViewModel
class CheckInViewModel @Inject constructor(
    private val patientRepository: PatientRepository,
    private val visitRepository: VisitRepository,
    private val authTokenStore: AuthTokenStore,
) : ViewModel() {

    private val _uiState = MutableStateFlow(CheckInUiState())
    val uiState: StateFlow<CheckInUiState> = _uiState.asStateFlow()

    fun updatePhone(phone: String) {
        _uiState.update { it.copy(phoneNumber = phone, phoneValid = isValidUgandaPhone(phone)) }
    }

    fun updateChiefComplaint(complaint: String) {
        _uiState.update { it.copy(chiefComplaint = complaint) }
    }

    fun updatePriority(priority: VisitPriority) {
        _uiState.update { it.copy(priority = priority) }
    }

    fun lookupPatient() {
        val phone = formatPhoneNumber(_uiState.value.phoneNumber)
        viewModelScope.launch {
            val clinicId = authTokenStore.getClinicId() ?: return@launch
            _uiState.update { it.copy(isSearching = true) }
            val patient = patientRepository.lookupByPhone(clinicId, phone)
            _uiState.update { it.copy(foundPatient = patient, isSearching = false) }
        }
    }

    fun checkIn() {
        viewModelScope.launch {
            _uiState.update { it.copy(isCheckingIn = true, error = null) }
            try {
                val clinicId = authTokenStore.getClinicId() ?: throw Exception("No clinic ID")
                val staffId = authTokenStore.getStaffId() ?: throw Exception("No staff ID")
                val state = _uiState.value

                val (patient, _) = if (state.foundPatient != null) {
                    state.foundPatient to null
                } else {
                    val phone = formatPhoneNumber(state.phoneNumber)
                    patientRepository.createPatient(
                        clinicId = clinicId,
                        firstName = "",
                        lastName = "",
                        whatsappNumber = phone,
                    )
                }

                // WP2: single check-in spine via VisitRepository.checkInPatient.
                // Removed the duplicate queue_op check_in_patient that previously
                // ran on top of createVisit (which already created a visit row).
                val (visit, _) = visitRepository.checkInPatient(
                    clinicId = clinicId,
                    patientId = patient.id,
                    chiefComplaint = state.chiefComplaint.takeIf { it.isNotBlank() },
                    priority = state.priority,
                    staffId = staffId,
                )

                visitRepository.refreshOpdPatientsToday(clinicId)

                _uiState.update {
                    it.copy(checkedInVisitId = visit.id, isCheckingIn = false)
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(error = e.message, isCheckingIn = false) }
            }
        }
    }
}
