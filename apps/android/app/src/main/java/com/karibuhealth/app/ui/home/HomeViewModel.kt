package com.karibuhealth.app.ui.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.karibuhealth.app.data.local.datastore.AuthTokenStore
import com.karibuhealth.app.data.local.datastore.RecentPatientEntry
import com.karibuhealth.app.data.local.datastore.RecentPatientsStore
import com.karibuhealth.app.data.local.db.dao.SyncQueueDao
import com.karibuhealth.app.data.local.db.entity.SyncQueueEntry
import com.karibuhealth.app.data.repository.PatientRepository
import com.karibuhealth.app.data.repository.StaffRepository
import com.karibuhealth.app.data.repository.VisitRepository
import com.karibuhealth.app.data.sync.SyncEngine
import com.karibuhealth.app.domain.model.Clinic
import com.karibuhealth.app.domain.model.OpdPatientFilter
import com.karibuhealth.app.domain.model.OpdPatientRow
import com.karibuhealth.app.domain.model.Patient
import com.karibuhealth.app.domain.model.Staff
import com.karibuhealth.app.ui.auth.ClerkAuthManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class HomeUiState(
    val staff: Staff? = null,
    val clinic: Clinic? = null,
    /** When false, legacy physical queue entry points are hidden (migration 048). */
    val showPhysicalQueueFilter: Boolean = true,
    val opdPatients: List<OpdPatientRow> = emptyList(),
    val selectedFilter: OpdPatientFilter? = null,
    val pendingSyncCount: Int = 0,
    /**
     * WP2 D4: terminally-failed (dead-lettered) outbox entries. These drop out
     * of [pendingSyncCount], so surfacing them here keeps the clinician from
     * seeing "all synced" while clinical writes are actually stuck.
     */
    val needsAttentionCount: Int = 0,
    val searchQuery: String = "",
    /** WP2 D9: filter the OPD pane by name or today's number. */
    val queueSearchQuery: String = "",
    val searchResults: List<Patient> = emptyList(),
    val isSearching: Boolean = false,
    val isLoading: Boolean = true,
    val recentPatients: List<RecentPatientEntry> = emptyList(),
) {
    val filteredPatients: List<OpdPatientRow>
        get() = selectedFilter?.let { filter ->
            opdPatients.filter { filter.matches(it) }
        } ?: opdPatients

    /** Today's in-flight patients, urgent-first then arrival order — excludes done. */
    val activePatients: List<OpdPatientRow>
        get() = opdPatients
            .filter { it.bucket != OpdPatientFilter.DoneToday }
            .sortedWith(
                compareBy<OpdPatientRow> { prioritySortKey(it.priority) }
                    .thenBy { it.queuePosition ?: Int.MAX_VALUE }
                    .thenBy { it.checkedInAt ?: "\uFFFF" },
            )

    /** Active list after optional bucket filter + queue search (WP2). */
    val queueFilteredActivePatients: List<OpdPatientRow>
        get() {
            val base = selectedFilter?.let { filter ->
                activePatients.filter { filter.matches(it) }
            } ?: activePatients
            val q = queueSearchQuery.trim().lowercase().removePrefix("#")
            if (q.isEmpty()) return base
            return base.filter { row ->
                row.patientName.lowercase().contains(q) ||
                    row.queuePosition?.toString()?.contains(q) == true
            }
        }

    val waitingCount: Int
        get() = opdPatients.count { it.bucket == OpdPatientFilter.Waiting }

    val doneTodayCount: Int
        get() = opdPatients.count { it.bucket == OpdPatientFilter.DoneToday }

    fun filterCount(filter: OpdPatientFilter): Int =
        opdPatients.count { filter.matches(it) }
}

private fun bucketSortKey(bucket: OpdPatientFilter): Int = when (bucket) {
    OpdPatientFilter.Waiting -> 0
    OpdPatientFilter.NeedsVitals -> 1
    OpdPatientFilter.WithClinician -> 2
    OpdPatientFilter.AwaitingLabs -> 3
    OpdPatientFilter.AtPharmacy -> 4
    OpdPatientFilter.DoneToday -> 5
}

private fun prioritySortKey(priority: String): Int = when (priority) {
    "urgent" -> 0
    "high" -> 1
    "normal" -> 2
    "low" -> 3
    else -> 4
}

