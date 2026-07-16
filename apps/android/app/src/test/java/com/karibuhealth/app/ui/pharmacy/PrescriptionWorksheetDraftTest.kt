package com.karibuhealth.app.ui.pharmacy

import com.karibuhealth.app.domain.model.PrescriptionOrderLine
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * PHARM-5 (R2) remainder unblock for the Android dispenser. Now that
 * `quantity_dispensed_so_far` rides the pull (prescription_orders_with_dispensed),
 * a `partially_dispensed` line is finishable on the tablet: [defaultDraft]
 * pre-fills the REMAINING balance (quantityPrescribed − quantityDispensedSoFar),
 * clamped to ≥ 0 so we can never default above remaining and trip the server's
 * `>=`-safe over-dispense guard.
 */
class PrescriptionWorksheetDraftTest {

    @Test
    fun defaultDraft_orderedLine_prefillsFullQuantity() {
        // Nothing dispensed yet: remaining == prescribed.
        val draft = defaultDraft(
            PrescriptionOrderLine(
                id = "line-1",
                freeTextName = "Amoxicillin 500mg",
                quantityPrescribed = 21.0,
                quantityUnit = "tab",
                status = "ordered",
                quantityDispensedSoFar = 0.0,
            ),
        )
        assertEquals("21", draft.quantityDispensed)
    }

    @Test
    fun defaultDraft_partialLine_prefillsRemainingBalance() {
        // 2 of 21 already dispensed -> 19 remaining, and the line is no longer blocked.
        val draft = defaultDraft(
            PrescriptionOrderLine(
                id = "line-2",
                freeTextName = "Amoxicillin 500mg",
                quantityPrescribed = 21.0,
                quantityUnit = "tab",
                status = "partially_dispensed",
                quantityDispensedSoFar = 2.0,
            ),
        )
        assertEquals("19", draft.quantityDispensed)
    }

    @Test
    fun defaultDraft_fullyDispensedPartial_clampsRemainingToZero() {
        // Never default above remaining, even if the accounting shows an over-dispense.
        val draft = defaultDraft(
            PrescriptionOrderLine(
                id = "line-3",
                freeTextName = "Amoxicillin 500mg",
                quantityPrescribed = 2.0,
                quantityUnit = "tab",
                status = "partially_dispensed",
                quantityDispensedSoFar = 2.0,
            ),
        )
        assertEquals("0", draft.quantityDispensed)
    }

    @Test
    fun defaultDraft_unknownPrescribedQuantity_prefillsNothing() {
        // legacy_text lines have no prescribed quantity: operator enters it by hand.
        val draft = defaultDraft(
            PrescriptionOrderLine(
                id = "line-4",
                freeTextName = "Amoxicillin (free text)",
                quantityPrescribed = null,
                status = "ordered",
            ),
        )
        assertEquals("", draft.quantityDispensed)
    }

    @Test
    fun defaultDraft_prefersDispenseUnitForQuantityUnit() {
        val draft = defaultDraft(
            PrescriptionOrderLine(
                id = "line-5",
                freeTextName = "Amoxicillin 500mg",
                quantityPrescribed = 21.0,
                quantityUnit = "each",
                dispenseUnit = "cap",
                status = "ordered",
            ),
        )
        assertEquals("cap", draft.quantityUnit)
    }
}
