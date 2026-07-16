package com.karibuhealth.app.ui.pharmacy

import com.karibuhealth.app.domain.model.PrescriptionOrderLine
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * PHARM-5 (R2) interim safety valve for the Android dispenser: a `partially_dispensed`
 * line must not pre-fill a dispense quantity and must be blocked, so we never enqueue a
 * doomed full-quantity over-dispense op (sync-queue poison).
 */
class PrescriptionWorksheetDraftTest {

    @Test
    fun defaultDraft_orderedLine_prefillsFullQuantityAndIsNotBlocked() {
        val draft = defaultDraft(
            PrescriptionOrderLine(
                id = "line-1",
                freeTextName = "Amoxicillin 500mg",
                quantityPrescribed = 21.0,
                quantityUnit = "tab",
                status = "ordered",
            ),
        )
        assertEquals("21", draft.quantityDispensed)
        assertFalse(draft.isPartialBlocked)
    }

    @Test
    fun defaultDraft_partialLine_isBlockedAndDoesNotPrefillQuantity() {
        val draft = defaultDraft(
            PrescriptionOrderLine(
                id = "line-2",
                freeTextName = "Amoxicillin 500mg",
                quantityPrescribed = 21.0,
                quantityUnit = "tab",
                status = "partially_dispensed",
            ),
        )
        // No pre-filled quantity: prevents defaulting to the full prescribed amount, which
        // the server would reject as an over-dispense (permanent 400 / sync poison).
        assertEquals("", draft.quantityDispensed)
        assertTrue(draft.isPartialBlocked)
    }
}
