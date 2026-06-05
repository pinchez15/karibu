package com.karibuhealth.app.ui.consult

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.karibuhealth.app.data.remote.api.DictationApiClient
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
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import javax.inject.Inject

data class ConsultMessageUi(val role: String, val content: String)

data class ConsultChatUiState(
    val threadId: String? = null,
    val readOnly: Boolean = false,
    val messages: List<ConsultMessageUi> = emptyList(),
    val draft: String = "",
    val isSending: Boolean = false,
    val error: String? = null,
    val isOnline: Boolean = true,
)

@HiltViewModel
class ConsultChatViewModel @Inject constructor(
    private val supabaseApi: SupabaseApi,
    private val dictationApiClient: DictationApiClient,
    private val networkMonitor: NetworkMonitor,
    private val json: Json,
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

    fun loadThread(visitId: String) {
        viewModelScope.launch {
            if (!networkMonitor.isOnline()) {
                _uiState.update { it.copy(error = "Consult requires an internet connection") }
                return@launch
            }
            runCatching {
                val threadsResp = supabaseApi.rpcListConsultThreads()
                val threadsBody = threadsResp.body()?.string().orEmpty()
                if (!threadsResp.isSuccessful) error("HTTP ${threadsResp.code()}")
                val threads = json.decodeFromString(
                    ListSerializer(ConsultThreadListItemDto.serializer()),
                    threadsBody,
                )
                val threadId = threads.firstOrNull { it.visitId == visitId }?.threadId
                if (threadId == null) {
                    _uiState.update { it.copy(error = "Start consult from the visit chart first") }
                    return@runCatching
                }
                val detail = supabaseApi.rpcGetConsultThread(mapOf("p_thread_id" to threadId))
                val msgs = detail["messages"]?.jsonArray?.map { m ->
                    val o = m.jsonObject
                    ConsultMessageUi(
                        role = o["role"]?.jsonPrimitive?.content.orEmpty(),
                        content = o["content"]?.jsonPrimitive?.content.orEmpty(),
                    )
                }.orEmpty()
                val readOnly =
                    detail["thread"]?.jsonObject?.get("read_only")?.jsonPrimitive?.content == "true"
                _uiState.update {
                    it.copy(threadId = threadId, messages = msgs, readOnly = readOnly, error = null)
                }
            }.onFailure { e ->
                _uiState.update { it.copy(error = e.message) }
            }
        }
    }

    fun send() {
        val threadId = _uiState.value.threadId ?: return
        val text = _uiState.value.draft.trim()
        if (text.isEmpty() || _uiState.value.readOnly) return
        if (!networkMonitor.isOnline()) {
            _uiState.update { it.copy(error = "Consult requires an internet connection") }
            return
        }
        viewModelScope.launch {
            _uiState.update {
                it.copy(
                    isSending = true,
                    draft = "",
                    messages = it.messages + ConsultMessageUi("user", text),
                    error = null,
                )
            }
            runCatching {
                val reply = dictationApiClient.consultChat(threadId, text)
                _uiState.update {
                    it.copy(
                        isSending = false,
                        messages = it.messages + ConsultMessageUi("assistant", reply),
                    )
                }
            }.onFailure { e ->
                _uiState.update { it.copy(isSending = false, error = e.message) }
            }
        }
    }
}
