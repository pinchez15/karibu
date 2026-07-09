package com.karibuhealth.app.data.repository

import com.karibuhealth.app.data.local.db.dao.ClinicCatalogDao
import com.karibuhealth.app.data.local.db.entity.ClinicFormularyCatalogEntity
import com.karibuhealth.app.data.local.db.entity.ClinicLabCatalogEntity
import com.karibuhealth.app.data.remote.api.SupabaseApi
import com.karibuhealth.app.data.remote.dto.GetClinicCatalogRequest
import com.karibuhealth.app.util.NetworkMonitor
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class CatalogRepository @Inject constructor(
    private val clinicCatalogDao: ClinicCatalogDao,
    private val supabaseApi: SupabaseApi,
    private val networkMonitor: NetworkMonitor,
) {
    suspend fun getLabs(clinicId: String): List<ClinicLabCatalogEntity> =
        withContext(Dispatchers.IO) {
            clinicCatalogDao.getLabs(clinicId)
        }

    suspend fun getFormulary(clinicId: String): List<ClinicFormularyCatalogEntity> =
        withContext(Dispatchers.IO) {
            clinicCatalogDao.getFormulary(clinicId)
        }

    suspend fun refreshCatalog(clinicId: String) {
        if (!networkMonitor.isConnected()) return
        withContext(Dispatchers.IO) {
            try {
                val dto = supabaseApi.rpcGetClinicCatalog(GetClinicCatalogRequest(clinicId))
                clinicCatalogDao.deleteLabsForClinic(clinicId)
                clinicCatalogDao.deleteFormularyForClinic(clinicId)
                clinicCatalogDao.upsertLabs(
                    dto.labs.filter { it.isAvailable }.map { item ->
                        ClinicLabCatalogEntity(
                            id = UUID.randomUUID().toString(),
                            clinicId = clinicId,
                            testName = item.testName,
                            code = item.code,
                            category = item.category,
                            displayOrder = item.displayOrder,
                            isAvailable = item.isAvailable,
                            notes = item.notes,
                        )
                    },
                )
                clinicCatalogDao.upsertFormulary(
                    dto.formulary.filter { it.isAvailable }.map { item ->
                        ClinicFormularyCatalogEntity(
                            id = UUID.randomUUID().toString(),
                            clinicId = clinicId,
                            drugName = item.drugName,
                            code = item.code,
                            category = item.category,
                            displayOrder = item.displayOrder,
                            isAvailable = item.isAvailable,
                            notes = item.notes,
                            strengthsJson = item.strengths.takeIf { it.isNotEmpty() }
                                ?.let { Json.encodeToString(it) },
                            aliasesJson = item.aliases.takeIf { it.isNotEmpty() }
                                ?.let { Json.encodeToString(it) },
                            defaultFrequency = item.defaultFrequency,
                            defaultRoute = item.defaultRoute,
                            warningText = item.warningText,
                        )
                    },
                )
            } catch (_: Exception) {
                // Offline-first: keep cached catalog
            }
        }
    }
}
