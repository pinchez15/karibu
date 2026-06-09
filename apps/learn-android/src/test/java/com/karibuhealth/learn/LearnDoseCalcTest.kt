package com.karibuhealth.learn

import com.karibuhealth.learn.model.DoseBand
import com.karibuhealth.learn.model.DoseCalcSpec
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * Weight-based dosing is the clinically load-bearing piece of the calculator —
 * an under-dose risks treatment failure and resistance. These lock the WHO
 * artemether-lumefantrine bands and the total-tablet maths.
 */
class LearnDoseCalcTest {

    private val al = DoseCalcSpec(
        drug = "Artemether-Lumefantrine 20/120",
        startWeight = 62.4, minWeight = 5.0, dosesPerDay = 2, days = 3,
        bands = listOf(
            DoseBand(lo = 5.0, hi = 14.0, tabs = 1, label = "5–14"),
            DoseBand(lo = 15.0, hi = 24.0, tabs = 2, label = "15–24"),
            DoseBand(lo = 25.0, hi = 34.0, tabs = 3, label = "25–34"),
            DoseBand(lo = 35.0, hi = null, tabs = 4, label = "≥35"),
        ),
    )

    private fun tabsAt(w: Double) = al.bandFor(w)?.tabs
    private fun totalAt(w: Double): Int? = al.bandFor(w)?.let { it.tabs * al.dosesPerDay * al.days }

    @Test
    fun `adult at 62 kg gets 4 tablets per dose, 24 total`() {
        assertEquals(4, tabsAt(62.4))
        assertEquals(24, totalAt(62.4))
    }

    @Test
    fun `each WHO band maps to its tablet count`() {
        assertEquals(1, tabsAt(10.0))   // 5–14
        assertEquals(2, tabsAt(22.5))   // 15–24
        assertEquals(3, tabsAt(32.5))   // 25–34
        assertEquals(4, tabsAt(80.0))   // ≥35
    }

    @Test
    fun `band boundaries are inclusive and contiguous`() {
        assertEquals(1, tabsAt(5.0))    // lower edge of first band
        assertEquals(1, tabsAt(14.0))   // upper edge of first band
        assertEquals(2, tabsAt(15.0))   // lower edge of second band
        assertEquals(3, tabsAt(34.0))   // upper edge of third band
        assertEquals(4, tabsAt(35.0))   // lower edge of open-ended band
    }

    @Test
    fun `below minimum weight returns no band (refer)`() {
        assertNull(al.bandFor(4.9))
        assertNull(tabsAt(2.0))
    }

    @Test
    fun `open-ended top band has no upper bound`() {
        assertEquals(4, tabsAt(120.0))
    }
}
