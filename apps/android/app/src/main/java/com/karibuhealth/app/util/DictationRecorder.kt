package com.karibuhealth.app.util

import android.content.Context
import android.media.MediaRecorder
import android.os.Build
import android.util.Log
import java.io.File

// Minimal MediaRecorder wrapper for short-form dictation chunks. Each chunk
// is a single MediaRecorder lifecycle: prepare -> start -> stop -> file. The
// caller uploads the file to /functions/v1/dictate, gets text back, and may
// start another chunk to append more dictation.
//
// No foreground service. Dictation is always foreground, screen-on, phone in
// the clinician's hand — if they background the app the chunk in flight ends
// and they restart from there.
class DictationRecorder(private val context: Context) {

    companion object {
        private const val TAG = "DictationRecorder"
    }

    private var recorder: MediaRecorder? = null
    private var outputFile: File? = null

    private val dictationDir: File
        get() = File(context.cacheDir, "dictation").also { it.mkdirs() }

    fun start(): File {
        val file = File(dictationDir, "chunk_${System.currentTimeMillis()}.m4a")
        outputFile = file

        val r = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            MediaRecorder(context)
        } else {
            @Suppress("DEPRECATION")
            MediaRecorder()
        }

        r.apply {
            setAudioSource(MediaRecorder.AudioSource.MIC)
            setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            setAudioSamplingRate(16_000)        // Whisper accepts 16kHz, smaller upload
            setAudioChannels(1)                 // mono — voice only
            setAudioEncodingBitRate(64_000)     // good enough for speech
            setOutputFile(file.absolutePath)
            prepare()
            start()
        }

        recorder = r
        Log.d(TAG, "Dictation chunk started: ${file.name}")
        return file
    }

    /** Stops the current chunk and returns its file. Returns null if not recording. */
    fun stop(): File? {
        val file = outputFile
        try {
            recorder?.apply {
                stop()
                release()
            }
        } catch (e: Exception) {
            // stop() can throw RuntimeException if start() never produced any audio
            // (e.g. user tapped stop within milliseconds of start). Log and let
            // the caller see a 0-byte file, which DictationApiClient rejects.
            Log.w(TAG, "Recorder stop threw: ${e.message}")
        }
        recorder = null
        outputFile = null
        Log.d(TAG, "Dictation chunk stopped: ${file?.name}, ${file?.length() ?: 0} bytes")
        return file
    }

    /** Cancel and discard the in-flight chunk file. */
    fun cancel() {
        try {
            recorder?.apply {
                stop()
                release()
            }
        } catch (_: Exception) {}
        recorder = null
        outputFile?.delete()
        outputFile = null
    }

    /** Best-effort cleanup of all on-disk dictation chunks. */
    fun clearCache() {
        dictationDir.listFiles()?.forEach { it.delete() }
    }
}
