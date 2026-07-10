package com.karibuhealth.app.data.remote.dto

import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * Regression tests for the 1.0.32 field report: `provider_notes.structured_data`
 * is jsonb and holds a MIX of JSON strings (Android/web autosave write
 * stringified JSON) and real objects (AI pipeline / newer web paths). The
 * plain String DTO field exploded on the object rows with
 * "Unexpected JSON token … Expected beginning of the string, but got { at
 * path: $[0].structured_data", failing sync entries whose write had landed.
 */
class FlexibleJsonStringTest {

    private val json = Json { ignoreUnknownKeys = true }

    private fun note(structuredData: String) = """
        {"id":"n1","patient_id":"p1","visit_id":"v1","transcript":"t",
         "note_content":null,"structured_data":$structuredData,
         "status":"draft","created_at":"2026-07-09T12:00:00Z"}
    """.trimIndent()

    @Test
    fun `decodes structured_data as plain string`() {
        val dto = json.decodeFromString(ProviderNoteDto.serializer(), note("\"{\\\"hpi\\\": \\\"fever\\\"}\""))
        assertEquals("""{"hpi": "fever"}""", dto.structuredData)
    }

    @Test
    fun `decodes structured_data as empty object — the offset-471 field error`() {
        val dto = json.decodeFromString(ProviderNoteDto.serializer(), note("{}"))
        assertEquals("{}", dto.structuredData)
    }

    @Test
    fun `decodes structured_data as populated object — the offset-165 field error`() {
        val dto = json.decodeFromString(ProviderNoteDto.serializer(), note("""{"hpi": "", "diagnosis": ""}"""))
        assertEquals("""{"hpi":"","diagnosis":""}""", dto.structuredData)
    }

    @Test
    fun `decodes structured_data null and absent`() {
        assertNull(json.decodeFromString(ProviderNoteDto.serializer(), note("null")).structuredData)
        val absent = """{"id":"n1","patient_id":"p1","status":"draft","created_at":""}"""
        assertNull(json.decodeFromString(ProviderNoteDto.serializer(), absent).structuredData)
    }

    @Test
    fun `decodes inside a PostgREST array response — the dollar-0 path`() {
        val body = "[${note("{}")}]"
        val list = json.decodeFromString(ListSerializer(ProviderNoteDto.serializer()), body)
        assertEquals("{}", list.single().structuredData)
    }
}
