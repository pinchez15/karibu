package com.karibuhealth.app.ui.inpatient

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.karibuhealth.app.data.local.datastore.AuthTokenStore
import com.karibuhealth.app.data.local.db.entity.AdmissionEntity
import com.karibuhealth.app.data.local.db.entity.AdmissionNoteEntity
import com.karibuhealth.app.data.local.db.entity.AdmissionObservationEntity
import com.karibuhealth.app.data.local.db.entity.DeliveryEntity
import com.karibuhealth.app.data.local.db.entity.MedicationAdministrationEntity
import com.karibuhealth.app.data.local.db.entity.MedicationOrderEntity
import com.karibuhealth.app.data.local.db.entity.PostnatalObservationEntity
import com.karibuhealth.app.data.repository.InpatientRepository
import com.karibuhealth.app.data.repository.ReferralRepository
import com.karibuhealth.app.domain.model.ReferralUrgency
import com.karibuhealth.app.domain.InpatientDangerSigns
import com.karibuhealth.app.domain.MaternalDangerSigns
import com.karibuhealth.app.domain.NewbornDangerSigns
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
    // Treatment chart (migration 054).
    val medicationOrders: List<MedicationOrderEntity> = emptyList(),
    val medicationAdmins: List<MedicationAdministrationEntity> = emptyList(),
    // Maternity (migration 056).
    val delivery: DeliveryEntity? = null,
    val maternalAlerts: List<MaternalDangerSigns.Alert> = emptyList(),
    // Postnatal (migration 057).
    val postnatalObs: List<PostnatalObservationEntity> = emptyList(),
    val newbornFindings: List<NewbornDangerSigns.Finding> = emptyList(),
    // Progress notes (migration 058).
    val notes: List<AdmissionNoteEntity> = emptyList(),
    // Set once the admission is discharged/transferred, so the UI navigates back.
    val closed: Boolean = false,
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
    private val referralRepository: ReferralRepository,
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
        viewModelScope.launch {
            inpatientRepository.observeMedicationOrders(admissionId).collect { orders ->
                _state.update { it.copy(medicationOrders = orders) }
            }
        }
        viewModelScope.launch {
            inpatientRepository.observeMedicationAdmins(admissionId).collect { admins ->
                _state.update { it.copy(medicationAdmins = admins) }
            }
        }
        viewModelScope.launch { inpatientRepository.refreshMedications(admissionId) }
        viewModelScope.launch {
            inpatientRepository.observeDelivery(admissionId).collect { delivery ->
                _state.update { it.copy(delivery = delivery) }
                recomputeDanger()
            }
        }
        viewModelScope.launch { inpatientRepository.refreshDelivery(admissionId) }
        viewModelScope.launch {
            inpatientRepository.observePostnatal(admissionId).collect { rows ->
                _state.update { it.copy(postnatalObs = rows) }
                recomputeDanger()
            }
        }
        viewModelScope.launch { inpatientRepository.refreshPostnatal(admissionId) }
        viewModelScope.launch {
            inpatientRepository.observeNotes(admissionId).collect { notes ->
                _state.update { it.copy(notes = notes) }
            }
        }
        viewModelScope.launch { inpatientRepository.refreshNotes(admissionId) }
    }

    fun addNote(text: String) {
        val admission = _state.value.admission ?: return
        if (text.isBlank()) return
        viewModelScope.launch {
            val clinicId = authTokenStore.getClinicId() ?: return@launch
            runCatching {
                inpatientRepository.recordNote(clinicId, admissionId, admission.patientId, text)
            }.onFailure { e -> _state.update { it.copy(error = e.message) } }
        }
    }

    fun recordPostnatalObs(
        subject: String,
        tempC: Double?,
        pulseBpm: Int?,
        respRate: Int?,
        bpSystolic: Int?,
        bpDiastolic: Int?,
        bleeding: String?,
        fundusFirm: Boolean?,
        feedingWell: Boolean?,
        notFeeding: Boolean,
        convulsions: Boolean,
        jaundice: Boolean,
        note: String?,
    ) {
        val admission = _state.value.admission ?: return
        viewModelScope.launch {
            val clinicId = authTokenStore.getClinicId() ?: return@launch
            runCatching {
                inpatientRepository.recordPostnatalObs(
                    clinicId = clinicId, admissionId = admissionId, patientId = admission.patientId,
                    subject = subject, tempC = tempC, pulseBpm = pulseBpm, respRate = respRate,
                    bpSystolic = bpSystolic, bpDiastolic = bpDiastolic, bleeding = bleeding,
                    fundusFirm = fundusFirm, feedingWell = feedingWell, notFeeding = notFeeding,
                    convulsions = convulsions, jaundice = jaundice, note = note,
                )
            }.onFailure { e -> _state.update { it.copy(error = e.message) } }
        }
    }

    fun recordDelivery(
        mode: String?,
        outcome: String?,
        babySex: String?,
        birthWeightG: Int?,
        apgar1: Int?,
        apgar5: Int?,
        oxytocinGiven: Boolean,
        bloodLossMl: Int?,
        placentaComplete: Boolean?,
        resuscitationDone: Boolean,
        vitaminKGiven: Boolean,
        earlyBreastfeeding: Boolean,
        notes: String?,
    ) {
        val admission = _state.value.admission ?: return
        viewModelScope.launch {
            val clinicId = authTokenStore.getClinicId() ?: return@launch
            runCatching {
                inpatientRepository.recordDelivery(
                    clinicId = clinicId,
                    admissionId = admissionId,
                    patientId = admission.patientId,
                    existingId = _state.value.delivery?.id,
                    mode = mode, outcome = outcome, babySex = babySex, birthWeightG = birthWeightG,
                    apgar1 = apgar1, apgar5 = apgar5, oxytocinGiven = oxytocinGiven, bloodLossMl = bloodLossMl,
                    placentaComplete = placentaComplete, resuscitationDone = resuscitationDone,
                    vitaminKGiven = vitaminKGiven, earlyBreastfeeding = earlyBreastfeeding, notes = notes,
                )
            }.onFailure { e -> _state.update { it.copy(error = e.message) } }
        }
    }

    fun addMedicationOrder(
        drugName: String,
        dose: String?,
        route: String?,
        frequency: String?,
        instructions: String?,
    ) {
        val admission = _state.value.admission ?: return
        if (drugName.isBlank()) return
        viewModelScope.launch {
            val clinicId = authTokenStore.getClinicId() ?: return@launch
            runCatching {
                inpatientRepository.addMedicationOrder(
                    clinicId = clinicId,
                    admissionId = admissionId,
                    patientId = admission.patientId,
                    drugName = drugName,
                    dose = dose,
                    route = route,
                    frequency = frequency,
                    instructions = instructions,
                )
            }.onFailure { e -> _state.update { it.copy(error = e.message) } }
        }
    }

    fun stopMedicationOrder(orderId: String) {
        viewModelScope.launch { runCatching { inpatientRepository.stopMedicationOrder(orderId) } }
    }

    fun recordDose(orderId: String, given: Boolean, notGivenReason: String? = null) {
        val admission = _state.value.admission ?: return
        viewModelScope.launch {
            val clinicId = authTokenStore.getClinicId() ?: return@launch
            runCatching {
                inpatientRepository.recordMedicationAdmin(
                    clinicId = clinicId,
                    admissionId = admissionId,
                    orderId = orderId,
                    given = given,
                    notGivenReason = notGivenReason,
                )
            }.onFailure { e -> _state.update { it.copy(error = e.message) } }
        }
    }

    /** Close the admission with an outcome; it leaves the census and we navigate back. */
    fun discharge(outcome: String, disposition: String?, notes: String?) {
        viewModelScope.launch {
            runCatching {
                inpatientRepository.dischargeAdmission(admissionId, outcome, disposition, notes)
            }.onSuccess { _state.update { it.copy(closed = true) } }
                .onFailure { e -> _state.update { it.copy(error = e.message) } }
        }
    }

    /** Refer the admitted patient out, reusing the existing (visit-less) referral flow. */
    fun refer(toFacility: String, urgency: ReferralUrgency, reason: String, transportMode: String?) {
        val admission = _state.value.admission ?: return
        if (toFacility.isBlank()) return
        viewModelScope.launch {
            val clinicId = authTokenStore.getClinicId() ?: return@launch
            runCatching {
                referralRepository.createReferral(
                    clinicId = clinicId,
                    patientId = admission.patientId,
                    visitId = null,
                    patientName = admission.patientName,
                    fromDepartment = "inpatient",
                    toFacility = toFacility,
                    urgency = urgency,
                    reason = reason,
                    clinicalSummary = buildReferralSummary(),
                    transportMode = transportMode,
                    referredBy = null,
                )
            }.onFailure { e -> _state.update { it.copy(error = e.message) } }
        }
    }

    /** Assemble an inpatient handover summary from the chart for the referral pack. */
    private fun buildReferralSummary(): String {
        val st = _state.value
        val a = st.admission
        val parts = mutableListOf<String>()
        a?.let {
            parts += "Admitted ${it.admittedAt.take(10)} to ${if (it.ward == "maternity") "maternity" else "general"} ward."
            it.chiefComplaint?.takeIf { c -> c.isNotBlank() }?.let { c -> parts += "Reason: $c." }
            it.weightKg?.let { w -> parts += "Weight ${w} kg." }
        }
        st.observations.firstOrNull()?.let { o ->
            val vitals = listOfNotNull(
                o.tempC?.let { "T ${it}°C" },
                o.pulseBpm?.let { "HR $it" },
                o.respRate?.let { "RR $it" },
                if (o.bpSystolic != null && o.bpDiastolic != null) "BP ${o.bpSystolic}/${o.bpDiastolic}" else null,
                o.spo2Pct?.let { "SpO₂ $it%" },
                o.avpu?.let { "AVPU $it" },
            ).joinToString(", ")
            if (vitals.isNotBlank()) parts += "Last obs: $vitals."
        }
        val meds = st.medicationOrders.filter { it.active }
            .joinToString(", ") { listOfNotNull(it.drugName, it.dose, it.frequency).joinToString(" ") }
        if (meds.isNotBlank()) parts += "On: $meds."
        return parts.joinToString("\n")
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

        // Maternity: automatic maternal danger-sign evaluation from the latest
        // obs (BP/pulse/AVPU) + the delivery's blood loss. Symptom-driven signs
        // (eclampsia convulsions, headache/visual) are captured explicitly elsewhere.
        val maternal = if (st.admission?.ward == "maternity") {
            MaternalDangerSigns.evaluate(
                MaternalDangerSigns.Input(
                    bpSystolic = latest?.bpSystolic,
                    bpDiastolic = latest?.bpDiastolic,
                    pulseBpm = latest?.pulseBpm,
                    convulsions = latest?.imciConvulsions == true,
                    bloodLossMl = st.delivery?.bloodLossMl,
                    postDelivery = st.delivery != null,
                ),
            )
        } else {
            emptyList()
        }

        // Newborn danger signs from the delivery's birth weight + the latest
        // newborn postnatal round.
        val newborn = if (st.admission?.ward == "maternity") {
            val nbObs = st.postnatalObs.firstOrNull { it.subject == "newborn" }
            if (st.delivery == null && nbObs == null) {
                emptyList()
            } else {
                NewbornDangerSigns.evaluate(
                    NewbornDangerSigns.Input(
                        birthWeightG = st.delivery?.birthWeightG,
                        tempC = nbObs?.tempC,
                        respRate = nbObs?.respRate,
                        notFeeding = nbObs?.notFeeding == true || nbObs?.feedingWell == false,
                        convulsions = nbObs?.convulsions == true,
                        jaundice = nbObs?.jaundice == true,
                    ),
                )
            }
        } else {
            emptyList()
        }

        _state.update {
            it.copy(dangerFindings = findings, maternalAlerts = maternal, newbornFindings = newborn)
        }
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
