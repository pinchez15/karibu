package com.karibuhealth.learn.data

import android.content.Context
import com.karibuhealth.learn.data.supabase.CaseCompletionRow
import com.karibuhealth.learn.model.mergeCompletion
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.File

/**
 * Device-local case scores — works offline and before sign-in.
 * Supabase sync (when signed in) is the source of truth across devices;
 * local rows are merged on read (best score wins per case).
 */
class LocalProgressStore(
    context: Context,
    private val json: Json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    },
) {
    private val file = File(context.filesDir, "learn/local_progress.json")

    suspend fun loadAll(): Map<String, CaseCompletionRow> = withContext(Dispatchers.IO) {
        if (!file.exists()) return@withContext emptyMap()
        runCatching {
            json.decodeFromString(LocalProgressFile.serializer(), file.readText()).completions
                .associateBy { it.caseId }
        }.getOrDefault(emptyMap())
    }

    suspend fun record(row: CaseCompletionRow) = withContext(Dispatchers.IO) {
        val current = loadAll().toMutableMap()
        current[row.caseId] = mergeCompletion(current[row.caseId], row)
        file.parentFile?.mkdirs()
        file.writeText(
            json.encodeToString(
                LocalProgressFile.serializer(),
                LocalProgressFile(completions = current.values.toList()),
            ),
        )
    }
}

@Serializable
private data class LocalProgressFile(
    val completions: List<CaseCompletionRow> = emptyList(),
)
