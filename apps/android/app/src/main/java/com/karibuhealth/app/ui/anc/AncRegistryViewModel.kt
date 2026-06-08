package com.karibuhealth.app.ui.anc

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.karibuhealth.app.data.local.datastore.AuthTokenStore
import com.karibuhealth.app.data.local.db.dao.PregnancyRegistryRow
import com.karibuhealth.app.data.repository.AncRepository
import com.karibuhealth.app.domain.AncProtocol
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.LocalDate
import javax.inject.Inject

/** One registry row joined with its derived ANC protocol status. */
data class PregnancyRow(
    val row: PregnancyRegistryRow,
    val status: AncProtocol.Status,
)

data class AncRegistryUiState(
    val rows: List<PregnancyRow> = emptyList(),
    val loading: Boolean = true,
)

@HiltViewModel
class AncRegistryViewModel @Inject constructor(
    private val ancRepository: AncRepository,
    private val authTokenStore: AuthTokenStore,
) : ViewModel() {

    private val clinicId = MutableStateFlow<String?>(null)
    private val _state = MutableStateFlow(AncRegistryUiState())
    val state: StateFlow<AncRegistryUiState> = _state.asStateFlow()

    @OptIn(ExperimentalCoroutinesApi::class)
    private val registry = clinicId.flatMapLatest { id ->
        if (id == null) flowOf(emptyList()) else ancRepository.observeRegistry(id)
    }

    init {
        viewModelScope.launch {
            val id = authTokenStore.getClinicId()
            clinicId.value = id
            if (id != null) ancRepository.refreshRegistry(id)
        }
        viewModelScope.launch {
            registry.collect { rows ->
                val today = LocalDate.now()
                _state.update {
                    it.copy(
                        loading = false,
                        rows = rows.map { r ->
                            PregnancyRow(
                                row = r,
                                status = AncProtocol.status(
                                    lmp = r.pregnancy.lmp?.let { s -> runCatching { LocalDate.parse(s.take(10)) }.getOrNull() },
                                    edd = r.pregnancy.edd?.let { s -> runCatching { LocalDate.parse(s.take(10)) }.getOrNull() },
                                    contactsDone = r.contactCount,
                                    iptpDone = r.iptpCount,
                                    today = today,
                                ),
                            )
                        },
                    )
                }
            }
        }
    }

    fun refresh() {
        viewModelScope.launch { authTokenStore.getClinicId()?.let { ancRepository.refreshRegistry(it) } }
    }
}
