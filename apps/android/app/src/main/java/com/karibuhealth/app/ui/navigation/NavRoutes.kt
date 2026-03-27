package com.karibuhealth.app.ui.navigation

import kotlinx.serialization.Serializable

sealed interface NavRoute {
    @Serializable data object Auth : NavRoute
    @Serializable data object Home : NavRoute
    @Serializable data object Queue : NavRoute
    @Serializable data object CheckIn : NavRoute
    @Serializable data object NewVisit : NavRoute
    @Serializable data class Consent(val patientId: String) : NavRoute
    @Serializable data class Recording(val visitId: String) : NavRoute
    @Serializable data class VisitDetails(val visitId: String) : NavRoute
    @Serializable data class Processing(val visitId: String) : NavRoute
    @Serializable data class Review(val visitId: String) : NavRoute
    @Serializable data class Payment(val visitId: String) : NavRoute
    @Serializable data class Success(val visitId: String) : NavRoute
}
