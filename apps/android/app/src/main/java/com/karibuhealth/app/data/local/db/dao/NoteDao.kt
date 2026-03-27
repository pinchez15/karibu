package com.karibuhealth.app.data.local.db.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.karibuhealth.app.data.local.db.entity.PatientNoteEntity
import com.karibuhealth.app.data.local.db.entity.ProviderNoteEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface ProviderNoteDao {
    @Query("SELECT * FROM provider_notes WHERE visit_id = :visitId")
    fun getByVisitId(visitId: String): Flow<ProviderNoteEntity?>

    @Query("SELECT * FROM provider_notes WHERE visit_id = :visitId")
    suspend fun getByVisitIdOnce(visitId: String): ProviderNoteEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(note: ProviderNoteEntity)
}

@Dao
interface PatientNoteDao {
    @Query("SELECT * FROM patient_notes WHERE visit_id = :visitId")
    fun getByVisitId(visitId: String): Flow<PatientNoteEntity?>

    @Query("SELECT * FROM patient_notes WHERE visit_id = :visitId")
    suspend fun getByVisitIdOnce(visitId: String): PatientNoteEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(note: PatientNoteEntity)
}
