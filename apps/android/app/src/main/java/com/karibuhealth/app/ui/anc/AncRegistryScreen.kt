package com.karibuhealth.app.ui.anc

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.AssistChip
import androidx.compose.material3.AssistChipDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun AncRegistryScreen(
    onNavigateBack: () -> Unit,
    onRegister: () -> Unit,
    onOpenPregnancy: (String) -> Unit,
    viewModel: AncRegistryViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("ANC registry") },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = onRegister,
                icon = { Icon(Icons.Default.Add, contentDescription = null) },
                text = { Text("Register") },
            )
        },
    ) { padding ->
        if (!state.loading && state.rows.isEmpty()) {
            Column(Modifier.fillMaxSize().padding(padding).padding(32.dp), verticalArrangement = Arrangement.Center) {
                Text("No pregnancies registered yet.", style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text("Tap Register to add an expectant mother.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            return@Scaffold
        }
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            items(state.rows, key = { it.row.pregnancy.id }) { item ->
                val pg = item.row.pregnancy
                val s = item.status
                OutlinedCard(Modifier.fillMaxWidth().clickable { onOpenPregnancy(pg.id) }) {
                    Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                            Text(pg.patientName ?: "Mother", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                            Text(
                                s.gestationWeeks?.let { "${it}wk" } ?: "",
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        val meta = listOfNotNull(
                            pg.edd?.take(10)?.let { "EDD $it" },
                            if (pg.gravida != null || pg.para != null) "G${pg.gravida ?: "?"}P${pg.para ?: "?"}" else null,
                            "ANC ${item.row.contactCount}/8",
                        ).joinToString(" · ")
                        Text(meta, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        if (s.gaps.isNotEmpty() || !pg.riskNotes.isNullOrBlank()) {
                            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                s.gaps.forEach { gap ->
                                    AssistChip(
                                        onClick = { onOpenPregnancy(pg.id) },
                                        label = { Text(gap) },
                                        colors = AssistChipDefaults.assistChipColors(
                                            labelColor = MaterialTheme.colorScheme.error,
                                        ),
                                    )
                                }
                                if (!pg.riskNotes.isNullOrBlank()) {
                                    AssistChip(onClick = { onOpenPregnancy(pg.id) }, label = { Text("High risk") })
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
