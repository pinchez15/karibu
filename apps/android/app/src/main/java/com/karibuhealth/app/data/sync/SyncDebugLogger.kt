package com.karibuhealth.app.data.sync

import android.content.Context
import android.util.Log
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Session-scoped NDJSON logger for offline sync debugging. Writes to app-private
 * storage so field testers (e.g. Uganda pilot) can share logs without adb.
 */
@Singleton
class SyncDebugLogger @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    companion object {
        private const val TAG = "SyncDebug"
        private const val SESSION_ID = "89c949"
        private const val LOG_FILENAME = "debug-$SESSION_ID.log"
        private const val MAX_BYTES = 512 * 1024
    }

    private val logFile: File
        get() = File(context.filesDir, LOG_FILENAME)

    fun log(
        hypothesisId: String,
        location: String,
        message: String,
        data: Map<String, String?> = emptyMap(),
        runId: String = "pre-fix",
    ) {
        val payload = buildJsonObject {
            put("sessionId", SESSION_ID)
            put("hypothesisId", hypothesisId)
            put("runId", runId)
            put("location", location)
            put("message", message)
            put("timestamp", System.currentTimeMillis())
            put("data", buildJsonObject {
                data.forEach { (k, v) -> put(k, v ?: "") }
            })
        }
        val line = payload.toString()
        Log.d(TAG, line)
        // #region agent log
        try {
            trimIfNeeded()
            logFile.appendText("$line\n")
        } catch (e: Exception) {
            Log.w(TAG, "Failed to append debug log: ${e.message}")
        }
        // #endregion
    }

    fun logFilePath(): String = logFile.absolutePath

    fun readAll(): String = if (logFile.exists()) logFile.readText() else ""

    fun clear() {
        if (logFile.exists()) logFile.delete()
    }

    private fun trimIfNeeded() {
        if (!logFile.exists() || logFile.length() <= MAX_BYTES) return
        val lines = logFile.readLines()
        val keep = lines.takeLast(200)
        logFile.writeText(keep.joinToString("\n", postfix = "\n"))
    }
}
