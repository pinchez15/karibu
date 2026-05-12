package com.karibuhealth.app.data.remote.api

import com.karibuhealth.app.data.remote.dto.*
import okhttp3.RequestBody
import okhttp3.ResponseBody
import retrofit2.Response
import retrofit2.http.*

interface SupabaseApi {

    // Staff
    @GET("staff")
    suspend fun getStaff(
        @Query("clerk_user_id") clerkUserId: String,
        @Query("is_active") isActive: String = "eq.true",
        @Query("select") select: String = "*",
    ): List<StaffDto>

    // Clinics
    @GET("clinics")
    suspend fun getClinic(
        @Query("id") id: String,
        @Query("select") select: String = "*",
    ): List<ClinicDto>

    // Patients
    @GET("patients")
    suspend fun getPatients(
        @Query("clinic_id") clinicId: String,
        @Query("select") select: String = "*",
        @Query("order") order: String = "display_name.asc",
    ): List<PatientDto>

    @GET("patients")
    suspend fun lookupPatient(
        @Query("clinic_id") clinicId: String,
        @Query("whatsapp_number") whatsappNumber: String,
        @Query("select") select: String = "*",
    ): List<PatientDto>

    @POST("patients")
    suspend fun createPatient(@Body patient: PatientCreateDto): List<PatientDto>

    // Visits
    @GET("visits")
    suspend fun getVisits(
        @Query("clinic_id") clinicId: String,
        @Query("visit_date") visitDate: String,
        @Query("select") select: String = "*",
        @Query("order") order: String = "checked_in_at.desc",
    ): List<VisitDto>

    @GET("visits")
    suspend fun getVisitById(
        @Query("id") id: String,
        @Query("select") select: String = "*",
    ): List<VisitDto>

    // Visit creation goes through the SECURITY DEFINER RPC instead of a direct
    // INSERT — direct inserts were returning 404 from PostgREST's INSERT-with-
    // RETURNING flow even with Prefer: return=minimal.
    @POST("rpc/rpc_create_visit")
    suspend fun rpcCreateVisit(@Body request: VisitCreateRpcDto): Response<ResponseBody>

    @PATCH("visits")
    suspend fun updateVisit(
        @Query("id") id: String,
        @Body update: Map<String, @JvmSuppressWildcards Any?>,
    ): List<VisitDto>

    // Provider Notes
    @GET("provider_notes")
    suspend fun getProviderNote(
        @Query("visit_id") visitId: String,
        @Query("select") select: String = "*",
    ): List<ProviderNoteDto>

    // Patient Notes
    @GET("patient_notes")
    suspend fun getPatientNote(
        @Query("visit_id") visitId: String,
        @Query("select") select: String = "*",
    ): List<PatientNoteDto>

    // Payments
    @POST("payments")
    suspend fun createPayment(@Body payment: PaymentCreateDto): List<PaymentDto>

    // Queue RPCs (SECURITY DEFINER -- bypass RLS)
    @POST("rpc/check_in_patient")
    suspend fun checkInPatient(@Body request: Map<String, @JvmSuppressWildcards Any?>): Response<ResponseBody>

    @POST("rpc/assign_to_nurse")
    suspend fun assignToNurse(@Body request: Map<String, @JvmSuppressWildcards Any?>): Response<ResponseBody>

    @POST("rpc/mark_ready_for_doctor")
    suspend fun markReadyForDoctor(@Body request: Map<String, @JvmSuppressWildcards Any?>): Response<ResponseBody>

    @POST("rpc/claim_patient")
    suspend fun claimPatient(@Body request: Map<String, @JvmSuppressWildcards Any?>): Response<ResponseBody>

    @POST("rpc/start_visit_self_triage")
    suspend fun startVisitSelfTriage(@Body request: Map<String, @JvmSuppressWildcards Any?>): Response<ResponseBody>

    @POST("rpc/complete_visit_queue")
    suspend fun completeVisitQueue(@Body request: Map<String, @JvmSuppressWildcards Any?>): Response<ResponseBody>

    @POST("rpc/get_clinic_queue")
    suspend fun getClinicQueue(@Body request: Map<String, @JvmSuppressWildcards Any?>): Response<ResponseBody>

    // Offline-first foundation (migration 029) RPCs
    @POST("rpc/rpc_upsert_provider_note")
    suspend fun rpcUpsertProviderNote(@Body request: ProviderNoteUpsertDto): Response<ResponseBody>

