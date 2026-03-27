package com.karibuhealth.app.ui.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.karibuhealth.app.data.local.datastore.AuthTokenStore
import com.karibuhealth.app.data.local.db.converter.toDomain
import com.karibuhealth.app.data.local.db.entity.VisitWithPatient
import com.karibuhealth.app.data.repository.StaffRepository
import com.karibuhealth.app.data.repository.VisitRepository
import com.karibuhealth.app.domain.model.Clinic
import com.karibuhealth.app.domain.model.Staff
import com.karibuhealth.app.domain.model.Visit
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

data class HomeUiState(
    val staff: Staff? = null,
    val clinic: Clinic? = null,
    val recentVisits: List<VisitWithPatient> = emptyList(),
    val isLoading: Boolean = true,
)

@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel
class HomeViewModel @Inject constructor(
    private val staffRepository: StaffRepository,
    private val visitRepository: VisitRepository,
    private val authTokenStore: AuthTokenStore,
) : ViewModel() {

    private val _uiState = MutableStateFlow(HomeUiState())
    val uiState: StateFlow<HomeUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            val clerkUserId = authTokenStore.getClerkUserId() ?: return@launch
            val staff = staffRepository.fetchAndCacheStaff(clerkUserId) ?: return@launch

            _uiState.update { it.copy(staff = staff, isLoading = false) }

            // Observe clinic
            staffRepository.getClinic(staff.clinicId).collect { clinic ->
                _uiState.update { it.copy(clinic = clinic) }
            }
        }

        viewModelScope.launch {
            val staffId = authTokenStore.getStaffId() ?: return@launch
            visitRepository.getRecentByDoctor(staffId).collect { visits ->
                _uiState.update { it.copy(recentVisits = visits) }
            }
        }
    }

    fun refresh() {
        viewModelScope.launch {
            val clinicId = authTokenStore.getClinicId() ?: return@launch
            visitRepository.refreshTodayVisits(clinicId)
        }
    }
}
