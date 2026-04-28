package com.karibuhealth.app.ui.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.karibuhealth.app.data.local.datastore.AuthTokenStore
import com.karibuhealth.app.data.local.db.entity.VisitWithPatient
import com.karibuhealth.app.data.repository.PatientRepository
import com.karibuhealth.app.data.repository.StaffRepository
import com.karibuhealth.app.data.repository.VisitRepository
import com.karibuhealth.app.domain.model.Clinic
import com.karibuhealth.app.domain.model.Patient
import com.karibuhealth.app.domain.model.Staff
import com.karibuhealth.app.ui.auth.ClerkAuthManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class HomeUiState(
    val staff: Staff? = null,
    val clinic: Clinic? = null,
    val queue: List<VisitWithPatient> = emptyList(),
    val toDictate: List<VisitWithPatient> = emptyList(),
    val toReview: List<VisitWithPatient> = emptyList(),
    val doneTodayCount: Int = 0,
    val searchQuery: String = "",
    val searchResults: List<Patient> = emptyList(),
    val isSearching: Boolean = false,
    val isLoading: Boolean = true,
) {
    val todayEncounterCount: Int
        get() = buildSet {
            queue.forEach { add(it.visit.id) }
            toDictate.forEach { add(it.visit.id) }
            toReview.forEach { add(it.visit.id) }
        }.size + doneTodayCount
}

@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel
class HomeViewModel @Inject constructor(
    private val staffRepository: StaffRepository,
    private val visitRepository: VisitRepository,
    private val patientRepository: PatientRepository,
    private val authTokenStore: AuthTokenStore,
    private val clerkAuthManager: ClerkAuthManager,
) : ViewModel() {

    private val _uiState = MutableStateFlow(HomeUiState())
    val uiState: StateFlow<HomeUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            val clerkUserId = authTokenStore.getClerkUserId() ?: return@launch
            val staff = staffRepository.fetchAndCacheStaff(clerkUserId) ?: return@launch
            _uiState.update { it.copy(staff = staff, isLoading = false) }

            launch {
                staffRepository.getClinic(staff.clinicId).collect { clinic ->
                    _uiState.update { it.copy(clinic = clinic) }
                }
            }
            launch {
                visitRepository.getTodayClinicianQueue(staff.clinicId, staff.id).collect { list ->
                    _uiState.update { it.copy(queue = list) }
                }
            }
            launch {
                visitRepository.getMyPendingDictations(staff.id).collect { list ->
                    _uiState.update { it.copy(toDictate = list) }
                }
            }
            launch {
                visitRepository.getMyVisitsToReview(staff.id).collect { list ->
                    _uiState.update { it.copy(toReview = list) }
                }
            }
            launch {
                visitRepository.getMyDoneTodayCount(staff.id).collect { count ->
                    _uiState.update { it.copy(doneTodayCount = count) }
                }
            }
        }
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
        viewModelScope.launch {
            val clinicId = authTokenStore.getClinicId() ?: return@launch
            visitRepository.refreshTodayVisits(clinicId)
        }
    }

    // One-tap claim from the queue: optimistic local update + queued RPC.
    // The visit-details screen is opened immediately by the caller; sync runs
    // in the background.
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
            val visit = visitRepository.createVisit(
                clinicId = clinicId,
                patientId = patientId,
                doctorId = staffId,
            )
            _uiState.update { it.copy(searchQuery = "", searchResults = emptyList(), isSearching = false) }
            visit.id
        }.getOrNull()
    }

    fun signOut() {
        viewModelScope.launch {
            clerkAuthManager.signOut()
        }
    }
}
