package com.karibuhealth.app.ui.vitals

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.karibuhealth.app.data.repository.VitalsRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class VitalsUiState(
    val weightKg: String = "",
    val heightCm: String = "",
    val tempC: String = "",
    val bpSystolic: String = "",
    val bpDiastolic: String = "",
    val pulseBpm: String = "",
    val respRate: String = "",
    val spo2Pct: String = "",
    val muacCm: String = "",
    val notes: String = "",
    val isSaving: Boolean = false,
    val saved: Boolean = false,
    val error: String? = null,
)

@HiltViewModel
class VitalsViewModel @Inject constructor(
    private val vitalsRepository: VitalsRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(VitalsUiState())
    val uiState: StateFlow<VitalsUiState> = _uiState.asStateFlow()

    fun updateWeight(value: String) = _uiState.update { it.copy(weightKg = value) }
    fun updateHeight(value: String) = _uiState.update { it.copy(heightCm = value) }
    fun updateTemp(value: String) = _uiState.update { it.copy(tempC = value) }
    fun updateBpSystolic(value: String) = _uiState.update { it.copy(bpSystolic = value) }
    fun updateBpDiastolic(value: String) = _uiState.update { it.copy(bpDiastolic = value) }
    fun updatePulse(value: String) = _uiState.update { it.copy(pulseBpm = value) }
    fun updateRespRate(value: String) = _uiState.update { it.copy(respRate = value) }
    fun updateSpo2(value: String) = _uiState.update { it.copy(spo2Pct = value) }
    fun updateMuac(value: String) = _uiState.update { it.copy(muacCm = value) }
    fun updateNotes(value: String) = _uiState.update { it.copy(notes = value) }

    fun save(patientId: String, visitId: String?) {
        if (_uiState.value.isSaving) return
        val state = _uiState.value
        viewModelScope.launch {
            _uiState.update { it.copy(isSaving = true, error = null) }
            try {
                vitalsRepository.recordVitals(
                    patientId = patientId,
                    visitId = visitId,
                    weightKg = state.weightKg.toDoubleOrNull(),
                    heightCm = state.heightCm.toDoubleOrNull(),
                    tempC = state.tempC.toDoubleOrNull(),
                    bpSystolic = state.bpSystolic.toIntOrNull(),
                    bpDiastolic = state.bpDiastolic.toIntOrNull(),
                    pulseBpm = state.pulseBpm.toIntOrNull(),
                    respRate = state.respRate.toIntOrNull(),
                    spo2Pct = state.spo2Pct.toIntOrNull(),
                    muacCm = state.muacCm.toDoubleOrNull(),
                    notes = state.notes.takeIf { it.isNotBlank() },
                )
                _uiState.update { it.copy(isSaving = false, saved = true) }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(isSaving = false, error = e.message ?: "Failed to save vitals")
                }
            }
        }
    }
}
