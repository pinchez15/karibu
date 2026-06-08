package com.karibuhealth.app.ui.anc

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.karibuhealth.app.data.local.datastore.AuthTokenStore
import com.karibuhealth.app.data.repository.AncRepository
import com.karibuhealth.app.data.repository.PatientRepository
import com.karibuhealth.app.domain.AncProtocol
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

data class StartPregnancyUiState(
    val searchQuery: String = "",
    val searchResults: List<Patient> = emptyList(),
    val selectedPatient: Patient? = null,
    val gestationWeeks: String = "",
    val gravida: String = "",
    val para: String = "",
    val bloodGroup: String = "",
    val hivStatus: String = "",
    val riskNotes: String = "",
    val isSearching: Boolean = false,
    val isSaving: Boolean = false,
    val startedId: String? = null,
    val error: String? = null,
)

@HiltViewModel
class StartPregnancyViewModel @Inject constructor(
    private val patientRepository: PatientRepository,
    private val ancRepository: AncRepository,
    private val authTokenStore: AuthTokenStore,
) : ViewModel() {

    private val _state = MutableStateFlow(StartPregnancyUiState())
    val state: StateFlow<StartPregnancyUiState> = _state.asStateFlow()
    private var searchJob: Job? = null

    fun onSearchQueryChange(query: String) {
        _state.update { it.copy(searchQuery = query, selectedPatient = if (query.isBlank()) null else it.selectedPatient, error = null) }
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

    fun onGestationChange(v: String) = _state.update { it.copy(gestationWeeks = v.filter { c -> c.isDigit() }) }
    fun onGravidaChange(v: String) = _state.update { it.copy(gravida = v.filter { c -> c.isDigit() }) }
    fun onParaChange(v: String) = _state.update { it.copy(para = v.filter { c -> c.isDigit() }) }
    fun onBloodGroupChange(v: String) = _state.update { it.copy(bloodGroup = v) }
    fun setHivStatus(v: String) = _state.update { it.copy(hivStatus = v) }
    fun onRiskNotesChange(v: String) = _state.update { it.copy(riskNotes = v) }

    fun start() {
        val s = _state.value
        val patient = s.selectedPatient ?: run {
            _state.update { it.copy(error = "Select the mother first.") }
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(isSaving = true, error = null) }
            try {
                val clinicId = authTokenStore.getClinicId() ?: throw IllegalStateException("No clinic on this device")
                // Gestational age by dates: derive LMP (and EDD) from weeks entered.
                val weeks = s.gestationWeeks.toIntOrNull()
                val lmp = weeks?.let { LocalDate.now().minusWeeks(it.toLong()) }
                val edd = lmp?.let { AncProtocol.eddFromLmp(it) }
                val id = ancRepository.startPregnancy(
                    clinicId = clinicId,
                    patientId = patient.id,
                    patientName = formatPatientName(patient.firstName, patient.lastName, patient.displayName),
                    lmp = lmp?.toString(),
                    edd = edd?.toString(),
                    gravida = s.gravida.toIntOrNull(),
                    para = s.para.toIntOrNull(),
                    bloodGroup = s.bloodGroup,
                    hivStatus = s.hivStatus.ifBlank { null },
                    syphilisStatus = null,
                    hepbStatus = null,
                    riskNotes = s.riskNotes,
                )
                _state.update { it.copy(isSaving = false, startedId = id) }
            } catch (e: Exception) {
                _state.update { it.copy(isSaving = false, error = e.message ?: "Could not register pregnancy") }
            }
        }
    }
}
