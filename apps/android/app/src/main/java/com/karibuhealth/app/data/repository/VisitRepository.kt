package com.karibuhealth.app.data.repository

import androidx.room.withTransaction
import com.karibuhealth.app.data.local.db.KaribuDatabase
import com.karibuhealth.app.data.local.db.converter.*
import com.karibuhealth.app.data.local.db.dao.SyncQueueDao
import com.karibuhealth.app.data.local.db.dao.VisitDao
import com.karibuhealth.app.data.local.db.entity.SyncQueueEntry
import com.karibuhealth.app.data.local.db.entity.VisitWithPatient
import com.karibuhealth.app.data.remote.api.SupabaseApi
import com.karibuhealth.app.data.remote.dto.MarkDocumentationCompleteDto
import com.karibuhealth.app.data.remote.dto.CompletePharmacyDispenseRequest
import com.karibuhealth.app.data.remote.dto.PrescriptionLineRpc
import com.karibuhealth.app.data.remote.dto.medicationsSummary
import com.karibuhealth.app.data.remote.dto.RecordDispenseRequest
import com.karibuhealth.app.data.remote.dto.RecordLabResultRequest
import com.karibuhealth.app.data.remote.dto.RecordLabTestResultRequest
import com.karibuhealth.app.data.remote.dto.SendPharmacyBackRequest
import com.karibuhealth.app.data.remote.dto.SetDispensingStatusRequest
import com.karibuhealth.app.data.remote.dto.StartLabRequest
import com.karibuhealth.app.data.remote.dto.StartLabTestRequest
import com.karibuhealth.app.data.remote.dto.StartPharmacyDispenseRequest
import com.karibuhealth.app.data.remote.dto.ActivateClinicalProtocolRequest
import com.karibuhealth.app.data.remote.dto.AdmitPatientRequest
import com.karibuhealth.app.data.remote.dto.GetOpdPatientsTodayRequest
import com.karibuhealth.app.data.remote.dto.SubmitLabOrderSyncPayload
import com.karibuhealth.app.data.remote.dto.SubmitPharmacyOrderRequest
import com.karibuhealth.app.data.remote.dto.VisitCreateRpcDto
import com.karibuhealth.app.data.sync.SyncQueueHelper
import com.karibuhealth.app.data.sync.VisitMerge
import com.karibuhealth.app.domain.LabQueue
import com.karibuhealth.app.domain.model.Department
import com.karibuhealth.app.domain.model.OpdPatientFilter
import com.karibuhealth.app.domain.model.OpdPatientRow
import com.karibuhealth.app.domain.model.QueueStatus
import com.karibuhealth.app.domain.model.ReviewStatus
import com.karibuhealth.app.domain.model.Visit
import com.karibuhealth.app.domain.model.VisitPriority
import com.karibuhealth.app.domain.model.VisitStatus
import com.karibuhealth.app.domain.model.aggregateDispensingStatus
import com.karibuhealth.app.util.NetworkMonitor
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import java.time.Instant
import java.time.LocalDate
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class VisitRepository @Inject constructor(
    private val database: KaribuDatabase,
    private val visitDao: VisitDao,
    private val syncQueueDao: SyncQueueDao,
    private val syncQueueHelper: SyncQueueHelper,
    private val supabaseApi: SupabaseApi,
    private val networkMonitor: NetworkMonitor,
    private val prescriptionOrderRepository: PrescriptionOrderRepository,
    private val json: Json,
) {
    private val opdPatientsCache = MutableStateFlow<List<OpdPatientRow>>(emptyList())

    /**
     * Flip the local visit row back to synced ONLY when no active outbox
     * entry still references it. While any sibling op is queued/failed the
     * row must stay dirty (is_synced=false) so [VisitMerge.mergeRemote]
     * protects the local clinical fields from being clobbered by a pull.
     */
    private suspend fun markVisitSyncedIfQuiet(visitId: String) {
        if (syncQueueDao.countActiveForEntity(visitId) == 0) {
            visitDao.updateSyncState(visitId, true)
        }
    }

    fun getOpenEncountersToday(clinicId: String): Flow<List<VisitWithPatient>> {
        val today = LocalDate.now().toString()
        return visitDao.getOpenEncountersToday(clinicId, today)
    }

    suspend fun getLatestVisitForPatientToday(patientId: String): Visit? {
        val today = LocalDate.now().toString()
        return visitDao.getLatestVisitForPatientToday(patientId, today)?.toDomain()
    }

    fun getTodayQueue(clinicId: String): Flow<List<VisitWithPatient>> {
        val today = LocalDate.now().toString()
        return visitDao.getTodayQueue(clinicId, today)
    }

    fun getRecentByDoctor(doctorId: String, limit: Int = 20): Flow<List<VisitWithPatient>> =
        visitDao.getRecentByDoctor(doctorId, limit)

    // Clinician home (CO / midwife / nurse with self-triage). All four flows are
    // backed by Room, so the home renders instantly from cache; remote sync
    // refreshes are handled by SyncEngine + PullSyncManager.
    fun getTodayClinicianQueue(clinicId: String, clinicianId: String): Flow<List<VisitWithPatient>> {
        val today = LocalDate.now().toString()
        return visitDao.getTodayClinicianQueue(clinicId, today, clinicianId)
    }

    fun getMyPendingDictations(clinicianId: String): Flow<List<VisitWithPatient>> {
        val today = LocalDate.now().toString()
        return visitDao.getMyPendingDictations(clinicianId, today)
    }

    fun getMyVisitsToReview(clinicianId: String): Flow<List<VisitWithPatient>> {
        val today = LocalDate.now().toString()
        return visitDao.getMyVisitsToReview(clinicianId, today)
    }

    fun getMyDoneTodayCount(clinicianId: String): Flow<Int> {
        val today = LocalDate.now().toString()
        return visitDao.getMyDoneTodayCount(clinicianId, today)
    }

    /**
     * Patient-centric OPD list for today's clinic — one row per patient,
     * using the most recently checked-in visit when multiple exist.
     */
    fun getOpdPatientsToday(clinicId: String): Flow<List<OpdPatientRow>> = opdPatientsCache

    private suspend fun loadOpdPatientsLocal(clinicId: String): List<OpdPatientRow> {
        val today = LocalDate.now().toString()
        val rows = visitDao.getTodayVisitsWithPatients(clinicId, today).first()
        return rows
            .filter { it.patient != null } // drop orphaned visits (patient not synced)
            .groupBy { it.patient!!.id }
            .mapNotNull { (_, visits) ->
                visits.maxByOrNull { it.visit.checkedInAt ?: "" }
            }
            .mapNotNull { OpdPatientRow.from(it) }
            .sortedByDescending { it.checkedInAt }
    }

    suspend fun admitPatient(
        patientId: String,
        wardLabel: String?,
        chiefComplaint: String?,
    ): String = withContext(Dispatchers.IO) {
        supabaseApi.rpcAdmitPatient(
            AdmitPatientRequest(
                patientId = patientId,
                wardLabel = wardLabel?.takeIf { it.isNotBlank() },
                chiefComplaint = chiefComplaint?.takeIf { it.isNotBlank() },
                clientOpId = UUID.randomUUID().toString(),
            ),
        )
    }

    suspend fun activateClinicalProtocol(
        patientId: String,
        protocolSlug: String,
        visitId: String? = null,
    ): String = withContext(Dispatchers.IO) {
        supabaseApi.rpcActivateClinicalProtocol(
            ActivateClinicalProtocolRequest(
                patientId = patientId,
                protocolSlug = protocolSlug,
                visitId = visitId,
                clientOpId = UUID.randomUUID().toString(),
            ),
        )
    }

    suspend fun refreshOpdPatientsToday(clinicId: String) {
        withContext(Dispatchers.IO) {
            if (!networkMonitor.isOnline()) {
                opdPatientsCache.value = loadOpdPatientsLocal(clinicId)
                return@withContext
            }
            try {
                val remote = supabaseApi.rpcGetOpdPatientsToday(
                    GetOpdPatientsTodayRequest(clinicId = clinicId),
                )
                opdPatientsCache.value = remote.map { OpdPatientRow.from(it) }
            } catch (_: Exception) {
                opdPatientsCache.value = loadOpdPatientsLocal(clinicId)
            }
        }
    }

    suspend fun getTodayVisitIds(clinicId: String): List<String> {
        val today = LocalDate.now().toString()
        return withContext(Dispatchers.IO) {
            visitDao.getTodayVisitIds(clinicId, today)
        }
    }

    // One-tap "Start visit" for a clinician who self-triages. Optimistic local
    // update (so the UI reflects the change instantly even offline) plus a
    // queued sync entry so the server-side state machine catches up when online.
    suspend fun startVisitSelfTriage(visitId: String, clinicianId: String) {
        withContext(Dispatchers.IO) {
            val now = Instant.now().toString()
            visitDao.updateQueueStatus(visitId, QueueStatus.with_doctor.name, now)

            val syncEntry = SyncQueueEntry(
                id = UUID.randomUUID().toString(),
                operationType = "queue_op",
                entityType = "visits",
                entityId = visitId,
                payload = """{"rpc":"start_visit_self_triage","params":{"p_visit_id":"$visitId","p_clinician_id":"$clinicianId"}}""",
                status = "pending",
                attempts = 0,
                createdAt = System.currentTimeMillis(),
            )
            syncQueueHelper.enqueue(syncEntry)
        }
    }

    fun getVisitById(id: String): Flow<Visit?> =
        visitDao.getById(id).map { it?.toDomain() }

    suspend fun getVisitByIdOnce(id: String): Visit? =
        withContext(Dispatchers.IO) {
            visitDao.getByIdOnce(id)?.toDomain()
        }

    fun getVisitWithDetails(id: String) = visitDao.getWithDetails(id)

    /**
     * Create a visit. Direct-write via SECURITY DEFINER RPC `rpc_create_visit`
     * when online; queue on failure / offline. Returns (visit, syncEntryId?)
     * — null syncEntryId means the row already landed in Supabase.
     *
     * `patientSyncEntryId` linearizes the patient → visit dependency in the
     * sync queue (only used when this visit ends up queued). `department`
     * defaults to 'opd' to match visits.department (migration 024).
     */
    suspend fun createVisit(
        clinicId: String,
        patientId: String,
        doctorId: String?,
        chiefComplaint: String? = null,
        department: Department = Department.opd,
        patientSyncEntryId: String? = null,
    ): Pair<Visit, String?> = withContext(Dispatchers.IO) {
        val now = Instant.now().toString()
        val today = LocalDate.now().toString()

        val visit = Visit(
            id = UUID.randomUUID().toString(),
            clinicId = clinicId,
            patientId = patientId,
            doctorId = doctorId,
            nurseId = null,
            status = VisitStatus.pending,
            queueStatus = QueueStatus.waiting,
            queuePosition = null,
            priority = VisitPriority.normal,
            chiefComplaint = chiefComplaint,
            checkedInAt = now,
            department = department,
            reviewStatus = ReviewStatus.pending,
            reviewedBy = null,
            reviewedAt = null,
            diagnosis = null,
            medications = null,
            followUpInstructions = null,
            testsOrdered = null,
            visitDate = today,
            createdAt = now,
            updatedAt = now,
            finalizedAt = null,
            errorMessage = null,
            errorAt = null,
            documentationComplete = false,
            documentationCompletedAt = null,
        )

        val rpcDto = visit.toCreateRpcDto()
        visitDao.upsert(visit.toEntity(isSynced = false))

        // Direct-write first when online + no upstream queue dependency. If
        // patientSyncEntryId is non-null, the patient is still queued, so we
        // must queue too — otherwise the FK on the server-side INSERT would
        // fail. Same logic for any other chain prerequisite.
        if (networkMonitor.isOnline() && patientSyncEntryId == null) {
            try {
                val response = supabaseApi.rpcCreateVisit(rpcDto)
                if (response.isSuccessful) {
                    visitDao.updateSyncState(visit.id, true)
                    return@withContext visit to null
                }
            } catch (_: Exception) {
                // Fall through to queue
            }
        }

        val syncEntry = SyncQueueEntry(
            id = UUID.randomUUID().toString(),
            operationType = "create_visit",
            entityType = "visits",
            entityId = visit.id,
            payload = json.encodeToString(VisitCreateRpcDto.serializer(), rpcDto),
            status = "pending",
            attempts = 0,
            createdAt = System.currentTimeMillis(),
            dependsOn = patientSyncEntryId,
        )
        // enqueue() may dedup onto an existing pending row — always thread
        // the SURVIVING id so dependents don't point at a row that was
        // never inserted (dangling dependsOn = stuck forever).
        val queuedId = syncQueueHelper.enqueue(syncEntry)
        visit to queuedId
    }

    /**
     * Clinician sends medications to pharmacy while the note may remain open.
     */
    suspend fun submitPharmacyOrder(
        visitId: String,
        medications: String,
        staffId: String,
        lines: List<PrescriptionLineRpc>? = null,
    ): String? = withContext(Dispatchers.IO) {
        val structured = lines?.takeIf { it.isNotEmpty() }
        val trimmed = medications.trim()
        val summary = trimmed.ifBlank { structured?.medicationsSummary().orEmpty() }
        if (summary.isEmpty()) return@withContext null

        val visit = visitDao.getByIdOnce(visitId)
        if (structured != null && visit != null) {
            prescriptionOrderRepository.cacheSubmittedLines(
                visitId = visitId,
                clinicId = visit.clinicId,
                patientId = visit.patientId,
                lines = structured,
            )
        }

        val now = Instant.now().toString()
        visitDao.updatePharmacyOrderSubmitted(
            id = visitId,
            medications = summary,
            submittedAt = now,
            submittedBy = staffId,
            updatedAt = now,
        )
        visitDao.updateSyncState(visitId, false)

        val syncEntryId = UUID.randomUUID().toString()
        val rpcBody = SubmitPharmacyOrderRequest(
            visitId = visitId,
            medications = summary,
            lines = structured,
            clientOpId = syncEntryId,
        )

        if (networkMonitor.isOnline()) {
            try {
                val response = supabaseApi.rpcSubmitPharmacyOrder(rpcBody)
                if (response.isSuccessful) {
                    prescriptionOrderRepository.replaceLocalAfterSubmit(visitId)
                    markVisitSyncedIfQuiet(visitId)
                    return@withContext null
                }
            } catch (_: Exception) {
                // Fall through to queue
            }
        }

        val syncEntry = SyncQueueEntry(
            id = syncEntryId,
            operationType = "rpc_submit_pharmacy_order",
            entityType = "visits",
            entityId = visitId,
            payload = json.encodeToString(SubmitPharmacyOrderRequest.serializer(), rpcBody),
            status = "pending",
            attempts = 0,
            createdAt = System.currentTimeMillis(),
        )
        syncQueueHelper.enqueue(syncEntry)
    }

    suspend fun startLab(visitId: String): String? = enqueueVisitRpc(
        visitId = visitId,
        operationType = "rpc_start_lab",
        payload = json.encodeToString(
            StartLabRequest.serializer(),
            StartLabRequest(visitId = visitId),
        ),
        localMutator = {
            visitDao.updateLabState(
                id = visitId,
                labStatus = "running",
                labResults = null,
                labAbnormal = false,
                labCompletedAt = null,
                labCompletedBy = null,
                updatedAt = Instant.now().toString(),
            )
        },
        onlineCall = { supabaseApi.rpcStartLab(StartLabRequest(visitId = visitId, clientOpId = it)) },
    )

    suspend fun recordLabResult(
        visitId: String,
        result: String,
        abnormal: Boolean,
        staffId: String,
    ): String? {
        val trimmed = result.trim()
        if (trimmed.isEmpty()) return null
        val now = Instant.now().toString()
        val status = if (abnormal) "abnormal" else "done"
        return enqueueVisitRpc(
            visitId = visitId,
            operationType = "rpc_record_lab_result",
            payload = json.encodeToString(
                RecordLabResultRequest.serializer(),
                RecordLabResultRequest(visitId = visitId, result = trimmed, abnormal = abnormal),
            ),
            localMutator = {
                visitDao.updateLabState(
                    id = visitId,
                    labStatus = status,
                    labResults = trimmed,
                    labAbnormal = abnormal,
                    labCompletedAt = now,
                    labCompletedBy = staffId,
                    updatedAt = now,
                )
            },
            onlineCall = {
                supabaseApi.rpcRecordLabResult(
                    RecordLabResultRequest(
                        visitId = visitId,
                        result = trimmed,
                        abnormal = abnormal,
                        clientOpId = it,
                    ),
                )
            },
        )
    }

    suspend fun startLabTest(visitId: String, testName: String): String? {
        val visit = visitDao.getByIdOnce(visitId) ?: return null
        val stored = LabQueue.parseStoredResults(visit.labTestResultsJson)
        val merged = LabQueue.mergeLabTestResults(visit.testsOrdered, stored)
        val updated = LabQueue.applyStartTest(merged, testName)
        val derived = LabQueue.deriveVisitLabState(updated)
        val now = Instant.now().toString()
        val encoded = LabQueue.encodeResults(updated)
        return enqueueVisitRpc(
            visitId = visitId,
            operationType = "rpc_start_lab_test",
            payload = json.encodeToString(
                StartLabTestRequest.serializer(),
                StartLabTestRequest(visitId = visitId, testName = testName),
            ),
            localMutator = {
                visitDao.updateLabWithTestResults(
                    id = visitId,
                    labStatus = derived.labStatus,
                    labResults = derived.labResults,
                    labAbnormal = derived.labAbnormal,
                    labTestResultsJson = encoded,
                    labCompletedAt = if (derived.allComplete) now else visit.labCompletedAt,
                    labCompletedBy = if (derived.allComplete) visit.labCompletedBy else null,
                    updatedAt = now,
                )
            },
            onlineCall = {
                supabaseApi.rpcStartLabTest(
                    StartLabTestRequest(visitId = visitId, testName = testName, clientOpId = it),
                )
            },
        )
    }

    suspend fun recordLabTestResult(
        visitId: String,
        testName: String,
        result: String,
        abnormal: Boolean,
        staffId: String,
    ): String? {
        val trimmed = result.trim()
        if (trimmed.isEmpty()) return null
        val visit = visitDao.getByIdOnce(visitId) ?: return null
        val stored = LabQueue.parseStoredResults(visit.labTestResultsJson)
        val merged = LabQueue.mergeLabTestResults(visit.testsOrdered, stored)
        val updated = LabQueue.applyRecordResult(merged, testName, trimmed, abnormal)
        val derived = LabQueue.deriveVisitLabState(updated)
        val now = Instant.now().toString()
        val encoded = LabQueue.encodeResults(updated)
        return enqueueVisitRpc(
            visitId = visitId,
            operationType = "rpc_record_lab_test_result",
            payload = json.encodeToString(
                RecordLabTestResultRequest.serializer(),
                RecordLabTestResultRequest(
                    visitId = visitId,
                    testName = testName,
                    result = trimmed,
                    abnormal = abnormal,
                ),
            ),
            localMutator = {
                visitDao.updateLabWithTestResults(
                    id = visitId,
                    labStatus = derived.labStatus,
                    labResults = derived.labResults,
                    labAbnormal = derived.labAbnormal,
                    labTestResultsJson = encoded,
                    labCompletedAt = if (derived.allComplete) now else null,
                    labCompletedBy = if (derived.allComplete) staffId else null,
                    updatedAt = now,
                )
            },
            onlineCall = {
                supabaseApi.rpcRecordLabTestResult(
                    RecordLabTestResultRequest(
                        visitId = visitId,
                        testName = testName,
                        result = trimmed,
                        abnormal = abnormal,
                        clientOpId = it,
                    ),
                )
            },
        )
    }

    /** Merge catalog test names onto a visit and set lab_status pending (web F2). */
    suspend fun submitLabOrder(visitId: String, testNames: List<String>): Result<Unit> =
        withContext(Dispatchers.IO) {
            val clean = testNames.map { it.trim() }.filter { it.isNotEmpty() }
            if (clean.isEmpty()) {
                return@withContext Result.failure(IllegalArgumentException("Select at least one test"))
            }
            val visit = visitDao.getByIdOnce(visitId)
                ?: return@withContext Result.failure(IllegalStateException("Visit not found"))
            val existing = LabQueue.parseTestsOrdered(visit.testsOrdered)
            val merged = (existing + clean).distinct()
            val testsOrdered = merged.joinToString(", ")
            val results = LabQueue.mergeLabTestResults(
                testsOrdered,
                LabQueue.parseStoredResults(visit.labTestResultsJson),
            )
            val encoded = LabQueue.encodeResults(results)
            val now = Instant.now().toString()
            visitDao.updateTestsOrdered(visitId, testsOrdered, "pending", encoded, now)
            visitDao.updateSyncState(visitId, false)

            val syncEntryId = UUID.randomUUID().toString()
            val payload = SubmitLabOrderSyncPayload(
                visitId = visitId,
                testsOrdered = testsOrdered,
                labStatus = "pending",
                labTestResultsJson = encoded,
                clientOpId = syncEntryId,
            )
            val payloadJson = json.encodeToString(SubmitLabOrderSyncPayload.serializer(), payload)

            if (networkMonitor.isOnline()) {
                runCatching {
                    supabaseApi.updateVisit(
                        visitId,
                        mapOf(
                            "tests_ordered" to testsOrdered,
                            "lab_status" to "pending",
                            "lab_test_results" to Json.parseToJsonElement(encoded),
                        ),
                    )
                    markVisitSyncedIfQuiet(visitId)
                    return@withContext Result.success(Unit)
                }.onFailure {
                    // Queue for sync when the direct write fails offline mid-flight.
                }
            }

            val syncEntry = SyncQueueEntry(
                id = syncEntryId,
                operationType = "submit_lab_order",
                entityType = "visits",
                entityId = visitId,
                payload = payloadJson,
                status = "pending",
                attempts = 0,
                createdAt = System.currentTimeMillis(),
            )
            syncQueueHelper.enqueue(syncEntry)
            Result.success(Unit)
        }

    data class InpatientVisitContext(
        val visitId: String,
        val testsOrdered: String?,
        val labStatus: String?,
    )

    suspend fun ensureInpatientVisit(
        clinicId: String,
        admissionId: String,
        patientId: String,
    ): InpatientVisitContext? = withContext(Dispatchers.IO) {
        val today = LocalDate.now().toString()
        visitDao.getVisitForPatientOnDate(clinicId, patientId, today)?.let { local ->
            return@withContext InpatientVisitContext(
                visitId = local.id,
                testsOrdered = local.testsOrdered,
                labStatus = local.labStatus,
            )
        }
        if (!networkMonitor.isOnline()) {
            val (visit, _) = createVisit(
                clinicId = clinicId,
                patientId = patientId,
                doctorId = null,
            )
            return@withContext InpatientVisitContext(
                visitId = visit.id,
                testsOrdered = visit.testsOrdered,
                labStatus = visit.labStatus,
            )
        }
        runCatching {
            val existing = supabaseApi.getVisitsByAdmission("eq.$admissionId", "eq.$clinicId").firstOrNull()
            if (existing != null) {
                visitDao.upsert(existing.toEntity())
                return@runCatching InpatientVisitContext(
                    visitId = existing.id,
                    testsOrdered = existing.testsOrdered,
                    labStatus = existing.labStatus,
                )
            }
            val visitId = UUID.randomUUID().toString()
            val today = LocalDate.now().toString()
            val body = mapOf(
                "id" to visitId,
                "clinic_id" to clinicId,
                "patient_id" to patientId,
                "admission_id" to admissionId,
                "visit_date" to today,
                "department" to "opd",
                "status" to "pending",
                "queue_status" to "waiting",
                "priority" to "normal",
            )
            val resp = supabaseApi.insertVisit(body)
            if (!resp.isSuccessful) return@runCatching null
            val dto = supabaseApi.getVisitById("eq.$visitId").firstOrNull() ?: return@runCatching null
            visitDao.upsert(dto.toEntity())
            InpatientVisitContext(visitId = dto.id, testsOrdered = dto.testsOrdered, labStatus = dto.labStatus)
        }.getOrNull()
    }

    suspend fun setDispensingStatus(
        visitId: String,
        status: String,
        notes: String?,
        staffId: String,
    ): String? {
        val now = Instant.now().toString()
        val terminal = status in listOf("dispensed", "partial", "out_of_stock")
        return enqueueVisitRpc(
            visitId = visitId,
            operationType = "rpc_set_dispensing_status",
            payload = json.encodeToString(
                SetDispensingStatusRequest.serializer(),
                SetDispensingStatusRequest(visitId = visitId, status = status, notes = notes),
            ),
            localMutator = {
                visitDao.updateDispensingState(
                    id = visitId,
                    dispensingStatus = status,
                    dispenseNotes = notes,
                    dispensedAt = if (terminal) now else null,
                    dispensedBy = if (terminal) staffId else null,
                    updatedAt = now,
                )
            },
            onlineCall = {
                supabaseApi.rpcSetDispensingStatus(
                    SetDispensingStatusRequest(
                        visitId = visitId,
                        status = status,
                        notes = notes,
                        clientOpId = it,
                    ),
                )
            },
        )
    }

    suspend fun recordDispense(
        visitId: String,
        status: String,
        notes: String?,
        staffId: String,
        movementsJson: String = "[]",
    ): String? {
        val now = Instant.now().toString()
        return enqueueVisitRpc(
            visitId = visitId,
            operationType = "rpc_record_dispense",
            payload = json.encodeToString(
                RecordDispenseRequest.serializer(),
                RecordDispenseRequest(
                    visitId = visitId,
                    status = status,
                    notes = notes,
                    movements = movementsJson,
                ),
            ),
            localMutator = {
                visitDao.updateDispensingState(
                    id = visitId,
                    dispensingStatus = status,
                    dispenseNotes = notes,
                    dispensedAt = now,
                    dispensedBy = staffId,
                    updatedAt = now,
                )
            },
            onlineCall = {
                supabaseApi.rpcRecordDispense(
                    RecordDispenseRequest(
                        visitId = visitId,
                        status = status,
                        notes = notes,
                        movements = movementsJson,
                        clientOpId = it,
                    ),
                )
            },
        )
    }

    suspend fun startPharmacyDispense(visitId: String): String? {
        val now = Instant.now().toString()
        return enqueueVisitRpc(
            visitId = visitId,
            operationType = "rpc_start_pharmacy_dispense",
            payload = json.encodeToString(
                StartPharmacyDispenseRequest.serializer(),
                StartPharmacyDispenseRequest(visitId = visitId),
            ),
            localMutator = {
                visitDao.updateDispensingState(
                    id = visitId,
                    dispensingStatus = "in_progress",
                    dispenseNotes = null,
                    dispensedAt = null,
                    dispensedBy = null,
                    updatedAt = now,
                )
            },
            onlineCall = {
                supabaseApi.rpcStartPharmacyDispense(
                    StartPharmacyDispenseRequest(visitId = visitId, clientOpId = it),
                )
            },
        )
    }

    suspend fun completePharmacyDispense(
        visitId: String,
        request: CompletePharmacyDispenseRequest,
        staffId: String,
    ): String? {
        val aggStatus = aggregateDispensingStatus(request.lines.map { it.lineStatus })
        val now = Instant.now().toString()
        val terminal = aggStatus in listOf("dispensed", "partial", "out_of_stock")
        return enqueueVisitRpc(
            visitId = visitId,
            operationType = "rpc_complete_pharmacy_dispense",
            payload = json.encodeToString(CompletePharmacyDispenseRequest.serializer(), request),
            localMutator = {
                visitDao.updateDispensingState(
                    id = visitId,
                    dispensingStatus = aggStatus,
                    dispenseNotes = request.notes,
                    dispensedAt = if (terminal) now else null,
                    dispensedBy = if (terminal) staffId else null,
                    updatedAt = now,
                )
                prescriptionOrderRepository.applyLocalDispenseOutcomes(
                    request.lines.map { it.prescriptionOrderId to it.lineStatus },
                )
            },
            onlineCall = {
                supabaseApi.rpcCompletePharmacyDispense(
                    request.copy(clientOpId = it),
                )
            },
        )
    }

    suspend fun sendPharmacyBackToClinician(
        visitId: String,
        reason: String,
    ): String? {
        val trimmed = reason.trim()
        if (trimmed.isEmpty()) return null
        val now = Instant.now().toString()
        return enqueueVisitRpc(
            visitId = visitId,
            operationType = "rpc_send_pharmacy_back_to_clinician",
            payload = json.encodeToString(
                SendPharmacyBackRequest.serializer(),
                SendPharmacyBackRequest(visitId = visitId, reason = trimmed),
            ),
            localMutator = {
                visitDao.updateDispensingState(
                    id = visitId,
                    dispensingStatus = "not_started",
                    dispenseNotes = trimmed,
                    dispensedAt = null,
                    dispensedBy = null,
                    updatedAt = now,
                )
            },
            onlineCall = {
                supabaseApi.rpcSendPharmacyBackToClinician(
                    SendPharmacyBackRequest(
                        visitId = visitId,
                        reason = trimmed,
                        clientOpId = it,
                    ),
                )
            },
        )
    }

    private suspend fun enqueueVisitRpc(
        visitId: String,
        operationType: String,
        payload: String,
        localMutator: suspend () -> Unit,
        onlineCall: suspend (clientOpId: String) -> retrofit2.Response<okhttp3.ResponseBody>,
    ): String? = withContext(Dispatchers.IO) {
        localMutator()
        // Dirty the visit in the same flow as the local mutation: until the
        // op lands on the server, a pull must not clobber these fields.
        visitDao.updateSyncState(visitId, false)
        val syncEntryId = UUID.randomUUID().toString()

        if (networkMonitor.isOnline()) {
            try {
                val response = onlineCall(syncEntryId)
                if (response.isSuccessful) {
                    markVisitSyncedIfQuiet(visitId)
                    return@withContext null
                }
            } catch (_: Exception) {
                // Fall through to queue
            }
        }

        val finalPayload = when (operationType) {
            "rpc_submit_pharmacy_order" -> payload
            "rpc_start_lab" -> json.encodeToString(
                StartLabRequest.serializer(),
                StartLabRequest(visitId = visitId, clientOpId = syncEntryId),
            )
            "rpc_record_lab_result" -> {
                val decoded = json.decodeFromString(RecordLabResultRequest.serializer(), payload)
                json.encodeToString(
                    RecordLabResultRequest.serializer(),
                    decoded.copy(clientOpId = syncEntryId),
                )
            }
            "rpc_start_lab_test" -> {
                val decoded = json.decodeFromString(StartLabTestRequest.serializer(), payload)
                json.encodeToString(
                    StartLabTestRequest.serializer(),
                    decoded.copy(clientOpId = syncEntryId),
                )
            }
            "rpc_record_lab_test_result" -> {
                val decoded = json.decodeFromString(RecordLabTestResultRequest.serializer(), payload)
                json.encodeToString(
                    RecordLabTestResultRequest.serializer(),
                    decoded.copy(clientOpId = syncEntryId),
                )
            }
            "rpc_set_dispensing_status" -> {
                val decoded = json.decodeFromString(SetDispensingStatusRequest.serializer(), payload)
                json.encodeToString(
                    SetDispensingStatusRequest.serializer(),
                    decoded.copy(clientOpId = syncEntryId),
                )
            }
            "rpc_record_dispense" -> {
                val decoded = json.decodeFromString(RecordDispenseRequest.serializer(), payload)
                json.encodeToString(
                    RecordDispenseRequest.serializer(),
                    decoded.copy(clientOpId = syncEntryId),
                )
            }
            "rpc_start_pharmacy_dispense" -> {
                val decoded = json.decodeFromString(StartPharmacyDispenseRequest.serializer(), payload)
                json.encodeToString(
                    StartPharmacyDispenseRequest.serializer(),
                    decoded.copy(clientOpId = syncEntryId),
                )
            }
            "rpc_complete_pharmacy_dispense" -> {
                val decoded = json.decodeFromString(CompletePharmacyDispenseRequest.serializer(), payload)
                json.encodeToString(
                    CompletePharmacyDispenseRequest.serializer(),
                    decoded.copy(clientOpId = syncEntryId),
                )
            }
            "rpc_send_pharmacy_back_to_clinician" -> {
                val decoded = json.decodeFromString(SendPharmacyBackRequest.serializer(), payload)
                json.encodeToString(
                    SendPharmacyBackRequest.serializer(),
                    decoded.copy(clientOpId = syncEntryId),
                )
            }
            else -> payload
        }

        val syncEntry = SyncQueueEntry(
            id = syncEntryId,
            operationType = operationType,
            entityType = "visits",
            entityId = visitId,
            payload = finalPayload,
            status = "pending",
            attempts = 0,
            createdAt = System.currentTimeMillis(),
        )
        syncQueueHelper.enqueue(syncEntry)
    }

    /**
     * Mark a visit as documentation-complete (clinician tapped Save).
     * The server-side RPC also advances status pending → sent and releases
     * the clinician queue slot; payment is handled separately by billing staff.
     * `predecessorSyncId` linearizes against the patient-note summary (or
     * provider-note) queue entry if those are still pending.
     */
    suspend fun markDocumentationComplete(
        visitId: String,
        predecessorSyncId: String? = null,
    ): String? = withContext(Dispatchers.IO) {
        val now = Instant.now().toString()
        // Optimistic local update so UI reflects "done" immediately.
        visitDao.updateDocumentationComplete(visitId, true, now)
        releaseClinicianQueueAfterDocumentation(visitId, now)
        // Dirty the visit until the completion lands server-side.
        visitDao.updateSyncState(visitId, false)

        val rpcBody = MarkDocumentationCompleteDto(visitId = visitId)

        if (networkMonitor.isOnline() && predecessorSyncId == null) {
            try {
                val response = supabaseApi.rpcMarkDocumentationComplete(rpcBody)
                if (response.isSuccessful) {
                    markVisitSyncedIfQuiet(visitId)
                    return@withContext null
                }
            } catch (_: Exception) {
                // Fall through to queue
            }
        }

        val syncEntry = SyncQueueEntry(
            id = UUID.randomUUID().toString(),
            operationType = "mark_documentation_complete",
            entityType = "visits",
            entityId = visitId,
            payload = json.encodeToString(MarkDocumentationCompleteDto.serializer(), rpcBody),
            status = "pending",
            attempts = 0,
            createdAt = System.currentTimeMillis(),
            dependsOn = predecessorSyncId,
        )
        syncQueueHelper.enqueue(syncEntry)
    }

    suspend fun updateStatus(visitId: String, status: VisitStatus) {
        withContext(Dispatchers.IO) {
            visitDao.updateStatus(visitId, status.name, Instant.now().toString())
        }
    }

    suspend fun refreshTodayVisits(clinicId: String) {
        if (!networkMonitor.isOnline()) return
        withContext(Dispatchers.IO) {
            try {
                val today = LocalDate.now().toString()
                val remote = supabaseApi.getVisits("eq.$clinicId", "eq.$today")
                remote.forEach { dto ->
                    val local = visitDao.getByIdOnce(dto.id)
                    val merged = VisitMerge.mergeRemote(local, dto.toEntity(isSynced = true))
                    visitDao.upsert(merged)
                }
            } catch (_: Exception) {
                // Offline-first: silently use cache
            }
        }
    }

    suspend fun refreshVisit(visitId: String) {
        if (!networkMonitor.isOnline()) return
        withContext(Dispatchers.IO) {
            try {
                val remote = supabaseApi.getVisitById("eq.$visitId")
                remote.firstOrNull()?.let { dto ->
                    val local = visitDao.getByIdOnce(dto.id)
                    visitDao.upsert(VisitMerge.mergeRemote(local, dto.toEntity(isSynced = true)))
                }
            } catch (_: Exception) {}
        }
    }

    private suspend fun releaseClinicianQueueAfterDocumentation(visitId: String, now: String) {
        val visit = visitDao.getByIdOnce(visitId) ?: return
        val status = if (visit.status == "pending") "sent" else visit.status
        val queueStatus = if (visit.queueStatus in listOf("with_doctor", "ready_for_doctor")) {
            "completed"
        } else {
            visit.queueStatus
        }
        visitDao.updateStatusAndQueueStatus(
            id = visitId,
            status = status,
            queueStatus = queueStatus,
            finalizedAt = visit.finalizedAt,
            updatedAt = now,
        )
    }
}
