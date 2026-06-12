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
 *
 * Audio is patient data: recordings live in `filesDir` (NOT `cacheDir`,
 * which the OS may purge under storage pressure) and are deleted only on
 * successful transcription, explicit discard, or age-based pruning — never
 * just because an upload failed.
 */
class DictationRecorder(private val context: Context) {

    companion object {
        private const val TAG = "DictationRecorder"
        private const val FILE_PREFIX = "rec_"
    }

    private var recorder: MediaRecorder? = null
    private var currentFile: File? = null

    private val dictationDir: File
        get() = File(context.filesDir, "dictation").also { it.mkdirs() }

    /**
     * @param label embedded in the filename (e.g. "<visitId>_<section>") so a
     *   kept recording can be matched back to its visit + section after
     *   process death. Must not contain path separators.
     * @return false if a session is already in progress.
     */
    fun start(label: String? = null): Boolean {
        if (recorder != null) {
            Log.w(TAG, "start called while already recording")
            return false
        }

        val safeLabel = label?.replace(Regex("[^A-Za-z0-9_-]"), "").orEmpty()
        val file = File(dictationDir, "$FILE_PREFIX${safeLabel}_${System.currentTimeMillis()}.m4a")
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
     * or nothing was recording. The caller deletes the file ONLY after a
     * successful transcription (or an explicit user discard).
     */
    fun stop(): File? {
        val file = currentFile
        releaseRecorder()
        currentFile = null
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

    /**
     * Kept recordings whose filename label starts with [labelPrefix]
     * (typically a visit id), newest first. Used to re-offer transcription
     * of audio that survived a failed upload / process death.
     */
    fun findKeptRecordings(labelPrefix: String): List<File> {
        val safePrefix = labelPrefix.replace(Regex("[^A-Za-z0-9_-]"), "")
        return dictationDir.listFiles()
            ?.filter { it.name.startsWith("$FILE_PREFIX$safePrefix") && it != currentFile }
            ?.sortedByDescending { it.lastModified() }
            .orEmpty()
    }

    /** Best-effort cleanup of recordings nobody rescued. */
    fun pruneOlderThan(maxAgeMs: Long) {
        val cutoff = System.currentTimeMillis() - maxAgeMs
        dictationDir.listFiles()
            ?.filter { it != currentFile && it.lastModified() < cutoff }
            ?.forEach { it.delete() }
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
