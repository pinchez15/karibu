package com.karibuhealth.app.ui.components

import com.karibuhealth.app.data.remote.dto.AiReviewSuggestionDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AiReviewHelpersTest {

    @Test
    fun stripCitationArtifacts_removes_chunk_tags() {
        assertEquals(
            "Check ECG per guidelines.",
            displayAiReasoning("Check ECG per guidelines. [chunk_id=387]"),
        )
    }

    @Test
    fun dedupeAiReviewSuggestions_collapses_similar_questions() {
        val suggestions = listOf(
            dto("1", "Should we perform an ECG for cardiac abnormalities?"),
            dto("2", "Should we evaluate cardiac causes of chest pain?"),
        )
        assertEquals(1, dedupeAiReviewSuggestions(suggestions).size)
    }

    private fun dto(id: String, question: String) = AiReviewSuggestionDto(
        id = id,
        visitId = "visit-1",
        suggestionType = "ask_lab",
        question = question,
        reasoning = "Guideline reference.",
        confidence = "high",
    )
}
