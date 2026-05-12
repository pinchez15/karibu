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

    // Phase 3 — patient-first surfaces. PatientDetail opens the patient
    // timeline screen; PatientNote opens the patient-only note editor (no
    // visit). `source` is optional; the note editor defaults to "general"
    // when null.
    @Serializable data class PatientDetail(val patientId: String) : NavRoute
    @Serializable data class PatientNote(val patientId: String, val source: String? = null) : NavRoute

    // Phase 4 — patient-only vitals capture. Reached from the patient
    // timeline FAB. The existing visit-tied flow (NewPatient → Vitals →
    // Dictation) still uses NavRoute.Vitals above; this route is additive
    // and records vitals against the patient with visit_id=null.
    @Serializable data class PatientVitals(val patientId: String) : NavRoute

    // Phase 5 — operational worklists screen. One surface with seven
    // collapsible sections (one per worklist RPC from migration 041).
    // Reached from the Home app bar; HC III role-specific homes will
    // hand-pick which sections to render but reuse the same RPCs.
    @Serializable data object Worklists : NavRoute
}
