package com.karibuhealth.app.ui.onboarding.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class OnboardingManifest(
    val version: Int = 1,
    val title: String = "",
    val subtitle: String = "",
    val modules: List<OnboardingModule> = emptyList(),
)

@Serializable
data class OnboardingModule(
    val id: String,
    val title: String,
    val subtitle: String,
    @SerialName("simulated_role") val simulatedRole: String,
    @SerialName("sort_order") val sortOrder: Int,
    @SerialName("case_id") val caseId: String,
    @SerialName("pack_id") val packId: String,
    @SerialName("coach_intro") val coachIntro: String,
    @SerialName("android_primary") val androidPrimary: Boolean = true,
    @SerialName("web_bonus") val webBonus: String? = null,
)