    // Migration 039 lifecycle RPCs: senior clinicians can sign / amend /
    // void notes. SECURITY DEFINER on the server; role checks live there.
    @POST("rpc/rpc_sign_provider_note")
    suspend fun rpcSignProviderNote(@Body request: SignProviderNoteRequest): Response<Unit>

    @POST("rpc/rpc_amend_provider_note")
    suspend fun rpcAmendProviderNote(@Body request: AmendProviderNoteRequest): Response<Unit>

    @POST("rpc/rpc_void_provider_note")
    suspend fun rpcVoidProviderNote(@Body request: VoidProviderNoteRequest): Response<Unit>

    @POST("rpc/rpc_upsert_patient_note_summary")
    suspend fun rpcUpsertPatientNoteSummary(@Body request: PatientNoteSummaryUpsertDto): Response<ResponseBody>

    @POST("rpc/rpc_insert_patient_vitals")
    suspend fun rpcInsertPatientVitals(@Body request: PatientVitalsCreateDto): Response<ResponseBody>

    @POST("rpc/rpc_mark_documentation_complete")
    suspend fun rpcMarkDocumentationComplete(@Body request: MarkDocumentationCompleteDto): Response<ResponseBody>

    @POST("rpc/rpc_upsert_visit_clinical_summary")
    suspend fun rpcUpsertVisitClinicalSummary(@Body request: VisitClinicalSummaryUpsertDto): Response<ResponseBody>

    // Migration 038 fuzzy patient search RPCs. SECURITY DEFINER on the server,
    // so they require a Clerk JWT (attached by AuthInterceptor) and validate
    // staff membership before returning rows.
    @POST("rpc/rpc_find_duplicate_candidates")
    suspend fun rpcFindDuplicateCandidates(
        @Body request: FindDuplicateCandidatesRequest,
    ): List<DuplicateCandidateDto>

    @POST("rpc/rpc_search_patients")
    suspend fun rpcSearchPatients(
        @Body request: SearchPatientsRequest,
    ): List<DuplicateCandidateDto>

    // Migration 040: patient timeline + per-field latest vitals. Both RPCs are
    // SECURITY DEFINER on the server and validate Clerk-authenticated callers
    // against staff membership before returning rows.
    @POST("rpc/rpc_get_patient_timeline")
    suspend fun rpcGetPatientTimeline(
        @Body request: GetPatientTimelineRequest,
    ): List<PatientTimelineEventDto>

    // Returns a single-row table; PostgREST still serializes it as a JSON array.
    @POST("rpc/rpc_get_patient_latest_vitals")
    suspend fun rpcGetPatientLatestVitals(
        @Body request: GetPatientLatestVitalsRequest,
    ): List<PatientLatestVitalsDto>

    // Migration 041 worklist RPCs. All seven are SECURITY DEFINER on the
    // server and validate the Clerk-authenticated caller against the staff
    // table for the requested clinic before returning rows.
    @POST("rpc/rpc_worklist_needs_vitals")
    suspend fun rpcWorklistNeedsVitals(@Body request: WorklistRequest): List<NeedsVitalsRow>

    @POST("rpc/rpc_worklist_needs_clinician")
    suspend fun rpcWorklistNeedsClinician(@Body request: WorklistRequest): List<NeedsClinicianRow>

    @POST("rpc/rpc_worklist_needs_lab")
    suspend fun rpcWorklistNeedsLab(@Body request: WorklistClinicOnlyRequest): List<NeedsLabRow>

    @POST("rpc/rpc_worklist_needs_pharmacy")
    suspend fun rpcWorklistNeedsPharmacy(@Body request: WorklistClinicOnlyRequest): List<NeedsPharmacyRow>

    @POST("rpc/rpc_worklist_needs_payment")
    suspend fun rpcWorklistNeedsPayment(@Body request: WorklistClinicOnlyRequest): List<NeedsPaymentRow>

    @POST("rpc/rpc_worklist_my_drafts")
    suspend fun rpcWorklistMyDrafts(@Body request: MyDraftsRequest): List<MyDraftsRow>

    @POST("rpc/rpc_worklist_care_tasks")
    suspend fun rpcWorklistCareTasks(@Body request: CareTasksWorklistRequest): List<CareTaskRow>
}
