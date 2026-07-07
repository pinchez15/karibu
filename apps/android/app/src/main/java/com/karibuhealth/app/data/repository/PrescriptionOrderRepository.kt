package com.karibuhealth.app.data.repository

import com.karibuhealth.app.data.local.db.dao.PrescriptionOrderDao
import com.karibuhealth.app.data.local.db.entity.PrescriptionOrderEntity
import com.karibuhealth.app.data.remote.api.SupabaseApi
import com.karibuhealth.app.data.remote.dto.CompleteDispenseLineRpc
import com.karibuhealth.app.data.remote.dto.CompletePharmacyDispenseRequest
import com.karibuhealth.app.data.remote.dto.PrescriptionLineRpc
import com.karibuhealth.app.data.remote.dto.PrescriptionOrderDto
import com.karibuhealth.app.domain.model.NeedsPharmacyItem
import com.karibuhealth.app.domain.model.PrescriptionOrderLine
import com.karibuhealth.app.util.NetworkMonitor
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class PrescriptionOrderRepository @Inject constructor(
    private val prescriptionOrderDao: PrescriptionOrderDao,
    private val supabaseApi: SupabaseApi,
    private val networkMonitor: NetworkMonitor,
) {
    suspend fun getLinesForVisit(visitId: String): List<PrescriptionOrderLine> =
        withContext(Dispatchers.IO) {
            prescriptionOrderDao.getForVisit(visitId).map { it.toDomain() }
        }

    suspend fun attachLines(items: List<NeedsPharmacyItem>): List<NeedsPharmacyItem> =
        withContext(Dispatchers.IO) {
            if (items.isEmpty()) return@withContext items
            val visitIds = items.map { it.visitId }
            val byVisit = prescriptionOrderDao.getForVisits(visitIds).groupBy { it.visitId }
            items.map { item ->
                item.copy(
                    prescriptionLines = byVisit[item.visitId].orEmpty().map { it.toDomain() },
                )
            }
        }

    suspend fun refreshForVisits(visitIds: List<String>) {
        if (visitIds.isEmpty() || !networkMonitor.isOnline()) return
        withContext(Dispatchers.IO) {
            runCatching {
                val filter = "in.(${visitIds.joinToString(",")})"
                val remote = supabaseApi.getPrescriptionOrdersForVisits(filter)
                val entities = remote.map { it.toEntity() }
                visitIds.forEach { prescriptionOrderDao.deleteForVisit(it) }
                if (entities.isNotEmpty()) {
                    prescriptionOrderDao.upsertAll(entities)
                }
            }
        }
    }

    suspend fun refreshForVisit(visitId: String) = refreshForVisits(listOf(visitId))

    /**
     * Persist structured lines locally when a clinician submits offline. Server
     * IDs are assigned on sync; [replaceLocalAfterSubmit] remaps pending dispense
     * payloads by sort order.
     */
    suspend fun cacheSubmittedLines(
        visitId: String,
        clinicId: String,
        patientId: String,
        lines: List<PrescriptionLineRpc>,
    ): List<PrescriptionOrderEntity> = withContext(Dispatchers.IO) {
        prescriptionOrderDao.deleteForVisit(visitId)
        val entities = lines.mapIndexed { index, line ->
            PrescriptionOrderEntity(
                id = UUID.randomUUID().toString(),
                visitId = visitId,
                clinicId = clinicId,
                patientId = patientId,
                sortOrder = index,
                medicationCode = line.medicationCode,
                freeTextName = line.freeTextName,
                doseText = line.doseText,
                routeText = line.routeText,
                frequencyText = line.frequencyText,
                durationText = line.durationText,
                quantityPrescribed = line.quantityPrescribed,
                quantityUnit = line.quantityUnit,
                status = "ordered",
                notes = line.notes,
            )
        }
        if (entities.isNotEmpty()) {
            prescriptionOrderDao.upsertAll(entities)
        }
        entities
    }

    /**
     * After rpc_submit_pharmacy_order lands, replace local rows with server
     * truth and return old-id → new-id mapping (by sort_order).
     */
    suspend fun replaceLocalAfterSubmit(visitId: String): Map<String, String> =
        withContext(Dispatchers.IO) {
            val before = prescriptionOrderDao.getForVisit(visitId)
            if (!networkMonitor.isOnline()) return@withContext emptyMap()
            val remote = runCatching {
                supabaseApi.getPrescriptionOrdersForVisits("eq.$visitId")
            }.getOrElse { emptyList() }
            if (remote.isEmpty()) return@withContext emptyMap()

            prescriptionOrderDao.deleteForVisit(visitId)
            prescriptionOrderDao.upsertAll(remote.map { it.toEntity() })

            val after = prescriptionOrderDao.getForVisit(visitId)
            buildMap {
                before.forEachIndexed { index, old ->
                    after.getOrNull(index)?.let { new -> put(old.id, new.id) }
                }
            }
        }

    fun legacyLinesFromText(visitId: String, medications: String?): List<PrescriptionOrderLine> {
        val rows = medications?.lines()?.map { it.trim() }?.filter { it.isNotEmpty() }.orEmpty()
        return rows.mapIndexed { index, text ->
            PrescriptionOrderLine(
                id = "legacy-$visitId-$index",
                freeTextName = text,
                sortOrder = index,
            )
        }
    }

    suspend fun applyLocalDispenseOutcomes(
        outcomes: List<Pair<String, String>>,
    ) = withContext(Dispatchers.IO) {
        outcomes.forEach { (orderId, status) ->
            if (!orderId.startsWith("legacy-")) {
                prescriptionOrderDao.updateStatus(orderId, status)
            }
        }
    }

    suspend fun applyLineSendBack(orderId: String) = withContext(Dispatchers.IO) {
        if (!orderId.startsWith("legacy-")) {
            prescriptionOrderDao.updateStatus(orderId, "needs_clarification")
        }
    }
}

private fun PrescriptionOrderDto.toEntity() = PrescriptionOrderEntity(
    id = id,
    visitId = visitId,
    clinicId = clinicId,
    patientId = patientId,
    sortOrder = sortOrder,
    medicationCode = medicationCode,
    freeTextName = freeTextName,
    doseText = doseText,
    routeText = routeText,
    frequencyText = frequencyText,
    durationText = durationText,
    quantityPrescribed = quantityPrescribed,
    quantityUnit = quantityUnit,
    status = status,
    notes = notes,
)

private fun PrescriptionOrderEntity.toDomain() = PrescriptionOrderLine(
    id = id,
    medicationCode = medicationCode,
    freeTextName = freeTextName,
    doseText = doseText,
    routeText = routeText,
    frequencyText = frequencyText,
    durationText = durationText,
    quantityPrescribed = quantityPrescribed,
    quantityUnit = quantityUnit,
    status = status,
    notes = notes,
    sortOrder = sortOrder,
)
