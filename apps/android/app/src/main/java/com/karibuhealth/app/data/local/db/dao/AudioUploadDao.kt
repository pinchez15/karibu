package com.karibuhealth.app.data.local.db.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.karibuhealth.app.data.local.db.entity.AudioUploadEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface AudioUploadDao {
    @Query("SELECT * FROM audio_uploads WHERE visit_id = :visitId")
    fun getByVisitId(visitId: String): Flow<AudioUploadEntity?>

    @Query("SELECT * FROM audio_uploads WHERE visit_id = :visitId")
    suspend fun getByVisitIdOnce(visitId: String): AudioUploadEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(audioUpload: AudioUploadEntity)

    @Query("UPDATE audio_uploads SET status = :status, updated_at = :updatedAt WHERE id = :id")
    suspend fun updateStatus(id: String, status: String, updatedAt: String)

    @Query("SELECT * FROM audio_uploads WHERE local_file_path IS NOT NULL AND status IN ('pending', 'failed')")
    suspend fun getPendingUploads(): List<AudioUploadEntity>
}
