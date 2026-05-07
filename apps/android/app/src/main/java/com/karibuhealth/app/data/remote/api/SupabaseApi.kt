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

    @POST("rpc/get_clinic_queue")
    suspend fun getClinicQueue(@Body request: Map<String, @JvmSuppressWildcards Any?>): Response<ResponseBody>

    // Offline-first foundation (migration 029) RPCs
    @POST("rpc/rpc_upsert_provider_note")
    suspend fun rpcUpsertProviderNote(@Body request: ProviderNoteUpsertDto): Response<ResponseBody>

    @POST("rpc/rpc_upsert_patient_note_summary")
    suspend fun rpcUpsertPatientNoteSummary(@Body request: PatientNoteSummaryUpsertDto): Response<ResponseBody>

    @POST("rpc/rpc_insert_patient_vitals")
    suspend fun rpcInsertPatientVitals(@Body request: PatientVitalsCreateDto): Response<ResponseBody>

    @POST("rpc/rpc_mark_documentation_complete")
    suspend fun rpcMarkDocumentationComplete(@Body request: MarkDocumentationCompleteDto): Response<ResponseBody>
}
