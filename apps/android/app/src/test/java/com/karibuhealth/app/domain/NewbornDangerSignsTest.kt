package com.karibuhealth.app.domain

import com.karibuhealth.app.domain.NewbornDangerSigns.Input
import org.junit.Assert.*
import org.junit.Test

class NewbornDangerSignsTest {

    private fun slugs(input: Input) = NewbornDangerSigns.evaluate(input).map { it.slug }

    @Test
    fun `healthy term newborn has no danger signs`() {
        assertTrue(slugs(Input(birthWeightG = 3200, tempC = 37.0, respRate = 44)).isEmpty())
    }

    @Test
    fun `low birth weight flagged as small baby`() {
        assertTrue(slugs(Input(birthWeightG = 2200)).contains("low_birth_weight"))
    }

    @Test
    fun `very low birth weight flagged for referral, not double-counted`() {
        val r = slugs(Input(birthWeightG = 1300))
        assertTrue(r.contains("very_low_birth_weight"))
        assertFalse(r.contains("low_birth_weight"))
    }

    @Test
    fun `hypothermia flagged below 36 point 5`() {
        assertTrue(slugs(Input(tempC = 35.8)).contains("hypothermia"))
        assertFalse(slugs(Input(tempC = 36.8)).contains("hypothermia"))
    }

    @Test
    fun `fast breathing flagged at or above 60`() {
        assertTrue(slugs(Input(respRate = 64)).contains("fast_breathing"))
        assertFalse(slugs(Input(respRate = 48)).contains("fast_breathing"))
    }

    @Test
    fun `symptom toggles each flag`() {
        val r = slugs(Input(notFeeding = true, convulsions = true, jaundice = true))
        assertTrue(r.containsAll(listOf("not_feeding", "convulsions", "jaundice")))
    }

    @Test
    fun `multiple signs accumulate`() {
        val r = slugs(Input(birthWeightG = 1800, tempC = 35.5, notFeeding = true))
        assertTrue(r.containsAll(listOf("low_birth_weight", "hypothermia", "not_feeding")))
    }

    @Test
    fun `care bundle includes warmth and feeding`() {
        assertTrue(NewbornDangerSigns.CARE_BUNDLE.any { it.contains("warm", ignoreCase = true) })
        assertTrue(NewbornDangerSigns.CARE_BUNDLE.any { it.contains("Feed", ignoreCase = true) })
    }
}
