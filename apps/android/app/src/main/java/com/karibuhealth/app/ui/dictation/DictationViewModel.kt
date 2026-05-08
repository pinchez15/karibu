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
import com.karibuhealth.app.data.repository.VisitRepository
import com.karibuhealth.app.data.sync.SyncEngine
import com.karibuhealth.app.ui.auth.ClerkAuthManager
import com.karibuhealth.app.util.Analytics
import com.karibuhealth.app.util.DictationRecorder
import com.karibuhealth.app.util.NetworkMonitor
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
    val isRecording: Boolean = false,
    /** Number of segments currently uploading to Whisper. Drives the "transcribing…" indicator. */
    val pendingChunks: Int = 0,
    val isSubmitting: Boolean = false,
    val isStructuringWithAi: Boolean = false,
    val submitted: Boolean = false,
    val error: String? = null,
    val savedLocally: Boolean = false,
) {
    /** Back-compat alias — true while any chunk is in flight. */
    val isTranscribing: Boolean
        get() = pendingChunks > 0
    val canSubmit: Boolean
        get() = transcript.trim().length >= 10 && !isRecording && !isSubmitting
}

@HiltViewModel
class DictationViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val dictationApi: DictationApiClient,
    private val noteRepository: NoteRepository,
    private val visitRepository: VisitRepository,
    private val syncEngine: SyncEngine,
    private val clerkAuthManager: ClerkAuthManager,
    private val networkMonitor: NetworkMonitor,
    private val analytics: Analytics,
) : ViewModel() {

    private val recorder = DictationRecorder(context)

    private val _uiState = MutableStateFlow(DictationUiState())
    val uiState: StateFlow<DictationUiState> = _uiState.asStateFlow()

    fun load(visitId: String) {
        viewModelScope.launch {
            val existing = noteRepository.getProviderNoteOnce(visitId)
            _uiState.update {
                it.copy(
                    transcript = existing?.transcript.orEmpty(),
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
        if (_uiState.value.isRecording) return

        try {
            recorder.startStreaming { segmentFile ->
                // Each finalized segment gets uploaded to Whisper on a worker
                // thread; the result appends to `transcript` as it lands.
                viewModelScope.launch { transcribeSegment(segmentFile) }
            }
            _uiState.update { it.copy(isRecording = true, error = null) }
            analytics.capture(Analytics.Events.DICTATION_STARTED)
        } catch (e: Exception) {
            _uiState.update { it.copy(error = "Could not start recorder: ${e.message}") }
        }
    }

    fun stopRecording() {
        if (!_uiState.value.isRecording) return
        recorder.stopStreaming()
        _uiState.update { it.copy(isRecording = false) }
    }

    /** Back-compat alias for screens that still call the old name. */
    fun stopRecordingAndTranscribe() = stopRecording()

    private suspend fun transcribeSegment(file: java.io.File) {
        if (file.length() < 1500) {
            file.delete()
            return
        }
        _uiState.update { it.copy(pendingChunks = it.pendingChunks + 1) }
        try {
            val text = withContext(Dispatchers.IO) {
                clerkAuthManager.refreshToken()
                dictationApi.transcribeChunk(file)
            }
            if (text.isNotBlank()) {
                _uiState.update { state ->
                    val trimmedPrev = state.transcript.trimEnd()
                    val combined = if (trimmedPrev.isEmpty()) text.trim()
                    else "$trimmedPrev ${text.trim()}"
                    state.copy(transcript = combined)
                }
            }
        } catch (e: DictationException) {
            // Swallow per-chunk errors — one bad segment shouldn't kill the
            // stream. Surface only if the clinician sees zero text after stop.
            android.util.Log.w("DictationVM", "chunk failed: ${e.message}")
        } catch (e: Exception) {
            android.util.Log.w("DictationVM", "chunk failed: ${e.message}")
        } finally {
            file.delete()
            _uiState.update { it.copy(pendingChunks = (it.pendingChunks - 1).coerceAtLeast(0)) }
        }
    }

    fun updateTranscript(text: String) {
        _uiState.update { it.copy(transcript = text, savedLocally = false) }
    }

    fun onMicrophonePermissionDenied() {
        _uiState.update { it.copy(error = "Microphone permission is required for Whisper recording.") }
    }

    /**
     * Save the visit. Always offline-safe — no AI involvement.
     *
     * Pipeline (each step direct-writes when online + no upstream queue
     * dependency, otherwise queues with a linear `dependsOn` chain):
     *   1. provider_notes.transcript (the clinician's actual words)
     *   2. patient_notes.content (clinician fallback for the receipt; copies
     *      the transcript verbatim so print/pharmacy works without AI)
     *   3. visits.documentation_complete = true (and status pending → sent
     *      atomically server-side, making the visit reachable for payment)
     */
    fun submit(visitId: String) {
        val transcript = _uiState.value.transcript.trim()
        if (transcript.length < 10) {
            _uiState.update { it.copy(error = "Add a bit more to the note before saving.") }
            return
        }

        viewModelScope.launch {
            _uiState.update { it.copy(isSubmitting = true, error = null) }
            try {
                withContext(Dispatchers.IO) {
                    val (_, providerSyncId) = noteRepository.saveNoteAndQueue(
                        visitId = visitId,
                        transcript = transcript,
                        predecessorSyncId = null,
                    )
                    val (_, summarySyncId) = noteRepository.saveSummaryFallback(
                        visitId = visitId,
                        content = transcript,
                        predecessorSyncId = providerSyncId,
                    )
                    visitRepository.markDocumentationComplete(
                        visitId = visitId,
                        predecessorSyncId = summarySyncId ?: providerSyncId,
                    )
                }
                analytics.capture(
                    Analytics.Events.DICTATION_COMPLETED,
                    mapOf(
                        "visit_id" to visitId,
                        "transcript_length" to transcript.length,
                        "mode" to "save",
                    ),
                )
                _uiState.update {
                    it.copy(
                        isSubmitting = false,
                        submitted = true,
                        savedLocally = true,
                    )
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(isSubmitting = false, error = "Could not save: ${e.message}") }
            }
        }
    }

    /**
     * Opt-in: structure the saved note with AI. Fires the existing
     * submit-dictation edge function which dispatches the structure-dictation
     * Inngest workflow. Returns immediately; the workflow runs in the
     * background and writes back to provider_notes.note_content +
     * patient_notes.content + visit_diagnosis_codes.
     *
     * Requires online — tells the user to come back online if not.
     */
    fun structureWithAi(visitId: String) {
        if (_uiState.value.isStructuringWithAi) return
        viewModelScope.launch {
            if (!networkMonitor.isOnline()) {
                _uiState.update {
                    it.copy(error = "AI needs Wi-Fi or data. Try again when you're online.")
                }
                return@launch
            }
            _uiState.update { it.copy(isStructuringWithAi = true, error = null) }
            try {
                withContext(Dispatchers.IO) {
                    val transcript = _uiState.value.transcript.trim()
                    if (transcript.isNotEmpty()) {
                        clerkAuthManager.refreshToken()
                        dictationApi.submitDictation(visitId, transcript)
                    }
                }
                analytics.capture(
                    Analytics.Events.DICTATION_COMPLETED,
                    mapOf("visit_id" to visitId, "mode" to "ai_structure"),
                )
                _uiState.update { it.copy(isStructuringWithAi = false) }
            } catch (e: DictationException) {
                _uiState.update { it.copy(isStructuringWithAi = false, error = e.message) }
            } catch (e: Exception) {
                _uiState.update {
                    it.copy(isStructuringWithAi = false, error = "AI request failed: ${e.message}")
                }
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
