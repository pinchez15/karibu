package com.karibuhealth.app.domain

import com.karibuhealth.app.domain.OutbreakScreeningRules.VhfSymptom
import org.junit.Assert.*
import org.junit.Test

class OutbreakScreeningRulesTest {

    private fun input(
        tempC: Double? = null,
        contact: Boolean = false,
        bleeding: Boolean = false,
        symptoms: Set<VhfSymptom> = emptySet(),
    ) = OutbreakScreeningRules.Input(
        tempC = tempC,
        epidemiologicalContact = contact,
        unexplainedBleeding = bleeding,
        symptoms = symptoms,
    )

    @Test
    fun `no fever is never a suspect case`() {
        val r = OutbreakScreeningRules.screenEbola(
            input(tempC = 37.2, contact = true, bleeding = true),
        )
        assertFalse(r.isSuspect)
        assertTrue(r.triggers.isEmpty())
    }

    @Test
    fun `missing temperature is not a suspect case`() {
        val r = OutbreakScreeningRules.screenEbola(input(tempC = null, contact = true))
        assertFalse(r.isSuspect)
    }

    @Test
    fun `fever alone below the definition is not a suspect case`() {
        val r = OutbreakScreeningRules.screenEbola(input(tempC = 39.0))
        assertFalse(r.isSuspect)
        assertTrue(r.triggers.isEmpty())
    }

    @Test
    fun `fever plus epidemiological contact is a suspect case`() {
        val r = OutbreakScreeningRules.screenEbola(input(tempC = 38.5, contact = true))
        assertTrue(r.isSuspect)
        assertTrue(r.triggers.any { it.contains("contact", ignoreCase = true) })
    }

    @Test
    fun `fever plus unexplained bleeding is a suspect case`() {
        val r = OutbreakScreeningRules.screenEbola(input(tempC = 38.0, bleeding = true))
        assertTrue(r.isSuspect)
        assertTrue(r.triggers.any { it.contains("bleeding", ignoreCase = true) })
    }

    @Test
    fun `fever plus three symptoms is a suspect case`() {
        val r = OutbreakScreeningRules.screenEbola(
            input(
                tempC = 38.1,
                symptoms = setOf(
                    VhfSymptom.Headache,
                    VhfSymptom.Vomiting,
                    VhfSymptom.MusclePain,
                ),
            ),
        )
        assertTrue(r.isSuspect)
    }

    @Test
    fun `fever plus only two symptoms is below the threshold`() {
        val r = OutbreakScreeningRules.screenEbola(
            input(
                tempC = 38.1,
                symptoms = setOf(VhfSymptom.Headache, VhfSymptom.Vomiting),
            ),
        )
        assertFalse(r.isSuspect)
    }

    @Test
    fun `fever at exactly the threshold counts`() {
        val r = OutbreakScreeningRules.screenEbola(
            input(tempC = OutbreakScreeningRules.FEVER_THRESHOLD_C, contact = true),
        )
        assertTrue(r.isSuspect)
    }

    @Test
    fun `result is always tagged with the ebola protocol`() {
        val r = OutbreakScreeningRules.screenEbola(input(tempC = 36.5))
        assertEquals(OutbreakScreeningRules.EBOLA, r.protocol)
    }
}
