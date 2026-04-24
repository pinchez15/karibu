package com.karibuhealth.app.util

import android.content.Context
import android.util.Log
import com.karibuhealth.app.BuildConfig
import com.posthog.PostHog
import com.posthog.android.PostHogAndroid
import com.posthog.android.PostHogAndroidConfig
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class Analytics @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    companion object {
        private const val TAG = "Analytics"
    }

    fun initialize() {
        val apiKey = BuildConfig.POSTHOG_API_KEY
        if (apiKey.isBlank()) {
            Log.w(TAG, "PostHog API key not set, analytics disabled")
            return
        }

        val config = PostHogAndroidConfig(
            apiKey = apiKey,
            host = BuildConfig.POSTHOG_HOST,
        ).apply {
            captureApplicationLifecycleEvents = true
            captureDeepLinks = false
            captureScreenViews = true
            debug = BuildConfig.DEBUG
        }

        PostHogAndroid.setup(context, config)
        Log.d(TAG, "PostHog initialized")
    }

    fun identify(clerkUserId: String, properties: Map<String, Any> = emptyMap()) {
        PostHog.identify(clerkUserId, properties, null)
    }

    fun capture(event: String, properties: Map<String, Any> = emptyMap()) {
        PostHog.capture(event, null, properties, null, null, null)
    }

    fun reset() {
        PostHog.reset()
    }

    // Events emitted by the dictation-first product. The recording/upload/
    // consent events from the ambient era have been removed.
    object Events {
        const val VISIT_CREATED = "visit_created"
        const val DICTATION_STARTED = "dictation_started"
        const val DICTATION_COMPLETED = "dictation_completed"
        const val NOTE_APPROVED = "note_approved"
        const val NOTE_REJECTED = "note_rejected"
        const val PAYMENT_RECORDED = "payment_recorded"
        const val PATIENT_CHECKED_IN = "patient_checked_in"
        const val PATIENT_CREATED = "patient_created"
        const val SYNC_COMPLETED = "sync_completed"
        const val SYNC_FAILED = "sync_failed"
        const val OFFLINE_OPERATION = "offline_operation"
        const val NETWORK_RECONNECTED = "network_reconnected"
    }
}
