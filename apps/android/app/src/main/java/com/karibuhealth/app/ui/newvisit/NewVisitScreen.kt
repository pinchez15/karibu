package com.karibuhealth.app.ui.newvisit

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NewVisitScreen(
    onNavigateBack: () -> Unit,
    onVisitCreated: (String) -> Unit,
    viewModel: NewVisitViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()
    val scope = rememberCoroutineScope()
    var datePickerOpen by remember { mutableStateOf(false) }

    Scaffold(
        contentWindowInsets = WindowInsets(0, 0, 0, 0),
        topBar = {
            TopAppBar(
                windowInsets = WindowInsets(0, 0, 0, 0),
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
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                text = "Look up or register a patient",
                style = MaterialTheme.typography.titleMedium,
            )

            // ---- New patient fields (primary) ----
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                OutlinedTextField(
                    value = uiState.firstName,
                    onValueChange = { viewModel.updateFirstName(it) },
                    label = { Text("First name *") },
                    modifier = Modifier.weight(1f),
                    isError = uiState.fieldErrors.firstName != null,
                    supportingText = uiState.fieldErrors.firstName?.let { { Text(it) } },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
                )
                OutlinedTextField(
                    value = uiState.lastName,
                    onValueChange = { viewModel.updateLastName(it) },
                    label = { Text("Last name *") },
                    modifier = Modifier.weight(1f),
                    isError = uiState.fieldErrors.lastName != null,
                    supportingText = uiState.fieldErrors.lastName?.let { { Text(it) } },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next),
                )
            }

            // Sex — required by HMIS 105 age × sex bracketing.
            Column {
                Text(
                    text = "Sex *",
                    style = MaterialTheme.typography.bodyMedium,
                )
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    FilterChip(
                        selected = uiState.sex == PatientSex.F,
                        onClick = { viewModel.updateSex(PatientSex.F) },
                        label = { Text("Female") },
                        modifier = Modifier.weight(1f),
                    )
                    FilterChip(
                        selected = uiState.sex == PatientSex.M,
                        onClick = { viewModel.updateSex(PatientSex.M) },
                        label = { Text("Male") },
                        modifier = Modifier.weight(1f),
                    )
                }
                uiState.fieldErrors.sex?.let {
                    Text(
                        text = it,
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.padding(top = 4.dp),
                    )
                }
            }

            // Date of Birth — required by HMIS 105 age bands. If unknown, the
            // records officer can pick an approximate Jan 1 of the birth year.
            OutlinedTextField(
                value = uiState.dateOfBirth ?: "",
                onValueChange = { /* picker only */ },
                readOnly = true,
                label = { Text("Date of birth *") },
                placeholder = { Text("YYYY-MM-DD") },
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { datePickerOpen = true },
                isError = uiState.fieldErrors.dateOfBirth != null,
                supportingText = uiState.fieldErrors.dateOfBirth?.let { { Text(it) } }
                    ?: { Text("If unknown, pick approximate year") },
                trailingIcon = {
                    IconButton(onClick = { datePickerOpen = true }) {
                        Icon(Icons.Default.CalendarMonth, contentDescription = "Pick date")
                    }
                },
                singleLine = true,
            )

            // ---- Phone (optional, last) ----
            // Also drives the existing-patient lookup. Optional because many
            // patients in the catchment don't carry a phone.
            OutlinedTextField(
                value = uiState.searchQuery,
                onValueChange = { viewModel.updateSearch(it) },
                label = { Text("Phone (optional)") },
                placeholder = { Text("+256 7XX XXX XXX") },
                modifier = Modifier.fillMaxWidth(),
                isError = uiState.fieldErrors.phone != null,
                supportingText = uiState.fieldErrors.phone?.let { { Text(it) } },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                singleLine = true,
            )

            if (uiState.searchResults.isNotEmpty()) {
                Text("Matching patients", style = MaterialTheme.typography.labelLarge)
                LazyColumn(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(max = 200.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    items(uiState.searchResults) { patient ->
                        ListItem(
                            headlineContent = { Text(patient.fullName.ifBlank { "Unknown" }) },
                            supportingContent = {
                                Text(patient.patientId?.let { "#$it" } ?: patient.whatsappNumber ?: "")
                            },
                            leadingContent = { Icon(Icons.Default.Person, contentDescription = null) },
                            modifier = Modifier.clickable {
                                viewModel.selectPatient(patient)
                                scope.launch {
                                    val visitId = viewModel.startVisitForSelectedPatient()
                                    if (visitId != null) onVisitCreated(visitId)
                                }
                            },
                        )
                    }
                }
            }

            uiState.foundPatient?.let { patient ->
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text("Patient found", style = MaterialTheme.typography.labelLarge)
                        Text(patient.fullName.ifBlank { "Unknown" })
                        patient.patientId?.let { Text("ID: #$it") }
                    }
                }
            }

            uiState.duplicateCandidate?.let { patient ->
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Text("Possible existing patient", style = MaterialTheme.typography.labelLarge)
                        Text(patient.fullName.ifBlank { "Unknown" })
                        patient.patientId?.let { Text("ID: #$it") }
                        patient.dateOfBirth?.let { Text("DOB: $it") }
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            OutlinedButton(onClick = {
                                scope.launch {
                                    val visitId = viewModel.startVisitForDuplicateCandidate()
                                    if (visitId != null) onVisitCreated(visitId)
                                }
                            }) {
                                Text("Use Existing")
                            }
                            OutlinedButton(onClick = {
                                scope.launch {
                                    val visitId = viewModel.createPatientAndStartVisit(confirmDuplicate = true)
                                    if (visitId != null) onVisitCreated(visitId)
                                }
                            }) {
                                Text("Create New Anyway")
                            }
                        }
                    }
                }
            }

            uiState.error?.let { error ->
                Text(error, color = MaterialTheme.colorScheme.error)
            }

            Button(
                onClick = {
                    scope.launch {
                        val visitId = viewModel.createPatientAndStartVisit()
                        if (visitId != null) onVisitCreated(visitId)
                    }
                },
                modifier = Modifier.fillMaxWidth(),
                enabled = !uiState.isCreating,
            ) {
                if (uiState.isCreating) {
                    CircularProgressIndicator(modifier = Modifier.size(20.dp))
                } else {
                    Text(if (uiState.foundPatient != null) "Start visit" else "Create patient & start visit")
                }
            }
        }
    }

    if (datePickerOpen) {
        DobPickerDialog(
            current = uiState.dateOfBirth,
            onDismiss = { datePickerOpen = false },
            onConfirm = { iso ->
                viewModel.updateDateOfBirth(iso)
                datePickerOpen = false
            },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DobPickerDialog(
    current: String?,
    onDismiss: () -> Unit,
    onConfirm: (String) -> Unit,
) {
    val initialMillis = current?.let {
        runCatching {
            LocalDate.parse(it)
                .atStartOfDay(ZoneId.systemDefault())
                .toInstant()
                .toEpochMilli()
        }.getOrNull()
    }
    val state = rememberDatePickerState(
        initialSelectedDateMillis = initialMillis,
        // Default to typed numeric entry — clinicians prefer keying YYYY-MM-DD
        // over scrolling through a calendar grid, especially for older patients
        // whose birth year is decades back. The dialog still has a toggle to
        // switch to the calendar view.
        initialDisplayMode = DisplayMode.Input,
        // Most patients are <120 years old; cap the picker at today (no future
        // DOBs) and a reasonable lower bound to keep the picker usable.
        yearRange = (LocalDate.now().year - 120)..LocalDate.now().year,
        selectableDates = object : SelectableDates {
            override fun isSelectableDate(utcTimeMillis: Long): Boolean =
                utcTimeMillis <= System.currentTimeMillis()
        },
    )
    DatePickerDialog(
        onDismissRequest = onDismiss,
        confirmButton = {
            TextButton(onClick = {
                state.selectedDateMillis?.let { millis ->
                    val iso = Instant.ofEpochMilli(millis)
                        .atZone(ZoneId.systemDefault())
                        .toLocalDate()
                        .toString()
                    onConfirm(iso)
                }
            }) { Text("OK") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        },
    ) {
        DatePicker(state = state)
    }
}
