package com.karibuhealth.app.data.sync

import androidx.work.ExistingWorkPolicy
import androidx.work.WorkManager
import com.karibuhealth.app.data.local.db.dao.SyncQueueDao
import com.karibuhealth.app.data.local.db.entity.SyncQueueEntry
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test

class SyncQueueHelperTest {

    private lateinit var syncQueueDao: SyncQueueDao
    private lateinit var workManager: WorkManager
    private lateinit var helper: SyncQueueHelper

    @Before
    fun setup() {
        syncQueueDao = mockk(relaxed = true)
        workManager = mockk(relaxed = true)
        helper = SyncQueueHelper(syncQueueDao, workManager)
    }

    @Test
    fun `enqueue returns new entry id when no existing row`() = runTest {
        coEvery { syncQueueDao.getByEntityAndOperation("visit-1", "rpc_record_lab_result") } returns null
        val entry = makeEntry(id = "new-id", entityId = "visit-1", operationType = "rpc_record_lab_result")

        val returned = helper.enqueue(entry)

        assertEquals("new-id", returned)
        coVerify { syncQueueDao.insert(entry) }
    }

    @Test
    fun `enqueue dedups onto surviving row and returns ITS id not the new one`() = runTest {
        val surviving = makeEntry(
            id = "surviving-id",
            entityId = "visit-1",
            operationType = "rpc_record_lab_result",
            payload = """{"old":"payload"}""",
        ).copy(attempts = 3, lastError = "boom")
        coEvery {
            syncQueueDao.getByEntityAndOperation("visit-1", "rpc_record_lab_result")
        } returns surviving

        val newEntry = makeEntry(
            id = "new-id",
            entityId = "visit-1",
            operationType = "rpc_record_lab_result",
            payload = """{"new":"payload"}""",
        )

        val returned = helper.enqueue(newEntry)

        // Callers MUST thread this id into dependsOn chains — the "new-id"
        // row is never inserted, so depending on it would strand dependents.
        assertEquals("surviving-id", returned)
        coVerify(exactly = 0) { syncQueueDao.insert(any()) }
        coVerify {
            syncQueueDao.update(match {
                it.id == "surviving-id" &&
                    it.payload == """{"new":"payload"}""" &&
                    it.status == "pending" &&
                    it.attempts == 0 &&
                    it.lastError == null
            })
        }
    }

    @Test
    fun `enqueue inserts fresh row when existing entry already completed`() = runTest {
        val completed = makeEntry(
            id = "done-id",
            entityId = "visit-1",
            operationType = "rpc_record_lab_result",
        ).copy(status = "completed")
        coEvery {
            syncQueueDao.getByEntityAndOperation("visit-1", "rpc_record_lab_result")
        } returns completed

        val newEntry = makeEntry(id = "new-id", entityId = "visit-1", operationType = "rpc_record_lab_result")
        val returned = helper.enqueue(newEntry)

        assertEquals("new-id", returned)
        coVerify { syncQueueDao.insert(newEntry) }
    }

    @Test
    fun `immediate sync uses APPEND_OR_REPLACE so running batches are not cancelled`() {
        helper.scheduleImmediateSync()

        verify {
            workManager.enqueueUniqueWork(
                SyncWorker.WORK_NAME_IMMEDIATE,
                ExistingWorkPolicy.APPEND_OR_REPLACE,
                any<androidx.work.OneTimeWorkRequest>(),
            )
        }
    }

    @Test
    fun `enqueueOntoDeadParentIsBlockedImmediately`() = runTest {
        val parent = makeEntry(
            id = "parent-id",
            entityId = "patient-1",
            operationType = "create_patient",
        ).copy(status = "failed", attempts = 10, lastError = "permanent failure")
        coEvery { syncQueueDao.getByEntityAndOperation("visit-1", "create_visit") } returns null
        coEvery { syncQueueDao.getById("parent-id") } returns parent

        val entry = makeEntry(
            id = "child-id",
            entityId = "visit-1",
            operationType = "create_visit",
        ).copy(dependsOn = "parent-id")

        val returned = helper.enqueue(entry)

        assertEquals("child-id", returned)
        coVerify {
            syncQueueDao.update(match {
                it.id == "child-id" &&
                    it.status == "failed" &&
                    it.attempts == it.maxAttempts &&
                    it.lastError.orEmpty().startsWith("blocked:")
            })
        }
        verify(exactly = 0) {
            workManager.enqueueUniqueWork(any(), any(), any<androidx.work.OneTimeWorkRequest>())
        }
    }

    @Test
    fun `autosaveReuseDoesNotResurrectBlockedRow`() = runTest {
        val parent = makeEntry(
            id = "parent-id",
            entityId = "patient-1",
            operationType = "create_patient",
        ).copy(status = "failed", attempts = 10, lastError = "permanent failure")
        val blocked = makeEntry(
            id = "note-id",
            entityId = "visit-1",
            operationType = "upsert_provider_note",
            payload = """{"old":"draft"}""",
        ).copy(
            status = "failed",
            attempts = 10,
            lastError = "blocked: upstream create_visit failed",
            dependsOn = "parent-id",
        )
        coEvery {
            syncQueueDao.getByEntityAndOperation("visit-1", "upsert_provider_note")
        } returns blocked
        coEvery { syncQueueDao.getById("parent-id") } returns parent

        val autosave = makeEntry(
            id = "new-note-id",
            entityId = "visit-1",
            operationType = "upsert_provider_note",
            payload = """{"new":"draft"}""",
        ).copy(dependsOn = "parent-id")

        val returned = helper.enqueue(autosave)

        assertEquals("note-id", returned)
        coVerify {
            syncQueueDao.update(match {
                it.id == "note-id" &&
                    it.payload == """{"new":"draft"}""" &&
                    it.status == "failed" &&
                    it.attempts == it.maxAttempts &&
                    it.lastError.orEmpty().startsWith("blocked:")
            })
        }
        verify(exactly = 0) {
            workManager.enqueueUniqueWork(any(), any(), any<androidx.work.OneTimeWorkRequest>())
        }
    }

    private fun makeEntry(
        id: String,
        entityId: String,
        operationType: String,
        payload: String = "{}",
    ) = SyncQueueEntry(
        id = id,
        operationType = operationType,
        entityType = "visits",
        entityId = entityId,
        payload = payload,
        status = "pending",
        attempts = 0,
        createdAt = System.currentTimeMillis(),
    )
}
