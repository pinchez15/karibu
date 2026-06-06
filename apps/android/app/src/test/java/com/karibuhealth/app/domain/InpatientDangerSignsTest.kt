package com.karibuhealth.app.domain

import com.karibuhealth.app.domain.InpatientDangerSigns.Observation
import org.junit.Assert.*
import org.junit.Test

class InpatientDangerSignsTest {

    private fun slugs(obs: Observation, age: Int?) =
        InpatientDangerSigns.evaluate(obs, age).map { it.slug }

    @Test
    fun `normal observation has no danger signs`() {
        val r = InpatientDangerSigns.evaluate(
            Observation(tempC = 37.2, pulseBpm = 88, respRate = 18, bpSystolic = 120, bpDiastolic = 78, spo2Pct = 98),
            ageYears = 30,
        )
        assertTrue(r.isEmpty())
    }

    @Test
    fun `fever at or above 39 is flagged`() {
        assertTrue(slugs(Observation(tempC = 39.0), 30).contains("high_fever"))
        assertFalse(slugs(Observation(tempC = 38.9), 30).contains("high_fever"))
    }

    @Test
    fun `hypoxia flagged only when spo2 present and low`() {
        assertTrue(slugs(Observation(spo2Pct = 88), 30).contains("hypoxia"))
        // Absence of SpO2 must not suppress nor invent a sign.
        assertTrue(InpatientDangerSigns.evaluate(Observation(spo2Pct = null), 30).isEmpty())
    }

    @Test
    fun `fast breathing is age-banded`() {
        assertFalse(slugs(Observation(respRate = 45), 0).contains("fast_breathing")) // infant threshold 50
        assertTrue(slugs(Observation(respRate = 52), 0).contains("fast_breathing"))  // infant >=50
        assertTrue(slugs(Observation(respRate = 42), 3).contains("fast_breathing"))  // 1-4y >=40
        assertFalse(slugs(Observation(respRate = 36), 3).contains("fast_breathing")) // 1-4y <40
        assertTrue(slugs(Observation(respRate = 32), 30).contains("fast_breathing")) // adult >30
        assertFalse(slugs(Observation(respRate = 28), 30).contains("fast_breathing"))
    }

    @Test
    fun `AVPU P or U flags reduced consciousness`() {
        assertTrue(slugs(Observation(avpu = "P"), 30).contains("reduced_consciousness"))
        assertTrue(slugs(Observation(avpu = "u"), 30).contains("reduced_consciousness"))
        assertFalse(slugs(Observation(avpu = "A"), 30).contains("reduced_consciousness"))
        assertFalse(slugs(Observation(avpu = "V"), 30).contains("reduced_consciousness"))
    }

    @Test
    fun `IMCI severe signs each flag a danger`() {
        val r = slugs(
            Observation(
                imciNotFeeding = true,
                imciVomitingEverything = true,
                imciConvulsions = true,
                imciLethargicUnconscious = true,
            ),
            4,
        )
        assertTrue(r.containsAll(listOf("imci_not_feeding", "imci_vomiting", "imci_convulsions", "imci_lethargic")))
    }

    @Test
    fun `adult shock and hypertensive crisis flagged, children skip BP rules`() {
        assertTrue(slugs(Observation(bpSystolic = 84, bpDiastolic = 50), 40).contains("shock"))
        assertTrue(slugs(Observation(bpSystolic = 190, bpDiastolic = 124), 40).contains("hypertensive_crisis"))
        // Child BP isn't scored by adult thresholds.
        assertFalse(slugs(Observation(bpSystolic = 84, bpDiastolic = 50), 3).contains("shock"))
    }

    @Test
    fun `unknown age skips age-dependent rules but keeps the rest`() {
        val r = slugs(Observation(tempC = 39.5, bpSystolic = 80, imciConvulsions = true), age = null)
        assertTrue(r.contains("high_fever"))
        assertTrue(r.contains("imci_convulsions"))
        assertFalse(r.contains("shock")) // BP rule needs known adult age
    }
}
