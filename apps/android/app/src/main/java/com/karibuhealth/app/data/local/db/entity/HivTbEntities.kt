package com.karibuhealth.app.data.local.db.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/** HTS / HCT register row (migration 088). */
@Entity(
    tableName = "hts_events",
    indices = [Index("clinic_id"), Index("patient_id"), Index(value = ["clinic_id", "event_date"])],
)
data class HtsEventEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "clinic_id") val clinicId: String,
    @ColumnInfo(name = "patient_id") val patientId: String,
    @ColumnInfo(name = "patient_name") val patientName: String? = null,
    @ColumnInfo(name = "event_date") val eventDate: String,
    val counseled: Boolean = true,
    val tested: Boolean = false,
    val result: String? = null,
    @ColumnInfo(name = "result_received") val resultReceived: Boolean = false,
    @ColumnInfo(name = "suspected_tb") val suspectedTb: Boolean = false,
    @ColumnInfo(name = "started_cpt") val startedCpt: Boolean = false,
    val retester: Boolean = false,
    @ColumnInfo(name = "is_synced") val isSynced: Boolean = true,
)

/** HIV care / ART register spine (migration 088). */
@Entity(
    tableName = "hiv_care_enrollments",
    indices = [Index("clinic_id"), Index("patient_id")],
)
data class HivCareEnrollmentEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "clinic_id") val clinicId: String,
    @ColumnInfo(name = "patient_id") val patientId: String,
    @ColumnInfo(name = "patient_name") val patientName: String? = null,
    @ColumnInfo(name = "enrolled_at") val enrolledAt: String,
    @ColumnInfo(name = "care_status") val careStatus: String = "pre_art",
    @ColumnInfo(name = "who_stage") val whoStage: Int? = null,
    @ColumnInfo(name = "art_start_date") val artStartDate: String? = null,
    @ColumnInfo(name = "art_regimen") val artRegimen: String? = null,
    @ColumnInfo(name = "art_line") val artLine: String? = null,
    @ColumnInfo(name = "cpt_at_last_visit") val cptAtLastVisit: Boolean = false,
    @ColumnInfo(name = "tb_assessed_last_visit") val tbAssessedLastVisit: Boolean = false,
    @ColumnInfo(name = "tb_treatment_started") val tbTreatmentStarted: Boolean = false,
    @ColumnInfo(name = "is_synced") val isSynced: Boolean = true,
)

/** Unit TB register row (migration 088). */
@Entity(
    tableName = "tb_episodes",
    indices = [Index("clinic_id"), Index("patient_id")],
)
data class TbEpisodeEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "clinic_id") val clinicId: String,
    @ColumnInfo(name = "patient_id") val patientId: String,
    @ColumnInfo(name = "patient_name") val patientName: String? = null,
    @ColumnInfo(name = "unit_tb_number") val unitTbNumber: String? = null,
    @ColumnInfo(name = "registered_at") val registeredAt: String,
    @ColumnInfo(name = "case_type") val caseType: String = "new",
    @ColumnInfo(name = "disease_class") val diseaseClass: String = "pulmonary_smear_positive",
    @ColumnInfo(name = "hiv_status") val hivStatus: String? = null,
    @ColumnInfo(name = "treatment_started_at") val treatmentStartedAt: String? = null,
    val outcome: String = "ongoing",
    @ColumnInfo(name = "outcome_date") val outcomeDate: String? = null,
    @ColumnInfo(name = "is_synced") val isSynced: Boolean = true,
)

@Entity(
    tableName = "viral_load_tests",
    indices = [Index("enrollment_id"), Index("patient_id")],
)
data class ViralLoadTestEntity(
    @PrimaryKey val id: String,
    @ColumnInfo(name = "clinic_id") val clinicId: String,
    @ColumnInfo(name = "patient_id") val patientId: String,
    @ColumnInfo(name = "enrollment_id") val enrollmentId: String? = null,
    @ColumnInfo(name = "test_date") val testDate: String,
    @ColumnInfo(name = "result_copies") val resultCopies: Double? = null,
    val suppressed: Boolean? = null,
    @ColumnInfo(name = "is_synced") val isSynced: Boolean = true,
)
