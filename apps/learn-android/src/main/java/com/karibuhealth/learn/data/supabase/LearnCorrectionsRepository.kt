package com.karibuhealth.learn.data.supabase

import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.rpc
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
private data class SubmitCorrectionParams(
    @SerialName("p_case_id") val caseId: String,
    @SerialName("p_pack_id") val packId: String,
    @SerialName("p_message") val message: String,
    @SerialName("p_case_level") val caseLevel: Int? = null,
)

class LearnCorrectionsRepository(
    private val authRepository: LearnAuthRepository,
) {
    suspend fun submitCorrection(
        caseId: String,
        packId: String,
        message: String,
        caseLevel: Int? = null,
    ) {
        if (!authRepository.isSignedIn) throw IllegalStateException("Sign in to submit a correction")
        val client = LearnSupabase.client ?: throw IllegalStateException("Supabase is not configured")
        client.postgrest.rpc(
            "rpc_submit_case_correction",
            SubmitCorrectionParams(
                caseId = caseId,
                packId = packId,
                message = message.trim(),
                caseLevel = caseLevel,
            ),
        )
    }
}
