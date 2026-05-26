package com.karibuhealth.app.data.sync

import com.karibuhealth.app.data.local.db.entity.VisitEntity
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class VisitMergeTest {

  @Test
  fun `preserves unsynced local clinical fields`() {
    val local = baseVisit(
      isSynced = false,
      chiefComplaint = "local complaint",
      diagnosis = "local dx",
      medications = "local meds",
    )
    val remote = baseVisit(
      isSynced = true,
      chiefComplaint = "remote complaint",
      diagnosis = "remote dx",
      medications = "remote meds",
    )

    val merged = VisitMerge.mergeRemote(local, remote)

    assertEquals("local complaint", merged.chiefComplaint)
    assertEquals("local dx", merged.diagnosis)
    assertEquals("local meds", merged.medications)
    assertEquals(false, merged.isSynced)
  }

  @Test
  fun `fills nullable local fields from remote when synced`() {
    val local = baseVisit(isSynced = true, diagnosis = null, pharmacyOrderSubmittedAt = null)
    val remote = baseVisit(
      isSynced = true,
      diagnosis = "remote dx",
      pharmacyOrderSubmittedAt = "2026-05-26T10:00:00Z",
    )

    val merged = VisitMerge.mergeRemote(local, remote)

    assertEquals("remote dx", merged.diagnosis)
    assertEquals("2026-05-26T10:00:00Z", merged.pharmacyOrderSubmittedAt)
  }

  @Test
  fun `keeps local pharmacy timestamp when present`() {
    val local = baseVisit(
      isSynced = false,
      pharmacyOrderSubmittedAt = "2026-05-26T09:00:00Z",
    )
    val remote = baseVisit(
      isSynced = true,
      pharmacyOrderSubmittedAt = "2026-05-26T11:00:00Z",
    )

    val merged = VisitMerge.mergeRemote(local, remote)
    assertEquals("2026-05-26T09:00:00Z", merged.pharmacyOrderSubmittedAt)
  }

  private fun baseVisit(
    isSynced: Boolean,
    chiefComplaint: String? = null,
    diagnosis: String? = null,
    medications: String? = null,
    pharmacyOrderSubmittedAt: String? = null,
  ) = VisitEntity(
    id = "v1",
    clinicId = "c1",
    patientId = "p1",
    doctorId = "d1",
    nurseId = null,
    status = "in_progress",
    queueStatus = "with_doctor",
    queuePosition = 1,
    priority = "normal",
    chiefComplaint = chiefComplaint,
    checkedInAt = "2026-05-26T08:00:00Z",
    reviewStatus = "pending",
    reviewedBy = null,
    reviewedAt = null,
    diagnosis = diagnosis,
    medications = medications,
    followUpInstructions = null,
    testsOrdered = null,
    visitDate = "2026-05-26",
    createdAt = "2026-05-26T08:00:00Z",
    updatedAt = "2026-05-26T08:00:00Z",
    finalizedAt = null,
    errorMessage = null,
    errorAt = null,
    pharmacyOrderSubmittedAt = pharmacyOrderSubmittedAt,
    isSynced = isSynced,
  )
}
