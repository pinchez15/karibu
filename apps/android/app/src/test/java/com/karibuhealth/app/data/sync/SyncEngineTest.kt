package com.karibuhealth.app.data.sync

import com.karibuhealth.app.data.local.datastore.AuthTokenStore
import com.karibuhealth.app.data.local.db.dao.*
import com.karibuhealth.app.data.local.db.entity.SyncQueueEntry
import com.karibuhealth.app.data.remote.api.SupabaseApi
import com.karibuhealth.app.data.remote.dto.FinalizeClinicalEncounterRequest
import com.karibuhealth.app.data.remote.dto.RecordLabResultRequest
import com.karibuhealth.app.util.NetworkMonitor
import io.mockk.*
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import retrofit2.Response
import java.net.SocketTimeoutException

class SyncEngineTest {

    private lateinit var syncQueueDao: SyncQueueDao
    private lateinit var patientDao: PatientDao
    private lateinit var visitDao: VisitDao
    private lateinit var paymentDao: PaymentDao
    private lateinit var patientVitalsDao: PatientVitalsDao
    private lateinit var providerNoteDao: ProviderNoteDao
    private lateinit var referralDao: ReferralDao
    private lateinit var admissionDao: com.karibuhealth.app.data.local.db.dao.AdmissionDao
    private lateinit var admissionObservationDao: com.karibuhealth.app.data.local.db.dao.AdmissionObservationDao
    private lateinit var medicationOrderDao: com.karibuhealth.app.data.local.db.dao.MedicationOrderDao
    private lateinit var medicationAdministrationDao: com.karibuhealth.app.data.local.db.dao.MedicationAdministrationDao
    private lateinit var deliveryDao: com.karibuhealth.app.data.local.db.dao.DeliveryDao
    private lateinit var postnatalObservationDao: com.karibuhealth.app.data.local.db.dao.PostnatalObservationDao
    private lateinit var admissionNoteDao: com.karibuhealth.app.data.local.db.dao.AdmissionNoteDao
    private lateinit var pregnancyDao: com.karibuhealth.app.data.local.db.dao.PregnancyDao
    private lateinit var ancContactDao: com.karibuhealth.app.data.local.db.dao.AncContactDao
    private lateinit var ebolaScreeningDao: com.karibuhealth.app.data.local.db.dao.EbolaScreeningDao
    private lateinit var supabaseApi: SupabaseApi
    private lateinit var networkMonitor: NetworkMonitor
    private lateinit var pullReconciliationService: PullReconciliationService
    private lateinit var syncDebugLogger: SyncDebugLogger
    private lateinit var authTokenStore: AuthTokenStore
    private lateinit var tokenRefresher: TokenRefresher
    private lateinit var syncEngine: SyncEngine
    private val json = Json { ignoreUnknownKeys = true }

