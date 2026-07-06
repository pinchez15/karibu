package com.karibuhealth.app.util

import java.time.Instant
import java.time.OffsetDateTime
import java.time.format.DateTimeParseException

/**
 * Parse an ISO-8601 timestamp coming from the server.
 *
 * Postgres/Supabase `timestamptz` serializes the UTC offset as `+00:00`
 * (e.g. `2026-06-23T00:00:00+00:00`). `Instant.parse` uses `ISO_INSTANT`, which
 * only accepts the `Z` designator and throws on a numeric offset. Fall back to
 * the offset parser so both `...Z` and `...+00:00` forms are handled.
 */
fun parseServerInstant(text: String): Instant =
    try {
        Instant.parse(text)
    } catch (e: DateTimeParseException) {
        OffsetDateTime.parse(text).toInstant()
    }
