package com.karibuhealth.app.ui.consult

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.karibuhealth.app.data.remote.api.SupabaseApi
import com.karibuhealth.app.data.remote.dto.ConsultThreadListItemDto
import com.karibuhealth.app.util.NetworkMonitor
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import javax.inject.Inject

data class ConsultListUiState(
    val threads: List<ConsultThreadListItemDto> = emptyList(),
    val isLoading: Boolean = true,
    val error: String? = null,
)

@HiltViewModel
class ConsultListViewModel @Inject constructor(
    private val supabaseApi: SupabaseApi,
    private val networkMonitor: NetworkMonitor,
    private val json: Json,
) : ViewModel() {

    private val _uiState = MutableStateFlow(ConsultListUiState())
    val uiState: StateFlow<ConsultListUiState> = _uiState.asStateFlow()

    fun refresh() {
        if (!networkMonitor.isOnline()) {
            _uiState.update { it.copy(isLoading = false, error = "Consult requires an internet connection") }
            return
        }
        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }
            runCatching {
                val response = supabaseApi.rpcListConsultThreads()
                val body = response.body()?.string().orEmpty()
                if (!response.isSuccessful) error("HTTP ${response.code()}: ${body.take(120)}")
                json.decodeFromString(ListSerializer(ConsultThreadListItemDto.serializer()), body)
            }.onSuccess { threads ->
                _uiState.update { it.copy(threads = threads, isLoading = false) }
            }.onFailure { e ->
                _uiState.update { it.copy(isLoading = false, error = e.message) }
            }
        }
    }
}
