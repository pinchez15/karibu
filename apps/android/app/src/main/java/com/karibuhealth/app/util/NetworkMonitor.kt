package com.karibuhealth.app.util

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class NetworkMonitor @Inject constructor(
    private val context: Context,
) {
    enum class ConnectionQuality { offline, poor, fair, good }

    data class ConnectionStatus(
        val isOnline: Boolean,
        /**
         * True when a network with `NET_CAPABILITY_INTERNET` is present, even if
         * Android's validation probe (`NET_CAPABILITY_VALIDATED`) has not (yet)
         * passed. This is the honest "should we even try a request?" signal on
         * congested links where validation flaps; `isOnline` (validated) is kept
         * for UI connection-quality display only. See WP2 D1.
         */
        val isConnected: Boolean,
        val quality: ConnectionQuality,
        val downKbps: Int,
        val upKbps: Int,
        val transportLabel: String,
    ) {
        val isGoodForAi: Boolean
            get() = isOnline && quality != ConnectionQuality.poor

        val barsLabel: String
            get() = when (quality) {
                ConnectionQuality.offline -> "0 bars"
                ConnectionQuality.poor -> "1 bar"
                ConnectionQuality.fair -> "2 bars"
                ConnectionQuality.good -> "3 bars"
            }
    }

    private val connectivityManager =
        context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

    fun isOnline(): Boolean {
        return currentStatus().isOnline
    }

    /**
     * WP2 D1: the sync engine gates on this, NOT [isOnline]. Any network that
     * advertises internet capability is worth an attempt — the request itself
     * is the only honest connectivity probe. A failed attempt costs one backoff;
     * a skipped attempt (because validation flapped) costs the clinic a day.
     */
    fun isConnected(): Boolean {
        return currentStatus().isConnected
    }

    fun currentStatus(): ConnectionStatus {
        val network = connectivityManager.activeNetwork
        val capabilities = network?.let(connectivityManager::getNetworkCapabilities)
        return statusFromCapabilities(capabilities)
    }

    val isOnlineFlow: Flow<Boolean> = callbackFlow {
        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                trySend(currentStatus().isOnline)
            }

            override fun onLost(network: Network) {
                trySend(false)
            }

            override fun onCapabilitiesChanged(
                network: Network,
                capabilities: NetworkCapabilities,
            ) {
                trySend(statusFromCapabilities(capabilities).isOnline)
            }
        }

        val request = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build()

        connectivityManager.registerNetworkCallback(request, callback)

        // Emit initial state
        trySend(isOnline())

        awaitClose {
            connectivityManager.unregisterNetworkCallback(callback)
        }
    }.distinctUntilChanged()

    val connectionStatusFlow: Flow<ConnectionStatus> = callbackFlow {
        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                trySend(currentStatus())
            }

            override fun onLost(network: Network) {
                trySend(currentStatus())
            }

            override fun onCapabilitiesChanged(
                network: Network,
                capabilities: NetworkCapabilities,
            ) {
                trySend(statusFromCapabilities(capabilities))
            }
        }

        val request = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build()

        connectivityManager.registerNetworkCallback(request, callback)
        trySend(currentStatus())

        awaitClose {
            connectivityManager.unregisterNetworkCallback(callback)
        }
    }.distinctUntilChanged()

    companion object {
        /**
         * Pure mapping from raw capabilities to a [ConnectionStatus]. Lives on the
         * companion (not the instance) so it is unit-testable without a Context.
         * WP2 test #7 exercises this directly.
         */
        internal fun statusFromCapabilities(capabilities: NetworkCapabilities?): ConnectionStatus {
            if (capabilities == null) {
                return ConnectionStatus(
                    isOnline = false,
                    isConnected = false,
                    quality = ConnectionQuality.offline,
                    downKbps = 0,
                    upKbps = 0,
                    transportLabel = "No signal",
                )
            }

            val hasInternet =
                capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            // WP2 D1: connected == internet-capable, regardless of validation.
            val connected = hasInternet
            val validated =
                hasInternet &&
                    capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)

            val downKbps = capabilities.linkDownstreamBandwidthKbps
            val upKbps = capabilities.linkUpstreamBandwidthKbps
            val transportLabel = when {
                capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "Wi-Fi"
                capabilities.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "Mobile data"
                capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "Ethernet"
                else -> "Network"
            }

            val quality = when {
                !validated -> ConnectionQuality.offline
                capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ||
                    capabilities.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> ConnectionQuality.good
                downKbps < 700 || upKbps < 250 -> ConnectionQuality.poor
                downKbps < 2_000 || upKbps < 700 -> ConnectionQuality.fair
                else -> ConnectionQuality.good
            }

            return ConnectionStatus(
                isOnline = validated,
                isConnected = connected,
                quality = quality,
                downKbps = downKbps,
                upKbps = upKbps,
                transportLabel = transportLabel,
            )
        }
    }
}
