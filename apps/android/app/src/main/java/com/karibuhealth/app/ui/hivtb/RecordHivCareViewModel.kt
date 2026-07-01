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

data class RecordHivCareUiState(
    val searchQuery: String = "",
    val searchResults: List<Patient> = emptyList(),
    val selectedPatient: Patient? = null,
    val careStatus: String = "pre_art",
    val whoStage: String = "",
    val artRegimen: String = "",
    val artLine: String = "",
    val isSearching: Boolean = false,
    val isSaving: Boolean = false,
    val savedId: String? = null,
    val error: String? = null,
)

@HiltViewModel
class RecordHivCareViewModel @Inject constructor(
    private val patientRepository: PatientRepository,
    private val hivTbRepository: HivTbRepository,
    private val authTokenStore: AuthTokenStore,
) : ViewModel() {

    private val _state = MutableStateFlow(RecordHivCareUiState())
    val state: StateFlow<RecordHivCareUiState> = _state.asStateFlow()
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

    fun setCareStatus(v: String) = _state.update { it.copy(careStatus = v) }
    fun onWhoStageChange(v: String) = _state.update { it.copy(whoStage = v.filter { c -> c.isDigit() }) }
    fun onArtRegimenChange(v: String) = _state.update { it.copy(artRegimen = v) }
    fun setArtLine(v: String) = _state.update { it.copy(artLine = v) }

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
                val onArt = s.careStatus == "on_art"
                val id = hivTbRepository.upsertHivCare(
                    clinicId = clinicId,
                    patientId = patient.id,
                    patientName = name,
                    careStatus = s.careStatus,
                    whoStage = s.whoStage.toIntOrNull(),
                    artStartDate = if (onArt) today else null,
                    artRegimen = s.artRegimen.ifBlank { if (onArt) "TLD" else null },
                    artLine = s.artLine.ifBlank { null },
                )
                _state.update { it.copy(isSaving = false, savedId = id) }
            } catch (e: Exception) {
                _state.update { it.copy(isSaving = false, error = e.message ?: "Could not enroll patient") }
            }
        }
    }
}
