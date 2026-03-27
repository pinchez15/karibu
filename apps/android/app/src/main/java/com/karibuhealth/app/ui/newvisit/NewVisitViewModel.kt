package com.karibuhealth.app.ui.newvisit

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.karibuhealth.app.data.local.datastore.AuthTokenStore
import com.karibuhealth.app.data.repository.PatientRepository
import com.karibuhealth.app.domain.model.Patient
import com.karibuhealth.app.util.formatPhoneNumber
import com.karibuhealth.app.util.isValidUgandaPhone
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

data class NewVisitUiState(
    val searchQuery: String = "",
    val displayName: String = "",
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

    fun updateDisplayName(name: String) {
        _uiState.update { it.copy(displayName = name) }
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

    suspend fun createOrGetPatient(): String? {
        val state = _uiState.value

        // If already found, return their ID
        if (state.foundPatient != null) return state.foundPatient.id

        val clinicId = authTokenStore.getClinicId() ?: return null
        val phone = if (state.phoneValid) formatPhoneNumber(state.searchQuery) else null
        val name = state.displayName.takeIf { it.isNotBlank() }

        if (phone == null && name == null) {
            _uiState.update { it.copy(error = "Please enter a phone number or name") }
            return null
        }

        _uiState.update { it.copy(isCreating = true) }
        return try {
            val patient = patientRepository.createPatient(
                clinicId = clinicId,
                whatsappNumber = phone,
                displayName = name,
            )
            _uiState.update { it.copy(foundPatient = patient, isCreating = false) }
            patient.id
        } catch (e: Exception) {
            _uiState.update { it.copy(error = e.message, isCreating = false) }
            null
        }
    }
}
