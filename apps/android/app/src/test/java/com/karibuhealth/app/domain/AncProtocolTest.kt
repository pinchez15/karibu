package com.karibuhealth.app.domain

import org.junit.Assert.*
import org.junit.Test
import java.time.LocalDate

class AncProtocolTest {

    private val today = LocalDate.of(2026, 6, 8)

    @Test
    fun `edd is lmp plus 280 days`() {
        assertEquals(LocalDate.of(2026, 1, 1).plusDays(280), AncProtocol.eddFromLmp(LocalDate.of(2026, 1, 1)))
    }

    @Test
    fun `gestation weeks computed from lmp`() {
        // 20 weeks before today
        val lmp = today.minusWeeks(20)
        assertEquals(20, AncProtocol.gestationWeeks(lmp, today))
        assertNull(AncProtocol.gestationWeeks(null, today))
    }

    @Test
    fun `contacts due follows the ANC8 schedule`() {
        assertEquals(0, AncProtocol.contactsDue(8))   // before first contact week
        assertEquals(1, AncProtocol.contactsDue(12))  // first contact
        assertEquals(2, AncProtocol.contactsDue(20))
        assertEquals(3, AncProtocol.contactsDue(26))
        assertEquals(8, AncProtocol.contactsDue(40))
        assertEquals(8, AncProtocol.contactsDue(45))  // capped at schedule size
    }

    @Test
    fun `anc behind when fewer contacts than due`() {
        val s = AncProtocol.status(lmp = today.minusWeeks(26), edd = null, contactsDone = 1, iptpDone = 1, today = today)
        assertTrue(s.ancBehind)
        assertTrue(s.gaps.any { it.startsWith("ANC 1/3") })
    }

    @Test
    fun `not behind when contacts keep up`() {
        val s = AncProtocol.status(lmp = today.minusWeeks(26), edd = null, contactsDone = 3, iptpDone = 3, today = today)
        assertFalse(s.ancBehind)
        assertFalse(s.iptpBehind)
        assertTrue(s.gaps.isEmpty())
    }

    @Test
    fun `iptp behind once second trimester and under target`() {
        val s = AncProtocol.status(lmp = today.minusWeeks(28), edd = null, contactsDone = 3, iptpDone = 1, today = today)
        assertTrue(s.iptpBehind)
        assertTrue(s.gaps.any { it.startsWith("IPTp 1/3") })
    }

    @Test
    fun `iptp not flagged in first trimester`() {
        val s = AncProtocol.status(lmp = today.minusWeeks(10), edd = null, contactsDone = 0, iptpDone = 0, today = today)
        assertFalse(s.iptpBehind)
    }

    @Test
    fun `due soon within 14 days of edd`() {
        val s = AncProtocol.status(lmp = null, edd = today.plusDays(7), contactsDone = 8, iptpDone = 3, today = today)
        assertTrue(s.dueSoon)
        assertFalse(s.postDates)
        assertTrue(s.gaps.contains("Due soon"))
    }

    @Test
    fun `post dates when past edd`() {
        val s = AncProtocol.status(lmp = null, edd = today.minusDays(3), contactsDone = 8, iptpDone = 3, today = today)
        assertTrue(s.postDates)
        assertFalse(s.dueSoon)
        assertTrue(s.gaps.contains("Post-dates"))
    }

    @Test
    fun `edd derived from lmp when not explicit`() {
        // LMP 39 weeks ago -> EDD ~1 week away -> due soon
        val s = AncProtocol.status(lmp = today.minusWeeks(39), edd = null, contactsDone = 8, iptpDone = 3, today = today)
        assertTrue(s.dueSoon)
    }
}
