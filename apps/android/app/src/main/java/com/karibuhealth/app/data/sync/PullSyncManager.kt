package com.karibuhealth.app.data.sync

import android.util.Log
import androidx.work.ExistingWorkPolicy
import androidx.work.WorkManager
import com.karibuhealth.app.data.local.datastore.AuthTokenStore
import com.karibuhealth.app.data.repository.NoteRepository
import com.karibuhealth.app.data.repository.PatientRepository
import com.karibuhealth.app.data.repository.StaffRepository
import com.karibuhealth.app.data.repository.VisitRepository
import com.karibuhealth.app.util.NetworkMonitor
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.filter
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class PullSyncManager @Inject constructor(
    private val staffRepository: StaffRepository,
    private val patientRepository: PatientRepository,
    private val visitRepository: VisitRepository,
    private val authTokenStore: AuthTokenStore,
    private val networkMonitor: NetworkMonitor,
    private val outboxReconciler: OutboxReconciler,
) {
    companion object {
        private const val TAG = "PullSyncManager"
        private const val RECONNECT_DEBOUNCE_MS = 2000L
    }

    private var observeJob: Job? = null

    fun startObserving(scope: CoroutineScope, workManager: WorkManager) {
        observeJob?.cancel()
        observeJob = scope.launch {
            // Watch for network reconnection
            var wasOffline = false
            networkMonitor.isOnlineFlow
                .distinctUntilChanged()
                .collect { isOnline ->
                    if (isOnline && wasOffline) {
                        Log.d(TAG, "Network reconnected, triggering sync after debounce")
                        delay(RECONNECT_DEBOUNCE_MS)

                        // Trigger immediate push sync
                        workManager.enqueueUniqueWork(
                            SyncWorker.WORK_NAME_IMMEDIATE,
                            ExistingWorkPolicy.REPLACE,
                            SyncWorker.buildImmediateRequest(),
                        )

                        // Pull fresh data
                        pullAll()
                    }
                    wasOffline = !isOnline
                }
        }
    }

    fun stopObserving() {
        observeJob?.cancel()
        observeJob = null
    }

    suspend fun pullAll() {
        val clinicId = authTokenStore.getClinicId() ?: return
        val clerkUserId = authTokenStore.getClerkUserId() ?: return

        Log.d(TAG, "Starting pull sync for clinic $clinicId")

        // Run all pulls concurrently
        coroutineScope {
            launch {
                try {
                    staffRepository.fetchAndCacheStaff(clerkUserId)
                } catch (e: Exception) {
                    Log.e(TAG, "Pull staff failed: ${e.message}")
                }
            }

            launch {
                try {
                    patientRepository.refreshPatients(clinicId)
                } catch (e: Exception) {
                    Log.e(TAG, "Pull patients failed: ${e.message}")
                }
            }

            launch {
                try {
                    visitRepository.refreshTodayVisits(clinicId)
                } catch (e: Exception) {
                    Log.e(TAG, "Pull visits failed: ${e.message}")
                }
            }
        }

        outboxReconciler.reconcilePendingWithLocalState()

        Log.d(TAG, "Pull sync complete")
    }
}
