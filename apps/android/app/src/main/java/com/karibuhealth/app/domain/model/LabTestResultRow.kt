package com.karibuhealth.app.domain.model

/** One ordered test on a visit (migration 075 lab_test_results). */
data class LabTestResultRow(
    val test: String,
    val status: String,
    val result: String? = null,
    val abnormal: Boolean = false,
)
