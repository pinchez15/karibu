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
import java.time.LocalDate
import javax.inject.Inject

enum class PatientSex { M, F }

data class FieldErrors(
    val firstName: String? = null,
    val lastName: String? = null,
    val sex: String? = null,
    val dateOfBirth: String? = null,
    val phone: String? = null,
)

data class NewVisitUiState(
    val searchQuery: String = "",
    val firstName: String = "",
    val lastName: String = "",
    val sex: PatientSex? = null,
    val dateOfBirth: String? = null, // Display format dd-MM-yyyy
    val searchResults: List<Patient> = emptyList(),
    val foundPatient: Patient? = null,
    val duplicateCandidate: Patient? = null,
    val isSearching: Boolean = false,
    val isCreating: Boolean = false,
    val error: String? = null,
    val fieldErrors: FieldErrors = FieldErrors(),
) {
    val phoneValid: Boolean get() = searchQuery.isBlank() || isValidUgandaPhone(searchQuery)
}

@HiltViewModel
class NewVisitViewModel @Inject constructor(
    private val patientRepository: PatientRepository,
    private val visitRepository: VisitRepository,
    private val authTokenStore: AuthTokenStore,
) : ViewModel() {

    private val _uiState = MutableStateFlow(NewVisitUiState())
    val uiState: StateFlow<NewVisitUiState> = _uiState.asStateFlow()

    fun updateSearch(query: String) {
        _uiState.update { it.copy(searchQuery = query, fieldErrors = it.fieldErrors.copy(phone = null)) }

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
        _uiState.update { it.copy(firstName = name, duplicateCandidate = null, fieldErrors = it.fieldErrors.copy(firstName = null)) }
    }

    fun updateLastName(name: String) {
        _uiState.update { it.copy(lastName = name, duplicateCandidate = null, fieldErrors = it.fieldErrors.copy(lastName = null)) }
    }

    fun updateSex(sex: PatientSex) {
        _uiState.update { it.copy(sex = sex, duplicateCandidate = null, fieldErrors = it.fieldErrors.copy(sex = null)) }
    }

    fun updateDateOfBirth(input: String) {
        _uiState.update {
            it.copy(
                dateOfBirth = input,
                duplicateCandidate = null,
                fieldErrors = it.fieldErrors.copy(dateOfBirth = null),
            )
        }
    }

    fun formatDateOfBirthInput(input: String): String {
        val digits = input.filter(Char::isDigit).take(8)
        return buildString {
            digits.forEachIndexed { index, char ->
                append(char)
                if ((index == 1 || index == 3) && index != digits.lastIndex) {
                    append('-')
                }
            }
        }
    }

    fun setDateOfBirthFromPicker(isoDate: String) {
        val display = isoToDisplayDate(isoDate) ?: return
        _uiState.update {
            it.copy(
                dateOfBirth = display,
                duplicateCandidate = null,
                fieldErrors = it.fieldErrors.copy(dateOfBirth = null),
            )
        }
    }

    fun selectPatient(patient: Patient) {
        _uiState.update { it.copy(foundPatient = patient, duplicateCandidate = null) }
    }

    suspend fun startVisitForDuplicateCandidate(): String? {
        val patient = _uiState.value.duplicateCandidate ?: return null
        _uiState.update { it.copy(foundPatient = patient, duplicateCandidate = null) }
        return startVisitForSelectedPatient()
    }

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
            _uiState.update { it.copy(error = e.message ?: "Failed to start visit", isCreating = false) }
            null
        }
    }

    suspend fun createPatientAndStartVisit(confirmDuplicate: Boolean = false): String? {
        val state = _uiState.value
        if (state.foundPatient != null) return startVisitForSelectedPatient()

        // Validate the new-patient form. Sex and DOB are required for HMIS 105
        // age × sex banding; without them visits silently drop out of the
        // monthly report. Phone is optional — many patients in this catchment
        // don't carry one.
        val errors = FieldErrors(
            firstName = if (state.firstName.isBlank()) "Required" else null,
            lastName = if (state.lastName.isBlank()) "Required" else null,
            sex = if (state.sex == null) "Required" else null,
            dateOfBirth = validateDateOfBirth(state.dateOfBirth),
            phone = if (state.searchQuery.isNotBlank() && !state.phoneValid) {
                "Enter a valid Uganda phone number or leave blank"
            } else null,
        )
        if (errors.firstName != null || errors.lastName != null || errors.sex != null ||
            errors.dateOfBirth != null || errors.phone != null
        ) {
            _uiState.update { it.copy(fieldErrors = errors, error = null) }
            return null
        }

        val clinicId = authTokenStore.getClinicId()
            ?: run {
                _uiState.update { it.copy(error = "No active clinic — please sign in again") }
                return null
            }
        val dateOfBirthIso = displayToIsoDate(state.dateOfBirth!!) ?: run {
            _uiState.update {
                it.copy(
                    fieldErrors = it.fieldErrors.copy(dateOfBirth = "Enter a valid date"),
                    error = null,
                )
            }
            return null
        }
        val phone = if (state.searchQuery.isNotBlank()) formatPhoneNumber(state.searchQuery) else null

        _uiState.update { it.copy(isCreating = true, error = null) }
        return try {
            val duplicateCandidate = patientRepository.findLikelyDuplicate(
                clinicId = clinicId,
                firstName = state.firstName.trim(),
                lastName = state.lastName.trim(),
                dateOfBirth = dateOfBirthIso,
            )
            if (duplicateCandidate != null && !confirmDuplicate) {
                _uiState.update { it.copy(duplicateCandidate = duplicateCandidate, isCreating = false) }
                return null
            }

            val patient = patientRepository.createPatient(
                clinicId = clinicId,
                firstName = state.firstName.trim(),
                lastName = state.lastName.trim(),
                whatsappNumber = phone,
                dateOfBirth = dateOfBirthIso,
                sex = state.sex?.name,
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
            _uiState.update { it.copy(error = e.message ?: "Failed to create patient", isCreating = false) }
            null
        }
    }

    private fun validateDateOfBirth(dateOfBirth: String?): String? {
        if (dateOfBirth.isNullOrBlank()) return "Required"

        val dob = displayToIsoDate(dateOfBirth)?.let { runCatching { LocalDate.parse(it) }.getOrNull() }
            ?: return "Enter a valid date"
        val today = LocalDate.now()
        if (dob.isAfter(today)) return "Date of birth cannot be in the future"
        if (dob.isBefore(today.minusYears(120))) return "Date of birth looks too far in the past"
        return null
    }

    private fun displayToIsoDate(dateOfBirth: String): String? {
        val parts = dateOfBirth.split('-')
        if (parts.size != 3 || parts.any { it.isBlank() }) return null
        val (day, month, year) = parts
        if (day.length != 2 || month.length != 2 || year.length != 4) return null

        return runCatching {
            LocalDate.of(year.toInt(), month.toInt(), day.toInt()).toString()
        }.getOrNull()
    }

    private fun isoToDisplayDate(isoDate: String): String? {
        return runCatching {
            val date = LocalDate.parse(isoDate)
            "%02d-%02d-%04d".format(date.dayOfMonth, date.monthValue, date.year)
        }.getOrNull()
    }
}
