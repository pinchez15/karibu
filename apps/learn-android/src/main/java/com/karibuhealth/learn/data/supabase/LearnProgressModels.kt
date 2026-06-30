package com.karibuhealth.learn.data.supabase

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class LearnProgress(
    @SerialName("credits_earned") val creditsEarned: Double = 0.0,
    @SerialName("display_name") val displayName: String? = null,
    val completions: List<CaseCompletionRow> = emptyList(),
)

@Serializable
data class CaseCompletionRow(
    @SerialName("case_id") val caseId: String,
    @SerialName("pack_id") val packId: String,
    val score: Int = 0,
    val total: Int = 0,
    val credit: Double? = null,
    @SerialName("completed_at") val completedAt: String? = null,
)
