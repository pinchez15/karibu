package com.karibuhealth.app.data.repository

import com.karibuhealth.app.data.local.db.dao.SyncQueueDao
import com.karibuhealth.app.data.local.db.entity.SyncQueueEntry
import com.karibuhealth.app.util.NetworkMonitor
import com.karibuhealth.app.data.remote.DirectWriteExecutor
import com.karibuhealth.app.data.remote.api.SupabaseApi
import com.karibuhealth.app.data.remote.dto.CompleteCareTaskRequest
import com.karibuhealth.app.data.remote.dto.CreateCareTaskRequest
import com.karibuhealth.app.data.sync.SyncQueueHelper
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class CareTaskRepository @Inject constructor(
    private val supabaseApi: SupabaseApi,
    private val networkMonitor: NetworkMonitor,
    private val directWriteExecutor: DirectWriteExecutor,
    private val syncQueueHelper: SyncQueueHelper,
    private val syncQueueDao: SyncQueueDao,
    private val json: Json,
) {
    suspend fun createCareTask(
        clinicId: String,
        patientId: String,
        taskType: String,
        title: String,
        description: String? = null,
        visitId: String? = null,
        assigneeRole: String? = null,
        dueAt: String? = null,
    ): String? = withContext(Dispatchers.IO) {
        val syncEntryId = UUID.randomUUID().toString()
        val payload = json.encodeToString(
            CreateCareTaskRequest.serializer(),
            CreateCareTaskRequest(
                clinicId = clinicId,
                patientId = patientId,
                taskType = taskType,
                title = title,
                description = description,
                visitId = visitId,
                assigneeRole = assigneeRole,
                dueAt = dueAt,
                clientOpId = syncEntryId,
            ),
        )

        if (networkMonitor.isConnected()) {
            try {
                val response = directWriteExecutor.run {
                    supabaseApi.rpcCreateCareTask(
                        json.decodeFromString(CreateCareTaskRequest.serializer(), payload),
                    )
                }
                if (response.isSuccessful) return@withContext response.body()
            } catch (_: Exception) {
                // queue below
            }
        }

        syncQueueHelper.enqueue(
            SyncQueueEntry(
                id = syncEntryId,
                operationType = "rpc_create_care_task",
                entityType = "care_tasks",
                entityId = patientId,
                payload = payload,
                status = "pending",
                attempts = 0,
                createdAt = System.currentTimeMillis(),
            ),
        )
        syncEntryId
    }

    suspend fun completeCareTask(taskId: String): String? = withContext(Dispatchers.IO) {
        val syncEntryId = UUID.randomUUID().toString()
        val payload = json.encodeToString(
            CompleteCareTaskRequest.serializer(),
            CompleteCareTaskRequest(taskId = taskId, clientOpId = syncEntryId),
        )

        if (networkMonitor.isConnected()) {
            try {
                val response = directWriteExecutor.run {
                    supabaseApi.rpcCompleteCareTask(
                        CompleteCareTaskRequest(taskId = taskId, clientOpId = syncEntryId),
                    )
                }
                if (response.isSuccessful) return@withContext null
            } catch (_: Exception) {
                // queue below
            }
        }

        syncQueueHelper.enqueue(
            SyncQueueEntry(
                id = syncEntryId,
                operationType = "rpc_complete_care_task",
                entityType = "care_tasks",
                entityId = taskId,
                payload = payload,
                status = "pending",
                attempts = 0,
                createdAt = System.currentTimeMillis(),
            ),
        )
        syncEntryId
    }
}
