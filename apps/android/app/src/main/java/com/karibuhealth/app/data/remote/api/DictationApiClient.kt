package com.karibuhealth.app.data.remote.api

import com.karibuhealth.app.BuildConfig
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton

// Calls the dictation edge functions directly with multipart / JSON bodies.
// Sits alongside the Retrofit-based SupabaseApi (which handles PostgREST
// CRUD) — kept separate because audio uploads need a multipart body and JSON
// posts to functions/v1/* don't fit Retrofit's PostgREST conventions cleanly.
@Singleton
class DictationApiClient @Inject constructor(
    private val httpClient: OkHttpClient,
    private val json: Json,
) {
    @Serializable
    private data class DictateResponse(val text: String = "")

    @Serializable
    private data class SubmitDictationBody(val visit_id: String, val transcript: String)

    @Serializable
    private data class SubmitDictationResponse(val success: Boolean = false, val status: String? = null)

    /**
     * POST a recorded audio file to /functions/v1/dictate. Returns the Whisper
     * transcript on success.
     *
     * @throws DictationException with a user-friendly message on failure.
     */
    suspend fun transcribeChunk(audioFile: File): String {
        if (!audioFile.exists() || audioFile.length() == 0L) {
            throw DictationException("Recording file is empty.")
        }

        val mediaType = "audio/m4a".toMediaType()
        val body = MultipartBody.Builder()
            .setType(MultipartBody.FORM)
            .addFormDataPart(
                name = "audio",
                filename = audioFile.name,
                body = audioFile.asRequestBody(mediaType),
            )
            .build()

        val request = Request.Builder()
            .url("${BuildConfig.SUPABASE_URL}/functions/v1/dictate")
            .post(body)
            .build()

        val response = httpClient.newCall(request).execute()
        response.use {
            val raw = it.body?.string().orEmpty()
            if (!it.isSuccessful) {
                throw DictationException("Transcription failed (${it.code}): ${raw.take(200)}")
            }
            return runCatching {
                json.decodeFromString(DictateResponse.serializer(), raw).text
            }.getOrElse {
                throw DictationException("Transcription returned malformed response.")
            }
        }
    }

    /**
     * POST the final transcript to /functions/v1/submit-dictation. The edge
     * function persists provider_notes.transcript and dispatches the Inngest
     * 'note.dictated' workflow that produces the SOAP note + diagnoses.
     */
    suspend fun submitDictation(visitId: String, transcript: String) {
        val payload = json.encodeToString(
            SubmitDictationBody.serializer(),
            SubmitDictationBody(visit_id = visitId, transcript = transcript),
        )
        post("submit-dictation", payload)
    }

    /**
     * Approve the AI-structured note. The visit moves to 'sent' and the
     * printed receipt becomes available on the web dashboard.
     */
    suspend fun approveDictation(visitId: String) {
        val payload = json.encodeToString(
            VisitIdBody.serializer(),
            VisitIdBody(visit_id = visitId),
        )
        post("approve-dictation", payload)
    }

    /**
     * Reject the AI-structured note. The visit goes back to 'pending'; the
     * AI artifacts are cleared but the original transcript is kept so the
     * clinician can edit it on the dictation screen and re-submit.
     */
    suspend fun rejectDictation(visitId: String, reason: String? = null) {
        val payload = json.encodeToString(
            RejectDictationBody.serializer(),
            RejectDictationBody(visit_id = visitId, reason = reason),
        )
        post("reject-dictation", payload)
    }

    @Serializable
    private data class VisitIdBody(val visit_id: String)

    @Serializable
    private data class RejectDictationBody(val visit_id: String, val reason: String? = null)

    private fun post(endpoint: String, jsonBody: String) {
        val request = Request.Builder()
            .url("${BuildConfig.SUPABASE_URL}/functions/v1/$endpoint")
            .post(jsonBody.toRequestBody("application/json".toMediaType()))
            .build()

        val response = httpClient.newCall(request).execute()
        response.use {
            val raw = it.body?.string().orEmpty()
            if (!it.isSuccessful) {
                throw DictationException("$endpoint failed (${it.code}): ${raw.take(200)}")
            }
            val parsed = runCatching {
                json.decodeFromString(SubmitDictationResponse.serializer(), raw)
            }.getOrNull()
            if (parsed?.success != true) {
                throw DictationException("$endpoint failed: server did not confirm.")
            }
        }
    }
}

class DictationException(message: String) : RuntimeException(message)