    @Before
    fun setup() {
        syncQueueDao = mockk(relaxed = true)
        patientDao = mockk(relaxed = true)
        visitDao = mockk(relaxed = true)
        paymentDao = mockk(relaxed = true)
        patientVitalsDao = mockk(relaxed = true)
        providerNoteDao = mockk(relaxed = true)
        referralDao = mockk(relaxed = true)
        admissionDao = mockk(relaxed = true)
        admissionObservationDao = mockk(relaxed = true)
        medicationOrderDao = mockk(relaxed = true)
        medicationAdministrationDao = mockk(relaxed = true)
        deliveryDao = mockk(relaxed = true)
        postnatalObservationDao = mockk(relaxed = true)
        admissionNoteDao = mockk(relaxed = true)
        pregnancyDao = mockk(relaxed = true)
        ancContactDao = mockk(relaxed = true)
        ebolaScreeningDao = mockk(relaxed = true)
        val ivInfusionDao = mockk<com.karibuhealth.app.data.local.db.dao.IvInfusionDao>(relaxed = true)
        val ivInfusionCheckDao = mockk<com.karibuhealth.app.data.local.db.dao.IvInfusionCheckDao>(relaxed = true)
        val prescriptionOrderRepository = mockk<com.karibuhealth.app.data.repository.PrescriptionOrderRepository>(relaxed = true)
        supabaseApi = mockk(relaxed = true)
        networkMonitor = mockk()
        pullReconciliationService = mockk(relaxed = true)
        syncDebugLogger = mockk(relaxed = true)
        authTokenStore = mockk(relaxed = true)
        tokenRefresher = mockk(relaxed = true)
        // No cached-token timestamp by default -> no proactive refresh in tests.
        coEvery { authTokenStore.getTokenFetchedAt() } returns null

        syncEngine = SyncEngine(
            syncQueueDao = syncQueueDao,
            patientDao = patientDao,
            visitDao = visitDao,
            paymentDao = paymentDao,
            patientVitalsDao = patientVitalsDao,
            providerNoteDao = providerNoteDao,
            referralDao = referralDao,
            admissionDao = admissionDao,
            admissionObservationDao = admissionObservationDao,
            medicationOrderDao = medicationOrderDao,
            medicationAdministrationDao = medicationAdministrationDao,
            deliveryDao = deliveryDao,
            postnatalObservationDao = postnatalObservationDao,
            admissionNoteDao = admissionNoteDao,
            pregnancyDao = pregnancyDao,
            ancContactDao = ancContactDao,
            ebolaScreeningDao = ebolaScreeningDao,
            ivInfusionDao = ivInfusionDao,
            ivInfusionCheckDao = ivInfusionCheckDao,
            htsEventDao = mockk(relaxed = true),
            hivCareDao = mockk(relaxed = true),
            tbEpisodeDao = mockk(relaxed = true),
            viralLoadDao = mockk(relaxed = true),
            supabaseApi = supabaseApi,
            networkMonitor = networkMonitor,
            pullReconciliationService = pullReconciliationService,
            syncDebugLogger = syncDebugLogger,
            prescriptionOrderRepository = prescriptionOrderRepository,
            authTokenStore = authTokenStore,
            tokenRefresher = tokenRefresher,
            json = json,
        )
    }

    // ---------------------------------------------------------------------
    // WP2 test #1 — the gate. The engine attempts whenever ANY network is
    // connected (INTERNET capability), even when validation has not passed.
    // ---------------------------------------------------------------------

    @Test
    fun `processes entries when connected but not validated`() = runTest {
        // isConnected true, isOnline (validated) false — would have bailed before.
        every { networkMonitor.isConnected() } returns true

        val entry = makeLabResultEntry("sync-lab-1", visitId = "visit-1")
        coEvery { syncQueueDao.getRetryable(any()) } returns listOf(entry)
        coEvery { supabaseApi.rpcRecordLabResult(any()) } returns Response.success("".toResponseBody())

        val result = syncEngine.processQueue()

        assertEquals(1, result)
        coVerify { supabaseApi.rpcRecordLabResult(any()) }
    }

    @Test
    fun `bails and leaves entries untouched when not connected`() = runTest {
        every { networkMonitor.isConnected() } returns false

        val result = syncEngine.processQueue()

        assertEquals(0, result)
        coVerify(exactly = 0) { syncQueueDao.getRetryable(any()) }
        // Telemetry records the no-network bail (WP2 D6).
        verify {
            syncDebugLogger.log(
                any(), any(), "queue_run_summary",
                match { it["bailedNoNetwork"] == "true" }, any(),
            )
        }
    }

    @Test
    fun `processQueue returns 0 when queue is empty`() = runTest {
        every { networkMonitor.isConnected() } returns true
        coEvery { syncQueueDao.getRetryable(any()) } returns emptyList()
        coEvery { syncQueueDao.getPending() } returns emptyList()

        val result = syncEngine.processQueue()

        assertEquals(0, result)
    }

    @Test
    fun `skips entry when dependency not completed`() = runTest {
        every { networkMonitor.isConnected() } returns true

        val depEntry = makeSyncEntry("dep-1", operationType = "create_patient", status = "pending")
        val entry = makeSyncEntry("entry-1", operationType = "create_visit", dependsOn = "dep-1")

        coEvery { syncQueueDao.getRetryable(any()) } returns listOf(entry)
        coEvery { syncQueueDao.getById("dep-1") } returns depEntry

        val result = syncEngine.processQueue()

        assertEquals(0, result)
    }

