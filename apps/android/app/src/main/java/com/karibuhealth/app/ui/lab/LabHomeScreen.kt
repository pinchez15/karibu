package com.karibuhealth.app.ui.lab

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.karibuhealth.app.domain.LabQueue

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LabHomeScreen(
    onNavigateToVisit: (String) -> Unit,
    viewModel: LabHomeViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()
    val openCount = uiState.items.sumOf { LabQueue.countOpenTests(it.tests) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("Lab bench")
                        Text(
                            "$openCount tests · ${uiState.items.size} patients",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                },
            )
        },
    ) { padding ->
        PullToRefreshBox(
            isRefreshing = uiState.isLoading,
            onRefresh = { viewModel.refresh() },
            modifier = Modifier.padding(padding),
        ) {
            Column(modifier = Modifier.fillMaxSize()) {
                uiState.error?.let { msg ->
                    Card(
                        colors = CardDefaults.cardColors(
                            containerColor = MaterialTheme.colorScheme.errorContainer,
                        ),
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 8.dp),
                    ) {
                        Row(
                            modifier = Modifier.padding(12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                text = msg,
                                modifier = Modifier.weight(1f),
                                color = MaterialTheme.colorScheme.onErrorContainer,
                                style = MaterialTheme.typography.bodySmall,
                            )
                            TextButton(onClick = viewModel::dismissError) {
                                Text("Dismiss")
                            }
                        }
                    }
                }
                if (uiState.items.isEmpty() && !uiState.isLoading) {
                    Box(Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
                        Text(
                            "No pending lab work. Tests appear when a clinician orders labs on a visit.",
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                } else {
                    LabQueueList(
                        items = uiState.items,
                        busyKey = uiState.actionKey,
                        onStartTest = viewModel::startLabTest,
                        onRecordTest = viewModel::recordLabTestResult,
                        modifier = Modifier
                            .fillMaxSize()
                            .padding(horizontal = 16.dp, vertical = 8.dp),
                    )
                }
            }
        }
    }
}
