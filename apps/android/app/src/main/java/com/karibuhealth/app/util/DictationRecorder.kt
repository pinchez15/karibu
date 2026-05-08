package com.karibuhealth.app.util

import android.content.Context
import android.media.MediaRecorder
import android.os.Build
import android.util.Log
import java.io.File

/**
 * Streaming dictation recorder. Captures audio in ~3-second M4A segments,
 * each one finalized with proper headers so the existing /dictate edge
 * function can transcribe it as a complete file. Segments are emitted to
 * [onSegment] as they finalize; the caller uploads them in parallel to
 * Whisper while the next segment is already being captured.
 *
 * MediaRecorder doesn't support truly continuous streaming (no way to flush
 * a partial file with header). The stop+restart loop introduces a tiny
 * audible gap (~150 ms) between segments, which usually lands in the
 * clinician's natural pause between sentences. Words rarely truncate at
 * boundaries.
 *
 * No foreground service. Dictation is always foreground, screen-on, phone
 * in the clinician's hand — if they background the app the loop ends.
 */
class DictationRecorder(private val context: Context) {

    companion object {
        private const val TAG = "DictationRecorder"
        private const val SEGMENT_MS = 3000L
    }

    private var recorder: MediaRecorder? = null
    private var currentFile: File? = null
    private var loopActive = false
    private var loopThread: Thread? = null

    private val dictationDir: File
        get() = File(context.cacheDir, "dictation").also { it.mkdirs() }

    /**
     * Start streaming. [onSegment] is invoked from a background thread for
     * each finalized segment file. The caller is responsible for uploading
     * + deleting the file once transcription is done.
     */
    fun startStreaming(onSegment: (File) -> Unit) {
        if (loopActive) {
            Log.w(TAG, "startStreaming called while already streaming")
            return
        }
        loopActive = true

        loopThread = Thread {
            try {
                while (loopActive) {
                    val file = startSegment() ?: break

                    // Wait the segment duration, then finalize.
                    val segmentStart = System.currentTimeMillis()
                    while (loopActive && System.currentTimeMillis() - segmentStart < SEGMENT_MS) {
                        Thread.sleep(50)
                    }

                    val finalized = stopSegment(file)
                    if (finalized != null && finalized.length() > 0) {
                        try {
                            onSegment(finalized)
                        } catch (e: Exception) {
                            Log.w(TAG, "onSegment callback threw: ${e.message}")
                        }
                    } else {
                        finalized?.delete()
                    }
                }
            } catch (e: InterruptedException) {
                Log.d(TAG, "Streaming loop interrupted")
            } finally {
                releaseRecorder()
                Log.d(TAG, "Streaming loop ended")
            }
        }.also { it.start() }
    }

    /** Stop streaming after the in-flight segment finalizes. */
    fun stopStreaming() {
        loopActive = false
        loopThread?.interrupt()
        loopThread = null
    }

    /** Hard cancel — abandon the current segment without finalizing. */
    fun cancel() {
        loopActive = false
        loopThread?.interrupt()
        loopThread = null
        try {
            recorder?.apply {
                stop()
                release()
            }
        } catch (_: Exception) {
        }
        recorder = null
        currentFile?.delete()
        currentFile = null
    }

    /** Best-effort cleanup of all on-disk dictation chunks. */
    fun clearCache() {
        dictationDir.listFiles()?.forEach { it.delete() }
    }

    // ------------------------------------------------------------------------
    // Internals
    // ------------------------------------------------------------------------

    private fun startSegment(): File? {
        val file = File(dictationDir, "chunk_${System.currentTimeMillis()}.m4a")
        currentFile = file

        val r = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            MediaRecorder(context)
        } else {
            @Suppress("DEPRECATION")
            MediaRecorder()
        }

        return try {
            r.apply {
                setAudioSource(MediaRecorder.AudioSource.MIC)
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
            file
        } catch (e: Exception) {
            Log.w(TAG, "Failed to start segment: ${e.message}")
            try {
                r.release()
            } catch (_: Exception) {
            }
            recorder = null
            currentFile = null
            file.delete()
            null
        }
    }

    private fun stopSegment(file: File): File? {
        return try {
            recorder?.apply {
                stop()
                release()
            }
            recorder = null
            currentFile = null
            file
        } catch (e: Exception) {
            // stop() throws RuntimeException if start() produced no audio. The
            // file may exist but be empty/corrupt — caller checks size.
            Log.w(TAG, "stopSegment threw: ${e.message}")
            try {
                recorder?.release()
            } catch (_: Exception) {
            }
            recorder = null
            currentFile = null
            file
        }
    }

    private fun releaseRecorder() {
        try {
            recorder?.apply {
                stop()
                release()
            }
        } catch (_: Exception) {
        }
        recorder = null
        currentFile = null
    }
}
