package com.karibuhealth.app.domain.model

import com.karibuhealth.app.data.remote.dto.medicationsSummary
import com.karibuhealth.app.data.remote.dto.summaryText
import org.junit.Assert.assertEquals
import org.junit.Test

class PharmacyDispenseTest {

    @Test
    fun aggregateDispensingStatus_allDispensed() {
        assertEquals(
            "dispensed",
            aggregateDispensingStatus(listOf("dispensed", "dispensed")),
        )
    }

    @Test
    fun aggregateDispensingStatus_partialMix() {
        assertEquals(
            "partial",
            aggregateDispensingStatus(listOf("dispensed", "out_of_stock")),
        )
    }

    @Test
    fun aggregateDispensingStatus_returnedWhenNeedsClarificationOnly() {
        assertEquals(
            "returned",
            aggregateDispensingStatus(listOf("needs_clarification", "dispensed")),
        )
    }

    @Test
    fun pharmacyTabForVisit_nullWhenReturned() {
        assertEquals(null, pharmacyTabForVisit("returned", null))
    }

    @Test
    fun pharmacyTabForVisit_doneTodayWhenTerminalAndTimestamp() {
        assertEquals(
            PharmacyQueueTab.DoneToday,
            pharmacyTabForVisit("dispensed", "2026-06-16T12:00:00Z"),
        )
    }

    @Test
    fun pharmacyTabForVisit_waitingWhenNotStarted() {
        assertEquals(
            PharmacyQueueTab.Waiting,
            pharmacyTabForVisit("not_started", null),
        )
    }

    @Test
    fun pharmacyTabForVisit_inProgressWhenStarted() {
        assertEquals(
            PharmacyQueueTab.InProgress,
            pharmacyTabForVisit("in_progress", null),
        )
    }

    // PHARM-5 (R2): a partial visit still owes a balance and must stay in the working queue,
    // never DoneToday — even once a dispensedAt timestamp exists from the first partial.
    @Test
    fun pharmacyTabForVisit_partialStaysInProgressWithoutTimestamp() {
        assertEquals(
            PharmacyQueueTab.InProgress,
            pharmacyTabForVisit("partial", null),
        )
    }

    @Test
    fun pharmacyTabForVisit_partialStaysInProgressEvenWithTimestamp() {
        assertEquals(
            PharmacyQueueTab.InProgress,
            pharmacyTabForVisit("partial", "2026-06-16T12:00:00Z"),
        )
    }

    // out_of_stock keeps its prior behaviour: terminal + timestamp -> DoneToday.
    @Test
    fun pharmacyTabForVisit_outOfStockDoneTodayWithTimestamp() {
        assertEquals(
            PharmacyQueueTab.DoneToday,
            pharmacyTabForVisit("out_of_stock", "2026-06-16T12:00:00Z"),
        )
    }

    @Test
    fun prescriptionLineRpc_summaryText() {
        val line = com.karibuhealth.app.data.remote.dto.PrescriptionLineRpc(
            freeTextName = "Artemether/Lumefantrine",
            doseText = "1 tab",
            frequencyText = "BD",
        )
        assertEquals("Artemether/Lumefantrine 1 tab BD", line.summaryText())
    }

    @Test
    fun medicationsSummary_joinsLines() {
        val lines = listOf(
            com.karibuhealth.app.data.remote.dto.PrescriptionLineRpc(freeTextName = "A"),
            com.karibuhealth.app.data.remote.dto.PrescriptionLineRpc(freeTextName = "B"),
        )
        assertEquals("A\nB", lines.medicationsSummary())
    }
}
