package com.karibuhealth.app.ui.anc

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.karibuhealth.app.ui.util.formatPatientName

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StartPregnancyScreen(
    onNavigateBack: () -> Unit,
    onStarted: (String) -> Unit,
    viewModel: StartPregnancyViewModel = hiltViewModel(),
) {
    val s by viewModel.state.collectAsState()
    LaunchedEffect(s.startedId) { s.startedId?.let(onStarted) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Register pregnancy") },
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
            s.error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium) }

            OutlinedTextField(
                value = s.searchQuery, onValueChange = viewModel::onSearchQueryChange,
                modifier = Modifier.fillMaxWidth(), label = { Text("Search mother") }, singleLine = true,
            )
            if (s.isSearching) CircularProgressIndicator(Modifier.padding(8.dp))
            s.searchResults.forEach { p ->
                Text(
                    formatPatientName(p.firstName, p.lastName, p.displayName),
                    modifier = Modifier.fillMaxWidth().clickable { viewModel.selectPatient(p) }.padding(vertical = 10.dp),
                    style = MaterialTheme.typography.bodyMedium,
                )
            }
            s.selectedPatient?.let { p ->
                OutlinedCard(Modifier.fillMaxWidth()) {
                    Text("Mother: ${formatPatientName(p.firstName, p.lastName, p.displayName)}", Modifier.padding(12.dp), fontWeight = FontWeight.Medium)
                }
            }

            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                NumField(s.gestationWeeks, viewModel::onGestationChange, "Gestation (wk)", Modifier.weight(1f))
                NumField(s.gravida, viewModel::onGravidaChange, "Gravida", Modifier.weight(1f))
                NumField(s.para, viewModel::onParaChange, "Para", Modifier.weight(1f))
            }
            OutlinedTextField(
                value = s.bloodGroup, onValueChange = viewModel::onBloodGroupChange,
                modifier = Modifier.fillMaxWidth(), label = { Text("Blood group (optional)") }, singleLine = true,
            )
            Text("HIV status", style = MaterialTheme.typography.labelLarge)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("negative" to "Negative", "positive" to "Positive", "unknown" to "Unknown").forEach { (v, l) ->
                    FilterChip(selected = s.hivStatus == v, onClick = { viewModel.setHivStatus(v) }, label = { Text(l) })
                }
            }
            OutlinedTextField(
                value = s.riskNotes, onValueChange = viewModel::onRiskNotesChange,
                modifier = Modifier.fillMaxWidth(), label = { Text("Risk notes (prior CS, multiple, etc.)") }, minLines = 2,
            )

            Button(
                onClick = viewModel::start,
                enabled = s.selectedPatient != null && !s.isSaving,
                modifier = Modifier.fillMaxWidth(),
            ) {
                if (s.isSaving) CircularProgressIndicator(Modifier.padding(end = 8.dp))
                Text("Register")
            }
            Text(
                "Gestation by dates sets the EDD; the registry tracks ANC8 + IPTp progress automatically.",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

@Composable
internal fun NumField(
    value: String,
    onChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    decimal: Boolean = false,
) {
    OutlinedTextField(
        value = value,
        onValueChange = { v -> onChange(v.filter { it.isDigit() || (decimal && it == '.') }) },
        modifier = modifier,
        label = { Text(label) },
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = if (decimal) KeyboardType.Decimal else KeyboardType.Number),
    )
}
