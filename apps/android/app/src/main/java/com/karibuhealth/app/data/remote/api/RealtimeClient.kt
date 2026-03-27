package com.karibuhealth.app.data.remote.api

import android.util.Log
import com.karibuhealth.app.BuildConfig
import com.karibuhealth.app.data.local.datastore.AuthTokenStore
import com.karibuhealth.app.data.local.db.converter.toEntity
import com.karibuhealth.app.data.local.db.dao.VisitDao
import com.karibuhealth.app.data.remote.dto.VisitDto
import com.karibuhealth.app.util.NetworkMonitor
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.serialization.json.*
import okhttp3.*
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

enum class RealtimeConnectionState { DISCONNECTED, CONNECTING, CONNECTED }

/**
 * Lightweight Supabase Realtime client using OkHttp WebSocket.
 *
 * Subscribes to the 'queue-updates' broadcast channel to receive
 * live queue changes. Falls back to polling via PullSyncManager
 * when the WebSocket is disconnected.
 *
 * Protocol: Supabase Realtime uses Phoenix channels over WebSocket.
 * Messages follow the format: [join_ref, ref, topic, event, payload]
 */
@Singleton
class RealtimeClient @Inject constructor(
    private val authTokenStore: AuthTokenStore,
    private val visitDao: VisitDao,
    private val networkMonitor: NetworkMonitor,
    private val json: Json,
) {
    companion object {
        private const val TAG = "RealtimeClient"
        private const val HEARTBEAT_INTERVAL_MS = 30_000L
        private const val RECONNECT_DELAY_MS = 5_000L
    }

    private var webSocket: WebSocket? = null
    private var heartbeatJob: Job? = null
    private var reconnectJob: Job? = null
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var messageRef = 0
    private var clinicId: String? = null

    private val _connectionState = MutableStateFlow(RealtimeConnectionState.DISCONNECTED)
    val connectionState: StateFlow<RealtimeConnectionState> = _connectionState

    fun connect(clinicId: String) {
        this.clinicId = clinicId
        if (_connectionState.value == RealtimeConnectionState.CONNECTING ||
            _connectionState.value == RealtimeConnectionState.CONNECTED) return

        _connectionState.value = RealtimeConnectionState.CONNECTING

        scope.launch {
            val token = authTokenStore.getToken() ?: BuildConfig.SUPABASE_ANON_KEY
            val wsUrl = BuildConfig.SUPABASE_URL
                .replace("https://", "wss://")
                .replace("http://", "ws://") +
                "/realtime/v1/websocket?apikey=${BuildConfig.SUPABASE_ANON_KEY}&vsn=1.0.0"

            val client = OkHttpClient.Builder()
                .readTimeout(0, TimeUnit.MILLISECONDS) // No timeout for WebSocket
                .build()

            val request = Request.Builder()
                .url(wsUrl)
                .header("Authorization", "Bearer $token")
                .build()

            webSocket = client.newWebSocket(request, object : WebSocketListener() {
                override fun onOpen(webSocket: WebSocket, response: Response) {
                    Log.d(TAG, "WebSocket connected")
                    _connectionState.value = RealtimeConnectionState.CONNECTED
                    joinQueueChannel(webSocket, clinicId)
                    startHeartbeat(webSocket)
                }

                override fun onMessage(webSocket: WebSocket, text: String) {
                    handleMessage(text)
                }

                override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                    Log.d(TAG, "WebSocket closing: $code $reason")
                    webSocket.close(1000, null)
                }

                override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                    Log.d(TAG, "WebSocket closed: $code")
                    onDisconnected()
                }

                override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                    Log.e(TAG, "WebSocket failure: ${t.message}")
                    onDisconnected()
                }
            })
        }
    }

    fun disconnect() {
        heartbeatJob?.cancel()
        reconnectJob?.cancel()
        webSocket?.close(1000, "Client disconnect")
        webSocket = null
        _connectionState.value = RealtimeConnectionState.DISCONNECTED
    }

    private fun joinQueueChannel(ws: WebSocket, clinicId: String) {
        // Join the realtime:queue-updates channel
        val joinMsg = buildJsonObject {
            put("topic", "realtime:queue-updates")
            put("event", "phx_join")
            put("payload", buildJsonObject {
                put("config", buildJsonObject {
                    put("broadcast", buildJsonObject {
                        put("self", false)
                    })
                })
            })
            put("ref", "${++messageRef}")
        }
        ws.send(json.encodeToString(JsonObject.serializer(), joinMsg))
        Log.d(TAG, "Joined queue-updates channel for clinic $clinicId")
    }

    private fun startHeartbeat(ws: WebSocket) {
        heartbeatJob?.cancel()
        heartbeatJob = scope.launch {
            while (isActive) {
                delay(HEARTBEAT_INTERVAL_MS)
                val heartbeat = buildJsonObject {
                    put("topic", "phoenix")
                    put("event", "heartbeat")
                    put("payload", buildJsonObject {})
                    put("ref", "${++messageRef}")
                }
                ws.send(json.encodeToString(JsonObject.serializer(), heartbeat))
            }
        }
    }

    private fun handleMessage(text: String) {
        try {
            val msg = json.decodeFromString(JsonObject.serializer(), text)
            val event = msg["event"]?.jsonPrimitive?.contentOrNull ?: return
            val topic = msg["topic"]?.jsonPrimitive?.contentOrNull ?: return

            when {
                topic == "realtime:queue-updates" && event == "broadcast" -> {
                    val payload = msg["payload"]?.jsonObject ?: return
                    val type = payload["type"]?.jsonPrimitive?.contentOrNull
                    Log.d(TAG, "Queue broadcast: type=$type")

                    // The broadcast payload contains the updated visit data
                    val visitData = payload["payload"]?.jsonObject
                    if (visitData != null) {
                        scope.launch {
                            try {
                                val visitDto = json.decodeFromJsonElement(VisitDto.serializer(), visitData)
                                visitDao.upsert(visitDto.toEntity(isSynced = true))
                                Log.d(TAG, "Queue update applied: visit ${visitDto.id}")
                            } catch (e: Exception) {
                                Log.w(TAG, "Failed to parse queue broadcast: ${e.message}")
                            }
                        }
                    }
                }
                event == "phx_reply" -> {
                    val status = msg["payload"]?.jsonObject?.get("status")?.jsonPrimitive?.contentOrNull
                    Log.d(TAG, "Channel reply: $topic status=$status")
                }
                event == "phx_error" -> {
                    Log.e(TAG, "Channel error on $topic")
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to parse realtime message: ${e.message}")
        }
    }

    private fun onDisconnected() {
        _connectionState.value = RealtimeConnectionState.DISCONNECTED
        heartbeatJob?.cancel()

        // Auto-reconnect with delay
        reconnectJob?.cancel()
        reconnectJob = scope.launch {
            delay(RECONNECT_DELAY_MS)
            if (networkMonitor.isOnline() && clinicId != null) {
                Log.d(TAG, "Attempting reconnect...")
                connect(clinicId!!)
            }
        }
    }
}
