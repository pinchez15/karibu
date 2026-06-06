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
    private val providerNoteDao: ProviderNoteDao,
    private val referralDao: ReferralDao,
    private val admissionDao: AdmissionDao,
    private val admissionObservationDao: AdmissionObservationDao,
    private val medicationOrderDao: MedicationOrderDao,
    private val medicationAdministrationDao: MedicationAdministrationDao,
    private val deliveryDao: DeliveryDao,
    private val supabaseApi: SupabaseApi,
    private val networkMonitor: NetworkMonitor,
    private val pullReconciliationService: PullReconciliationService,
    private val syncDebugLogger: SyncDebugLogger,
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

        // #region agent log
        syncDebugLogger.log(
            hypothesisId = "H-C",
            location = "SyncEngine.kt:processQueue",
            message = "queue_batch_start",
            data = mapOf(
                "retryableCount" to entries.size.toString(),
                "operationTypes" to entries.joinToString(",") { it.operationType }.take(500),
            ),
        )
        // #endregion

        val sorted = topologicalSort(entries)
        var processedCount = 0
        var failedCount = 0

        for (entry in sorted) {
            if (!networkMonitor.isOnline()) break

            // Check dependency
            if (entry.dependsOn != null) {
                val dependency = syncQueueDao.getById(entry.dependsOn)
                if (dependency != null && dependency.status != "completed") {
                    Log.d(TAG, "Skipping ${entry.id} -- dependency ${entry.dependsOn} not completed")
                    // #region agent log
                    syncDebugLogger.log(
                        hypothesisId = "H-E",
                        location = "SyncEngine.kt:processQueue",
                        message = "skipped_waiting_on_dependency",
                        data = mapOf(
                            "entryId" to entry.id,
                            "operation" to entry.operationType,
                            "dependsOn" to entry.dependsOn,
                            "depStatus" to dependency.status,
                            "depOperation" to dependency.operationType,
                        ),
                    )
                    // #endregion
                    continue
                }
            }

            try {
                // #region agent log
                syncDebugLogger.log(
                    hypothesisId = "H-A",
                    location = "SyncEngine.kt:processQueue",
                    message = "processing_entry",
                    data = mapOf(
                        "entryId" to entry.id,
                        "operation" to entry.operationType,
                        "entityId" to entry.entityId,
                        "dependsOn" to entry.dependsOn,
                        "attempts" to entry.attempts.toString(),
                        "payloadPreview" to entry.payload.take(200),
                    ),
                )
                // #endregion
                syncQueueDao.update(entry.copy(status = "in_progress"))
                processEntry(entry)
                syncQueueDao.update(entry.copy(status = "completed", serverEntityId = entry.entityId))
                processedCount++
            } catch (e: Exception) {
                Log.e(TAG, "Sync failed for ${entry.id}: ${e.message}")
                // #region agent log
                syncDebugLogger.log(
                    hypothesisId = when (entry.operationType) {
                        "sign_provider_note" -> "H-A"
                        "amend_provider_note" -> "H-D"
                        "upsert_patient_note_summary" -> "H-C"
                        "upsert_provider_note" -> "H-B"
                        else -> "H-E"
                    },
                    location = "SyncEngine.kt:processQueue",
                    message = "sync_failed",
                    data = mapOf(
                        "entryId" to entry.id,
                        "operation" to entry.operationType,
                        "entityId" to entry.entityId,
                        "error" to (e.message?.take(400)),
                    ),
                )
                // #endregion
                failedCount++
                SyncMetrics.recordRpcError(entry.operationType, null, e.message)
                val nextAttempt = entry.attempts + 1
                val backoffMs = BACKOFF_BASE_MS * (1L shl minOf(nextAttempt, 5))
                val nextStatus = if (nextAttempt >= entry.maxAttempts) "failed" else "pending"
                syncQueueDao.update(
                    entry.copy(
                        status = nextStatus,
                        attempts = nextAttempt,
                        lastError = e.message,
                        nextRetryAt = System.currentTimeMillis() + backoffMs,
                    )
                )
                // Phase 6 fix: transitive failure propagation. Without this,
                // dependents of a terminal-failed entry sit at status='pending'
                // forever — the single-hop check at line 51 keeps refusing to
                // process them because the parent never flips to 'completed'.
                // Now they fail with a clear reason and the UI's failing-entries
                // observable surfaces the whole chain for triage.
                if (nextStatus == "failed") {
                    markDependentsFailed(entry.id, "upstream ${entry.operationType} failed: ${e.message}")
                }
            }
        }

        // Clean up old completed entries (older than 7 days)
        val sevenDaysAgo = System.currentTimeMillis() - (7L * 24 * 60 * 60 * 1000)
        syncQueueDao.deleteCompleted(sevenDaysAgo)

        if (processedCount > 0) {
            pullReconciliationService.reconcileAfterPull()
        }
        SyncMetrics.recordQueueProcessed(processedCount, failedCount)
        SyncMetrics.recordOutboxDepth(syncQueueDao.getPending().size)

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
            // Migration 039 lifecycle ops — senior-clinician signed / amended
            // / voided notes that were queued while offline.
            "sign_provider_note" -> syncSignProviderNote(entry)
            "amend_provider_note" -> syncAmendProviderNote(entry)
            "void_provider_note" -> syncVoidProviderNote(entry)
            // Migration 044 lifecycle ops.
            "addend_provider_note" -> syncAddendProviderNote(entry)
            "cosign_provider_note" -> syncCosignProviderNote(entry)
            "finalize_clinical_encounter" -> syncFinalizeClinicalEncounter(entry)
            "queue_op" -> syncQueueOperation(entry)
            "record_payment" -> syncRecordPayment(entry)
            "rpc_submit_pharmacy_order" -> syncSubmitPharmacyOrder(entry)
            "rpc_start_lab" -> syncStartLab(entry)
            "rpc_record_lab_result" -> syncRecordLabResult(entry)
            "rpc_set_dispensing_status" -> syncSetDispensingStatus(entry)
            "rpc_record_dispense" -> syncRecordDispense(entry)
            "rpc_create_referral" -> syncCreateReferral(entry)
            "rpc_admit_patient_v2" -> syncAdmitPatientV2(entry)
            "rpc_record_admission_observation" -> syncRecordAdmissionObservation(entry)
            "rpc_add_medication_order" -> syncAddMedicationOrder(entry)
            "rpc_stop_medication_order" -> syncStopMedicationOrder(entry)
            "rpc_record_medication_admin" -> syncRecordMedicationAdmin(entry)
            "rpc_discharge_admission" -> syncDischargeAdmission(entry)
            "rpc_record_delivery" -> syncRecordDelivery(entry)
            "record_review_response" -> syncRecordReviewResponse(entry)
            else -> Log.w(TAG, "Unknown operation type: ${entry.operationType}")
        }
    }

    private suspend fun syncCreatePatient(entry: SyncQueueEntry) {
        val dto = json.decodeFromString(PatientCreateDto.serializer(), entry.payload)
        Log.d(TAG, "Syncing create_patient via RPC: ${entry.entityId}")

        val response = supabaseApi.rpcCreatePatient(dto.toRpcRequest(clientOpId = entry.id))
        if (!response.isSuccessful) {
            val body = response.errorBody()?.string().orEmpty()
            SyncMetrics.recordRpcError("create_patient", response.code(), body)
            val hint = if (response.code() == 404) {
                " (database missing rpc_create_patient — run Supabase migration 046+ on the project)"
            } else {
                ""
            }
            throw IllegalStateException(
                "rpc_create_patient HTTP ${response.code()} ${body.take(300)}$hint".trim(),
            )
        }

        val serverPatient = supabaseApi.getPatientById("eq.${dto.id}").firstOrNull()
        if (serverPatient != null) {
            patientDao.upsert(serverPatient.toEntity(isSynced = true))
            if (serverPatient.id != entry.entityId) {
                propagateRemoteId(entry.id, entry.entityId, serverPatient.id)
            }
        } else {
            patientDao.updateSyncState(dto.id, true)
        }
    }

    /**
     * Phase 6 helper: rewrite the local UUID to the server UUID in every
     * pending dependent's payload, so downstream RPCs ship with the FK that
     * actually exists server-side. Called from both the success and conflict
     * paths of syncCreatePatient (and from syncCreateVisit if the server ever
     * rewrites visit ids).
     */
    private suspend fun propagateRemoteId(entrySyncId: String, localId: String, remoteId: String) {
        if (localId == remoteId) return
        val dependents = syncQueueDao.getDependents(entrySyncId)
        for (dep in dependents) {
            if (!dep.payload.contains(localId)) continue
            val updatedPayload = dep.payload.replace(localId, remoteId)
            syncQueueDao.update(dep.copy(payload = updatedPayload))
        }
    }

    /**
     * Phase 6 helper: when an entry hits terminal 'failed' state, cascade
     * the failure to every transitive dependent. Without this, dependents
     * sit at status='pending' forever — the single-hop dependency gate
     * keeps refusing to process them because the parent never flips to
     * 'completed'. Cycles are structurally impossible (single-parent
     * dependsOn + topological insertion order).
     */
    private suspend fun markDependentsFailed(entryId: String, reason: String) {
        val dependents = syncQueueDao.getDependents(entryId)
        for (dep in dependents) {
            if (dep.status == "completed" || dep.status == "failed") continue
            Log.w(TAG, "Cascading failure to ${dep.id} (${dep.operationType}): $reason")
            syncQueueDao.update(
                dep.copy(
                    status = "failed",
                    lastError = reason,
                )
            )
            markDependentsFailed(dep.id, "upstream ${dep.operationType} failed: $reason")
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
            if (result.code() == 409 && dto.visitId != null &&
                body.contains("idx_provider_notes_visit_unique")
            ) {
                // #region agent log
                syncDebugLogger.log(
                    hypothesisId = "H-B",
                    location = "SyncEngine.kt:syncUpsertProviderNote",
                    message = "409_visit_unique_reconcile_start",
                    data = mapOf(
                        "localNoteId" to dto.id,
                        "visitId" to dto.visitId,
                    ),
                )
                // #endregion
                reconcileProviderNoteByVisit(dto.visitId, localNoteId = dto.id)
                Log.d(TAG, "Provider note reconciled after visit_id conflict: ${dto.visitId}")
                return
            }
            throw IllegalStateException("upsert_provider_note HTTP ${result.code()} ${body.take(300)}".trim())
        }
        reconcileProviderNoteByVisit(dto.visitId, localNoteId = dto.id)
        Log.d(TAG, "Provider note synced: ${entry.entityId}")
    }

    /**
     * After a successful visit-tied upsert (or a 409 we treated as success), align
     * local Room id with the canonical server row for that visit.
     */
    private suspend fun reconcileProviderNoteByVisit(visitId: String?, localNoteId: String) {
        if (visitId.isNullOrBlank()) return
        val server = supabaseApi.getProviderNote(visitId = "eq.$visitId").firstOrNull()
        // #region agent log
        syncDebugLogger.log(
            hypothesisId = "H-B",
            location = "SyncEngine.kt:reconcileProviderNoteByVisit",
            message = if (server == null) "reconcile_no_server_note" else "reconcile_server_note_found",
            data = mapOf(
                "visitId" to visitId,
                "localNoteId" to localNoteId,
                "serverNoteId" to server?.id,
            ),
        )
        // #endregion
        if (server == null) return
        val local = providerNoteDao.getByVisitIdOnce(visitId)
        if (local != null && local.id != server.id) {
            providerNoteDao.deleteById(local.id)
        }
        providerNoteDao.upsert(server.toEntity())
        if (server.id != localNoteId) {
            propagateRemoteIdForEntity(localNoteId, server.id)
        }
    }

    private suspend fun propagateRemoteIdForEntity(localId: String, remoteId: String) {
        if (localId == remoteId) return
        val entries = syncQueueDao.getPending()
        var updated = 0
        for (entry in entries) {
            if (!entry.payload.contains(localId)) continue
            syncQueueDao.update(entry.copy(payload = entry.payload.replace(localId, remoteId)))
            updated++
        }
        // #region agent log
        syncDebugLogger.log(
            hypothesisId = "H-B",
            location = "SyncEngine.kt:propagateRemoteIdForEntity",
            message = "note_id_propagation",
            data = mapOf(
                "localId" to localId,
                "remoteId" to remoteId,
                "pendingEntriesScanned" to entries.size.toString(),
                "payloadsUpdated" to updated.toString(),
            ),
        )
        // #endregion
    }

    private suspend fun syncSignProviderNote(entry: SyncQueueEntry) {
        val dto = json.decodeFromString(SignProviderNoteRequest.serializer(), entry.payload)
        // #region agent log
        syncDebugLogger.log(
            hypothesisId = "H-A",
            location = "SyncEngine.kt:syncSignProviderNote",
            message = "sign_attempt",
            data = mapOf(
                "queueEntryId" to entry.id,
                "noteId" to dto.id,
                "entityId" to entry.entityId,
                "dependsOn" to entry.dependsOn,
            ),
        )
        // #endregion
        Log.d(TAG, "Syncing sign_provider_note: ${entry.entityId}")
        val result = supabaseApi.rpcSignProviderNote(dto)
        if (!result.isSuccessful) {
            val body = result.errorBody()?.string().orEmpty()
            throw IllegalStateException("sign_provider_note HTTP ${result.code()} ${body.take(300)}".trim())
        }
        Log.d(TAG, "Provider note signed: ${entry.entityId}")
    }

    private suspend fun syncAmendProviderNote(entry: SyncQueueEntry) {
        val dto = json.decodeFromString(AmendProviderNoteRequest.serializer(), entry.payload)
        Log.d(TAG, "Syncing amend_provider_note: ${entry.entityId}")
        val result = supabaseApi.rpcAmendProviderNote(dto)
        if (!result.isSuccessful) {
            val body = result.errorBody()?.string().orEmpty()
            throw IllegalStateException("amend_provider_note HTTP ${result.code()} ${body.take(300)}".trim())
        }
        Log.d(TAG, "Provider note amended: ${entry.entityId}")
    }

    private suspend fun syncVoidProviderNote(entry: SyncQueueEntry) {
        val dto = json.decodeFromString(VoidProviderNoteRequest.serializer(), entry.payload)
        Log.d(TAG, "Syncing void_provider_note: ${entry.entityId}")
        val result = supabaseApi.rpcVoidProviderNote(dto)
        if (!result.isSuccessful) {
            val body = result.errorBody()?.string().orEmpty()
            throw IllegalStateException("void_provider_note HTTP ${result.code()} ${body.take(300)}".trim())
        }
        Log.d(TAG, "Provider note voided: ${entry.entityId}")
    }

    private suspend fun syncAddendProviderNote(entry: SyncQueueEntry) {
        val dto = json.decodeFromString(AddendProviderNoteRequest.serializer(), entry.payload)
        Log.d(TAG, "Syncing addend_provider_note: ${entry.entityId}")
        val result = supabaseApi.rpcAddendProviderNote(dto)
        if (!result.isSuccessful) {
            val body = result.errorBody()?.string().orEmpty()
            throw IllegalStateException("addend_provider_note HTTP ${result.code()} ${body.take(300)}".trim())
        }
        Log.d(TAG, "Provider note addended: ${entry.entityId}")
    }

    private suspend fun syncCosignProviderNote(entry: SyncQueueEntry) {
        val dto = json.decodeFromString(CosignProviderNoteRequest.serializer(), entry.payload)
        Log.d(TAG, "Syncing cosign_provider_note: ${entry.entityId}")
        val result = supabaseApi.rpcCosignProviderNote(dto)
        if (!result.isSuccessful) {
            val body = result.errorBody()?.string().orEmpty()
            throw IllegalStateException("cosign_provider_note HTTP ${result.code()} ${body.take(300)}".trim())
        }
        Log.d(TAG, "Provider note cosigned: ${entry.entityId}")
    }

    private suspend fun syncFinalizeClinicalEncounter(entry: SyncQueueEntry) {
        val decoded = json.decodeFromString(FinalizeClinicalEncounterRequest.serializer(), entry.payload)
        val dto = decoded.copy(clientOpId = decoded.clientOpId ?: entry.id)
        Log.d(TAG, "Syncing finalize_clinical_encounter: ${entry.entityId}")
        val result = supabaseApi.rpcFinalizeClinicalEncounter(dto)
        if (!result.isSuccessful) {
            val body = result.errorBody()?.string().orEmpty()
            throw IllegalStateException("finalize_clinical_encounter HTTP ${result.code()} ${body.take(300)}".trim())
        }
        visitDao.updateSyncState(entry.entityId, true)
        reconcileProviderNoteByVisit(dto.visitId, localNoteId = dto.noteId)
        Log.d(TAG, "Clinical encounter finalized: ${entry.entityId}")
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
        // Pass the params object straight through as a JsonObject. The
        // earlier coerce-to-Map<String,String> path tripped the
        // kotlinx-serialization Retrofit converter ("Unable to create
        // @Body converter for java.util.Map<java.lang.String,
        // java.lang.Object>") — every queue_op then retried forever
        // without ever leaving the device.
        val rpcParams = payload["params"]?.jsonObject
            ?: kotlinx.serialization.json.JsonObject(emptyMap())

        val response = when (rpcName) {
            "assign_to_nurse" -> supabaseApi.assignToNurse(rpcParams)
            "mark_ready_for_doctor" -> supabaseApi.markReadyForDoctor(rpcParams)
            "claim_patient" -> supabaseApi.claimPatient(rpcParams)
            "start_visit_self_triage" -> supabaseApi.startVisitSelfTriage(rpcParams)
            "complete_visit_queue" -> supabaseApi.completeVisitQueue(rpcParams)
            "check_in_patient" -> supabaseApi.checkInPatient(rpcParams)
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
        val decoded = json.decodeFromString(RecordPaymentRpcRequest.serializer(), entry.payload)
        val dto = decoded.copy(clientOpId = decoded.clientOpId ?: entry.id)
        Log.d(TAG, "Syncing record_payment: ${entry.entityId}")

        val response = supabaseApi.rpcRecordPayment(dto)
        val existing = paymentDao.getByVisitIdOnce(dto.visitId)
        val now = java.time.Instant.now().toString()
        paymentDao.upsert(
            (existing ?: com.karibuhealth.app.data.local.db.entity.PaymentEntity(
                id = dto.id,
                visitId = dto.visitId,
                clinicId = dto.clinicId,
                patientId = dto.patientId,
                amountUgx = dto.amountUgx,
                paymentMethod = dto.paymentMethod,
                status = dto.status,
                receiptNumber = "",
                serviceType = dto.serviceType,
                notes = dto.notes,
                collectedBy = dto.collectedBy,
                createdAt = now,
                updatedAt = now,
                isSynced = false,
            )).copy(
                receiptNumber = response.receiptNumber.orEmpty().ifBlank {
                    existing?.receiptNumber.orEmpty()
                },
                isSynced = true,
                updatedAt = now,
            ),
        )
        Log.d(TAG, "Payment synced via RPC: ${dto.id}, receipt: ${response.receiptNumber}")
    }

    private suspend fun syncSubmitPharmacyOrder(entry: SyncQueueEntry) {
        val decoded = json.decodeFromString(SubmitPharmacyOrderRequest.serializer(), entry.payload)
        val dto = decoded.copy(clientOpId = decoded.clientOpId ?: entry.id)
        Log.d(TAG, "Syncing rpc_submit_pharmacy_order: ${entry.entityId}")
        val result = supabaseApi.rpcSubmitPharmacyOrder(dto)
        if (!result.isSuccessful) {
            val body = result.errorBody()?.string().orEmpty()
            throw IllegalStateException("rpc_submit_pharmacy_order HTTP ${result.code()} ${body.take(300)}".trim())
        }
        visitDao.updateSyncState(entry.entityId, true)
    }

    private suspend fun syncStartLab(entry: SyncQueueEntry) {
        val decoded = json.decodeFromString(StartLabRequest.serializer(), entry.payload)
        val dto = decoded.copy(clientOpId = decoded.clientOpId ?: entry.id)
        Log.d(TAG, "Syncing rpc_start_lab: ${entry.entityId}")
        val result = supabaseApi.rpcStartLab(dto)
        if (!result.isSuccessful) {
            val body = result.errorBody()?.string().orEmpty()
            throw IllegalStateException("rpc_start_lab HTTP ${result.code()} ${body.take(300)}".trim())
        }
        visitDao.updateSyncState(entry.entityId, true)
    }

    private suspend fun syncRecordLabResult(entry: SyncQueueEntry) {
        val decoded = json.decodeFromString(RecordLabResultRequest.serializer(), entry.payload)
        val dto = decoded.copy(clientOpId = decoded.clientOpId ?: entry.id)
        Log.d(TAG, "Syncing rpc_record_lab_result: ${entry.entityId}")
        val result = supabaseApi.rpcRecordLabResult(dto)
        if (!result.isSuccessful) {
            val body = result.errorBody()?.string().orEmpty()
            throw IllegalStateException("rpc_record_lab_result HTTP ${result.code()} ${body.take(300)}".trim())
        }
        visitDao.updateSyncState(entry.entityId, true)
    }

    private suspend fun syncSetDispensingStatus(entry: SyncQueueEntry) {
        val decoded = json.decodeFromString(SetDispensingStatusRequest.serializer(), entry.payload)
        val dto = decoded.copy(clientOpId = decoded.clientOpId ?: entry.id)
        Log.d(TAG, "Syncing rpc_set_dispensing_status: ${entry.entityId}")
        val result = supabaseApi.rpcSetDispensingStatus(dto)
        if (!result.isSuccessful) {
            val body = result.errorBody()?.string().orEmpty()
            throw IllegalStateException("rpc_set_dispensing_status HTTP ${result.code()} ${body.take(300)}".trim())
        }
        visitDao.updateSyncState(entry.entityId, true)
    }

    private suspend fun syncRecordDispense(entry: SyncQueueEntry) {
        val decoded = json.decodeFromString(RecordDispenseRequest.serializer(), entry.payload)
        val dto = decoded.copy(clientOpId = decoded.clientOpId ?: entry.id)
        Log.d(TAG, "Syncing rpc_record_dispense: ${entry.entityId}")
        val result = supabaseApi.rpcRecordDispense(dto)
        if (!result.isSuccessful) {
            val body = result.errorBody()?.string().orEmpty()
            throw IllegalStateException("rpc_record_dispense HTTP ${result.code()} ${body.take(300)}".trim())
        }
        visitDao.updateSyncState(entry.entityId, true)
    }

    private suspend fun syncCreateReferral(entry: SyncQueueEntry) {
        val decoded = json.decodeFromString(CreateReferralRequest.serializer(), entry.payload)
        val dto = decoded.copy(clientOpId = decoded.clientOpId ?: entry.id)
        Log.d(TAG, "Syncing rpc_create_referral: ${entry.entityId}")
        val result = supabaseApi.rpcCreateReferral(dto)
        if (!result.isSuccessful) {
            val body = result.errorBody()?.string().orEmpty()
            throw IllegalStateException("rpc_create_referral HTTP ${result.code()} ${body.take(300)}".trim())
        }
        referralDao.markSynced(entry.entityId)
    }

    private suspend fun syncAdmitPatientV2(entry: SyncQueueEntry) {
        val decoded = json.decodeFromString(AdmitPatientV2Request.serializer(), entry.payload)
        val dto = decoded.copy(clientOpId = decoded.clientOpId ?: entry.entityId)
        Log.d(TAG, "Syncing rpc_admit_patient_v2: ${entry.entityId}")
        val result = supabaseApi.rpcAdmitPatientV2(dto)
        if (!result.isSuccessful) {
            val body = result.errorBody()?.string().orEmpty()
            throw IllegalStateException("rpc_admit_patient_v2 HTTP ${result.code()} ${body.take(300)}".trim())
        }
        admissionDao.markSynced(entry.entityId)
    }

    private suspend fun syncRecordAdmissionObservation(entry: SyncQueueEntry) {
        val decoded = json.decodeFromString(RecordAdmissionObservationRequest.serializer(), entry.payload)
        val dto = decoded.copy(clientOpId = decoded.clientOpId ?: entry.entityId)
        Log.d(TAG, "Syncing rpc_record_admission_observation: ${entry.entityId}")
        val result = supabaseApi.rpcRecordAdmissionObservation(dto)
        if (!result.isSuccessful) {
            val body = result.errorBody()?.string().orEmpty()
            throw IllegalStateException(
                "rpc_record_admission_observation HTTP ${result.code()} ${body.take(300)}".trim(),
            )
        }
        admissionObservationDao.markSynced(entry.entityId)
    }

    private suspend fun syncAddMedicationOrder(entry: SyncQueueEntry) {
        val decoded = json.decodeFromString(AddMedicationOrderRequest.serializer(), entry.payload)
        val dto = decoded.copy(clientOpId = decoded.clientOpId ?: entry.entityId)
        val result = supabaseApi.rpcAddMedicationOrder(dto)
        if (!result.isSuccessful) {
            val body = result.errorBody()?.string().orEmpty()
            throw IllegalStateException("rpc_add_medication_order HTTP ${result.code()} ${body.take(300)}".trim())
        }
        medicationOrderDao.markSynced(entry.entityId)
    }

    private suspend fun syncStopMedicationOrder(entry: SyncQueueEntry) {
        val decoded = json.decodeFromString(StopMedicationOrderRequest.serializer(), entry.payload)
        val dto = decoded.copy(clientOpId = decoded.clientOpId ?: entry.entityId)
        val result = supabaseApi.rpcStopMedicationOrder(dto)
        if (!result.isSuccessful) {
            val body = result.errorBody()?.string().orEmpty()
            throw IllegalStateException("rpc_stop_medication_order HTTP ${result.code()} ${body.take(300)}".trim())
        }
        medicationOrderDao.markSynced(entry.entityId)
    }

    private suspend fun syncRecordMedicationAdmin(entry: SyncQueueEntry) {
        val decoded = json.decodeFromString(RecordMedicationAdminRequest.serializer(), entry.payload)
        val dto = decoded.copy(clientOpId = decoded.clientOpId ?: entry.entityId)
        val result = supabaseApi.rpcRecordMedicationAdmin(dto)
        if (!result.isSuccessful) {
            val body = result.errorBody()?.string().orEmpty()
            throw IllegalStateException("rpc_record_medication_admin HTTP ${result.code()} ${body.take(300)}".trim())
        }
        medicationAdministrationDao.markSynced(entry.entityId)
    }

    private suspend fun syncDischargeAdmission(entry: SyncQueueEntry) {
        val decoded = json.decodeFromString(DischargeAdmissionRequest.serializer(), entry.payload)
        val dto = decoded.copy(clientOpId = decoded.clientOpId ?: entry.entityId)
        val result = supabaseApi.rpcDischargeAdmission(dto)
        if (!result.isSuccessful) {
            val body = result.errorBody()?.string().orEmpty()
            throw IllegalStateException("rpc_discharge_admission HTTP ${result.code()} ${body.take(300)}".trim())
        }
        admissionDao.markSynced(entry.entityId)
    }

    private suspend fun syncRecordDelivery(entry: SyncQueueEntry) {
        val decoded = json.decodeFromString(RecordDeliveryRequest.serializer(), entry.payload)
        val dto = decoded.copy(clientOpId = decoded.clientOpId ?: entry.entityId)
        val result = supabaseApi.rpcRecordDelivery(dto)
        if (!result.isSuccessful) {
            val body = result.errorBody()?.string().orEmpty()
            throw IllegalStateException("rpc_record_delivery HTTP ${result.code()} ${body.take(300)}".trim())
        }
        deliveryDao.markSynced(entry.entityId)
    }

    private suspend fun syncRecordReviewResponse(entry: SyncQueueEntry) {
        val dto = json.decodeFromString(RecordReviewResponseRequest.serializer(), entry.payload)
        Log.d(TAG, "Syncing record_review_response: ${entry.entityId}")
        val result = supabaseApi.rpcRecordReviewResponse(dto)
        if (!result.isSuccessful) {
            val body = result.errorBody()?.string().orEmpty()
            throw IllegalStateException("record_review_response HTTP ${result.code()} ${body.take(300)}".trim())
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
