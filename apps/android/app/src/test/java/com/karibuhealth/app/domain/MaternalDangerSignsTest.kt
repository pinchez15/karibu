package com.karibuhealth.app.domain

import com.karibuhealth.app.domain.MaternalDangerSigns.Input
import org.junit.Assert.*
import org.junit.Test

class MaternalDangerSignsTest {

    private fun slugs(input: Input) = MaternalDangerSigns.evaluate(input).map { it.slug }

    @Test
    fun `normal observation triggers nothing`() {
        assertTrue(slugs(Input(bpSystolic = 118, bpDiastolic = 76, pulseBpm = 84)).isEmpty())
    }

    @Test
    fun `convulsions is eclampsia and carries MgSO4 dosing`() {
        val alerts = MaternalDangerSigns.evaluate(Input(convulsions = true))
        assertEquals(listOf("eclampsia"), alerts.map { it.slug })
        assertTrue(alerts.first().steps.any { it.contains("MgSO₄") })
    }

    @Test
    fun `severe hypertension flags pre-eclampsia`() {
        assertTrue(slugs(Input(bpSystolic = 165, bpDiastolic = 95)).contains("pre_eclampsia"))
        assertTrue(slugs(Input(bpSystolic = 145, bpDiastolic = 112)).contains("pre_eclampsia"))
    }

    @Test
    fun `mild hypertension needs a symptom to flag pre-eclampsia`() {
        assertFalse(slugs(Input(bpSystolic = 145, bpDiastolic = 92)).contains("pre_eclampsia"))
        assertTrue(slugs(Input(bpSystolic = 145, bpDiastolic = 92, headache = true)).contains("pre_eclampsia"))
    }

    @Test
    fun `blood loss over threshold flags PPH`() {
        assertTrue(slugs(Input(bloodLossMl = 600)).contains("pph"))
        assertFalse(slugs(Input(bloodLossMl = 300)).contains("pph"))
    }

    @Test
    fun `heavy bleeding flags PPH regardless of measured volume`() {
        assertTrue(slugs(Input(heavyBleeding = true)).contains("pph"))
    }

    @Test
    fun `post-delivery shock vitals flag PPH`() {
        assertTrue(slugs(Input(postDelivery = true, pulseBpm = 120, bpSystolic = 84)).contains("pph"))
        // Same vitals without the post-delivery context do not assume PPH.
        assertFalse(slugs(Input(postDelivery = false, pulseBpm = 120, bpSystolic = 84)).contains("pph"))
    }

    @Test
    fun `eclampsia and PPH can fire together`() {
        val r = slugs(Input(convulsions = true, bloodLossMl = 700))
        assertTrue(r.containsAll(listOf("eclampsia", "pph")))
    }

    @Test
    fun `HBB prompt carries bag-and-mask step`() {
        assertTrue(MaternalDangerSigns.HELPING_BABIES_BREATHE.steps.any { it.contains("bag-and-mask") })
    }
}
