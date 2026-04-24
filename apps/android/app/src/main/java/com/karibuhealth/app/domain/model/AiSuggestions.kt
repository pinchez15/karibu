package com.karibuhealth.app.domain.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

// Mirrors the JSON shape the structure-dictation Inngest function writes to
// provider_notes.structured_data. Defensive: every field is nullable / has a
// default so a malformed payload renders as "no suggestions" rather than
// crashing the review screen.

@Serializable
data class AiCitation(
    val title: String = "",
    val source: String = "",
    val url: String? = null,
)

@Serializable
data class AiDiagnosis(
    val name: String = "",
    val icd10: String? = null,
    val confidence: String = "low", // high | medium | low
    val rationale: String = "",
    val citations: List<AiCitation> = emptyList(),
)

@Serializable
data class AiMedication(
    val name: String = "",
    val dosage: String = "",
    val duration: String = "",
    val notes: String? = null,
)

@Serializable
data class AiTest(
    val name: String = "",
    val reason: String? = null,
)

@Serializable
data class AiFollowUp(
    val when_: String = "",
    val what: String = "",
) {
    companion object {
        // Inngest output uses 'when' which is a Kotlin keyword. Provide a
        // hand-rolled deserializer below; until then this default ctor is
        // here so the JSON parser doesn't blow up.
    }
}

@Serializable
data class AiStructuredSuggestions(
    val diagnoses: List<AiDiagnosis> = emptyList(),
    val medications: List<AiMedication> = emptyList(),
    @SerialName("tests_ordered") val testsOrdered: List<AiTest> = emptyList(),
    @SerialName("learning_note") val learningNote: String? = null,
    @SerialName("missing_info") val missingInfo: List<String> = emptyList(),
) {
    val isEmpty: Boolean
        get() = diagnoses.isEmpty() && learningNote.isNullOrBlank() && missingInfo.isEmpty()

    companion object {
        private val parser = Json {
            ignoreUnknownKeys = true
            coerceInputValues = true
            isLenient = true
        }

        /** Parse the provider_notes.structured_data JSON string. Returns null on any failure. */
        fun parseOrNull(raw: String?): AiStructuredSuggestions? {
            if (raw.isNullOrBlank()) return null
            return runCatching {
                parser.decodeFromString(serializer(), raw)
            }.getOrNull()
        }
    }
}
