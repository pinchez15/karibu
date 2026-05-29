package com.karibuhealth.app.ui.inpatient

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.karibuhealth.app.data.local.datastore.AuthTokenStore
import com.karibuhealth.app.data.repository.PatientRepository
import com.karibuhealth.app.data.repository.VisitRepository
import com.karibuhealth.app.domain.model.Patient
import com.karibuhealth.app.util.NetworkMonitor
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

data class InpatientHomeUiState(
    val searchQuery: String = "",
    val searchResults: List<Patient> = emptyList(),
    val selectedPatient: Patient? = null,
    val wardLabel: String = "",
    val chiefComplaint: String = "",
    val isSearching: Boolean = false,
    val isAdmitting: Boolean = false,
    val lastAdmissionId: String? = null,
    val error: String? = null,
    val isOnline: Boolean = true,
)

@HiltViewModel
class InpatientHomeViewModel @Inject constructor(
    private val patientRepository: PatientRepository,
    private val visitRepository: VisitRepository,
    private val authTokenStore: AuthTokenStore,
    private val networkMonitor: NetworkMonitor,
) : ViewModel() {

    private val _uiState = MutableStateFlow(InpatientHomeUiState())
    val uiState: StateFlow<InpatientHomeUiState> = _uiState.asStateFlow()

    private var searchJob: Job? = null

    init {
        viewModelScope.launch {
            networkMonitor.isOnlineFlow.collect { online ->
                _uiState.update { it.copy(isOnline = online) }
            }
        }
    }

    fun onSearchQueryChange(query: String) {
        _uiState.update {
            it.copy(
                searchQuery = query,
                selectedPatient = if (query.isBlank()) null else it.selectedPatient,
                error = null,
            )
        }
        searchJob?.cancel()
        if (query.length < 2) {
            _uiState.update { it.copy(searchResults = emptyList(), isSearching = false) }
            return
        }
        searchJob = viewModelScope.launch {
            delay(300)
            val clinicId = authTokenStore.getClinicId() ?: return@launch
            _uiState.update { it.copy(isSearching = true) }
            val results = runCatching {
                patientRepository.searchPatients(clinicId, query).first()
            }.getOrElse { emptyList() }
            _uiState.update { it.copy(searchResults = results, isSearching = false) }
        }
    }

    fun selectPatient(patient: Patient) {
        _uiState.update {
            it.copy(
                selectedPatient = patient,
                searchQuery = patient.fullName.ifBlank { patient.displayName.orEmpty() },
                searchResults = emptyList(),
                error = null,
            )
        }
    }

    fun onWardChange(value: String) {
        _uiState.update { it.copy(wardLabel = value, error = null) }
    }

    fun onComplaintChange(value: String) {
        _uiState.update { it.copy(chiefComplaint = value, error = null) }
    }

    fun admit() {
        val patient = _uiState.value.selectedPatient
        if (patient == null) {
            _uiState.update { it.copy(error = "Select a patient to admit.") }
            return
        }
        if (!_uiState.value.isOnline) {
            _uiState.update { it.copy(error = "Admission requires an internet connection.") }
            return
        }
        viewModelScope.launch {
            _uiState.update { it.copy(isAdmitting = true, error = null) }
            try {
                val admissionId = visitRepository.admitPatient(
                    patientId = patient.id,
                    wardLabel = _uiState.value.wardLabel,
                    chiefComplaint = _uiState.value.chiefComplaint,
                )
                _uiState.update {
                    it.copy(
                        isAdmitting = false,
                        lastAdmissionId = admissionId,
                        wardLabel = "",
                        chiefComplaint = "",
                        selectedPatient = null,
                        searchQuery = "",
                    )
                }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        isAdmitting = false,
                        error = e.message ?: "Admission failed",
                    )
                }
            }
        }
    }
}
