package com.karibuhealth.app.ui.hivtb

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HivCareDetailScreen(
    onNavigateBack: () -> Unit,
    viewModel: HivCareDetailViewModel = hiltViewModel(),
) {
    val s by viewModel.state.collectAsState()
    val e = s.enrollment

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(e?.patientName ?: "HIV care") },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { padding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            s.error?.let { err ->
                item { Text(err, color = MaterialTheme.colorScheme.error) }
            }
            e?.let { enrollment ->
                item {
                    OutlinedCard(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            val status = if (enrollment.careStatus == "on_art") "On ART" else "Pre-ART"
                            Text(
                                "Enrolled ${enrollment.enrolledAt.take(10)} · $status" +
                                    (enrollment.artRegimen?.let { " · $it" } ?: ""),
                                fontWeight = FontWeight.Medium,
                            )
                            if (!enrollment.isSynced) {
                                Text(
                                    "Saved on device — will sync when online.",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                    }
                }
                item {
                    OutlinedCard(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text("Visit flags (HMIS 106a)", style = MaterialTheme.typography.labelLarge)
                            FlagRow("CPT at last visit", enrollment.cptAtLastVisit, s.saving) {
                                viewModel.updateFlags(cptAtLastVisit = it)
                            }
                            FlagRow("TB screened at last visit", enrollment.tbAssessedLastVisit, s.saving) {
                                viewModel.updateFlags(tbAssessedLastVisit = it)
                            }
                            FlagRow("Started TB treatment this quarter", enrollment.tbTreatmentStarted, s.saving) {
                                viewModel.updateFlags(tbTreatmentStarted = it)
                            }
                            if (enrollment.careStatus == "pre_art") {
                                Button(
                                    onClick = { viewModel.updateFlags(startArt = true) },
                                    enabled = !s.saving,
                                    modifier = Modifier.fillMaxWidth(),
                                ) { Text("Start ART (today)") }
                            }
                        }
                    }
                }
                item {
                    OutlinedCard(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text("Viral load", style = MaterialTheme.typography.labelLarge)
                            OutlinedTextField(
                                value = s.vlCopies,
                                onValueChange = viewModel::onVlCopiesChange,
                                modifier = Modifier.fillMaxWidth(),
                                label = { Text("Copies/mL") },
                                singleLine = true,
                            )
                            Button(
                                onClick = viewModel::recordViralLoad,
                                enabled = !s.saving,
                                modifier = Modifier.fillMaxWidth(),
                            ) { Text("Record viral load") }
                        }
                    }
                }
            }
            if (s.vlTests.isNotEmpty()) {
                item { Text("VL history", style = MaterialTheme.typography.labelLarge) }
                items(s.vlTests, key = { it.id }) { vl ->
                    OutlinedCard(Modifier.fillMaxWidth()) {
                        Row(
                            Modifier.fillMaxWidth().padding(12.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                        ) {
                            Text(vl.testDate.take(10))
                            val result = buildString {
                                if (vl.resultCopies != null) append("${vl.resultCopies} cp/mL")
                                when (vl.suppressed) {
                                    true -> append(" · suppressed")
                                    false -> append(" · not suppressed")
                                    null -> {}
                                }
                            }
                            Text(result.ifBlank { "—" }, style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun FlagRow(label: String, checked: Boolean, enabled: Boolean, onChange: (Boolean) -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Checkbox(checked = checked, onCheckedChange = onChange, enabled = enabled)
        Text(label, style = MaterialTheme.typography.bodyMedium)
    }
}
