package com.karibuhealth.app.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.karibuhealth.app.data.local.datastore.AuthTokenStore
import com.karibuhealth.app.data.local.db.dao.PatientDao
import com.karibuhealth.app.data.local.db.dao.SyncQueueDao
import com.karibuhealth.app.data.local.db.dao.VisitDao
import com.karibuhealth.app.data.local.db.entity.SyncQueueEntry
import com.karibuhealth.app.data.repository.StaffRepository
import com.karibuhealth.app.data.sync.SyncDebugLogger
import com.karibuhealth.app.data.sync.SyncEngine
import com.karibuhealth.app.domain.model.Staff
import com.karibuhealth.app.util.NetworkMonitor
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class MainViewModel @Inject constructor(
    private val authTokenStore: AuthTokenStore,
    private val networkMonitor: NetworkMonitor,
    private val syncQueueDao: SyncQueueDao,
    private val patientDao: PatientDao,
    private val visitDao: VisitDao,
    private val syncEngine: SyncEngine,
    private val syncDebugLogger: SyncDebugLogger,
    private val staffRepository: StaffRepository,
) : ViewModel() {

    val isAuthenticated: StateFlow<Boolean> = authTokenStore.observeToken()
        .map { it != null }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), false)

    @OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
    val currentStaff: StateFlow<Staff?> = authTokenStore.observeClerkUserId()
        .flatMapLatest { clerkId ->
            if (clerkId.isNullOrBlank()) flowOf(null)
            else staffRepository.getStaffByClerkId(clerkId)
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)

    val needsOnboarding: StateFlow<Boolean> = currentStaff
        .map { it?.needsOnboarding == true }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), false)

    init {
        viewModelScope.launch {
            authTokenStore.observeClerkUserId().collect { clerkId ->
                if (!clerkId.isNullOrBlank()) {
                    staffRepository.fetchAndCacheStaff(clerkId)
                }
            }
        }
    }

    val isOnline: StateFlow<Boolean> = networkMonitor.isOnlineFlow
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), true)

    val pendingSyncCount: StateFlow<Int> = syncQueueDao.getPendingCount()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), 0)

    @OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
    val deviceSavedCount: StateFlow<Int> = pendingSyncCount
        .flatMapLatest { pending ->
            flow {
                val clinicId = authTokenStore.getClinicId()
                if (clinicId == null) {
                    emit(0)
                } else {
                    val unsynced = patientDao.getUnsyncedCount(clinicId) +
                        visitDao.getUnsyncedCount(clinicId)
                    emit((unsynced - pending).coerceAtLeast(0))
                }
            }
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), 0)

    val pendingEntries: StateFlow<List<SyncQueueEntry>> = syncQueueDao.observePending()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    /**
     * Entries that exhausted all retries (status='failed', attempts >= max).
     * These drop out of [pendingSyncCount]/[pendingEntries], so without this
     * the clinician would see "all synced" while clinical writes are stuck.
     */
    val failedSyncCount: StateFlow<Int> = syncQueueDao.getTerminallyFailedCount()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), 0)

    val failedEntries: StateFlow<List<SyncQueueEntry>> = syncQueueDao.observeTerminallyFailed()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    /**
     * User-initiated retry. Resets any failed-with-max-attempts entries so a
     * server-side fix has a chance to land, then runs the queue.
     */
    fun retryAll() {
        viewModelScope.launch {
            syncQueueDao.resetFailed()
            syncEngine.processQueue()
        }
    }

    /**
     * Manual escape hatch: mark a single entry as completed without
     * re-running the RPC. Use when the user has confirmed the data is in
     * the web app and just wants the local count to clear.
     */
    fun markEntrySynced(id: String) {
        viewModelScope.launch {
            syncQueueDao.forceComplete(id)
        }
    }

    fun clearDebugLog() {
        syncDebugLogger.clear()
    }

    fun readDebugLog(): String = syncDebugLogger.readAll()
}
