package com.karibuhealth.app.ui.orders

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.karibuhealth.app.data.local.datastore.AuthTokenStore
import com.karibuhealth.app.data.local.db.dao.VisitDao
import com.karibuhealth.app.data.repository.ReferralRepository
import com.karibuhealth.app.data.repository.VisitRepository
import com.karibuhealth.app.domain.model.ReferralUrgency
import com.karibuhealth.app.ui.components.KhStatusKind
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.LocalDate
import javax.inject.Inject

data class OrdersUiState(
    val selectedCategory: OrderCategory = OrderCategory.All,
    val rows: List<OrderRow> = emptyList(),
    val isLoading: Boolean = true,
    val isRefreshing: Boolean = false,
)

@HiltViewModel
class OrdersViewModel @Inject constructor(
    private val visitDao: VisitDao,
    private val visitRepository: VisitRepository,
    private val referralRepository: ReferralRepository,
    private val authTokenStore: AuthTokenStore,
) : ViewModel() {

    private val _uiState = MutableStateFlow(OrdersUiState())
    val uiState: StateFlow<OrdersUiState> = _uiState.asStateFlow()

    private var clinicId: String? = null
    private var allRows: List<OrderRow> = emptyList()

    init {
        viewModelScope.launch {
            clinicId = authTokenStore.getClinicId()
            val cid = clinicId ?: return@launch
            val today = LocalDate.now().toString()
            combine(
                visitDao.getTodayVisitsWithPatients(cid, today),
                referralRepository.observeActiveToday(cid),
            ) { visits, referrals ->
                val labRows = visits
                    .filter { !it.visit.testsOrdered.isNullOrBlank() }
                    .mapNotNull { vwp ->
                        val v = vwp.visit
                        val p = vwp.patient ?: return@mapNotNull null
                        val name = patientName(p.firstName, p.lastName, p.displayName)
                        OrderRow(
                            id = "lab-${v.id}",
                            visitId = v.id,
                            patientId = v.patientId,
                            patientName = name,
                            kind = OrderKind.Lab,
                            summary = v.testsOrdered.orEmpty(),
                            statusLabel = labStatusLabel(v.labStatus),
                            statusKind = labStatusKind(v.labStatus),
                        )
                    }
                val pharmRows = visits
                    .filter {
                        !it.visit.medications.isNullOrBlank() ||
                            it.visit.pharmacyOrderSubmittedAt != null
                    }
                    .mapNotNull { vwp ->
                        val v = vwp.visit
                        val p = vwp.patient ?: return@mapNotNull null
                        val name = patientName(p.firstName, p.lastName, p.displayName)
                        val hasOrder = v.pharmacyOrderSubmittedAt != null
                        OrderRow(
                            id = "pharm-${v.id}",
                            visitId = v.id,
                            patientId = v.patientId,
                            patientName = name,
                            kind = OrderKind.Pharmacy,
                            summary = v.medications.orEmpty().ifBlank { "Order submitted" },
                            statusLabel = dispensingStatusLabel(v.dispensingStatus, hasOrder)
                                .ifBlank { if (hasOrder) "Queued" else "Draft" },
                            statusKind = dispensingStatusKind(v.dispensingStatus),
                        )
                    }
                val referralRows = referrals.map { ref ->
                    OrderRow(
                        id = "ref-${ref.id}",
                        visitId = ref.visitId,
                        patientId = ref.patientId,
                        patientName = ref.patientName ?: "Patient",
                        kind = OrderKind.Referral,
                        summary = ref.toFacility,
                        statusLabel = ref.urgency.label,
                        statusKind = when (ref.urgency) {
                            ReferralUrgency.Emergency -> KhStatusKind.Errored
                            ReferralUrgency.Urgent -> KhStatusKind.PendingReview
                            ReferralUrgency.Routine -> KhStatusKind.Waiting
                        },
                    )
                }
                (labRows + pharmRows + referralRows).sortedBy { it.patientName }
            }.collect { rows ->
                allRows = rows
                _uiState.update { state ->
                    state.copy(
                        rows = filterRows(rows, state.selectedCategory),
                        isLoading = false,
                    )
                }
            }
        }
    }

    fun selectCategory(category: OrderCategory) {
        _uiState.update { state ->
            state.copy(
                selectedCategory = category,
                rows = filterRows(allRows, category),
            )
        }
    }

    fun refresh() {
        val cid = clinicId ?: return
        viewModelScope.launch {
            _uiState.update { it.copy(isRefreshing = true) }
            visitRepository.refreshOpdPatientsToday(cid)
            referralRepository.refreshToday(cid)
            _uiState.update { it.copy(isRefreshing = false) }
        }
    }

    private fun filterRows(all: List<OrderRow>, category: OrderCategory): List<OrderRow> =
        when (category) {
            OrderCategory.All -> all.sortedBy { it.patientName }
            OrderCategory.Labs -> all.filter { it.kind == OrderKind.Lab }
            OrderCategory.Pharmacy -> all.filter { it.kind == OrderKind.Pharmacy }
            OrderCategory.Referrals -> all.filter { it.kind == OrderKind.Referral }
        }

    private fun patientName(first: String?, last: String?, display: String?): String =
        listOfNotNull(first, last).joinToString(" ").ifBlank { display ?: "Unknown" }
}
