package com.karibuhealth.app.data.sync

import android.content.Context
import android.util.Log
import androidx.hilt.work.HiltWorker
import androidx.work.*
import com.karibuhealth.app.BuildConfig
import com.karibuhealth.app.data.local.datastore.AuthTokenStore
import com.karibuhealth.app.data.local.db.dao.AudioUploadDao
import com.karibuhealth.app.data.local.db.dao.VisitDao
import com.karibuhealth.app.data.local.db.entity.AudioUploadEntity
import com.karibuhealth.app.data.remote.api.SupabaseApi
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.asRequestBody
import java.io.File
import java.time.Instant
import java.util.concurrent.TimeUnit

@HiltWorker
class AudioUploadWorker @AssistedInject constructor(
    @Assisted context: Context,
    @Assisted params: WorkerParameters,
    private val audioUploadDao: AudioUploadDao,
    private val visitDao: VisitDao,
    private val supabaseApi: SupabaseApi,
    private val authTokenStore: AuthTokenStore,
    private val json: Json,
) : CoroutineWorker(context, params) {

    companion object {
        const val KEY_VISIT_ID = "visit_id"
        const val KEY_AUDIO_UPLOAD_ID = "audio_upload_id"
        const val KEY_LOCAL_FILE_PATH = "local_file_path"
        private const val TAG = "AudioUploadWorker"

        fun buildRequest(
            visitId: String,
            audioUploadId: String,
            localFilePath: String,
        ): OneTimeWorkRequest {
            return OneTimeWorkRequestBuilder<AudioUploadWorker>()
                .setInputData(
                    workDataOf(
                        KEY_VISIT_ID to visitId,
                        KEY_AUDIO_UPLOAD_ID to audioUploadId,
                        KEY_LOCAL_FILE_PATH to localFilePath,
                    )
                )
                .setConstraints(
                    Constraints.Builder()
                        .setRequiredNetworkType(NetworkType.CONNECTED)
                        .build()
                )
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                .addTag("audio_upload")
                .addTag("visit_$visitId")
                .build()
        }
    }

    @Serializable
    data class SignedUrlResponse(val signedURL: String)

    override suspend fun doWork(): Result {
        val visitId = inputData.getString(KEY_VISIT_ID) ?: return Result.failure()
        val audioUploadId = inputData.getString(KEY_AUDIO_UPLOAD_ID) ?: return Result.failure()
        val localFilePath = inputData.getString(KEY_LOCAL_FILE_PATH) ?: return Result.failure()

        val file = File(localFilePath)
        if (!file.exists()) {
            Log.e(TAG, "Audio file not found: $localFilePath")
            audioUploadDao.updateStatus(audioUploadId, "failed", Instant.now().toString())
            return Result.failure()
        }

        return try {
            Log.d(TAG, "Starting upload for visit $visitId, file: $localFilePath (${file.length()} bytes)")

            // 1. Update status to uploading
            audioUploadDao.updateStatus(audioUploadId, "uploading", Instant.now().toString())
            visitDao.updateStatus(visitId, "uploading", Instant.now().toString())

            // 2. Get signed upload URL from Supabase Storage
            val token = authTokenStore.getToken() ?: BuildConfig.SUPABASE_ANON_KEY
            val clinicId = authTokenStore.getClinicId() ?: return Result.failure()
            val storagePath = "$clinicId/$visitId/${file.name}"

            val uploadUrl = "${BuildConfig.SUPABASE_URL}/storage/v1/object/audio-recordings/$storagePath"

            // 3. Upload file
            val client = OkHttpClient.Builder()
                .connectTimeout(30, TimeUnit.SECONDS)
                .writeTimeout(5, TimeUnit.MINUTES) // Large files on slow connections
                .readTimeout(60, TimeUnit.SECONDS)
                .build()

            val uploadRequest = Request.Builder()
                .url(uploadUrl)
                .put(file.asRequestBody("audio/m4a".toMediaType()))
                .header("Authorization", "Bearer $token")
                .header("apikey", BuildConfig.SUPABASE_ANON_KEY)
                .header("Content-Type", "audio/m4a")
                .build()

            val uploadResponse = client.newCall(uploadRequest).execute()
            if (!uploadResponse.isSuccessful) {
                throw Exception("Upload failed: ${uploadResponse.code} ${uploadResponse.body?.string()}")
            }

            Log.d(TAG, "File uploaded successfully: $storagePath")

            // 4. Confirm upload in audio_uploads table
            val now = Instant.now().toString()
            supabaseApi.updateAudioUpload(
                id = "eq.$audioUploadId",
                update = mapOf(
                    "status" to "uploaded",
                    "storage_path" to storagePath,
                    "file_size_bytes" to file.length(),
                    "uploaded_at" to now,
                    "updated_at" to now,
                ),
            )

            // 5. Update local state
            audioUploadDao.updateStatus(audioUploadId, "uploaded", now)
            visitDao.updateAudioLocal(visitId, localFilePath, uploaded = true)
            visitDao.updateStatus(visitId, "processing", now)

            // 6. Delete local file after confirmed upload
            if (file.delete()) {
                Log.d(TAG, "Local audio file deleted: $localFilePath")
            }

            // 7. Trigger transcription edge function
            try {
                val transcribeUrl = "${BuildConfig.SUPABASE_URL}/functions/v1/transcribe"
                val transcribeRequest = Request.Builder()
                    .url(transcribeUrl)
                    .post(
                        """{"visit_id":"$visitId"}"""
                            .toByteArray()
                            .let { okhttp3.RequestBody.create("application/json".toMediaType(), it) }
                    )
                    .header("Authorization", "Bearer $token")
                    .header("apikey", BuildConfig.SUPABASE_ANON_KEY)
                    .build()
                client.newCall(transcribeRequest).execute()
                Log.d(TAG, "Transcription triggered for visit $visitId")
            } catch (e: Exception) {
                Log.w(TAG, "Failed to trigger transcription (will be retried): ${e.message}")
            }

            Result.success()
        } catch (e: Exception) {
            Log.e(TAG, "Upload failed for visit $visitId", e)
            audioUploadDao.updateStatus(audioUploadId, "failed", Instant.now().toString())

            if (runAttemptCount < 5) {
                Result.retry()
            } else {
                visitDao.updateStatus(visitId, "error", Instant.now().toString())
                Result.failure()
            }
        }
    }
}
