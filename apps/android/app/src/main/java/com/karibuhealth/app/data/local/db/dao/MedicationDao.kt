package com.karibuhealth.app.data.local.db.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.karibuhealth.app.data.local.db.entity.MedicationAdministrationEntity
import com.karibuhealth.app.data.local.db.entity.MedicationOrderEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface MedicationOrderDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(entity: MedicationOrderEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(entities: List<MedicationOrderEntity>)

    @Query("UPDATE medication_orders SET is_synced = 1 WHERE id = :id")
    suspend fun markSynced(id: String)

    @Query("UPDATE medication_orders SET active = 0, is_synced = 0 WHERE id = :id")
    suspend fun deactivateLocal(id: String)

    @Query(
        """
        SELECT * FROM medication_orders
        WHERE admission_id = :admissionId
        ORDER BY active DESC, created_at DESC
        """,
    )
    fun observeForAdmission(admissionId: String): Flow<List<MedicationOrderEntity>>
}

@Dao
interface MedicationAdministrationDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(entity: MedicationAdministrationEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(entities: List<MedicationAdministrationEntity>)

    @Query("UPDATE medication_administrations SET is_synced = 1 WHERE id = :id")
    suspend fun markSynced(id: String)

    @Query(
        """
        SELECT * FROM medication_administrations
        WHERE admission_id = :admissionId
        ORDER BY administered_at DESC
        """,
    )
    fun observeForAdmission(admissionId: String): Flow<List<MedicationAdministrationEntity>>
}
