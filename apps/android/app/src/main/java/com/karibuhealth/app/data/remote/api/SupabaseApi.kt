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

    @GET("visits")
    suspend fun getVisitsByAdmission(
        @Query("admission_id") admissionId: String,
        @Query("clinic_id") clinicId: String,
        @Query("order") order: String = "visit_date.desc",
        @Query("limit") limit: Int = 1,
        @Query("select") select: String = "*",
    ): List<VisitDto>

    // Visit creation goes through the SECURITY DEFINER RPC instead of a direct
    // INSERT — direct inserts were returning 404 from PostgREST's INSERT-with-
    // RETURNING flow even with Prefer: return=minimal. Migration 105 also
    // accepts p_admission_id for inpatient-linked visits (the old direct
    // POST /visits could never be sent: Map<String, Any?> bodies are
    // unserializable by the kotlinx converter).
    @POST("rpc/rpc_create_visit")
    suspend fun rpcCreateVisit(@Body request: VisitCreateRpcDto): Response<ResponseBody>

    // Migration 105: replaces the direct PATCH /visits for lab ordering
    // (same unserializable-Map-body failure — submit_lab_order ops never
    // left the device).
    @POST("rpc/rpc_submit_lab_order")
    suspend fun rpcSubmitLabOrder(@Body request: SubmitLabOrderRequest): Response<ResponseBody>

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

    @GET("lab_stock_items")
    suspend fun getLabStockItems(
        @Query("clinic_id") clinicId: String,
        @Query("active") active: String = "eq.true",
        @Query("select") select: String = "id,test_name,category,unit,quantity_on_hand,low_stock_threshold",
        @Query("order") order: String = "test_name.asc",
    ): List<LabStockItemDto>

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

    @POST("rpc/rpc_check_out_visit")
    suspend fun rpcCheckOutVisit(@Body request: CheckOutVisitRequest): Response<ResponseBody>

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

    @POST("rpc/rpc_start_lab_test")
    suspend fun rpcStartLabTest(@Body request: StartLabTestRequest): Response<ResponseBody>

    @POST("rpc/rpc_record_lab_test_result")
    suspend fun rpcRecordLabTestResult(@Body request: RecordLabTestResultRequest): Response<ResponseBody>

    @POST("rpc/rpc_record_lab_result")
    suspend fun rpcRecordLabResult(@Body request: RecordLabResultRequest): Response<ResponseBody>

    @POST("rpc/rpc_reopen_lab")
    suspend fun rpcReopenLab(@Body request: StartLabRequest): Response<ResponseBody>

    @POST("rpc/rpc_set_dispensing_status")
    suspend fun rpcSetDispensingStatus(@Body request: SetDispensingStatusRequest): Response<ResponseBody>

    @POST("rpc/rpc_record_dispense")
    suspend fun rpcRecordDispense(@Body request: RecordDispenseRequest): Response<ResponseBody>

    @POST("rpc/rpc_start_pharmacy_dispense")
    suspend fun rpcStartPharmacyDispense(@Body request: StartPharmacyDispenseRequest): Response<ResponseBody>

    @POST("rpc/rpc_complete_pharmacy_dispense")
    suspend fun rpcCompletePharmacyDispense(@Body request: CompletePharmacyDispenseRequest): Response<ResponseBody>

    @POST("rpc/rpc_send_pharmacy_back_to_clinician")
    suspend fun rpcSendPharmacyBackToClinician(@Body request: SendPharmacyBackRequest): Response<ResponseBody>

    @POST("rpc/rpc_send_pharmacy_line_back_to_clinician")
    suspend fun rpcSendPharmacyLineBackToClinician(@Body request: SendPharmacyLineBackRequest): Response<ResponseBody>

    @POST("rpc/rpc_create_care_task")
    suspend fun rpcCreateCareTask(@Body request: CreateCareTaskRequest): Response<String>

    @POST("rpc/rpc_complete_care_task")
    suspend fun rpcCompleteCareTask(@Body request: CompleteCareTaskRequest): Response<ResponseBody>

    // PHARM-4/5 (migration 107): read from the view so quantity_dispensed_so_far
    // (SUM of dispense_records.prescribed_equivalent) comes down with the line —
    // the Android dispenser needs it for the remaining-balance default (spec R2).
    @GET("prescription_orders_with_dispensed")
    suspend fun getPrescriptionOrdersForVisits(
        @Query("visit_id") visitIdFilter: String,
        @Query("select") select: String = "*",
        @Query("order") order: String = "sort_order.asc",
    ): List<PrescriptionOrderDto>

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

    // IV drip monitoring (migration 074).
    @POST("rpc/rpc_start_iv_infusion")
    suspend fun rpcStartIvInfusion(@Body request: StartIvInfusionRequest): Response<ResponseBody>

    @POST("rpc/rpc_record_iv_infusion_check")
    suspend fun rpcRecordIvInfusionCheck(@Body request: RecordIvInfusionCheckRequest): Response<ResponseBody>

    @POST("rpc/rpc_stop_iv_infusion")
    suspend fun rpcStopIvInfusion(@Body request: StopIvInfusionRequest): Response<ResponseBody>

    @POST("rpc/rpc_admission_iv_infusions")
    suspend fun rpcAdmissionIvInfusions(@Body request: AdmissionIvRequest): List<IvInfusionDto>

    @POST("rpc/rpc_admission_iv_infusion_checks")
    suspend fun rpcAdmissionIvInfusionChecks(@Body request: AdmissionIvRequest): List<IvInfusionCheckDto>

    // Inpatient discharge (migration 055).
    @POST("rpc/rpc_discharge_admission")
    suspend fun rpcDischargeAdmission(@Body request: DischargeAdmissionRequest): Response<ResponseBody>

    // Maternity delivery (migration 056).
    @POST("rpc/rpc_record_delivery")
    suspend fun rpcRecordDelivery(@Body request: RecordDeliveryRequest): Response<ResponseBody>

    @POST("rpc/rpc_admission_delivery")
    suspend fun rpcAdmissionDelivery(@Body request: AdmissionDeliveryRequest): List<DeliveryDto>

    // Postnatal observations (migration 057).
    @POST("rpc/rpc_record_postnatal_obs")
    suspend fun rpcRecordPostnatalObs(@Body request: RecordPostnatalObsRequest): Response<ResponseBody>

    @POST("rpc/rpc_admission_postnatal_obs")
    suspend fun rpcAdmissionPostnatalObs(
        @Body request: AdmissionPostnatalRequest,
    ): List<PostnatalObservationDto>

    // Inpatient progress notes (migration 058).
    @POST("rpc/rpc_record_admission_note")
    suspend fun rpcRecordAdmissionNote(@Body request: RecordAdmissionNoteRequest): Response<ResponseBody>

    @POST("rpc/rpc_admission_notes")
    suspend fun rpcAdmissionNotes(@Body request: AdmissionNotesRequest): List<AdmissionNoteDto>

    // ANC registry (migration 059).
    @POST("rpc/rpc_start_pregnancy")
    suspend fun rpcStartPregnancy(@Body request: StartPregnancyRequest): Response<ResponseBody>

    @POST("rpc/rpc_record_anc_contact")
    suspend fun rpcRecordAncContact(@Body request: RecordAncContactRequest): Response<ResponseBody>

    @POST("rpc/rpc_active_pregnancies")
    suspend fun rpcActivePregnancies(@Body request: ActivePregnanciesRequest): List<ActivePregnancyDto>

    @POST("rpc/rpc_pregnancy_contacts")
    suspend fun rpcPregnancyContacts(@Body request: PregnancyContactsRequest): List<AncContactDto>

    // HIV/TB program registers (migration 088).
    @POST("rpc/rpc_record_hts_event")
    suspend fun rpcRecordHtsEvent(@Body request: RecordHtsEventRequest): Response<ResponseBody>

    @POST("rpc/rpc_upsert_hiv_care")
    suspend fun rpcUpsertHivCare(@Body request: UpsertHivCareRequest): Response<ResponseBody>

    @POST("rpc/rpc_record_viral_load")
    suspend fun rpcRecordViralLoad(@Body request: RecordViralLoadRequest): Response<ResponseBody>

    @POST("rpc/rpc_upsert_tb_episode")
    suspend fun rpcUpsertTbEpisode(@Body request: UpsertTbEpisodeRequest): Response<ResponseBody>

    @POST("rpc/rpc_recent_hts_events")
    suspend fun rpcRecentHtsEvents(@Body request: RecentHtsRequest): List<HtsEventDto>

    @POST("rpc/rpc_active_hiv_care")
    suspend fun rpcActiveHivCare(@Body request: ClinicOnlyRequest): List<HivCareDto>

    @POST("rpc/rpc_active_tb_episodes")
    suspend fun rpcActiveTbEpisodes(@Body request: ClinicOnlyRequest): List<TbEpisodeDto>

    // Clinic calendar (migration 070 / 073).
    @POST("rpc/rpc_list_appointments")
    suspend fun rpcListAppointments(@Body request: ListAppointmentsRequest): List<AppointmentDto>

    @POST("rpc/rpc_create_appointment")
    suspend fun rpcCreateAppointment(@Body request: CreateAppointmentRequest): Response<ResponseBody>

    @POST("rpc/rpc_update_appointment")
    suspend fun rpcUpdateAppointment(@Body request: UpdateAppointmentRequest): Response<ResponseBody>

    @POST("rpc/rpc_cancel_appointment")
    suspend fun rpcCancelAppointment(@Body request: CancelAppointmentRequest): Response<ResponseBody>

    // Ebola / VHF screening (migration 060).
    @POST("rpc/rpc_record_ebola_screening")
    suspend fun rpcRecordEbolaScreening(@Body request: RecordEbolaScreeningRequest): Response<ResponseBody>

    @POST("rpc/rpc_visit_ebola_screening")
    suspend fun rpcVisitEbolaScreening(@Body request: VisitEbolaScreeningRequest): List<EbolaScreeningDto>

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

    // Billing (migrations 076–077) — patient-level charges and payments.
    @POST("rpc/rpc_billing_patient_balances")
    suspend fun rpcBillingPatientBalances(
        @Body request: WorklistClinicOnlyRequest,
    ): List<BillingPatientBalanceRow>

    @POST("rpc/rpc_patient_balance")
    suspend fun rpcPatientBalance(
        @Body request: PatientBalanceRequest,
    ): List<PatientBalanceRow>

    @GET("charges")
    suspend fun getChargesForPatient(
        @Query("patient_id") patientId: String,
        @Query("clinic_id") clinicId: String,
        @Query("voided") voided: String = "eq.false",
        @Query("select") select: String =
            "id,description,category,amount_ugx,quantity,unit_price_ugx,visit_id,source,created_at,voided,creator:staff!created_by(display_name,first_name,last_name)",
        @Query("order") order: String = "created_at.desc",
    ): List<ChargeDto>

    @GET("payments")
    suspend fun getBillingPaymentsForPatient(
        @Query("patient_id") patientId: String,
        @Query("clinic_id") clinicId: String,
        @Query("status") status: String = "eq.paid",
        @Query("select") select: String =
            "id,amount_ugx,amount_barter_ugx,barter_description,payment_method,receipt_number,created_at,collector:staff!collected_by(display_name,first_name,last_name)",
        @Query("order") order: String = "created_at.desc",
    ): List<BillingPaymentDto>

    @POST("rpc/rpc_void_charge")
    suspend fun rpcVoidCharge(@Body request: VoidChargeRequest): Response<ResponseBody>

    @POST("rpc/rpc_record_billing_payment")
    suspend fun rpcRecordBillingPayment(
        @Body request: RecordBillingPaymentRequest,
    ): RecordBillingPaymentResponse

    // EHR onboarding (migration 079)
    @POST("rpc/rpc_get_onboarding_status")
    suspend fun rpcGetOnboardingStatus(): OnboardingStatusDto

    @POST("rpc/rpc_complete_onboarding_module")
    suspend fun rpcCompleteOnboardingModule(
        @Body request: CompleteOnboardingModuleRequest,
    ): CompleteOnboardingModuleResponse
}
