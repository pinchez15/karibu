package com.karibuhealth.app.ui.hivtb

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
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
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun TbEpisodeDetailScreen(
    onNavigateBack: () -> Unit,
    viewModel: TbEpisodeDetailViewModel = hiltViewModel(),
) {
    val s by viewModel.state.collectAsState()
    val ep = s.episode

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(ep?.patientName ?: "TB episode") },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { padding ->
        Column(
            Modifier.fillMaxSize().padding(padding).padding(16.dp).verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            s.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            ep?.let { episode ->
                OutlinedCard(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(
                            buildString {
                                append("Registered ${episode.registeredAt.take(10)}")
                                episode.unitTbNumber?.let { append(" · TB #$it") }
                            },
                            fontWeight = FontWeight.Medium,
                        )
                        if (!episode.isSynced) {
                            Text(
                                "Saved on device — will sync when online.",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
                OutlinedCard(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text("Treatment outcome", style = MaterialTheme.typography.labelLarge)
                        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            viewModel.outcomeOptions.forEach { o ->
                                FilterChip(
                                    selected = s.outcome == o,
                                    onClick = { viewModel.setOutcome(o) },
                                    label = { Text(o.replace('_', ' ')) },
                                )
                            }
                        }
                        if (s.outcome != "ongoing") {
                            OutlinedTextField(
                                value = s.outcomeDate,
                                onValueChange = viewModel::onOutcomeDateChange,
                                modifier = Modifier.fillMaxWidth(),
                                label = { Text("Outcome date (YYYY-MM-DD)") },
                                singleLine = true,
                            )
                        }
                        Button(
                            onClick = viewModel::saveOutcome,
                            enabled = !s.saving,
                            modifier = Modifier.fillMaxWidth(),
                        ) { Text("Save outcome") }
                    }
                }
            }
        }
    }
}
