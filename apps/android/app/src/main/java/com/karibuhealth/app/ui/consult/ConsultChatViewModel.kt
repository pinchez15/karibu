package com.karibuhealth.app.ui.consult

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.karibuhealth.app.util.NetworkMonitor
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ConsultMessageUi(val role: String, val content: String)

data class ConsultChatUiState(
    val threadId: String? = null,
    val readOnly: Boolean = true,
    val messages: List<ConsultMessageUi> = emptyList(),
    val draft: String = "",
    val isSending: Boolean = false,
    val error: String? = DEPRECATED_MESSAGE,
    val isOnline: Boolean = true,
)

private const val DEPRECATED_MESSAGE =
    "Consult was replaced by Refer to hospital on the visit chart."

/** Legacy screen — kept for compile compatibility; no longer reachable from nav. */
@HiltViewModel
class ConsultChatViewModel @Inject constructor(
    private val networkMonitor: NetworkMonitor,
) : ViewModel() {

    private val _uiState = MutableStateFlow(ConsultChatUiState())
    val uiState: StateFlow<ConsultChatUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            networkMonitor.connectionStatusFlow.collect { status ->
                _uiState.update { it.copy(isOnline = status.isOnline) }
            }
        }
    }

    fun updateDraft(text: String) {
        _uiState.update { it.copy(draft = text) }
    }

    fun loadThread(@Suppress("UNUSED_PARAMETER") visitId: String) {
        _uiState.update { ConsultChatUiState(isOnline = _uiState.value.isOnline) }
    }

    fun send() {
        // Deprecated — no-op.
    }
}
