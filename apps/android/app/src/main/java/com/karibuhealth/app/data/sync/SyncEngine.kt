package com.karibuhealth.app.data.sync

import android.util.Log
import com.karibuhealth.app.data.local.db.converter.toEntity
import com.karibuhealth.app.data.local.db.dao.*
import com.karibuhealth.app.data.local.db.entity.SyncQueueEntry
import com.karibuhealth.app.data.remote.api.SupabaseApi
import com.karibuhealth.app.data.local.datastore.AuthTokenStore
import com.karibuhealth.app.data.remote.dto.*
import com.karibuhealth.app.data.repository.PrescriptionOrderRepository
import com.karibuhealth.app.util.NetworkMonitor
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
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
    private val postnatalObservationDao: PostnatalObservationDao,
    private val admissionNoteDao: AdmissionNoteDao,
    private val pregnancyDao: PregnancyDao,
    private val ancContactDao: AncContactDao,
    private val htsEventDao: HtsEventDao,
    private val hivCareDao: HivCareDao,
    private val tbEpisodeDao: TbEpisodeDao,
    private val viralLoadDao: ViralLoadDao,
    private val ebolaScreeningDao: EbolaScreeningDao,
    private val ivInfusionDao: IvInfusionDao,
    private val ivInfusionCheckDao: IvInfusionCheckDao,
    private val supabaseApi: SupabaseApi,
    private val networkMonitor: NetworkMonitor,
    private val pullReconciliationService: PullReconciliationService,
    private val syncDebugLogger: SyncDebugLogger,
    private val prescriptionOrderRepository: PrescriptionOrderRepository,
    private val authTokenStore: AuthTokenStore,
    private val tokenRefresher: TokenRefresher,
    private val json: Json,
) {
    companion object {
        private const val TAG = "SyncEngine"
        private const val BACKOFF_BASE_MS = 30_000L
        // WP2 D2: cap exponential backoff at 10 minutes so a transient failure
        // never strands an entry for the ~16 min the raw 30s·2^5 formula reached.
        private const val MAX_BACKOFF_MS = 600_000L
        // WP2 D3: refresh the cached token before a run if it is older than this
        // (Clerk JWTs expire in ~1h; foreground SessionMonitor only runs every 45m).
        private const val PROACTIVE_REFRESH_AGE_MS = 45L * 60 * 1000
    }

    // Serializes queue runs in-process (worker + direct ViewModel calls), so
    // the stale-in_progress reset below can't clobber a concurrent run.
    private val queueMutex = Mutex()

    suspend fun processQueue(): Int = queueMutex.withLock {
        // WP2 D1: gate on isConnected() (any INTERNET-capable network), NOT
        // isOnline() (which requires NET_CAPABILITY_VALIDATED). Android's
        // validation probe flaps on congested 4G; the request itself is the only
        // honest connectivity test. A failed attempt costs one backoff; a skipped
        // attempt costs the clinic a day of records.
        if (!networkMonitor.isConnected()) {
            Log.d(TAG, "No network, skipping sync")
            logRunSummary(0, 0, 0, 0, 0, bailedNoNetwork = true)
            return 0
        }

        // WP2 D3: refresh a stale cached token before the batch so we don't burn
        // the first entries of a run on avoidable 401s.
        maybeProactiveRefresh()

        // Recover entries stranded at 'in_progress' by process death or a
        // cancelled worker. The engine is the only writer and runs are
        // serialized, so anything in_progress at run start is stale.
        val recovered = syncQueueDao.resetInProgress()
        if (recovered > 0) {
            Log.w(TAG, "Reset $recovered stale in_progress entries to pending")
        }

        val entries = syncQueueDao.getRetryable()
        if (entries.isEmpty()) {
            logRunSummary(0, 0, 0, 0, 0, bailedNoNetwork = false)
            return 0
        }

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
        var attempted = 0
        var succeeded = 0
        var transientFail = 0
        var permanentFail = 0
        var skippedDependency = 0
        // WP2 D2/D3: at most one token refresh per queue run.
        var didRefreshThisRun = false

        for (entry in sorted) {
            if (!networkMonitor.isConnected()) break

            // Check dependency
            if (entry.dependsOn != null) {
                val dependency = syncQueueDao.getById(entry.dependsOn)
                if (dependency != null && dependency.status != "completed") {
                    skippedDependency++
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

            attempted++
            try {
                logProcessingEntry(entry)
                runEntry(entry)
                succeeded++
            } catch (e: CancellationException) {
                // The batch was cancelled (worker replaced / process going
                // away) — this is not an op failure. Put the entry back to
                // pending WITHOUT counting an attempt and let the next run
                // retry it, then propagate the cancellation.
                withContext(NonCancellable) {
                    syncQueueDao.update(entry.copy(status = "pending"))
                }
                throw e
            } catch (e: Exception) {
                when (classifySyncError(e)) {
                    // WP2 D2: 401. Refresh the token ONCE per run, then retry the
                    // SAME entry immediately WITHOUT spending an attempt.
                    SyncErrorKind.AUTH -> {
                        if (!didRefreshThisRun) {
                            didRefreshThisRun = true
                            val refreshed = tokenRefresher.refreshToken()
                            SyncMetrics.recordAuth401(retrySucceeded = refreshed)
                            if (refreshed) {
                                try {
                                    runEntry(entry)
                                    succeeded++
                                } catch (e2: CancellationException) {
                                    withContext(NonCancellable) {
                                        syncQueueDao.update(entry.copy(status = "pending"))
                                    }
                                    throw e2
                                } catch (e2: Exception) {
                                    // Refreshed retry still failed → transient;
                                    // keep the retry budget, don't dead-letter.
                                    recordTransientFailure(entry, e2)
                                    transientFail++
                                }
                            } else {
                                // Refresh itself failed → transient, NOT permanent.
                                recordTransientFailure(entry, e)
                                transientFail++
                            }
                        } else {
                            // Already refreshed this run → treat as transient.
                            recordTransientFailure(entry, e)
                            transientFail++
                        }
                    }
                    SyncErrorKind.PERMANENT -> {
                        recordPermanentFailure(entry, e)
                        permanentFail++
                    }
                    SyncErrorKind.TRANSIENT -> {
                        recordTransientFailure(entry, e)
                        transientFail++
                    }
                }
            }
        }

        // Clean up old completed entries (older than 7 days)
        val sevenDaysAgo = System.currentTimeMillis() - (7L * 24 * 60 * 60 * 1000)
        syncQueueDao.deleteCompleted(sevenDaysAgo)

        if (succeeded > 0) {
            pullReconciliationService.reconcileAfterPull()
        }
        SyncMetrics.recordQueueProcessed(succeeded, transientFail + permanentFail)
        SyncMetrics.recordOutboxDepth(syncQueueDao.getPending().size)

        // WP2 D6: one structured line per run so the next field report is
        // diagnosable remotely.
        logRunSummary(attempted, succeeded, transientFail, permanentFail, skippedDependency, bailedNoNetwork = false)

        return succeeded
    }

    /** In_progress → RPC → completed for a single entry. Throws on RPC failure. */
    private suspend fun runEntry(entry: SyncQueueEntry) {
        syncQueueDao.update(entry.copy(status = "in_progress"))
        processEntry(entry)
        syncQueueDao.update(entry.copy(status = "completed", serverEntityId = entry.entityId))
    }

    private fun logProcessingEntry(entry: SyncQueueEntry) {
        // #region agent log
        // PHI note: never log payload content here — payloads carry patient
        // DTOs and transcripts. rpc name + entity ids only.
        syncDebugLogger.log(
            hypothesisId = "H-A",
            location = "SyncEngine.kt:processQueue",
            message = "processing_entry",
            data = mapOf(
                "entryId" to entry.id,
                "operation" to entry.operationType,
                "entityType" to entry.entityType,
                "entityId" to entry.entityId,
                "dependsOn" to entry.dependsOn,
                "attempts" to entry.attempts.toString(),
            ),
        )
        // #endregion
    }

    /**
     * WP2 D2: transient failure (timeout, 5xx, 408/429, refresh-failed 401, or an
     * unclassified error). Spend one attempt, back off (capped at 10 min), and
     * dead-letter only once the raised [SyncQueueEntry.maxAttempts] budget (10)
     * is exhausted — cascading to dependents at that point.
     */
    private suspend fun recordTransientFailure(entry: SyncQueueEntry, e: Exception) {
        Log.e(TAG, "Transient sync failure for ${entry.id}: ${e.message}")
        logSyncFailure(entry, e)
        SyncMetrics.recordRpcError(entry.operationType, (e as? SyncHttpException)?.code, e.message)
        val nextAttempt = entry.attempts + 1
        val backoffMs = minOf(BACKOFF_BASE_MS * (1L shl minOf(nextAttempt, 5)), MAX_BACKOFF_MS)
        val nextStatus = if (nextAttempt >= entry.maxAttempts) "failed" else "pending"
        syncQueueDao.update(
            entry.copy(
                status = nextStatus,
                attempts = nextAttempt,
                lastError = e.message,
                nextRetryAt = System.currentTimeMillis() + backoffMs,
            ),
        )
        if (nextStatus == "failed") {
            markDependentsFailed(entry.id, "upstream ${entry.operationType} failed: ${e.message}")
        }
    }

    /**
     * WP2 D2: permanent failure (4xx that will never succeed on retry — 400/403/
     * 404/409/422). Dead-letter immediately (attempts = maxAttempts) so the item
     * surfaces under "Needs attention" instead of burning 10 retries, and cascade
     * to dependents.
     */
    private suspend fun recordPermanentFailure(entry: SyncQueueEntry, e: Exception) {
        Log.e(TAG, "Permanent sync failure for ${entry.id}: ${e.message}")
        logSyncFailure(entry, e)
        SyncMetrics.recordRpcError(entry.operationType, (e as? SyncHttpException)?.code, e.message)
        syncQueueDao.update(
            entry.copy(
                status = "failed",
                attempts = entry.maxAttempts,
                lastError = e.message,
                nextRetryAt = null,
            ),
        )
        markDependentsFailed(entry.id, "upstream ${entry.operationType} failed (permanent): ${e.message}")
    }

    private fun logSyncFailure(entry: SyncQueueEntry, e: Exception) {
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
    }

    /** WP2 D3: proactively refresh a token older than 45 min before a batch. */
    private suspend fun maybeProactiveRefresh() {
        val fetchedAt = authTokenStore.getTokenFetchedAt() ?: return
        val age = System.currentTimeMillis() - fetchedAt
        if (age >= PROACTIVE_REFRESH_AGE_MS) {
            val refreshed = tokenRefresher.refreshToken()
            Log.d(TAG, "Proactive token refresh (age ${age / 60000}m): success=$refreshed")
        }
    }

    /** WP2 D6: structured per-run telemetry line. */
    private fun logRunSummary(
        attempted: Int,
        succeeded: Int,
        transientFail: Int,
        permanentFail: Int,
        skippedDependency: Int,
        bailedNoNetwork: Boolean,
    ) {
        syncDebugLogger.log(
            hypothesisId = "H-RUN",
            location = "SyncEngine.kt:processQueue",
            message = "queue_run_summary",
            data = mapOf(
                "attempted" to attempted.toString(),
                "succeeded" to succeeded.toString(),
                "transientFail" to transientFail.toString(),
                "permanentFail" to permanentFail.toString(),
                "skippedDependency" to skippedDependency.toString(),
                "bailedNoNetwork" to bailedNoNetwork.toString(),
            ),
        )
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
            "submit_lab_order" -> syncSubmitLabOrder(entry)
            "rpc_start_lab" -> syncStartLab(entry)
            "rpc_start_lab_test" -> syncStartLabTest(entry)
            "rpc_record_lab_result" -> syncRecordLabResult(entry)
            "rpc_record_lab_test_result" -> syncRecordLabTestResult(entry)
            "rpc_set_dispensing_status" -> syncSetDispensingStatus(entry)
            "rpc_record_dispense" -> syncRecordDispense(entry)
            "rpc_start_pharmacy_dispense" -> syncStartPharmacyDispense(entry)
            "rpc_complete_pharmacy_dispense" -> syncCompletePharmacyDispense(entry)
            "rpc_send_pharmacy_back_to_clinician" -> syncSendPharmacyBack(entry)
            "rpc_send_pharmacy_line_back_to_clinician" -> syncSendPharmacyLineBack(entry)
            "rpc_create_care_task" -> syncCreateCareTask(entry)
            "rpc_complete_care_task" -> syncCompleteCareTask(entry)
            "rpc_create_referral" -> syncCreateReferral(entry)
            "rpc_admit_patient_v2" -> syncAdmitPatientV2(entry)
            "rpc_record_admission_observation" -> syncRecordAdmissionObservation(entry)
            "rpc_add_medication_order" -> syncAddMedicationOrder(entry)
            "rpc_stop_medication_order" -> syncStopMedicationOrder(entry)
            "rpc_record_medication_admin" -> syncRecordMedicationAdmin(entry)
            "rpc_start_iv_infusion" -> syncStartIvInfusion(entry)
            "rpc_record_iv_infusion_check" -> syncRecordIvInfusionCheck(entry)
            "rpc_stop_iv_infusion" -> syncStopIvInfusion(entry)
            "rpc_discharge_admission" -> syncDischargeAdmission(entry)
            "rpc_record_delivery" -> syncRecordDelivery(entry)
            "rpc_record_postnatal_obs" -> syncRecordPostnatalObs(entry)
            "rpc_record_admission_note" -> syncRecordAdmissionNote(entry)
            "rpc_start_pregnancy" -> syncStartPregnancy(entry)
            "rpc_record_anc_contact" -> syncRecordAncContact(entry)
            "rpc_record_hts_event" -> syncRecordHtsEvent(entry)
            "rpc_upsert_hiv_care" -> syncUpsertHivCare(entry)
            "rpc_record_viral_load" -> syncRecordViralLoad(entry)
            "rpc_upsert_tb_episode" -> syncUpsertTbEpisode(entry)
            "rpc_record_ebola_screening" -> syncRecordEbolaScreening(entry)
            "record_review_response" -> syncRecordReviewResponse(entry)
            else -> Log.w(TAG, "Unknown operation type: ${entry.operationType}")
        }
    }

    /**
     * Flip the local visit row to is_synced=true ONLY when no other active
     * outbox entry references it. While sibling ops (lab result, dispense,
     * finalize, ...) are still queued/failed, the row must stay dirty so
     * [VisitMerge.mergeRemote] keeps protecting the local clinical fields
     * those ops carry from being clobbered by a pull.
     */
    private suspend fun markVisitSyncedIfQuiet(entry: SyncQueueEntry) {
        if (syncQueueDao.countActiveForEntity(entry.entityId, excludeId = entry.id) == 0) {
            visitDao.updateSyncState(entry.entityId, true)
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
            throw SyncHttpException(response.code(), body.take(300) + hint, "rpc_create_patient")
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
            throw SyncHttpException(result.code(), body, "create_visit")
        }

        markVisitSyncedIfQuiet(entry)
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
            throw SyncHttpException(result.code(), body, "upsert_provider_note")
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
            throw SyncHttpException(result.code(), body, "sign_provider_note")
        }
        Log.d(TAG, "Provider note signed: ${entry.entityId}")
    }

    private suspend fun syncAmendProviderNote(entry: SyncQueueEntry) {
        val dto = json.decodeFromString(AmendProviderNoteRequest.serializer(), entry.payload)
        Log.d(TAG, "Syncing amend_provider_note: ${entry.entityId}")
        val result = supabaseApi.rpcAmendProviderNote(dto)
        if (!result.isSuccessful) {
            val body = result.errorBody()?.string().orEmpty()
            throw SyncHttpException(result.code(), body, "amend_provider_note")
        }
        Log.d(TAG, "Provider note amended: ${entry.entityId}")
    }

    private suspend fun syncVoidProviderNote(entry: SyncQueueEntry) {
        val dto = json.decodeFromString(VoidProviderNoteRequest.serializer(), entry.payload)
        Log.d(TAG, "Syncing void_provider_note: ${entry.entityId}")
        val result = supabaseApi.rpcVoidProviderNote(dto)
        if (!result.isSuccessful) {
            val body = result.errorBody()?.string().orEmpty()
            throw SyncHttpException(result.code(), body, "void_provider_note")
        }
        Log.d(TAG, "Provider note voided: ${entry.entityId}")
    }

    private suspend fun syncAddendProviderNote(entry: SyncQueueEntry) {
        val dto = json.decodeFromString(AddendProviderNoteRequest.serializer(), entry.payload)
        Log.d(TAG, "Syncing addend_provider_note: ${entry.entityId}")
        val result = supabaseApi.rpcAddendProviderNote(dto)
        if (!result.isSuccessful) {
            val body = result.errorBody()?.string().orEmpty()
            throw SyncHttpException(result.code(), body, "addend_provider_note")
        }
        Log.d(TAG, "Provider note addended: ${entry.entityId}")
    }

    private suspend fun syncCosignProviderNote(entry: SyncQueueEntry) {
        val dto = json.decodeFromString(CosignProviderNoteRequest.serializer(), entry.payload)
        Log.d(TAG, "Syncing cosign_provider_note: ${entry.entityId}")
        val result = supabaseApi.rpcCosignProviderNote(dto)
        if (!result.isSuccessful) {
            val body = result.errorBody()?.string().orEmpty()
            throw SyncHttpException(result.code(), body, "cosign_provider_note")
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
            throw SyncHttpException(result.code(), body, "finalize_clinical_encounter")
        }
        markVisitSyncedIfQuiet(entry)
        reconcileProviderNoteByVisit(dto.visitId, localNoteId = dto.noteId)
        Log.d(TAG, "Clinical encounter finalized: ${entry.entityId}")
    }

    private suspend fun syncUpsertPatientNoteSummary(entry: SyncQueueEntry) {
        val dto = json.decodeFromString(PatientNoteSummaryUpsertDto.serializer(), entry.payload)
        Log.d(TAG, "Syncing upsert_patient_note_summary: ${entry.entityId}")
        val result = supabaseApi.rpcUpsertPatientNoteSummary(dto)
        if (!result.isSuccessful) {
            val body = result.errorBody()?.string().orEmpty()
            throw SyncHttpException(result.code(), body, "upsert_patient_note_summary")
        }
        Log.d(TAG, "Patient note summary synced: ${entry.entityId}")
    }

    private suspend fun syncUpsertVisitClinicalSummary(entry: SyncQueueEntry) {
        val dto = json.decodeFromString(VisitClinicalSummaryUpsertDto.serializer(), entry.payload)
        Log.d(TAG, "Syncing upsert_visit_clinical_summary: ${entry.entityId}")
        val result = supabaseApi.rpcUpsertVisitClinicalSummary(dto)
        if (!result.isSuccessful) {
            val body = result.errorBody()?.string().orEmpty()
            throw SyncHttpException(result.code(), body, "upsert_visit_clinical_summary")
        }
        markVisitSyncedIfQuiet(entry)
        Log.d(TAG, "Visit clinical summary synced: ${entry.entityId}")
    }


    private suspend fun syncInsertPatientVitals(entry: SyncQueueEntry) {
        val dto = json.decodeFromString(PatientVitalsCreateDto.serializer(), entry.payload)
        Log.d(TAG, "Syncing insert_patient_vitals: ${entry.entityId}")
        val result = supabaseApi.rpcInsertPatientVitals(dto)
        if (!result.isSuccessful) {
            val body = result.errorBody()?.string().orEmpty()
            throw SyncHttpException(result.code(), body, "insert_patient_vitals")
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
            throw SyncHttpException(result.code(), body, "mark_documentation_complete")
        }
        markVisitSyncedIfQuiet(entry)
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
        // Legacy queue rows (pre-WP-B) omit p_visit_id; they still execute but
        // may create a server visit with a fresh id — WP-A reconciler recovers.

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
            throw SyncHttpException(response.code(), body, rpcName ?: "queue_op")
        }
        if (rpcName == "check_in_patient" && response != null && response.isSuccessful) {
            markVisitSyncedIfQuiet(entry)
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
            throw SyncHttpException(result.code(), body, "rpc_submit_pharmacy_order")
        }
        val idMap = prescriptionOrderRepository.replaceLocalAfterSubmit(entry.entityId)
        remapPendingCompleteDispense(entry.entityId, idMap)
        markVisitSyncedIfQuiet(entry)
    }

    private suspend fun syncSubmitLabOrder(entry: SyncQueueEntry) {
        val decoded = json.decodeFromString(SubmitLabOrderSyncPayload.serializer(), entry.payload)
        val visitId = decoded.visitId
        Log.d(TAG, "Syncing submit_lab_order: $visitId")
        supabaseApi.updateVisit(
            visitId,
            mapOf(
                "tests_ordered" to decoded.testsOrdered,
                "lab_status" to decoded.labStatus,
                "lab_test_results" to Json.parseToJsonElement(decoded.labTestResultsJson),
            ),
        )
        markVisitSyncedIfQuiet(entry)
    }

    private suspend fun remapPendingCompleteDispense(visitId: String, idMap: Map<String, String>) {
        if (idMap.isEmpty()) return
        val pending = syncQueueDao.getPending().filter { entry ->
            entry.entityId == visitId && entry.operationType == "rpc_complete_pharmacy_dispense"
        }
        for (entry in pending) {
            val decoded = json.decodeFromString(CompletePharmacyDispenseRequest.serializer(), entry.payload)
            val remapped = decoded.copy(
                lines = decoded.lines.map { line ->
                    line.copy(
                        prescriptionOrderId = idMap[line.prescriptionOrderId] ?: line.prescriptionOrderId,
                    )
                },
            )
            syncQueueDao.update(
                entry.copy(
                    payload = json.encodeToString(
                        CompletePharmacyDispenseRequest.serializer(),
                        remapped,
                    ),
                ),
            )
        }
    }

    private suspend fun syncStartLab(entry: SyncQueueEntry) {
        val decoded = json.decodeFromString(StartLabRequest.serializer(), entry.payload)
        val dto = decoded.copy(clientOpId = decoded.clientOpId ?: entry.id)
        Log.d(TAG, "Syncing rpc_start_lab: ${entry.entityId}")
        val result = supabaseApi.rpcStartLab(dto)
        if (!result.isSuccessful) {
            val body = result.errorBody()?.string().orEmpty()
            throw SyncHttpException(result.code(), body, "rpc_start_lab")
        }
        markVisitSyncedIfQuiet(entry)
    }

    private suspend fun syncRecordLabResult(entry: SyncQueueEntry) {
        val decoded = json.decodeFromString(RecordLabResultRequest.serializer(), entry.payload)
        val dto = decoded.copy(clientOpId = decoded.clientOpId ?: entry.id)
        Log.d(TAG, "Syncing rpc_record_lab_result: ${entry.entityId}")
        val result = supabaseApi.rpcRecordLabResult(dto)
        if (!result.isSuccessful) {
            val body = result.errorBody()?.string().orEmpty()
            throw SyncHttpException(result.code(), body, "rpc_record_lab_result")
        }
        markVisitSyncedIfQuiet(entry)
    }

    private suspend fun syncStartLabTest(entry: SyncQueueEntry) {
        val decoded = json.decodeFromString(StartLabTestRequest.serializer(), entry.payload)
        val dto = decoded.copy(clientOpId = decoded.clientOpId ?: entry.id)
        Log.d(TAG, "Syncing rpc_start_lab_test: ${entry.entityId}")
        val result = supabaseApi.rpcStartLabTest(dto)
        if (!result.isSuccessful) {
            val body = result.errorBody()?.string().orEmpty()
            throw SyncHttpException(result.code(), body, "rpc_start_lab_test")
        }
        markVisitSyncedIfQuiet(entry)
    }

    private suspend fun syncRecordLabTestResult(entry: SyncQueueEntry) {
        val decoded = json.decodeFromString(RecordLabTestResultRequest.serializer(), entry.payload)
        val dto = decoded.copy(clientOpId = decoded.clientOpId ?: entry.id)
        Log.d(TAG, "Syncing rpc_record_lab_test_result: ${entry.entityId}")
        val result = supabaseApi.rpcRecordLabTestResult(dto)
        if (!result.isSuccessful) {
            val body = result.errorBody()?.string().orEmpty()
            throw SyncHttpException(result.code(), body, "rpc_record_lab_test_result")
        }
        markVisitSyncedIfQuiet(entry)
    }

    private suspend fun syncSetDispensingStatus(entry: SyncQueueEntry) {
        val decoded = json.decodeFromString(SetDispensingStatusRequest.serializer(), entry.payload)
        val dto = decoded.copy(clientOpId = decoded.clientOpId ?: entry.id)
        Log.d(TAG, "Syncing rpc_set_dispensing_status: ${entry.entityId}")
        val result = supabaseApi.rpcSetDispensingStatus(dto)
        if (!result.isSuccessful) {
            val body = result.errorBody()?.string().orEmpty()
            throw SyncHttpException(result.code(), body, "rpc_set_dispensing_status")
        }
        markVisitSyncedIfQuiet(entry)
    }

    private suspend fun syncRecordDispense(entry: SyncQueueEntry) {
        val decoded = json.decodeFromString(RecordDispenseRequest.serializer(), entry.payload)
        val dto = decoded.copy(clientOpId = decoded.clientOpId ?: entry.id)
        Log.d(TAG, "Syncing rpc_record_dispense: ${entry.entityId}")
        val result = supabaseApi.rpcRecordDispense(dto)
        if (!result.isSuccessful) {
            val body = result.errorBody()?.string().orEmpty()
            throw SyncHttpException(result.code(), body, "rpc_record_dispense")
        }
        markVisitSyncedIfQuiet(entry)
    }

    private suspend fun syncStartPharmacyDispense(entry: SyncQueueEntry) {
        val decoded = json.decodeFromString(StartPharmacyDispenseRequest.serializer(), entry.payload)
        val dto = decoded.copy(clientOpId = decoded.clientOpId ?: entry.id)
        Log.d(TAG, "Syncing rpc_start_pharmacy_dispense: ${entry.entityId}")
        val result = supabaseApi.rpcStartPharmacyDispense(dto)
        if (!result.isSuccessful) {
            val body = result.errorBody()?.string().orEmpty()
            throw SyncHttpException(result.code(), body, "rpc_start_pharmacy_dispense")
        }
        markVisitSyncedIfQuiet(entry)
    }

    private suspend fun syncCompletePharmacyDispense(entry: SyncQueueEntry) {
        val decoded = json.decodeFromString(CompletePharmacyDispenseRequest.serializer(), entry.payload)
        val dto = decoded.copy(clientOpId = decoded.clientOpId ?: entry.id)
        Log.d(TAG, "Syncing rpc_complete_pharmacy_dispense: ${entry.entityId}")
        val result = supabaseApi.rpcCompletePharmacyDispense(dto)
        if (!result.isSuccessful) {
            val body = result.errorBody()?.string().orEmpty()
            throw SyncHttpException(result.code(), body, "rpc_complete_pharmacy_dispense")
        }
        prescriptionOrderRepository.refreshForVisit(entry.entityId)
        markVisitSyncedIfQuiet(entry)
    }

    private suspend fun syncSendPharmacyBack(entry: SyncQueueEntry) {
        val decoded = json.decodeFromString(SendPharmacyBackRequest.serializer(), entry.payload)
        val dto = decoded.copy(clientOpId = decoded.clientOpId ?: entry.id)
        Log.d(TAG, "Syncing rpc_send_pharmacy_back_to_clinician: ${entry.entityId}")
        val result = supabaseApi.rpcSendPharmacyBackToClinician(dto)
        if (!result.isSuccessful) {
            val body = result.errorBody()?.string().orEmpty()
            throw SyncHttpException(result.code(), body, "rpc_send_pharmacy_back_to_clinician")
        }
        prescriptionOrderRepository.refreshForVisit(entry.entityId)
        markVisitSyncedIfQuiet(entry)
    }

    private suspend fun syncSendPharmacyLineBack(entry: SyncQueueEntry) {
        val decoded = json.decodeFromString(SendPharmacyLineBackRequest.serializer(), entry.payload)
        val dto = decoded.copy(clientOpId = decoded.clientOpId ?: entry.id)
        Log.d(TAG, "Syncing rpc_send_pharmacy_line_back_to_clinician: ${entry.entityId}")
        val result = supabaseApi.rpcSendPharmacyLineBackToClinician(dto)
        if (!result.isSuccessful) {
            val body = result.errorBody()?.string().orEmpty()
            throw SyncHttpException(result.code(), body, "rpc_send_pharmacy_line_back_to_clinician")
        }
        prescriptionOrderRepository.refreshForVisit(entry.entityId)
        markVisitSyncedIfQuiet(entry)
    }

    private suspend fun syncCreateCareTask(entry: SyncQueueEntry) {
        val decoded = json.decodeFromString(CreateCareTaskRequest.serializer(), entry.payload)
        val dto = decoded.copy(clientOpId = decoded.clientOpId ?: entry.id)
        Log.d(TAG, "Syncing rpc_create_care_task: ${entry.entityId}")
        val result = supabaseApi.rpcCreateCareTask(dto)
        if (!result.isSuccessful) {
            val body = result.errorBody()?.string().orEmpty()
            throw SyncHttpException(result.code(), body, "rpc_create_care_task")
        }
    }

    private suspend fun syncCompleteCareTask(entry: SyncQueueEntry) {
        val decoded = json.decodeFromString(CompleteCareTaskRequest.serializer(), entry.payload)
        val dto = decoded.copy(clientOpId = decoded.clientOpId ?: entry.id)
        Log.d(TAG, "Syncing rpc_complete_care_task: ${entry.entityId}")
        val result = supabaseApi.rpcCompleteCareTask(dto)
        if (!result.isSuccessful) {
            val body = result.errorBody()?.string().orEmpty()
            throw SyncHttpException(result.code(), body, "rpc_complete_care_task")
        }
    }

    private suspend fun syncCreateReferral(entry: SyncQueueEntry) {
        val decoded = json.decodeFromString(CreateReferralRequest.serializer(), entry.payload)
        val dto = decoded.copy(clientOpId = decoded.clientOpId ?: entry.id)
        Log.d(TAG, "Syncing rpc_create_referral: ${entry.entityId}")
        val result = supabaseApi.rpcCreateReferral(dto)
        if (!result.isSuccessful) {
            val body = result.errorBody()?.string().orEmpty()
            throw SyncHttpException(result.code(), body, "rpc_create_referral")
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
            throw SyncHttpException(result.code(), body, "rpc_admit_patient_v2")
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
            throw SyncHttpException(result.code(), body, "rpc_record_admission_observation")
        }
        admissionObservationDao.markSynced(entry.entityId)
    }

    private suspend fun syncAddMedicationOrder(entry: SyncQueueEntry) {
        val decoded = json.decodeFromString(AddMedicationOrderRequest.serializer(), entry.payload)
        val dto = decoded.copy(clientOpId = decoded.clientOpId ?: entry.entityId)
        val result = supabaseApi.rpcAddMedicationOrder(dto)
        if (!result.isSuccessful) {
            val body = result.errorBody()?.string().orEmpty()
            throw SyncHttpException(result.code(), body, "rpc_add_medication_order")
        }
        medicationOrderDao.markSynced(entry.entityId)
    }

    private suspend fun syncStopMedicationOrder(entry: SyncQueueEntry) {
        val decoded = json.decodeFromString(StopMedicationOrderRequest.serializer(), entry.payload)
        val dto = decoded.copy(clientOpId = decoded.clientOpId ?: entry.entityId)
        val result = supabaseApi.rpcStopMedicationOrder(dto)
        if (!result.isSuccessful) {
            val body = result.errorBody()?.string().orEmpty()
            throw SyncHttpException(result.code(), body, "rpc_stop_medication_order")
        }
        medicationOrderDao.markSynced(entry.entityId)
    }

    private suspend fun syncRecordMedicationAdmin(entry: SyncQueueEntry) {
        val decoded = json.decodeFromString(RecordMedicationAdminRequest.serializer(), entry.payload)
        val dto = decoded.copy(clientOpId = decoded.clientOpId ?: entry.entityId)
        val result = supabaseApi.rpcRecordMedicationAdmin(dto)
        if (!result.isSuccessful) {
            val body = result.errorBody()?.string().orEmpty()
            throw SyncHttpException(result.code(), body, "rpc_record_medication_admin")
        }
        medicationAdministrationDao.markSynced(entry.entityId)
    }

    private suspend fun syncStartIvInfusion(entry: SyncQueueEntry) {
        val decoded = json.decodeFromString(StartIvInfusionRequest.serializer(), entry.payload)
        val dto = decoded.copy(clientOpId = decoded.clientOpId ?: entry.entityId)
        val result = supabaseApi.rpcStartIvInfusion(dto)
        if (!result.isSuccessful) {
            val body = result.errorBody()?.string().orEmpty()
            throw SyncHttpException(result.code(), body, "rpc_start_iv_infusion")
        }
        ivInfusionDao.markSynced(entry.entityId)
    }

    private suspend fun syncRecordIvInfusionCheck(entry: SyncQueueEntry) {
        val decoded = json.decodeFromString(RecordIvInfusionCheckRequest.serializer(), entry.payload)
        val dto = decoded.copy(clientOpId = decoded.clientOpId ?: entry.entityId)
        val result = supabaseApi.rpcRecordIvInfusionCheck(dto)
        if (!result.isSuccessful) {
            val body = result.errorBody()?.string().orEmpty()
            throw SyncHttpException(result.code(), body, "rpc_record_iv_infusion_check")
        }
        ivInfusionCheckDao.markSynced(entry.entityId)
    }

    private suspend fun syncStopIvInfusion(entry: SyncQueueEntry) {
        val decoded = json.decodeFromString(StopIvInfusionRequest.serializer(), entry.payload)
        val dto = decoded.copy(clientOpId = decoded.clientOpId ?: entry.entityId)
        val result = supabaseApi.rpcStopIvInfusion(dto)
        if (!result.isSuccessful) {
            val body = result.errorBody()?.string().orEmpty()
            throw SyncHttpException(result.code(), body, "rpc_stop_iv_infusion")
        }
        ivInfusionDao.markSynced(entry.entityId)
    }

    private suspend fun syncDischargeAdmission(entry: SyncQueueEntry) {
        val decoded = json.decodeFromString(DischargeAdmissionRequest.serializer(), entry.payload)
        val dto = decoded.copy(clientOpId = decoded.clientOpId ?: entry.entityId)
        val result = supabaseApi.rpcDischargeAdmission(dto)
        if (!result.isSuccessful) {
            val body = result.errorBody()?.string().orEmpty()
            throw SyncHttpException(result.code(), body, "rpc_discharge_admission")
        }
        admissionDao.markSynced(entry.entityId)
    }

    private suspend fun syncRecordDelivery(entry: SyncQueueEntry) {
        val decoded = json.decodeFromString(RecordDeliveryRequest.serializer(), entry.payload)
        val dto = decoded.copy(clientOpId = decoded.clientOpId ?: entry.entityId)
        val result = supabaseApi.rpcRecordDelivery(dto)
        if (!result.isSuccessful) {
            val body = result.errorBody()?.string().orEmpty()
            throw SyncHttpException(result.code(), body, "rpc_record_delivery")
        }
        deliveryDao.markSynced(entry.entityId)
    }

    private suspend fun syncRecordPostnatalObs(entry: SyncQueueEntry) {
        val decoded = json.decodeFromString(RecordPostnatalObsRequest.serializer(), entry.payload)
        val dto = decoded.copy(clientOpId = decoded.clientOpId ?: entry.entityId)
        val result = supabaseApi.rpcRecordPostnatalObs(dto)
        if (!result.isSuccessful) {
            val body = result.errorBody()?.string().orEmpty()
            throw SyncHttpException(result.code(), body, "rpc_record_postnatal_obs")
        }
        postnatalObservationDao.markSynced(entry.entityId)
    }

    private suspend fun syncRecordAdmissionNote(entry: SyncQueueEntry) {
        val decoded = json.decodeFromString(RecordAdmissionNoteRequest.serializer(), entry.payload)
        val dto = decoded.copy(clientOpId = decoded.clientOpId ?: entry.entityId)
        val result = supabaseApi.rpcRecordAdmissionNote(dto)
        if (!result.isSuccessful) {
            val body = result.errorBody()?.string().orEmpty()
            throw SyncHttpException(result.code(), body, "rpc_record_admission_note")
        }
        admissionNoteDao.markSynced(entry.entityId)
    }

    private suspend fun syncStartPregnancy(entry: SyncQueueEntry) {
        val decoded = json.decodeFromString(StartPregnancyRequest.serializer(), entry.payload)
        val dto = decoded.copy(clientOpId = decoded.clientOpId ?: entry.entityId)
        val result = supabaseApi.rpcStartPregnancy(dto)
        if (!result.isSuccessful) {
            val body = result.errorBody()?.string().orEmpty()
            throw SyncHttpException(result.code(), body, "rpc_start_pregnancy")
        }
        pregnancyDao.markSynced(entry.entityId)
    }

    private suspend fun syncRecordAncContact(entry: SyncQueueEntry) {
        val decoded = json.decodeFromString(RecordAncContactRequest.serializer(), entry.payload)
        val dto = decoded.copy(clientOpId = decoded.clientOpId ?: entry.entityId)
        val result = supabaseApi.rpcRecordAncContact(dto)
        if (!result.isSuccessful) {
            val body = result.errorBody()?.string().orEmpty()
            throw SyncHttpException(result.code(), body, "rpc_record_anc_contact")
        }
        ancContactDao.markSynced(entry.entityId)
    }

    private suspend fun syncRecordHtsEvent(entry: SyncQueueEntry) {
        val decoded = json.decodeFromString(RecordHtsEventRequest.serializer(), entry.payload)
        val dto = decoded.copy(clientOpId = decoded.clientOpId ?: entry.entityId)
        val result = supabaseApi.rpcRecordHtsEvent(dto)
        if (!result.isSuccessful) {
            val body = result.errorBody()?.string().orEmpty()
            throw SyncHttpException(result.code(), body, "rpc_record_hts_event")
        }
        htsEventDao.markSynced(entry.entityId)
    }

    private suspend fun syncUpsertHivCare(entry: SyncQueueEntry) {
        val decoded = json.decodeFromString(UpsertHivCareRequest.serializer(), entry.payload)
        val dto = decoded.copy(clientOpId = decoded.clientOpId ?: entry.entityId)
        val result = supabaseApi.rpcUpsertHivCare(dto)
        if (!result.isSuccessful) {
            val body = result.errorBody()?.string().orEmpty()
            throw SyncHttpException(result.code(), body, "rpc_upsert_hiv_care")
        }
        hivCareDao.markSynced(entry.entityId)
    }

    private suspend fun syncRecordViralLoad(entry: SyncQueueEntry) {
        val decoded = json.decodeFromString(RecordViralLoadRequest.serializer(), entry.payload)
        val dto = decoded.copy(clientOpId = decoded.clientOpId ?: entry.entityId)
        val result = supabaseApi.rpcRecordViralLoad(dto)
        if (!result.isSuccessful) {
            val body = result.errorBody()?.string().orEmpty()
            throw SyncHttpException(result.code(), body, "rpc_record_viral_load")
        }
        viralLoadDao.markSynced(entry.entityId)
    }

    private suspend fun syncUpsertTbEpisode(entry: SyncQueueEntry) {
        val decoded = json.decodeFromString(UpsertTbEpisodeRequest.serializer(), entry.payload)
        val dto = decoded.copy(clientOpId = decoded.clientOpId ?: entry.entityId)
        val result = supabaseApi.rpcUpsertTbEpisode(dto)
        if (!result.isSuccessful) {
            val body = result.errorBody()?.string().orEmpty()
            throw SyncHttpException(result.code(), body, "rpc_upsert_tb_episode")
        }
        tbEpisodeDao.markSynced(entry.entityId)
    }

    private suspend fun syncRecordEbolaScreening(entry: SyncQueueEntry) {
        val decoded = json.decodeFromString(RecordEbolaScreeningRequest.serializer(), entry.payload)
        val dto = decoded.copy(clientOpId = decoded.clientOpId ?: entry.entityId)
        val result = supabaseApi.rpcRecordEbolaScreening(dto)
        if (!result.isSuccessful) {
            val body = result.errorBody()?.string().orEmpty()
            throw SyncHttpException(result.code(), body, "rpc_record_ebola_screening")
        }
        ebolaScreeningDao.markSynced(entry.entityId)
    }

    private suspend fun syncRecordReviewResponse(entry: SyncQueueEntry) {
        val dto = json.decodeFromString(RecordReviewResponseRequest.serializer(), entry.payload)
        Log.d(TAG, "Syncing record_review_response: ${entry.entityId}")
        val result = supabaseApi.rpcRecordReviewResponse(dto)
        if (!result.isSuccessful) {
            val body = result.errorBody()?.string().orEmpty()
            throw SyncHttpException(result.code(), body, "record_review_response")
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
