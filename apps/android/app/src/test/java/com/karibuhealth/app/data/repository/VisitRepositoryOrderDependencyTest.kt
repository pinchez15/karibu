package com.karibuhealth.app.data.repository

import androidx.work.WorkManager
import com.karibuhealth.app.data.local.db.KaribuDatabase
import com.karibuhealth.app.data.local.db.dao.SyncQueueDao
import com.karibuhealth.app.data.local.db.dao.VisitDao
import com.karibuhealth.app.data.local.db.entity.SyncQueueEntry
import com.karibuhealth.app.data.local.db.entity.VisitEntity
import com.karibuhealth.app.data.remote.DirectWriteExecutor
import com.karibuhealth.app.data.remote.api.SupabaseApi
import com.karibuhealth.app.data.sync.SyncDependencyResolver
import com.karibuhealth.app.data.sync.SyncQueueHelper
import com.karibuhealth.app.domain.model.Department
import com.karibuhealth.app.util.NetworkMonitor
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import io.mockk.slot
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class VisitRepositoryOrderDependencyTest {

    private lateinit var database: KaribuDatabase
    private lateinit var visitDao: VisitDao
    private lateinit var syncQueueDao: SyncQueueDao
    private lateinit var syncQueueHelper: SyncQueueHelper
    private lateinit var syncDependencyResolver: SyncDependencyResolver
    private lateinit var supabaseApi: SupabaseApi
    private lateinit var networkMonitor: NetworkMonitor
    private lateinit var prescriptionOrderRepository: PrescriptionOrderRepository
    private lateinit var repository: VisitRepository

    private val json = Json { ignoreUnknownKeys = true }
    private val queueByEntityOp = mutableMapOf<Pair<String, String>, SyncQueueEntry>()
    private val queueById = mutableMapOf<String, SyncQueueEntry>()
    private var storedVisit: VisitEntity? = null

    @Before
    fun setup() {
        database = mockk(relaxed = true)
        visitDao = mockk(relaxed = true)
        syncQueueDao = mockk(relaxed = true)
        val workManager = mockk<WorkManager>(relaxed = true)
        syncQueueHelper = SyncQueueHelper(syncQueueDao, workManager)
        syncDependencyResolver = SyncDependencyResolver(syncQueueDao)
        supabaseApi = mockk(relaxed = true)
        networkMonitor = mockk()
        prescriptionOrderRepository = mockk(relaxed = true)

        repository = VisitRepository(
            database = database,
            visitDao = visitDao,
            syncQueueDao = syncQueueDao,
            syncQueueHelper = syncQueueHelper,
            syncDependencyResolver = syncDependencyResolver,
            supabaseApi = supabaseApi,
            networkMonitor = networkMonitor,
            // Real executor with a relaxed refresher: passes non-401 responses through.
            directWriteExecutor = DirectWriteExecutor(mockk(relaxed = true)),
            prescriptionOrderRepository = prescriptionOrderRepository,
            json = json,
        )

        queueByEntityOp.clear()
        queueById.clear()
        storedVisit = null

        coEvery { syncQueueDao.getByEntityAndOperation(any(), any()) } answers {
            queueByEntityOp[firstArg<String>() to secondArg<String>()]
        }
        coEvery { syncQueueDao.getById(any()) } answers {
            queueById[firstArg()]
        }
        coEvery { syncQueueDao.insert(any()) } answers {
            val entry = firstArg<SyncQueueEntry>()
            queueByEntityOp[entry.entityId to entry.operationType] = entry
            queueById[entry.id] = entry
        }
        coEvery { syncQueueDao.update(any()) } answers {
            val entry = firstArg<SyncQueueEntry>()
            queueByEntityOp[entry.entityId to entry.operationType] = entry
            queueById[entry.id] = entry
        }
        coEvery { syncQueueDao.countActiveForEntity(any()) } returns 0
        coEvery { visitDao.getMaxQueuePosition(any(), any()) } returns 0
        coEvery { visitDao.upsert(any()) } answers {
            storedVisit = firstArg()
        }
        coEvery { visitDao.getByIdOnce(any()) } answers {
            storedVisit
        }
        coEvery { visitDao.updateTestsOrdered(any(), any(), any(), any(), any()) } returns Unit
        coEvery { visitDao.updateSyncState(any(), any()) } returns Unit
        coEvery { visitDao.updatePharmacyOrderSubmitted(any(), any(), any(), any(), any()) } returns Unit
        coEvery {
            visitDao.updateLabState(any(), any(), any(), any(), any(), any(), any())
        } returns Unit
    }

    @Test
    fun offlineLabOrderChainsToVisitCreator() = runTest {
        every { networkMonitor.isConnected() } returns false

        val (_, checkInEntryId) = repository.checkInPatient(
            clinicId = "clinic-1",
            patientId = "patient-1",
            department = Department.opd,
        )
        assertNotNull(checkInEntryId)
        val visitId = storedVisit!!.id

        repository.submitLabOrder(visitId, listOf("CBC"))
        val labEntry = queueByEntityOp[visitId to "submit_lab_order"]
        assertNotNull(labEntry)
        assertEquals(checkInEntryId, labEntry!!.dependsOn)

        repository.submitPharmacyOrder(visitId, "Paracetamol 500mg", staffId = "staff-1")
        val pharmacyEntry = queueByEntityOp[visitId to "rpc_submit_pharmacy_order"]
        assertNotNull(pharmacyEntry)
        assertEquals(checkInEntryId, pharmacyEntry!!.dependsOn)

        repository.startLab(visitId)
        val startLabEntry = queueByEntityOp[visitId to "rpc_start_lab"]
        assertNotNull(startLabEntry)
        assertEquals(checkInEntryId, startLabEntry!!.dependsOn)
    }

    @Test
    fun orderAfterDeadVisitCreatorIsBlocked() = runTest {
        every { networkMonitor.isConnected() } returns false

        val (_, checkInEntryId) = repository.checkInPatient(
            clinicId = "clinic-1",
            patientId = "patient-1",
            department = Department.opd,
        )
        val visitId = storedVisit!!.id
        val deadCreator = queueById[checkInEntryId!!]!!.copy(
            status = "failed",
            attempts = 10,
            lastError = "Visit not found",
        )
        queueById[checkInEntryId] = deadCreator
        queueByEntityOp[visitId to "queue_op"] = deadCreator

        repository.submitLabOrder(visitId, listOf("CBC"))
        val labEntry = queueById.values.last { it.operationType == "submit_lab_order" }
        assertEquals("failed", labEntry.status)
        assertEquals(10, labEntry.attempts)
        assertTrue(labEntry.lastError!!.startsWith("blocked:"))
        assertEquals(checkInEntryId, labEntry.dependsOn)
    }

    @Test
    fun directOrderSkippedWhenVisitPending() = runTest {
        every { networkMonitor.isConnected() } returns false

        val (_, checkInEntryId) = repository.checkInPatient(
            clinicId = "clinic-1",
            patientId = "patient-1",
            department = Department.opd,
        )
        val visitId = storedVisit!!.id
        every { networkMonitor.isConnected() } returns true

        repository.submitLabOrder(visitId, listOf("CBC"))

        coVerify(exactly = 0) { supabaseApi.updateVisit(any(), any()) }
        val labEntry = queueByEntityOp[visitId to "submit_lab_order"]
        assertNotNull(labEntry)
        assertEquals(checkInEntryId, labEntry!!.dependsOn)
        assertEquals("pending", labEntry.status)
    }

    @Test
    fun directRpcSkippedWhenVisitCreatorPending() = runTest {
        every { networkMonitor.isConnected() } returns false

        val (_, checkInEntryId) = repository.checkInPatient(
            clinicId = "clinic-1",
            patientId = "patient-1",
            department = Department.opd,
        )
        val visitId = storedVisit!!.id
        every { networkMonitor.isConnected() } returns true

        val syncEntrySlot = slot<SyncQueueEntry>()
        coEvery { syncQueueDao.insert(capture(syncEntrySlot)) } answers {
            val entry = firstArg<SyncQueueEntry>()
            queueByEntityOp[entry.entityId to entry.operationType] = entry
            queueById[entry.id] = entry
        }

        repository.startLab(visitId)

        coVerify(exactly = 0) { supabaseApi.rpcStartLab(any()) }
        val startLabEntry = queueByEntityOp[visitId to "rpc_start_lab"]
        assertNotNull(startLabEntry)
        assertEquals(checkInEntryId, startLabEntry!!.dependsOn)
    }
}
