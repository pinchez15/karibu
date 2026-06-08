package com.karibuhealth.app.ui.inpatient

import androidx.compose.foundation.clickable
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
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.karibuhealth.app.data.inpatient.ObsOverdueWorker
import com.karibuhealth.app.data.local.db.dao.AdmissionCensusRow
import java.time.Duration
import java.time.Instant

/**
 * Shift handover (docs/hciii-inpatient-panel-spec.md, Phase 4). A dense, ward-
 * grouped read of every active admission so a single nurse can hand over safely:
 * who is in, how long, and who is overdue for observation. Derived from the
 * census — no new data.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WardHandoverScreen(
    onNavigateBack: () -> Unit,
    onOpenAdmission: (String) -> Unit,
    viewModel: WardCensusViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()
    val byWard = state.rows.groupBy { it.admission.ward }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Handover") },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { padding ->
        if (state.rows.isEmpty()) {
            Column(Modifier.fillMaxSize().padding(padding).padding(32.dp)) {
                Text(
                    "No one is admitted right now.",
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            return@Scaffold
        }
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            listOf("maternity" to "Maternity", "general" to "General").forEach { (ward, label) ->
                val rows = byWard[ward].orEmpty()
                if (rows.isNotEmpty()) {
                    item(key = "h-$ward") {
                        Text(
                            "$label (${rows.size})",
                            style = MaterialTheme.typography.labelLarge,
                            modifier = Modifier.padding(top = 4.dp),
                        )
                    }
                    items(rows, key = { "hr-${it.admission.id}" }) { row ->
                        HandoverRow(row, onClick = { onOpenAdmission(row.admission.id) })
                    }
                }
            }
        }
    }
}

@Composable
private fun HandoverRow(row: AdmissionCensusRow, onClick: () -> Unit) {
    val a = row.admission
    val overdue = isObsOverdue(row.lastObservedAt, a.admittedAt)
    OutlinedCard(modifier = Modifier.fillMaxWidth().clickable(onClick = onClick)) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(a.patientName ?: "Patient", fontWeight = FontWeight.SemiBold)
                Text(
                    a.bedLabel?.let { "Bed $it" } ?: "",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            val line = listOfNotNull(
                dayOfStay(a.admittedAt),
                a.chiefComplaint?.takeIf { it.isNotBlank() },
            ).joinToString(" · ")
            if (line.isNotBlank()) {
                Text(line, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Text(
                lastObsLabel(row.lastObservedAt) + if (overdue) " — OVERDUE" else "",
                style = MaterialTheme.typography.labelMedium,
                fontWeight = if (overdue) FontWeight.Bold else FontWeight.Normal,
                color = if (overdue) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

private fun isObsOverdue(lastObservedAt: String?, admittedAt: String): Boolean {
    val ref = lastObservedAt ?: admittedAt
    val at = runCatching { Instant.parse(ref) }.getOrNull() ?: return false
    return Duration.between(at, Instant.now()).toHours() >= ObsOverdueWorker.OBS_OVERDUE_HOURS
}

private fun dayOfStay(admittedAt: String): String = runCatching {
    "Day ${Duration.between(Instant.parse(admittedAt), Instant.now()).toDays() + 1}"
}.getOrDefault("")

private fun lastObsLabel(lastObservedAt: String?): String {
    if (lastObservedAt.isNullOrBlank()) return "No obs yet"
    return runCatching {
        val mins = Duration.between(Instant.parse(lastObservedAt), Instant.now()).toMinutes()
        when {
            mins < 60 -> "Obs ${mins}m ago"
            mins < 1440 -> "Obs ${mins / 60}h ago"
            else -> "Obs ${mins / 1440}d ago"
        }
    }.getOrDefault("")
}
