package com.karibuhealth.app.data.repository

import com.karibuhealth.app.data.remote.api.SupabaseApi
import com.karibuhealth.app.data.remote.dto.CareTaskRow
import com.karibuhealth.app.data.remote.dto.CareTasksWorklistRequest
import com.karibuhealth.app.data.remote.dto.MyDraftsRequest
import com.karibuhealth.app.data.remote.dto.MyDraftsRow
import com.karibuhealth.app.data.remote.dto.NeedsClinicianRow
import com.karibuhealth.app.data.remote.dto.NeedsLabRow
import com.karibuhealth.app.data.remote.dto.NeedsPaymentRow
import com.karibuhealth.app.data.remote.dto.NeedsPharmacyRow
import com.karibuhealth.app.data.remote.dto.NeedsVitalsRow
import com.karibuhealth.app.data.remote.dto.WorklistClinicOnlyRequest
import com.karibuhealth.app.data.remote.dto.WorklistRequest
import com.karibuhealth.app.domain.model.CareTaskItem
import com.karibuhealth.app.domain.model.MyDraftItem
import com.karibuhealth.app.domain.model.NeedsClinicianItem
import com.karibuhealth.app.domain.model.NeedsLabItem
import com.karibuhealth.app.domain.model.NeedsPaymentItem
import com.karibuhealth.app.domain.model.NeedsPharmacyItem
import com.karibuhealth.app.domain.model.NeedsVitalsItem
import com.karibuhealth.app.util.NetworkMonitor
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Phase 5 worklist repository.
 *
 * The seven worklist RPCs (migration 041) power the operational "pull list"
 * UI: needs-vitals, needs-clinician, needs-lab, needs-pharmacy, needs-payment,
 * my-drafts, and care-tasks. All seven are online-only — we don't try to
 * derive them from the Room cache because they depend on cross-table joins
 * and server-side timestamp comparisons that aren't worth duplicating.
 *
 * Each call returns an empty list on failure (offline, RPC error, anything
 * else) so the ViewModel can render "Empty" without a try/catch.
 */
@Singleton
class WorklistRepository @Inject constructor(
    private val supabaseApi: SupabaseApi,
    private val networkMonitor: NetworkMonitor,
) {

    suspend fun getNeedsVitals(
        clinicId: String,
        department: String? = null,
    ): List<NeedsVitalsItem> = withContext(Dispatchers.IO) {
        if (!networkMonitor.isOnline()) return@withContext emptyList()
        runCatching {
            supabaseApi.rpcWorklistNeedsVitals(
                WorklistRequest(clinicId = clinicId, department = department),
            ).map { it.toDomain() }
        }.getOrElse { emptyList() }
    }

    suspend fun getNeedsClinician(
        clinicId: String,
        department: String? = null,
    ): List<NeedsClinicianItem> = withContext(Dispatchers.IO) {
        if (!networkMonitor.isOnline()) return@withContext emptyList()
        runCatching {
            supabaseApi.rpcWorklistNeedsClinician(
                WorklistRequest(clinicId = clinicId, department = department),
            ).map { it.toDomain() }
        }.getOrElse { emptyList() }
    }

    suspend fun getNeedsLab(clinicId: String): List<NeedsLabItem> = withContext(Dispatchers.IO) {
        if (!networkMonitor.isOnline()) return@withContext emptyList()
        runCatching {
            supabaseApi.rpcWorklistNeedsLab(
                WorklistClinicOnlyRequest(clinicId = clinicId),
            ).map { it.toDomain() }
        }.getOrElse { emptyList() }
    }

    suspend fun getNeedsPharmacy(clinicId: String): List<NeedsPharmacyItem> =
        withContext(Dispatchers.IO) {
            if (!networkMonitor.isOnline()) return@withContext emptyList()
            runCatching {
                supabaseApi.rpcWorklistNeedsPharmacy(
                    WorklistClinicOnlyRequest(clinicId = clinicId),
                ).map { it.toDomain() }
            }.getOrElse { emptyList() }
        }

    suspend fun getNeedsPayment(clinicId: String): List<NeedsPaymentItem> =
        withContext(Dispatchers.IO) {
            if (!networkMonitor.isOnline()) return@withContext emptyList()
            runCatching {
                supabaseApi.rpcWorklistNeedsPayment(
                    WorklistClinicOnlyRequest(clinicId = clinicId),
                ).map { it.toDomain() }
            }.getOrElse { emptyList() }
        }

    suspend fun getMyDrafts(
        clinicId: String,
        staffId: String? = null,
    ): List<MyDraftItem> = withContext(Dispatchers.IO) {
        if (!networkMonitor.isOnline()) return@withContext emptyList()
        runCatching {
            supabaseApi.rpcWorklistMyDrafts(
                MyDraftsRequest(clinicId = clinicId, staffId = staffId),
            ).map { it.toDomain() }
        }.getOrElse { emptyList() }
    }

    suspend fun getCareTasks(
        clinicId: String,
        assigneeRole: String? = null,
        assigneeId: String? = null,
        taskType: String? = null,
    ): List<CareTaskItem> = withContext(Dispatchers.IO) {
        if (!networkMonitor.isOnline()) return@withContext emptyList()
        runCatching {
            supabaseApi.rpcWorklistCareTasks(
                CareTasksWorklistRequest(
                    clinicId = clinicId,
                    assigneeRole = assigneeRole,
                    assigneeId = assigneeId,
                    taskType = taskType,
                ),
            ).map { it.toDomain() }
        }.getOrElse { emptyList() }
    }
}

