package com.karibuhealth.app.ui.inpatient

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.karibuhealth.app.data.local.datastore.AuthTokenStore
import com.karibuhealth.app.data.local.db.entity.AdmissionEntity
import com.karibuhealth.app.data.local.db.entity.AdmissionObservationEntity
import com.karibuhealth.app.data.repository.InpatientRepository
import com.karibuhealth.app.domain.InpatientDangerSigns
import com.karibuhealth.app.domain.ObservationRangeCheck
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.LocalDate
import java.time.Period
import javax.inject.Inject

data class AdmissionChartUiState(
    val admission: AdmissionEntity? = null,
    val observations: List<AdmissionObservationEntity> = emptyList(),
    val isSaving: Boolean = false,
    // Non-empty → show an "entered correctly?" confirm before the round is saved.
    val pendingWarnings: List<String> = emptyList(),
    // Increments on each successful save so the UI can close the record sheet.
    val savedTick: Int = 0,
    // Danger signs tripped by the most recent observation (on-device, no AI).
    val dangerFindings: List<InpatientDangerSigns.Finding> = emptyList(),
    val error: String? = null,
)

/** A round's typed-in values before persistence. */
data class ObservationInput(
    val tempC: Double? = null,
    val pulseBpm: Int? = null,
    val respRate: Int? = null,
    val bpSystolic: Int? = null,
    val bpDiastolic: Int? = null,
    val spo2Pct: Int? = null,
    val avpu: String? = null,
    val imciNotFeeding: Boolean = false,
    val imciVomitingEverything: Boolean = false,
    val imciConvulsions: Boolean = false,
    val imciLethargicUnconscious: Boolean = false,
    val note: String? = null,
)

@HiltViewModel
class AdmissionChartViewModel @Inject constructor(
    private val inpatientRepository: InpatientRepository,
    private val authTokenStore: AuthTokenStore,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {

    private val admissionId: String = savedStateHandle.get<String>("admissionId").orEmpty()

    private val _state = MutableStateFlow(AdmissionChartUiState())
    val state: StateFlow<AdmissionChartUiState> = _state.asStateFlow()

    private var pending: ObservationInput? = null

    init {
        viewModelScope.launch {
            inpatientRepository.observeAdmission(admissionId).collect { admission ->
                _state.update { it.copy(admission = admission) }
                recomputeDanger()
            }
        }
        viewModelScope.launch {
            inpatientRepository.observeObservations(admissionId).collect { obs ->
                _state.update { it.copy(observations = obs) }
                recomputeDanger()
            }
        }
        viewModelScope.launch { inpatientRepository.refreshObservations(admissionId) }
    }

    /** Re-evaluate danger signs from the most recent observation + patient age. */
    private fun recomputeDanger() {
        val st = _state.value
        val latest = st.observations.firstOrNull()
        val findings = if (latest == null) {
            emptyList()
        } else {
            InpatientDangerSigns.evaluate(
                InpatientDangerSigns.Observation(
                    tempC = latest.tempC,
                    pulseBpm = latest.pulseBpm,
                    respRate = latest.respRate,
                    bpSystolic = latest.bpSystolic,
                    bpDiastolic = latest.bpDiastolic,
                    spo2Pct = latest.spo2Pct,
                    avpu = latest.avpu,
                    imciNotFeeding = latest.imciNotFeeding,
                    imciVomitingEverything = latest.imciVomitingEverything,
                    imciConvulsions = latest.imciConvulsions,
                    imciLethargicUnconscious = latest.imciLethargicUnconscious,
                ),
                ageYears = ageYears(st.admission?.dateOfBirth),
            )
        }
        _state.update { it.copy(dangerFindings = findings) }
    }

    private fun ageYears(dob: String?): Int? {
        if (dob.isNullOrBlank()) return null
        return runCatching { Period.between(LocalDate.parse(dob.take(10)), LocalDate.now()).years }.getOrNull()
    }

    /**
     * Validate then save a round. On the first call, implausible values are
     * surfaced as [AdmissionChartUiState.pendingWarnings] and nothing is written;
     * [force] = true (the user confirmed) saves regardless.
     */
    fun recordObservation(input: ObservationInput, force: Boolean = false) {
        if (!force) {
            val warnings = ObservationRangeCheck.check(
                ObservationRangeCheck.Vitals(
                    tempC = input.tempC,
                    pulseBpm = input.pulseBpm,
                    respRate = input.respRate,
                    bpSystolic = input.bpSystolic,
                    bpDiastolic = input.bpDiastolic,
                    spo2Pct = input.spo2Pct,
                ),
            )
            if (warnings.isNotEmpty()) {
                pending = input
                _state.update { it.copy(pendingWarnings = warnings) }
                return
            }
        }
        save(input)
    }

    /** The user confirmed the flagged values — save the round that was held back. */
    fun confirmSave() {
        pending?.let { save(it) }
    }

    fun dismissWarnings() {
        pending = null
        _state.update { it.copy(pendingWarnings = emptyList()) }
    }

    private fun save(input: ObservationInput) {
        val admission = _state.value.admission ?: return
        viewModelScope.launch {
            _state.update { it.copy(isSaving = true, pendingWarnings = emptyList(), error = null) }
            try {
                val clinicId = authTokenStore.getClinicId()
                    ?: throw IllegalStateException("No clinic on this device")
                inpatientRepository.recordObservation(
                    clinicId = clinicId,
                    admissionId = admissionId,
                    patientId = admission.patientId,
                    observedAt = Instant.now().toString(),
                    tempC = input.tempC,
                    pulseBpm = input.pulseBpm,
                    respRate = input.respRate,
                    bpSystolic = input.bpSystolic,
                    bpDiastolic = input.bpDiastolic,
                    spo2Pct = input.spo2Pct,
                    avpu = input.avpu,
                    imciNotFeeding = input.imciNotFeeding,
                    imciVomitingEverything = input.imciVomitingEverything,
                    imciConvulsions = input.imciConvulsions,
                    imciLethargicUnconscious = input.imciLethargicUnconscious,
                    note = input.note,
                )
                pending = null
                _state.update { it.copy(isSaving = false, savedTick = it.savedTick + 1) }
            } catch (e: Exception) {
                _state.update { it.copy(isSaving = false, error = e.message ?: "Could not save observation") }
            }
        }
    }
}
