package com.karibuhealth.app.data.repository

import androidx.room.withTransaction
import com.karibuhealth.app.data.local.db.KaribuDatabase
import com.karibuhealth.app.data.local.db.converter.*
import com.karibuhealth.app.data.local.db.dao.SyncQueueDao
import com.karibuhealth.app.data.local.db.dao.VisitDao
import com.karibuhealth.app.data.local.db.entity.SyncQueueEntry
import com.karibuhealth.app.data.local.db.entity.VisitWithPatient
import com.karibuhealth.app.data.remote.api.SupabaseApi
import com.karibuhealth.app.domain.model.*
import com.karibuhealth.app.util.NetworkMonitor
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
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
    private val supabaseApi: SupabaseApi,
    private val networkMonitor: NetworkMonitor,
    private val json: Json,
) {
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

    // One-tap "Start visit" for a clinician who self-triages. Optimistic local
    // update (so the UI reflects the change instantly even offline) plus a
    // queued sync entry so the server-side state machine catches up when online.
    suspend fun startVisitSelfTriage(visitId: String, clinicianId: String) {
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
        syncQueueDao.insert(syncEntry)
    }

    fun getVisitById(id: String): Flow<Visit?> =
        visitDao.getById(id).map { it?.toDomain() }

    suspend fun getVisitByIdOnce(id: String): Visit? =
        visitDao.getByIdOnce(id)?.toDomain()

    fun getVisitWithDetails(id: String) = visitDao.getWithDetails(id)

    suspend fun createVisit(
        clinicId: String,
        patientId: String,
        doctorId: String?,
        chiefComplaint: String? = null,
        patientSyncEntryId: String? = null,
    ): Visit = withContext(Dispatchers.IO) {
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
        )

        val entity = visit.toEntity(isSynced = false)
        val createDto = visit.toCreateDto()
        val syncEntry = SyncQueueEntry(
            id = UUID.randomUUID().toString(),
            operationType = "create_visit",
            entityType = "visits",
            entityId = visit.id,
            payload = json.encodeToString(
                com.karibuhealth.app.data.remote.dto.VisitCreateDto.serializer(),
                createDto,
            ),
            status = "pending",
            attempts = 0,
            createdAt = System.currentTimeMillis(),
            dependsOn = patientSyncEntryId,
        )

        database.withTransaction {
            visitDao.upsert(entity)
            syncQueueDao.insert(syncEntry)
        }

        visit
    }

    suspend fun updateStatus(visitId: String, status: VisitStatus) {
        visitDao.updateStatus(visitId, status.name, Instant.now().toString())
    }

    suspend fun refreshTodayVisits(clinicId: String) {
        if (!networkMonitor.isOnline()) return
        try {
            val today = LocalDate.now().toString()
            val remote = supabaseApi.getVisits("eq.$clinicId", "eq.$today")
            visitDao.upsertAll(remote.map { it.toEntity(isSynced = true) })
        } catch (_: Exception) {
            // Offline-first: silently use cache
        }
    }

    suspend fun refreshVisit(visitId: String) {
        if (!networkMonitor.isOnline()) return
        try {
            val remote = supabaseApi.getVisitById("eq.$visitId")
            remote.firstOrNull()?.let { visitDao.upsert(it.toEntity(isSynced = true)) }
        } catch (_: Exception) {}
    }
}
