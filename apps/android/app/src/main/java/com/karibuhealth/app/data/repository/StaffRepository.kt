package com.karibuhealth.app.data.repository

import com.karibuhealth.app.data.local.db.converter.toDomain
import com.karibuhealth.app.data.local.db.converter.toEntity
import com.karibuhealth.app.data.local.db.dao.ClinicDao
import com.karibuhealth.app.data.local.db.dao.StaffDao
import com.karibuhealth.app.data.local.datastore.AuthTokenStore
import com.karibuhealth.app.data.remote.api.SupabaseApi
import com.karibuhealth.app.domain.model.Clinic
import com.karibuhealth.app.domain.model.Staff
import com.karibuhealth.app.util.NetworkMonitor
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class StaffRepository @Inject constructor(
    private val staffDao: StaffDao,
    private val clinicDao: ClinicDao,
    private val supabaseApi: SupabaseApi,
    private val authTokenStore: AuthTokenStore,
    private val networkMonitor: NetworkMonitor,
) {
    fun getStaffByClerkId(clerkUserId: String): Flow<Staff?> =
        staffDao.getByClerkUserId(clerkUserId).map { it?.toDomain() }

    suspend fun getStaffByClerkIdOnce(clerkUserId: String): Staff? =
        staffDao.getByClerkUserIdOnce(clerkUserId)?.toDomain()

    /**
     * Best-effort lookup of the current signed-in staff row by id. Reads the
     * staffId cached in AuthTokenStore (set by [fetchAndCacheStaff]) and the
     * staff row in Room. Returns null if the device hasn't completed Clerk
     * onboarding yet.
     */
    suspend fun getCurrentStaff(): Staff? {
        val staffId = authTokenStore.getStaffId() ?: return null
        return staffDao.getByIdOnce(staffId)?.toDomain()
    }

    fun getClinic(clinicId: String): Flow<Clinic?> =
        clinicDao.getById(clinicId).map { it?.toDomain() }

    suspend fun fetchAndCacheStaff(clerkUserId: String): Staff? {
        if (!networkMonitor.isOnline()) {
            return getStaffByClerkIdOnce(clerkUserId)
        }

        return try {
            val staffList = supabaseApi.getStaff("eq.$clerkUserId")
            val staffDto = staffList.firstOrNull() ?: return null
            val entity = staffDto.toEntity()
            staffDao.upsert(entity)
            authTokenStore.saveStaffId(entity.id)
            authTokenStore.saveClinicId(entity.clinicId)

            try {
                val clinics = supabaseApi.getClinic("eq.${entity.clinicId}")
                clinics.firstOrNull()?.let { clinicDao.upsert(it.toEntity()) }
            } catch (_: Exception) {}

            entity.toDomain()
        } catch (_: Exception) {
            getStaffByClerkIdOnce(clerkUserId)
        }
    }
}
