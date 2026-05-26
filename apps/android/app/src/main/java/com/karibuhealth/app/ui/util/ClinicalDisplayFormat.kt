package com.karibuhealth.app.ui.util

import java.util.Locale

/** Shared bottom inset so scroll content clears fixed Scaffold bottom bars. */
val BottomBarScrollPadding = 96

private val chunkCitationRegex = Regex("""\[chunk_id=\d+]""")

fun stripCitationArtifacts(text: String): String =
    text.replace(chunkCitationRegex, "")
        .replace(Regex("""\s{2,}"""), " ")
        .trim()

fun formatPatientName(firstName: String?, lastName: String?, displayName: String? = null): String {
    val raw = listOfNotNull(firstName, lastName)
        .joinToString(" ")
        .ifBlank { displayName.orEmpty() }
    if (raw.isBlank()) return "Unknown"
    return raw.split(Regex("""\s+"""))
        .filter { it.isNotBlank() }
        .joinToString(" ") { word ->
            word.replaceFirstChar { ch ->
                if (ch.isLowerCase()) ch.titlecase(Locale.getDefault()) else ch.toString()
            }
        }
}

/** Sentence-case for short clinical labels (diagnosis, etc.). */
fun formatClinicalLine(value: String): String {
    val trimmed = value.trim()
    if (trimmed.isBlank()) return trimmed
    return trimmed.replaceFirstChar { ch ->
        if (ch.isLowerCase()) ch.titlecase(Locale.getDefault()) else ch.toString()
    }
}

/** Split comma/newline-separated clinical lists for bullet display. */
fun formatClinicalList(value: String): List<String> =
    value.split(Regex("""[,;\n]+"""))
        .map { it.trim().replace(Regex("""\s+,"""), ",") }
        .filter { it.isNotBlank() }
        .map { formatClinicalLine(it) }
