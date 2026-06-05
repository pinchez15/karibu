package com.karibuhealth.app.domain

import com.karibuhealth.app.domain.model.Patient
import com.karibuhealth.app.domain.model.PatientVitals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

/**
 * The danger-sign rules are clinically load-bearing — an under- or mis-fired
 * alert has patient-safety consequences. These lock the HC III thresholds and
 * the acuity tier each rule maps to.
 */
class CriticalAlertRulesTest {

    private fun patient(dob: String?): Patient = Patient(
        id = "p", clinicId = "c", patientId = null, patientNumber = null,
        firstName = null, lastName = null, displayName = null, whatsappNumber = null,
        dateOfBirth = dob, sex = null, createdAt = "", updatedAt = "",
    )

    private fun vitals(
        temp: Double? = null, spo2: Int? = null, sys: Int? = null,
        dia: Int? = null, rr: Int? = null, muac: Double? = null,
    ) = PatientVitals(
        id = "v", patientId = "p", visitId = "vis", recordedAt = "", recordedBy = null,
        weightKg = null, heightCm = null, tempC = temp, bpSystolic = sys, bpDiastolic = dia,
        pulseBpm = null, respRate = rr, spo2Pct = spo2, muacCm = muac, notes = null,
    )

    // Ages computed off today's date so the same now() the rule engine uses.
    private fun dobYears(n: Long) = LocalDate.now().minusYears(n).toString()
    private fun dobMonths(n: Long) = LocalDate.now().minusMonths(n).toString()

    private fun slugs(p: Patient?, v: PatientVitals?) =
        CriticalAlertRules.evaluate(p, v).map { it.ruleSlug }

    @Test
    fun `no vitals yields no alerts`() {
        assertTrue(CriticalAlertRules.evaluate(patient(dobYears(2)), null).isEmpty())
    }

    @Test
    fun `hypoxia is critical below 90 and silent at 90+`() {
        assertTrue(slugs(patient(dobYears(30)), vitals(spo2 = 88)).contains("hypoxia"))
        assertTrue(!slugs(patient(dobYears(30)), vitals(spo2 = 90)).contains("hypoxia"))
        val hypoxia = CriticalAlertRules.evaluate(patient(dobYears(30)), vitals(spo2 = 88))
            .first { it.ruleSlug == "hypoxia" }
        assertEquals(AlertTier.Critical, hypoxia.tier)
    }

    @Test
    fun `hyperpyrexia fires at 40C for any age`() {
        assertTrue(slugs(patient(dobMonths(6)), vitals(temp = 40.0)).contains("hyperpyrexia"))
        assertTrue(slugs(patient(dobYears(40)), vitals(temp = 41.2)).contains("hyperpyrexia"))
        assertTrue(!slugs(patient(dobYears(40)), vitals(temp = 39.8)).contains("hyperpyrexia"))
    }

    @Test
    fun `fast breathing uses age-banded IMCI thresholds`() {
        assertTrue(slugs(patient(dobMonths(6)), vitals(rr = 52)).contains("fast_breathing")) // infant >=50
        assertTrue(!slugs(patient(dobMonths(6)), vitals(rr = 48)).contains("fast_breathing"))
        assertTrue(slugs(patient(dobYears(3)), vitals(rr = 42)).contains("fast_breathing"))   // 1-4y >=40
        assertTrue(slugs(patient(dobYears(40)), vitals(rr = 32)).contains("fast_breathing"))  // adult >=30
        assertTrue(!slugs(patient(dobYears(40)), vitals(rr = 28)).contains("fast_breathing"))
    }

    @Test
    fun `severe BP rules only fire for adolescents and adults`() {
        assertTrue(slugs(patient(dobYears(40)), vitals(sys = 188, dia = 100)).contains("hypertensive_crisis"))
        assertTrue(slugs(patient(dobYears(40)), vitals(sys = 82, dia = 50)).contains("severe_hypotension"))
        // A child's BP must not trip the adult thresholds.
        assertTrue(!slugs(patient(dobYears(8)), vitals(sys = 188, dia = 100)).contains("hypertensive_crisis"))
        assertTrue(!slugs(patient(dobYears(8)), vitals(sys = 82)).contains("severe_hypotension"))
    }

    @Test
    fun `severe acute malnutrition fires for under-fives below MUAC 11_5`() {
        assertTrue(slugs(patient(dobYears(3)), vitals(muac = 11.0)).contains("severe_acute_malnutrition"))
        assertTrue(!slugs(patient(dobYears(3)), vitals(muac = 12.0)).contains("severe_acute_malnutrition"))
    }

    @Test
    fun `infant high fever is a calm data-confirmation, not red`() {
        val candidates = CriticalAlertRules.evaluate(patient(dobMonths(6)), vitals(temp = 39.5))
        val infant = candidates.first { it.ruleSlug == "infant_high_fever" }
        assertEquals(AlertTier.Confirm, infant.tier)
        // At >=40 it escalates to hyperpyrexia (critical) instead of the confirm.
        val hot = slugs(patient(dobMonths(6)), vitals(temp = 40.0))
        assertTrue(hot.contains("hyperpyrexia"))
        assertTrue(!hot.contains("infant_high_fever"))
    }

    @Test
    fun `tierFor maps danger signs to Critical and confirms to calm`() {
        assertEquals(AlertTier.Critical, CriticalAlertRules.tierFor("hypoxia"))
        assertEquals(AlertTier.Critical, CriticalAlertRules.tierFor("hypertensive_crisis"))
        assertEquals(AlertTier.Confirm, CriticalAlertRules.tierFor("infant_high_fever"))
        assertEquals(AlertTier.Confirm, CriticalAlertRules.tierFor("unknown_rule"))
    }

    @Test
    fun `every emitted candidate carries the tier of its slug`() {
        val candidates = CriticalAlertRules.evaluate(patient(dobYears(40)), vitals(spo2 = 80, sys = 190, dia = 130))
        assertTrue(candidates.isNotEmpty())
        candidates.forEach { assertEquals(CriticalAlertRules.tierFor(it.ruleSlug), it.tier) }
        assertNull(candidates.firstOrNull { it.ruleSlug == "infant_high_fever" })
    }
}
