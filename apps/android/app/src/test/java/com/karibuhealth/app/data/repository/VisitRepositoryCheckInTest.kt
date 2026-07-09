package com.karibuhealth.app.data.repository

import com.karibuhealth.app.data.local.db.KaribuDatabase
import com.karibuhealth.app.data.local.db.dao.SyncQueueDao
import com.karibuhealth.app.data.local.db.dao.VisitDao
import com.karibuhealth.app.data.local.db.entity.SyncQueueEntry
import com.karibuhealth.app.data.local.db.entity.VisitEntity
import com.karibuhealth.app.data.remote.api.SupabaseApi
import com.karibuhealth.app.data.remote.dto.VisitDto
import com.karibuhealth.app.data.sync.SyncQueueHelper
import com.karibuhealth.app.util.NetworkMonitor
import io.mockk.*
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import retrofit2.Response

class VisitRepositoryCheckInTest {

    private lateinit var database: KaribuDatabase
    private lateinit var visitDao: VisitDao
    private lateinit var syncQueueDao: SyncQueueDao
    private lateinit var syncQueueHelper: SyncQueueHelper
    private lateinit var supabaseApi: SupabaseApi
    private lateinit var networkMonitor: NetworkMonitor
    private lateinit var prescriptionOrderRepository: PrescriptionOrderRepository
    private lateinit var repository: VisitRepository
    private val json = Json { ignoreUnknownKeys = true }

    @Before
    fun setup() {
        database = mockk(relaxed = true)
        visitDao = mockk(relaxed = true)
        syncQueueDao = mockk(relaxed = true)
        syncQueueHelper = mockk(relaxed = true)
        supabaseApi = mockk(relaxed = true)
        networkMonitor = mockk()
        prescriptionOrderRepository = mockk(relaxed = true)

        repository = VisitRepository(
            database = database,
            visitDao = visitDao,
            syncQueueDao = syncQueueDao,
            syncQueueHelper = syncQueueHelper,
            supabaseApi = supabaseApi,
            networkMonitor = networkMonitor,
            prescriptionOrderRepository = prescriptionOrderRepository,
            json = json,
        )
    }

    @Test
    fun directCheckInSendsVisitIdAndOpId() = runTest {
        every { networkMonitor.isOnline() } returns true

        val paramsSlot = slot<JsonObject>()
        var storedVisit: VisitEntity? = null

        coEvery { supabaseApi.checkInPatient(capture(paramsSlot)) } answers {
            val visitId = paramsSlot.captured["p_visit_id"]!!.jsonPrimitive.content
            Response.success("\"$visitId\"".toResponseBody())
        }

        coEvery { supabaseApi.getVisitById(any()) } answers {
            val visitId = paramsSlot.captured["p_visit_id"]!!.jsonPrimitive.content
            listOf(
                VisitDto(
                    id = visitId,
                    clinicId = "clinic-1",
                    patientId = "patient-1",
                    visitDate = "2026-07-09",
                    createdAt = "2026-07-09T00:00:00Z",
                    updatedAt = "2026-07-09T00:00:00Z",
                ),
            )
        }

        coEvery { visitDao.upsert(any()) } answers {
            storedVisit = firstArg()
        }
        coEvery { visitDao.getByIdOnce(any()) } answers { storedVisit }

        val (visit, queuedId) = repository.checkInPatient(
            clinicId = "clinic-1",
            patientId = "patient-1",
            chiefComplaint = "headache",
        )

        assertNotNull(paramsSlot.captured["p_visit_id"])
        assertNotNull(paramsSlot.captured["p_client_op_id"])
        val expectedVisitId = paramsSlot.captured["p_visit_id"]!!.jsonPrimitive.content
        assertEquals(expectedVisitId, visit.id)
        assertEquals(expectedVisitId, storedVisit?.id)
        assertNull(queuedId)
    }

    @Test
    fun offlineCheckInQueuesSameVisitId() = runTest {
        every { networkMonitor.isOnline() } returns false
        coEvery { visitDao.getMaxQueuePosition(any(), any()) } returns 0

        val entrySlot = slot<SyncQueueEntry>()
        coEvery { syncQueueHelper.enqueue(capture(entrySlot)) } answers { entrySlot.captured.id }

        val (visit, queuedId) = repository.checkInPatient(
            clinicId = "clinic-1",
            patientId = "patient-1",
            chiefComplaint = "fever",
        )

        val payload = json.decodeFromString(JsonObject.serializer(), entrySlot.captured.payload)
        val params = payload["params"]!!.jsonObject

        assertEquals(visit.id, params["p_visit_id"]!!.jsonPrimitive.content)
        assertEquals(entrySlot.captured.id, params["p_client_op_id"]!!.jsonPrimitive.content)
        assertEquals(entrySlot.captured.id, queuedId)
        coVerify { visitDao.upsert(match { it.id == visit.id && !it.isSynced }) }
    }

    @Test
    fun payloadSurvivesHostileChiefComplaint() = runTest {
        every { networkMonitor.isOnline() } returns false
        coEvery { visitDao.getMaxQueuePosition(any(), any()) } returns 0

        val hostile = "line1\nline2 \"quoted\" \\slash"
        val entrySlot = slot<SyncQueueEntry>()
        coEvery { syncQueueHelper.enqueue(capture(entrySlot)) } answers { entrySlot.captured.id }

        repository.checkInPatient(
            clinicId = "clinic-1",
            patientId = "patient-1",
            chiefComplaint = hostile,
        )

        val decoded = json.decodeFromString(JsonObject.serializer(), entrySlot.captured.payload)
        assertEquals(hostile, decoded["params"]!!.jsonObject["p_chief_complaint"]!!.jsonPrimitive.content)
    }

    @Test
    fun nullStaffIdOmittedFromPayload() = runTest {
        every { networkMonitor.isOnline() } returns false
        coEvery { visitDao.getMaxQueuePosition(any(), any()) } returns 0

        val entrySlot = slot<SyncQueueEntry>()
        coEvery { syncQueueHelper.enqueue(capture(entrySlot)) } answers { entrySlot.captured.id }

        repository.checkInPatient(
            clinicId = "clinic-1",
            patientId = "patient-1",
            staffId = null,
        )

        val params = json.decodeFromString(JsonObject.serializer(), entrySlot.captured.payload)["params"]!!.jsonObject
        assertFalse(params.containsKey("p_staff_id"))
    }
}
