package com.karibuhealth.app.data.repository

import com.karibuhealth.app.data.local.db.dao.AdmissionNoteDao
import com.karibuhealth.app.data.local.db.dao.AdmissionCensusRow
import com.karibuhealth.app.data.local.db.dao.AdmissionDao
import com.karibuhealth.app.data.local.db.dao.AdmissionObservationDao
import com.karibuhealth.app.data.local.db.dao.DeliveryDao
import com.karibuhealth.app.data.local.db.dao.MedicationAdministrationDao
import com.karibuhealth.app.data.local.db.dao.MedicationOrderDao
import com.karibuhealth.app.data.local.db.dao.PostnatalObservationDao
import com.karibuhealth.app.data.local.db.dao.IvInfusionCheckDao
import com.karibuhealth.app.data.local.db.dao.IvInfusionDao
import com.karibuhealth.app.data.local.db.entity.AdmissionEntity
import com.karibuhealth.app.data.local.db.entity.AdmissionNoteEntity
import com.karibuhealth.app.data.local.db.entity.AdmissionObservationEntity
import com.karibuhealth.app.data.local.db.entity.DeliveryEntity
import com.karibuhealth.app.data.local.db.entity.MedicationAdministrationEntity
import com.karibuhealth.app.data.local.db.entity.MedicationOrderEntity
import com.karibuhealth.app.data.local.db.entity.PostnatalObservationEntity
import com.karibuhealth.app.data.local.db.entity.IvInfusionCheckEntity
import com.karibuhealth.app.data.local.db.entity.IvInfusionEntity
import com.karibuhealth.app.data.local.db.entity.SyncQueueEntry
import com.karibuhealth.app.data.remote.api.SupabaseApi
import com.karibuhealth.app.data.remote.dto.ActiveAdmissionsRequest
import com.karibuhealth.app.data.remote.dto.AddMedicationOrderRequest
import com.karibuhealth.app.data.remote.dto.AdmissionDeliveryRequest
import com.karibuhealth.app.data.remote.dto.AdmissionIvRequest
import com.karibuhealth.app.data.remote.dto.AdmissionMedicationsRequest
import com.karibuhealth.app.data.remote.dto.AdmissionPostnatalRequest
import com.karibuhealth.app.data.remote.dto.AdmissionNotesRequest
import com.karibuhealth.app.data.remote.dto.RecordAdmissionNoteRequest
import com.karibuhealth.app.data.remote.dto.DischargeAdmissionRequest
import com.karibuhealth.app.data.remote.dto.AdmissionObservationsRequest
import com.karibuhealth.app.data.remote.dto.AdmitPatientV2Request
import com.karibuhealth.app.data.remote.dto.RecordAdmissionObservationRequest
import com.karibuhealth.app.data.remote.dto.RecordDeliveryRequest
import com.karibuhealth.app.data.remote.dto.RecordMedicationAdminRequest
import com.karibuhealth.app.data.remote.dto.RecordIvInfusionCheckRequest
import com.karibuhealth.app.data.remote.dto.StartIvInfusionRequest
import com.karibuhealth.app.data.remote.dto.StopIvInfusionRequest
import com.karibuhealth.app.data.remote.dto.StopMedicationOrderRequest
import com.karibuhealth.app.data.sync.SyncQueueHelper
import com.karibuhealth.app.util.NetworkMonitor
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import java.time.Instant
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Offline-first inpatient ward (migration 053). Admissions and rounds
 * observations are written to Room first and queued through the outbox, so the
 * ward census works and the 2am no-signal labour admission succeeds. Mirrors the
 * [ReferralRepository] offline-write pattern.
 */
