package com.karibuhealth.app.ui.inpatient

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.karibuhealth.app.data.local.datastore.AuthTokenStore
import com.karibuhealth.app.data.local.db.dao.AdmissionCensusRow
import com.karibuhealth.app.data.repository.InpatientRepository
import com.karibuhealth.app.util.NetworkMonitor
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class WardCensusUiState(
    val rows: List<AdmissionCensusRow> = emptyList(),
    val ward: String? = null, // null = all; "general" | "maternity"
    val isOnline: Boolean = true,
    val loading: Boolean = true,
)

@HiltViewModel
class WardCensusViewModel @Inject constructor(
    private val inpatientRepository: InpatientRepository,
    private val authTokenStore: AuthTokenStore,
    private val networkMonitor: NetworkMonitor,
) : ViewModel() {

    private val clinicIdFlow = MutableStateFlow<String?>(null)
    private val _filter = MutableStateFlow<String?>(null)
    private val _online = MutableStateFlow(true)

    @OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
    private val censusFlow = clinicIdFlow.flatMapLatest { clinicId ->
        if (clinicId == null) flowOf(emptyList()) else inpatientRepository.observeCensus(clinicId)
    }

    private val _state = MutableStateFlow(WardCensusUiState())
    val state: StateFlow<WardCensusUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            val clinicId = authTokenStore.getClinicId()
            clinicIdFlow.value = clinicId
            if (clinicId != null) inpatientRepository.refreshCensus(clinicId)
        }
        viewModelScope.launch {
            networkMonitor.isOnlineFlow.collect { online -> _online.value = online }
        }
        viewModelScope.launch {
            censusFlow.collect { rows ->
                _state.update { it.copy(rows = rows, loading = false) }
            }
        }
        viewModelScope.launch {
            _filter.collect { ward -> _state.update { it.copy(ward = ward) } }
        }
        viewModelScope.launch {
            _online.collect { online -> _state.update { it.copy(isOnline = online) } }
        }
    }

    fun setWardFilter(ward: String?) {
        _filter.value = ward
    }

    fun refresh() {
        viewModelScope.launch {
            authTokenStore.getClinicId()?.let { inpatientRepository.refreshCensus(it) }
        }
    }
}
