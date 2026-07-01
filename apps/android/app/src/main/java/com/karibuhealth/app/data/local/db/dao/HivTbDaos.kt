package com.karibuhealth.app.data.local.db.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.karibuhealth.app.data.local.db.entity.HivCareEnrollmentEntity
import com.karibuhealth.app.data.local.db.entity.HtsEventEntity
import com.karibuhealth.app.data.local.db.entity.TbEpisodeEntity
import com.karibuhealth.app.data.local.db.entity.ViralLoadTestEntity
import kotlinx.coroutines.flow.Flow

@Dao
interface HtsEventDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(entity: HtsEventEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(entities: List<HtsEventEntity>)

    @Query("UPDATE hts_events SET is_synced = 1 WHERE id = :id")
    suspend fun markSynced(id: String)

    @Query(
        """
        SELECT * FROM hts_events
        WHERE clinic_id = :clinicId
        ORDER BY event_date DESC, id DESC
        LIMIT :limit
        """,
    )
    fun observeRecent(clinicId: String, limit: Int = 50): Flow<List<HtsEventEntity>>
}

@Dao
interface HivCareDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(entity: HivCareEnrollmentEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(entities: List<HivCareEnrollmentEntity>)

    @Query("UPDATE hiv_care_enrollments SET is_synced = 1 WHERE id = :id")
    suspend fun markSynced(id: String)

    @Query(
        """
        SELECT * FROM hiv_care_enrollments
        WHERE clinic_id = :clinicId AND care_status IN ('pre_art', 'on_art')
        ORDER BY enrolled_at DESC
        """,
    )
    fun observeActive(clinicId: String): Flow<List<HivCareEnrollmentEntity>>

    @Query("SELECT * FROM hiv_care_enrollments WHERE id = :id LIMIT 1")
    fun observeById(id: String): Flow<HivCareEnrollmentEntity?>
}

@Dao
interface TbEpisodeDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(entity: TbEpisodeEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(entities: List<TbEpisodeEntity>)

    @Query("UPDATE tb_episodes SET is_synced = 1 WHERE id = :id")
    suspend fun markSynced(id: String)

    @Query(
        """
        SELECT * FROM tb_episodes
        WHERE clinic_id = :clinicId AND outcome = 'ongoing'
        ORDER BY registered_at DESC
        """,
    )
    fun observeActive(clinicId: String): Flow<List<TbEpisodeEntity>>

    @Query("SELECT * FROM tb_episodes WHERE id = :id LIMIT 1")
    fun observeById(id: String): Flow<TbEpisodeEntity?>
}

@Dao
interface ViralLoadDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(entity: ViralLoadTestEntity)

    @Query("UPDATE viral_load_tests SET is_synced = 1 WHERE id = :id")
    suspend fun markSynced(id: String)

    @Query(
        """
        SELECT * FROM viral_load_tests
        WHERE enrollment_id = :enrollmentId
        ORDER BY test_date DESC
        LIMIT 20
        """,
    )
    fun observeForEnrollment(enrollmentId: String): Flow<List<ViralLoadTestEntity>>
}
