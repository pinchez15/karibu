package com.karibuhealth.app.ui.newvisit

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NewVisitScreen(
    onNavigateBack: () -> Unit,
    onPatientSelected: (String) -> Unit,
    viewModel: NewVisitViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()
    val scope = rememberCoroutineScope()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("New Visit") },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text(
                text = "Look up or create a patient",
                style = MaterialTheme.typography.bodyLarge,
            )
            OutlinedTextField(
                value = uiState.searchQuery,
                onValueChange = { viewModel.updateSearch(it) },
                label = { Text("Phone Number") },
                placeholder = { Text("+256 7XX XXX XXX") },
                modifier = Modifier.fillMaxWidth(),
                isError = uiState.searchQuery.isNotEmpty() && !uiState.phoneValid,
                supportingText = if (uiState.searchQuery.isNotEmpty() && !uiState.phoneValid) {
                    { Text("Enter a valid Uganda phone number") }
                } else null,
            )
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                OutlinedTextField(
                    value = uiState.firstName,
                    onValueChange = { viewModel.updateFirstName(it) },
                    label = { Text("First Name") },
                    modifier = Modifier.weight(1f),
                )
                OutlinedTextField(
                    value = uiState.lastName,
                    onValueChange = { viewModel.updateLastName(it) },
                    label = { Text("Last Name") },
                    modifier = Modifier.weight(1f),
                )
            }

            // Search results
            if (uiState.searchResults.isNotEmpty()) {
                Text("Matching Patients", style = MaterialTheme.typography.labelLarge)
                LazyColumn(
                    modifier = Modifier.weight(1f, fill = false),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    items(uiState.searchResults) { patient ->
                        ListItem(
                            headlineContent = { Text(patient.fullName.ifBlank { "Unknown" }) },
                            supportingContent = {
                                Text(patient.patientId?.let { "#$it" } ?: patient.whatsappNumber ?: "")
                            },
                            leadingContent = {
                                Icon(Icons.Default.Person, contentDescription = null)
                            },
                            modifier = Modifier.clickable {
                                viewModel.selectPatient(patient)
                                onPatientSelected(patient.id)
                            },
                        )
                    }
                }
            }

            // Found patient
            uiState.foundPatient?.let { patient ->
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text("Patient Found", style = MaterialTheme.typography.labelLarge)
                        Text(patient.fullName.ifBlank { "Unknown" })
                        patient.patientId?.let { Text("ID: #$it") }
                    }
                }
            }

            uiState.error?.let { error ->
                Text(error, color = MaterialTheme.colorScheme.error)
            }

            Button(
                onClick = {
                    scope.launch {
                        val patientId = viewModel.createOrGetPatient()
                        if (patientId != null) {
                            onPatientSelected(patientId)
                        }
                    }
                },
                modifier = Modifier.fillMaxWidth(),
                enabled = !uiState.isCreating && (uiState.foundPatient != null || uiState.phoneValid || uiState.firstName.isNotBlank() || uiState.lastName.isNotBlank()),
            ) {
                if (uiState.isCreating) {
                    CircularProgressIndicator(modifier = Modifier.size(20.dp))
                } else {
                    Text(if (uiState.foundPatient != null) "Continue with Patient" else "Create & Continue")
                }
            }
        }
    }
}
