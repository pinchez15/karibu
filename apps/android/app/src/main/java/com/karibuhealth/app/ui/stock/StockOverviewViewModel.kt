package com.karibuhealth.app.ui.stock

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.karibuhealth.app.data.local.datastore.AuthTokenStore
import com.karibuhealth.app.data.remote.dto.LabStockItemDto
import com.karibuhealth.app.data.remote.dto.PharmacyStockItemDto
import com.karibuhealth.app.data.repository.StockOverviewRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class StockOverviewUiState(
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val pharmacy: List<PharmacyStockItemDto> = emptyList(),
    val lab: List<LabStockItemDto> = emptyList(),
)

@HiltViewModel
class StockOverviewViewModel @Inject constructor(
    private val stockOverviewRepository: StockOverviewRepository,
    private val authTokenStore: AuthTokenStore,
) : ViewModel() {

    private val _uiState = MutableStateFlow(StockOverviewUiState())
    val uiState: StateFlow<StockOverviewUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    fun load() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }
            fetch()
            _uiState.update { it.copy(isLoading = false) }
        }
    }

    fun refresh() {
        viewModelScope.launch {
            _uiState.update { it.copy(isRefreshing = true) }
            fetch()
            _uiState.update { it.copy(isRefreshing = false) }
        }
    }

    private suspend fun fetch() {
        val clinicId = authTokenStore.getClinicId() ?: return
        val snapshot = stockOverviewRepository.loadStock(clinicId)
        _uiState.update {
            it.copy(pharmacy = snapshot.pharmacy, lab = snapshot.lab)
        }
    }
}
