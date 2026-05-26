package com.karibuhealth.app.data.sync

import android.util.Log
import com.karibuhealth.app.data.local.db.dao.PatientDao
import com.karibuhealth.app.data.local.db.dao.PatientVitalsDao
import com.karibuhealth.app.data.local.db.dao.SyncQueueDao
import com.karibuhealth.app.data.local.db.dao.VisitDao
import javax.inject.Inject
import javax.inject.Singleton

/**
 * After a successful pull (or push batch), clear outbox rows whose entities
 * already exist on the server (`is_synced = true` locally).
 */
@Singleton
class OutboxReconciler @Inject constructor(
    private val syncQueueDao: SyncQueueDao,
    private val patientDao: PatientDao,
    private val visitDao: VisitDao,
    private val patientVitalsDao: PatientVitalsDao,
) {
    companion object {
        private const val TAG = "OutboxReconciler"
    }

    suspend fun reconcilePendingWithLocalState() {
        val pending = syncQueueDao.getPending()
        var cleared = 0
        for (entry in pending) {
            val alreadyOnServer = when (entry.entityType) {
                "patients" -> patientDao.getByIdOnce(entry.entityId)?.isSynced == true
                "visits" -> visitDao.getByIdOnce(entry.entityId)?.isSynced == true
                "patient_vitals" -> patientVitalsDao.getByIdOnce(entry.entityId)?.isSynced == true
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
}
