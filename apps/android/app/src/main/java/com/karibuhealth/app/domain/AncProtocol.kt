package com.karibuhealth.app.domain

import java.time.LocalDate
import java.time.temporal.ChronoUnit

/**
 * ANC protocol scheduling + gap detection per Uganda MOH (docs/maternal-neonatal-research.md).
 * Pure and deterministic so the registry can flag "due / overdue / behind" without
 * the server. `today` is injectable for testing.
 *
 * Uganda adopted the WHO 8-contact model (ANC8). IPTp-SP target is >=3 doses from
 * the 2nd trimester. EDD = LMP + 280 days (Naegele).
 */
object AncProtocol {

    /** ANC8 recommended contact weeks (first by 12). */
    val SCHEDULE_WEEKS = listOf(12, 20, 26, 30, 34, 36, 38, 40)
    const val IPTP_TARGET = 3
    const val TERM_WEEKS = 40
    private const val IPTP_START_WEEK = 20  // 2nd trimester onward

    fun eddFromLmp(lmp: LocalDate): LocalDate = lmp.plusDays(280)

    fun gestationWeeks(lmp: LocalDate?, today: LocalDate = LocalDate.now()): Int? =
        lmp?.let { ChronoUnit.WEEKS.between(it, today).toInt().coerceAtLeast(0) }

    /** How many ANC8 contacts should have happened by this gestation. */
    fun contactsDue(gestationWeeks: Int?): Int =
        if (gestationWeeks == null) 0 else SCHEDULE_WEEKS.count { it <= gestationWeeks }

    data class Status(
        val gestationWeeks: Int?,
        val contactsDone: Int,
        val contactsDue: Int,
        val iptpDone: Int,
        val ancBehind: Boolean,
        val iptpBehind: Boolean,
        val dueSoon: Boolean,    // EDD within 14 days
        val postDates: Boolean,  // past EDD / >42 weeks
        /** Short human-readable gap chips for the registry. */
        val gaps: List<String>,
    )

    fun status(
        lmp: LocalDate?,
        edd: LocalDate?,
        contactsDone: Int,
        iptpDone: Int,
        today: LocalDate = LocalDate.now(),
    ): Status {
        val ga = gestationWeeks(lmp, today)
        val due = contactsDue(ga)
        val ancBehind = contactsDone < due
        // Behind on IPTp once the 2nd-trimester window is open and target not met.
        val iptpBehind = (ga != null && ga >= IPTP_START_WEEK && iptpDone < IPTP_TARGET)
        val effectiveEdd = edd ?: lmp?.let { eddFromLmp(it) }
        val postDates = effectiveEdd != null && today.isAfter(effectiveEdd)
        val dueSoon = effectiveEdd != null && !postDates &&
            !today.isAfter(effectiveEdd) &&
            ChronoUnit.DAYS.between(today, effectiveEdd) <= 14

        val gaps = buildList {
            if (ancBehind) add("ANC $contactsDone/$due")
            if (iptpBehind) add("IPTp $iptpDone/$IPTP_TARGET")
            if (postDates) add("Post-dates")
            else if (dueSoon) add("Due soon")
        }
        return Status(ga, contactsDone, due, iptpDone, ancBehind, iptpBehind, dueSoon, postDates, gaps)
    }
}
