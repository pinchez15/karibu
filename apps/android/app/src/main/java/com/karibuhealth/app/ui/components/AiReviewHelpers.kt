package com.karibuhealth.app.ui.components

import com.karibuhealth.app.data.remote.dto.AiReviewSuggestionDto
import com.karibuhealth.app.ui.dictation.NoteSection
import com.karibuhealth.app.ui.util.stripCitationArtifacts

data class DictationIncorporate(
    val suggestionId: String,
    val section: NoteSection,
    val prefill: String,
    val openLabPicker: Boolean = false,
    val openRxPicker: Boolean = false,
)

fun dedupeAiReviewSuggestions(suggestions: List<AiReviewSuggestionDto>): List<AiReviewSuggestionDto> {
    val pending = suggestions.filter { it.clinicianResponse == null }
    if (pending.size <= 1) return pending

    val kept = mutableListOf<AiReviewSuggestionDto>()
    for (candidate in pending) {
        val normQ = normalizeQuestion(candidate.question)
        val duplicate = kept.any { existing ->
            existing.suggestionType == candidate.suggestionType &&
                questionSimilarity(normalizeQuestion(existing.question), normQ) >= 0.72
        }
        if (!duplicate) kept.add(candidate)
    }
    return kept
}

fun incorporationFor(suggestion: AiReviewSuggestionDto): DictationIncorporate {
    val section = when (suggestion.suggestionType) {
        "ask_lab" -> NoteSection.TestsOrdered
        "ask_dx" -> NoteSection.Diagnosis
        "ask_med" -> NoteSection.Medications
        "ask_history" -> NoteSection.Hpi
        "ask_red_flag" -> NoteSection.PhysicalExam
        else -> NoteSection.AssessmentPlan
    }
    val prefill = "Consider: ${suggestion.question.trim()}"
    return DictationIncorporate(
        suggestionId = suggestion.id,
        section = section,
        prefill = prefill,
        openLabPicker = suggestion.suggestionType == "ask_lab",
        openRxPicker = suggestion.suggestionType == "ask_med",
    )
}

fun displayAiReasoning(reasoning: String): String = stripCitationArtifacts(reasoning)

private fun normalizeQuestion(text: String): String =
    text.lowercase()
        .replace(Regex("""[^\w\s]"""), " ")
        .replace(Regex("""\s+"""), " ")
        .trim()

private fun questionSimilarity(a: String, b: String): Double {
    if (a.isBlank() || b.isBlank()) return 0.0
    if (a == b) return 1.0
    val wordsA = a.split(" ").filter { it.length > 2 }.toSet()
    val wordsB = b.split(" ").filter { it.length > 2 }.toSet()
    if (wordsA.isEmpty() || wordsB.isEmpty()) return 0.0
    val intersection = wordsA.intersect(wordsB).size
    val union = wordsA.union(wordsB).size
    return intersection.toDouble() / union.toDouble()
}
