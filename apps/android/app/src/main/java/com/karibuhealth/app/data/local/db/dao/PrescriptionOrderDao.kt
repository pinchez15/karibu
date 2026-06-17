package com.karibuhealth.app.data.local.db.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.karibuhealth.app.data.local.db.entity.PrescriptionOrderEntity

@Dao
interface PrescriptionOrderDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(entities: List<PrescriptionOrderEntity>)

    @Query("DELETE FROM prescription_orders WHERE visit_id = :visitId")
    suspend fun deleteForVisit(visitId: String)

    @Query(
        """
        SELECT * FROM prescription_orders
        WHERE visit_id = :visitId
        ORDER BY sort_order ASC
        """,
    )
    suspend fun getForVisit(visitId: String): List<PrescriptionOrderEntity>

    @Query(
        """
        SELECT * FROM prescription_orders
        WHERE visit_id IN (:visitIds)
        ORDER BY visit_id ASC, sort_order ASC
        """,
    )
    suspend fun getForVisits(visitIds: List<String>): List<PrescriptionOrderEntity>

    @Query("UPDATE prescription_orders SET status = :status WHERE id = :id")
    suspend fun updateStatus(id: String, status: String)
}
