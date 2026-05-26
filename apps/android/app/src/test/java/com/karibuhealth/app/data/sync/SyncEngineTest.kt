package com.karibuhealth.app.data.sync

import com.karibuhealth.app.data.local.db.dao.*
import com.karibuhealth.app.data.local.db.entity.SyncQueueEntry
import com.karibuhealth.app.data.remote.api.SupabaseApi
import com.karibuhealth.app.util.NetworkMonitor
import io.mockk.*
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

class SyncEngineTest {

    private lateinit var syncQueueDao: SyncQueueDao
    private lateinit var patientDao: PatientDao
    private lateinit var visitDao: VisitDao
    private lateinit var paymentDao: PaymentDao
    private lateinit var patientVitalsDao: PatientVitalsDao
    private lateinit var supabaseApi: SupabaseApi
    private lateinit var networkMonitor: NetworkMonitor
    private lateinit var outboxReconciler: OutboxReconciler
    private lateinit var syncEngine: SyncEngine

    @Before
    fun setup() {
        syncQueueDao = mockk(relaxed = true)
        patientDao = mockk(relaxed = true)
        visitDao = mockk(relaxed = true)
        paymentDao = mockk(relaxed = true)
        patientVitalsDao = mockk(relaxed = true)
        supabaseApi = mockk(relaxed = true)
        networkMonitor = mockk()
        outboxReconciler = mockk(relaxed = true)

        syncEngine = SyncEngine(
            syncQueueDao = syncQueueDao,
            patientDao = patientDao,
            visitDao = visitDao,
            paymentDao = paymentDao,
            patientVitalsDao = patientVitalsDao,
            supabaseApi = supabaseApi,
            networkMonitor = networkMonitor,
            outboxReconciler = outboxReconciler,
            json = Json { ignoreUnknownKeys = true },
        )
    }

    @Test
    fun `processQueue returns 0 when offline`() = runTest {
        every { networkMonitor.isOnline() } returns false

        val result = syncEngine.processQueue()

        assertEquals(0, result)
        coVerify(exactly = 0) { syncQueueDao.getRetryable(any()) }
    }

    @Test
    fun `processQueue returns 0 when queue is empty`() = runTest {
        every { networkMonitor.isOnline() } returns true
        coEvery { syncQueueDao.getRetryable(any()) } returns emptyList()
        coEvery { syncQueueDao.getPending() } returns emptyList()

        val result = syncEngine.processQueue()

        assertEquals(0, result)
    }

    @Test
    fun `skips entry when dependency not completed`() = runTest {
        every { networkMonitor.isOnline() } returns true

        val depEntry = makeSyncEntry("dep-1", operationType = "create_patient", status = "pending")
        val entry = makeSyncEntry("entry-1", operationType = "create_visit", dependsOn = "dep-1")

        coEvery { syncQueueDao.getRetryable(any()) } returns listOf(entry)
        coEvery { syncQueueDao.getById("dep-1") } returns depEntry

        val result = syncEngine.processQueue()

        assertEquals(0, result)
    }

    @Test
    fun `increments attempts on failure`() = runTest {
        every { networkMonitor.isOnline() } returns true

        val entry = makeSyncEntry(
            "entry-1",
            operationType = "create_patient",
            payload = "invalid json", // Will cause deserialization failure
        )

        coEvery { syncQueueDao.getRetryable(any()) } returns listOf(entry)

        val result = syncEngine.processQueue()

        assertEquals(0, result)
        coVerify {
            syncQueueDao.update(match {
                it.attempts == 1 && it.status == "pending" && it.lastError != null
            })
        }
    }

    @Test
    fun `marks as failed after max attempts`() = runTest {
        every { networkMonitor.isOnline() } returns true

        val entry = makeSyncEntry(
            "entry-1",
            operationType = "create_patient",
            payload = "invalid json",
            attempts = 4, // One more will reach maxAttempts=5
        )

        coEvery { syncQueueDao.getRetryable(any()) } returns listOf(entry)

        syncEngine.processQueue()

        coVerify {
            syncQueueDao.update(match {
                it.attempts == 5 && it.status == "failed"
            })
        }
    }

    private fun makeSyncEntry(
        id: String,
        operationType: String = "create_patient",
        status: String = "pending",
        payload: String = "{}",
        dependsOn: String? = null,
        attempts: Int = 0,
    ) = SyncQueueEntry(
        id = id,
        operationType = operationType,
        entityType = "test",
        entityId = "entity-$id",
        payload = payload,
        status = status,
        attempts = attempts,
        maxAttempts = 5,
        createdAt = System.currentTimeMillis(),
        dependsOn = dependsOn,
    )
}
