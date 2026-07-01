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
    @Serializable data class Dictation(
        val visitId: String,
        val aiMode: Boolean = false,
        val incorporateSection: String? = null,
        val incorporatePrefill: String? = null,
        val openLabPicker: Boolean = false,
        val openRxPicker: Boolean = false,
    ) : NavRoute
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

    /** Patient-level billing — charges, payments, balances (migrations 076–077). */
    @Serializable data object Billing : NavRoute

    @Serializable data class PatientBill(val patientId: String) : NavRoute

    /** Today's labs, pharmacy, and referrals — clinician action queue. */
    @Serializable data object Orders : NavRoute

    /** HCIII → HCIV referral with printable transfer summary. */
    @Serializable data class Referral(val visitId: String) : NavRoute

    @Serializable data class ConsultChat(val visitId: String) : NavRoute

    // Inpatient ward spine (migration 053). Inpatient = the ward census home;
    // AdmitPatient = the offline admission form; AdmissionChart = one admitted
    // patient's rounds observations chart.
    @Serializable data object Inpatient : NavRoute
    @Serializable data object AdmitPatient : NavRoute
    @Serializable data object WardHandover : NavRoute
    @Serializable data class AdmissionChart(val admissionId: String) : NavRoute

    // ANC registry (migration 059) — maternal-fetal medicine front half.
    @Serializable data object AncRegistry : NavRoute
    @Serializable data object StartPregnancy : NavRoute
    @Serializable data class PregnancyDetail(val pregnancyId: String) : NavRoute

    // HIV/TB program registers (migration 088) — HMIS 106a capture.
    @Serializable data object HivTbRegistry : NavRoute
    @Serializable data object RecordHts : NavRoute
    @Serializable data object RecordHivCare : NavRoute
    @Serializable data object RecordTbEpisode : NavRoute
    @Serializable data class HivCareDetail(val enrollmentId: String) : NavRoute
    @Serializable data class TbEpisodeDetail(val episodeId: String) : NavRoute

    @Serializable data object Onboarding : NavRoute

    /**
     * Legacy route type — **do not wire into EHR NavHost**. Karibu Learn is a
     * separate Android app (`apps/learn-android`), not reachable from Karibu EHR.
     * See `docs/karibu-learn/product-boundary.md`.
     */
    @Serializable data object KaribuLearn : NavRoute
}
