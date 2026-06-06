package com.karibuhealth.app.data.local.datastore

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringSetPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

private val Context.outbreakDataStore by preferencesDataStore(name = "outbreak_prefs")

/**
 * Locally cached set of region-outbreak protocols this clinic is currently ON
 * (e.g. "ebola"), pulled from `rpc_active_protocols_for_clinic` on refresh.
 *
 * Kept in DataStore (not Room) deliberately: it is a tiny, frequently-read flag
 * set with no relational queries, and avoiding a schema change keeps this layer
 * additive while the larger CDS work lands on another branch. Cached so that an
 * offline clinic stays on protocol until it can next reach the server.
 */
@Singleton
class OutbreakProtocolStore @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    companion object {
        private val KEY_ACTIVE_PROTOCOLS = stringSetPreferencesKey("active_protocol_slugs")
    }

    /** All protocol slugs the clinic is currently on. */
    fun observeActiveProtocols(): Flow<Set<String>> =
        context.outbreakDataStore.data.map { it[KEY_ACTIVE_PROTOCOLS] ?: emptySet() }

    suspend fun getActiveProtocols(): Set<String> =
        context.outbreakDataStore.data.first()[KEY_ACTIVE_PROTOCOLS] ?: emptySet()

    /** True when the clinic is on the named protocol (case-insensitive). */
    suspend fun isOnProtocol(slug: String): Boolean =
        getActiveProtocols().any { it.equals(slug, ignoreCase = true) }

    fun observeIsOnProtocol(slug: String): Flow<Boolean> =
        observeActiveProtocols().map { set -> set.any { it.equals(slug, ignoreCase = true) } }

    suspend fun setActiveProtocols(slugs: Set<String>) {
        context.outbreakDataStore.edit { prefs ->
            prefs[KEY_ACTIVE_PROTOCOLS] = slugs.map { it.lowercase() }.toSet()
        }
    }

    suspend fun clear() {
        context.outbreakDataStore.edit { it.clear() }
    }
}
