package com.karibuhealth.app.ui.referral

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.karibuhealth.app.data.local.db.converter.toDomain
import com.karibuhealth.app.data.repository.ReferralRepository
import com.karibuhealth.app.data.repository.StaffRepository
import com.karibuhealth.app.data.repository.VisitRepository
import com.karibuhealth.app.data.repository.VitalsRepository
import com.karibuhealth.app.domain.model.Patient
import com.karibuhealth.app.domain.model.PatientVitals
import com.karibuhealth.app.domain.model.Referral
import com.karibuhealth.app.domain.model.ReferralUrgency
import com.karibuhealth.app.domain.model.Staff
import com.karibuhealth.app.domain.model.Visit
import com.karibuhealth.app.ui.util.formatPatientName
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.firstOrNull
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ReferralUiState(
    val visit: Visit? = null,
    val patient: Patient? = null,
    val vitals: PatientVitals? = null,
    val clinicName: String? = null,
    val staff: Staff? = null,
    val toFacility: String = "",
    val urgency: ReferralUrgency = ReferralUrgency.Urgent,
    val reason: String = "",
    val clinicalSummary: String = "",
    val transportMode: String = "",
    val isLoading: Boolean = true,
    val isSaving: Boolean = false,
    val error: String? = null,
    val createdReferral: Referral? = null,
    val printableSummary: String? = null,
)

@HiltViewModel
class ReferralViewModel @Inject constructor(
    private val visitRepository: VisitRepository,
    private val vitalsRepository: VitalsRepository,
    private val staffRepository: StaffRepository,
    private val referralRepository: ReferralRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(ReferralUiState())
    val uiState: StateFlow<ReferralUiState> = _uiState.asStateFlow()

    private var summaryPrefilled = false

    fun load(visitId: String) {
        viewModelScope.launch {
            val staff = staffRepository.getCurrentStaff()
            val clinicName = staff?.clinicId?.let { cid ->
                staffRepository.getClinic(cid).firstOrNull()?.name
            }
            _uiState.update { it.copy(staff = staff, clinicName = clinicName) }
        }

        viewModelScope.launch {
            visitRepository.getVisitWithDetails(visitId).collect { details ->
                if (details == null) {
                    _uiState.update { it.copy(isLoading = false, error = "Visit not found") }
                    return@collect
                }
                val visit = details.visit.toDomain()
                val patient = details.patient.toDomain()
                val transcript = details.providerNote?.transcript
                if (!summaryPrefilled) {
                    summaryPrefilled = true
                    viewModelScope.launch {
                        val vitals = vitalsRepository.getLatestForVisit(visitId)
                        val summary = ReferralSummaryFormatter.defaultClinicalSummary(
                            visit = visit,
                            providerTranscript = transcript,
                            vitals = vitals,
                        )
                        _uiState.update {
                            it.copy(
                                visit = visit,
                                patient = patient,
                                vitals = vitals,
                                clinicalSummary = summary,
                                isLoading = false,
                                error = null,
                            )
                        }
                    }
                } else {
                    _uiState.update {
                        it.copy(visit = visit, patient = patient, isLoading = false, error = null)
                    }
                }
            }
        }

        viewModelScope.launch {
            vitalsRepository.getByVisit(visitId).collect { list ->
                val vitals = list.firstOrNull()
                _uiState.update { it.copy(vitals = vitals) }
            }
        }
    }

    fun updateToFacility(value: String) {
        _uiState.update { it.copy(toFacility = value) }
    }

    fun updateUrgency(urgency: ReferralUrgency) {
        _uiState.update { it.copy(urgency = urgency) }
    }

    fun updateReason(value: String) {
        _uiState.update { it.copy(reason = value) }
    }

    fun updateClinicalSummary(value: String) {
        _uiState.update { it.copy(clinicalSummary = value) }
    }

    fun updateTransportMode(value: String) {
        _uiState.update { it.copy(transportMode = value) }
    }

    fun submit() {
        val state = _uiState.value
        val visit = state.visit ?: return
        val patient = state.patient ?: return
        val staff = state.staff ?: run {
            _uiState.update { it.copy(error = "Sign in required") }
            return
        }
        if (state.toFacility.isBlank()) {
            _uiState.update { it.copy(error = "Enter receiving hospital or facility") }
            return
        }
        if (state.reason.isBlank()) {
            _uiState.update { it.copy(error = "Enter reason for referral") }
            return
        }
        viewModelScope.launch {
            _uiState.update { it.copy(isSaving = true, error = null) }
            runCatching {
                val patientName = formatPatientName(
                    patient.firstName,
                    patient.lastName,
                    patient.displayName,
                )
                val referringName = staff.displayName
                val referral = referralRepository.createReferral(
                    clinicId = staff.clinicId,
                    patientId = patient.id,
                    visitId = visit.id,
                    patientName = patientName,
                    fromDepartment = "opd",
                    toFacility = state.toFacility,
                    urgency = state.urgency,
                    reason = state.reason,
                    clinicalSummary = state.clinicalSummary.ifBlank { null },
                    transportMode = state.transportMode.ifBlank { null },
                    referredBy = staff.id,
                )
                val printable = ReferralSummaryFormatter.buildPrintableSummary(
                    clinicName = state.clinicName,
                    patient = patient,
                    visit = visit,
                    vitals = state.vitals,
                    referral = referral,
                    referringClinician = referringName,
                )
                _uiState.update {
                    it.copy(
                        isSaving = false,
                        createdReferral = referral,
                        printableSummary = printable,
                    )
                }
            }.onFailure { e ->
                _uiState.update {
                    it.copy(isSaving = false, error = e.message ?: "Could not create referral")
                }
            }
        }
    }
}
