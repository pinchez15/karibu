package com.karibuhealth.learn

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.karibuhealth.learn.data.LearnRepository
import com.karibuhealth.learn.data.PackEntry
import com.karibuhealth.learn.model.LearnCase
import com.karibuhealth.learn.model.PackInfo
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class LearnUiState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val packs: List<PackEntry> = emptyList(),
    val cases: List<LearnCase> = emptyList(),
    /** packId → 0f..1f while a download is in flight. */
    val downloading: Map<String, Float> = emptyMap(),
)

class LearnViewModel(
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

class LearnViewModelFactory(
    private val repository: LearnRepository,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        if (modelClass.isAssignableFrom(LearnViewModel::class.java)) {
            return LearnViewModel(repository) as T
        }
        throw IllegalArgumentException("Unknown ViewModel: ${modelClass.name}")
    }
}
