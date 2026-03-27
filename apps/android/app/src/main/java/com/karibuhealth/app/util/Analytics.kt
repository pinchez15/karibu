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
        PostHog.identify(
            clerkUserId,
            properties = properties,
        )
    }

    fun capture(event: String, properties: Map<String, Any> = emptyMap()) {
        PostHog.capture(event, properties = properties)
    }

    fun reset() {
        PostHog.reset()
    }

    // Pre-defined events matching Expo app's analytics
    object Events {
        const val VISIT_CREATED = "visit_created"
        const val CONSENT_GRANTED = "consent_granted"
        const val RECORDING_STARTED = "recording_started"
        const val RECORDING_STOPPED = "recording_stopped"
        const val UPLOAD_STARTED = "upload_started"
        const val UPLOAD_COMPLETED = "upload_completed"
        const val UPLOAD_FAILED = "upload_failed"
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
