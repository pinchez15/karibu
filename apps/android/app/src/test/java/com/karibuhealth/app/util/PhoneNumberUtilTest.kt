package com.karibuhealth.app.util

import org.junit.Assert.*
import org.junit.Test

class PhoneNumberUtilTest {

    @Test
    fun `formats local Uganda number with leading zero`() {
        assertEquals("+256701234567", formatPhoneNumber("0701234567"))
    }

    @Test
    fun `formats number without country code`() {
        assertEquals("+256701234567", formatPhoneNumber("701234567"))
    }

    @Test
    fun `preserves valid international format`() {
        assertEquals("+256701234567", formatPhoneNumber("+256701234567"))
    }

    @Test
    fun `strips spaces and dashes`() {
        assertEquals("+256701234567", formatPhoneNumber("+256 701 234 567"))
        assertEquals("+256701234567", formatPhoneNumber("+256-701-234-567"))
    }

    @Test
    fun `validates correct Uganda phone`() {
        assertTrue(isValidUgandaPhone("+256701234567"))
        assertTrue(isValidUgandaPhone("0701234567"))
        assertTrue(isValidUgandaPhone("701234567"))
    }

    @Test
    fun `rejects invalid phone numbers`() {
        assertFalse(isValidUgandaPhone(""))
        assertFalse(isValidUgandaPhone("123"))
        assertFalse(isValidUgandaPhone("+1234567890"))
        assertFalse(isValidUgandaPhone("+25670123")) // Too short
        assertFalse(isValidUgandaPhone("+2567012345678")) // Too long
    }

    @Test
    fun `validates MTN and Airtel prefixes`() {
        assertTrue(isValidUgandaPhone("+256770123456")) // MTN
        assertTrue(isValidUgandaPhone("+256750123456")) // Airtel
        assertTrue(isValidUgandaPhone("+256200123456")) // Landline format
    }
}
