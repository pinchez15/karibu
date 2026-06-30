package com.karibuhealth.app.domain

import com.karibuhealth.app.domain.model.PharmacyQueueTab
import com.karibuhealth.app.domain.model.pharmacyTabForVisit
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * End-to-end data-shape checks for clinician → lab bench → pharmacy desk on
 * Android without the web app. Local Room is the source of truth until sync.
 */
class VisitClinicalOrdersTest {

    @Test
    fun submitLabOrder_mergesCatalogNamesAndCreatesPendingPerTestRows() {
        val existing = "Malaria RDT"
        val added = listOf("HIV RDT", "Malaria RDT")
        val merged = (LabQueue.parseTestsOrdered(existing) + added).distinct()
        val testsOrdered = merged.joinToString(", ")
        val rows = LabQueue.mergeLabTestResults(testsOrdered, emptyList())

        assertEquals(listOf("Malaria RDT", "HIV RDT"), rows.map { it.test })
        assertTrue(rows.all { it.status == "pending" })
        assertEquals(2, LabQueue.countOpenTests(rows))
    }

    @Test
    fun labBench_seesOpenTestsAfterClinicianOrder() {
        val testsOrdered = "Malaria RDT, Urine dipstick"
        val rows = LabQueue.mergeLabTestResults(testsOrdered, emptyList())
            .filter { it.status == "pending" || it.status == "running" }

        assertEquals(2, rows.size)
        assertEquals("pending", rows.first { it.test == "Malaria RDT" }.status)
    }

    @Test
    fun pharmacyQueue_waitingAfterOrderSubmittedBeforeDispense() {
        assertEquals(
            PharmacyQueueTab.Waiting,
            pharmacyTabForVisit("not_started", dispensedAt = null),
        )
        assertEquals(
            PharmacyQueueTab.InProgress,
            pharmacyTabForVisit("in_progress", dispensedAt = null),
        )
        assertEquals(
            PharmacyQueueTab.DoneToday,
            pharmacyTabForVisit("dispensed", dispensedAt = "2026-06-30T10:00:00Z"),
        )
    }

    @Test
    fun labSupportsPosNeg_forHcIiiQualitativeTests() {
        assertTrue(LabQueue.labTestSupportsPosNeg("Malaria RDT"))
        assertTrue(LabQueue.labTestSupportsPosNeg("HIV RDT"))
    }
}
