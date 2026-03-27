package com.karibuhealth.app.ui.recording

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.work.WorkManager
import com.karibuhealth.app.data.local.datastore.AuthTokenStore
import com.karibuhealth.app.data.local.db.dao.AudioUploadDao
import com.karibuhealth.app.data.local.db.entity.AudioUploadEntity
import com.karibuhealth.app.data.repository.AudioRecorderManager
import com.karibuhealth.app.data.repository.RecordingState
import com.karibuhealth.app.data.repository.VisitRepository
import com.karibuhealth.app.data.sync.AudioUploadWorker
import com.karibuhealth.app.domain.model.AudioUploadStatus
import com.karibuhealth.app.util.Analytics
import com.karibuhealth.app.util.RecordingRecovery
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import java.time.Instant
import java.util.UUID
import javax.inject.Inject

@HiltViewModel
class RecordingViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val audioRecorderManager: AudioRecorderManager,
    private val visitRepository: VisitRepository,
    private val audioUploadDao: AudioUploadDao,
    private val authTokenStore: AuthTokenStore,
    private val analytics: Analytics,
    private val recordingRecovery: RecordingRecovery,
) : ViewModel() {

    val recordingState: StateFlow<RecordingState> = audioRecorderManager.state

    private val _durationSeconds = MutableStateFlow(0)
    val durationSeconds: StateFlow<Int> = _durationSeconds.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    val isStorageLow: Boolean get() = recordingRecovery.isStorageLow()

    private var durationJob: kotlinx.coroutines.Job? = null

    fun hasMicrophonePermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            context, Manifest.permission.RECORD_AUDIO
        ) == PackageManager.PERMISSION_GRANTED
    }

    fun startRecording() {
        if (!hasMicrophonePermission()) {
            _error.value = "Microphone permission is required"
            return
        }

        try {
            audioRecorderManager.startRecording()
            startDurationTimer()
            analytics.capture(Analytics.Events.RECORDING_STARTED)
        } catch (e: Exception) {
            _error.value = "Failed to start recording: ${e.message}"
        }
    }

    fun pauseRecording() {
        audioRecorderManager.pauseRecording()
        durationJob?.cancel()
    }

    fun resumeRecording() {
        audioRecorderManager.resumeRecording()
        startDurationTimer()
    }

    fun stopRecording(visitId: String) {
        durationJob?.cancel()
        val filePath = audioRecorderManager.stopRecording() ?: return
        val durationSec = (audioRecorderManager.getCurrentDurationMs() / 1000).toInt()
        val fileSizeBytes = audioRecorderManager.getFileSizeBytes() ?: 0L

        viewModelScope.launch {
            // Update visit with local audio path
            visitRepository.updateAudioLocal(visitId, filePath)

            // Create audio upload record locally
            val audioUploadId = UUID.randomUUID().toString()
            val now = Instant.now().toString()
            audioUploadDao.upsert(
                AudioUploadEntity(
                    id = audioUploadId,
                    visitId = visitId,
                    storagePath = null,
                    fileSizeBytes = fileSizeBytes,
                    durationSeconds = durationSec,
                    mimeType = "audio/m4a",
                    uploadedAt = null,
                    transcriptionStartedAt = null,
                    transcriptionCompletedAt = null,
                    status = AudioUploadStatus.pending.name,
                    errorMessage = null,
                    createdAt = now,
                    updatedAt = now,
                    localFilePath = filePath,
                )
            )

            analytics.capture(Analytics.Events.RECORDING_STOPPED, mapOf(
                "visit_id" to visitId,
                "duration_seconds" to durationSec,
                "file_size_bytes" to fileSizeBytes,
            ))
            analytics.capture(Analytics.Events.UPLOAD_STARTED, mapOf("visit_id" to visitId))

            // Enqueue upload worker
            val uploadRequest = AudioUploadWorker.buildRequest(
                visitId = visitId,
                audioUploadId = audioUploadId,
                localFilePath = filePath,
            )
            WorkManager.getInstance(context).enqueue(uploadRequest)
        }
    }

    fun cancelRecording() {
        durationJob?.cancel()
        audioRecorderManager.cancelRecording()
        _durationSeconds.value = 0
    }

    private fun startDurationTimer() {
        durationJob?.cancel()
        durationJob = viewModelScope.launch {
            while (true) {
                delay(1000)
                _durationSeconds.value = (audioRecorderManager.getCurrentDurationMs() / 1000).toInt()
            }
        }
    }

    override fun onCleared() {
        super.onCleared()
        durationJob?.cancel()
    }
}
