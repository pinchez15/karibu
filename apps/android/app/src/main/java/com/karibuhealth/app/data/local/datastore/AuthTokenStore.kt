package com.karibuhealth.app.data.local.datastore

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

private val Context.authDataStore by preferencesDataStore(name = "auth_prefs")

@Singleton
class AuthTokenStore @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    companion object {
        private val KEY_CLERK_TOKEN = stringPreferencesKey("clerk_supabase_token")
        private val KEY_CLERK_USER_ID = stringPreferencesKey("clerk_user_id")
        private val KEY_STAFF_ID = stringPreferencesKey("staff_id")
        private val KEY_CLINIC_ID = stringPreferencesKey("clinic_id")
        // WP2 D3: wall-clock time the cached token was last fetched, so the
        // sync engine can proactively refresh a token older than 45 min before
        // a batch (Clerk JWTs expire in ~1h).
        private val KEY_TOKEN_FETCHED_AT = longPreferencesKey("clerk_token_fetched_at")
    }

    suspend fun getToken(): String? {
        return context.authDataStore.data.first()[KEY_CLERK_TOKEN]
    }

    fun observeToken(): Flow<String?> {
        return context.authDataStore.data.map { it[KEY_CLERK_TOKEN] }
    }

    suspend fun saveToken(token: String) {
        context.authDataStore.edit { prefs ->
            prefs[KEY_CLERK_TOKEN] = token
            prefs[KEY_TOKEN_FETCHED_AT] = System.currentTimeMillis()
        }
    }

    /** Epoch millis the cached token was last saved, or null if none. */
    suspend fun getTokenFetchedAt(): Long? {
        return context.authDataStore.data.first()[KEY_TOKEN_FETCHED_AT]
    }

    suspend fun getClerkUserId(): String? {
        return context.authDataStore.data.first()[KEY_CLERK_USER_ID]
    }

    fun observeClerkUserId(): Flow<String?> {
        return context.authDataStore.data.map { it[KEY_CLERK_USER_ID] }
    }

    suspend fun saveClerkUserId(userId: String) {
        context.authDataStore.edit { prefs ->
            prefs[KEY_CLERK_USER_ID] = userId
        }
    }

    suspend fun getStaffId(): String? {
        return context.authDataStore.data.first()[KEY_STAFF_ID]
    }

    suspend fun saveStaffId(staffId: String) {
        context.authDataStore.edit { prefs ->
            prefs[KEY_STAFF_ID] = staffId
        }
    }

    suspend fun getClinicId(): String? {
        return context.authDataStore.data.first()[KEY_CLINIC_ID]
    }

    suspend fun saveClinicId(clinicId: String) {
        context.authDataStore.edit { prefs ->
            prefs[KEY_CLINIC_ID] = clinicId
        }
    }

    suspend fun clear() {
        context.authDataStore.edit { it.clear() }
    }
}
