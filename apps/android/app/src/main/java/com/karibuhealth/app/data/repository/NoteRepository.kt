package com.karibuhealth.app.data.repository

import com.karibuhealth.app.data.local.db.converter.toDomain
import com.karibuhealth.app.data.local.db.converter.toEntity
import com.karibuhealth.app.data.local.db.dao.PatientNoteDao
import com.karibuhealth.app.data.local.db.dao.ProviderNoteDao
import com.karibuhealth.app.data.local.db.dao.SyncQueueDao
import com.karibuhealth.app.data.local.db.entity.PatientNoteEntity
import com.karibuhealth.app.data.local.db.entity.ProviderNoteEntity
import com.karibuhealth.app.data.local.db.entity.SyncQueueEntry
import com.karibuhealth.app.data.remote.api.SupabaseApi
import com.karibuhealth.app.data.remote.dto.PatientNoteSummaryUpsertDto
import com.karibuhealth.app.data.remote.dto.ProviderNoteUpsertDto
import com.karibuhealth.app.domain.model.PatientNote
import com.karibuhealth.app.domain.model.ProviderNote
import com.karibuhealth.app.util.NetworkMonitor
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import java.time.Instant
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class NoteRepository @Inject constructor(
    private val providerNoteDao: ProviderNoteDao,
    private val patientNoteDao: PatientNoteDao,
    private val syncQueueDao: SyncQueueDao,
    private val supabaseApi: SupabaseApi,
    private val networkMonitor: NetworkMonitor,
    private val json: Json,
) {
    fun getProviderNote(visitId: String): Flow<ProviderNote?> =
        providerNoteDao.getByVisitId(visitId).map { it?.toDomain() }

    suspend fun getProviderNoteOnce(visitId: String): ProviderNote? =
        withContext(Dispatchers.IO) { providerNoteDao.getByVisitIdOnce(visitId)?.toDomain() }

    fun getPatientNote(visitId: String): Flow<PatientNote?> =
        patientNoteDao.getByVisitId(visitId).map { it?.toDomain() }

    private suspend fun getPendingVisitSyncDependency(visitId: String): String? {
        return syncQueueDao.getByEntityAndOperation(visitId, "create_visit")
            ?.takeIf { it.status != "completed" }
            ?.id
    }

    /**
     * Local-only draft save (no queue entry). Used for in-progress note
     * editing where the clinician hasn't tapped Save yet.
     */
    suspend fun saveDraftTranscript(visitId: String, transcript: String): ProviderNote =
        withContext(Dispatchers.IO) {
            val existing = providerNoteDao.getByVisitIdOnce(visitId)
            val now = Instant.now().toString()
            val entity = ProviderNoteEntity(
                id = existing?.id ?: UUID.randomUUID().toString(),
                visitId = visitId,
                transcript = transcript,
                noteContent = existing?.noteContent,
                structuredData = existing?.structuredData,
                status = existing?.status ?: "draft",
                createdAt = existing?.createdAt ?: now,
                updatedAt = now,
                finalizedAt = existing?.finalizedAt,
                finalizedBy = existing?.finalizedBy,
            )
            providerNoteDao.upsert(entity)
            entity.toDomain()
        }

    /**
     * Save the clinician's note transcript to Supabase (or queue if offline).
     * Returns (note, syncEntryId?). Direct-write via rpc_upsert_provider_note
     * when online + no upstream queue prerequisite.
     */
    suspend fun saveNoteAndQueue(
        visitId: String,
        transcript: String,
        predecessorSyncId: String? = null,
    ): Pair<ProviderNote, String?> = withContext(Dispatchers.IO) {
        val existing = providerNoteDao.getByVisitIdOnce(visitId)
        val now = Instant.now().toString()
        val entity = ProviderNoteEntity(
            id = existing?.id ?: UUID.randomUUID().toString(),
            visitId = visitId,
            transcript = transcript,
            noteContent = existing?.noteContent,
            structuredData = existing?.structuredData,
            status = existing?.status ?: "draft",
            createdAt = existing?.createdAt ?: now,
            updatedAt = now,
            finalizedAt = existing?.finalizedAt,
            finalizedBy = existing?.finalizedBy,
        )
        providerNoteDao.upsert(entity)

        val rpcBody = ProviderNoteUpsertDto(
            id = entity.id,
            visitId = entity.visitId,
            transcript = transcript,
            status = entity.status,
        )

        val effectivePredecessor = predecessorSyncId ?: getPendingVisitSyncDependency(visitId)

        if (networkMonitor.isOnline() && effectivePredecessor == null) {
            try {
                val response = supabaseApi.rpcUpsertProviderNote(rpcBody)
                if (response.isSuccessful) return@withContext entity.toDomain() to null
            } catch (_: Exception) {
                // Fall through to queue
            }
        }

        val syncEntry = SyncQueueEntry(
            id = UUID.randomUUID().toString(),
            operationType = "upsert_provider_note",
            entityType = "provider_notes",
            entityId = entity.id,
            payload = json.encodeToString(ProviderNoteUpsertDto.serializer(), rpcBody),
            status = "pending",
            attempts = 0,
            createdAt = System.currentTimeMillis(),
            dependsOn = effectivePredecessor,
        )
        syncQueueDao.insert(syncEntry)
        entity.toDomain() to syncEntry.id
    }

    /**
     * Save a clinician-authored fallback for the patient receipt summary.
     * The content is the raw clinician transcript — printed if AI never runs.
     * Server-side `rpc_upsert_patient_note_summary` only writes / overwrites
     * rows where `source = 'clinician_fallback'`, so an AI-generated summary
     * (Inngest) is never clobbered by this.
     */
    suspend fun saveSummaryFallback(
        visitId: String,
        content: String,
        predecessorSyncId: String? = null,
    ): Pair<PatientNote, String?> = withContext(Dispatchers.IO) {
        // Post migration 032 there can be up to two rows per visit. We always
        // operate on the 'clinician_fallback' row — the AI row is owned by
        // the Inngest pipeline and is read-only on Android.
        val existing = patientNoteDao.getByVisitAndSourceOnce(visitId, "clinician_fallback")
        val now = Instant.now().toString()
        val entity = PatientNoteEntity(
            id = existing?.id ?: UUID.randomUUID().toString(),
            visitId = visitId,
            content = content,
            language = existing?.language ?: "en",
            status = existing?.status ?: "draft",
            source = "clinician_fallback",
            createdAt = existing?.createdAt ?: now,
            updatedAt = now,
        )
        patientNoteDao.upsert(entity)

        val rpcBody = PatientNoteSummaryUpsertDto(
            id = entity.id,
            visitId = entity.visitId,
            content = content,
        )

        val effectivePredecessor = predecessorSyncId ?: getPendingVisitSyncDependency(visitId)

        if (networkMonitor.isOnline() && effectivePredecessor == null) {
            try {
                val response = supabaseApi.rpcUpsertPatientNoteSummary(rpcBody)
                if (response.isSuccessful) return@withContext entity.toDomain() to null
            } catch (_: Exception) {
                // Fall through to queue
            }
        }

        val syncEntry = SyncQueueEntry(
            id = UUID.randomUUID().toString(),
            operationType = "upsert_patient_note_summary",
            entityType = "patient_notes",
            entityId = entity.id,
            payload = json.encodeToString(PatientNoteSummaryUpsertDto.serializer(), rpcBody),
            status = "pending",
            attempts = 0,
            createdAt = System.currentTimeMillis(),
            dependsOn = effectivePredecessor,
        )
        syncQueueDao.insert(syncEntry)
        entity.toDomain() to syncEntry.id
    }

    suspend fun refreshNotes(visitId: String) {
        if (!networkMonitor.isOnline()) return
        try {
            val providerNotes = supabaseApi.getProviderNote("eq.$visitId")
            providerNotes.firstOrNull()?.let { providerNoteDao.upsert(it.toEntity()) }

            // patient_notes can return up to two rows since migration 032
            // (clinician + AI). Upsert all of them so the visit-details UI
            // can render both.
            val patientNotes = supabaseApi.getPatientNote("eq.$visitId")
            if (patientNotes.isNotEmpty()) {
                patientNoteDao.upsertAll(patientNotes.map { it.toEntity() })
            }
        } catch (_: Exception) {}
    }
}
