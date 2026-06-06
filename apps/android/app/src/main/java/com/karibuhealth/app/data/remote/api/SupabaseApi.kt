package com.karibuhealth.app.data.remote.api

import com.karibuhealth.app.data.remote.dto.*
import kotlinx.serialization.json.JsonObject
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

    @GET("patients")
    suspend fun getPatientById(
        @Query("id") id: String,
        @Query("select") select: String = "*",
    ): List<PatientDto>

    @POST("rpc/rpc_create_patient")
    suspend fun rpcCreatePatient(@Body request: RpcCreatePatientRequest): Response<ResponseBody>

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

    // Pharmacy stock (read-only cache for offline dispense)
    @GET("pharmacy_stock_items")
    suspend fun getPharmacyStockItems(
        @Query("clinic_id") clinicId: String,
        @Query("active") active: String = "eq.true",
        @Query("select") select: String = "*",
        @Query("order") order: String = "drug_name.asc",
    ): List<PharmacyStockItemDto>

    // Queue RPCs (SECURITY DEFINER -- bypass RLS).
    //
    // Bodies are typed as JsonObject (not Map<String, Any?>) so the
    // kotlinx-serialization Retrofit converter can serialize them. The
    // generic-Map form fails at request build time with "Unable to create
    // @Body converter for java.util.Map<java.lang.String, java.lang.Object>",
    // which surfaces as queue entries that retry forever without ever
    // hitting the network — caller sees "X items pending sync" stuck even
    // though the data lands by other paths.
    @POST("rpc/check_in_patient")
    suspend fun checkInPatient(@Body request: JsonObject): Response<ResponseBody>

    @POST("rpc/assign_to_nurse")
    suspend fun assignToNurse(@Body request: JsonObject): Response<ResponseBody>

    @POST("rpc/mark_ready_for_doctor")
    suspend fun markReadyForDoctor(@Body request: JsonObject): Response<ResponseBody>

    @POST("rpc/claim_patient")
    suspend fun claimPatient(@Body request: JsonObject): Response<ResponseBody>

    @POST("rpc/start_visit_self_triage")
    suspend fun startVisitSelfTriage(@Body request: JsonObject): Response<ResponseBody>

    @POST("rpc/complete_visit_queue")
    suspend fun completeVisitQueue(@Body request: JsonObject): Response<ResponseBody>

    @POST("rpc/get_clinic_queue")
    suspend fun getClinicQueue(@Body request: JsonObject): Response<ResponseBody>

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

    // Migration 044 lifecycle RPCs.
    @POST("rpc/rpc_addend_provider_note")
    suspend fun rpcAddendProviderNote(@Body request: AddendProviderNoteRequest): Response<ResponseBody>

    @POST("rpc/rpc_cosign_provider_note")
    suspend fun rpcCosignProviderNote(@Body request: CosignProviderNoteRequest): Response<Unit>

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

    // AI review suggestions for a visit (migration 033). Read-only on
    // Android for now — the table SELECT RLS scopes to the caller's clinic
    // via get_current_clinic_id(), which works because AuthInterceptor
    // attaches the Clerk JWT.
    @GET("ai_review_suggestions")
    suspend fun getAiReviewSuggestions(
        @Query("visit_id") visitId: String,
        @Query("select") select: String = "id,visit_id,suggestion_type,question,reasoning,confidence,phase,display_tier,citation_ids,clinician_response,created_at",
        @Query("order") order: String = "created_at.asc",
    ): List<AiReviewSuggestionDto>

    @POST("rpc/rpc_record_review_response")
    suspend fun rpcRecordReviewResponse(@Body request: RecordReviewResponseRequest): Response<ResponseBody>

    // EHR pivot (migration 045)
    @POST("rpc/rpc_submit_pharmacy_order")
    suspend fun rpcSubmitPharmacyOrder(@Body request: SubmitPharmacyOrderRequest): Response<ResponseBody>

    @POST("rpc/rpc_record_payment")
    suspend fun rpcRecordPayment(@Body request: RecordPaymentRpcRequest): RecordPaymentRpcResponse

    @POST("rpc/rpc_start_lab")
    suspend fun rpcStartLab(@Body request: StartLabRequest): Response<ResponseBody>

    @POST("rpc/rpc_record_lab_result")
    suspend fun rpcRecordLabResult(@Body request: RecordLabResultRequest): Response<ResponseBody>

    @POST("rpc/rpc_reopen_lab")
    suspend fun rpcReopenLab(@Body request: StartLabRequest): Response<ResponseBody>

    @POST("rpc/rpc_set_dispensing_status")
    suspend fun rpcSetDispensingStatus(@Body request: SetDispensingStatusRequest): Response<ResponseBody>

    @POST("rpc/rpc_record_dispense")
    suspend fun rpcRecordDispense(@Body request: RecordDispenseRequest): Response<ResponseBody>

    // Migration 048 — atomic encounter finalization + clinic catalog.
    @POST("rpc/rpc_finalize_clinical_encounter")
    suspend fun rpcFinalizeClinicalEncounter(@Body request: FinalizeClinicalEncounterRequest): Response<ResponseBody>

    @POST("rpc/rpc_get_clinic_catalog")
    suspend fun rpcGetClinicCatalog(@Body request: GetClinicCatalogRequest): ClinicCatalogDto

    @POST("rpc/rpc_get_opd_patients_today")
    suspend fun rpcGetOpdPatientsToday(@Body request: GetOpdPatientsTodayRequest): List<OpdPatientTodayDto>

    @POST("rpc/rpc_admit_patient")
    suspend fun rpcAdmitPatient(@Body request: AdmitPatientRequest): String

    // Inpatient ward spine (migration 053).
    @POST("rpc/rpc_admit_patient_v2")
    suspend fun rpcAdmitPatientV2(@Body request: AdmitPatientV2Request): Response<ResponseBody>

    @POST("rpc/rpc_active_admissions")
    suspend fun rpcActiveAdmissions(@Body request: ActiveAdmissionsRequest): List<ActiveAdmissionDto>

    @POST("rpc/rpc_record_admission_observation")
    suspend fun rpcRecordAdmissionObservation(
        @Body request: RecordAdmissionObservationRequest,
    ): Response<ResponseBody>

    @POST("rpc/rpc_admission_observations")
    suspend fun rpcAdmissionObservations(
        @Body request: AdmissionObservationsRequest,
    ): List<AdmissionObservationDto>

    // Inpatient treatment chart (migration 054).
    @POST("rpc/rpc_add_medication_order")
    suspend fun rpcAddMedicationOrder(@Body request: AddMedicationOrderRequest): Response<ResponseBody>

    @POST("rpc/rpc_stop_medication_order")
    suspend fun rpcStopMedicationOrder(@Body request: StopMedicationOrderRequest): Response<ResponseBody>

    @POST("rpc/rpc_record_medication_admin")
    suspend fun rpcRecordMedicationAdmin(@Body request: RecordMedicationAdminRequest): Response<ResponseBody>

    @POST("rpc/rpc_admission_medication_orders")
    suspend fun rpcAdmissionMedicationOrders(
        @Body request: AdmissionMedicationsRequest,
    ): List<MedicationOrderDto>

    @POST("rpc/rpc_admission_medication_admins")
    suspend fun rpcAdmissionMedicationAdmins(
        @Body request: AdmissionMedicationsRequest,
    ): List<MedicationAdministrationDto>

    @POST("rpc/rpc_activate_clinical_protocol")
    suspend fun rpcActivateClinicalProtocol(@Body request: ActivateClinicalProtocolRequest): String

    // Region outbreak protocols (migration 052) — active protocols for this
    // clinic, matched on its district/diocese. Read on refresh to gate CDS.
    @POST("rpc/rpc_active_protocols_for_clinic")
    suspend fun rpcActiveProtocolsForClinic(@Body request: ActiveProtocolsRequest): List<ActiveProtocolDto>

    @POST("rpc/rpc_request_draft_ai_assist")
    suspend fun rpcRequestDraftAiAssist(@Body request: RequestDraftAiAssistRequest): kotlinx.serialization.json.JsonObject

    @GET("visit_critical_alerts")
    suspend fun getVisitCriticalAlerts(
        @Query("visit_id") visitId: String,
        @Query("clinician_response") clinicianResponse: String = "is.null",
        @Query("select") select: String = "*",
    ): List<com.karibuhealth.app.data.remote.dto.VisitCriticalAlertDto>

    @POST("rpc/rpc_upsert_critical_alert")
    suspend fun rpcUpsertCriticalAlert(
        @Body request: com.karibuhealth.app.data.remote.dto.UpsertCriticalAlertRequest,
    ): Response<ResponseBody>

    @POST("rpc/rpc_record_critical_alert_response")
    suspend fun rpcRecordCriticalAlertResponse(
        @Body request: com.karibuhealth.app.data.remote.dto.RecordCriticalAlertResponseRequest,
    ): Response<ResponseBody>

    @POST("rpc/rpc_get_cme_modules")
    suspend fun rpcGetCmeModules(): Response<ResponseBody>

    @POST("rpc/rpc_get_cme_module_detail")
    suspend fun rpcGetCmeModuleDetail(
        @Body body: Map<String, String>,
    ): kotlinx.serialization.json.JsonObject

    @POST("rpc/rpc_create_referral")
    suspend fun rpcCreateReferral(
        @Body request: com.karibuhealth.app.data.remote.dto.CreateReferralRequest,
    ): Response<ResponseBody>

    @POST("rpc/rpc_list_referrals_today")
    suspend fun rpcListReferralsToday(
        @Body request: com.karibuhealth.app.data.remote.dto.ListReferralsTodayRequest,
    ): List<com.karibuhealth.app.data.remote.dto.ReferralTodayRowDto>
}
