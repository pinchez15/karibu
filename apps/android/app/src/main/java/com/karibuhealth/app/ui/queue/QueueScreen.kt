package com.karibuhealth.app.ui.queue

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.PersonAdd
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun QueueScreen(
    onNavigateBack: () -> Unit,
    onNavigateToCheckIn: () -> Unit,
    onNavigateToVisitDetails: (String) -> Unit,
    viewModel: QueueViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()
    var isRefreshing by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Patient Queue") },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    IconButton(onClick = onNavigateToCheckIn) {
                        Icon(Icons.Default.PersonAdd, contentDescription = "Check In")
                    }
                },
            )
        },
    ) { innerPadding ->
        PullToRefreshBox(
            isRefreshing = isRefreshing,
            onRefresh = {
                isRefreshing = true
                viewModel.refresh()
                isRefreshing = false
            },
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
        ) {
            if (uiState.queueItems.isEmpty()) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        if (uiState.isLoading) "Loading queue..." else "No patients in queue today",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            } else {
                LazyColumn(
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(uiState.queueItems, key = { it.visit.id }) { item ->
                        val visit = item.visit
                        val patient = item.patient

                        Card(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { onNavigateToVisitDetails(visit.id) },
                        ) {
                            Column(modifier = Modifier.padding(16.dp)) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(
                                            patient.displayName ?: patient.whatsappNumber ?: "Unknown",
                                            style = MaterialTheme.typography.bodyLarge,
                                            fontWeight = FontWeight.Medium,
                                        )
                                        patient.patientNumber?.let {
                                            Text(
                                                it,
                                                style = MaterialTheme.typography.bodySmall,
                                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                            )
                                        }
                                    }

                                    visit.queuePosition?.let { pos ->
                                        Text(
                                            "#$pos",
                                            style = MaterialTheme.typography.titleMedium,
                                            fontWeight = FontWeight.Bold,
                                            color = MaterialTheme.colorScheme.primary,
                                        )
                                    }
                                }

                                visit.chiefComplaint?.let { complaint ->
                                    Spacer(Modifier.height(4.dp))
                                    Text(
                                        complaint,
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }

                                Spacer(Modifier.height(8.dp))

                                Row(
                                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                                ) {
                                    QueueStatusChip(visit.queueStatus)

                                    if (visit.priority != "normal") {
                                        SuggestionChip(
                                            onClick = {},
                                            label = {
                                                Text(
                                                    visit.priority.uppercase(),
                                                    style = MaterialTheme.typography.labelSmall,
                                                )
                                            },
                                            colors = SuggestionChipDefaults.suggestionChipColors(
                                                containerColor = when (visit.priority) {
                                                    "urgent" -> MaterialTheme.colorScheme.error.copy(alpha = 0.1f)
                                                    "high" -> MaterialTheme.colorScheme.tertiary.copy(alpha = 0.1f)
                                                    else -> MaterialTheme.colorScheme.surfaceVariant
                                                },
                                            ),
                                        )
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun QueueStatusChip(queueStatus: String) {
    val (label, color) = when (queueStatus) {
        "waiting" -> "Waiting" to MaterialTheme.colorScheme.outline
        "with_nurse" -> "With Nurse" to MaterialTheme.colorScheme.tertiary
        "ready_for_doctor" -> "Ready" to MaterialTheme.colorScheme.primary
        "with_doctor" -> "With Doctor" to MaterialTheme.colorScheme.secondary
        "completed" -> "Done" to MaterialTheme.colorScheme.secondary
        "cancelled" -> "Cancelled" to MaterialTheme.colorScheme.error
        else -> queueStatus to MaterialTheme.colorScheme.outline
    }

    SuggestionChip(
        onClick = {},
        label = { Text(label, style = MaterialTheme.typography.labelSmall) },
        colors = SuggestionChipDefaults.suggestionChipColors(
            containerColor = color.copy(alpha = 0.1f),
            labelColor = color,
        ),
    )
}
