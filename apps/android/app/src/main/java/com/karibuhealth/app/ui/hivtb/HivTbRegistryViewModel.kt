package com.karibuhealth.app.ui.hivtb

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.karibuhealth.app.data.local.datastore.AuthTokenStore
import com.karibuhealth.app.data.local.db.entity.HivCareEnrollmentEntity
import com.karibuhealth.app.data.local.db.entity.HtsEventEntity
import com.karibuhealth.app.data.local.db.entity.TbEpisodeEntity
import com.karibuhealth.app.data.repository.HivTbRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class HivTbRegistryUiState(
    val hts: List<HtsEventEntity> = emptyList(),
    val hiv: List<HivCareEnrollmentEntity> = emptyList(),
    val tb: List<TbEpisodeEntity> = emptyList(),
    val loading: Boolean = true,
)

@HiltViewModel
class HivTbRegistryViewModel @Inject constructor(
    private val hivTbRepository: HivTbRepository,
    private val authTokenStore: AuthTokenStore,
) : ViewModel() {

    private val clinicId = MutableStateFlow<String?>(null)
    private val _state = MutableStateFlow(HivTbRegistryUiState())
    val state: StateFlow<HivTbRegistryUiState> = _state.asStateFlow()

    @OptIn(ExperimentalCoroutinesApi::class)
    private val registry = clinicId.flatMapLatest { id ->
        if (id == null) {
            flowOf(Triple(emptyList(), emptyList(), emptyList()))
        } else {
            combine(
                hivTbRepository.observeRecentHts(id),
                hivTbRepository.observeActiveHiv(id),
                hivTbRepository.observeActiveTb(id),
            ) { hts, hiv, tb -> Triple(hts, hiv, tb) }
        }
    }

    init {
        viewModelScope.launch {
            val id = authTokenStore.getClinicId()
            clinicId.value = id
            if (id != null) hivTbRepository.refreshRegistry(id)
        }
        viewModelScope.launch {
            registry.collect { (hts, hiv, tb) ->
                _state.update { it.copy(loading = false, hts = hts, hiv = hiv, tb = tb) }
            }
        }
    }

    fun refresh() {
        viewModelScope.launch { authTokenStore.getClinicId()?.let { hivTbRepository.refreshRegistry(it) } }
    }
}
