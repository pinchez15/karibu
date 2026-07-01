package com.karibuhealth.app.ui.hivtb

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.karibuhealth.app.data.local.datastore.AuthTokenStore
import com.karibuhealth.app.data.repository.HivTbRepository
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
import java.time.LocalDate
import javax.inject.Inject

data class RecordTbUiState(
    val searchQuery: String = "",
    val searchResults: List<Patient> = emptyList(),
    val selectedPatient: Patient? = null,
    val unitTbNumber: String = "",
    val caseType: String = "new",
    val diseaseClass: String = "pulmonary_smear_positive",
    val hivStatus: String = "",
    val isSearching: Boolean = false,
    val isSaving: Boolean = false,
    val savedId: String? = null,
    val error: String? = null,
)

@HiltViewModel
class RecordTbViewModel @Inject constructor(
    private val patientRepository: PatientRepository,
    private val hivTbRepository: HivTbRepository,
    private val authTokenStore: AuthTokenStore,
) : ViewModel() {

    private val _state = MutableStateFlow(RecordTbUiState())
    val state: StateFlow<RecordTbUiState> = _state.asStateFlow()
    private var searchJob: Job? = null

    fun onSearchQueryChange(query: String) {
        _state.update { it.copy(searchQuery = query, error = null) }
        searchJob?.cancel()
        if (query.length < 2) {
            _state.update { it.copy(searchResults = emptyList(), isSearching = false) }
            return
        }
        searchJob = viewModelScope.launch {
            delay(300)
            val clinicId = authTokenStore.getClinicId() ?: return@launch
            _state.update { it.copy(isSearching = true) }
            val results = runCatching { patientRepository.searchPatients(clinicId, query).first() }.getOrElse { emptyList() }
            _state.update { it.copy(searchResults = results, isSearching = false) }
        }
    }

    fun selectPatient(patient: Patient) {
        _state.update {
            it.copy(
                selectedPatient = patient,
                searchQuery = formatPatientName(patient.firstName, patient.lastName, patient.displayName),
                searchResults = emptyList(),
            )
        }
    }

    fun onUnitTbNumberChange(v: String) = _state.update { it.copy(unitTbNumber = v) }
    fun setCaseType(v: String) = _state.update { it.copy(caseType = v) }
    fun setDiseaseClass(v: String) = _state.update { it.copy(diseaseClass = v) }
    fun setHivStatus(v: String) = _state.update { it.copy(hivStatus = v) }

    fun save() {
        val s = _state.value
        val patient = s.selectedPatient ?: run {
            _state.update { it.copy(error = "Select a patient first.") }
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(isSaving = true, error = null) }
            try {
                val clinicId = authTokenStore.getClinicId() ?: throw IllegalStateException("No clinic on this device")
                val name = formatPatientName(patient.firstName, patient.lastName, patient.displayName)
                val today = LocalDate.now().toString()
                val id = hivTbRepository.upsertTbEpisode(
                    clinicId = clinicId,
                    patientId = patient.id,
                    patientName = name,
                    unitTbNumber = s.unitTbNumber.ifBlank { null },
                    caseType = s.caseType,
                    diseaseClass = s.diseaseClass,
                    hivStatus = s.hivStatus.ifBlank { null },
                    treatmentStartedAt = today,
                )
                _state.update { it.copy(isSaving = false, savedId = id) }
            } catch (e: Exception) {
                _state.update { it.copy(isSaving = false, error = e.message ?: "Could not register TB episode") }
            }
        }
    }
}
