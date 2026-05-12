package com.karibuhealth.app.ui.worklists

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.karibuhealth.app.data.local.datastore.AuthTokenStore
import com.karibuhealth.app.data.repository.WorklistRepository
import com.karibuhealth.app.domain.model.CareTaskItem
import com.karibuhealth.app.domain.model.MyDraftItem
import com.karibuhealth.app.domain.model.NeedsClinicianItem
import com.karibuhealth.app.domain.model.NeedsLabItem
import com.karibuhealth.app.domain.model.NeedsPaymentItem
import com.karibuhealth.app.domain.model.NeedsPharmacyItem
import com.karibuhealth.app.domain.model.NeedsVitalsItem
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Phase 5 worklists screen state.
 *
 * Loads all seven worklists in parallel for the caller's clinic. Each
 * worklist surfaces the full row list — the UI gets to decide whether to
 * collapse, peek, or expand. We keep counts derived from the lists (rather
 * than from a separate "count" RPC) so the screen renders a consistent
 * snapshot even with slow network.
 */
data class WorklistsUiState(
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
    val needsVitals: List<NeedsVitalsItem> = emptyList(),
    val needsClinician: List<NeedsClinicianItem> = emptyList(),
    val needsLab: List<NeedsLabItem> = emptyList(),
    val needsPharmacy: List<NeedsPharmacyItem> = emptyList(),
    val needsPayment: List<NeedsPaymentItem> = emptyList(),
    val myDrafts: List<MyDraftItem> = emptyList(),
    val careTasks: List<CareTaskItem> = emptyList(),
)

@HiltViewModel
class WorklistsViewModel @Inject constructor(
    private val worklistRepository: WorklistRepository,
    private val authTokenStore: AuthTokenStore,
) : ViewModel() {

    private val _uiState = MutableStateFlow(WorklistsUiState())
    val uiState: StateFlow<WorklistsUiState> = _uiState.asStateFlow()

    init {
        loadAll()
    }

    /** Initial fetch — sets isLoading until the first response. */
    fun loadAll() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true) }
            fetch()
            _uiState.update { it.copy(isLoading = false) }
        }
    }

    /** Pull-to-refresh — keeps stale data visible while reloading. */
    fun refresh() {
        viewModelScope.launch {
            _uiState.update { it.copy(isRefreshing = true) }
            fetch()
            _uiState.update { it.copy(isRefreshing = false) }
        }
    }

    /**
     * Fan out the seven RPC calls in parallel. Each returns an empty list on
     * failure (offline or RPC error), so the UI degrades to "no items"
     * gracefully without needing a per-section error state.
     */
    private suspend fun fetch() {
        val clinicId = authTokenStore.getClinicId() ?: return
        val staffId = authTokenStore.getStaffId()

        val needsVitalsAsync = viewModelScope.async {
            worklistRepository.getNeedsVitals(clinicId)
        }
        val needsClinicianAsync = viewModelScope.async {
            worklistRepository.getNeedsClinician(clinicId)
        }
        val needsLabAsync = viewModelScope.async {
            worklistRepository.getNeedsLab(clinicId)
        }
        val needsPharmacyAsync = viewModelScope.async {
            worklistRepository.getNeedsPharmacy(clinicId)
        }
        val needsPaymentAsync = viewModelScope.async {
            worklistRepository.getNeedsPayment(clinicId)
        }
        val myDraftsAsync = viewModelScope.async {
            // Pass staffId so the server-side filter narrows to the caller's
            // own drafts (migration 042 filters by author when authenticated).
            worklistRepository.getMyDrafts(clinicId = clinicId, staffId = staffId)
        }
        val careTasksAsync = viewModelScope.async {
            worklistRepository.getCareTasks(clinicId)
        }

        // awaitAll() on Collection<Deferred<*>> — gives us "fan out, then
        // wait for everything before swapping state" in one shot. Individual
        // .await() calls below pull the typed results back out.
        listOf(
            needsVitalsAsync,
            needsClinicianAsync,
            needsLabAsync,
            needsPharmacyAsync,
            needsPaymentAsync,
            myDraftsAsync,
            careTasksAsync,
        ).awaitAll()

        _uiState.update {
            it.copy(
                needsVitals = needsVitalsAsync.await(),
                needsClinician = needsClinicianAsync.await(),
                needsLab = needsLabAsync.await(),
                needsPharmacy = needsPharmacyAsync.await(),
                needsPayment = needsPaymentAsync.await(),
                myDrafts = myDraftsAsync.await(),
                careTasks = careTasksAsync.await(),
            )
        }
    }
}
