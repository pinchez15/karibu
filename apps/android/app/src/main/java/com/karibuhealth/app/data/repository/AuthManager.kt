package com.karibuhealth.app.data.repository

import android.util.Log
import com.karibuhealth.app.BuildConfig
import com.karibuhealth.app.data.local.datastore.AuthTokenStore
import com.karibuhealth.app.util.Analytics
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AuthManager @Inject constructor(
    private val authTokenStore: AuthTokenStore,
    private val staffRepository: StaffRepository,
    private val analytics: Analytics,
) {
    companion object {
        private const val TAG = "AuthManager"
        const val SUPABASE_JWT_TEMPLATE = "supabase"
    }

    val isAuthenticated: Flow<Boolean> = authTokenStore.observeToken().map { it != null }

    suspend fun onClerkSignIn(clerkUserId: String, supabaseToken: String) {
        Log.d(TAG, "Clerk sign-in: $clerkUserId")

        authTokenStore.saveClerkUserId(clerkUserId)
        authTokenStore.saveToken(supabaseToken)

        val staff = staffRepository.fetchAndCacheStaff(clerkUserId)
        if (staff != null) {
            // No staff name in logs (beta testers run debug builds; logcat is
            // world-readable to other debuggable tooling).
            if (BuildConfig.DEBUG) {
                Log.d(TAG, "Staff loaded: role=${staff.role}, clinic=${staff.clinicId}")
            }
            analytics.identify(clerkUserId, mapOf(
                "role" to staff.role.name,
                "clinic_id" to staff.clinicId,
                "display_name" to staff.displayName,
            ))
        } else {
            Log.w(TAG, "No staff record found for clerk user: $clerkUserId")
        }
    }

    suspend fun refreshToken(supabaseToken: String) {
        authTokenStore.saveToken(supabaseToken)
    }

    suspend fun signOut() {
        Log.d(TAG, "Signing out")
        analytics.reset()
        authTokenStore.clear()
    }

    suspend fun getClerkUserId(): String? = authTokenStore.getClerkUserId()
    suspend fun getStaffId(): String? = authTokenStore.getStaffId()
    suspend fun getClinicId(): String? = authTokenStore.getClinicId()
}
