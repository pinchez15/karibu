package com.karibuhealth.app.ui.components

import com.karibuhealth.app.data.remote.dto.AiReviewSuggestionDto
import com.karibuhealth.app.ui.components.filterTimelineAiNotes
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
    fun filterTimelineAiNotes_hides_signed_and_post_sign() {
        val suggestions = listOf(
            dto("1", "Draft Q", phase = "draft"),
            dto("2", "Post sign", phase = "post_sign"),
        )
        assertEquals(1, filterTimelineAiNotes(suggestions, documentationComplete = false).size)
        assertTrue(filterTimelineAiNotes(suggestions, documentationComplete = true).isEmpty())
    }

    @Test
    fun dedupeAiReviewSuggestions_collapses_near_duplicate_phrasings() {
        // Same question, only word order / stopwords differ — these should collapse.
        val suggestions = listOf(
            dto("1", "Should we order an ECG for the patient?"),
            dto("2", "For the patient, should we order an ECG?"),
        )
        assertEquals(1, dedupeAiReviewSuggestions(suggestions).size)
    }

    @Test
    fun dedupeAiReviewSuggestions_keeps_clinically_distinct_questions() {
        // Related topic but genuinely different asks — must NOT be merged, or a
        // suggestion the clinician needs to see would be silently dropped.
        val suggestions = listOf(
            dto("1", "Should we perform an ECG for cardiac abnormalities?"),
            dto("2", "Should we evaluate cardiac causes of chest pain?"),
        )
        assertEquals(2, dedupeAiReviewSuggestions(suggestions).size)
    }

    private fun dto(id: String, question: String, phase: String = "draft") = AiReviewSuggestionDto(
        id = id,
        visitId = "visit-1",
        suggestionType = "ask_lab",
        question = question,
        reasoning = "Guideline reference.",
        confidence = "high",
        phase = phase,
    )
}
