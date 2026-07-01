package com.karibuhealth.app.ui.newvisit

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.karibuhealth.app.data.local.datastore.AuthTokenStore
import com.karibuhealth.app.data.local.db.dao.ClinicDao
import com.karibuhealth.app.data.repository.PatientRepository
import com.karibuhealth.app.data.repository.VisitRepository
import com.karibuhealth.app.domain.model.DuplicateCandidate
import com.karibuhealth.app.domain.model.Patient
import com.karibuhealth.app.util.formatPhoneNumber
import com.karibuhealth.app.util.isValidUgandaPhone
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.LocalDate
import javax.inject.Inject

enum class PatientSex { M, F }

// Server-side dob_precision discriminator values (migration 038). Kept as
// strings — the migration uses a CHECK constraint rather than an enum so we
// stay close to the wire format.
object GuardianRelationship {
    const val MOTHER = "mother"
    const val FATHER = "father"
    const val HUSBAND = "husband"
    const val WIFE = "wife"
    const val RELATIVE = "relative"
    const val NEIGHBOR = "neighbor"

    val OPTIONS = listOf(MOTHER, FATHER, HUSBAND, WIFE, RELATIVE, NEIGHBOR)

    fun label(value: String): String = when (value) {
        MOTHER -> "Mother"
        FATHER -> "Father"
        HUSBAND -> "Husband"
        WIFE -> "Wife"
        RELATIVE -> "Relative"
        NEIGHBOR -> "Neighbor"
        else -> value
    }
}

object DobPrecision {
    const val EXACT = "exact"
    const val YEAR_ONLY = "year_only"
    const val AGE_ESTIMATE = "age_estimate"
    const val UNKNOWN = "unknown"
}

data class FieldErrors(
    val firstName: String? = null,
    val lastName: String? = null,
    val sex: String? = null,
    val dateOfBirth: String? = null,
    val birthYear: String? = null,
    val approximateAge: String? = null,
    val phone: String? = null,
)

data class NewVisitUiState(
    val searchQuery: String = "",
    val firstName: String = "",
    val lastName: String = "",
    val sex: PatientSex? = null,
    // DOB precision drives which age field is required + which column is
    // populated on the server. Default 'exact' preserves the pre-038 form
    // behaviour for clinics that still capture exact DOBs.
    val dobPrecision: String = DobPrecision.EXACT,
    val dateOfBirth: String? = null, // Display format dd-MM-yyyy
    val birthYear: String = "", // 4-digit year as typed, e.g. "1992"
    val approximateAge: String = "", // years as typed, e.g. "45"
    // Location + secondary identifiers (migration 038). Village + parish are
    // the primary disambiguators for rural HC III catchments when DOB and
    // phone are unknown; subcounty/district/guardian/national_id are exposed
    // behind the "More" disclosure in the UI.
    val village: String = "",
    val parish: String = "",
    val subcounty: String = "",
    val district: String = "",
    val guardianName: String = "",
    val guardianRelationship: String = "",
    val nationalId: String = "",
    val chiefComplaint: String = "",
    val searchResults: List<Patient> = emptyList(),
    val foundPatient: Patient? = null,
    val duplicateCandidates: List<DuplicateCandidate> = emptyList(),
    val isSearching: Boolean = false,
    val isCreating: Boolean = false,
    val error: String? = null,
    val fieldErrors: FieldErrors = FieldErrors(),
) {
    val phoneValid: Boolean get() = searchQuery.isBlank() || isValidUgandaPhone(searchQuery)
}

data class VisitStartResult(
    val visitId: String,
    val patientId: String,
)