// =============================================================================
// Local DTO -> domain mappers
// =============================================================================
// These live with the repository (not Mappers.kt) because the seven DTOs map
// to seven different domain types and only this module consumes them. Keeping
// them here avoids cluttering the shared mapper namespace.

private fun NeedsVitalsRow.toDomain() = NeedsVitalsItem(
    visitId = visitId,
    patientId = patientId,
    patientName = patientName.orEmpty().ifBlank { "Unknown" },
    sex = sex,
    derivedAge = derivedAge,
    chiefComplaint = chiefComplaint,
    queueStatus = queueStatus,
    checkedInAt = checkedInAt,
)

private fun NeedsClinicianRow.toDomain() = NeedsClinicianItem(
    visitId = visitId,
    patientId = patientId,
    patientName = patientName.orEmpty().ifBlank { "Unknown" },
    sex = sex,
    derivedAge = derivedAge,
    chiefComplaint = chiefComplaint,
    queueStatus = queueStatus,
    priority = priority,
    doctorId = doctorId,
    checkedInAt = checkedInAt,
    waitMinutes = waitMinutes,
)

private fun NeedsLabRow.toDomain() = NeedsLabItem(
    visitId = visitId,
    patientId = patientId,
    patientName = patientName.orEmpty().ifBlank { "Unknown" },
    sex = sex,
    derivedAge = derivedAge,
    chiefComplaint = chiefComplaint,
    labStatus = labStatus,
    doctorId = doctorId,
    visitDate = visitDate,
)

private fun NeedsPharmacyRow.toDomain() = NeedsPharmacyItem(
    visitId = visitId,
    patientId = patientId,
    patientName = patientName.orEmpty().ifBlank { "Unknown" },
    sex = sex,
    derivedAge = derivedAge,
    medications = medications,
    dispensingStatus = dispensingStatus,
    doctorId = doctorId,
    visitDate = visitDate,
)

private fun NeedsPaymentRow.toDomain() = NeedsPaymentItem(
    visitId = visitId,
    patientId = patientId,
    patientName = patientName.orEmpty().ifBlank { "Unknown" },
    sex = sex,
    derivedAge = derivedAge,
    diagnosis = diagnosis,
    visitDate = visitDate,
    documentationCompletedAt = documentationCompletedAt,
)

private fun MyDraftsRow.toDomain() = MyDraftItem(
    noteId = noteId,
    patientId = patientId,
    patientName = patientName.orEmpty().ifBlank { "Unknown" },
    visitId = visitId,
    source = source,
    transcriptPreview = transcriptPreview,
    updatedAt = updatedAt,
)

private fun CareTaskRow.toDomain() = CareTaskItem(
    taskId = taskId,
    patientId = patientId,
    patientName = patientName.orEmpty().ifBlank { "Unknown" },
    visitId = visitId,
    taskType = taskType,
    title = title.orEmpty(),
    description = description,
    assigneeRole = assigneeRole,
    assigneeId = assigneeId,
    dueAt = dueAt,
    status = status ?: "open",
    createdAt = createdAt,
)
