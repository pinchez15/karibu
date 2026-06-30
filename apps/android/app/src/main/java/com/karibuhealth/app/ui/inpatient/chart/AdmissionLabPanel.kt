package com.karibuhealth.app.ui.inpatient.chart

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.karibuhealth.app.ui.components.VisitLabOrderPanel

/** Inpatient chart wrapper around the shared catalog lab order panel. */
@Composable
fun AdmissionLabPanel(
    enabled: Boolean,
    testsOrdered: String?,
    onSubmit: (List<String>) -> Unit,
    modifier: Modifier = Modifier,
) {
    if (!enabled) return
    VisitLabOrderPanel(
        testsOrdered = testsOrdered,
        onSubmit = onSubmit,
        modifier = modifier,
    )
}
