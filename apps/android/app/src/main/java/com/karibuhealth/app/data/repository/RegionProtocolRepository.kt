package com.karibuhealth.app.data.repository

import com.karibuhealth.app.data.local.datastore.OutbreakProtocolStore
import com.karibuhealth.app.data.remote.api.SupabaseApi
import com.karibuhealth.app.data.remote.dto.ActiveProtocolsRequest
import com.karibuhealth.app.util.NetworkMonitor
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Pulls the clinic's active region-outbreak protocols and caches them locally,
 * mirroring [CatalogRepository]: offline-first (keep the cache on failure), and
 * the local store is the single source of truth the UI gates CDS on.
 */
@Singleton
class RegionProtocolRepository @Inject constructor(
    private val supabaseApi: SupabaseApi,
    private val outbreakProtocolStore: OutbreakProtocolStore,
    private val networkMonitor: NetworkMonitor,
) {
    fun observeActiveProtocols(): Flow<Set<String>> =
        outbreakProtocolStore.observeActiveProtocols()

    fun observeIsOnProtocol(slug: String): Flow<Boolean> =
        outbreakProtocolStore.observeIsOnProtocol(slug)

    suspend fun isOnProtocol(slug: String): Boolean =
        outbreakProtocolStore.isOnProtocol(slug)

    /**
     * Refresh the cached protocol set for [clinicId]. No-op offline (the cache
     * is kept so a clinic stays on protocol until it can next reach the server).
     */
    suspend fun refreshProtocols(clinicId: String) {
        if (!networkMonitor.isOnline()) return
        withContext(Dispatchers.IO) {
            try {
                val rows = supabaseApi.rpcActiveProtocolsForClinic(ActiveProtocolsRequest(clinicId))
                outbreakProtocolStore.setActiveProtocols(
                    rows.map { it.protocol.lowercase() }.toSet(),
                )
            } catch (_: Exception) {
                // Offline-first: keep the cached protocol set.
            }
        }
    }
}
