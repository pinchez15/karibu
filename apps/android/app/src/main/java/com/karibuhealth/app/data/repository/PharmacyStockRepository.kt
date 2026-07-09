package com.karibuhealth.app.data.repository

import com.karibuhealth.app.data.local.db.dao.PharmacyStockDao
import com.karibuhealth.app.data.local.db.entity.PharmacyStockItemEntity
import com.karibuhealth.app.data.remote.api.SupabaseApi
import com.karibuhealth.app.data.remote.dto.CompleteDispenseLineRpc
import com.karibuhealth.app.data.remote.dto.PharmacyStockItemDto
import com.karibuhealth.app.util.NetworkMonitor
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import java.time.Instant
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class PharmacyStockRepository @Inject constructor(
    private val pharmacyStockDao: PharmacyStockDao,
    private val supabaseApi: SupabaseApi,
    private val networkMonitor: NetworkMonitor,
) {
    suspend fun refreshStock(clinicId: String) {
        if (!networkMonitor.isConnected()) return
        withContext(Dispatchers.IO) {
            runCatching {
                val remote = supabaseApi.getPharmacyStockItems("eq.$clinicId")
                pharmacyStockDao.upsertAll(remote.map { it.toEntity() })
            }
        }
    }

    suspend fun getActiveStock(clinicId: String): List<PharmacyStockItemEntity> =
        withContext(Dispatchers.IO) {
            pharmacyStockDao.getActiveByClinic(clinicId)
        }

    /**
     * Result of matching free-text medications to stock. [movementsJson] is
     * the rpc_record_dispense movements payload; [skippedOutOfStock] are
     * drugs that MATCHED a stock row but could not be decremented (quantity
     * on hand too low); [matchedAny] is false when no stock row matched the
     * free text at all (no decrement happened anywhere).
     */
    data class DispenseMovementsResult(
        val movementsJson: String,
        val skippedOutOfStock: List<String>,
        val matchedAny: Boolean,
    )

    /**
     * Match medication free-text to cached stock rows and build rpc_record_dispense
     * movements JSON while decrementing quantities locally. Items that match
     * but have insufficient stock are reported back instead of silently
     * skipped, so the pharmacist can be warned that stock was NOT decremented.
     */
    suspend fun applyOfflineDispenseMovements(
        clinicId: String,
        medications: String?,
        defaultQuantity: Double = 1.0,
    ): DispenseMovementsResult {
        val meds = medications?.trim().orEmpty()
        if (meds.isEmpty()) return DispenseMovementsResult("[]", emptyList(), matchedAny = true)

        val stock = pharmacyStockDao.getActiveByClinic(clinicId)
        val now = Instant.now().toString()
        val skipped = mutableListOf<String>()
        var matchedAny = false
        val movements = buildJsonArray {
            for (item in stock) {
                if (meds.contains(item.drugName, ignoreCase = true)) {
                    matchedAny = true
                    if (item.quantityOnHand >= defaultQuantity) {
                        pharmacyStockDao.decrementQuantity(item.id, defaultQuantity, now)
                        add(
                            buildJsonObject {
                                put("stock_item_id", item.id)
                                put("quantity", defaultQuantity)
                            },
                        )
                    } else {
                        skipped.add(item.drugName)
                    }
                }
            }
        }
        return DispenseMovementsResult(movements.toString(), skipped, matchedAny)
    }

    /**
     * Attach stock decrement metadata to a structured dispense line when a
     * cached stock row matches the prescription label or code.
     */
    suspend fun enrichDispenseLineWithStock(
        clinicId: String,
        line: CompleteDispenseLineRpc,
        medicationCode: String?,
        medicationLabel: String,
    ): Pair<CompleteDispenseLineRpc, String?> {
        if (line.lineStatus == "out_of_stock") return line to null
        val stock = pharmacyStockDao.getActiveByClinic(clinicId)
        val match = stock.firstOrNull { item ->
            (!medicationCode.isNullOrBlank() && item.drugCode.equals(medicationCode, ignoreCase = true)) ||
                item.drugName.contains(medicationLabel, ignoreCase = true) ||
                medicationLabel.contains(item.drugName, ignoreCase = true)
        } ?: return line to "No stock match for $medicationLabel — stock not decremented"

        val qty = line.quantityDispensed ?: line.stockQuantity ?: 1.0
        if (match.quantityOnHand < qty) {
            return line to "Insufficient stock for ${match.drugName} — stock not decremented"
        }

        val now = Instant.now().toString()
        pharmacyStockDao.decrementQuantity(match.id, qty, now)
        return line.copy(
            stockItemId = match.id,
            stockQuantity = qty,
        ) to null
    }
}

private fun PharmacyStockItemDto.toEntity() = PharmacyStockItemEntity(
    id = id,
    clinicId = clinicId,
    drugCode = drugCode,
    drugName = drugName,
    formulation = formulation,
    strength = strength,
    unit = unit,
    quantityOnHand = quantityOnHand,
    lowStockThreshold = lowStockThreshold ?: 10.0,
    active = active,
    updatedAt = updatedAt,
)