@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel
class HomeViewModel @Inject constructor(
    private val staffRepository: StaffRepository,
    private val visitRepository: VisitRepository,
    private val patientRepository: PatientRepository,
    private val authTokenStore: AuthTokenStore,
    private val clerkAuthManager: ClerkAuthManager,
    private val syncQueueDao: SyncQueueDao,
    private val syncEngine: SyncEngine,
    private val recentPatientsStore: RecentPatientsStore,
) : ViewModel() {

    private val _uiState = MutableStateFlow(HomeUiState())
    val uiState: StateFlow<HomeUiState> = _uiState.asStateFlow()

    /** WP2 D4: live outbox contents for the tappable sync-details sheet. */
    val pendingEntries: StateFlow<List<SyncQueueEntry>> = syncQueueDao.observePending()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val failedEntries: StateFlow<List<SyncQueueEntry>> = syncQueueDao.observeTerminallyFailed()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    init {
        viewModelScope.launch {
            val clerkUserId = authTokenStore.getClerkUserId() ?: return@launch
            val staff = staffRepository.fetchAndCacheStaff(clerkUserId) ?: return@launch
            _uiState.update { it.copy(staff = staff, isLoading = false) }

            launch {
                staffRepository.getClinic(staff.clinicId).collect { clinic ->
                    _uiState.update {
                        it.copy(
                            clinic = clinic,
                            showPhysicalQueueFilter = clinic?.workflowConfig?.showPhysicalQueueFilter != false,
                        )
                    }
                }
            }
            launch {
                visitRepository.refreshOpdPatientsToday(staff.clinicId)
            }
            launch {
                visitRepository.getOpdPatientsToday(staff.clinicId).collect { list ->
                    _uiState.update { it.copy(opdPatients = list) }
                }
            }
            launch {
                syncQueueDao.getPendingCount().collect { count ->
                    _uiState.update { it.copy(pendingSyncCount = count) }
                }
            }
            launch {
                syncQueueDao.getTerminallyFailedCount().collect { count ->
                    _uiState.update { it.copy(needsAttentionCount = count) }
                }
            }
            launch {
                recentPatientsStore.recentPatients.collect { recent ->
                    _uiState.update { it.copy(recentPatients = recent) }
                }
            }
        }
    }

    fun recordPatientTouch(patientId: String, patientName: String, visitId: String? = null) {
        viewModelScope.launch {
            recentPatientsStore.recordTouch(patientId, patientName, visitId)
        }
    }

    fun selectFilter(filter: OpdPatientFilter?) {
        _uiState.update {
            it.copy(selectedFilter = if (it.selectedFilter == filter) null else filter)
        }
    }

    fun updateQueueSearch(query: String) {
        _uiState.update { it.copy(queueSearchQuery = query) }
    }

    fun updateSearch(query: String) {
        _uiState.update { it.copy(searchQuery = query) }

        if (query.length < 2) {
            _uiState.update { it.copy(searchResults = emptyList(), isSearching = false) }
            return
        }

        viewModelScope.launch {
            val clinicId = authTokenStore.getClinicId() ?: return@launch
            _uiState.update { it.copy(isSearching = true) }
            val results = patientRepository.searchPatients(clinicId, query).first()
            _uiState.update { it.copy(searchResults = results, isSearching = false) }
        }
    }

    fun refresh() {
        viewModelScope.launch { refreshAndAwait() }
    }

    suspend fun refreshAndAwait() {
        val clinicId = authTokenStore.getClinicId() ?: return
        visitRepository.refreshTodayVisits(clinicId)
        visitRepository.refreshOpdPatientsToday(clinicId)
    }

    fun startVisit(visitId: String) {
        viewModelScope.launch {
            val staffId = authTokenStore.getStaffId() ?: return@launch
            visitRepository.startVisitSelfTriage(visitId, staffId)
        }
    }

    suspend fun startVisitForPatient(patientId: String): String? {
        val clinicId = authTokenStore.getClinicId() ?: return null
        val staffId = authTokenStore.getStaffId()
        return runCatching {
            val (visit, _) = visitRepository.createVisit(
                clinicId = clinicId,
                patientId = patientId,
                doctorId = staffId,
                patientSyncEntryId = null,
            )
            _uiState.update { it.copy(searchQuery = "", searchResults = emptyList(), isSearching = false) }
            visit.id
        }.getOrNull()
    }

    /** One-tap check-in for an existing patient from search (WP2 A2). */
    suspend fun checkInForPatient(patientId: String): String? {
        val clinicId = authTokenStore.getClinicId() ?: return null
        val staffId = authTokenStore.getStaffId() ?: return null
        return runCatching {
            val (visit, _) = visitRepository.checkInPatient(
                clinicId = clinicId,
                patientId = patientId,
                staffId = staffId,
            )
            visitRepository.refreshOpdPatientsToday(clinicId)
            _uiState.update { it.copy(searchQuery = "", searchResults = emptyList(), isSearching = false) }
            visit.id
        }.getOrNull()
    }

    fun signOut() {
        viewModelScope.launch {
            clerkAuthManager.signOut()
        }
    }

    /** WP2 D4: un-fail dead-lettered entries and re-run the queue. */
    fun retryAllSync() {
        viewModelScope.launch {
            syncQueueDao.resetFailed()
            syncEngine.processQueue()
        }
    }

    /** WP2 D4: clear a single entry the user confirmed already landed on the server. */
    fun markEntrySynced(id: String) {
        viewModelScope.launch {
            syncQueueDao.forceComplete(id)
        }
    }
}
