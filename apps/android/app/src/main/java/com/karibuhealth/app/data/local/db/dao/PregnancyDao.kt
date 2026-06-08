package com.karibuhealth.app.data.local.db.dao

import androidx.room.Dao
import androidx.room.Embedded
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.karibuhealth.app.data.local.db.entity.AncContactEntity
import com.karibuhealth.app.data.local.db.entity.PregnancyEntity
import kotlinx.coroutines.flow.Flow

/** A registry row: the pregnancy plus derived ANC/IPTp counts and last-contact time. */
data class PregnancyRegistryRow(
    @Embedded val pregnancy: PregnancyEntity,
    @androidx.room.ColumnInfo(name = "contact_count") val contactCount: Int,
    @androidx.room.ColumnInfo(name = "iptp_count") val iptpCount: Int,
    @androidx.room.ColumnInfo(name = "td_count") val tdCount: Int,
    @androidx.room.ColumnInfo(name = "last_contact_at") val lastContactAt: String?,
)

@Dao
interface PregnancyDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(entity: PregnancyEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(entities: List<PregnancyEntity>)

    @Query("UPDATE pregnancies SET is_synced = 1 WHERE id = :id")
    suspend fun markSynced(id: String)

    @Query(
        """
        SELECT pg.*,
            (SELECT COUNT(*) FROM anc_contacts c WHERE c.pregnancy_id = pg.id) AS contact_count,
            (SELECT COUNT(*) FROM anc_contacts c WHERE c.pregnancy_id = pg.id AND c.iptp_given = 1) AS iptp_count,
            (SELECT COUNT(*) FROM anc_contacts c WHERE c.pregnancy_id = pg.id AND c.td_given = 1) AS td_count,
            (SELECT MAX(c.contact_date) FROM anc_contacts c WHERE c.pregnancy_id = pg.id) AS last_contact_at
        FROM pregnancies pg
        WHERE pg.clinic_id = :clinicId AND pg.status = 'active'
        ORDER BY pg.edd IS NULL, pg.edd
        """,
    )
    fun observeRegistry(clinicId: String): Flow<List<PregnancyRegistryRow>>

    @Query("SELECT * FROM pregnancies WHERE id = :id LIMIT 1")
    fun observeById(id: String): Flow<PregnancyEntity?>
}

@Dao
interface AncContactDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(entity: AncContactEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(entities: List<AncContactEntity>)

    @Query("UPDATE anc_contacts SET is_synced = 1 WHERE id = :id")
    suspend fun markSynced(id: String)

    @Query("SELECT * FROM anc_contacts WHERE pregnancy_id = :pregnancyId ORDER BY contact_date DESC")
    fun observeForPregnancy(pregnancyId: String): Flow<List<AncContactEntity>>
}
