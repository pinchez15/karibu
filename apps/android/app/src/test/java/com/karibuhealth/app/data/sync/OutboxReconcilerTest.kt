package com.karibuhealth.app.data.sync

import com.karibuhealth.app.data.local.db.dao.PatientDao
import com.karibuhealth.app.data.local.db.dao.PatientVitalsDao
import com.karibuhealth.app.data.local.db.dao.SyncQueueDao
import com.karibuhealth.app.data.local.db.dao.VisitDao
import com.karibuhealth.app.data.local.db.entity.PatientEntity
import com.karibuhealth.app.data.local.db.entity.PatientVitalsEntity
import com.karibuhealth.app.data.local.db.entity.SyncQueueEntry
import com.karibuhealth.app.data.local.db.entity.VisitEntity
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import org.junit.Before
import org.junit.Test

/**
 * The reconciler must only force-complete pure CREATE ops off the local
 * `is_synced` proxy. Visit-mutation and provider-note ops queued while
 * offline are real clinical writes — clearing them off local state silently
 * loses lab results / dispenses / signatures forever.
 */
class OutboxReconcilerTest {

    private lateinit var syncQueueDao: SyncQueueDao
    private lateinit var patientDao: PatientDao
    private lateinit var visitDao: VisitDao
    private lateinit var patientVitalsDao: PatientVitalsDao
    private lateinit var reconciler: OutboxReconciler

    @Before
    fun setup() {
        syncQueueDao = mockk(relaxed = true)
        patientDao = mockk(relaxed = true)
        visitDao = mockk(relaxed = true)
        patientVitalsDao = mockk(relaxed = true)
        reconciler = OutboxReconciler(
            syncQueueDao = syncQueueDao,
            patientDao = patientDao,
            visitDao = visitDao,
            patientVitalsDao = patientVitalsDao,
            json = Json { ignoreUnknownKeys = true },
        )
    }

    private fun syncedVisit(): VisitEntity = mockk { every { isSynced } returns true }
    private fun syncedPatient(): PatientEntity = mockk { every { isSynced } returns true }
    private fun syncedVitals(): PatientVitalsEntity = mockk { every { isSynced } returns true }

    @Test
    fun `never clears visit mutation ops even when visit is synced`() = runTest {
        val mutationOps = listOf(
            "rpc_record_lab_result",
            "rpc_record_dispense",
            "rpc_submit_pharmacy_order",
            "rpc_set_dispensing_status",
            "rpc_start_pharmacy_dispense",
            "rpc_complete_pharmacy_dispense",
            "rpc_send_pharmacy_back_to_clinician",
            "rpc_start_lab",
            "finalize_clinical_encounter",
            "mark_documentation_complete",
            "upsert_visit_clinical_summary",
        )
        val pending = mutationOps.mapIndexed { i, op ->
            makeEntry(id = "e-$i", operationType = op, entityType = "visits", entityId = "visit-1")
        }
        coEvery { syncQueueDao.getPending() } returns pending
        coEvery { visitDao.getByIdOnce("visit-1") } returns syncedVisit()

        reconciler.reconcilePendingWithLocalState()

        coVerify(exactly = 0) { syncQueueDao.forceComplete(any()) }
    }

    @Test
    fun `never clears provider note ops off local note status`() = runTest {
        val noteOps = listOf(
            "sign_provider_note",
            "amend_provider_note",
            "addend_provider_note",
            "cosign_provider_note",
            "void_provider_note",
            "upsert_provider_note",
        )
        val pending = noteOps.mapIndexed { i, op ->
            makeEntry(id = "n-$i", operationType = op, entityType = "provider_notes", entityId = "note-1")
        }
        coEvery { syncQueueDao.getPending() } returns pending

        reconciler.reconcilePendingWithLocalState()

        coVerify(exactly = 0) { syncQueueDao.forceComplete(any()) }
    }

    @Test
    fun `clears synced create ops`() = runTest {
        val pending = listOf(
            makeEntry("c-1", "create_patient", "patients", "patient-1"),
            makeEntry("c-2", "create_visit", "visits", "visit-1"),
            makeEntry("c-3", "insert_patient_vitals", "patient_vitals", "vitals-1"),
        )
        coEvery { syncQueueDao.getPending() } returns pending
        coEvery { patientDao.getByIdOnce("patient-1") } returns syncedPatient()
        coEvery { visitDao.getByIdOnce("visit-1") } returns syncedVisit()
        coEvery { patientVitalsDao.getByIdOnce("vitals-1") } returns syncedVitals()

        reconciler.reconcilePendingWithLocalState()

        coVerify { syncQueueDao.forceComplete("c-1") }
        coVerify { syncQueueDao.forceComplete("c-2") }
        coVerify { syncQueueDao.forceComplete("c-3") }
    }

    @Test
    fun `does not clear create ops when entity is not synced`() = runTest {
        val unsyncedVisit: VisitEntity = mockk { every { isSynced } returns false }
        coEvery { syncQueueDao.getPending() } returns listOf(
            makeEntry("c-1", "create_visit", "visits", "visit-1"),
        )
        coEvery { visitDao.getByIdOnce("visit-1") } returns unsyncedVisit

        reconciler.reconcilePendingWithLocalState()

        coVerify(exactly = 0) { syncQueueDao.forceComplete(any()) }
    }

    @Test
    fun `clears check_in_patient queue op when visit is synced but not other queue rpcs`() = runTest {
        coEvery { syncQueueDao.getPending() } returns listOf(
            makeEntry(
                id = "q-1",
                operationType = "queue_op",
                entityType = "visits",
                entityId = "visit-1",
                payload = """{"rpc":"check_in_patient","params":{"p_visit_id":"visit-1"}}""",
            ),
            makeEntry(
                id = "q-2",
                operationType = "queue_op",
                entityType = "visits",
                entityId = "visit-1",
                payload = """{"rpc":"complete_visit_queue","params":{"p_visit_id":"visit-1"}}""",
            ),
        )
        coEvery { visitDao.getByIdOnce("visit-1") } returns syncedVisit()

        reconciler.reconcilePendingWithLocalState()

        coVerify(exactly = 1) { syncQueueDao.forceComplete("q-1") }
        coVerify(exactly = 0) { syncQueueDao.forceComplete("q-2") }
    }

    private fun makeEntry(
        id: String,
        operationType: String,
        entityType: String,
        entityId: String,
        payload: String = "{}",
    ) = SyncQueueEntry(
        id = id,
        operationType = operationType,
        entityType = entityType,
        entityId = entityId,
        payload = payload,
        status = "pending",
        attempts = 0,
        createdAt = System.currentTimeMillis(),
    )
}
