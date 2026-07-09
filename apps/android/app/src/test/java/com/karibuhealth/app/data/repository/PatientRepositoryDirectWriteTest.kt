package com.karibuhealth.app.data.repository

import com.karibuhealth.app.data.local.db.KaribuDatabase
import com.karibuhealth.app.data.local.db.dao.PatientDao
import com.karibuhealth.app.data.local.db.dao.SyncQueueDao
import com.karibuhealth.app.data.remote.DirectWriteExecutor
import com.karibuhealth.app.data.remote.api.SupabaseApi
import com.karibuhealth.app.data.sync.SyncQueueHelper
import com.karibuhealth.app.data.sync.TokenRefresher
import com.karibuhealth.app.util.NetworkMonitor
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import retrofit2.Response

class PatientRepositoryDirectWriteTest {

    private lateinit var database: KaribuDatabase
    private lateinit var patientDao: PatientDao
    private lateinit var syncQueueDao: SyncQueueDao
    private lateinit var syncQueueHelper: SyncQueueHelper
    private lateinit var supabaseApi: SupabaseApi
    private lateinit var networkMonitor: NetworkMonitor
    private lateinit var tokenRefresher: TokenRefresher
    private lateinit var directWriteExecutor: DirectWriteExecutor
    private lateinit var repository: PatientRepository
    private val json = Json { ignoreUnknownKeys = true }

    @Before
    fun setup() {
        database = mockk(relaxed = true)
        patientDao = mockk(relaxed = true)
        syncQueueDao = mockk(relaxed = true)
        syncQueueHelper = mockk(relaxed = true)
        supabaseApi = mockk(relaxed = true)
        networkMonitor = mockk()
        tokenRefresher = mockk(relaxed = true)
        directWriteExecutor = DirectWriteExecutor(tokenRefresher)
        repository = PatientRepository(
            database = database,
            patientDao = patientDao,
            syncQueueDao = syncQueueDao,
            syncQueueHelper = syncQueueHelper,
            supabaseApi = supabaseApi,
            networkMonitor = networkMonitor,
            directWriteExecutor = directWriteExecutor,
            json = json,
        )
    }

    @Test
    fun unvalidatedNetworkStillAttemptsDirectWrite() = runTest {
        every { networkMonitor.isConnected() } returns true
        coEvery { supabaseApi.rpcCreatePatient(any()) } returns Response.success("".toResponseBody())
        coEvery { supabaseApi.getPatientById(any()) } returns emptyList()

        val (_, syncId) = repository.createPatient(
            clinicId = "clinic-1",
            firstName = "Jane",
            lastName = "Doe",
        )

        assertNull(syncId)
        coVerify(exactly = 0) { syncQueueHelper.enqueue(any()) }
        coVerify(atLeast = 1) { supabaseApi.rpcCreatePatient(any()) }
    }

    @Test
    fun staleTokenDirectWriteRecoversWithoutEnqueue() = runTest {
        every { networkMonitor.isConnected() } returns true
        var rpcCalls = 0
        coEvery { supabaseApi.rpcCreatePatient(any()) } answers {
            rpcCalls++
            if (rpcCalls == 1) {
                Response.error(401, "".toResponseBody())
            } else {
                Response.success("".toResponseBody())
            }
        }
        coEvery { tokenRefresher.refreshToken() } returns true
        coEvery { supabaseApi.getPatientById(any()) } returns emptyList()

        val (_, syncId) = repository.createPatient(
            clinicId = "clinic-1",
            firstName = "Jane",
            lastName = "Doe",
        )

        assertNull(syncId)
        assertEquals(2, rpcCalls)
        coVerify(exactly = 0) { syncQueueHelper.enqueue(any()) }
        coVerify(exactly = 1) { tokenRefresher.refreshToken() }
    }
}
