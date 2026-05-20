package com.karibuhealth.app.data.repository

import com.karibuhealth.app.data.local.db.converter.toDomain
import com.karibuhealth.app.data.local.db.converter.toEntity
import com.karibuhealth.app.data.local.db.dao.VisitDao
import com.karibuhealth.app.data.local.db.dao.PatientNoteDao
import com.karibuhealth.app.data.local.db.dao.ProviderNoteDao
import com.karibuhealth.app.data.local.db.dao.SyncQueueDao
import com.karibuhealth.app.data.local.db.entity.PatientNoteEntity
import com.karibuhealth.app.data.local.db.entity.ProviderNoteEntity
import com.karibuhealth.app.data.local.db.entity.SyncQueueEntry
import com.karibuhealth.app.data.remote.api.SupabaseApi
import com.karibuhealth.app.data.remote.dto.AddendProviderNoteRequest
import com.karibuhealth.app.data.remote.dto.AmendProviderNoteRequest
import com.karibuhealth.app.data.remote.dto.CosignProviderNoteRequest
import com.karibuhealth.app.data.remote.dto.PatientNoteSummaryUpsertDto
import com.karibuhealth.app.data.remote.dto.ProviderNoteUpsertDto
import com.karibuhealth.app.data.remote.dto.SignProviderNoteRequest
import com.karibuhealth.app.data.remote.dto.VisitClinicalSummaryUpsertDto
import com.karibuhealth.app.data.remote.dto.VoidProviderNoteRequest
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
    private val visitDao: VisitDao,
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
     * editing where the clinician hasn't tapped Sign yet. Kept as a thin
     * wrapper over `upsertProviderNote` for callers that don't need the
     * sync-queue handle.
     */
    suspend fun saveDraftTranscript(visitId: String, transcript: String): ProviderNote =
        withContext(Dispatchers.IO) {
            val existing = providerNoteDao.getByVisitIdOnce(visitId)
            val now = Instant.now().toString()
            val entity = ProviderNoteEntity(
                id = existing?.id ?: UUID.randomUUID().toString(),
                // Local-only path: we don't have patient_id at hand, but
                // existing rows came from a visit-tied upsert so the column
                // is populated. Worst case (fresh row) we leave a sentinel
                // that the upsertProviderNote path will overwrite the moment
                // the screen learns patient_id from the visit.
                patientId = existing?.patientId ?: "",
                visitId = visitId,
                transcript = transcript,
                noteContent = existing?.noteContent,
                structuredData = existing?.structuredData,
                status = existing?.status ?: "draft",
                source = existing?.source ?: "visit",
                createdAt = existing?.createdAt ?: now,
                updatedAt = now,
                finalizedAt = existing?.finalizedAt,
                finalizedBy = existing?.finalizedBy,
                amendedAt = existing?.amendedAt,
                amendedBy = existing?.amendedBy,
                voidedAt = existing?.voidedAt,
                voidedBy = existing?.voidedBy,
                voidReason = existing?.voidReason,
            )
            providerNoteDao.upsert(entity)
            entity.toDomain()
        }

    /**
     * Upsert a provider note (patient-first). Replaces the old visit-tied
     * `saveNoteAndQueue`. Persists locally first, then direct-writes via the
     * Migration 039 RPC when online + no upstream queue prerequisite,
     * otherwise queues `upsert_provider_note` with the full payload (including
     * patient_id + source).
     *
     * Returns (note, syncEntryId?). `syncEntryId` is null when the row
     * already landed in Supabase.
     *
     * `noteId` is the stable local UUID — pass the one you generated on the
     * first autosave so the server-side `ON CONFLICT (id)` upsert sees the
     * same row across the autosave → Sign chain.
     */
    suspend fun upsertProviderNote(
        noteId: String? = null,
        patientId: String,
        visitId: String? = null,
        transcript: String?,
        status: String = "draft",
        source: String? = null,
        predecessorSyncId: String? = null,
    ): Pair<ProviderNote, String?> = withContext(Dispatchers.IO) {
        val existing = noteId?.let { providerNoteDao.getByIdOnce(it) }
            ?: visitId?.let { providerNoteDao.getByVisitIdOnce(it) }
        val now = Instant.now().toString()
        // The server's ON CONFLICT (id) rule never clobbers an existing
        // transcript with NULL. Mirror that locally so a stop-and-resume
        // autosave doesn't blank the last-good draft.
        val effectiveTranscript = transcript ?: existing?.transcript
        val effectiveSource = source ?: existing?.source ?: if (visitId != null) "visit" else "general"
        val entity = ProviderNoteEntity(
            id = noteId ?: existing?.id ?: UUID.randomUUID().toString(),
            patientId = patientId,
            visitId = visitId ?: existing?.visitId,
            transcript = effectiveTranscript,
            noteContent = existing?.noteContent,
            structuredData = existing?.structuredData,
            status = status,
            source = effectiveSource,
            createdAt = existing?.createdAt ?: now,
            updatedAt = now,
            finalizedAt = existing?.finalizedAt,
            finalizedBy = existing?.finalizedBy,
            amendedAt = existing?.amendedAt,
            amendedBy = existing?.amendedBy,
            voidedAt = existing?.voidedAt,
            voidedBy = existing?.voidedBy,
            voidReason = existing?.voidReason,
        )
        providerNoteDao.upsert(entity)

        val rpcBody = ProviderNoteUpsertDto(
            id = entity.id,
            visitId = entity.visitId,
            transcript = transcript,
            status = status,
            patientId = patientId,
            source = effectiveSource,
        )

        // Visit-tied path: linearize against any pending create_visit sync.
        val effectivePredecessor = predecessorSyncId
            ?: entity.visitId?.let { getPendingVisitSyncDependency(it) }

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
     * Convenience wrapper for autosave — always writes status='draft'.
     * `noteId` should be the same stable UUID across the editing session so
     * the server-side ON CONFLICT (id) keeps merging into the same row.
     */
    suspend fun saveDraft(
        patientId: String,
        visitId: String? = null,
        transcript: String?,
        noteId: String? = null,
        source: String? = null,
        predecessorSyncId: String? = null,
    ): Pair<ProviderNote, String?> = upsertProviderNote(
        noteId = noteId,
        patientId = patientId,
        visitId = visitId,
        transcript = transcript,
        status = "draft",
        source = source,
        predecessorSyncId = predecessorSyncId,
    )

    /**
     * Back-compat: the legacy visit-tied save call. Resolves patient_id by
     * reading the local visit row. Existing callers (visit-tied save chain)
     * keep working without learning about patient_id directly. New code
     * should call `upsertProviderNote` / `saveDraft` / `signNote` instead.
     */
    suspend fun saveNoteAndQueue(
        visitId: String,
        transcript: String,
        predecessorSyncId: String? = null,
    ): Pair<ProviderNote, String?> = withContext(Dispatchers.IO) {
        val patientId = visitDao.getByIdOnce(visitId)?.patientId
            ?: error("Visit $visitId has no local row; cannot resolve patient_id")
        upsertProviderNote(
            patientId = patientId,
            visitId = visitId,
            transcript = transcript,
            status = "draft",
            source = "visit",
            predecessorSyncId = predecessorSyncId,
        )
    }

    /**
     * Sign a provider note. Flips status -> signed and stamps finalized_at /
     * finalized_by. Direct-writes via rpcSignProviderNote when online,
     * otherwise queues `sign_provider_note` so the transition syncs on
     * reconnect. Local row's status is updated optimistically either way.
     */
    suspend fun signNote(
        noteId: String,
        predecessorSyncId: String? = null,
    ): String? = withContext(Dispatchers.IO) {
        val now = Instant.now().toString()
        providerNoteDao.updateLifecycle(
            id = noteId,
            status = "signed",
            finalizedAt = now,
            finalizedBy = null,
            amendedAt = null,
            amendedBy = null,
            voidedAt = null,
            voidedBy = null,
            voidReason = null,
            updatedAt = now,
        )

        val rpcBody = SignProviderNoteRequest(id = noteId)
        if (networkMonitor.isOnline() && predecessorSyncId == null) {
            try {
                val response = supabaseApi.rpcSignProviderNote(rpcBody)
                if (response.isSuccessful) return@withContext null
            } catch (_: Exception) {
                // Fall through to queue
            }
        }

        val syncEntry = SyncQueueEntry(
            id = UUID.randomUUID().toString(),
            operationType = "sign_provider_note",
            entityType = "provider_notes",
            entityId = noteId,
            payload = json.encodeToString(SignProviderNoteRequest.serializer(), rpcBody),
            status = "pending",
            attempts = 0,
            createdAt = System.currentTimeMillis(),
            dependsOn = predecessorSyncId,
        )
        syncQueueDao.insert(syncEntry)
        syncEntry.id
    }

    /**
     * Amend a signed note. Only valid from signed/amended on the server side;
     * the local lifecycle column is updated optimistically. Direct-writes
     * via rpcAmendProviderNote when online, otherwise queues
     * `amend_provider_note`.
     */
    suspend fun amendNote(
        noteId: String,
        transcript: String,
        reason: String = "Amended via Android",
        predecessorSyncId: String? = null,
    ): String? = withContext(Dispatchers.IO) {
        val now = Instant.now().toString()
        providerNoteDao.updateLifecycle(
            id = noteId,
            status = "amended",
            finalizedAt = null,
            finalizedBy = null,
            amendedAt = now,
            amendedBy = null,
            voidedAt = null,
            voidedBy = null,
            voidReason = null,
            updatedAt = now,
        )
        // Mirror the transcript change locally — the server-side amend RPC
        // also updates transcript.
        val existing = providerNoteDao.getByIdOnce(noteId)
        if (existing != null) {
            providerNoteDao.upsert(existing.copy(transcript = transcript, updatedAt = now))
        }

        val rpcBody = AmendProviderNoteRequest(
            id = noteId,
            transcript = transcript,
            reason = reason,
        )
        if (networkMonitor.isOnline() && predecessorSyncId == null) {
            try {
                val response = supabaseApi.rpcAmendProviderNote(rpcBody)
                if (response.isSuccessful) return@withContext null
            } catch (_: Exception) {
                // Fall through to queue
            }
        }

        val syncEntry = SyncQueueEntry(
            id = UUID.randomUUID().toString(),
            operationType = "amend_provider_note",
            entityType = "provider_notes",
            entityId = noteId,
            payload = json.encodeToString(AmendProviderNoteRequest.serializer(), rpcBody),
            status = "pending",
            attempts = 0,
            createdAt = System.currentTimeMillis(),
            dependsOn = predecessorSyncId,
        )
        syncQueueDao.insert(syncEntry)
        syncEntry.id
    }

    /**
     * Void a note. Senior clinicians only on the server. Direct-writes via
     * rpcVoidProviderNote when online, otherwise queues `void_provider_note`.
     */
    suspend fun voidNote(
        noteId: String,
        reason: String,
        predecessorSyncId: String? = null,
    ): String? = withContext(Dispatchers.IO) {
        val now = Instant.now().toString()
        providerNoteDao.updateLifecycle(
            id = noteId,
            status = "voided",
            finalizedAt = null,
            finalizedBy = null,
            amendedAt = null,
            amendedBy = null,
            voidedAt = now,
            voidedBy = null,
            voidReason = reason,
            updatedAt = now,
        )

        val rpcBody = VoidProviderNoteRequest(id = noteId, reason = reason)
        if (networkMonitor.isOnline() && predecessorSyncId == null) {
            try {
                val response = supabaseApi.rpcVoidProviderNote(rpcBody)
                if (response.isSuccessful) return@withContext null
            } catch (_: Exception) {
                // Fall through to queue
            }
        }

        val syncEntry = SyncQueueEntry(
            id = UUID.randomUUID().toString(),
            operationType = "void_provider_note",
            entityType = "provider_notes",
            entityId = noteId,
            payload = json.encodeToString(VoidProviderNoteRequest.serializer(), rpcBody),
            status = "pending",
            attempts = 0,
            createdAt = System.currentTimeMillis(),
            dependsOn = predecessorSyncId,
        )
        syncQueueDao.insert(syncEntry)
        syncEntry.id
    }

    /**
     * Append an addendum to a signed note (migration 044). Original note is
     * preserved on provider_notes; the addendum lives in
     * provider_note_addendums and is the canonical record of the appended
     * text. Direct-writes via rpcAddendProviderNote when online, otherwise
     * queues `addend_provider_note`.
     */
    suspend fun addendNote(
        noteId: String,
        addendumText: String,
        predecessorSyncId: String? = null,
    ): String? = withContext(Dispatchers.IO) {
        val now = Instant.now().toString()
        // Bump local status to 'addended' unless the parent is already a
        // stronger state (cosigned/amended) — mirrors the RPC's CASE.
        val existing = providerNoteDao.getByIdOnce(noteId)
        if (existing != null && existing.status !in setOf("cosigned", "amended")) {
            providerNoteDao.updateLifecycle(
                id = noteId,
                status = "addended",
                finalizedAt = null,
                finalizedBy = null,
                amendedAt = null,
                amendedBy = null,
                voidedAt = null,
                voidedBy = null,
                voidReason = null,
                updatedAt = now,
            )
        }

        val rpcBody = AddendProviderNoteRequest(id = noteId, addendumText = addendumText)
        if (networkMonitor.isOnline() && predecessorSyncId == null) {
            try {
                val response = supabaseApi.rpcAddendProviderNote(rpcBody)
                if (response.isSuccessful) return@withContext null
            } catch (_: Exception) {
                // Fall through to queue
            }
        }

        val syncEntry = SyncQueueEntry(
            id = UUID.randomUUID().toString(),
            operationType = "addend_provider_note",
            entityType = "provider_notes",
            entityId = noteId,
            payload = json.encodeToString(AddendProviderNoteRequest.serializer(), rpcBody),
            status = "pending",
            attempts = 0,
            createdAt = System.currentTimeMillis(),
            dependsOn = predecessorSyncId,
        )
        syncQueueDao.insert(syncEntry)
        syncEntry.id
    }

    /**
     * Attending counter-signs a mid-level provider's note (migration 044).
     * Server-side check forbids self-cosign and requires an attending role.
     * Direct-writes via rpcCosignProviderNote when online, otherwise queues
     * `cosign_provider_note`.
     */
    suspend fun cosignNote(
        noteId: String,
        predecessorSyncId: String? = null,
    ): String? = withContext(Dispatchers.IO) {
        val now = Instant.now().toString()
        val existing = providerNoteDao.getByIdOnce(noteId)
        if (existing != null) {
            providerNoteDao.updateLifecycle(
                id = noteId,
                status = "cosigned",
                finalizedAt = null,
                finalizedBy = null,
                amendedAt = null,
                amendedBy = null,
                voidedAt = null,
                voidedBy = null,
                voidReason = null,
                updatedAt = now,
            )
        }

        val rpcBody = CosignProviderNoteRequest(id = noteId)
        if (networkMonitor.isOnline() && predecessorSyncId == null) {
            try {
                val response = supabaseApi.rpcCosignProviderNote(rpcBody)
                if (response.isSuccessful) return@withContext null
            } catch (_: Exception) {
                // Fall through to queue
            }
        }

        val syncEntry = SyncQueueEntry(
            id = UUID.randomUUID().toString(),
            operationType = "cosign_provider_note",
            entityType = "provider_notes",
            entityId = noteId,
            payload = json.encodeToString(CosignProviderNoteRequest.serializer(), rpcBody),
            status = "pending",
            attempts = 0,
            createdAt = System.currentTimeMillis(),
            dependsOn = predecessorSyncId,
        )
        syncQueueDao.insert(syncEntry)
        syncEntry.id
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

    /**
     * Save the structured clinical fields that are operationally separate from
     * the receipt note: diagnosis, pharmacy text, lab text, follow-up
     * instructions, and the richer note-section JSON.
     */
    suspend fun saveClinicalSummary(
        visitId: String,
        diagnosis: String?,
        medications: String?,
        followUpInstructions: String?,
        testsOrdered: String?,
        structuredData: String?,
        predecessorSyncId: String? = null,
    ): String? = withContext(Dispatchers.IO) {
        val now = Instant.now().toString()
        visitDao.updateClinicalSummary(
            id = visitId,
            diagnosis = diagnosis,
            medications = medications,
            followUpInstructions = followUpInstructions,
            testsOrdered = testsOrdered,
            updatedAt = now,
        )
        providerNoteDao.updateStructuredData(visitId, structuredData, now)

        val rpcBody = VisitClinicalSummaryUpsertDto(
            visitId = visitId,
            diagnosis = diagnosis,
            medications = medications,
            followUpInstructions = followUpInstructions,
            testsOrdered = testsOrdered,
            structuredData = structuredData,
        )
        val effectivePredecessor = predecessorSyncId ?: getPendingVisitSyncDependency(visitId)

        if (networkMonitor.isOnline() && effectivePredecessor == null) {
            try {
                val response = supabaseApi.rpcUpsertVisitClinicalSummary(rpcBody)
                if (response.isSuccessful) return@withContext null
            } catch (_: Exception) {
                // Fall through to queue
            }
        }

        val syncEntry = SyncQueueEntry(
            id = UUID.randomUUID().toString(),
            operationType = "upsert_visit_clinical_summary",
            entityType = "visits",
            entityId = visitId,
            payload = json.encodeToString(VisitClinicalSummaryUpsertDto.serializer(), rpcBody),
            status = "pending",
            attempts = 0,
            createdAt = System.currentTimeMillis(),
            dependsOn = effectivePredecessor,
        )
        syncQueueDao.insert(syncEntry)
        syncEntry.id
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
