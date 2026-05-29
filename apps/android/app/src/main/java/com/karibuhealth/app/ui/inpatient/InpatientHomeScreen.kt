package com.karibuhealth.app.ui.inpatient

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.karibuhealth.app.ui.components.KhMetaText

@Composable
fun InpatientHomeScreen(
    onNavigateToPatient: (String) -> Unit = {},
    modifier: Modifier = Modifier,
    viewModel: InpatientHomeViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()

    Column(
        modifier = modifier
            .fillMaxSize()
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(
            text = "Admit patient",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.SemiBold,
        )
        if (!uiState.isOnline) {
            KhMetaText(text = "OFFLINE — ADMISSION REQUIRES CONNECTION")
        }
        uiState.lastAdmissionId?.let { id ->
            Text(
                text = "Admission recorded ($id).",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.primary,
            )
        }
        uiState.error?.let { err ->
            Text(
                text = err,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
            )
        }

        OutlinedTextField(
            value = uiState.searchQuery,
            onValueChange = viewModel::onSearchQueryChange,
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Search patient") },
            singleLine = true,
        )

        if (uiState.isSearching) {
            CircularProgressIndicator(modifier = Modifier.padding(8.dp))
        }

        if (uiState.searchResults.isNotEmpty()) {
            LazyColumn(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f, fill = false),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                items(uiState.searchResults, key = { it.id }) { patient ->
                    Text(
                        text = patient.fullName.ifBlank { patient.displayName ?: patient.id },
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { viewModel.selectPatient(patient) }
                            .padding(vertical = 8.dp),
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
            }
        }

        uiState.selectedPatient?.let { patient ->
            Text(
                text = "Selected: ${patient.fullName.ifBlank { patient.displayName }}",
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium,
            )
            Text(
                text = "Open chart",
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier.clickable { onNavigateToPatient(patient.id) },
            )
        }

        OutlinedTextField(
            value = uiState.wardLabel,
            onValueChange = viewModel::onWardChange,
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Ward / bed") },
            singleLine = true,
        )
        OutlinedTextField(
            value = uiState.chiefComplaint,
            onValueChange = viewModel::onComplaintChange,
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Chief complaint") },
            minLines = 2,
        )

        Button(
            onClick = viewModel::admit,
            enabled = uiState.selectedPatient != null && !uiState.isAdmitting && uiState.isOnline,
            modifier = Modifier.fillMaxWidth(),
        ) {
            if (uiState.isAdmitting) {
                CircularProgressIndicator(modifier = Modifier.padding(end = 8.dp))
            }
            Text("Admit")
        }
    }
}
