package com.karibuhealth.app.ui.onboarding.data

import android.content.Context
import com.karibuhealth.app.data.local.db.dao.StaffDao
import com.karibuhealth.app.data.local.db.converter.toEntity
import com.karibuhealth.app.data.remote.api.SupabaseApi
import com.karibuhealth.app.data.remote.dto.CompleteOnboardingModuleRequest
import com.karibuhealth.app.data.remote.dto.OnboardingStatusDto
import com.karibuhealth.app.ui.learn.data.LearnRepository
import com.karibuhealth.app.ui.learn.model.LearnCase
import com.karibuhealth.app.ui.onboarding.model.OnboardingManifest
import com.karibuhealth.app.ui.onboarding.model.OnboardingModule
import com.karibuhealth.app.util.NetworkMonitor
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import javax.inject.Inject
import javax.inject.Singleton

data class OnboardingModuleEntry(
    val module: OnboardingModule,
    val completed: Boolean,
    val score: Int? = null,
    val total: Int? = null,
)

@Singleton
class OnboardingRepository @Inject constructor(
    @ApplicationContext private val context: Context,
    private val json: Json,
    private val learnRepository: LearnRepository,
    private val supabaseApi: SupabaseApi,
    private val staffDao: StaffDao,
    private val networkMonitor: NetworkMonitor,
) {
    suspend fun loadManifest(): OnboardingManifest = withContext(Dispatchers.IO) {
        val text = context.assets.open(MANIFEST_PATH).bufferedReader().use { it.readText() }
        json.decodeFromString(OnboardingManifest.serializer(), text)
    }

    suspend fun loadCaseForModule(module: OnboardingModule): LearnCase? {
        val manifest = learnRepository.loadManifest()
        val packInfo = manifest.firstOrNull { it.id == module.packId } ?: return null
        if (!learnRepository.isInstalled(packInfo)) return null
        return learnRepository.loadPack(packInfo).cases.firstOrNull { it.id == module.caseId }
    }

    suspend fun fetchRemoteStatus(): OnboardingStatusDto? {
        if (!networkMonitor.isOnline()) return null
        return try {
            supabaseApi.rpcGetOnboardingStatus()
        } catch (_: Exception) {
            null
        }
    }

    suspend fun completeModule(
        staffId: String,
        moduleId: String,
        score: Int?,
        total: Int?,
    ): Result<Boolean> = withContext(Dispatchers.IO) {
        if (!networkMonitor.isOnline()) {
            return@withContext Result.failure(
                IllegalStateException("Connect to finish training and unlock patients"),
            )
        }
        runCatching {
            val response = supabaseApi.rpcCompleteOnboardingModule(
                CompleteOnboardingModuleRequest(
                    moduleId = moduleId,
                    score = score,
                    total = total,
                ),
            )
            refreshStaffFromServer(staffId)
            response.completed
        }
    }

    private suspend fun refreshStaffFromServer(staffId: String) {
        val clerkId = staffDao.getByIdOnce(staffId)?.clerkUserId ?: return
        runCatching {
            supabaseApi.getStaff("eq.$clerkId").firstOrNull()?.let { staffDao.upsert(it.toEntity()) }
        }
    }

    /** Pull module progress + completion flag from server (shared with web). */
    suspend fun syncFromServer(staffId: String): OnboardingStatusDto? {
        val status = fetchRemoteStatus() ?: return null
        if (status.completed) {
            refreshStaffFromServer(staffId)
        }
        return status
    }

    fun mergeProgress(
        manifest: OnboardingManifest,
        status: OnboardingStatusDto?,
    ): List<OnboardingModuleEntry> {
        val done = status?.progress?.associateBy { it.moduleId }.orEmpty()
        return manifest.modules
            .sortedBy { it.sortOrder }
            .map { module ->
                val row = done[module.id]
                OnboardingModuleEntry(
                    module = module,
                    completed = row != null,
                    score = row?.score,
                    total = row?.total,
                )
            }
    }

    companion object {
        private const val MANIFEST_PATH = "onboarding/manifest.json"
    }
}
