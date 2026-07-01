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
import androidx.compose.material3.Checkbox
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.karibuhealth.app.ui.util.formatPatientName

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RecordHtsScreen(
    onNavigateBack: () -> Unit,
    onSaved: () -> Unit,
    viewModel: RecordHtsViewModel = hiltViewModel(),
) {
    val s by viewModel.state.collectAsState()
    LaunchedEffect(s.savedId) { if (s.savedId != null) onSaved() }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Record HTS event") },
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
            Row(verticalAlignment = Alignment.CenterVertically) {
                Checkbox(checked = s.tested, onCheckedChange = viewModel::setTested)
                Text("Tested for HIV")
            }
            if (s.tested) {
                Text("Result", style = MaterialTheme.typography.labelLarge)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    listOf("negative", "positive", "indeterminate").forEach { v ->
                        FilterChip(
                            selected = s.result == v,
                            onClick = { viewModel.setResult(v) },
                            label = { Text(v.replaceFirstChar { it.uppercase() }) },
                        )
                    }
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(checked = s.resultReceived, onCheckedChange = viewModel::setResultReceived)
                    Text("Result received by client")
                }
                if (s.result == "positive") {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(checked = s.suspectedTb, onCheckedChange = viewModel::setSuspectedTb)
                        Text("Suspected TB")
                    }
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(checked = s.startedCpt, onCheckedChange = viewModel::setStartedCpt)
                        Text("Started CPT")
                    }
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(checked = s.retester, onCheckedChange = viewModel::setRetester)
                    Text("Retester")
                }
            }
            Button(onClick = viewModel::save, enabled = s.selectedPatient != null && !s.isSaving, modifier = Modifier.fillMaxWidth()) {
                if (s.isSaving) CircularProgressIndicator(Modifier.padding(end = 8.dp))
                Text("Save")
            }
        }
    }
}
