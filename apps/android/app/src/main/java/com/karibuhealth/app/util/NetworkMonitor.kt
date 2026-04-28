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

    private fun statusFromCapabilities(capabilities: NetworkCapabilities?): ConnectionStatus {
        if (capabilities == null) {
            return ConnectionStatus(
                isOnline = false,
                quality = ConnectionQuality.offline,
                downKbps = 0,
                upKbps = 0,
                transportLabel = "No signal",
            )
        }

        val validated =
            capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
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
            quality = quality,
            downKbps = downKbps,
            upKbps = upKbps,
            transportLabel = transportLabel,
        )
    }
}
