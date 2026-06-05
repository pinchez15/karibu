package com.karibuhealth.app.data.local.db.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import com.karibuhealth.app.data.local.db.entity.VisitEntity
import com.karibuhealth.app.data.local.db.entity.VisitWithPatient
import com.karibuhealth.app.data.local.db.entity.VisitWithDetails
import kotlinx.coroutines.flow.Flow

@Dao
interface VisitDao {
    @Query("SELECT * FROM visits WHERE clinic_id = :clinicId AND visit_date = :date ORDER BY checked_in_at DESC")
    fun getTodayVisits(clinicId: String, date: String): Flow<List<VisitEntity>>

    @Transaction
    @Query("SELECT * FROM visits WHERE clinic_id = :clinicId AND visit_date = :date ORDER BY queue_position ASC")
    fun getTodayQueue(clinicId: String, date: String): Flow<List<VisitWithPatient>>

    @Transaction
    @Query("SELECT * FROM visits WHERE doctor_id = :doctorId ORDER BY created_at DESC LIMIT :limit")
    fun getRecentByDoctor(doctorId: String, limit: Int = 20): Flow<List<VisitWithPatient>>

    // Today's queue: anyone in this clinic still in flight (waiting / triage /
    // ready / with-clinician), with this clinician or unclaimed. Sorted by
    // priority then queue_position so urgent cases float to the top.
    @Transaction
    @Query("""
        SELECT * FROM visits
        WHERE clinic_id = :clinicId
          AND visit_date = :date
          AND queue_status IN ('waiting', 'with_nurse', 'ready_for_doctor', 'with_doctor')
          AND documentation_complete = 0
          AND (doctor_id IS NULL OR doctor_id = :clinicianId)
        ORDER BY
          CASE priority
            WHEN 'urgent' THEN 0
            WHEN 'high' THEN 1
            WHEN 'normal' THEN 2
            WHEN 'low' THEN 3
            ELSE 4
          END,
          queue_position ASC
    """)
    fun getTodayClinicianQueue(
        clinicId: String,
        date: String,
        clinicianId: String,
    ): Flow<List<VisitWithPatient>>

    // Visits I'm leading that still need documentation. Predicate switched
    // from status='pending' to documentation_complete=0 so direct-saved visits
    // (which advance to status='sent' on save) are correctly excluded —
    // matches the offline-first refactor's "Save advances status" semantics.
    @Transaction
    @Query("""
        SELECT * FROM visits
        WHERE doctor_id = :clinicianId
          AND visit_date = :date
          AND documentation_complete = 0
          AND queue_status = 'with_doctor'
        ORDER BY checked_in_at ASC
    """)
    fun getMyPendingDictations(clinicianId: String, date: String): Flow<List<VisitWithPatient>>

    // AI-structured notes awaiting my review.
    @Transaction
    @Query("""
        SELECT * FROM visits
        WHERE doctor_id = :clinicianId
          AND visit_date = :date
          AND status = 'review'
        ORDER BY checked_in_at ASC
    """)
    fun getMyVisitsToReview(clinicianId: String, date: String): Flow<List<VisitWithPatient>>

    @Query("""
        SELECT COUNT(*) FROM visits
        WHERE doctor_id = :clinicianId
          AND visit_date = :date
          AND status IN ('sent', 'completed')
    """)
    fun getMyDoneTodayCount(clinicianId: String, date: String): Flow<Int>

    @Query("SELECT * FROM visits WHERE id = :id")
    fun getById(id: String): Flow<VisitEntity?>

    @Query("SELECT * FROM visits WHERE id = :id")
    suspend fun getByIdOnce(id: String): VisitEntity?

