package com.karibuhealth.app.ui.consult

import androidx.lifecycle.ViewModel
import com.karibuhealth.app.data.remote.dto.ConsultThreadListItemDto
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject

data class ConsultListUiState(
    val threads: List<ConsultThreadListItemDto> = emptyList(),
    val isLoading: Boolean = false,
    val error: String? = DEPRECATED_MESSAGE,
)

private const val DEPRECATED_MESSAGE =
    "Consult was replaced by Refer to hospital on the visit chart."

/** Legacy screen — kept for compile compatibility; no longer reachable from nav. */
@HiltViewModel
class ConsultListViewModel @Inject constructor() : ViewModel() {

    private val _uiState = MutableStateFlow(ConsultListUiState())
    val uiState: StateFlow<ConsultListUiState> = _uiState.asStateFlow()

    fun refresh() {
        _uiState.value = ConsultListUiState()
    }
}
