package com.karibuhealth.app.data.repository

import android.content.Context
import android.media.MediaRecorder
import android.os.Build
import android.os.SystemClock
import android.util.Log
import com.karibuhealth.app.domain.model.Constants
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton

data class RecordingState(
    val isRecording: Boolean = false,
    val isPaused: Boolean = false,
    val durationMs: Long = 0,
    val filePath: String? = null,
)

@Singleton
class AudioRecorderManager @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    companion object {
        private const val TAG = "AudioRecorderManager"
    }

    private var mediaRecorder: MediaRecorder? = null
    private var outputFile: File? = null
    private var recordingStartTime: Long = 0
    private var accumulatedDuration: Long = 0

    private val _state = MutableStateFlow(RecordingState())
    val state: StateFlow<RecordingState> = _state.asStateFlow()

    private val recordingsDir: File
        get() = File(context.filesDir, "recordings").also { it.mkdirs() }

    fun startRecording(): String {
        val file = File(recordingsDir, "recording_${System.currentTimeMillis()}.m4a")
        outputFile = file

        val recorder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            MediaRecorder(context)
        } else {
            @Suppress("DEPRECATION")
            MediaRecorder()
        }

        recorder.apply {
            setAudioSource(MediaRecorder.AudioSource.MIC)
            setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            setAudioSamplingRate(Constants.AudioSettings.SAMPLE_RATE)
            setAudioChannels(Constants.AudioSettings.CHANNELS)
            setAudioEncodingBitRate(Constants.AudioSettings.BIT_RATE)
            setMaxDuration(Constants.AudioSettings.MAX_DURATION_SECONDS * 1000)
            setOutputFile(file.absolutePath)

            setOnInfoListener { _, what, _ ->
                if (what == MediaRecorder.MEDIA_RECORDER_INFO_MAX_DURATION_REACHED) {
                    Log.d(TAG, "Max duration reached")
                    stopRecording()
                }
            }

            prepare()
            start()
        }

        mediaRecorder = recorder
        recordingStartTime = SystemClock.elapsedRealtime()
        accumulatedDuration = 0

        _state.value = RecordingState(
            isRecording = true,
            isPaused = false,
            durationMs = 0,
            filePath = file.absolutePath,
        )

        Log.d(TAG, "Recording started: ${file.absolutePath}")
        return file.absolutePath
    }

    fun pauseRecording() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            mediaRecorder?.pause()
            accumulatedDuration += SystemClock.elapsedRealtime() - recordingStartTime
            _state.value = _state.value.copy(isPaused = true, durationMs = accumulatedDuration)
            Log.d(TAG, "Recording paused")
        }
    }

    fun resumeRecording() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            mediaRecorder?.resume()
            recordingStartTime = SystemClock.elapsedRealtime()
            _state.value = _state.value.copy(isPaused = false)
            Log.d(TAG, "Recording resumed")
        }
    }

    fun stopRecording(): String? {
        val filePath = outputFile?.absolutePath
        try {
            mediaRecorder?.apply {
                stop()
                release()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping recorder", e)
        }

        mediaRecorder = null
        val totalDuration = if (_state.value.isPaused) {
            accumulatedDuration
        } else {
            accumulatedDuration + (SystemClock.elapsedRealtime() - recordingStartTime)
        }

        _state.value = RecordingState(
            isRecording = false,
            isPaused = false,
            durationMs = totalDuration,
            filePath = filePath,
        )

        Log.d(TAG, "Recording stopped: $filePath (${totalDuration}ms)")
        return filePath
    }

    fun cancelRecording() {
        try {
            mediaRecorder?.apply {
                stop()
                release()
            }
        } catch (_: Exception) {}

        mediaRecorder = null
        outputFile?.delete()
        outputFile = null
        _state.value = RecordingState()
        Log.d(TAG, "Recording cancelled")
    }

    fun getCurrentDurationMs(): Long {
        return if (_state.value.isPaused) {
            accumulatedDuration
        } else if (_state.value.isRecording) {
            accumulatedDuration + (SystemClock.elapsedRealtime() - recordingStartTime)
        } else {
            _state.value.durationMs
        }
    }

    fun getFileSizeBytes(): Long? = outputFile?.length()
}
