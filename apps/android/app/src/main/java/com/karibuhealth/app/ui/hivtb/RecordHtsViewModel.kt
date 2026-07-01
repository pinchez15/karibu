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
import javax.inject.Inject

data class RecordHtsUiState(
    val searchQuery: String = "",
    val searchResults: List<Patient> = emptyList(),
    val selectedPatient: Patient? = null,
    val tested: Boolean = true,
    val result: String = "negative",
    val resultReceived: Boolean = true,
    val suspectedTb: Boolean = false,
    val startedCpt: Boolean = false,
    val retester: Boolean = false,
    val isSearching: Boolean = false,
    val isSaving: Boolean = false,
    val savedId: String? = null,
    val error: String? = null,
)

@HiltViewModel
class RecordHtsViewModel @Inject constructor(
    private val patientRepository: PatientRepository,
    private val hivTbRepository: HivTbRepository,
    private val authTokenStore: AuthTokenStore,
) : ViewModel() {

    private val _state = MutableStateFlow(RecordHtsUiState())
    val state: StateFlow<RecordHtsUiState> = _state.asStateFlow()
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

    fun setTested(v: Boolean) = _state.update { it.copy(tested = v) }
    fun setResult(v: String) = _state.update { it.copy(result = v) }
    fun setResultReceived(v: Boolean) = _state.update { it.copy(resultReceived = v) }
    fun setSuspectedTb(v: Boolean) = _state.update { it.copy(suspectedTb = v) }
    fun setStartedCpt(v: Boolean) = _state.update { it.copy(startedCpt = v) }
    fun setRetester(v: Boolean) = _state.update { it.copy(retester = v) }

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
                val id = hivTbRepository.recordHtsEvent(
                    clinicId = clinicId,
                    patientId = patient.id,
                    patientName = name,
                    tested = s.tested,
                    result = if (s.tested) s.result else null,
                    resultReceived = s.resultReceived,
                    suspectedTb = s.suspectedTb,
                    startedCpt = s.startedCpt,
                    retester = s.retester,
                )
                _state.update { it.copy(isSaving = false, savedId = id) }
            } catch (e: Exception) {
                _state.update { it.copy(isSaving = false, error = e.message ?: "Could not record HTS event") }
            }
        }
    }
}
