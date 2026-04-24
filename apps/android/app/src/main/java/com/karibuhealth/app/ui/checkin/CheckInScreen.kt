package com.karibuhealth.app.ui.checkin

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.karibuhealth.app.domain.model.VisitPriority

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CheckInScreen(
    onNavigateBack: () -> Unit,
    onCheckedIn: (visitId: String) -> Unit,
    viewModel: CheckInViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()

    LaunchedEffect(uiState.checkedInVisitId) {
        uiState.checkedInVisitId?.let { onCheckedIn(it) }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Check In Patient") },
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
            OutlinedTextField(
                value = uiState.phoneNumber,
                onValueChange = { viewModel.updatePhone(it) },
                label = { Text("Phone Number") },
                placeholder = { Text("+256 7XX XXX XXX") },
                modifier = Modifier.fillMaxWidth(),
                isError = uiState.phoneNumber.isNotEmpty() && !uiState.phoneValid,
            )

            // Show found patient
            uiState.foundPatient?.let { patient ->
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        Text("Patient Found", style = MaterialTheme.typography.labelMedium)
                        Text(patient.displayName ?: "Unknown")
                        patient.patientNumber?.let { Text("ID: $it") }
                    }
                }
            }

            if (uiState.foundPatient == null && uiState.phoneValid) {
                OutlinedButton(
                    onClick = { viewModel.lookupPatient() },
                    modifier = Modifier.fillMaxWidth(),
                    enabled = !uiState.isSearching,
                ) {
                    Text(if (uiState.isSearching) "Searching..." else "Look Up Patient")
                }
            }

            OutlinedTextField(
                value = uiState.chiefComplaint,
                onValueChange = { viewModel.updateChiefComplaint(it) },
                label = { Text("Chief Complaint") },
                modifier = Modifier.fillMaxWidth(),
                minLines = 2,
            )

            Text("Priority", style = MaterialTheme.typography.labelLarge)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                VisitPriority.entries.forEach { priority ->
                    FilterChip(
                        selected = uiState.priority == priority,
                        onClick = { viewModel.updatePriority(priority) },
                        label = { Text(priority.name.replaceFirstChar { it.uppercase() }) },
                    )
                }
            }

            uiState.error?.let { error ->
                Text(error, color = MaterialTheme.colorScheme.error)
            }

            Button(
                onClick = { viewModel.checkIn() },
                modifier = Modifier.fillMaxWidth(),
                enabled = !uiState.isCheckingIn && (uiState.foundPatient != null || uiState.phoneValid),
            ) {
                if (uiState.isCheckingIn) {
                    CircularProgressIndicator(modifier = Modifier.size(20.dp))
                } else {
                    Text("Check In")
                }
            }
        }
    }
}
