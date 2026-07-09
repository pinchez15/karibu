package com.karibuhealth.app.data.repository

import com.karibuhealth.app.data.local.db.dao.AncContactDao
import com.karibuhealth.app.data.local.db.dao.PregnancyDao
import com.karibuhealth.app.data.local.db.dao.PregnancyRegistryRow
import com.karibuhealth.app.data.local.db.entity.AncContactEntity
import com.karibuhealth.app.data.local.db.entity.PregnancyEntity
import com.karibuhealth.app.data.local.db.entity.SyncQueueEntry
import com.karibuhealth.app.data.remote.DirectWriteExecutor
import com.karibuhealth.app.data.remote.api.SupabaseApi
import com.karibuhealth.app.data.remote.dto.ActivePregnanciesRequest
import com.karibuhealth.app.data.remote.dto.PregnancyContactsRequest
import com.karibuhealth.app.data.remote.dto.RecordAncContactRequest
import com.karibuhealth.app.data.remote.dto.StartPregnancyRequest
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
 * Offline-first ANC registry (migration 059). Pregnancies and ANC contacts are
 * written to Room first and queued through the outbox; protocol "done vs due" is
 * derived on-device ([com.karibuhealth.app.domain.AncProtocol]). Mirrors the
 * established repository offline-write pattern.
 */
