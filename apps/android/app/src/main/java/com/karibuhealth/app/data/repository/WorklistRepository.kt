package com.karibuhealth.app.data.repository

import com.karibuhealth.app.data.local.db.dao.PatientDao
import com.karibuhealth.app.data.local.db.dao.VisitDao
import com.karibuhealth.app.data.local.db.converter.toDomain
import com.karibuhealth.app.data.local.db.converter.toEntity
import com.karibuhealth.app.domain.LabQueue
import com.karibuhealth.app.data.remote.api.SupabaseApi
import com.karibuhealth.app.data.remote.dto.CareTaskRow
import com.karibuhealth.app.data.remote.dto.CareTasksWorklistRequest
import com.karibuhealth.app.data.remote.dto.MyDraftsRequest
import com.karibuhealth.app.data.remote.dto.MyDraftsRow
import com.karibuhealth.app.data.remote.dto.NeedsClinicianRow
import com.karibuhealth.app.data.remote.dto.NeedsLabRow
import com.karibuhealth.app.data.remote.dto.NeedsPaymentRow
import com.karibuhealth.app.data.remote.dto.NeedsPharmacyRow
import com.karibuhealth.app.data.remote.dto.VisitDto
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
import java.time.LocalDate
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
    private val visitDao: VisitDao,
    private val patientDao: PatientDao,
    private val prescriptionOrderRepository: PrescriptionOrderRepository,
) {

    suspend fun getNeedsVitals(
        clinicId: String,
        department: String? = null,
    ): List<NeedsVitalsItem> = withContext(Dispatchers.IO) {
        if (!networkMonitor.isConnected()) return@withContext emptyList()
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
        if (!networkMonitor.isConnected()) return@withContext emptyList()
        runCatching {
            supabaseApi.rpcWorklistNeedsClinician(
                WorklistRequest(clinicId = clinicId, department = department),
            ).map { it.toDomain() }
        }.getOrElse { emptyList() }
    }

    suspend fun getNeedsLab(clinicId: String): List<NeedsLabItem> = withContext(Dispatchers.IO) {
        val base = if (networkMonitor.isConnected()) {
            runCatching {
                supabaseApi.rpcWorklistNeedsLab(
                    WorklistClinicOnlyRequest(clinicId = clinicId),
                ).map { it.toDomain() }
            }.getOrElse { visitDao.mapLocalLabQueue(clinicId, patientDao) }
        } else {
            visitDao.mapLocalLabQueue(clinicId, patientDao)
        }
        enrichLabItems(clinicId, base)
    }

    private suspend fun enrichLabItems(clinicId: String, items: List<NeedsLabItem>): List<NeedsLabItem> {
        return items.mapNotNull { item ->
            if (networkMonitor.isConnected()) {
                runCatching {
                    supabaseApi.getVisitById("eq.${item.visitId}").firstOrNull()?.let { dto ->
                        visitDao.upsert(dto.toEntity())
                    }
                }
            }
            val visit = visitDao.getByIdOnce(item.visitId) ?: return@mapNotNull item
            val stored = LabQueue.parseStoredResults(visit.labTestResultsJson)
            val merged = LabQueue.mergeLabTestResults(visit.testsOrdered, stored)
            val open = merged.filter { it.status == "pending" || it.status == "running" }
            if (open.isEmpty()) return@mapNotNull null
            item.copy(
                diagnosis = visit.diagnosis,
                testsOrdered = visit.testsOrdered,
                tests = open,
                labStatus = visit.labStatus,
                chiefComplaint = visit.chiefComplaint ?: item.chiefComplaint,
                queuePosition = visit.queuePosition,
                checkedInAt = visit.checkedInAt,
            )
        }
    }

    suspend fun getNeedsPharmacy(clinicId: String): List<NeedsPharmacyItem> =
        withContext(Dispatchers.IO) {
            val raw = if (networkMonitor.isConnected()) {
                runCatching {
                    supabaseApi.rpcWorklistNeedsPharmacy(
                        WorklistClinicOnlyRequest(clinicId = clinicId),
                    ).map { it.toDomain() }
                }.getOrElse { visitDao.mapLocalPharmacyQueue(clinicId, patientDao, prescriptionOrderRepository) }
            } else {
                visitDao.mapLocalPharmacyQueue(clinicId, patientDao, prescriptionOrderRepository)
            }
            prescriptionOrderRepository.refreshForVisits(raw.map { it.visitId })
            enrichPharmacyLines(raw)
        }

    suspend fun getPharmacyDoneToday(clinicId: String): List<NeedsPharmacyItem> =
        withContext(Dispatchers.IO) {
            val today = LocalDate.now().toString()
            val raw = if (networkMonitor.isConnected()) {
                runCatching {
                    supabaseApi.getVisits("eq.$clinicId", "eq.$today")
                        .filter { visit ->
                            !visit.pharmacyOrderSubmittedAt.isNullOrBlank() &&
                                visit.dispensingStatus in TERMINAL_DISPENSING &&
                                !visit.dispensedAt.isNullOrBlank()
                        }
                        .mapNotNull { it.toPharmacyItem(patientDao) }
                }.getOrElse {
                    visitDao.mapLocalPharmacyDoneToday(clinicId, patientDao, prescriptionOrderRepository)
                }
            } else {
                visitDao.mapLocalPharmacyDoneToday(clinicId, patientDao, prescriptionOrderRepository)
            }
            prescriptionOrderRepository.refreshForVisits(raw.map { it.visitId })
            enrichPharmacyLines(raw)
        }

    private suspend fun enrichPharmacyLines(items: List<NeedsPharmacyItem>): List<NeedsPharmacyItem> {
        val withLines = prescriptionOrderRepository.attachLines(items)
        return withLines.map { item ->
            val visit = visitDao.getByIdOnce(item.visitId)
            var enriched = item
            if (visit != null) {
                enriched = enriched.copy(
                    queuePosition = visit.queuePosition,
                    checkedInAt = visit.checkedInAt,
                )
            }
            if (enriched.prescriptionLines.isNotEmpty()) {
                enriched
            } else if (!enriched.medications.isNullOrBlank()) {
                enriched.copy(
                    prescriptionLines = prescriptionOrderRepository.legacyLinesFromText(
                        enriched.visitId,
                        enriched.medications,
                    ),
                )
            } else {
                enriched
            }
        }
    }

    suspend fun getNeedsPayment(clinicId: String): List<NeedsPaymentItem> =
        withContext(Dispatchers.IO) {
            if (!networkMonitor.isConnected()) return@withContext emptyList()
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
        if (!networkMonitor.isConnected()) return@withContext emptyList()
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
        if (!networkMonitor.isConnected()) return@withContext emptyList()
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

private val TERMINAL_DISPENSING = setOf("dispensed", "partial", "out_of_stock")

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

private suspend fun VisitDto.toPharmacyItem(patientDao: PatientDao): NeedsPharmacyItem? {
    val patient = patientDao.getByIdOnce(patientId)?.toDomain() ?: return null
    val name = listOfNotNull(patient.firstName, patient.lastName).joinToString(" ").ifBlank {
        patient.displayName ?: "Unknown"
    }
    return NeedsPharmacyItem(
        visitId = id,
        patientId = patientId,
        patientName = name,
        sex = patient.sex,
        derivedAge = patient.approximateAge,
        medications = medications,
        dispensingStatus = dispensingStatus,
        doctorId = doctorId,
        visitDate = visitDate,
        dispensedAt = dispensedAt,
        queuePosition = queuePosition,
        checkedInAt = checkedInAt,
    )
}

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
