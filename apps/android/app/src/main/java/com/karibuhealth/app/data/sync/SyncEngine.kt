package com.karibuhealth.app.data.sync

import android.util.Log
import com.karibuhealth.app.data.local.db.converter.toEntity
import com.karibuhealth.app.data.local.db.dao.*
import com.karibuhealth.app.data.local.db.entity.SyncQueueEntry
import com.karibuhealth.app.data.remote.api.SupabaseApi
import com.karibuhealth.app.data.remote.dto.*
import com.karibuhealth.app.util.NetworkMonitor
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class SyncEngine @Inject constructor(
    private val syncQueueDao: SyncQueueDao,
    private val patientDao: PatientDao,
    private val visitDao: VisitDao,
    private val paymentDao: PaymentDao,
    private val patientVitalsDao: PatientVitalsDao,
    private val supabaseApi: SupabaseApi,
    private val networkMonitor: NetworkMonitor,
    private val json: Json,
) {
    companion object {
        private const val TAG = "SyncEngine"
        private const val BACKOFF_BASE_MS = 30_000L
    }

    suspend fun processQueue(): Int {
        if (!networkMonitor.isOnline()) {
            Log.d(TAG, "Offline, skipping sync")
            return 0
        }

        val entries = syncQueueDao.getRetryable()
        if (entries.isEmpty()) return 0

        val sorted = topologicalSort(entries)
        var processedCount = 0

        for (entry in sorted) {
            if (!networkMonitor.isOnline()) break

            // Check dependency
            if (entry.dependsOn != null) {
                val dependency = syncQueueDao.getById(entry.dependsOn)
                if (dependency != null && dependency.status != "completed") {
                    Log.d(TAG, "Skipping ${entry.id} -- dependency ${entry.dependsOn} not completed")
                    continue
                }
            }

            try {
                syncQueueDao.update(entry.copy(status = "in_progress"))
                processEntry(entry)
                syncQueueDao.update(entry.copy(status = "completed", serverEntityId = entry.entityId))
                processedCount++
            } catch (e: Exception) {
                Log.e(TAG, "Sync failed for ${entry.id}: ${e.message}")
                val nextAttempt = entry.attempts + 1
                val backoffMs = BACKOFF_BASE_MS * (1L shl minOf(nextAttempt, 5))
                syncQueueDao.update(
                    entry.copy(
                        status = if (nextAttempt >= entry.maxAttempts) "failed" else "pending",
                        attempts = nextAttempt,
                        lastError = e.message,
                        nextRetryAt = System.currentTimeMillis() + backoffMs,
                    )
                )
            }
        }

        // Clean up old completed entries (older than 7 days)
        val sevenDaysAgo = System.currentTimeMillis() - (7L * 24 * 60 * 60 * 1000)
        syncQueueDao.deleteCompleted(sevenDaysAgo)

        return processedCount
    }

    private suspend fun processEntry(entry: SyncQueueEntry) {
        when (entry.operationType) {
            "create_patient" -> syncCreatePatient(entry)
            "create_visit" -> syncCreateVisit(entry)
            "upsert_provider_note" -> syncUpsertProviderNote(entry)
            "upsert_patient_note_summary" -> syncUpsertPatientNoteSummary(entry)
            "upsert_visit_clinical_summary" -> syncUpsertVisitClinicalSummary(entry)
            "insert_patient_vitals" -> syncInsertPatientVitals(entry)
            "mark_documentation_complete" -> syncMarkDocumentationComplete(entry)
            "queue_op" -> syncQueueOperation(entry)
            "record_payment" -> syncRecordPayment(entry)
            else -> Log.w(TAG, "Unknown operation type: ${entry.operationType}")
        }
    }

    private suspend fun syncCreatePatient(entry: SyncQueueEntry) {
        val dto = json.decodeFromString(PatientCreateDto.serializer(), entry.payload)
        Log.d(TAG, "Syncing create_patient: ${entry.entityId}")

        try {
            val result = supabaseApi.createPatient(dto)
            val serverPatient = result.firstOrNull()
            if (serverPatient != null) {
                patientDao.upsert(serverPatient.toEntity(isSynced = true))
                Log.d(TAG, "Patient synced: ${serverPatient.id}")
            }
        } catch (e: retrofit2.HttpException) {
            if (e.code() == 409) {
                Log.w(TAG, "Patient conflict (409), fetching existing")
                val existing = supabaseApi.lookupPatient(
                    "eq.${dto.clinicId}",
                    "eq.${dto.whatsappNumber}",
                )
                existing.firstOrNull()?.let { serverPatient ->
                    patientDao.upsert(serverPatient.toEntity(isSynced = true))
                    val dependents = syncQueueDao.getDependents(entry.id)
                    for (dep in dependents) {
                        val updatedPayload = dep.payload.replace(entry.entityId, serverPatient.id)
                        syncQueueDao.update(dep.copy(payload = updatedPayload))
                    }
                }
            } else {
                throw e
            }
        }
    }

    private suspend fun syncCreateVisit(entry: SyncQueueEntry) {
        val dto = decodeVisitCreatePayload(entry)
        Log.d(TAG, "Syncing create_visit (rpc): ${entry.entityId}")

        val result = supabaseApi.rpcCreateVisit(dto)
        if (!result.isSuccessful) {
            val body = result.errorBody()?.string().orEmpty()
            throw IllegalStateException("create_visit HTTP ${result.code()} ${body.take(300)}".trim())
        }

        visitDao.updateSyncState(entry.entityId, true)
        Log.d(TAG, "Visit synced: ${entry.entityId}")
    }

    private suspend fun syncUpsertProviderNote(entry: SyncQueueEntry) {
        val dto = json.decodeFromString(ProviderNoteUpsertDto.serializer(), entry.payload)
        Log.d(TAG, "Syncing upsert_provider_note: ${entry.entityId}")
        val result = supabaseApi.rpcUpsertProviderNote(dto)
        if (!result.isSuccessful) {
            val body = result.errorBody()?.string().orEmpty()
            throw IllegalStateException("upsert_provider_note HTTP ${result.code()} ${body.take(300)}".trim())
        }
        Log.d(TAG, "Provider note synced: ${entry.entityId}")
    }

    private suspend fun syncUpsertPatientNoteSummary(entry: SyncQueueEntry) {
        val dto = json.decodeFromString(PatientNoteSummaryUpsertDto.serializer(), entry.payload)
        Log.d(TAG, "Syncing upsert_patient_note_summary: ${entry.entityId}")
        val result = supabaseApi.rpcUpsertPatientNoteSummary(dto)
        if (!result.isSuccessful) {
            val body = result.errorBody()?.string().orEmpty()
            throw IllegalStateException("upsert_patient_note_summary HTTP ${result.code()} ${body.take(300)}".trim())
        }
        Log.d(TAG, "Patient note summary synced: ${entry.entityId}")
    }

    private suspend fun syncUpsertVisitClinicalSummary(entry: SyncQueueEntry) {
        val dto = json.decodeFromString(VisitClinicalSummaryUpsertDto.serializer(), entry.payload)
        Log.d(TAG, "Syncing upsert_visit_clinical_summary: ${entry.entityId}")
        val result = supabaseApi.rpcUpsertVisitClinicalSummary(dto)
        if (!result.isSuccessful) {
            val body = result.errorBody()?.string().orEmpty()
            throw IllegalStateException("upsert_visit_clinical_summary HTTP ${result.code()} ${body.take(300)}".trim())
        }
        Log.d(TAG, "Visit clinical summary synced: ${entry.entityId}")
    }


    private suspend fun syncInsertPatientVitals(entry: SyncQueueEntry) {
        val dto = json.decodeFromString(PatientVitalsCreateDto.serializer(), entry.payload)
        Log.d(TAG, "Syncing insert_patient_vitals: ${entry.entityId}")
        val result = supabaseApi.rpcInsertPatientVitals(dto)
        if (!result.isSuccessful) {
            val body = result.errorBody()?.string().orEmpty()
            throw IllegalStateException("insert_patient_vitals HTTP ${result.code()} ${body.take(300)}".trim())
        }
        patientVitalsDao.updateSyncState(entry.entityId, true)
        Log.d(TAG, "Vitals synced: ${entry.entityId}")
    }

    private suspend fun syncMarkDocumentationComplete(entry: SyncQueueEntry) {
        val dto = json.decodeFromString(MarkDocumentationCompleteDto.serializer(), entry.payload)
        Log.d(TAG, "Syncing mark_documentation_complete: ${entry.entityId}")
        val result = supabaseApi.rpcMarkDocumentationComplete(dto)
        if (!result.isSuccessful) {
            val body = result.errorBody()?.string().orEmpty()
            throw IllegalStateException("mark_documentation_complete HTTP ${result.code()} ${body.take(300)}".trim())
        }
        Log.d(TAG, "Documentation completion synced: ${entry.entityId}")
    }

    private suspend fun syncQueueOperation(entry: SyncQueueEntry) {
        Log.d(TAG, "Syncing queue_op: ${entry.entityId}")
        val payload = json.decodeFromString(
            kotlinx.serialization.json.JsonObject.serializer(),
            entry.payload,
        )
        val rpcName = payload["rpc"]?.jsonPrimitive?.content
        val rpcParams = payload["params"]?.jsonObject?.mapValues { (_, value) ->
            if (value is kotlinx.serialization.json.JsonPrimitive && value.isString) {
                value.content
            } else {
                value.toString().trim('"')
            }
        }
            ?: emptyMap()

        val response = when (rpcName) {
            "assign_to_nurse" -> supabaseApi.assignToNurse(rpcParams)
            "mark_ready_for_doctor" -> supabaseApi.markReadyForDoctor(rpcParams)
            "claim_patient" -> supabaseApi.claimPatient(rpcParams)
            "start_visit_self_triage" -> supabaseApi.startVisitSelfTriage(rpcParams)
            "complete_visit_queue" -> supabaseApi.completeVisitQueue(rpcParams)
            else -> {
                Log.w(TAG, "Unknown queue RPC: $rpcName")
                null
            }
        }
        if (response != null && !response.isSuccessful) {
            val body = response.errorBody()?.string().orEmpty()
            throw IllegalStateException("${rpcName ?: "queue_op"} HTTP ${response.code()} ${body.take(300)}".trim())
        }
    }

    private suspend fun syncRecordPayment(entry: SyncQueueEntry) {
        val dto = json.decodeFromString(PaymentCreateDto.serializer(), entry.payload)
        Log.d(TAG, "Syncing record_payment: ${entry.entityId}")

        val result = supabaseApi.createPayment(dto)
        val serverPayment = result.firstOrNull()
        if (serverPayment != null) {
            paymentDao.upsert(serverPayment.toEntity(isSynced = true))
            Log.d(TAG, "Payment synced: ${serverPayment.id}, receipt: ${serverPayment.receiptNumber}")
        }
    }

    private suspend fun decodeVisitCreatePayload(entry: SyncQueueEntry): VisitCreateRpcDto {
        return try {
            json.decodeFromString(VisitCreateRpcDto.serializer(), entry.payload)
        } catch (_: SerializationException) {
            val legacy = json.decodeFromString(VisitCreateDto.serializer(), entry.payload)
            val migrated = VisitCreateRpcDto(
                id = legacy.id,
                clinicId = legacy.clinicId,
                patientId = legacy.patientId,
                doctorId = legacy.doctorId,
                chiefComplaint = legacy.chiefComplaint,
                visitDate = legacy.visitDate,
                department = legacy.department,
            )
            syncQueueDao.update(
                entry.copy(
                    payload = json.encodeToString(VisitCreateRpcDto.serializer(), migrated),
                )
            )
            migrated
        }
    }

    private fun topologicalSort(entries: List<SyncQueueEntry>): List<SyncQueueEntry> {
        val byId = entries.associateBy { it.id }
        val visited = mutableSetOf<String>()
        val result = mutableListOf<SyncQueueEntry>()

        fun visit(entry: SyncQueueEntry) {
            if (entry.id in visited) return
            visited.add(entry.id)
            entry.dependsOn?.let { depId ->
                byId[depId]?.let { dep -> visit(dep) }
            }
            result.add(entry)
        }

        entries.forEach { visit(it) }
        return result
    }
}
