package com.karibuhealth.app.data.repository

import com.karibuhealth.app.data.local.db.dao.PharmacyStockDao
import com.karibuhealth.app.data.local.db.entity.PharmacyStockItemEntity
import com.karibuhealth.app.data.remote.api.SupabaseApi
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
        if (!networkMonitor.isOnline()) return
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
     * Match medication free-text to cached stock rows and build rpc_record_dispense
     * movements JSON while decrementing quantities locally.
     */
    suspend fun applyOfflineDispenseMovements(
        clinicId: String,
        medications: String?,
        defaultQuantity: Double = 1.0,
    ): String {
        val meds = medications?.trim().orEmpty()
        if (meds.isEmpty()) return "[]"

        val stock = pharmacyStockDao.getActiveByClinic(clinicId)
        val now = Instant.now().toString()
        val movements = buildJsonArray {
            for (item in stock) {
                if (meds.contains(item.drugName, ignoreCase = true)) {
                    if (item.quantityOnHand >= defaultQuantity) {
                        pharmacyStockDao.decrementQuantity(item.id, defaultQuantity, now)
                        add(
                            buildJsonObject {
                                put("stock_item_id", item.id)
                                put("quantity", defaultQuantity)
                            },
                        )
                    }
                }
            }
        }
        return movements.toString()
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
