package com.karibuhealth.app.util

import android.content.Context
import android.os.StatFs
import android.util.Log
import com.karibuhealth.app.data.local.db.dao.AudioUploadDao
import com.karibuhealth.app.data.local.db.dao.VisitDao
import com.karibuhealth.app.data.sync.AudioUploadWorker
import androidx.work.WorkManager
import dagger.hilt.android.qualifiers.ApplicationContext
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class RecordingRecovery @Inject constructor(
    @ApplicationContext private val context: Context,
    private val visitDao: VisitDao,
    private val audioUploadDao: AudioUploadDao,
) {
    companion object {
        private const val TAG = "RecordingRecovery"
        private const val MIN_STORAGE_MB = 100 // Warn if less than 100MB free
        private const val MIN_RECORDING_BYTES = 1024 // 1KB minimum to be a valid recording
    }

    /**
     * Check for orphaned recording files that weren't uploaded.
     * This handles the case where the app was killed during recording.
     *
     * Called on app startup.
     */
    suspend fun recoverOrphanedRecordings() {
        val recordingsDir = File(context.filesDir, "recordings")
        if (!recordingsDir.exists()) return

        val files = recordingsDir.listFiles { file ->
            file.extension == "m4a" && file.length() > MIN_RECORDING_BYTES
        } ?: return

        if (files.isEmpty()) return
        Log.d(TAG, "Found ${files.size} recording files to check")

        for (file in files) {
            // Check if this file is referenced by a pending audio upload
            val pendingUploads = audioUploadDao.getPendingUploads()
            val isTracked = pendingUploads.any { it.localFilePath == file.absolutePath }

            if (!isTracked) {
                // Orphaned file -- could be from a killed recording session
                // Check if there's a visit with this audio path
                Log.w(TAG, "Orphaned recording found: ${file.name} (${file.length()} bytes)")

                // Clean up files older than 7 days that aren't tracked
                val ageMs = System.currentTimeMillis() - file.lastModified()
                if (ageMs > 7 * 24 * 60 * 60 * 1000L) {
                    Log.d(TAG, "Deleting stale orphaned recording: ${file.name}")
                    file.delete()
                }
            }
        }
    }

    /**
     * Re-enqueue any pending uploads that don't have active WorkManager tasks.
     * Handles the case where WorkManager jobs were lost.
     */
    suspend fun reEnqueuePendingUploads() {
        val pending = audioUploadDao.getPendingUploads()
        if (pending.isEmpty()) return

        Log.d(TAG, "Re-enqueuing ${pending.size} pending uploads")
        val workManager = WorkManager.getInstance(context)

        for (upload in pending) {
            val localPath = upload.localFilePath ?: continue
            val file = File(localPath)
            if (!file.exists()) {
                Log.w(TAG, "Pending upload file missing: $localPath")
                continue
            }

            val request = AudioUploadWorker.buildRequest(
                visitId = upload.visitId,
                audioUploadId = upload.id,
                localFilePath = localPath,
            )
            workManager.enqueue(request)
            Log.d(TAG, "Re-enqueued upload for visit ${upload.visitId}")
        }
    }

    /**
     * Check available storage space.
     * Returns available MB, or -1 if unable to determine.
     */
    fun getAvailableStorageMb(): Long {
        return try {
            val stat = StatFs(context.filesDir.absolutePath)
            stat.availableBytes / (1024 * 1024)
        } catch (_: Exception) {
            -1
        }
    }

    fun isStorageLow(): Boolean {
        val available = getAvailableStorageMb()
        return available in 0 until MIN_STORAGE_MB
    }

    /**
     * Get total size of cached recordings in MB.
     */
    fun getRecordingsCacheSizeMb(): Long {
        val recordingsDir = File(context.filesDir, "recordings")
        if (!recordingsDir.exists()) return 0
        val totalBytes = recordingsDir.listFiles()?.sumOf { it.length() } ?: 0L
        return totalBytes / (1024 * 1024)
    }

    /**
     * Clear all local recordings that have been successfully uploaded.
     */
    suspend fun clearUploadedRecordings() {
        val recordingsDir = File(context.filesDir, "recordings")
        if (!recordingsDir.exists()) return

        val pendingPaths = audioUploadDao.getPendingUploads().mapNotNull { it.localFilePath }.toSet()
        var cleared = 0

        recordingsDir.listFiles()?.forEach { file ->
            if (file.absolutePath !in pendingPaths) {
                file.delete()
                cleared++
            }
        }

        Log.d(TAG, "Cleared $cleared uploaded recordings")
    }
}
