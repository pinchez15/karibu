package com.karibuhealth.app.ui.hivtb

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.karibuhealth.app.data.local.datastore.AuthTokenStore
import com.karibuhealth.app.data.local.db.entity.TbEpisodeEntity
import com.karibuhealth.app.data.repository.HivTbRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class TbEpisodeDetailUiState(
    val episode: TbEpisodeEntity? = null,
    val outcome: String = "ongoing",
    val outcomeDate: String = "",
    val saving: Boolean = false,
    val savedTick: Int = 0,
    val error: String? = null,
)

private val OUTCOMES = listOf(
    "ongoing", "cured", "completed", "failure", "default", "transferred_out", "died",
)

@HiltViewModel
class TbEpisodeDetailViewModel @Inject constructor(
    private val hivTbRepository: HivTbRepository,
    private val authTokenStore: AuthTokenStore,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {

    private val episodeId: String = savedStateHandle.get<String>("episodeId").orEmpty()
    private val _state = MutableStateFlow(TbEpisodeDetailUiState())
    val state: StateFlow<TbEpisodeDetailUiState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            hivTbRepository.observeTbEpisode(episodeId).collect { ep ->
                if (ep != null) {
                    _state.update {
                        it.copy(
                            episode = ep,
                            outcome = ep.outcome,
                            outcomeDate = ep.outcomeDate?.take(10).orEmpty(),
                        )
                    }
                }
            }
        }
    }

    fun setOutcome(v: String) = _state.update { it.copy(outcome = v) }
    fun onOutcomeDateChange(v: String) = _state.update { it.copy(outcomeDate = v) }

    fun saveOutcome() {
        val ep = _state.value.episode ?: return
        val s = _state.value
        viewModelScope.launch {
            _state.update { it.copy(saving = true, error = null) }
            try {
                val clinicId = authTokenStore.getClinicId() ?: return@launch
                hivTbRepository.upsertTbEpisode(
                    clinicId = clinicId,
                    patientId = ep.patientId,
                    patientName = ep.patientName,
                    episodeId = ep.id,
                    registeredAt = ep.registeredAt,
                    unitTbNumber = ep.unitTbNumber,
                    caseType = ep.caseType,
                    diseaseClass = ep.diseaseClass,
                    hivStatus = ep.hivStatus,
                    treatmentStartedAt = ep.treatmentStartedAt,
                    outcome = s.outcome,
                    outcomeDate = s.outcomeDate.ifBlank { null },
                )
                _state.update { it.copy(saving = false, savedTick = it.savedTick + 1) }
            } catch (ex: Exception) {
                _state.update { it.copy(saving = false, error = ex.message) }
            }
        }
    }

    val outcomeOptions: List<String> = OUTCOMES
}
