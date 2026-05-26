package com.karibuhealth.app.util

import android.content.Context
import android.media.MediaRecorder
import android.os.Build
import android.util.Log
import java.io.File

/**
 * Single-session dictation recorder. Captures one continuous M4A per tap
 * (start → stop), then hands the finalized file to /dictate for batch
 * transcription. One recording maps to one note section (see ViewModel).
 */
class DictationRecorder(private val context: Context) {

    companion object {
        private const val TAG = "DictationRecorder"
    }

    private var recorder: MediaRecorder? = null
    private var currentFile: File? = null

    private val dictationDir: File
        get() = File(context.cacheDir, "dictation").also { it.mkdirs() }

    /** @return false if a session is already in progress. */
    fun start(): Boolean {
        if (recorder != null) {
            Log.w(TAG, "start called while already recording")
            return false
        }

        val file = File(dictationDir, "session_${System.currentTimeMillis()}.m4a")
        val r = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            MediaRecorder(context)
        } else {
            @Suppress("DEPRECATION")
            MediaRecorder()
        }

        return try {
            r.apply {
                setAudioSource(MediaRecorder.AudioSource.VOICE_RECOGNITION)
                setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
                setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
                setAudioSamplingRate(16_000)
                setAudioChannels(1)
                setAudioEncodingBitRate(64_000)
                setOutputFile(file.absolutePath)
                prepare()
                start()
            }
            recorder = r
            currentFile = file
            true
        } catch (e: Exception) {
            Log.w(TAG, "Failed to start recording: ${e.message}")
            try {
                r.release()
            } catch (_: Exception) {
            }
            file.delete()
            false
        }
    }

    /**
     * Finalize the current session and return the M4A file, or null if empty
     * or nothing was recording. Caller uploads then deletes the file.
     */
    fun stop(): File? {
        val file = currentFile
        releaseRecorder()
        if (file == null || !file.exists() || file.length() == 0L) {
            file?.delete()
            return null
        }
        return file
    }

    /** Abandon in-progress audio without returning a file. */
    fun cancel() {
        releaseRecorder()
        currentFile?.delete()
        currentFile = null
    }

    fun clearCache() {
        cancel()
        dictationDir.listFiles()?.forEach { it.delete() }
    }

    private fun releaseRecorder() {
        try {
            recorder?.apply {
                stop()
                release()
            }
        } catch (e: Exception) {
            Log.w(TAG, "releaseRecorder: ${e.message}")
        }
        recorder = null
    }
}