@Singleton
class InpatientRepository @Inject constructor(
    private val admissionDao: AdmissionDao,
    private val admissionObservationDao: AdmissionObservationDao,
    private val medicationOrderDao: MedicationOrderDao,
    private val medicationAdministrationDao: MedicationAdministrationDao,
    private val deliveryDao: DeliveryDao,
    private val postnatalObservationDao: PostnatalObservationDao,
    private val admissionNoteDao: AdmissionNoteDao,
    private val ivInfusionDao: IvInfusionDao,
    private val ivInfusionCheckDao: IvInfusionCheckDao,
    private val syncQueueHelper: SyncQueueHelper,
    private val supabaseApi: SupabaseApi,
    private val networkMonitor: NetworkMonitor,
    private val json: Json,
) {
    fun observeCensus(clinicId: String): Flow<List<AdmissionCensusRow>> =
        admissionDao.observeCensus(clinicId)

    fun observeAdmission(id: String): Flow<AdmissionEntity?> =
        admissionDao.observeById(id)

    fun observeObservations(admissionId: String): Flow<List<AdmissionObservationEntity>> =
        admissionObservationDao.observeForAdmission(admissionId)

    suspend fun refreshCensus(clinicId: String) {
        if (!networkMonitor.isOnline()) return
        withContext(Dispatchers.IO) {
            runCatching {
                val remote = supabaseApi.rpcActiveAdmissions(ActiveAdmissionsRequest(clinicId))
                admissionDao.upsertAll(
                    remote.map { dto ->
                        AdmissionEntity(
                            id = dto.id,
                            clinicId = clinicId,
                            patientId = dto.patientId,
                            patientName = dto.patientName,
                            dateOfBirth = dto.dateOfBirth,
                            sex = dto.sex,
                            ward = dto.ward,
                            bedLabel = dto.bedLabel,
                            admissionType = dto.admissionType,
                            chiefComplaint = dto.chiefComplaint,
                            weightKg = dto.weightKg,
                            admittedAt = dto.admittedAt,
                            status = "active",
                            isSynced = true,
                        )
                    },
                )
            }
        }
    }

    suspend fun refreshObservations(admissionId: String) {
        if (!networkMonitor.isOnline()) return
        withContext(Dispatchers.IO) {
            runCatching {
                val remote = supabaseApi.rpcAdmissionObservations(
                    AdmissionObservationsRequest(admissionId),
                )
                admissionObservationDao.upsertAll(
                    remote.map { dto ->
                        AdmissionObservationEntity(
                            id = dto.id,
                            admissionId = dto.admissionId,
                            clinicId = dto.clinicId,
                            patientId = dto.patientId,
                            observedAt = dto.observedAt,
                            tempC = dto.tempC,
                            pulseBpm = dto.pulseBpm,
                            respRate = dto.respRate,
                            bpSystolic = dto.bpSystolic,
                            bpDiastolic = dto.bpDiastolic,
                            spo2Pct = dto.spo2Pct,
                            avpu = dto.avpu,
                            imciNotFeeding = dto.imciNotFeeding,
                            imciVomitingEverything = dto.imciVomitingEverything,
                            imciConvulsions = dto.imciConvulsions,
                            imciLethargicUnconscious = dto.imciLethargicUnconscious,
                            note = dto.note,
                            isSynced = true,
                        )
                    },
                )
            }
        }
    }

    /** Admit a patient offline-first. Returns the local admission id immediately. */
    suspend fun admit(
        clinicId: String,
        patientId: String,
        patientName: String?,
        dateOfBirth: String?,
        sex: String?,
        ward: String,
        bedLabel: String?,
        chiefComplaint: String?,
        admissionType: String?,
        weightKg: Double?,
        maternity: MaternityAdmission? = null,
    ): String = withContext(Dispatchers.IO) {
        val admissionId = UUID.randomUUID().toString()
        val now = Instant.now().toString()
        val entity = AdmissionEntity(
            id = admissionId,
            clinicId = clinicId,
            patientId = patientId,
            patientName = patientName,
            dateOfBirth = dateOfBirth,
            sex = sex,
            ward = ward,
            bedLabel = bedLabel?.takeIf { it.isNotBlank() },
            admissionType = admissionType?.takeIf { it.isNotBlank() },
            chiefComplaint = chiefComplaint?.takeIf { it.isNotBlank() },
            weightKg = weightKg,
            gravida = maternity?.gravida,
            para = maternity?.para,
            edd = maternity?.edd,
            gestationWeeks = maternity?.gestationWeeks,
            hivStatus = maternity?.hivStatus,
            presentingStatus = maternity?.presentingStatus,
            admittedAt = now,
            status = "active",
            isSynced = false,
        )
        val request = AdmitPatientV2Request(
            patientId = patientId,
            ward = ward,
            bedLabel = entity.bedLabel,
            chiefComplaint = entity.chiefComplaint,
            admissionType = entity.admissionType,
            weightKg = weightKg,
            gravida = maternity?.gravida,
            para = maternity?.para,
            edd = maternity?.edd,
            gestationWeeks = maternity?.gestationWeeks,
            hivStatus = maternity?.hivStatus,
            presentingStatus = maternity?.presentingStatus,
        )
        val syncEntry = SyncQueueEntry(
            id = UUID.randomUUID().toString(),
            operationType = "rpc_admit_patient_v2",
            entityType = "admission",
            entityId = admissionId,
            payload = json.encodeToString(
                AdmitPatientV2Request.serializer(),
                request.copy(clientOpId = admissionId),
            ),
            status = "pending",
            attempts = 0,
            lastError = null,
            createdAt = System.currentTimeMillis(),
        )

        admissionDao.upsert(entity)
        pushOrQueue(syncEntry) {
            val resp = supabaseApi.rpcAdmitPatientV2(request.copy(clientOpId = admissionId))
            if (resp.isSuccessful) admissionDao.markSynced(admissionId) else throw IllegalStateException(
                "rpc_admit_patient_v2 HTTP ${resp.code()}",
            )
        }
        admissionId
    }

    /** Record a rounds observation offline-first. Returns the local observation id. */
    suspend fun recordObservation(
        clinicId: String,
        admissionId: String,
        patientId: String,
        observedAt: String,
        tempC: Double?,
        pulseBpm: Int?,
        respRate: Int?,
        bpSystolic: Int?,
        bpDiastolic: Int?,
        spo2Pct: Int?,
        avpu: String?,
        imciNotFeeding: Boolean,
        imciVomitingEverything: Boolean,
        imciConvulsions: Boolean,
        imciLethargicUnconscious: Boolean,
        note: String?,
    ): String = withContext(Dispatchers.IO) {
        val obsId = UUID.randomUUID().toString()
        val entity = AdmissionObservationEntity(
            id = obsId,
            admissionId = admissionId,
            clinicId = clinicId,
            patientId = patientId,
            observedAt = observedAt,
            tempC = tempC,
            pulseBpm = pulseBpm,
            respRate = respRate,
            bpSystolic = bpSystolic,
            bpDiastolic = bpDiastolic,
            spo2Pct = spo2Pct,
            avpu = avpu?.takeIf { it.isNotBlank() },
            imciNotFeeding = imciNotFeeding,
            imciVomitingEverything = imciVomitingEverything,
            imciConvulsions = imciConvulsions,
            imciLethargicUnconscious = imciLethargicUnconscious,
            note = note?.takeIf { it.isNotBlank() },
            isSynced = false,
        )
        val request = RecordAdmissionObservationRequest(
            id = obsId,
            admissionId = admissionId,
            observedAt = observedAt,
            tempC = tempC,
            pulseBpm = pulseBpm,
            respRate = respRate,
            bpSystolic = bpSystolic,
            bpDiastolic = bpDiastolic,
            spo2Pct = spo2Pct,
            avpu = entity.avpu,
            imciNotFeeding = imciNotFeeding,
            imciVomitingEverything = imciVomitingEverything,
            imciConvulsions = imciConvulsions,
            imciLethargicUnconscious = imciLethargicUnconscious,
            note = entity.note,
        )
        val syncEntry = SyncQueueEntry(
            id = UUID.randomUUID().toString(),
            operationType = "rpc_record_admission_observation",
            entityType = "admission_observation",
            entityId = obsId,
            payload = json.encodeToString(
                RecordAdmissionObservationRequest.serializer(),
                request.copy(clientOpId = obsId),
            ),
            status = "pending",
            attempts = 0,
            lastError = null,
            createdAt = System.currentTimeMillis(),
        )

        admissionObservationDao.upsert(entity)
        pushOrQueue(syncEntry) {
            val resp = supabaseApi.rpcRecordAdmissionObservation(request.copy(clientOpId = obsId))
            if (resp.isSuccessful) admissionObservationDao.markSynced(obsId) else throw IllegalStateException(
                "rpc_record_admission_observation HTTP ${resp.code()}",
            )
        }
        obsId
    }

    // ── Treatment chart (migration 054) ────────────────────────────────────

    fun observeMedicationOrders(admissionId: String): Flow<List<MedicationOrderEntity>> =
        medicationOrderDao.observeForAdmission(admissionId)

    fun observeMedicationAdmins(admissionId: String): Flow<List<MedicationAdministrationEntity>> =
        medicationAdministrationDao.observeForAdmission(admissionId)

    suspend fun refreshMedications(admissionId: String) {
        if (!networkMonitor.isOnline()) return
        withContext(Dispatchers.IO) {
            runCatching {
                val orders = supabaseApi.rpcAdmissionMedicationOrders(AdmissionMedicationsRequest(admissionId))
                medicationOrderDao.upsertAll(
                    orders.map {
                        MedicationOrderEntity(
                            id = it.id, admissionId = it.admissionId, clinicId = it.clinicId,
                            patientId = it.patientId, drugName = it.drugName, dose = it.dose,
                            route = it.route, frequency = it.frequency, instructions = it.instructions,
                            active = it.active, createdAt = it.createdAt, isSynced = true,
                        )
                    },
                )
            }
            runCatching {
                val admins = supabaseApi.rpcAdmissionMedicationAdmins(AdmissionMedicationsRequest(admissionId))
                medicationAdministrationDao.upsertAll(
                    admins.map {
                        MedicationAdministrationEntity(
                            id = it.id, orderId = it.orderId, admissionId = it.admissionId,
                            clinicId = it.clinicId, status = it.status, notGivenReason = it.notGivenReason,
                            administeredAt = it.administeredAt, scheduledFor = it.scheduledFor, isSynced = true,
                        )
                    },
                )
            }
        }
    }

    suspend fun addMedicationOrder(
        clinicId: String,
        admissionId: String,
        patientId: String,
        drugName: String,
        dose: String?,
        route: String?,
        frequency: String?,
        instructions: String?,
    ): String = withContext(Dispatchers.IO) {
        val orderId = UUID.randomUUID().toString()
        val entity = MedicationOrderEntity(
            id = orderId, admissionId = admissionId, clinicId = clinicId, patientId = patientId,
            drugName = drugName.trim(), dose = dose?.takeIf { it.isNotBlank() },
            route = route?.takeIf { it.isNotBlank() }, frequency = frequency?.takeIf { it.isNotBlank() },
            instructions = instructions?.takeIf { it.isNotBlank() }, active = true,
            createdAt = Instant.now().toString(), isSynced = false,
        )
        val request = AddMedicationOrderRequest(
            id = orderId, admissionId = admissionId, drugName = entity.drugName,
            dose = entity.dose, route = entity.route, frequency = entity.frequency,
            instructions = entity.instructions,
        )
        val syncEntry = SyncQueueEntry(
            id = UUID.randomUUID().toString(),
            operationType = "rpc_add_medication_order",
            entityType = "medication_order",
            entityId = orderId,
            payload = json.encodeToString(AddMedicationOrderRequest.serializer(), request.copy(clientOpId = orderId)),
            status = "pending", attempts = 0, lastError = null, createdAt = System.currentTimeMillis(),
        )
        medicationOrderDao.upsert(entity)
        pushOrQueue(syncEntry) {
            val resp = supabaseApi.rpcAddMedicationOrder(request.copy(clientOpId = orderId))
            if (resp.isSuccessful) medicationOrderDao.markSynced(orderId)
            else throw IllegalStateException("rpc_add_medication_order HTTP ${resp.code()}")
        }
        orderId
    }

    suspend fun stopMedicationOrder(orderId: String) = withContext(Dispatchers.IO) {
        medicationOrderDao.deactivateLocal(orderId)
        val request = StopMedicationOrderRequest(orderId = orderId)
        val syncEntry = SyncQueueEntry(
            id = UUID.randomUUID().toString(),
            operationType = "rpc_stop_medication_order",
            entityType = "medication_order",
            entityId = orderId,
            payload = json.encodeToString(StopMedicationOrderRequest.serializer(), request.copy(clientOpId = orderId)),
            status = "pending", attempts = 0, lastError = null, createdAt = System.currentTimeMillis(),
        )
        pushOrQueue(syncEntry) {
            val resp = supabaseApi.rpcStopMedicationOrder(request.copy(clientOpId = orderId))
            if (resp.isSuccessful) medicationOrderDao.markSynced(orderId)
            else throw IllegalStateException("rpc_stop_medication_order HTTP ${resp.code()}")
        }
        Unit
    }

    /** Record a drug-round entry: Given, or Not-given with an honest reason. */
    suspend fun recordMedicationAdmin(
        clinicId: String,
        admissionId: String,
        orderId: String,
        given: Boolean,
        notGivenReason: String?,
        scheduledFor: String? = null,
    ): String = withContext(Dispatchers.IO) {
        val adminId = UUID.randomUUID().toString()
        val now = Instant.now().toString()
        val status = if (given) "given" else "not_given"
        val entity = MedicationAdministrationEntity(
            id = adminId, orderId = orderId, admissionId = admissionId, clinicId = clinicId,
            status = status, notGivenReason = if (given) null else notGivenReason?.takeIf { it.isNotBlank() },
            administeredAt = now, scheduledFor = scheduledFor, isSynced = false,
        )
        val request = RecordMedicationAdminRequest(
            id = adminId, orderId = orderId, status = status,
            notGivenReason = entity.notGivenReason, administeredAt = now, scheduledFor = scheduledFor,
        )
        val syncEntry = SyncQueueEntry(
            id = UUID.randomUUID().toString(),
            operationType = "rpc_record_medication_admin",
            entityType = "medication_administration",
            entityId = adminId,
            payload = json.encodeToString(RecordMedicationAdminRequest.serializer(), request.copy(clientOpId = adminId)),
            status = "pending", attempts = 0, lastError = null, createdAt = System.currentTimeMillis(),
        )
        medicationAdministrationDao.upsert(entity)
        pushOrQueue(syncEntry) {
            val resp = supabaseApi.rpcRecordMedicationAdmin(request.copy(clientOpId = adminId))
            if (resp.isSuccessful) medicationAdministrationDao.markSynced(adminId)
            else throw IllegalStateException("rpc_record_medication_admin HTTP ${resp.code()}")
        }
        adminId
    }

    // ── Discharge (migration 055) ──────────────────────────────────────────

    /** Discharge an admission offline-first. It leaves the active census immediately. */
    suspend fun dischargeAdmission(
        admissionId: String,
        outcome: String,
        disposition: String?,
        notes: String?,
    ) = withContext(Dispatchers.IO) {
        val status = if (disposition == "referred") "transferred" else "discharged"
        admissionDao.dischargeLocal(
            id = admissionId, status = status, outcome = outcome,
            disposition = disposition, notes = notes?.takeIf { it.isNotBlank() },
        )
        val request = DischargeAdmissionRequest(
            admissionId = admissionId, outcome = outcome,
            disposition = disposition, notes = notes?.takeIf { it.isNotBlank() },
        )
        val syncEntry = SyncQueueEntry(
            id = UUID.randomUUID().toString(),
            operationType = "rpc_discharge_admission",
            entityType = "admission",
            entityId = admissionId,
            payload = json.encodeToString(DischargeAdmissionRequest.serializer(), request.copy(clientOpId = admissionId)),
            status = "pending", attempts = 0, lastError = null, createdAt = System.currentTimeMillis(),
        )
        pushOrQueue(syncEntry) {
            val resp = supabaseApi.rpcDischargeAdmission(request.copy(clientOpId = admissionId))
            if (resp.isSuccessful) admissionDao.markSynced(admissionId)
            else throw IllegalStateException("rpc_discharge_admission HTTP ${resp.code()}")
        }
        Unit
    }

    // ── Maternity delivery (migration 056) ─────────────────────────────────

    fun observeDelivery(admissionId: String): Flow<DeliveryEntity?> =
        deliveryDao.observeForAdmission(admissionId)

    suspend fun refreshDelivery(admissionId: String) {
        if (!networkMonitor.isOnline()) return
        withContext(Dispatchers.IO) {
            runCatching {
                supabaseApi.rpcAdmissionDelivery(AdmissionDeliveryRequest(admissionId)).firstOrNull()?.let { d ->
                    deliveryDao.upsert(
                        DeliveryEntity(
                            id = d.id, admissionId = d.admissionId, clinicId = d.clinicId,
                            patientId = d.patientId, deliveredAt = d.deliveredAt, mode = d.mode,
                            oxytocinGiven = d.oxytocinGiven, bloodLossMl = d.bloodLossMl,
                            placentaComplete = d.placentaComplete, outcome = d.outcome, babySex = d.babySex,
                            birthWeightG = d.birthWeightG, apgar1 = d.apgar1, apgar5 = d.apgar5,
                            resuscitationDone = d.resuscitationDone, vitaminKGiven = d.vitaminKGiven,
                            earlyBreastfeeding = d.earlyBreastfeeding, notes = d.notes, isSynced = true,
                        ),
                    )
                }
            }
        }
    }

    suspend fun recordDelivery(
        clinicId: String,
        admissionId: String,
        patientId: String,
        existingId: String?,
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
    ): String = withContext(Dispatchers.IO) {
        val id = existingId ?: UUID.randomUUID().toString()
        val now = Instant.now().toString()
        val entity = DeliveryEntity(
            id = id, admissionId = admissionId, clinicId = clinicId, patientId = patientId,
            deliveredAt = now, mode = mode, oxytocinGiven = oxytocinGiven, bloodLossMl = bloodLossMl,
            placentaComplete = placentaComplete, outcome = outcome, babySex = babySex,
            birthWeightG = birthWeightG, apgar1 = apgar1, apgar5 = apgar5,
            resuscitationDone = resuscitationDone, vitaminKGiven = vitaminKGiven,
            earlyBreastfeeding = earlyBreastfeeding, notes = notes?.takeIf { it.isNotBlank() }, isSynced = false,
        )
        val request = RecordDeliveryRequest(
            id = id, admissionId = admissionId, mode = mode, deliveredAt = now,
            oxytocinGiven = oxytocinGiven, bloodLossMl = bloodLossMl, placentaComplete = placentaComplete,
            outcome = outcome, babySex = babySex, birthWeightG = birthWeightG, apgar1 = apgar1, apgar5 = apgar5,
            resuscitationDone = resuscitationDone, vitaminKGiven = vitaminKGiven,
            earlyBreastfeeding = earlyBreastfeeding, notes = entity.notes,
        )
        val syncEntry = SyncQueueEntry(
            id = UUID.randomUUID().toString(),
            operationType = "rpc_record_delivery",
            entityType = "delivery",
            entityId = id,
            payload = json.encodeToString(RecordDeliveryRequest.serializer(), request.copy(clientOpId = id)),
            status = "pending", attempts = 0, lastError = null, createdAt = System.currentTimeMillis(),
        )
        deliveryDao.upsert(entity)
        pushOrQueue(syncEntry) {
            val resp = supabaseApi.rpcRecordDelivery(request.copy(clientOpId = id))
            if (resp.isSuccessful) deliveryDao.markSynced(id)
            else throw IllegalStateException("rpc_record_delivery HTTP ${resp.code()}")
        }
        id
    }

    // ── Postnatal observations (migration 057) ─────────────────────────────

    fun observePostnatal(admissionId: String): Flow<List<PostnatalObservationEntity>> =
        postnatalObservationDao.observeForAdmission(admissionId)

    suspend fun refreshPostnatal(admissionId: String) {
        if (!networkMonitor.isOnline()) return
        withContext(Dispatchers.IO) {
            runCatching {
                val rows = supabaseApi.rpcAdmissionPostnatalObs(AdmissionPostnatalRequest(admissionId))
                postnatalObservationDao.upsertAll(
                    rows.map {
                        PostnatalObservationEntity(
                            id = it.id, admissionId = it.admissionId, clinicId = it.clinicId,
                            patientId = it.patientId, subject = it.subject, observedAt = it.observedAt,
                            tempC = it.tempC, pulseBpm = it.pulseBpm, respRate = it.respRate,
                            bpSystolic = it.bpSystolic, bpDiastolic = it.bpDiastolic, bleeding = it.bleeding,
                            fundusFirm = it.fundusFirm, feedingWell = it.feedingWell, notFeeding = it.notFeeding,
                            convulsions = it.convulsions, jaundice = it.jaundice, note = it.note, isSynced = true,
                        )
                    },
                )
            }
        }
    }

    suspend fun recordPostnatalObs(
        clinicId: String,
        admissionId: String,
        patientId: String,
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
    ): String = withContext(Dispatchers.IO) {
        val id = UUID.randomUUID().toString()
        val now = Instant.now().toString()
        val entity = PostnatalObservationEntity(
            id = id, admissionId = admissionId, clinicId = clinicId, patientId = patientId,
            subject = subject, observedAt = now, tempC = tempC, pulseBpm = pulseBpm, respRate = respRate,
            bpSystolic = bpSystolic, bpDiastolic = bpDiastolic, bleeding = bleeding?.takeIf { it.isNotBlank() },
            fundusFirm = fundusFirm, feedingWell = feedingWell, notFeeding = notFeeding,
            convulsions = convulsions, jaundice = jaundice, note = note?.takeIf { it.isNotBlank() }, isSynced = false,
        )
        val request = RecordPostnatalObsRequest(
            id = id, admissionId = admissionId, subject = subject, observedAt = now,
            tempC = tempC, pulseBpm = pulseBpm, respRate = respRate, bpSystolic = bpSystolic,
            bpDiastolic = bpDiastolic, bleeding = entity.bleeding, fundusFirm = fundusFirm,
            feedingWell = feedingWell, notFeeding = notFeeding, convulsions = convulsions,
            jaundice = jaundice, note = entity.note,
        )
        val syncEntry = SyncQueueEntry(
            id = UUID.randomUUID().toString(),
            operationType = "rpc_record_postnatal_obs",
            entityType = "postnatal_observation",
            entityId = id,
            payload = json.encodeToString(RecordPostnatalObsRequest.serializer(), request.copy(clientOpId = id)),
            status = "pending", attempts = 0, lastError = null, createdAt = System.currentTimeMillis(),
        )
        postnatalObservationDao.upsert(entity)
        pushOrQueue(syncEntry) {
            val resp = supabaseApi.rpcRecordPostnatalObs(request.copy(clientOpId = id))
            if (resp.isSuccessful) postnatalObservationDao.markSynced(id)
            else throw IllegalStateException("rpc_record_postnatal_obs HTTP ${resp.code()}")
        }
        id
    }

    // ── Progress notes (migration 058) ─────────────────────────────────────

    fun observeNotes(admissionId: String): Flow<List<AdmissionNoteEntity>> =
        admissionNoteDao.observeForAdmission(admissionId)

    suspend fun refreshNotes(admissionId: String) {
        if (!networkMonitor.isOnline()) return
        withContext(Dispatchers.IO) {
            runCatching {
                val rows = supabaseApi.rpcAdmissionNotes(AdmissionNotesRequest(admissionId))
                admissionNoteDao.upsertAll(
                    rows.map {
                        AdmissionNoteEntity(
                            id = it.id, admissionId = it.admissionId, clinicId = "", patientId = "",
                            note = it.note, authorName = it.authorName, createdAt = it.createdAt, isSynced = true,
                        )
                    },
                )
            }
        }
    }

    suspend fun recordNote(
        clinicId: String,
        admissionId: String,
        patientId: String,
        note: String,
    ): String = withContext(Dispatchers.IO) {
        val id = UUID.randomUUID().toString()
        val now = Instant.now().toString()
        val entity = AdmissionNoteEntity(
            id = id, admissionId = admissionId, clinicId = clinicId, patientId = patientId,
            note = note.trim(), authorName = null, createdAt = now, isSynced = false,
        )
        val request = RecordAdmissionNoteRequest(id = id, admissionId = admissionId, note = note.trim(), createdAt = now)
        val syncEntry = SyncQueueEntry(
            id = UUID.randomUUID().toString(),
            operationType = "rpc_record_admission_note",
            entityType = "admission_note",
            entityId = id,
            payload = json.encodeToString(RecordAdmissionNoteRequest.serializer(), request.copy(clientOpId = id)),
            status = "pending", attempts = 0, lastError = null, createdAt = System.currentTimeMillis(),
        )
        admissionNoteDao.upsert(entity)
        pushOrQueue(syncEntry) {
            val resp = supabaseApi.rpcRecordAdmissionNote(request.copy(clientOpId = id))
            if (resp.isSuccessful) admissionNoteDao.markSynced(id)
            else throw IllegalStateException("rpc_record_admission_note HTTP ${resp.code()}")
        }
        id
    }

    // ── IV drip monitoring (migration 074) ─────────────────────────────────

    fun observeIvInfusions(admissionId: String): Flow<List<IvInfusionEntity>> =
        ivInfusionDao.observeForAdmission(admissionId)

    fun observeIvInfusionChecks(admissionId: String): Flow<List<IvInfusionCheckEntity>> =
        ivInfusionCheckDao.observeForAdmission(admissionId)

    suspend fun refreshIvInfusions(admissionId: String) {
        if (!networkMonitor.isOnline()) return
        withContext(Dispatchers.IO) {
            runCatching {
                val remote = supabaseApi.rpcAdmissionIvInfusions(AdmissionIvRequest(admissionId))
                ivInfusionDao.upsertAll(
                    remote.map {
                        IvInfusionEntity(
                            id = it.id, admissionId = it.admissionId, clinicId = it.clinicId,
                            patientId = it.patientId, fluidType = it.fluidType, additive = it.additive,
                            volumeMl = it.volumeMl, rateMlHr = it.rateMlHr, dropsPerMin = it.dropsPerMin,
                            startedAt = it.startedAt, stoppedAt = it.stoppedAt, active = it.active,
                            siteLocation = it.siteLocation, notes = it.notes, isSynced = true,
                        )
                    },
                )
            }
            runCatching {
                val checks = supabaseApi.rpcAdmissionIvInfusionChecks(AdmissionIvRequest(admissionId))
                ivInfusionCheckDao.upsertAll(
                    checks.map {
                        IvInfusionCheckEntity(
                            id = it.id, infusionId = it.infusionId, admissionId = it.admissionId,
                            clinicId = it.clinicId, checkedAt = it.checkedAt, dripRunning = it.dripRunning,
                            siteOk = it.siteOk, note = it.note, isSynced = true,
                        )
                    },
                )
            }
        }
    }

    suspend fun startIvInfusion(
        clinicId: String,
        admissionId: String,
        patientId: String,
        fluidType: String,
        volumeMl: Int,
        additive: String?,
        rateMlHr: Int?,
        dropsPerMin: Int?,
        siteLocation: String?,
        notes: String?,
    ): String = withContext(Dispatchers.IO) {
        val id = UUID.randomUUID().toString()
        val now = Instant.now().toString()
        val entity = IvInfusionEntity(
            id = id, admissionId = admissionId, clinicId = clinicId, patientId = patientId,
            fluidType = fluidType, additive = additive?.takeIf { it.isNotBlank() && it != "none" },
            volumeMl = volumeMl, rateMlHr = rateMlHr, dropsPerMin = dropsPerMin,
            startedAt = now, active = true, siteLocation = siteLocation, notes = notes, isSynced = false,
        )
        val request = StartIvInfusionRequest(
            id = id, admissionId = admissionId, fluidType = fluidType, volumeMl = volumeMl,
            additive = entity.additive, rateMlHr = rateMlHr, dropsPerMin = dropsPerMin,
            siteLocation = siteLocation, notes = notes,
        )
        val syncEntry = SyncQueueEntry(
            id = UUID.randomUUID().toString(),
            operationType = "rpc_start_iv_infusion",
            entityType = "iv_infusion",
            entityId = id,
            payload = json.encodeToString(StartIvInfusionRequest.serializer(), request.copy(clientOpId = id)),
            status = "pending", attempts = 0, lastError = null, createdAt = System.currentTimeMillis(),
        )
        ivInfusionDao.upsert(entity)
        pushOrQueue(syncEntry) {
            val resp = supabaseApi.rpcStartIvInfusion(request.copy(clientOpId = id))
            if (resp.isSuccessful) ivInfusionDao.markSynced(id)
            else throw IllegalStateException("rpc_start_iv_infusion HTTP ${resp.code()}")
        }
        id
    }

    suspend fun recordIvInfusionCheck(
        clinicId: String,
        admissionId: String,
        infusionId: String,
        dripRunning: Boolean,
        siteOk: Boolean,
        note: String?,
    ): String = withContext(Dispatchers.IO) {
        val id = UUID.randomUUID().toString()
        val now = Instant.now().toString()
        val entity = IvInfusionCheckEntity(
            id = id, infusionId = infusionId, admissionId = admissionId, clinicId = clinicId,
            checkedAt = now, dripRunning = dripRunning, siteOk = siteOk, note = note, isSynced = false,
        )
        val request = RecordIvInfusionCheckRequest(
            id = id, infusionId = infusionId, dripRunning = dripRunning, siteOk = siteOk,
            note = note, checkedAt = now,
        )
        val syncEntry = SyncQueueEntry(
            id = UUID.randomUUID().toString(),
            operationType = "rpc_record_iv_infusion_check",
            entityType = "iv_infusion_check",
            entityId = id,
            payload = json.encodeToString(RecordIvInfusionCheckRequest.serializer(), request.copy(clientOpId = id)),
            status = "pending", attempts = 0, lastError = null, createdAt = System.currentTimeMillis(),
        )
        ivInfusionCheckDao.upsert(entity)
        pushOrQueue(syncEntry) {
            val resp = supabaseApi.rpcRecordIvInfusionCheck(request.copy(clientOpId = id))
            if (resp.isSuccessful) ivInfusionCheckDao.markSynced(id)
            else throw IllegalStateException("rpc_record_iv_infusion_check HTTP ${resp.code()}")
        }
        id
    }

    suspend fun stopIvInfusion(infusionId: String) = withContext(Dispatchers.IO) {
        val now = Instant.now().toString()
        ivInfusionDao.deactivateLocal(infusionId, now)
        val request = StopIvInfusionRequest(infusionId = infusionId)
        val syncEntry = SyncQueueEntry(
            id = UUID.randomUUID().toString(),
            operationType = "rpc_stop_iv_infusion",
            entityType = "iv_infusion",
            entityId = infusionId,
            payload = json.encodeToString(StopIvInfusionRequest.serializer(), request.copy(clientOpId = infusionId)),
            status = "pending", attempts = 0, lastError = null, createdAt = System.currentTimeMillis(),
        )
        pushOrQueue(syncEntry) {
            val resp = supabaseApi.rpcStopIvInfusion(request.copy(clientOpId = infusionId))
            if (resp.isSuccessful) ivInfusionDao.markSynced(infusionId)
            else throw IllegalStateException("rpc_stop_iv_infusion HTTP ${resp.code()}")
        }
        Unit
    }

    /** Try the RPC immediately when online; otherwise (or on failure) enqueue the outbox row. */
    private suspend fun pushOrQueue(syncEntry: SyncQueueEntry, push: suspend () -> Unit) {
        if (networkMonitor.isOnline()) {
            val ok = runCatching { push() }.isSuccess
            if (!ok) syncQueueHelper.enqueue(syncEntry)
        } else {
            syncQueueHelper.enqueue(syncEntry)
        }
    }

    /** Minimal maternity fields captured at admission; never gate the write. */
    data class MaternityAdmission(
        val gravida: Int? = null,
        val para: Int? = null,
        val edd: String? = null,
        val gestationWeeks: Int? = null,
        val hivStatus: String? = null,
        val presentingStatus: String? = null,
    )
}
