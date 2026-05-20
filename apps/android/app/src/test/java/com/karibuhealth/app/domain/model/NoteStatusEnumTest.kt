package com.karibuhealth.app.domain.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Test

class NoteStatusEnumTest {

    @Test
    fun `enum carries the full lifecycle post migration 044`() {
        // Order doesn't matter at the DB layer, but the set must include
        // both new states migration 044 added — the mapper round-trips by
        // name so a missing entry silently downgrades the row to 'draft'.
        val present = NoteStatus.entries.map { it.name }.toSet()
        listOf("draft", "signed", "cosigned", "addended", "amended", "voided")
            .forEach { name ->
                assertNotNull("NoteStatus missing $name", NoteStatus.valueOf(name))
            }
        assertEquals(6, present.size)
    }
}
