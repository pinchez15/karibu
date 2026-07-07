package com.karibuhealth.app.ui.pharmacy

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.karibuhealth.app.data.local.datastore.AuthTokenStore
import com.karibuhealth.app.data.remote.dto.CompleteDispenseLineRpc
import com.karibuhealth.app.data.remote.dto.CompletePharmacyDispenseRequest
import com.karibuhealth.app.data.repository.PharmacyStockRepository
import com.karibuhealth.app.data.repository.StaffRepository
import com.karibuhealth.app.data.repository.VisitRepository
import com.karibuhealth.app.data.repository.WorklistRepository
import com.karibuhealth.app.data.sync.SyncEngine
import com.karibuhealth.app.domain.model.NeedsPharmacyItem
import com.karibuhealth.app.domain.model.PharmacyQueueTab
import com.karibuhealth.app.domain.model.Staff
import com.karibuhealth.app.domain.model.aggregateDispensingStatus
import com.karibuhealth.app.domain.model.pharmacyTabForVisit
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class PharmacyHomeUiState(
    val staff: Staff? = null,
    val items: List<NeedsPharmacyItem> = emptyList(),
    val selectedTab: PharmacyQueueTab = PharmacyQueueTab.Waiting,
    val searchQuery: String = "",
    val isLoading: Boolean = true,
    val error: String? = null,
    val actionVisitId: String? = null,
    val stockWarning: String? = null,
)

@HiltViewModel
class PharmacyHomeViewModel @Inject constructor(
    private val authTokenStore: AuthTokenStore,
    private val staffRepository: StaffRepository,
    private val worklistRepository: WorklistRepository,
    private val visitRepository: VisitRepository,
    private val pharmacyStockRepository: PharmacyStockRepository,
    private val syncEngine: SyncEngine,
) : ViewModel() {

    private val _uiState = MutableStateFlow(PharmacyHomeUiState())
    val uiState: StateFlow<PharmacyHomeUiState> = _uiState.asStateFlow()

    val filteredItems: List<NeedsPharmacyItem>
        get() {
            val tab = _uiState.value.selectedTab
            return _uiState.value.items.filter { item ->
                pharmacyTabForVisit(item.dispensingStatus, item.dispensedAt) == tab
            }
        }

    /** Tab filter + WP2 type-ahead by name or today's number. */
    val searchFilteredItems: List<NeedsPharmacyItem>
        get() {
            val q = _uiState.value.searchQuery.trim().lowercase().removePrefix("#")
            if (q.isEmpty()) return filteredItems
            return filteredItems.filter { item ->
                item.patientName.lowercase().contains(q) ||
                    item.queuePosition?.toString()?.contains(q) == true
            }
        }

    init {
        viewModelScope.launch {
            val clerkUserId = authTokenStore.getClerkUserId() ?: return@launch
            val staff = staffRepository.fetchAndCacheStaff(clerkUserId) ?: return@launch
            _uiState.update { it.copy(staff = staff) }
            refresh()
        }
    }

    fun selectTab(tab: PharmacyQueueTab) {
        _uiState.update { it.copy(selectedTab = tab) }
    }

    fun updateSearch(query: String) {
        _uiState.update { it.copy(searchQuery = query) }
    }

    fun refresh() {
        val staff = _uiState.value.staff ?: return
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            pharmacyStockRepository.refreshStock(staff.clinicId)
            val active = worklistRepository.getNeedsPharmacy(staff.clinicId)
            val done = worklistRepository.getPharmacyDoneToday(staff.clinicId)
            val activeIds = active.map { it.visitId }.toSet()
            val items = active + done.filter { it.visitId !in activeIds }
            _uiState.update { it.copy(items = items, isLoading = false) }
        }
    }

    fun startDispense(visitId: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(actionVisitId = visitId) }
            runCatching {
                visitRepository.startPharmacyDispense(visitId)
                syncEngine.processQueue()
            }.onFailure { e -> _uiState.update { it.copy(error = e.message) } }
            refresh()
            _uiState.update { it.copy(actionVisitId = null) }
        }
    }

    fun completeDispense(
        visitId: String,
        drafts: List<DispenseLineDraft>,
        visitNotes: String?,
    ) {
        val staff = _uiState.value.staff ?: return
        val item = _uiState.value.items.find { it.visitId == visitId }
        viewModelScope.launch {
            _uiState.update { it.copy(actionVisitId = visitId) }
            runCatching {
                val notStarted = item?.dispensingStatus.isNullOrBlank() ||
                    item.dispensingStatus == "not_started"
                if (notStarted) {
                    visitRepository.startPharmacyDispense(visitId)
                }
                val warnings = mutableListOf<String>()
                val hasLegacyLines = drafts.any { it.prescriptionOrderId.startsWith("legacy-") }
                if (hasLegacyLines) {
                    val aggStatus = aggregateDispensingStatus(drafts.map { it.lineStatus })
                    visitRepository.setDispensingStatus(
                        visitId = visitId,
                        status = aggStatus,
                        notes = visitNotes,
                        staffId = staff.id,
                    )
                } else {
                    val rpcLines = drafts.map { draft ->
                        var line = CompleteDispenseLineRpc(
                            prescriptionOrderId = draft.prescriptionOrderId,
                            lineStatus = draft.lineStatus,
                            quantityDispensed = draft.quantityDispensed.toDoubleOrNull(),
                            quantityUnit = draft.quantityUnit.ifBlank { null },
                            notes = draft.notes.ifBlank { null },
                        )
                        val (enriched, warning) = pharmacyStockRepository.enrichDispenseLineWithStock(
                            clinicId = staff.clinicId,
                            line = line,
                            medicationCode = draft.medicationCode,
                            medicationLabel = draft.displayName,
                        )
                        line = enriched
                        warning?.let { warnings.add(it) }
                        line
                    }
                    visitRepository.completePharmacyDispense(
                        visitId = visitId,
                        request = CompletePharmacyDispenseRequest(
                            visitId = visitId,
                            lines = rpcLines,
                            notes = visitNotes,
                        ),
                        staffId = staff.id,
                    )
                }
                syncEngine.processQueue()
                if (warnings.isNotEmpty()) {
                    _uiState.update { it.copy(stockWarning = warnings.joinToString("\n")) }
                }
            }.onFailure { e -> _uiState.update { it.copy(error = e.message) } }
            refresh()
            _uiState.update { it.copy(actionVisitId = null) }
        }
    }

    fun sendBackToClinician(visitId: String, reason: String) {
        viewModelScope.launch {
            _uiState.update { it.copy(actionVisitId = visitId) }
            runCatching {
                visitRepository.sendPharmacyBackToClinician(visitId, reason)
                syncEngine.processQueue()
            }.onFailure { e -> _uiState.update { it.copy(error = e.message) } }
            refresh()
            _uiState.update { it.copy(actionVisitId = null) }
        }
    }

    fun dismissStockWarning() {
        _uiState.update { it.copy(stockWarning = null) }
    }

    fun dismissError() {
        _uiState.update { it.copy(error = null) }
    }
}
