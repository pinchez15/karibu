package com.karibuhealth.app.data.local.datastore

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import javax.inject.Inject
import javax.inject.Singleton

private val Context.recentPatientsDataStore by preferencesDataStore(name = "recent_patients")

@Serializable
data class RecentPatientEntry(
    val patientId: String,
    val patientName: String,
    val visitId: String? = null,
    val touchedAtEpochMs: Long = System.currentTimeMillis(),
)

@Singleton
class RecentPatientsStore @Inject constructor(
    @ApplicationContext private val context: Context,
    private val json: Json,
) {
    private val key = stringPreferencesKey("entries_json")

    val recentPatients: Flow<List<RecentPatientEntry>> =
        context.recentPatientsDataStore.data.map { prefs ->
            val raw = prefs[key] ?: return@map emptyList()
            runCatching {
                json.decodeFromString<List<RecentPatientEntry>>(raw)
            }.getOrDefault(emptyList())
        }

    suspend fun recordTouch(patientId: String, patientName: String, visitId: String? = null) {
        context.recentPatientsDataStore.edit { prefs ->
            val current = runCatching {
                prefs[key]?.let { json.decodeFromString<List<RecentPatientEntry>>(it) } ?: emptyList()
            }.getOrDefault(emptyList())
            val next = listOf(
                RecentPatientEntry(
                    patientId = patientId,
                    patientName = patientName,
                    visitId = visitId,
                    touchedAtEpochMs = System.currentTimeMillis(),
                ),
            ) + current.filter { it.patientId != patientId }
            prefs[key] = json.encodeToString(next.take(MAX_ENTRIES))
        }
    }

    private companion object {
        const val MAX_ENTRIES = 8
    }
}
