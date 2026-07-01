package com.karibuhealth.app.data.repository

import com.karibuhealth.app.data.remote.api.SupabaseApi
import com.karibuhealth.app.data.remote.dto.LabStockItemDto
import com.karibuhealth.app.data.remote.dto.PharmacyStockItemDto
import com.karibuhealth.app.util.NetworkMonitor
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton

data class ClinicStockSnapshot(
    val pharmacy: List<PharmacyStockItemDto> = emptyList(),
    val lab: List<LabStockItemDto> = emptyList(),
)

@Singleton
class StockOverviewRepository @Inject constructor(
    private val pharmacyStockRepository: PharmacyStockRepository,
    private val supabaseApi: SupabaseApi,
    private val networkMonitor: NetworkMonitor,
) {
    suspend fun loadStock(clinicId: String): ClinicStockSnapshot = withContext(Dispatchers.IO) {
        pharmacyStockRepository.refreshStock(clinicId)
        val pharmacy = pharmacyStockRepository.getActiveStock(clinicId).map { entity ->
            PharmacyStockItemDto(
                id = entity.id,
                clinicId = entity.clinicId,
                drugCode = entity.drugCode,
                drugName = entity.drugName,
                formulation = entity.formulation,
                strength = entity.strength,
                unit = entity.unit,
                quantityOnHand = entity.quantityOnHand,
                lowStockThreshold = entity.lowStockThreshold,
                active = entity.active,
                updatedAt = entity.updatedAt,
            )
        }
        val lab = if (networkMonitor.isOnline()) {
            runCatching {
                supabaseApi.getLabStockItems("eq.$clinicId")
            }.getOrDefault(emptyList())
        } else {
            emptyList()
        }
        ClinicStockSnapshot(pharmacy = pharmacy, lab = lab)
    }
}
