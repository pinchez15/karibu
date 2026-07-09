package com.karibuhealth.app.data.repository

import com.karibuhealth.app.data.local.db.dao.ReferralDao
import com.karibuhealth.app.data.local.db.entity.ReferralEntity
import com.karibuhealth.app.data.local.db.entity.SyncQueueEntry
import com.karibuhealth.app.data.remote.DirectWriteExecutor
import com.karibuhealth.app.data.remote.api.SupabaseApi
import com.karibuhealth.app.data.remote.dto.CreateReferralRequest
import com.karibuhealth.app.data.remote.dto.ReferralTodayRowDto
import com.karibuhealth.app.data.sync.SyncQueueHelper
import com.karibuhealth.app.domain.model.Referral
import com.karibuhealth.app.domain.model.ReferralUrgency
import com.karibuhealth.app.util.NetworkMonitor
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ReferralRepository @Inject constructor(
    private val referralDao: ReferralDao,
    private val syncQueueHelper: SyncQueueHelper,
    private val supabaseApi: SupabaseApi,
    private val networkMonitor: NetworkMonitor,
    private val directWriteExecutor: DirectWriteExecutor,
    private val json: Json,
) {
    fun observeActiveToday(clinicId: String): Flow<List<Referral>> {
        val startOfDay = LocalDate.now().atStartOfDay(ZoneOffset.UTC).toInstant().toString()
        return referralDao.observeActiveToday(clinicId, startOfDay).map { rows ->
            rows.map { it.toDomain() }
        }
    }

    suspend fun refreshToday(clinicId: String) {
        if (!networkMonitor.isConnected()) return
        withContext(Dispatchers.IO) {
            runCatching {
                val remote = supabaseApi.rpcListReferralsToday(
                    com.karibuhealth.app.data.remote.dto.ListReferralsTodayRequest(clinicId),
                )
                referralDao.upsertAll(
                    remote.map { dto ->
                        ReferralEntity(
                            id = dto.id,
                            clinicId = clinicId,
                            patientId = dto.patientId,
                            visitId = dto.visitId,
                            fromDepartment = "opd",
                            toFacility = dto.toFacility,
                            urgency = dto.urgency,
                            reason = dto.reason,
                            clinicalSummary = dto.clinicalSummary,
                            transportMode = dto.transportMode,
                            referredBy = null,
                            status = dto.status,
                            createdAt = dto.createdAt,
                            updatedAt = dto.createdAt,
                            patientName = dto.patientName,
                            isSynced = true,
                        )
                    },
                )
            }
        }
    }

    suspend fun createReferral(
        id: String = UUID.randomUUID().toString(),
        clinicId: String,
        patientId: String,
        visitId: String?,
        patientName: String?,
        fromDepartment: String,
        toFacility: String,
        urgency: ReferralUrgency,
        reason: String,
        clinicalSummary: String?,
        transportMode: String?,
        referredBy: String?,
    ): Referral {
        val now = Instant.now().toString()
        val entity = ReferralEntity(
            id = id,
            clinicId = clinicId,
            patientId = patientId,
            visitId = visitId,
            fromDepartment = fromDepartment,
            toFacility = toFacility.trim(),
            urgency = urgency.apiValue,
            reason = reason.trim(),
            clinicalSummary = clinicalSummary?.trim(),
            transportMode = transportMode?.trim(),
            referredBy = referredBy,
            status = "active",
            createdAt = now,
            updatedAt = now,
            patientName = patientName,
            isSynced = false,
        )
        val request = CreateReferralRequest(
            id = id,
            clinicId = clinicId,
            patientId = patientId,
            visitId = visitId,
            fromDepartment = fromDepartment,
            toFacility = toFacility.trim(),
            urgency = urgency.apiValue,
            reason = reason.trim(),
            clinicalSummary = clinicalSummary?.trim(),
            transportMode = transportMode?.trim(),
        )
        val syncEntry = SyncQueueEntry(
            id = UUID.randomUUID().toString(),
            operationType = "rpc_create_referral",
            entityType = "referral",
            entityId = id,
            payload = json.encodeToString(CreateReferralRequest.serializer(), request),
            status = "pending",
            attempts = 0,
            lastError = null,
            createdAt = System.currentTimeMillis(),
        )

        referralDao.upsert(entity)
        if (networkMonitor.isConnected()) {
            runCatching {
                val response = directWriteExecutor.run {
                    supabaseApi.rpcCreateReferral(
                        request.copy(clientOpId = syncEntry.id),
                    )
                }
                if (response.isSuccessful) {
                    referralDao.markSynced(id)
                } else {
                    syncQueueHelper.enqueue(syncEntry)
                }
            }.onFailure {
                syncQueueHelper.enqueue(syncEntry)
            }
        } else {
            syncQueueHelper.enqueue(syncEntry)
        }
        return entity.toDomain()
    }

    suspend fun getById(id: String): Referral? =
        referralDao.getById(id)?.toDomain()

    private fun ReferralEntity.toDomain() = Referral(
        id = id,
        clinicId = clinicId,
        patientId = patientId,
        visitId = visitId,
        patientName = patientName,
        fromDepartment = fromDepartment,
        toFacility = toFacility,
        urgency = ReferralUrgency.entries.firstOrNull { it.apiValue == urgency }
            ?: ReferralUrgency.Routine,
        reason = reason,
        clinicalSummary = clinicalSummary,
        transportMode = transportMode,
        referredBy = referredBy,
        status = status,
        createdAt = createdAt,
        isSynced = isSynced,
    )
}
