package com.karibuhealth.learn

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.karibuhealth.learn.data.LearnRepository
import com.karibuhealth.learn.data.PackEntry
import com.karibuhealth.learn.data.supabase.CaseCompletionRow
import com.karibuhealth.learn.data.supabase.LearnAuthRepository
import com.karibuhealth.learn.data.supabase.LearnCorrectionsRepository
import com.karibuhealth.learn.data.supabase.LearnProgressRepository
import com.karibuhealth.learn.model.LearnCase
import com.karibuhealth.learn.model.PackInfo
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

data class LearnUiState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val packs: List<PackEntry> = emptyList(),
    val cases: List<LearnCase> = emptyList(),
    val catalogCaseCount: Int = 0,
    val catalogTopicCount: Int = 0,
    /** packId → 0f..1f while a download is in flight. */
    val downloading: Map<String, Float> = emptyMap(),
)

data class LearnProgressUiState(
    val isLoading: Boolean = false,
    val isSignedIn: Boolean = false,
    val creditsEarned: Double = 0.0,
    val completions: List<CaseCompletionRow> = emptyList(),
    val error: String? = null,
)

class LearnViewModel(
    private val repository: LearnRepository,
    private val authRepository: LearnAuthRepository,
    private val progressRepository: LearnProgressRepository,
    private val correctionsRepository: LearnCorrectionsRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(LearnUiState())
    val uiState: StateFlow<LearnUiState> = _uiState.asStateFlow()

    private val _progressState = MutableStateFlow(LearnProgressUiState())
    val progressState: StateFlow<LearnProgressUiState> = _progressState.asStateFlow()

    init {
        refresh()
        authRepository.sessionStatus
            .onEach { signedIn ->
                _progressState.update { it.copy(isSignedIn = signedIn) }
                if (signedIn) refreshProgress() else {
                    _progressState.update {
                        it.copy(creditsEarned = 0.0, completions = emptyList(), error = null)
                    }
                }
            }
            .launchIn(viewModelScope)
        _progressState.update { it.copy(isSignedIn = authRepository.isSignedIn) }
        if (authRepository.isSignedIn) refreshProgress()
    }

    fun refresh() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            runCatching {
                val packs = repository.listPacks()
                val cases = repository.loadInstalledCases()
                val catalog = repository.loadCatalogStats()
                Triple(packs, cases, catalog)
            }.onSuccess { (packs, cases, catalog) ->
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        packs = packs,
                        cases = cases,
                        catalogCaseCount = catalog.playableCaseCount,
                        catalogTopicCount = catalog.topicCount,
                    )
                }
            }.onFailure { e ->
                _uiState.update { it.copy(isLoading = false, error = e.message ?: "Could not load cases") }
            }
        }
    }

    fun refreshProgress() {
        if (!authRepository.isSignedIn) return
        viewModelScope.launch {
            _progressState.update { it.copy(isLoading = true, error = null) }
            runCatching { progressRepository.fetchProgress() }
                .onSuccess { progress ->
                    _progressState.update {
                        it.copy(
                            isLoading = false,
                            creditsEarned = progress.creditsEarned,
                            completions = progress.completions,
                        )
                    }
                }
                .onFailure { e ->
                    _progressState.update {
                        it.copy(isLoading = false, error = e.message ?: "Could not load progress")
                    }
                }
        }
    }

    fun recordCaseCompletion(case: LearnCase, score: Int, total: Int) {
        if (!authRepository.isSignedIn) return
        viewModelScope.launch {
            runCatching {
                progressRepository.recordCompletion(
                    caseId = case.id,
                    packId = case.packId,
                    score = score,
                    total = total,
                    credit = case.credit,
                )
            }.onSuccess { refreshProgress() }
        }
    }

    suspend fun submitCaseCorrection(case: LearnCase, message: String): Result<Unit> = runCatching {
        correctionsRepository.submitCorrection(
            caseId = case.id,
            packId = case.packId,
            message = message,
            caseLevel = case.level,
        )
    }

    fun submitCaseCorrection(case: LearnCase, message: String, onResult: (Result<Unit>) -> Unit) {
        viewModelScope.launch {
            onResult(submitCaseCorrection(case, message))
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
    private val authRepository: LearnAuthRepository,
    private val progressRepository: LearnProgressRepository,
    private val correctionsRepository: LearnCorrectionsRepository,
) : ViewModelProvider.Factory {
    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        if (modelClass.isAssignableFrom(LearnViewModel::class.java)) {
            return LearnViewModel(repository, authRepository, progressRepository, correctionsRepository) as T
        }
        throw IllegalArgumentException("Unknown ViewModel: ${modelClass.name}")
    }
}
