package com.karibuhealth.app.ui.hivtb

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.karibuhealth.app.ui.util.formatPatientName

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RecordHivCareScreen(
    onNavigateBack: () -> Unit,
    onSaved: (String) -> Unit,
    viewModel: RecordHivCareViewModel = hiltViewModel(),
) {
    val s by viewModel.state.collectAsState()
    LaunchedEffect(s.savedId) { s.savedId?.let(onSaved) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("HIV care enrollment") },
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
            OutlinedTextField(
                value = s.searchQuery,
                onValueChange = viewModel::onSearchQueryChange,
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Search patient") },
                singleLine = true,
            )
            if (s.isSearching) CircularProgressIndicator(Modifier.padding(8.dp))
            s.searchResults.forEach { p ->
                Text(
                    formatPatientName(p.firstName, p.lastName, p.displayName),
                    modifier = Modifier.fillMaxWidth().clickable { viewModel.selectPatient(p) }.padding(vertical = 10.dp),
                )
            }
            s.selectedPatient?.let { p ->
                OutlinedCard(Modifier.fillMaxWidth()) {
                    Text(
                        formatPatientName(p.firstName, p.lastName, p.displayName),
                        Modifier.padding(12.dp),
                        fontWeight = FontWeight.Medium,
                    )
                }
            }
            Text("Care status", style = MaterialTheme.typography.labelLarge)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(selected = s.careStatus == "pre_art", onClick = { viewModel.setCareStatus("pre_art") }, label = { Text("Pre-ART") })
                FilterChip(selected = s.careStatus == "on_art", onClick = { viewModel.setCareStatus("on_art") }, label = { Text("On ART") })
            }
            OutlinedTextField(
                value = s.whoStage,
                onValueChange = viewModel::onWhoStageChange,
                modifier = Modifier.fillMaxWidth(),
                label = { Text("WHO stage (1–4, optional)") },
                singleLine = true,
            )
            if (s.careStatus == "on_art") {
                OutlinedTextField(
                    value = s.artRegimen,
                    onValueChange = viewModel::onArtRegimenChange,
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("ART regimen") },
                    placeholder = { Text("TLD") },
                    singleLine = true,
                )
                Text("ART line", style = MaterialTheme.typography.labelLarge)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(selected = s.artLine == "first", onClick = { viewModel.setArtLine("first") }, label = { Text("1st line") })
                    FilterChip(selected = s.artLine == "second", onClick = { viewModel.setArtLine("second") }, label = { Text("2nd line") })
                }
            }
            Button(onClick = viewModel::save, enabled = s.selectedPatient != null && !s.isSaving, modifier = Modifier.fillMaxWidth()) {
                if (s.isSaving) CircularProgressIndicator(Modifier.padding(end = 8.dp))
                Text("Save enrollment")
            }
        }
    }
}
