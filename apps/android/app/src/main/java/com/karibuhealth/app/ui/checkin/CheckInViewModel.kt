package com.karibuhealth.app.ui.checkin

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.karibuhealth.app.data.local.datastore.AuthTokenStore
import com.karibuhealth.app.data.local.db.KaribuDatabase
import com.karibuhealth.app.data.local.db.dao.SyncQueueDao
import com.karibuhealth.app.data.local.db.entity.SyncQueueEntry
import com.karibuhealth.app.data.repository.PatientRepository
import com.karibuhealth.app.data.repository.VisitRepository
import com.karibuhealth.app.domain.model.Patient
import com.karibuhealth.app.domain.model.VisitPriority
import com.karibuhealth.app.util.formatPhoneNumber
import com.karibuhealth.app.util.isValidUgandaPhone
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import java.util.UUID
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
    private val syncQueueDao: SyncQueueDao,
    private val database: KaribuDatabase,
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
                val state = _uiState.value

                // Find or create patient
                val patient = state.foundPatient ?: run {
                    val phone = formatPhoneNumber(state.phoneNumber)
                    patientRepository.createPatient(
                        clinicId = clinicId,
                        whatsappNumber = phone,
                        displayName = null,
                    )
                }

                // Create a visit in waiting queue status
                val visit = visitRepository.createVisit(
                    clinicId = clinicId,
                    patientId = patient.id,
                    doctorId = null,
                    chiefComplaint = state.chiefComplaint.takeIf { it.isNotBlank() },
                )

                // Queue the check_in RPC as a sync operation
                val syncEntry = SyncQueueEntry(
                    id = UUID.randomUUID().toString(),
                    operationType = "queue_op",
                    entityType = "visits",
                    entityId = visit.id,
                    payload = """{"rpc":"check_in_patient","params":{"p_patient_id":"${patient.id}","p_clinic_id":"$clinicId","p_chief_complaint":"${state.chiefComplaint}","p_priority":"${state.priority.name}"}}""",
                    status = "pending",
                    attempts = 0,
                    createdAt = System.currentTimeMillis(),
                )
                syncQueueDao.insert(syncEntry)

                _uiState.update { it.copy(checkedInVisitId = visit.id, isCheckingIn = false) }
            } catch (e: Exception) {
                _uiState.update { it.copy(error = e.message, isCheckingIn = false) }
            }
        }
    }
}