    @Test
    fun `increments attempts on failure`() = runTest {
        every { networkMonitor.isConnected() } returns true

        val entry = makeSyncEntry(
            "entry-1",
            operationType = "create_patient",
            payload = "invalid json", // Will cause deserialization failure (transient default)
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
    fun `processes finalize_clinical_encounter and reconciles`() = runTest {
        every { networkMonitor.isConnected() } returns true

        val payload = json.encodeToString(
            FinalizeClinicalEncounterRequest.serializer(),
            FinalizeClinicalEncounterRequest(
                noteId = "note-1",
                visitId = "visit-1",
                patientId = "patient-1",
                transcript = "Patient presents with fever for two days.",
                patientSummary = "You were seen today for fever. Take paracetamol as directed.",
            ),
        )
        val entry = makeSyncEntry(
            id = "sync-finalize-1",
            operationType = "finalize_clinical_encounter",
            payload = payload,
            entityId = "visit-1",
        )

        coEvery { syncQueueDao.getRetryable(any()) } returns listOf(entry)
        coEvery { syncQueueDao.getPending() } returns emptyList()
        coEvery { supabaseApi.rpcFinalizeClinicalEncounter(any()) } returns
            Response.success("".toResponseBody())
        coEvery { supabaseApi.getProviderNote(any()) } returns emptyList()

        val result = syncEngine.processQueue()

        assertEquals(1, result)
        coVerify { supabaseApi.rpcFinalizeClinicalEncounter(any()) }
        coVerify { visitDao.updateSyncState("visit-1", true) }
        coVerify { pullReconciliationService.reconcileAfterPull() }
    }

    @Test
    fun `marks as failed after max attempts`() = runTest {
        every { networkMonitor.isConnected() } returns true

        val entry = makeSyncEntry(
            "entry-1",
            operationType = "create_patient",
            payload = "invalid json",
            attempts = 4, // One more will reach maxAttempts=5
            maxAttempts = 5,
        )

        coEvery { syncQueueDao.getRetryable(any()) } returns listOf(entry)

        syncEngine.processQueue()

        coVerify {
            syncQueueDao.update(match {
                it.attempts == 5 && it.status == "failed"
            })
        }
    }

    @Test
    fun `resets stale in_progress entries at run start`() = runTest {
        every { networkMonitor.isConnected() } returns true
        coEvery { syncQueueDao.resetInProgress() } returns 2
        coEvery { syncQueueDao.getRetryable(any()) } returns emptyList()

        syncEngine.processQueue()

        coVerify { syncQueueDao.resetInProgress() }
    }

    @Test
    fun `keeps visit is_synced false while sibling ops are still active`() = runTest {
        every { networkMonitor.isConnected() } returns true

        val entry = makeLabResultEntry("sync-lab-1", visitId = "visit-1")
        coEvery { syncQueueDao.getRetryable(any()) } returns listOf(entry)
        coEvery { supabaseApi.rpcRecordLabResult(any()) } returns Response.success("".toResponseBody())
        // A sibling op (e.g. rpc_record_dispense) for the same visit is still queued.
        coEvery { syncQueueDao.countActiveForEntity("visit-1", "sync-lab-1") } returns 1

        val result = syncEngine.processQueue()

        assertEquals(1, result)
        coVerify(exactly = 0) { visitDao.updateSyncState(any(), true) }
    }

    @Test
    fun `marks visit is_synced true when no sibling ops remain`() = runTest {
        every { networkMonitor.isConnected() } returns true

        val entry = makeLabResultEntry("sync-lab-1", visitId = "visit-1")
        coEvery { syncQueueDao.getRetryable(any()) } returns listOf(entry)
        coEvery { supabaseApi.rpcRecordLabResult(any()) } returns Response.success("".toResponseBody())
        coEvery { syncQueueDao.countActiveForEntity("visit-1", "sync-lab-1") } returns 0

        val result = syncEngine.processQueue()

        assertEquals(1, result)
        coVerify { visitDao.updateSyncState("visit-1", true) }
    }

    @Test
    fun `cancellation requeues entry without counting an attempt or failing it`() = runTest {
        every { networkMonitor.isConnected() } returns true

        val entry = makeLabResultEntry("sync-lab-1", visitId = "visit-1")
        coEvery { syncQueueDao.getRetryable(any()) } returns listOf(entry)
        coEvery { supabaseApi.rpcRecordLabResult(any()) } throws CancellationException("worker replaced")

        try {
            syncEngine.processQueue()
            fail("CancellationException must propagate")
        } catch (_: CancellationException) {
            // expected
        }

        coVerify {
            syncQueueDao.update(match { it.id == "sync-lab-1" && it.status == "pending" && it.attempts == 0 })
        }
        coVerify(exactly = 0) {
            syncQueueDao.update(match { it.attempts > 0 || it.status == "failed" })
        }
    }

    // ---------------------------------------------------------------------
    // WP2 test #2 — permanent 4xx dead-letters immediately and cascades.
    // ---------------------------------------------------------------------

    @Test
    fun `permanent 4xx marks failed at max attempts after one attempt and cascades`() = runTest {
        every { networkMonitor.isConnected() } returns true

        val entry = makeLabResultEntry("sync-lab-1", visitId = "visit-1", maxAttempts = 10)
        val dependent = makeSyncEntry(
            "dep-1",
            operationType = "record_payment",
            dependsOn = "sync-lab-1",
            status = "pending",
        )
        coEvery { syncQueueDao.getRetryable(any()) } returns listOf(entry)
        coEvery { syncQueueDao.getDependents("sync-lab-1") } returns listOf(dependent)
        coEvery { supabaseApi.rpcRecordLabResult(any()) } returns Response.error(400, "bad request".toResponseBody())

        syncEngine.processQueue()

        // Failed immediately with attempts pinned to the max (no burning 10 retries).
        coVerify {
            syncQueueDao.update(match { it.id == "sync-lab-1" && it.status == "failed" && it.attempts == 10 })
        }
        // Dependent is cascaded to failed.
        coVerify {
            syncQueueDao.update(match { it.id == "dep-1" && it.status == "failed" })
        }
    }

    // ---------------------------------------------------------------------
    // WP-A — cascaded failures are terminally failed (blocked:), not pending.
    // ---------------------------------------------------------------------

    @Test
    fun `cascadeMarksDependentsTerminallyFailed`() = runTest {
        every { networkMonitor.isConnected() } returns true

        val parent = makeLabResultEntry("parent-1", visitId = "visit-1", maxAttempts = 10)
        val child = makeSyncEntry(
            "child-1",
            operationType = "record_payment",
            dependsOn = "parent-1",
            status = "pending",
            maxAttempts = 10,
        )
        val grandchild = makeSyncEntry(
            "grandchild-1",
            operationType = "rpc_create_referral",
            dependsOn = "child-1",
            status = "pending",
            maxAttempts = 10,
        )
        coEvery { syncQueueDao.getRetryable(any()) } returns listOf(parent)
        coEvery { syncQueueDao.getDependents("parent-1") } returns listOf(child)
        coEvery { syncQueueDao.getDependents("child-1") } returns listOf(grandchild)
        coEvery { syncQueueDao.getDependents("grandchild-1") } returns emptyList()
        coEvery { supabaseApi.rpcRecordLabResult(any()) } returns Response.error(422, "unprocessable".toResponseBody())

        syncEngine.processQueue()

        coVerify {
            syncQueueDao.update(match {
                it.id == "child-1" &&
                    it.status == "failed" &&
                    it.attempts == 10 &&
                    it.lastError.orEmpty().startsWith("blocked:")
            })
        }
        coVerify {
            syncQueueDao.update(match {
                it.id == "grandchild-1" &&
                    it.status == "failed" &&
                    it.attempts == 10 &&
                    it.lastError.orEmpty().startsWith("blocked:")
            })
        }
    }

    @Test
    fun `blockedChildrenAreNotRetriedNorCounted`() {
        val blocked = makeSyncEntry(
            "blocked-1",
            status = "failed",
            attempts = 10,
            maxAttempts = 10,
            lastError = "blocked: upstream create_patient failed",
        )
        val retryable = makeSyncEntry("retry-1", status = "pending", attempts = 0, maxAttempts = 10)

        fun countsToRetryable(e: SyncQueueEntry) =
            e.status in setOf("pending", "failed") &&
                e.attempts < e.maxAttempts &&
                (e.nextRetryAt == null || e.nextRetryAt <= System.currentTimeMillis())
        fun countsToPendingPill(e: SyncQueueEntry) =
            e.status in setOf("pending", "failed") && e.attempts < e.maxAttempts
        fun countsToNeedsAttention(e: SyncQueueEntry) =
            e.status == "failed" && e.attempts >= e.maxAttempts

        assertFalse(countsToRetryable(blocked))
        assertFalse(countsToPendingPill(blocked))
        assertTrue(countsToNeedsAttention(blocked))
        assertTrue(countsToRetryable(retryable))
        assertTrue(countsToPendingPill(retryable))
        assertFalse(countsToNeedsAttention(retryable))
    }

    @Test
    fun `retryAllRoundTripReblocksChildren`() = runTest {
        every { networkMonitor.isConnected() } returns true

        val parent = makeLabResultEntry("parent-1", visitId = "visit-1", maxAttempts = 10)
        val child = makeSyncEntry(
            "child-1",
            operationType = "record_payment",
            dependsOn = "parent-1",
            status = "pending",
            attempts = 0,
            maxAttempts = 10,
        )
        // After resetFailed the parent is pending again; only the parent is
        // retryable on this run — cascade re-blocks the child when it perm-fails.
        coEvery { syncQueueDao.getRetryable(any()) } returns listOf(parent)
        coEvery { syncQueueDao.getDependents("parent-1") } returns listOf(child)
        coEvery { syncQueueDao.getDependents("child-1") } returns emptyList()
        coEvery { supabaseApi.rpcRecordLabResult(any()) } returns Response.error(422, "unprocessable".toResponseBody())

        syncEngine.processQueue()

        coVerify {
            syncQueueDao.update(match {
                it.id == "child-1" &&
                    it.status == "failed" &&
                    it.attempts == 10 &&
                    it.lastError.orEmpty().startsWith("blocked:")
            })
        }
    }

    @Test
    fun `permanent 422 dead-letters immediately`() = runTest {
        every { networkMonitor.isConnected() } returns true

        val entry = makeLabResultEntry("sync-lab-1", visitId = "visit-1", maxAttempts = 10)
        coEvery { syncQueueDao.getRetryable(any()) } returns listOf(entry)
        coEvery { supabaseApi.rpcRecordLabResult(any()) } returns Response.error(422, "unprocessable".toResponseBody())

        syncEngine.processQueue()

        coVerify {
            syncQueueDao.update(match { it.id == "sync-lab-1" && it.status == "failed" && it.attempts == 10 })
        }
    }

    // ---------------------------------------------------------------------
    // WP2 test #3 — transient errors retry with capped backoff.
    // ---------------------------------------------------------------------

    @Test
    fun `transient 503 keeps entry pending with one attempt and a retry time`() = runTest {
        every { networkMonitor.isConnected() } returns true

        val entry = makeLabResultEntry("sync-lab-1", visitId = "visit-1", maxAttempts = 10)
        coEvery { syncQueueDao.getRetryable(any()) } returns listOf(entry)
        coEvery { supabaseApi.rpcRecordLabResult(any()) } returns Response.error(503, "unavailable".toResponseBody())

        syncEngine.processQueue()

        coVerify {
            syncQueueDao.update(match {
                it.id == "sync-lab-1" && it.status == "pending" && it.attempts == 1 && it.nextRetryAt != null
            })
        }
    }

    @Test
    fun `socket timeout is transient`() = runTest {
        every { networkMonitor.isConnected() } returns true

        val entry = makeLabResultEntry("sync-lab-1", visitId = "visit-1", maxAttempts = 10)
        coEvery { syncQueueDao.getRetryable(any()) } returns listOf(entry)
        coEvery { supabaseApi.rpcRecordLabResult(any()) } throws SocketTimeoutException("timed out")

        syncEngine.processQueue()

        coVerify {
            syncQueueDao.update(match {
                it.id == "sync-lab-1" && it.status == "pending" && it.attempts == 1 && it.nextRetryAt != null
            })
        }
    }

    @Test
    fun `transient backoff never exceeds ten minutes at attempt six`() = runTest {
        every { networkMonitor.isConnected() } returns true

        // attempts=5 -> nextAttempt=6; uncapped backoff would be ~16 min.
        val entry = makeLabResultEntry("sync-lab-1", visitId = "visit-1", attempts = 5, maxAttempts = 10)
        coEvery { syncQueueDao.getRetryable(any()) } returns listOf(entry)
        coEvery { supabaseApi.rpcRecordLabResult(any()) } returns Response.error(503, "unavailable".toResponseBody())

        val updates = mutableListOf<SyncQueueEntry>()
        coEvery { syncQueueDao.update(capture(updates)) } just Runs

        val before = System.currentTimeMillis()
        syncEngine.processQueue()

        val failed = updates.first { it.id == "sync-lab-1" && it.attempts == 6 }
        val backoff = failed.nextRetryAt!! - before
        assertTrue("backoff should be capped at 10 min, was $backoff ms", backoff <= 601_000L)
        assertTrue("backoff should still be a real (capped) delay, was $backoff ms", backoff > 590_000L)
    }

    // ---------------------------------------------------------------------
    // WP2 test #4 — 401 refresh-and-retry flow.
    // ---------------------------------------------------------------------

    @Test
    fun `401 refreshes once then retries same entry to completion without spending an attempt`() = runTest {
        every { networkMonitor.isConnected() } returns true

        val entry = makeLabResultEntry("sync-lab-1", visitId = "visit-1", maxAttempts = 10)
        coEvery { syncQueueDao.getRetryable(any()) } returns listOf(entry)
        coEvery { tokenRefresher.refreshToken() } returns true
        // First call 401, retry succeeds.
        coEvery { supabaseApi.rpcRecordLabResult(any()) } returnsMany listOf(
            Response.error(401, "unauthorized".toResponseBody()),
            Response.success("".toResponseBody()),
        )

        val result = syncEngine.processQueue()

        assertEquals(1, result)
        coVerify(exactly = 1) { tokenRefresher.refreshToken() }
        // Completed with attempts still 0 (the 401 retry did not burn a slot).
        coVerify {
            syncQueueDao.update(match { it.id == "sync-lab-1" && it.status == "completed" && it.attempts == 0 })
        }
    }

    @Test
    fun `401 with failed refresh keeps entry pending as transient not dead-lettered`() = runTest {
        every { networkMonitor.isConnected() } returns true

        val entry = makeLabResultEntry("sync-lab-1", visitId = "visit-1", maxAttempts = 10)
        coEvery { syncQueueDao.getRetryable(any()) } returns listOf(entry)
        coEvery { tokenRefresher.refreshToken() } returns false
        coEvery { supabaseApi.rpcRecordLabResult(any()) } returns Response.error(401, "unauthorized".toResponseBody())

        syncEngine.processQueue()

        coVerify(exactly = 1) { tokenRefresher.refreshToken() }
        // Transient: pending with one attempt, NOT failed/dead-lettered.
        coVerify {
            syncQueueDao.update(match {
                it.id == "sync-lab-1" && it.status == "pending" && it.attempts == 1
            })
        }
        coVerify(exactly = 0) {
            syncQueueDao.update(match { it.id == "sync-lab-1" && it.status == "failed" })
        }
    }

    // ---------------------------------------------------------------------
    // WP2 test #5 — classifier table test (pure function).
    // ---------------------------------------------------------------------

    @Test
    fun `classifySyncError maps codes and exceptions to the right kind`() {
        fun http(code: Int) = classifySyncError(SyncHttpException(code, "", "op"))

        assertEquals(SyncErrorKind.PERMANENT, http(400))
        assertEquals(SyncErrorKind.AUTH, http(401))
        assertEquals(SyncErrorKind.PERMANENT, http(403))
        assertEquals(SyncErrorKind.PERMANENT, http(404))
        assertEquals(SyncErrorKind.TRANSIENT, http(408))
        assertEquals(SyncErrorKind.PERMANENT, http(409))
        assertEquals(SyncErrorKind.PERMANENT, http(422))
        assertEquals(SyncErrorKind.TRANSIENT, http(429))
        assertEquals(SyncErrorKind.TRANSIENT, http(500))
        assertEquals(SyncErrorKind.TRANSIENT, http(503))
        assertEquals(SyncErrorKind.TRANSIENT, classifySyncError(java.io.IOException("boom")))
        assertEquals(SyncErrorKind.TRANSIENT, classifySyncError(SocketTimeoutException("slow")))
        // Unknown non-HTTP errors default to transient (keep the retry budget).
        assertEquals(SyncErrorKind.TRANSIENT, classifySyncError(IllegalStateException("weird")))
    }

    // ---------------------------------------------------------------------
    // WP2 test #6 — pending-pill vs needs-attention counts are disjoint and
    // together cover every non-completed entry (guards D4 from double counting).
    // These predicates mirror SyncQueueDao.getPendingCount() and
    // getTerminallyFailedCount() SQL.
    // ---------------------------------------------------------------------

    @Test
    fun `pending and needs-attention buckets are disjoint and cover all non-completed entries`() {
        // getPendingCount: status IN (pending, failed) AND attempts < max_attempts
        fun countsToPendingPill(e: SyncQueueEntry) =
            e.status in setOf("pending", "failed") && e.attempts < e.maxAttempts
        // getTerminallyFailedCount: status = failed AND attempts >= max_attempts
        fun countsToNeedsAttention(e: SyncQueueEntry) =
            e.status == "failed" && e.attempts >= e.maxAttempts

        val entries = listOf(
            makeSyncEntry("a", status = "pending", attempts = 0, maxAttempts = 10),
            makeSyncEntry("b", status = "pending", attempts = 3, maxAttempts = 10),
            makeSyncEntry("c", status = "failed", attempts = 4, maxAttempts = 10),   // retrying
            makeSyncEntry("d", status = "failed", attempts = 10, maxAttempts = 10),  // dead-letter
            makeSyncEntry("e", status = "failed", attempts = 12, maxAttempts = 10),  // dead-letter
        )

        for (e in entries) {
            val inPill = countsToPendingPill(e)
            val inAttention = countsToNeedsAttention(e)
            // Disjoint: never counted twice.
            assertFalse("entry ${e.id} counted in both buckets", inPill && inAttention)
            // Covering: every non-completed entry lands in exactly one bucket.
            assertTrue("entry ${e.id} counted in neither bucket", inPill || inAttention)
        }

        assertEquals(2, entries.count(::countsToNeedsAttention))
        assertEquals(3, entries.count(::countsToPendingPill))
    }

    @Test
    fun `queuedCheckInMarksVisitSyncedWhenQuiet`() = runTest {
        every { networkMonitor.isConnected() } returns true

        val visitId = "visit-checkin-1"
        val payload = buildJsonObject {
            put("rpc", "check_in_patient")
            put(
                "params",
                buildJsonObject {
                    put("p_clinic_id", "clinic-1")
                    put("p_patient_id", "patient-1")
                    put("p_visit_id", visitId)
                    put("p_client_op_id", "op-checkin-1")
                },
            )
        }
        val entry = makeSyncEntry(
            id = "op-checkin-1",
            operationType = "queue_op",
            entityId = visitId,
            payload = json.encodeToString(
                kotlinx.serialization.json.JsonObject.serializer(),
                payload,
            ),
        )

        coEvery { syncQueueDao.getRetryable(any()) } returns listOf(entry)
        coEvery { supabaseApi.checkInPatient(any()) } returns Response.success("".toResponseBody())
        coEvery { syncQueueDao.countActiveForEntity(visitId, "op-checkin-1") } returns 0

        val result = syncEngine.processQueue()

        assertEquals(1, result)
        coVerify { visitDao.updateSyncState(visitId, true) }
    }

    private fun makeLabResultEntry(
        id: String,
        visitId: String,
        attempts: Int = 0,
        maxAttempts: Int = 5,
    ) = makeSyncEntry(
        id = id,
        operationType = "rpc_record_lab_result",
        payload = json.encodeToString(
            RecordLabResultRequest.serializer(),
            RecordLabResultRequest(visitId = visitId, result = "MRDT positive", abnormal = true),
        ),
        entityId = visitId,
        attempts = attempts,
        maxAttempts = maxAttempts,
    )

    private fun makeSyncEntry(
        id: String,
        operationType: String = "create_patient",
        status: String = "pending",
        payload: String = "{}",
        dependsOn: String? = null,
        attempts: Int = 0,
        maxAttempts: Int = 5,
        entityId: String? = null,
        lastError: String? = null,
        nextRetryAt: Long? = null,
    ) = SyncQueueEntry(
        id = id,
        operationType = operationType,
        entityType = "test",
        entityId = entityId ?: "entity-$id",
        payload = payload,
        status = status,
        attempts = attempts,
        maxAttempts = maxAttempts,
        createdAt = System.currentTimeMillis(),
        dependsOn = dependsOn,
        lastError = lastError,
        nextRetryAt = nextRetryAt,
    )
}
