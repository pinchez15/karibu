package com.karibuhealth.app.data.repository

import com.karibuhealth.app.data.local.db.dao.HivCareDao
import com.karibuhealth.app.data.local.db.dao.HtsEventDao
import com.karibuhealth.app.data.local.db.dao.TbEpisodeDao
import com.karibuhealth.app.data.local.db.dao.ViralLoadDao
import com.karibuhealth.app.data.local.db.entity.HivCareEnrollmentEntity
import com.karibuhealth.app.data.local.db.entity.HtsEventEntity
import com.karibuhealth.app.data.local.db.entity.SyncQueueEntry
import com.karibuhealth.app.data.local.db.entity.TbEpisodeEntity
import com.karibuhealth.app.data.local.db.entity.ViralLoadTestEntity
import com.karibuhealth.app.data.remote.api.SupabaseApi
import com.karibuhealth.app.data.remote.dto.ClinicOnlyRequest
import com.karibuhealth.app.data.remote.dto.RecentHtsRequest
import com.karibuhealth.app.data.remote.dto.RecordHtsEventRequest
import com.karibuhealth.app.data.remote.dto.RecordViralLoadRequest
import com.karibuhealth.app.data.remote.dto.UpsertHivCareRequest
import com.karibuhealth.app.data.remote.dto.UpsertTbEpisodeRequest
import com.karibuhealth.app.data.sync.SyncQueueHelper
import com.karibuhealth.app.util.NetworkMonitor
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import java.time.LocalDate
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class HivTbRepository @Inject constructor(
    private val htsEventDao: HtsEventDao,
    private val hivCareDao: HivCareDao,
    private val tbEpisodeDao: TbEpisodeDao,
    private val viralLoadDao: ViralLoadDao,
    private val syncQueueHelper: SyncQueueHelper,
    private val supabaseApi: SupabaseApi,
    private val networkMonitor: NetworkMonitor,
    private val json: Json,
) {
    fun observeRecentHts(clinicId: String): Flow<List<HtsEventEntity>> =
        htsEventDao.observeRecent(clinicId)

    fun observeActiveHiv(clinicId: String): Flow<List<HivCareEnrollmentEntity>> =
        hivCareDao.observeActive(clinicId)

    fun observeActiveTb(clinicId: String): Flow<List<TbEpisodeEntity>> =
        tbEpisodeDao.observeActive(clinicId)

    fun observeHivEnrollment(id: String): Flow<HivCareEnrollmentEntity?> =
        hivCareDao.observeById(id)

    fun observeTbEpisode(id: String): Flow<TbEpisodeEntity?> =
        tbEpisodeDao.observeById(id)

    fun observeViralLoads(enrollmentId: String): Flow<List<ViralLoadTestEntity>> =
        viralLoadDao.observeForEnrollment(enrollmentId)

    suspend fun refreshRegistry(clinicId: String) {
        if (!networkMonitor.isOnline()) return
        withContext(Dispatchers.IO) {
            runCatching {
                val hts = supabaseApi.rpcRecentHtsEvents(RecentHtsRequest(clinicId, 50))
                htsEventDao.upsertAll(
                    hts.map { dto ->
                        HtsEventEntity(
                            id = dto.id,
                            clinicId = clinicId,
                            patientId = dto.patientId,
                            patientName = dto.patientName,
                            eventDate = dto.eventDate.take(10),
                            tested = dto.tested,
                            result = dto.result,
                            resultReceived = dto.resultReceived,
                            isSynced = true,
                        )
                    },
                )
                val hiv = supabaseApi.rpcActiveHivCare(ClinicOnlyRequest(clinicId))
                hivCareDao.upsertAll(
                    hiv.map { dto ->
                        HivCareEnrollmentEntity(
                            id = dto.id,
                            clinicId = clinicId,
                            patientId = dto.patientId,
                            patientName = dto.patientName,
                            enrolledAt = dto.enrolledAt.take(10),
                            careStatus = dto.careStatus,
                            whoStage = dto.whoStage,
                            artStartDate = dto.artStartDate?.take(10),
                            artRegimen = dto.artRegimen,
                            artLine = dto.artLine,
                            cptAtLastVisit = dto.cptAtLastVisit,
                            tbAssessedLastVisit = dto.tbAssessedLastVisit,
                            isSynced = true,
                        )
                    },
                )
                val tb = supabaseApi.rpcActiveTbEpisodes(ClinicOnlyRequest(clinicId))
                tbEpisodeDao.upsertAll(
                    tb.map { dto ->
                        TbEpisodeEntity(
                            id = dto.id,
                            clinicId = clinicId,
                            patientId = dto.patientId,
                            patientName = dto.patientName,
                            unitTbNumber = dto.unitTbNumber,
                            registeredAt = dto.registeredAt.take(10),
                            caseType = dto.caseType,
                            diseaseClass = dto.diseaseClass,
                            hivStatus = dto.hivStatus,
                            treatmentStartedAt = dto.treatmentStartedAt?.take(10),
                            outcome = dto.outcome,
                            isSynced = true,
                        )
                    },
                )
            }
        }
    }

    suspend fun recordHtsEvent(
        clinicId: String,
        patientId: String,
        patientName: String?,
        tested: Boolean,
        result: String?,
        resultReceived: Boolean,
        suspectedTb: Boolean,
        startedCpt: Boolean,
        retester: Boolean,
    ): String = withContext(Dispatchers.IO) {
        val id = UUID.randomUUID().toString()
        val today = LocalDate.now().toString()
        val entity = HtsEventEntity(
            id = id,
            clinicId = clinicId,
            patientId = patientId,
            patientName = patientName,
            eventDate = today,
            tested = tested,
            result = result,
            resultReceived = resultReceived,
            suspectedTb = suspectedTb,
            startedCpt = startedCpt,
            retester = retester,
            isSynced = false,
        )
        val request = RecordHtsEventRequest(
            id = id,
            patientId = patientId,
            eventDate = today,
            tested = tested,
            result = result,
            resultReceived = resultReceived,
            suspectedTb = suspectedTb,
            startedCpt = startedCpt,
            retester = retester,
        )
        val syncEntry = syncEntry("rpc_record_hts_event", "hts_event", id, request)
        htsEventDao.upsert(entity)
        pushOrQueue(syncEntry) {
            val resp = supabaseApi.rpcRecordHtsEvent(request.copy(clientOpId = id))
            if (resp.isSuccessful) htsEventDao.markSynced(id)
            else throw IllegalStateException("rpc_record_hts_event HTTP ${resp.code()}")
        }
        id
    }

    suspend fun upsertHivCare(
        clinicId: String,
        patientId: String,
        patientName: String?,
        enrollmentId: String? = null,
        enrolledAt: String? = null,
        careStatus: String = "pre_art",
        whoStage: Int? = null,
        artStartDate: String? = null,
        artRegimen: String? = null,
        artLine: String? = null,
        cptAtLastVisit: Boolean = false,
        tbAssessedLastVisit: Boolean = false,
        tbTreatmentStarted: Boolean = false,
    ): String = withContext(Dispatchers.IO) {
        val id = enrollmentId ?: UUID.randomUUID().toString()
        val today = LocalDate.now().toString()
        val enrollDate = enrolledAt?.take(10) ?: today
        val entity = HivCareEnrollmentEntity(
            id = id,
            clinicId = clinicId,
            patientId = patientId,
            patientName = patientName,
            enrolledAt = enrollDate,
            careStatus = careStatus,
            whoStage = whoStage,
            artStartDate = artStartDate,
            artRegimen = artRegimen,
            artLine = artLine,
            cptAtLastVisit = cptAtLastVisit,
            tbAssessedLastVisit = tbAssessedLastVisit,
            tbTreatmentStarted = tbTreatmentStarted,
            isSynced = false,
        )
        val request = UpsertHivCareRequest(
            id = id,
            patientId = patientId,
            enrolledAt = enrollDate,
            careStatus = careStatus,
            whoStage = whoStage,
            artStartDate = artStartDate,
            artRegimen = artRegimen,
            artLine = artLine,
            cptAtLastVisit = cptAtLastVisit,
            tbAssessedLastVisit = tbAssessedLastVisit,
            tbTreatmentStarted = tbTreatmentStarted,
        )
        val syncEntry = syncEntry("rpc_upsert_hiv_care", "hiv_care", id, request)
        hivCareDao.upsert(entity)
        pushOrQueue(syncEntry) {
            val resp = supabaseApi.rpcUpsertHivCare(request.copy(clientOpId = id))
            if (resp.isSuccessful) hivCareDao.markSynced(id)
            else throw IllegalStateException("rpc_upsert_hiv_care HTTP ${resp.code()}")
        }
        id
    }

    suspend fun recordViralLoad(
        clinicId: String,
        patientId: String,
        enrollmentId: String,
        resultCopies: Double?,
    ): String = withContext(Dispatchers.IO) {
        val id = UUID.randomUUID().toString()
        val today = LocalDate.now().toString()
        val suppressed = resultCopies?.let { it < 1000.0 }
        val entity = ViralLoadTestEntity(
            id = id,
            clinicId = clinicId,
            patientId = patientId,
            enrollmentId = enrollmentId,
            testDate = today,
            resultCopies = resultCopies,
            suppressed = suppressed,
            isSynced = false,
        )
        val request = RecordViralLoadRequest(
            id = id,
            patientId = patientId,
            enrollmentId = enrollmentId,
            testDate = today,
            resultCopies = resultCopies,
            suppressed = suppressed,
        )
        val syncEntry = syncEntry("rpc_record_viral_load", "viral_load", id, request)
        viralLoadDao.upsert(entity)
        pushOrQueue(syncEntry) {
            val resp = supabaseApi.rpcRecordViralLoad(request.copy(clientOpId = id))
            if (resp.isSuccessful) viralLoadDao.markSynced(id)
            else throw IllegalStateException("rpc_record_viral_load HTTP ${resp.code()}")
        }
        id
    }

    suspend fun upsertTbEpisode(
        clinicId: String,
        patientId: String,
        patientName: String?,
        episodeId: String? = null,
        registeredAt: String? = null,
        unitTbNumber: String? = null,
        caseType: String = "new",
        diseaseClass: String = "pulmonary_smear_positive",
        hivStatus: String? = null,
        treatmentStartedAt: String? = null,
        outcome: String = "ongoing",
        outcomeDate: String? = null,
    ): String = withContext(Dispatchers.IO) {
        val id = episodeId ?: UUID.randomUUID().toString()
        val today = LocalDate.now().toString()
        val regDate = registeredAt?.take(10) ?: today
        val entity = TbEpisodeEntity(
            id = id,
            clinicId = clinicId,
            patientId = patientId,
            patientName = patientName,
            unitTbNumber = unitTbNumber?.trimOrNull(),
            registeredAt = regDate,
            caseType = caseType,
            diseaseClass = diseaseClass,
            hivStatus = hivStatus,
            treatmentStartedAt = treatmentStartedAt,
            outcome = outcome,
            outcomeDate = outcomeDate,
            isSynced = false,
        )
        val request = UpsertTbEpisodeRequest(
            id = id,
            patientId = patientId,
            unitTbNumber = entity.unitTbNumber,
            registeredAt = regDate,
            caseType = caseType,
            diseaseClass = diseaseClass,
            hivStatus = hivStatus,
            treatmentStartedAt = treatmentStartedAt,
            regimenCategory = "cat1",
            treatmentPhase = "intensive",
            outcome = outcome,
            outcomeDate = outcomeDate,
        )
        val syncEntry = syncEntry("rpc_upsert_tb_episode", "tb_episode", id, request)
        tbEpisodeDao.upsert(entity)
        pushOrQueue(syncEntry) {
            val resp = supabaseApi.rpcUpsertTbEpisode(request.copy(clientOpId = id))
            if (resp.isSuccessful) tbEpisodeDao.markSynced(id)
            else throw IllegalStateException("rpc_upsert_tb_episode HTTP ${resp.code()}")
        }
        id
    }

    private suspend fun pushOrQueue(syncEntry: SyncQueueEntry, push: suspend () -> Unit) {
        if (networkMonitor.isOnline()) {
            if (!runCatching { push() }.isSuccess) syncQueueHelper.enqueue(syncEntry)
        } else {
            syncQueueHelper.enqueue(syncEntry)
        }
    }

    private inline fun <reified T> syncEntry(
        operationType: String,
        entityType: String,
        entityId: String,
        request: T,
    ): SyncQueueEntry {
        val serializer = kotlinx.serialization.serializer<T>()
        return SyncQueueEntry(
            id = UUID.randomUUID().toString(),
            operationType = operationType,
            entityType = entityType,
            entityId = entityId,
            payload = json.encodeToString(serializer, request),
            status = "pending",
            attempts = 0,
            lastError = null,
            createdAt = System.currentTimeMillis(),
        )
    }

    private fun String.trimOrNull(): String? = trim().ifBlank { null }
}
