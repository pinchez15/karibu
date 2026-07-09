package com.karibuhealth.app.data.repository

import com.karibuhealth.app.data.local.datastore.OutbreakProtocolStore
import com.karibuhealth.app.data.local.db.dao.EbolaScreeningDao
import com.karibuhealth.app.data.local.db.entity.EbolaScreeningEntity
import com.karibuhealth.app.data.local.db.entity.SyncQueueEntry
import com.karibuhealth.app.data.remote.DirectWriteExecutor
import com.karibuhealth.app.data.remote.api.SupabaseApi
import com.karibuhealth.app.data.remote.dto.ActiveProtocolsRequest
import com.karibuhealth.app.data.remote.dto.RecordEbolaScreeningRequest
import com.karibuhealth.app.data.remote.dto.VisitEbolaScreeningRequest
import com.karibuhealth.app.data.sync.SyncQueueHelper
import com.karibuhealth.app.util.NetworkMonitor
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import java.time.Instant
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Pulls the clinic's active region-outbreak protocols and caches them locally,
 * mirroring [CatalogRepository]: offline-first (keep the cache on failure), and
 * the local store is the single source of truth the UI gates CDS on.
 */
@Singleton
class RegionProtocolRepository @Inject constructor(
    private val supabaseApi: SupabaseApi,
    private val outbreakProtocolStore: OutbreakProtocolStore,
    private val ebolaScreeningDao: EbolaScreeningDao,
    private val syncQueueHelper: SyncQueueHelper,
    private val networkMonitor: NetworkMonitor,
    private val directWriteExecutor: DirectWriteExecutor,
    private val json: Json,
) {
    fun observeActiveProtocols(): Flow<Set<String>> =
        outbreakProtocolStore.observeActiveProtocols()

    fun observeIsOnProtocol(slug: String): Flow<Boolean> =
        outbreakProtocolStore.observeIsOnProtocol(slug)

    suspend fun isOnProtocol(slug: String): Boolean =
        outbreakProtocolStore.isOnProtocol(slug)

    /**
     * Refresh the cached protocol set for [clinicId]. No-op offline (the cache
     * is kept so a clinic stays on protocol until it can next reach the server).
     */
    suspend fun refreshProtocols(clinicId: String) {
        if (!networkMonitor.isConnected()) return
        withContext(Dispatchers.IO) {
            try {
                val rows = supabaseApi.rpcActiveProtocolsForClinic(ActiveProtocolsRequest(clinicId))
                outbreakProtocolStore.setActiveProtocols(
                    rows.map { it.protocol.lowercase() }.toSet(),
                )
            } catch (_: Exception) {
                // Offline-first: keep the cached protocol set.
            }
        }
    }

    // ── Ebola / VHF screening (migration 060) ──────────────────────────────

    fun observeVisitScreening(visitId: String): Flow<EbolaScreeningEntity?> =
        ebolaScreeningDao.observeLatestForVisit(visitId)

    suspend fun refreshVisitScreening(visitId: String) {
        if (!networkMonitor.isConnected()) return
        withContext(Dispatchers.IO) {
            runCatching {
                supabaseApi.rpcVisitEbolaScreening(VisitEbolaScreeningRequest(visitId)).firstOrNull()?.let { d ->
                    ebolaScreeningDao.upsert(
                        EbolaScreeningEntity(
                            id = d.id, clinicId = d.clinicId, patientId = d.patientId, visitId = d.visitId,
                            tempC = d.tempC, epiContact = d.epiContact, unexplainedBleeding = d.unexplainedBleeding,
                            symptoms = d.symptoms, isSuspect = d.isSuspect, actionTaken = d.actionTaken,
                            createdAt = d.createdAt, isSynced = true,
                        ),
                    )
                }
            }
        }
    }

    suspend fun recordScreening(
        clinicId: String,
        patientId: String,
        visitId: String?,
        tempC: Double?,
        epiContact: Boolean,
        unexplainedBleeding: Boolean,
        symptoms: String?,
        isSuspect: Boolean,
        actionTaken: String?,
    ): String = withContext(Dispatchers.IO) {
        val id = UUID.randomUUID().toString()
        val now = Instant.now().toString()
        val entity = EbolaScreeningEntity(
            id = id, clinicId = clinicId, patientId = patientId, visitId = visitId, tempC = tempC,
            epiContact = epiContact, unexplainedBleeding = unexplainedBleeding, symptoms = symptoms,
            isSuspect = isSuspect, actionTaken = actionTaken, createdAt = now, isSynced = false,
        )
        val request = RecordEbolaScreeningRequest(
            id = id, patientId = patientId, visitId = visitId, tempC = tempC, epiContact = epiContact,
            unexplainedBleeding = unexplainedBleeding, symptoms = symptoms, isSuspect = isSuspect,
            actionTaken = actionTaken,
        )
        val syncEntry = SyncQueueEntry(
            id = UUID.randomUUID().toString(),
            operationType = "rpc_record_ebola_screening",
            entityType = "ebola_screening",
            entityId = id,
            payload = json.encodeToString(RecordEbolaScreeningRequest.serializer(), request.copy(clientOpId = id)),
            status = "pending", attempts = 0, lastError = null, createdAt = System.currentTimeMillis(),
        )
        ebolaScreeningDao.upsert(entity)
        if (networkMonitor.isConnected()) {
            val ok = runCatching {
                val resp = directWriteExecutor.run { supabaseApi.rpcRecordEbolaScreening(request.copy(clientOpId = id)) }
                if (resp.isSuccessful) ebolaScreeningDao.markSynced(id) else error("HTTP ${resp.code()}")
            }.isSuccess
            if (!ok) syncQueueHelper.enqueue(syncEntry)
        } else {
            syncQueueHelper.enqueue(syncEntry)
        }
        id
    }
}
