package com.karibuhealth.app.data.local.db.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.karibuhealth.app.data.local.db.entity.PharmacyStockItemEntity

@Dao
interface PharmacyStockDao {
    @Query("SELECT * FROM pharmacy_stock_items WHERE clinic_id = :clinicId AND active = 1 ORDER BY drug_name")
    suspend fun getActiveByClinic(clinicId: String): List<PharmacyStockItemEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(items: List<PharmacyStockItemEntity>)

    @Query("""
        UPDATE pharmacy_stock_items
        SET quantity_on_hand = CASE
            WHEN quantity_on_hand - :delta < 0 THEN 0
            ELSE quantity_on_hand - :delta
        END,
        updated_at = :updatedAt
        WHERE id = :id
    """)
    suspend fun decrementQuantity(id: String, delta: Double, updatedAt: String)
}
