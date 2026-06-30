package com.karibuhealth.learn.data.supabase

import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.rpc
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
private data class RecordCompletionParams(
    @SerialName("p_case_id") val caseId: String,
    @SerialName("p_pack_id") val packId: String,
    @SerialName("p_score") val score: Int,
    @SerialName("p_total") val total: Int,
    @SerialName("p_credit") val credit: Double,
)

class LearnProgressRepository(
    private val authRepository: LearnAuthRepository,
) {
    private val supabase get() = LearnSupabase.client

    suspend fun fetchProgress(): LearnProgress {
        if (!authRepository.isSignedIn) throw IllegalStateException("Sign in to view progress")
        val client = supabase ?: throw IllegalStateException("Supabase is not configured")
        return client.postgrest.rpc("rpc_get_my_progress").decodeAs<LearnProgress>()
    }

    suspend fun recordCompletion(
        caseId: String,
        packId: String,
        score: Int,
        total: Int,
        credit: Double,
    ) {
        if (!authRepository.isSignedIn) return
        val client = supabase ?: return
        client.postgrest.rpc(
            "rpc_record_case_completion",
            RecordCompletionParams(
                caseId = caseId,
                packId = packId,
                score = score,
                total = total,
                credit = credit,
            ),
        )
    }
}
