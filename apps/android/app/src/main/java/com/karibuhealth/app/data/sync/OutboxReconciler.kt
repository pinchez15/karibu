package com.karibuhealth.app.data.sync

import android.util.Log
import com.karibuhealth.app.data.local.db.dao.PatientDao
import com.karibuhealth.app.data.local.db.dao.PatientVitalsDao
import com.karibuhealth.app.data.local.db.dao.SyncQueueDao
import com.karibuhealth.app.data.local.db.dao.VisitDao
import com.karibuhealth.app.data.local.db.entity.SyncQueueEntry
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive
import javax.inject.Inject
import javax.inject.Singleton

/**
 * After a successful pull (or push batch), clear outbox rows for pure CREATE
 * operations whose entities already exist on the server (`is_synced = true`
 * locally).
 *
 * Operation-aware on purpose: `is_synced` on the local entity only proves the
 * entity ROW reached the server — it says nothing about whether a queued
 * MUTATION (lab result, dispense, pharmacy order, finalize, doc-complete,
 * note sign/amend/...) was ever sent. Visit-mutation and provider-note ops
 * must therefore NEVER be force-completed off local-state proxies; doing so
 * silently dropped offline clinical writes (e.g. a lab result recorded
 * offline against a visit that synced in the morning).
 */
@Singleton
class OutboxReconciler @Inject constructor(
    private val syncQueueDao: SyncQueueDao,
    private val patientDao: PatientDao,
    private val visitDao: VisitDao,
    private val patientVitalsDao: PatientVitalsDao,
    private val json: Json,
) {
    companion object {
        private const val TAG = "OutboxReconciler"
    }

    suspend fun reconcilePendingWithLocalState() {
        val pending = syncQueueDao.getPending()
        var cleared = 0
        for (entry in pending) {
            val alreadyOnServer = when (entry.operationType) {
                // Pure creates: local is_synced=true means this exact row is
                // on the server, so the queued create is redundant.
                "create_patient" ->
                    patientDao.getByIdOnce(entry.entityId)?.isSynced == true
                "create_visit" ->
                    visitDao.getByIdOnce(entry.entityId)?.isSynced == true
                "insert_patient_vitals" ->
                    patientVitalsDao.getByIdOnce(entry.entityId)?.isSynced == true
                // queue_op wraps several RPCs; only check_in_patient is a
                // pure create (it creates the visit row server-side).
                "queue_op" ->
                    queueRpcName(entry) == "check_in_patient" &&
                        visitDao.getByIdOnce(entry.entityId)?.isSynced == true
                // Everything else (visit mutations, provider-note lifecycle,
                // payments, admissions, ...) must actually be pushed.
                else -> false
            }
            if (alreadyOnServer) {
                syncQueueDao.forceComplete(entry.id)
                cleared++
            }
        }
        if (cleared > 0) {
            Log.d(TAG, "Reconciled $cleared outbox entries already synced on server")
            SyncMetrics.recordOutboxReconciled(cleared)
        }
    }

    private fun queueRpcName(entry: SyncQueueEntry): String? = try {
        json.decodeFromString(JsonObject.serializer(), entry.payload)["rpc"]
            ?.jsonPrimitive?.content
    } catch (_: Exception) {
        null
    }
}
