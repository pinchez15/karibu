package com.karibuhealth.app.ui.navigation

import kotlinx.serialization.Serializable

sealed interface NavRoute {
    @Serializable data object Auth : NavRoute
    @Serializable data object Home : NavRoute
    @Serializable data object Queue : NavRoute
    @Serializable data object CheckIn : NavRoute
    @Serializable data object NewVisit : NavRoute
    @Serializable data class VisitDetails(val visitId: String) : NavRoute
    @Serializable data class Vitals(val visitId: String, val patientId: String) : NavRoute
    @Serializable data class Dictation(val visitId: String, val aiMode: Boolean = false) : NavRoute
    @Serializable data class Review(val visitId: String) : NavRoute
    @Serializable data class Payment(val visitId: String) : NavRoute
    @Serializable data class Success(val visitId: String) : NavRoute
}
