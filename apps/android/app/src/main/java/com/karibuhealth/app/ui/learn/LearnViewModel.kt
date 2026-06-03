package com.karibuhealth.app.ui.learn

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.karibuhealth.app.ui.learn.data.LearnRepository
import com.karibuhealth.app.ui.learn.data.PackEntry
import com.karibuhealth.app.ui.learn.model.LearnCase
import com.karibuhealth.app.ui.learn.model.PackInfo
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class LearnUiState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val packs: List<PackEntry> = emptyList(),
    val cases: List<LearnCase> = emptyList(),
    /** packId → 0f..1f while a download is in flight. */
    val downloading: Map<String, Float> = emptyMap(),
)

@HiltViewModel
class LearnViewModel @Inject constructor(
    private val repository: LearnRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(LearnUiState())
    val uiState: StateFlow<LearnUiState> = _uiState.asStateFlow()

    init { refresh() }

    fun refresh() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            runCatching {
                val packs = repository.listPacks()
                val cases = repository.loadInstalledCases()
                packs to cases
            }.onSuccess { (packs, cases) ->
                _uiState.update { it.copy(isLoading = false, packs = packs, cases = cases) }
            }.onFailure { e ->
                _uiState.update { it.copy(isLoading = false, error = e.message ?: "Could not load cases") }
            }
        }
    }

    fun downloadPack(info: PackInfo) {
        if (_uiState.value.downloading.containsKey(info.id)) return
        viewModelScope.launch {
            _uiState.update { it.copy(downloading = it.downloading + (info.id to 0f)) }
            val result = repository.downloadPack(info) { progress ->
                _uiState.update { it.copy(downloading = it.downloading + (info.id to progress)) }
            }
            _uiState.update { it.copy(downloading = it.downloading - info.id) }
            result.onSuccess { refresh() }
                .onFailure { e -> _uiState.update { it.copy(error = e.message ?: "Download failed") } }
        }
    }

    fun removePack(info: PackInfo) {
        viewModelScope.launch {
            repository.removePack(info.id)
            refresh()
        }
    }

    fun caseById(id: String): LearnCase? = _uiState.value.cases.firstOrNull { it.id == id }
}
