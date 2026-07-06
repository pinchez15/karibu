package com.karibuhealth.app.util

import android.net.NetworkCapabilities
import io.mockk.every
import io.mockk.mockk
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * WP2 test #7: the connectivity gate. `isConnected` is true whenever a network
 * advertises internet capability, even before Android's validation probe passes;
 * `isOnline` keeps the stricter validated semantics for UI quality display.
 */
class NetworkMonitorTest {

    private fun caps(
        internet: Boolean,
        validated: Boolean,
    ): NetworkCapabilities = mockk {
        every { hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) } returns internet
        every { hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED) } returns validated
        every { hasTransport(any()) } returns false
        every { linkDownstreamBandwidthKbps } returns 200
        every { linkUpstreamBandwidthKbps } returns 100
    }

    @Test
    fun `internet but not validated is connected but not online`() {
        val status = NetworkMonitor.statusFromCapabilities(caps(internet = true, validated = false))

        assertTrue("connected when INTERNET present", status.isConnected)
        assertFalse("not online until VALIDATED", status.isOnline)
    }

    @Test
    fun `internet and validated is both connected and online`() {
        val status = NetworkMonitor.statusFromCapabilities(caps(internet = true, validated = true))

        assertTrue(status.isConnected)
        assertTrue(status.isOnline)
    }

    @Test
    fun `no capabilities is neither connected nor online`() {
        val status = NetworkMonitor.statusFromCapabilities(null)

        assertFalse(status.isConnected)
        assertFalse(status.isOnline)
    }

    @Test
    fun `capabilities without internet are not connected`() {
        val status = NetworkMonitor.statusFromCapabilities(caps(internet = false, validated = false))

        assertFalse(status.isConnected)
        assertFalse(status.isOnline)
    }
}
