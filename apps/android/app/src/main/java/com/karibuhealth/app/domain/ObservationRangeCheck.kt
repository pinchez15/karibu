package com.karibuhealth.app.domain

/**
 * On-entry sanity check for ward observations (docs/hciii-inpatient-panel-spec.md,
 * Phase 1). Keypad-first entry one-handed by torchlight is exactly where a
 * fat-finger temp of 390 or BP of 1600/110 gets stored — and the append-only
 * model means a typo round can't be edited, only superseded, and a garbage value
 * can fire a false danger-sign alert or mask a real one.
 *
 * So before saving, every value is range-checked and the nurse is asked to
 * confirm anything implausible — generalising the existing `infant_high_fever`
 * "entered correctly?" prompt to all vitals, at ENTRY rather than at alert time.
 *
 * Ranges are deliberately wide: they catch transcription/typo errors (a misplaced
 * digit), not clinically extreme-but-real values. A genuinely extreme value is
 * confirmable; a typo is not what the nurse meant.
 */
object ObservationRangeCheck {

    data class Vitals(
        val tempC: Double? = null,
        val pulseBpm: Int? = null,
        val respRate: Int? = null,
        val bpSystolic: Int? = null,
        val bpDiastolic: Int? = null,
        val spo2Pct: Int? = null,
    )

    /**
     * Returns one human-readable confirmation prompt per implausible value, or an
     * empty list if everything is in range. A non-empty list should drive a
     * "entered correctly?" confirm before the round is saved.
     */
    fun check(v: Vitals): List<String> {
        val out = mutableListOf<String>()

        v.tempC?.let {
            if (it < 30.0 || it > 44.0) out += "Temperature ${trim(it)}°C looks unusual — entered correctly?"
        }
        v.pulseBpm?.let {
            if (it < 25 || it > 250) out += "Pulse $it bpm looks unusual — entered correctly?"
        }
        v.respRate?.let {
            if (it < 5 || it > 80) out += "Respiratory rate $it/min looks unusual — entered correctly?"
        }
        v.bpSystolic?.let {
            if (it < 50 || it > 280) out += "Systolic BP $it looks unusual — entered correctly?"
        }
        v.bpDiastolic?.let {
            if (it < 20 || it > 200) out += "Diastolic BP $it looks unusual — entered correctly?"
        }
        // Systolic should exceed diastolic; a swap or typo otherwise.
        if (v.bpSystolic != null && v.bpDiastolic != null && v.bpSystolic <= v.bpDiastolic) {
            out += "BP ${v.bpSystolic}/${v.bpDiastolic} — systolic should be higher than diastolic. Entered correctly?"
        }
        v.spo2Pct?.let {
            if (it < 50 || it > 100) out += "SpO₂ $it% looks unusual — entered correctly?"
        }

        return out
    }

    private fun trim(d: Double): String =
        if (d == d.toLong().toDouble()) d.toLong().toString() else d.toString()
}
