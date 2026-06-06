package com.karibuhealth.app.domain

import com.karibuhealth.app.domain.ObservationRangeCheck.Vitals
import org.junit.Assert.*
import org.junit.Test

class ObservationRangeCheckTest {

    @Test
    fun `plausible vitals produce no prompts`() {
        val r = ObservationRangeCheck.check(
            Vitals(tempC = 38.4, pulseBpm = 96, respRate = 22, bpSystolic = 124, bpDiastolic = 78, spo2Pct = 97),
        )
        assertTrue(r.isEmpty())
    }

    @Test
    fun `empty vitals produce no prompts`() {
        assertTrue(ObservationRangeCheck.check(Vitals()).isEmpty())
    }

    @Test
    fun `temperature typo is flagged`() {
        val r = ObservationRangeCheck.check(Vitals(tempC = 390.0))
        assertEquals(1, r.size)
        assertTrue(r[0].contains("Temperature"))
    }

    @Test
    fun `bp typo with extra digit is flagged`() {
        val r = ObservationRangeCheck.check(Vitals(bpSystolic = 1600, bpDiastolic = 110))
        assertTrue(r.any { it.contains("Systolic") })
    }

    @Test
    fun `systolic not above diastolic is flagged`() {
        val r = ObservationRangeCheck.check(Vitals(bpSystolic = 80, bpDiastolic = 120))
        assertTrue(r.any { it.contains("higher than diastolic") })
    }

    @Test
    fun `clinically extreme but real values are confirmable, not rejected`() {
        // A real septic-shock BP — flagged for confirm only if implausible; 85/50 is plausible.
        val r = ObservationRangeCheck.check(Vitals(bpSystolic = 85, bpDiastolic = 50, pulseBpm = 140))
        assertTrue(r.isEmpty())
    }

    @Test
    fun `spo2 above 100 is flagged`() {
        assertTrue(ObservationRangeCheck.check(Vitals(spo2Pct = 120)).isNotEmpty())
    }

    @Test
    fun `multiple typos each produce a prompt`() {
        val r = ObservationRangeCheck.check(Vitals(tempC = 390.0, pulseBpm = 900, respRate = 220))
        assertEquals(3, r.size)
    }
}
