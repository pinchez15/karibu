package com.karibuhealth.app.ui.newvisit

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.karibuhealth.app.data.local.datastore.AuthTokenStore
import com.karibuhealth.app.data.repository.PatientRepository
import com.karibuhealth.app.data.repository.VisitRepository
import com.karibuhealth.app.domain.model.Patient
import com.karibuhealth.app.util.formatPhoneNumber
import com.karibuhealth.app.util.isValidUgandaPhone
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

data class NewVisitUiState(
    val searchQuery: String = "",
    val firstName: String = "",
    val lastName: String = "",
    val searchResults: List<Patient> = emptyList(),
    val foundPatient: Patient? = null,
    val isSearching: Boolean = false,
    val isCreating: Boolean = false,
    val error: String? = null,
    val phoneValid: Boolean = false,
)

@HiltViewModel
class NewVisitViewModel @Inject constructor(
    private val patientRepository: PatientRepository,
    private val visitRepository: VisitRepository,
    private val authTokenStore: AuthTokenStore,
) : ViewModel() {

    private val _uiState = MutableStateFlow(NewVisitUiState())
    val uiState: StateFlow<NewVisitUiState> = _uiState.asStateFlow()

    fun updateSearch(query: String) {
        _uiState.update { it.copy(searchQuery = query, phoneValid = isValidUgandaPhone(query)) }

        if (query.length >= 3) {
            viewModelScope.launch {
                val clinicId = authTokenStore.getClinicId() ?: return@launch
                _uiState.update { it.copy(isSearching = true) }
                patientRepository.searchPatients(clinicId, query).first().let { results ->
                    _uiState.update { it.copy(searchResults = results, isSearching = false) }
                }
            }
        } else {
            _uiState.update { it.copy(searchResults = emptyList()) }
        }
    }

    fun updateFirstName(name: String) {
        _uiState.update { it.copy(firstName = name) }
    }

    fun updateLastName(name: String) {
        _uiState.update { it.copy(lastName = name) }
    }

    fun selectPatient(patient: Patient) {
        _uiState.update { it.copy(foundPatient = patient) }
    }

    fun lookupByPhone() {
        val phone = formatPhoneNumber(_uiState.value.searchQuery)
        viewModelScope.launch {
            val clinicId = authTokenStore.getClinicId() ?: return@launch
            _uiState.update { it.copy(isSearching = true) }

            val existing = patientRepository.lookupByPhone(clinicId, phone)
            if (existing != null) {
                _uiState.update { it.copy(foundPatient = existing, isSearching = false) }
            } else {
                _uiState.update { it.copy(foundPatient = null, isSearching = false) }
            }
        }
    }

    // Look-up + select path: patient already exists, just start a visit for them.
    suspend fun startVisitForSelectedPatient(): String? {
        val patient = _uiState.value.foundPatient ?: return null
        val clinicId = authTokenStore.getClinicId() ?: return null
        return runCatching {
            _uiState.update { it.copy(isCreating = true) }
            val staffId = authTokenStore.getStaffId()
            val visit = visitRepository.createVisit(
                clinicId = clinicId,
                patientId = patient.id,
                doctorId = staffId,
            )
            _uiState.update { it.copy(isCreating = false) }
            visit.id
        }.getOrElse { e ->
            _uiState.update { it.copy(error = e.message, isCreating = false) }
            null
        }
    }

    // Create-new + start path: register the patient (offline-first) and
    // immediately open a visit for them. Both writes are queued for sync.
    suspend fun createPatientAndStartVisit(): String? {
        val state = _uiState.value
        if (state.foundPatient != null) return startVisitForSelectedPatient()

        val clinicId = authTokenStore.getClinicId() ?: return null
        val phone = if (state.phoneValid) formatPhoneNumber(state.searchQuery) else null
        val hasName = state.firstName.isNotBlank() || state.lastName.isNotBlank()

        if (phone == null && !hasName) {
            _uiState.update { it.copy(error = "Please enter a phone number or name") }
            return null
        }

        _uiState.update { it.copy(isCreating = true) }
        return try {
            val patient = patientRepository.createPatient(
                clinicId = clinicId,
                firstName = state.firstName,
                lastName = state.lastName,
                whatsappNumber = phone,
            )
            val staffId = authTokenStore.getStaffId()
            val visit = visitRepository.createVisit(
                clinicId = clinicId,
                patientId = patient.id,
                doctorId = staffId,
            )
            _uiState.update { it.copy(foundPatient = patient, isCreating = false) }
            visit.id
        } catch (e: Exception) {
            _uiState.update { it.copy(error = e.message, isCreating = false) }
            null
        }
    }
}
