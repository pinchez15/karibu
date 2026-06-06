package com.karibuhealth.app.ui.inpatient

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.karibuhealth.app.data.local.datastore.AuthTokenStore
import com.karibuhealth.app.data.repository.InpatientRepository
import com.karibuhealth.app.data.repository.PatientRepository
import com.karibuhealth.app.domain.model.Patient
import com.karibuhealth.app.ui.util.formatPatientName
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class AdmitUiState(
    val searchQuery: String = "",
    val searchResults: List<Patient> = emptyList(),
    val selectedPatient: Patient? = null,
    val ward: String = "general", // general | maternity
    val bedLabel: String = "",
    val chiefComplaint: String = "",
    val weightKg: String = "",
    // Minimal maternity fields (shown only when ward = maternity).
    val gravida: String = "",
    val para: String = "",
    val gestationWeeks: String = "",
    val hivStatus: String = "",
    val presentingStatus: String = "",
    val isSearching: Boolean = false,
    val isAdmitting: Boolean = false,
    val admittedId: String? = null,
    val error: String? = null,
)

@HiltViewModel
class AdmitPatientViewModel @Inject constructor(
    private val patientRepository: PatientRepository,
    private val inpatientRepository: InpatientRepository,
    private val authTokenStore: AuthTokenStore,
) : ViewModel() {

    private val _state = MutableStateFlow(AdmitUiState())
    val state: StateFlow<AdmitUiState> = _state.asStateFlow()

    private var searchJob: Job? = null

    fun onSearchQueryChange(query: String) {
        _state.update {
            it.copy(
                searchQuery = query,
                selectedPatient = if (query.isBlank()) null else it.selectedPatient,
                error = null,
            )
        }
        searchJob?.cancel()
        if (query.length < 2) {
            _state.update { it.copy(searchResults = emptyList(), isSearching = false) }
            return
        }
        searchJob = viewModelScope.launch {
            delay(300)
            val clinicId = authTokenStore.getClinicId() ?: return@launch
            _state.update { it.copy(isSearching = true) }
            val results = runCatching {
                patientRepository.searchPatients(clinicId, query).first()
            }.getOrElse { emptyList() }
            _state.update { it.copy(searchResults = results, isSearching = false) }
        }
    }

    fun selectPatient(patient: Patient) {
        _state.update {
            it.copy(
                selectedPatient = patient,
                searchQuery = formatPatientName(patient.firstName, patient.lastName, patient.displayName),
                searchResults = emptyList(),
                error = null,
            )
        }
    }

    fun setWard(ward: String) = _state.update { it.copy(ward = ward, error = null) }
    fun onBedChange(v: String) = _state.update { it.copy(bedLabel = v) }
    fun onComplaintChange(v: String) = _state.update { it.copy(chiefComplaint = v) }
    fun onWeightChange(v: String) = _state.update { it.copy(weightKg = v.filter { c -> c.isDigit() || c == '.' }) }
    fun onGravidaChange(v: String) = _state.update { it.copy(gravida = v.filter { c -> c.isDigit() }) }
    fun onParaChange(v: String) = _state.update { it.copy(para = v.filter { c -> c.isDigit() }) }
    fun onGestationChange(v: String) = _state.update { it.copy(gestationWeeks = v.filter { c -> c.isDigit() }) }
    fun onHivStatusChange(v: String) = _state.update { it.copy(hivStatus = v) }
    fun onPresentingStatusChange(v: String) = _state.update { it.copy(presentingStatus = v) }

    fun admit() {
        val s = _state.value
        val patient = s.selectedPatient
        if (patient == null) {
            _state.update { it.copy(error = "Select a patient to admit.") }
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(isAdmitting = true, error = null) }
            try {
                val clinicId = authTokenStore.getClinicId()
                    ?: throw IllegalStateException("No clinic on this device")
                val maternity = if (s.ward == "maternity") {
                    InpatientRepository.MaternityAdmission(
                        gravida = s.gravida.toIntOrNull(),
                        para = s.para.toIntOrNull(),
                        gestationWeeks = s.gestationWeeks.toIntOrNull(),
                        hivStatus = s.hivStatus.ifBlank { null },
                        presentingStatus = s.presentingStatus.ifBlank { null },
                    )
                } else {
                    null
                }
                val admissionId = inpatientRepository.admit(
                    clinicId = clinicId,
                    patientId = patient.id,
                    patientName = formatPatientName(patient.firstName, patient.lastName, patient.displayName),
                    dateOfBirth = patient.dateOfBirth,
                    sex = patient.sex,
                    ward = s.ward,
                    bedLabel = s.bedLabel,
                    chiefComplaint = s.chiefComplaint,
                    admissionType = s.ward,
                    weightKg = s.weightKg.toDoubleOrNull(),
                    maternity = maternity,
                )
                _state.update { it.copy(isAdmitting = false, admittedId = admissionId) }
            } catch (e: Exception) {
                _state.update { it.copy(isAdmitting = false, error = e.message ?: "Admission failed") }
            }
        }
    }
}
