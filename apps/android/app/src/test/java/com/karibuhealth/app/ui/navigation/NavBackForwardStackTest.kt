package com.karibuhealth.app.ui.navigation

import org.junit.Assert.*
import org.junit.Test

class NavBackForwardStackTest {

    @Test
    fun `starts at root with no back or forward`() {
        val s = NavBackForwardStack("home")
        assertEquals("home", s.current)
        assertFalse(s.canGoBack)
        assertFalse(s.canGoForward)
    }

    @Test
    fun `push advances and enables back`() {
        val s = NavBackForwardStack("home")
        s.push("queue")
        assertEquals("queue", s.current)
        assertTrue(s.canGoBack)
        assertFalse(s.canGoForward)
    }

    @Test
    fun `back then forward returns to where you were`() {
        val s = NavBackForwardStack("home")
        s.push("queue")
        assertTrue(s.back())
        assertEquals("home", s.current)
        assertTrue(s.canGoForward)
        assertEquals("queue", s.forward())
        assertEquals("queue", s.current)
        assertFalse(s.canGoForward)
    }

    @Test
    fun `cannot go back past the root`() {
        val s = NavBackForwardStack("home")
        assertFalse(s.back())
        assertEquals("home", s.current)
    }

    @Test
    fun `forward returns null when nothing ahead`() {
        val s = NavBackForwardStack("home")
        s.push("queue")
        assertNull(s.forward())
    }

    @Test
    fun `a new push clears the forward stack`() {
        val s = NavBackForwardStack("home")
        s.push("queue")
        s.back() // forward = [queue]
        assertTrue(s.canGoForward)
        s.push("billing") // new navigation invalidates forward
        assertFalse(s.canGoForward)
        assertNull(s.forward())
        assertEquals("billing", s.current)
    }

    @Test
    fun `pushPopUpTo non-inclusive keeps the target and lands on route`() {
        val s = NavBackForwardStack("home")
        s.push("queue")
        s.push("checkin")
        // checkin -> visitDetails, popUpTo(queue) — keeps queue, drops checkin
        s.pushPopUpTo("visitDetails", target = "queue", inclusive = false)
        assertEquals(listOf("home", "queue", "visitDetails"), s.backStack())
        assertEquals("visitDetails", s.current)
    }

    @Test
    fun `pushPopUpTo inclusive removes the target too`() {
        val s = NavBackForwardStack("auth")
        // auth -> home, popUpTo(auth){inclusive} — auth removed, home is the new root
        s.pushPopUpTo("home", target = "auth", inclusive = true)
        assertEquals(listOf("home"), s.backStack())
        assertFalse(s.canGoBack)
    }

    @Test
    fun `pushPopUpTo to Home collapses a deep flow`() {
        val s = NavBackForwardStack("home")
        s.push("newVisit")
        s.push("vitals")
        // vitals -> dictation, popUpTo(home)
        s.pushPopUpTo("dictation", target = "home", inclusive = false)
        assertEquals(listOf("home", "dictation"), s.backStack())
    }

    @Test
    fun `reset collapses to a single root`() {
        val s = NavBackForwardStack("home")
        s.push("queue")
        s.push("checkin")
        s.reset("home")
        assertEquals(listOf("home"), s.backStack())
        assertFalse(s.canGoBack)
        assertFalse(s.canGoForward)
    }

    @Test
    fun `multi-step back and forward preserve order`() {
        val s = NavBackForwardStack("home")
        s.push("a")
        s.push("b")
        s.push("c")
        s.back() // at b, fwd=[c]
        s.back() // at a, fwd=[c,b]
        assertEquals("a", s.current)
        assertEquals("b", s.forward()) // next in flow
        assertEquals("c", s.forward())
        assertEquals("c", s.current)
        assertFalse(s.canGoForward)
    }
}
