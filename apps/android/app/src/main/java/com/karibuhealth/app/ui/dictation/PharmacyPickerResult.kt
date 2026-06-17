package com.karibuhealth.app.ui.dictation

import com.karibuhealth.app.data.remote.dto.PrescriptionLineRpc

data class PharmacyPickerResult(
    val displaySig: String,
    val line: PrescriptionLineRpc,
)
