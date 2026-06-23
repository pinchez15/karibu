package com.karibuhealth.app.ui.inpatient.chart

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.karibuhealth.app.domain.LabCatalog

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun AdmissionLabPanel(
    enabled: Boolean,
    testsOrdered: String?,
    onSubmit: (List<String>) -> Unit,
    modifier: Modifier = Modifier,
) {
    var selected by remember { mutableStateOf(setOf<String>()) }
    var error by remember { mutableStateOf<String?>(null) }

    Column(modifier = modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Order lab tests", style = MaterialTheme.typography.labelLarge)
        Text(
            "Pick from the catalog so the bench gets exact test names.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (!enabled) {
            Text(
                "Connect to order labs for this admission.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            return@Column
        }
        testsOrdered?.takeIf { it.isNotBlank() }?.let {
            Text("On chart: $it", style = MaterialTheme.typography.bodySmall)
        }
        LabCatalog.byCategory().forEach { (category, tests) ->
            Text(category, style = MaterialTheme.typography.labelMedium)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                tests.forEach { t ->
                    FilterChip(
                        selected = selected.contains(t.code),
                        onClick = {
                            selected = if (selected.contains(t.code)) {
                                selected - t.code
                            } else {
                                selected + t.code
                            }
                        },
                        label = { Text(t.name, style = MaterialTheme.typography.labelSmall) },
                    )
                }
            }
        }
        Button(
            onClick = {
                error = null
                val names = LabCatalog.tests.filter { selected.contains(it.code) }.map { it.name }
                if (names.isEmpty()) {
                    error = "Select at least one test"
                } else {
                    onSubmit(names)
                    selected = emptySet()
                }
            },
            enabled = selected.isNotEmpty(),
            modifier = Modifier.fillMaxWidth(),
        ) { Text("Send to lab") }
        error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
    }
}
