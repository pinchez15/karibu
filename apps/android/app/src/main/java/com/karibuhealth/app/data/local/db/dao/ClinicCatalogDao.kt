package com.karibuhealth.app.data.local.db.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.karibuhealth.app.data.local.db.entity.ClinicFormularyCatalogEntity
import com.karibuhealth.app.data.local.db.entity.ClinicLabCatalogEntity

@Dao
interface ClinicCatalogDao {
    @Query("SELECT * FROM clinic_lab_catalog WHERE clinic_id = :clinicId AND is_available = 1 ORDER BY display_order, test_name")
    suspend fun getLabs(clinicId: String): List<ClinicLabCatalogEntity>

    @Query("SELECT * FROM clinic_formulary_catalog WHERE clinic_id = :clinicId AND is_available = 1 ORDER BY display_order, drug_name")
    suspend fun getFormulary(clinicId: String): List<ClinicFormularyCatalogEntity>

    @Query("DELETE FROM clinic_lab_catalog WHERE clinic_id = :clinicId")
    suspend fun deleteLabsForClinic(clinicId: String)

    @Query("DELETE FROM clinic_formulary_catalog WHERE clinic_id = :clinicId")
    suspend fun deleteFormularyForClinic(clinicId: String)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertLabs(items: List<ClinicLabCatalogEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertFormulary(items: List<ClinicFormularyCatalogEntity>)
}
