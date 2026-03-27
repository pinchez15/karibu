package com.karibuhealth.app.data.repository

import android.util.Log
import com.karibuhealth.app.data.local.datastore.AuthTokenStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AuthManager @Inject constructor(
    private val authTokenStore: AuthTokenStore,
    private val staffRepository: StaffRepository,
) {
    companion object {
        private const val TAG = "AuthManager"
        const val SUPABASE_JWT_TEMPLATE = "supabase"
    }

    val isAuthenticated: Flow<Boolean> = authTokenStore.observeToken().map { it != null }

    suspend fun onClerkSignIn(clerkUserId: String, supabaseToken: String) {
        Log.d(TAG, "Clerk sign-in: $clerkUserId")

        // Store auth tokens
        authTokenStore.saveClerkUserId(clerkUserId)
        authTokenStore.saveToken(supabaseToken)

        // Fetch and cache staff record
        val staff = staffRepository.fetchAndCacheStaff(clerkUserId)
        if (staff != null) {
            Log.d(TAG, "Staff loaded: ${staff.displayName} (${staff.role}), clinic: ${staff.clinicId}")
        } else {
            Log.w(TAG, "No staff record found for clerk user: $clerkUserId")
        }
    }

    suspend fun refreshToken(supabaseToken: String) {
        authTokenStore.saveToken(supabaseToken)
    }

    suspend fun signOut() {
        Log.d(TAG, "Signing out")
        authTokenStore.clear()
    }

    suspend fun getClerkUserId(): String? = authTokenStore.getClerkUserId()
    suspend fun getStaffId(): String? = authTokenStore.getStaffId()
    suspend fun getClinicId(): String? = authTokenStore.getClinicId()
}
