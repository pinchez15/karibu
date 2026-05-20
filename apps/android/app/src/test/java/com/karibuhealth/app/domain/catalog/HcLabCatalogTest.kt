package com.karibuhealth.app.domain.catalog

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class HcLabCatalogTest {

    @Test
    fun `male patient does not see pregnancy tests`() {
        val filtered = HcLabCatalog.filtered(patientSex = "M", ageYears = 30)
        val codes = filtered.flatMap { cat -> cat.tests.map { it.code } }.toSet()

        assertFalse("URINE_PREG should be hidden for males", "URINE_PREG" in codes)
        assertFalse("HCG_QUANT should be hidden for males", "HCG_QUANT" in codes)
    }

    @Test
    fun `female patient sees pregnancy tests`() {
        val filtered = HcLabCatalog.filtered(patientSex = "F", ageYears = 28)
        val codes = filtered.flatMap { cat -> cat.tests.map { it.code } }.toSet()

        assertTrue("URINE_PREG should appear for females", "URINE_PREG" in codes)
    }

    @Test
    fun `unknown patient sex falls back to inclusive (female-only tests still visible)`() {
        // Until the patient sex is recorded the picker shouldn't hide
        // potentially-relevant tests — clinicians often add sex after the
        // first labs are ordered.
        val filtered = HcLabCatalog.filtered(patientSex = null, ageYears = 25)
        val codes = filtered.flatMap { cat -> cat.tests.map { it.code } }.toSet()

        assertTrue("URINE_PREG should be visible when sex is unknown", "URINE_PREG" in codes)
    }

    @Test
    fun `category with all tests filtered out drops from the result`() {
        // Pregnancy category contains only female-only tests. For a male
        // patient that category should disappear entirely so the picker
        // doesn't render an empty section.
        val filtered = HcLabCatalog.filtered(patientSex = "M", ageYears = 40)
        val pregnancyCategory = filtered.firstOrNull { it.id == "pregnancy" }

        assertEquals(null, pregnancyCategory)
    }

    @Test
    fun `malaria category is always visible`() {
        // Smoke test on the most commonly ordered HC III test. Catches an
        // accidental rename of the category id during a future catalog tidy.
        for (sex in listOf(null, "M", "F")) {
            val filtered = HcLabCatalog.filtered(patientSex = sex, ageYears = 30)
            val codes = filtered.flatMap { cat -> cat.tests.map { it.code } }.toSet()
            assertTrue("MAL_RDT should appear for sex=$sex", "MAL_RDT" in codes)
        }
    }
}