    @Transaction
    @Query("SELECT * FROM visits WHERE id = :id")
    fun getWithDetails(id: String): Flow<VisitWithDetails?>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(visit: VisitEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(visits: List<VisitEntity>)

    @Query("UPDATE visits SET status = :status, updated_at = :updatedAt WHERE id = :id")
    suspend fun updateStatus(id: String, status: String, updatedAt: String)

    @Query("UPDATE visits SET queue_status = :queueStatus, updated_at = :updatedAt WHERE id = :id")
    suspend fun updateQueueStatus(id: String, queueStatus: String, updatedAt: String)

    @Query("""
        UPDATE visits
        SET status = :status,
            queue_status = :queueStatus,
            finalized_at = :finalizedAt,
            updated_at = :updatedAt
        WHERE id = :id
    """)
    suspend fun updateStatusAndQueueStatus(
        id: String,
        status: String,
        queueStatus: String,
        finalizedAt: String?,
        updatedAt: String,
    )

    @Query("""
        UPDATE visits
        SET diagnosis = :diagnosis,
            medications = :medications,
            follow_up_instructions = :followUpInstructions,
            tests_ordered = :testsOrdered,
            updated_at = :updatedAt
        WHERE id = :id
    """)
    suspend fun updateClinicalSummary(
        id: String,
        diagnosis: String?,
        medications: String?,
        followUpInstructions: String?,
        testsOrdered: String?,
        updatedAt: String,
    )

    @Query("UPDATE visits SET is_synced = :isSynced WHERE id = :id")
    suspend fun updateSyncState(id: String, isSynced: Boolean)

    @Query("""
        UPDATE visits
        SET documentation_complete = :complete,
            documentation_completed_at = :completedAt,
            updated_at = :completedAt
        WHERE id = :id
    """)
    suspend fun updateDocumentationComplete(id: String, complete: Boolean, completedAt: String)

    @Query("SELECT COUNT(*) FROM visits WHERE clinic_id = :clinicId AND is_synced = 0")
    suspend fun getUnsyncedCount(clinicId: String): Int

    @Query("""
        UPDATE visits
        SET medications = :medications,
            pharmacy_order_submitted_at = :submittedAt,
            pharmacy_order_submitted_by = :submittedBy,
            dispensing_status = CASE
                WHEN dispensing_status = 'dispensed' THEN dispensing_status
                ELSE 'not_started'
            END,
            updated_at = :updatedAt
        WHERE id = :id
    """)
    suspend fun updatePharmacyOrderSubmitted(
        id: String,
        medications: String,
        submittedAt: String,
        submittedBy: String,
        updatedAt: String,
    )

    @Query("""
        UPDATE visits
        SET lab_status = :labStatus,
            lab_results = :labResults,
            lab_abnormal = :labAbnormal,
            lab_completed_at = :labCompletedAt,
            lab_completed_by = :labCompletedBy,
            updated_at = :updatedAt
        WHERE id = :id
    """)
    suspend fun updateLabState(
        id: String,
        labStatus: String,
        labResults: String?,
        labAbnormal: Boolean,
        labCompletedAt: String?,
        labCompletedBy: String?,
        updatedAt: String,
    )

    @Query("""
        UPDATE visits
        SET dispensing_status = :dispensingStatus,
            dispense_notes = :dispenseNotes,
            dispensed_at = :dispensedAt,
            dispensed_by = :dispensedBy,
            updated_at = :updatedAt
        WHERE id = :id
    """)
    suspend fun updateDispensingState(
        id: String,
        dispensingStatus: String,
        dispenseNotes: String?,
        dispensedAt: String?,
        dispensedBy: String?,
        updatedAt: String,
    )

    @Query("""
        SELECT * FROM visits
        WHERE clinic_id = :clinicId
          AND visit_date = :date
          AND tests_ordered IS NOT NULL
          AND TRIM(tests_ordered) <> ''
          AND lab_status IN ('pending', 'running')
        ORDER BY checked_in_at ASC
    """)
    suspend fun getLocalNeedsLabVisits(clinicId: String, date: String): List<VisitEntity>

    @Query("""
        SELECT * FROM visits
        WHERE clinic_id = :clinicId
          AND visit_date = :date
          AND medications IS NOT NULL
          AND TRIM(medications) <> ''
          AND pharmacy_order_submitted_at IS NOT NULL
          AND dispensing_status IN ('not_started', 'in_progress', 'partial', 'out_of_stock')
        ORDER BY pharmacy_order_submitted_at ASC
    """)
    suspend fun getLocalNeedsPharmacyVisits(clinicId: String, date: String): List<VisitEntity>

    @Query("""
        SELECT * FROM visits
        WHERE patient_id = :patientId
          AND visit_date = :date
        ORDER BY checked_in_at DESC
        LIMIT 1
    """)
    suspend fun getLatestVisitForPatientToday(patientId: String, date: String): VisitEntity?

    @Transaction
    @Query("""
        SELECT * FROM visits
        WHERE clinic_id = :clinicId
          AND visit_date = :date
          AND queue_status IN ('waiting', 'with_nurse', 'ready_for_doctor', 'with_doctor')
          AND documentation_complete = 0
        ORDER BY checked_in_at DESC
    """)
    fun getOpenEncountersToday(clinicId: String, date: String): Flow<List<VisitWithPatient>>

    /** All of today's visits with patient rows — OPD home dedupes by patient_id. */
    @Transaction
    @Query("""
        SELECT * FROM visits
        WHERE clinic_id = :clinicId
          AND visit_date = :date
        ORDER BY checked_in_at DESC
    """)
    fun getTodayVisitsWithPatients(clinicId: String, date: String): Flow<List<VisitWithPatient>>

    @Query("SELECT id FROM visits WHERE clinic_id = :clinicId AND visit_date = :date")
    suspend fun getTodayVisitIds(clinicId: String, date: String): List<String>
}