@Singleton
class AncRepository @Inject constructor(
    private val pregnancyDao: PregnancyDao,
    private val ancContactDao: AncContactDao,
    private val syncQueueHelper: SyncQueueHelper,
    private val supabaseApi: SupabaseApi,
    private val networkMonitor: NetworkMonitor,
    private val directWriteExecutor: DirectWriteExecutor,
    private val json: Json,
) {
    fun observeRegistry(clinicId: String): Flow<List<PregnancyRegistryRow>> =
        pregnancyDao.observeRegistry(clinicId)

    fun observePregnancy(id: String): Flow<PregnancyEntity?> = pregnancyDao.observeById(id)

    fun observeContacts(pregnancyId: String): Flow<List<AncContactEntity>> =
        ancContactDao.observeForPregnancy(pregnancyId)

    suspend fun refreshRegistry(clinicId: String) {
        if (!networkMonitor.isConnected()) return
        withContext(Dispatchers.IO) {
            runCatching {
                val remote = supabaseApi.rpcActivePregnancies(ActivePregnanciesRequest(clinicId))
                pregnancyDao.upsertAll(
                    remote.map { dto ->
                        PregnancyEntity(
                            id = dto.id, clinicId = clinicId, patientId = dto.patientId,
                            patientName = dto.patientName, lmp = dto.lmp, edd = dto.edd,
                            gravida = dto.gravida, para = dto.para, bloodGroup = dto.bloodGroup,
                            hivStatus = dto.hivStatus, syphilisStatus = dto.syphilisStatus,
                            hepbStatus = dto.hepbStatus, riskNotes = dto.riskNotes,
                            status = "active", isSynced = true,
                        )
                    },
                )
            }
        }
    }

    suspend fun refreshContacts(pregnancyId: String) {
        if (!networkMonitor.isConnected()) return
        withContext(Dispatchers.IO) {
            runCatching {
                val remote = supabaseApi.rpcPregnancyContacts(PregnancyContactsRequest(pregnancyId))
                ancContactDao.upsertAll(
                    remote.map { dto ->
                        AncContactEntity(
                            id = dto.id, pregnancyId = dto.pregnancyId, clinicId = dto.clinicId,
                            patientId = dto.patientId, contactNumber = dto.contactNumber,
                            contactDate = dto.contactDate, gestationWeeks = dto.gestationWeeks,
                            bpSystolic = dto.bpSystolic, bpDiastolic = dto.bpDiastolic, weightKg = dto.weightKg,
                            fundalHeightCm = dto.fundalHeightCm, fetalHeartRate = dto.fetalHeartRate,
                            urineProtein = dto.urineProtein, hb = dto.hb, iptpGiven = dto.iptpGiven,
                            ifasGiven = dto.ifasGiven, tdGiven = dto.tdGiven, dewormed = dto.dewormed,
                            itnGiven = dto.itnGiven, notes = dto.notes, isSynced = true,
                        )
                    },
                )
            }
        }
    }

    suspend fun startPregnancy(
        clinicId: String,
        patientId: String,
        patientName: String?,
        lmp: String?,
        edd: String?,
        gravida: Int?,
        para: Int?,
        bloodGroup: String?,
        hivStatus: String?,
        syphilisStatus: String?,
        hepbStatus: String?,
        riskNotes: String?,
    ): String = withContext(Dispatchers.IO) {
        val id = UUID.randomUUID().toString()
        val entity = PregnancyEntity(
            id = id, clinicId = clinicId, patientId = patientId, patientName = patientName,
            lmp = lmp, edd = edd, gravida = gravida, para = para, bloodGroup = bloodGroup?.trimOrNull(),
            hivStatus = hivStatus?.trimOrNull(), syphilisStatus = syphilisStatus?.trimOrNull(),
            hepbStatus = hepbStatus?.trimOrNull(), riskNotes = riskNotes?.trimOrNull(),
            status = "active", isSynced = false,
        )
        val request = StartPregnancyRequest(
            id = id, patientId = patientId, lmp = lmp, edd = edd, gravida = gravida, para = para,
            bloodGroup = entity.bloodGroup, hivStatus = entity.hivStatus,
            syphilisStatus = entity.syphilisStatus, hepbStatus = entity.hepbStatus, riskNotes = entity.riskNotes,
        )
        val syncEntry = SyncQueueEntry(
            id = UUID.randomUUID().toString(),
            operationType = "rpc_start_pregnancy",
            entityType = "pregnancy",
            entityId = id,
            payload = json.encodeToString(StartPregnancyRequest.serializer(), request.copy(clientOpId = id)),
            status = "pending", attempts = 0, lastError = null, createdAt = System.currentTimeMillis(),
        )
        pregnancyDao.upsert(entity)
        pushOrQueue(syncEntry) {
            val resp = directWriteExecutor.run { supabaseApi.rpcStartPregnancy(request.copy(clientOpId = id)) }
            if (resp.isSuccessful) pregnancyDao.markSynced(id)
            else throw IllegalStateException("rpc_start_pregnancy HTTP ${resp.code()}")
        }
        id
    }

    suspend fun recordContact(
        clinicId: String,
        pregnancyId: String,
        patientId: String,
        contactNumber: Int?,
        gestationWeeks: Int?,
        bpSystolic: Int?,
        bpDiastolic: Int?,
        weightKg: Double?,
        fundalHeightCm: Int?,
        fetalHeartRate: Int?,
        urineProtein: String?,
        hb: Double?,
        iptpGiven: Boolean,
        ifasGiven: Boolean,
        tdGiven: Boolean,
        dewormed: Boolean,
        itnGiven: Boolean,
        notes: String?,
    ): String = withContext(Dispatchers.IO) {
        val id = UUID.randomUUID().toString()
        val now = Instant.now().toString()
        val entity = AncContactEntity(
            id = id, pregnancyId = pregnancyId, clinicId = clinicId, patientId = patientId,
            contactNumber = contactNumber, contactDate = now, gestationWeeks = gestationWeeks,
            bpSystolic = bpSystolic, bpDiastolic = bpDiastolic, weightKg = weightKg,
            fundalHeightCm = fundalHeightCm, fetalHeartRate = fetalHeartRate,
            urineProtein = urineProtein?.trimOrNull(), hb = hb, iptpGiven = iptpGiven, ifasGiven = ifasGiven,
            tdGiven = tdGiven, dewormed = dewormed, itnGiven = itnGiven, notes = notes?.trimOrNull(), isSynced = false,
        )
        val request = RecordAncContactRequest(
            id = id, pregnancyId = pregnancyId, contactNumber = contactNumber, contactDate = now,
            gestationWeeks = gestationWeeks, bpSystolic = bpSystolic, bpDiastolic = bpDiastolic, weightKg = weightKg,
            fundalHeightCm = fundalHeightCm, fetalHeartRate = fetalHeartRate, urineProtein = entity.urineProtein,
            hb = hb, iptpGiven = iptpGiven, ifasGiven = ifasGiven, tdGiven = tdGiven, dewormed = dewormed,
            itnGiven = itnGiven, notes = entity.notes,
        )
        val syncEntry = SyncQueueEntry(
            id = UUID.randomUUID().toString(),
            operationType = "rpc_record_anc_contact",
            entityType = "anc_contact",
            entityId = id,
            payload = json.encodeToString(RecordAncContactRequest.serializer(), request.copy(clientOpId = id)),
            status = "pending", attempts = 0, lastError = null, createdAt = System.currentTimeMillis(),
        )
        ancContactDao.upsert(entity)
        pushOrQueue(syncEntry) {
            val resp = directWriteExecutor.run { supabaseApi.rpcRecordAncContact(request.copy(clientOpId = id)) }
            if (resp.isSuccessful) ancContactDao.markSynced(id)
            else throw IllegalStateException("rpc_record_anc_contact HTTP ${resp.code()}")
        }
        id
    }

    private suspend fun pushOrQueue(syncEntry: SyncQueueEntry, push: suspend () -> Unit) {
        if (networkMonitor.isConnected()) {
            if (!runCatching { push() }.isSuccess) syncQueueHelper.enqueue(syncEntry)
        } else {
            syncQueueHelper.enqueue(syncEntry)
        }
    }

    private fun String.trimOrNull(): String? = trim().ifBlank { null }
}
