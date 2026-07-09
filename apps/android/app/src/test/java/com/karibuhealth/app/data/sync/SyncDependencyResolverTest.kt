package com.karibuhealth.app.data.sync

import com.karibuhealth.app.data.local.db.dao.SyncQueueDao
import com.karibuhealth.app.data.local.db.entity.SyncQueueEntry
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test

class SyncDependencyResolverTest {

    private lateinit var syncQueueDao: SyncQueueDao
    private lateinit var resolver: SyncDependencyResolver

    @Before
    fun setup() {
        syncQueueDao = mockk()
        resolver = SyncDependencyResolver(syncQueueDao)
    }

    @Test
    fun matchesPendingCreateVisit() = runTest {
        val entry = makeEntry(
            id = "create-1",
            entityId = "visit-1",
            operationType = "create_visit",
            status = "pending",
        )
        coEvery { syncQueueDao.getByEntityAndOperation("visit-1", "create_visit") } returns entry

        assertEquals("create-1", resolver.pendingVisitDependency("visit-1"))
    }

    @Test
    fun matchesPendingCheckInQueueOp() = runTest {
        val checkIn = makeEntry(
            id = "checkin-1",
            entityId = "visit-1",
            operationType = "queue_op",
            payload = """{"rpc":"check_in_patient","params":{}}""",
            status = "pending",
        )
        val assignNurse = makeEntry(
            id = "assign-1",
            entityId = "visit-1",
            operationType = "queue_op",
            payload = """{"rpc":"assign_to_nurse","params":{}}""",
            status = "pending",
        )
        coEvery { syncQueueDao.getByEntityAndOperation("visit-1", "create_visit") } returns null
        coEvery { syncQueueDao.getByEntityAndOperation("visit-1", "queue_op") } returns checkIn

        assertEquals("checkin-1", resolver.pendingVisitDependency("visit-1"))

        coEvery { syncQueueDao.getByEntityAndOperation("visit-1", "queue_op") } returns assignNurse
        assertNull(resolver.pendingVisitDependency("visit-1"))
    }

    @Test
    fun completedCreatorReturnsNull() = runTest {
        val completed = makeEntry(
            id = "create-1",
            entityId = "visit-1",
            operationType = "create_visit",
            status = "completed",
        )
        coEvery { syncQueueDao.getByEntityAndOperation("visit-1", "create_visit") } returns completed
        coEvery { syncQueueDao.getByEntityAndOperation("visit-1", "queue_op") } returns null

        assertNull(resolver.pendingVisitDependency("visit-1"))
    }

    private fun makeEntry(
        id: String,
        entityId: String,
        operationType: String,
        payload: String = "{}",
        status: String = "pending",
    ) = SyncQueueEntry(
        id = id,
        operationType = operationType,
        entityType = "visits",
        entityId = entityId,
        payload = payload,
        status = status,
        attempts = 0,
        createdAt = System.currentTimeMillis(),
    )
}