@HiltViewModel
class NewVisitViewModel @Inject constructor(
    private val patientRepository: PatientRepository,
    private val visitRepository: VisitRepository,
    private val authTokenStore: AuthTokenStore,
    private val clinicDao: ClinicDao,
) : ViewModel() {

    private val _uiState = MutableStateFlow(NewVisitUiState())
    val uiState: StateFlow<NewVisitUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            val clinicId = authTokenStore.getClinicId() ?: return@launch
            val clinic = clinicDao.getByIdOnce(clinicId)
            val defaultDistrict = clinic?.district?.trim().orEmpty()
            if (defaultDistrict.isNotEmpty()) {
                _uiState.update { it.copy(district = defaultDistrict) }
            }
        }
    }

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
        _uiState.update {
            it.copy(
                firstName = name,
                duplicateCandidates = emptyList(),
                fieldErrors = it.fieldErrors.copy(firstName = null),
            )
        }
    }

    fun updateLastName(name: String) {
        _uiState.update {
            it.copy(
                lastName = name,
                duplicateCandidates = emptyList(),
                fieldErrors = it.fieldErrors.copy(lastName = null),
            )
        }
    }

    fun updateSex(sex: PatientSex) {
        _uiState.update {
            it.copy(
                sex = sex,
                duplicateCandidates = emptyList(),
                fieldErrors = it.fieldErrors.copy(sex = null),
            )
        }
    }

    fun updateDobPrecision(precision: String) {
        _uiState.update {
            it.copy(
                dobPrecision = precision,
                duplicateCandidates = emptyList(),
                // Clear stale errors when the user changes which field applies.
                fieldErrors = it.fieldErrors.copy(
                    dateOfBirth = null,
                    birthYear = null,
                    approximateAge = null,
                ),
            )
        }
    }

    fun updateDateOfBirth(input: String) {
        _uiState.update {
            it.copy(
                dateOfBirth = input,
                duplicateCandidates = emptyList(),
                fieldErrors = it.fieldErrors.copy(dateOfBirth = null),
            )
        }
    }

    fun updateBirthYear(input: String) {
        val digits = input.filter(Char::isDigit).take(4)
        _uiState.update {
            it.copy(
                birthYear = digits,
                duplicateCandidates = emptyList(),
                fieldErrors = it.fieldErrors.copy(birthYear = null),
            )
        }
    }

    fun updateApproximateAge(input: String) {
        val digits = input.filter(Char::isDigit).take(3)
        _uiState.update {
            it.copy(
                approximateAge = digits,
                duplicateCandidates = emptyList(),
                fieldErrors = it.fieldErrors.copy(approximateAge = null),
            )
        }
    }

    fun updateVillage(input: String) {
        _uiState.update { it.copy(village = input, duplicateCandidates = emptyList()) }
    }

    fun updateParish(input: String) {
        _uiState.update { it.copy(parish = input, duplicateCandidates = emptyList()) }
    }

    fun updateSubcounty(input: String) {
        _uiState.update { it.copy(subcounty = input) }
    }

    fun updateDistrict(input: String) {
        _uiState.update { it.copy(district = input) }
    }

    fun updateGuardianName(input: String) {
        _uiState.update { it.copy(guardianName = input) }
    }

    fun updateGuardianRelationship(input: String) {
        _uiState.update { it.copy(guardianRelationship = input) }
    }

    fun updateNationalId(input: String) {
        _uiState.update { it.copy(nationalId = input) }
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
                duplicateCandidates = emptyList(),
                fieldErrors = it.fieldErrors.copy(dateOfBirth = null),
            )
        }
    }

    fun selectPatient(patient: Patient) {
        _uiState.update { it.copy(foundPatient = patient, duplicateCandidates = emptyList()) }
    }

    fun updateChiefComplaint(text: String) {
        _uiState.update { it.copy(chiefComplaint = text) }
    }

    /**
     * Start a visit for a candidate the clinician picked from the duplicate
     * list. Looks the full patient row up locally first; on cache miss we
     * fall back to fetching just the id from the patients endpoint via the
     * repository. Replaces the pre-038 startVisitForDuplicateCandidate(),
     * which assumed a single candidate stored in state.
     */
    suspend fun startVisitForCandidate(candidateId: String): VisitStartResult? {
        val patient = patientRepository.getPatientByIdOnce(candidateId)
        if (patient == null) {
            _uiState.update {
                it.copy(error = "Couldn't load that patient — try syncing and search by name.")
            }
            return null
        }
        _uiState.update { it.copy(foundPatient = patient, duplicateCandidates = emptyList()) }
        return startVisitForSelectedPatient()
    }

    suspend fun startVisitForSelectedPatient(): VisitStartResult? {
        val patient = _uiState.value.foundPatient ?: return null
        val clinicId = authTokenStore.getClinicId() ?: return null
        val chiefComplaint = _uiState.value.chiefComplaint.trim().takeIf { it.isNotBlank() }
        return runCatching {
            _uiState.update { it.copy(isCreating = true) }
            val staffId = authTokenStore.getStaffId()
            // Existing patient — already synced. No patient sync entry to chain.
            val (visit, _) = visitRepository.createVisit(
                clinicId = clinicId,
                patientId = patient.id,
                doctorId = staffId,
                chiefComplaint = chiefComplaint,
                patientSyncEntryId = null,
            )
            _uiState.update { it.copy(isCreating = false) }
            VisitStartResult(visitId = visit.id, patientId = patient.id)
        }.getOrElse { e ->
            _uiState.update { it.copy(error = e.message ?: "Failed to start visit", isCreating = false) }
            null
        }
    }

    suspend fun createPatientAndStartVisit(confirmDuplicate: Boolean = false): VisitStartResult? {
        val state = _uiState.value
        if (state.foundPatient != null) return startVisitForSelectedPatient()

        // Validate the new-patient form. Sex remains required for HMIS 105
        // sex banding. DOB precision (migration 038) now lets year-only and
        // age-estimate patients still land in the right HMIS age bucket via
        // the patient_age_years() helper, so we only require an exact DOB
        // when the clinician explicitly picked precision='exact'. Phone is
        // optional — many patients in this catchment don't carry one.
        val errors = FieldErrors(
            firstName = if (state.firstName.isBlank()) "Required" else null,
            lastName = if (state.lastName.isBlank()) "Required" else null,
            sex = if (state.sex == null) "Required" else null,
            dateOfBirth = if (state.dobPrecision == DobPrecision.EXACT) {
                validateDateOfBirth(state.dateOfBirth)
            } else null,
            birthYear = if (state.dobPrecision == DobPrecision.YEAR_ONLY) {
                validateBirthYear(state.birthYear)
            } else null,
            approximateAge = if (state.dobPrecision == DobPrecision.AGE_ESTIMATE) {
                validateApproximateAge(state.approximateAge)
            } else null,
            phone = if (state.searchQuery.isNotBlank() && !state.phoneValid) {
                "Enter a valid Uganda phone number or leave blank"
            } else null,
        )
        if (errors.firstName != null || errors.lastName != null || errors.sex != null ||
            errors.dateOfBirth != null || errors.birthYear != null ||
            errors.approximateAge != null || errors.phone != null
        ) {
            _uiState.update { it.copy(fieldErrors = errors, error = null) }
            return null
        }

        val clinicId = authTokenStore.getClinicId()
            ?: run {
                _uiState.update { it.copy(error = "No active clinic — please sign in again") }
                return null
            }

        // Resolve the per-precision identity fields. dateOfBirthIso may be
        // null for non-exact precisions — that's expected and matches the
        // server CHECK constraint.
        val dateOfBirthIso = if (state.dobPrecision == DobPrecision.EXACT) {
            displayToIsoDate(state.dateOfBirth!!) ?: run {
                _uiState.update {
                    it.copy(
                        fieldErrors = it.fieldErrors.copy(dateOfBirth = "Enter a valid date"),
                        error = null,
                    )
                }
                return null
            }
        } else null
        val birthYearInt = state.birthYear.takeIf { state.dobPrecision == DobPrecision.YEAR_ONLY }
            ?.toIntOrNull()
        val approxAgeInt = state.approximateAge.takeIf { state.dobPrecision == DobPrecision.AGE_ESTIMATE }
            ?.toIntOrNull()

        val phone = if (state.searchQuery.isNotBlank()) formatPhoneNumber(state.searchQuery) else null

        // Compute the age estimate used to band duplicate-candidate matches.
        // The RPC widens this to ±3 years internally, so we just need a
        // single integer year value.
        val today = LocalDate.now()
        val ageEstimate: Int? = when (state.dobPrecision) {
            DobPrecision.EXACT -> dateOfBirthIso
                ?.let { runCatching { LocalDate.parse(it) }.getOrNull() }
                ?.let { today.year - it.year }
            DobPrecision.YEAR_ONLY -> birthYearInt?.let { today.year - it }
            DobPrecision.AGE_ESTIMATE -> approxAgeInt
            else -> null
        }

        _uiState.update { it.copy(isCreating = true, error = null) }
        return try {
            val normalizedFirstName = normalizeHumanName(state.firstName)
            val normalizedLastName = normalizeHumanName(state.lastName)

            val candidates = patientRepository.findDuplicateCandidates(
                clinicId = clinicId,
                firstName = normalizedFirstName,
                lastName = normalizedLastName,
                village = state.village.trim().takeIf { it.isNotBlank() },
                parish = state.parish.trim().takeIf { it.isNotBlank() },
                age = ageEstimate,
                sex = state.sex?.name,
            )
            if (candidates.isNotEmpty() && !confirmDuplicate) {
                _uiState.update { it.copy(duplicateCandidates = candidates, isCreating = false) }
                return null
            }

            val (patient, patientSyncId) = patientRepository.createPatient(
                clinicId = clinicId,
                firstName = normalizedFirstName,
                lastName = normalizedLastName,
                whatsappNumber = phone,
                dateOfBirth = dateOfBirthIso,
                sex = state.sex?.name,
                birthYear = birthYearInt,
                approximateAge = approxAgeInt,
                ageRecordedAt = if (state.dobPrecision == DobPrecision.AGE_ESTIMATE) {
                    Instant.now().toString()
                } else null,
                dobPrecision = state.dobPrecision,
                village = state.village.trim().takeIf { it.isNotBlank() },
                parish = state.parish.trim().takeIf { it.isNotBlank() },
                subcounty = state.subcounty.trim().takeIf { it.isNotBlank() },
                district = state.district.trim().takeIf { it.isNotBlank() },
                guardianName = state.guardianName.trim().takeIf { it.isNotBlank() },
                guardianRelationship = state.guardianRelationship.trim().takeIf { it.isNotBlank() },
                nationalId = state.nationalId.trim().takeIf { it.isNotBlank() },
            )
            val staffId = authTokenStore.getStaffId()
            val chiefComplaint = state.chiefComplaint.trim().takeIf { it.isNotBlank() }
            val (visit, _) = visitRepository.createVisit(
                clinicId = clinicId,
                patientId = patient.id,
                doctorId = staffId,
                chiefComplaint = chiefComplaint,
                patientSyncEntryId = patientSyncId,
            )
            _uiState.update { it.copy(foundPatient = patient, isCreating = false) }
            VisitStartResult(visitId = visit.id, patientId = patient.id)
        } catch (e: Exception) {
            _uiState.update { it.copy(error = e.message ?: "Failed to create patient", isCreating = false) }
            null
        }
    }

    private fun normalizeHumanName(input: String): String {
        val trimmed = input.trim()
        if (trimmed.isEmpty()) return trimmed
        // Minimal normalization: ensure the first letter is uppercase without
        // forcing the rest of the name into lowercase (preserves intentional casing).
        return trimmed.replaceFirstChar { ch ->
            if (ch.isLowerCase()) ch.titlecase() else ch.toString()
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

    private fun validateBirthYear(input: String): String? {
        if (input.isBlank()) return "Required"
        val year = input.toIntOrNull() ?: return "Enter a 4-digit year"
        val currentYear = LocalDate.now().year
        if (year < 1900) return "Year looks too far in the past"
        if (year > currentYear) return "Year cannot be in the future"
        return null
    }

    private fun validateApproximateAge(input: String): String? {
        if (input.isBlank()) return "Required"
        val age = input.toIntOrNull() ?: return "Enter age in years"
        if (age < 0) return "Age can't be negative"
        if (age > 130) return "Age looks too high"
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
