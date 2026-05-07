package com.karibuhealth.app.ui.components

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier

/**
 * Step indicator chip used at the top of multi-step flows: e.g. "STEP 1 OF 3 · PATIENT".
 */
@Composable
fun KhStepIndicator(
    step: Int,
    totalSteps: Int,
    label: String,
    modifier: Modifier = Modifier,
) {
    KhMetaText(
        text = "STEP $step OF $totalSteps · $label",
        modifier = modifier,
    )
}
