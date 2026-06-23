package com.karibuhealth.app.ui.onboarding

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.karibuhealth.app.data.repository.StaffRepository
import com.karibuhealth.app.ui.learn.model.LearnCase
import com.karibuhealth.app.ui.onboarding.data.OnboardingModuleEntry
import com.karibuhealth.app.ui.onboarding.data.OnboardingRepository
import com.karibuhealth.app.ui.onboarding.model.OnboardingModule
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class OnboardingUiState(
    val isLoading: Boolean = true,
    val error: String? = null,
    val title: String = "KaribuEHR training",
    val subtitle: String = "",
    val modules: List<OnboardingModuleEntry> = emptyList(),
    val allComplete: Boolean = false,
    val isSubmitting: Boolean = false,
)

@HiltViewModel
class OnboardingViewModel @Inject constructor(
    private val repository: OnboardingRepository,
    private val staffRepository: StaffRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(OnboardingUiState())
    val uiState: StateFlow<OnboardingUiState> = _uiState.asStateFlow()

    init {
        refresh()
    }

    /** Re-fetch from server so web ↔ Android progress stays aligned. */
    fun refresh() {
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            runCatching {
                val staff = staffRepository.getCurrentStaff()
                val manifest = repository.loadManifest()
                val status = if (staff != null) {
                    repository.syncFromServer(staff.id) ?: repository.fetchRemoteStatus()
                } else {
                    repository.fetchRemoteStatus()
                }
                val modules = repository.mergeProgress(manifest, status)
                Triple(modules, manifest, status)
            }.onSuccess { (modules, manifest, status) ->
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        title = manifest.title,
                        subtitle = manifest.subtitle,
                        modules = modules,
                        allComplete = status?.completed == true,
                    )
                }
            }.onFailure { e ->
                _uiState.update {
                    it.copy(isLoading = false, error = e.message ?: "Could not load training")
                }
            }
        }
    }

    suspend fun loadCase(module: OnboardingModule): LearnCase? =
        repository.loadCaseForModule(module)

    fun completeModule(moduleId: String, score: Int, total: Int, onDone: (Boolean) -> Unit) {
        viewModelScope.launch {
            val staff = staffRepository.getCurrentStaff()
            if (staff == null) {
                _uiState.update { it.copy(error = "Staff profile not loaded") }
                onDone(false)
                return@launch
            }
            _uiState.update { it.copy(isSubmitting = true, error = null) }
            val result = repository.completeModule(staff.id, moduleId, score, total)
            _uiState.update { it.copy(isSubmitting = false) }
            result.onSuccess { allDone ->
                refresh()
                onDone(allDone)
            }.onFailure { e ->
                _uiState.update { it.copy(error = e.message) }
                onDone(false)
            }
        }
    }
}
