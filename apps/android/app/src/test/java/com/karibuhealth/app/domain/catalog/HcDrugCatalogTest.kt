package com.karibuhealth.app.domain.catalog

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class HcDrugCatalogTest {

    @Test
    fun `formatSig produces canonical order drug strength qty route freq duration`() {
        val amox = HcDrugCatalog.drugs.first { it.code == "AMOX" }

        val sig = HcDrugCatalog.formatSig(
            drug = amox,
            strength = "500mg cap",
            quantityText = "1 cap",
            frequency = HcDrugCatalog.Frequency.TID,
            route = HcDrugCatalog.Route.PO,
            durationDays = 5,
            notes = null,
        )

        assertEquals("Amoxicillin 500mg cap 1 cap PO TID x 5d", sig)
    }

    @Test
    fun `formatSig appends free-text notes in parentheses`() {
        val para = HcDrugCatalog.drugs.first { it.code == "PARA" }

        val sig = HcDrugCatalog.formatSig(
            drug = para,
            strength = "500mg tab",
            quantityText = "2 tabs",
            frequency = HcDrugCatalog.Frequency.QID,
            route = HcDrugCatalog.Route.PO,
            durationDays = null,
            notes = "hold if temp < 38",
        )

        assertEquals(
            "Paracetamol 500mg tab 2 tabs PO QID (hold if temp < 38)",
            sig,
        )
    }

    @Test
    fun `formatSig omits blank parts gracefully`() {
        val al = HcDrugCatalog.drugs.first { it.code == "AL" }

        val sig = HcDrugCatalog.formatSig(
            drug = al,
            strength = null,
            quantityText = "  ",
            frequency = HcDrugCatalog.Frequency.STAT,
            route = null,
            durationDays = null,
            notes = "  ",
        )

        // No strength, blank qty/route/duration; whitespace-only notes treated
        // as absent. Just drug + STAT.
        assertEquals("Artemether/Lumefantrine (AL) STAT", sig)
    }

    @Test
    fun `every drug exposes at least one default frequency or route`() {
        // Sanity check: the picker pre-fills the Sig builder from these. If
        // both are missing, the user has to fill in everything by hand —
        // worth catching here so we don't ship a regression that takes a
        // common drug entry back to zero-default.
        HcDrugCatalog.drugs.forEach { drug ->
            assertNotNull("Drug ${drug.code} missing default route", drug.defaultRoute)
            // Frequency is allowed to be null (e.g. PRN-only items), but
            // every drug should have a real category for grouping.
            assertTrue("Drug ${drug.code} has blank category", drug.category.isNotBlank())
        }
    }

    @Test
    fun `frequency codes match the abbreviations clinicians dictate`() {
        // The picker stores the .code value (BID, TID, etc.) — not the long
        // label. Regression-pin the canonical abbreviations so a rename in
        // the enum doesn't silently re-emit "twice daily" into the medications
        // free-text field.
        assertEquals("BID", HcDrugCatalog.Frequency.BID.code)
        assertEquals("TID", HcDrugCatalog.Frequency.TID.code)
        assertEquals("QID", HcDrugCatalog.Frequency.QID.code)
        assertEquals("PRN", HcDrugCatalog.Frequency.PRN.code)
        assertEquals("STAT", HcDrugCatalog.Frequency.STAT.code)
    }
}
