package com.karibuhealth.app.ui.dictation

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.karibuhealth.app.data.remote.api.DictationApiClient
import com.karibuhealth.app.data.remote.api.DictationException
import com.karibuhealth.app.data.repository.NoteRepository
import com.karibuhealth.app.ui.auth.ClerkAuthManager
import com.karibuhealth.app.util.Analytics
import com.karibuhealth.app.util.DictationRecorder
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import javax.inject.Inject

data class DictationUiState(
    val transcript: String = "",
    val aiMode: Boolean = false,
    val isRecording: Boolean = false,
    val isTranscribing: Boolean = false,
    val isSubmitting: Boolean = false,
    val submitted: Boolean = false,
    val error: String? = null,
    val savedLocally: Boolean = false,
) {
    val canSubmit: Boolean
        get() = transcript.trim().length >= 10 && !isRecording && !isTranscribing && !isSubmitting
}

@HiltViewModel
class DictationViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val dictationApi: DictationApiClient,
    private val noteRepository: NoteRepository,
    private val clerkAuthManager: ClerkAuthManager,
    private val analytics: Analytics,
) : ViewModel() {

    private val recorder = DictationRecorder(context)

    private val _uiState = MutableStateFlow(DictationUiState())
    val uiState: StateFlow<DictationUiState> = _uiState.asStateFlow()

    fun load(visitId: String, aiMode: Boolean) {
        viewModelScope.launch {
            val existing = noteRepository.getProviderNoteOnce(visitId)
            _uiState.update {
                it.copy(
                    transcript = existing?.transcript.orEmpty(),
                    aiMode = aiMode,
                    savedLocally = existing?.transcript?.isNotBlank() == true,
                    submitted = false,
                    error = null,
                )
            }
        }
    }

    fun hasMicrophonePermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            context, Manifest.permission.RECORD_AUDIO,
        ) == PackageManager.PERMISSION_GRANTED
    }

    fun startRecording() {
        if (!hasMicrophonePermission()) {
            _uiState.update { it.copy(error = "Microphone permission is required.") }
            return
        }
        if (_uiState.value.isRecording || _uiState.value.isTranscribing) return

        try {
            recorder.start()
            _uiState.update { it.copy(isRecording = true, error = null) }
            analytics.capture(Analytics.Events.DICTATION_STARTED)
        } catch (e: Exception) {
            _uiState.update { it.copy(error = "Could not start recorder: ${e.message}") }
        }
    }

    fun stopRecordingAndTranscribe() {
        if (!_uiState.value.isRecording) return
        val file = recorder.stop()
        _uiState.update { it.copy(isRecording = false, isTranscribing = file != null) }
        if (file == null) return

        viewModelScope.launch {
            try {
                val text = withContext(Dispatchers.IO) {
                    clerkAuthManager.refreshToken()
                    dictationApi.transcribeChunk(file)
                }
                // Append to existing transcript with a space separator, trimming
                // accidental leading/trailing whitespace from the model output.
                _uiState.update { state ->
                    val joined = listOf(state.transcript.trim(), text.trim())
                        .filter { it.isNotEmpty() }
                        .joinToString(" ")
                    state.copy(transcript = joined, isTranscribing = false)
                }
            } catch (e: DictationException) {
                _uiState.update { it.copy(isTranscribing = false, error = e.message) }
            } catch (e: Exception) {
                _uiState.update { it.copy(isTranscribing = false, error = "Transcription failed: ${e.message}") }
            } finally {
                // Always discard the chunk file once we have the text (or the
                // attempt failed). We never store patient-related audio.
                file.delete()
            }
        }
    }

    fun updateTranscript(text: String) {
        _uiState.update { it.copy(transcript = text, savedLocally = false) }
    }

    fun submit(visitId: String) {
        val transcript = _uiState.value.transcript.trim()
        val aiMode = _uiState.value.aiMode
        if (transcript.length < 10) {
            _uiState.update { it.copy(error = "Dictate a bit more before submitting.") }
            return
        }

        viewModelScope.launch {
            _uiState.update { it.copy(isSubmitting = true, error = null) }
            try {
                withContext(Dispatchers.IO) {
                    noteRepository.saveDraftTranscript(visitId, transcript)
                    if (aiMode) {
                        clerkAuthManager.refreshToken()
                        dictationApi.submitDictation(visitId, transcript)
                    }
                }
                analytics.capture(
                    Analytics.Events.DICTATION_COMPLETED,
                    mapOf(
                        "visit_id" to visitId,
                        "transcript_length" to transcript.length,
                        "mode" to if (aiMode) "ai" else "local",
                    ),
                )
                _uiState.update {
                    it.copy(
                        isSubmitting = false,
                        submitted = true,
                        savedLocally = true,
                    )
                }
            } catch (e: DictationException) {
                _uiState.update { it.copy(isSubmitting = false, error = e.message) }
            } catch (e: Exception) {
                _uiState.update { it.copy(isSubmitting = false, error = "Could not submit: ${e.message}") }
            }
        }
    }

    fun dismissError() {
        _uiState.update { it.copy(error = null) }
    }

    override fun onCleared() {
        super.onCleared()
        recorder.cancel()
        recorder.clearCache()
    }
}
