package com.karibuhealth.app.ui.inpatient

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
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
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
import androidx.compose.foundation.text.KeyboardOptions
import androidx.hilt.navigation.compose.hiltViewModel
import com.karibuhealth.app.ui.util.formatPatientName

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AdmitPatientScreen(
    onNavigateBack: () -> Unit,
    onAdmitted: (String) -> Unit,
    viewModel: AdmitPatientViewModel = hiltViewModel(),
) {
    val s by viewModel.state.collectAsState()

    LaunchedEffect(s.admittedId) {
        s.admittedId?.let(onAdmitted)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Admit patient") },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            s.error?.let {
                Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium)
            }

            OutlinedTextField(
                value = s.searchQuery,
                onValueChange = viewModel::onSearchQueryChange,
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Search patient") },
                singleLine = true,
            )
            if (s.isSearching) CircularProgressIndicator(Modifier.padding(8.dp))
            s.searchResults.forEach { patient ->
                Text(
                    text = formatPatientName(patient.firstName, patient.lastName, patient.displayName),
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { viewModel.selectPatient(patient) }
                        .padding(vertical = 10.dp),
                    style = MaterialTheme.typography.bodyMedium,
                )
            }

            s.selectedPatient?.let { patient ->
                OutlinedCard(Modifier.fillMaxWidth()) {
                    Text(
                        text = "Admitting: ${formatPatientName(patient.firstName, patient.lastName, patient.displayName)}",
                        modifier = Modifier.padding(12.dp),
                        fontWeight = FontWeight.Medium,
                    )
                }
            }

            Text("Ward", style = MaterialTheme.typography.labelLarge)
            SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                SegmentedButton(
                    selected = s.ward == "general",
                    onClick = { viewModel.setWard("general") },
                    shape = SegmentedButtonDefaults.itemShape(0, 2),
                ) { Text("General") }
                SegmentedButton(
                    selected = s.ward == "maternity",
                    onClick = { viewModel.setWard("maternity") },
                    shape = SegmentedButtonDefaults.itemShape(1, 2),
                ) { Text("Maternity") }
            }

            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedTextField(
                    value = s.bedLabel,
                    onValueChange = viewModel::onBedChange,
                    modifier = Modifier.weight(1f),
                    label = { Text("Bed") },
                    singleLine = true,
                )
                OutlinedTextField(
                    value = s.weightKg,
                    onValueChange = viewModel::onWeightChange,
                    modifier = Modifier.weight(1f),
                    label = { Text("Weight (kg)") },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                )
            }

            OutlinedTextField(
                value = s.chiefComplaint,
                onValueChange = viewModel::onComplaintChange,
                modifier = Modifier.fillMaxWidth(),
                label = { Text("Reason for admission") },
                minLines = 2,
            )

            if (s.ward == "maternity") {
                Text("Maternity", style = MaterialTheme.typography.labelLarge)
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    OutlinedTextField(
                        value = s.gravida,
                        onValueChange = viewModel::onGravidaChange,
                        modifier = Modifier.weight(1f),
                        label = { Text("Gravida") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    )
                    OutlinedTextField(
                        value = s.para,
                        onValueChange = viewModel::onParaChange,
                        modifier = Modifier.weight(1f),
                        label = { Text("Para") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    )
                    OutlinedTextField(
                        value = s.gestationWeeks,
                        onValueChange = viewModel::onGestationChange,
                        modifier = Modifier.weight(1f),
                        label = { Text("GA (wk)") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    )
                }
                OutlinedTextField(
                    value = s.presentingStatus,
                    onValueChange = viewModel::onPresentingStatusChange,
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("Presenting (in labour / postnatal / referred-in)") },
                    singleLine = true,
                )
                OutlinedTextField(
                    value = s.hivStatus,
                    onValueChange = viewModel::onHivStatusChange,
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("HIV status (from ANC card)") },
                    singleLine = true,
                )
            }

            Button(
                onClick = viewModel::admit,
                enabled = s.selectedPatient != null && !s.isAdmitting,
                modifier = Modifier.fillMaxWidth(),
            ) {
                if (s.isAdmitting) {
                    CircularProgressIndicator(Modifier.padding(end = 8.dp))
                }
                Text("Admit to ward")
            }
            Text(
                "Admission is saved on this device and syncs when you are online.",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
