package com.karibuhealth.app.data.local.db.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.karibuhealth.app.data.local.db.entity.PaymentEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface PaymentDao {
    @Query("SELECT * FROM payments WHERE visit_id = :visitId")
    fun getByVisitId(visitId: String): Flow<PaymentEntity?>

    @Query("SELECT * FROM payments WHERE visit_id = :visitId")
    suspend fun getByVisitIdOnce(visitId: String): PaymentEntity?

    @Query("SELECT * FROM payments WHERE clinic_id = :clinicId ORDER BY created_at DESC LIMIT :limit")
    fun getRecent(clinicId: String, limit: Int = 50): Flow<List<PaymentEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(payment: PaymentEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(payments: List<PaymentEntity>)
}
