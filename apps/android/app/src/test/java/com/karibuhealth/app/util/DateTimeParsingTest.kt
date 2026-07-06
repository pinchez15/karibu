package com.karibuhealth.app.util

import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.Instant

class DateTimeParsingTest {

    @Test
    fun `parses postgres +00-00 offset (the crash input)`() {
        assertEquals(
            Instant.parse("2026-06-23T00:00:00Z"),
            parseServerInstant("2026-06-23T00:00:00+00:00"),
        )
    }

    @Test
    fun `parses zulu Z form`() {
        assertEquals(
            Instant.parse("2026-06-23T00:00:00Z"),
            parseServerInstant("2026-06-23T00:00:00Z"),
        )
    }

    @Test
    fun `parses offset with fractional seconds`() {
        assertEquals(
            Instant.parse("2026-06-23T12:34:56.789Z"),
            parseServerInstant("2026-06-23T12:34:56.789+00:00"),
        )
    }

    @Test
    fun `parses non-utc offset`() {
        assertEquals(
            Instant.parse("2026-06-23T03:00:00Z"),
            parseServerInstant("2026-06-23T06:00:00+03:00"),
        )
    }
}
