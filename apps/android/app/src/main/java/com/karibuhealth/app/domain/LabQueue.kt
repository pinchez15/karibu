package com.karibuhealth.app.domain

import com.karibuhealth.app.domain.model.LabTestResultRow
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/** Per-test lab queue helpers — mirrors packages/shared/src/lab-queue.ts */
object LabQueue {

    private val json = Json { ignoreUnknownKeys = true }

    data class DerivedLabState(
        val labStatus: String,
        val labResults: String?,
        val labAbnormal: Boolean,
        val allComplete: Boolean,
    )

    fun parseTestsOrdered(testsOrdered: String?): List<String> {
        if (testsOrdered.isNullOrBlank()) return emptyList()
        return testsOrdered.split(",").map { it.trim() }.filter { it.isNotEmpty() }
    }

    fun parseStoredResults(jsonStr: String?): List<LabTestResultRow> {
        if (jsonStr.isNullOrBlank() || jsonStr == "[]") return emptyList()
        return runCatching {
            json.decodeFromString<List<StoredRow>>(jsonStr).map { it.toRow() }
        }.getOrDefault(emptyList())
    }

    fun encodeResults(rows: List<LabTestResultRow>): String =
        json.encodeToString(rows.map { StoredRow.from(it) })

    fun mergeLabTestResults(
        testsOrdered: String?,
        stored: List<LabTestResultRow>,
    ): List<LabTestResultRow> {
        val byName = stored.associateBy { it.test }
        return parseTestsOrdered(testsOrdered).map { name ->
            byName[name] ?: LabTestResultRow(test = name, status = "pending")
        }
    }

    fun countOpenTests(rows: List<LabTestResultRow>): Int =
        rows.count { it.status == "pending" || it.status == "running" }

    fun labTestSupportsPosNeg(testName: String): Boolean {
        val normalized = testName.lowercase()
        val catalog = LabCatalog.tests.find {
            it.name.lowercase() == normalized || it.code.lowercase() == normalized
        }
        if (catalog != null) {
            return catalog.code in QUALITATIVE_CODES
        }
        return Regex(
            "malaria|hiv|pregnancy|ucg|syphilis|rpr|tpha|widal|typhoid|h\\.?\\s*pylori|rdt|rapid|afb|tb\\s*smear|sputum",
            RegexOption.IGNORE_CASE,
        ).containsMatchIn(testName)
    }

    fun applyStartTest(rows: List<LabTestResultRow>, testName: String): List<LabTestResultRow> =
        rows.map { row ->
            if (row.test == testName && row.status == "pending") {
                row.copy(status = "running")
            } else {
                row
            }
        }

    fun applyRecordResult(
        rows: List<LabTestResultRow>,
        testName: String,
        result: String,
        abnormal: Boolean,
    ): List<LabTestResultRow> =
        rows.map { row ->
            if (row.test == testName) {
                row.copy(
                    status = if (abnormal) "abnormal" else "done",
                    result = result,
                    abnormal = abnormal,
                )
            } else {
                row
            }
        }

    fun deriveVisitLabState(rows: List<LabTestResultRow>): DerivedLabState {
        if (rows.isEmpty()) {
            return DerivedLabState("not_ordered", null, false, true)
        }
        val done = rows.count { it.status == "done" || it.status == "abnormal" }
        val abnormalCount = rows.count { it.abnormal || it.status == "abnormal" }
        val anyRunning = rows.any { it.status == "running" }
        val summary = rows
            .filter { it.status == "done" || it.status == "abnormal" }
            .joinToString("; ") { "${it.test}: ${it.result ?: "—"}" }
            .ifBlank { null }

        val status = when {
            done == 0 && !anyRunning -> "pending"
            done < rows.size -> "running"
            abnormalCount > 0 -> "abnormal"
            else -> "done"
        }
        return DerivedLabState(
            labStatus = status,
            labResults = summary,
            labAbnormal = abnormalCount > 0,
            allComplete = done == rows.size,
        )
    }

    private val QUALITATIVE_CODES = setOf(
        "MRDT", "BS_MPS", "HIV_RDT", "SYPHILIS", "UCG", "WIDAL", "STOOL_RDT", "AFB",
    )

    @Serializable
    private data class StoredRow(
        val test: String,
        val status: String,
        val result: String? = null,
        val abnormal: Boolean = false,
    ) {
        fun toRow() = LabTestResultRow(test, status, result, abnormal)
        companion object {
            fun from(row: LabTestResultRow) = StoredRow(row.test, row.status, row.result, row.abnormal)
        }
    }
}
