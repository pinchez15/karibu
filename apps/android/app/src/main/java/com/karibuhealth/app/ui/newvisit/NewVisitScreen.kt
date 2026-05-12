package com.karibuhealth.app.ui.newvisit

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.karibuhealth.app.domain.model.DuplicateCandidate
import com.karibuhealth.app.ui.components.KhMetaText
import com.karibuhealth.app.ui.components.KhStepIndicator
import com.karibuhealth.app.ui.theme.Amber
import com.karibuhealth.app.ui.theme.AmberInk
import com.karibuhealth.app.ui.theme.AmberSoft
import com.karibuhealth.app.ui.theme.Body
import com.karibuhealth.app.ui.theme.Cobalt
import com.karibuhealth.app.ui.theme.Ink
import com.karibuhealth.app.ui.theme.Line
import com.karibuhealth.app.ui.theme.Muted
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

// UI labels for the four dob_precision values (migration 038). Keep the
// string-keyed selector close to the wire format so reading the screen
// matches reading the SQL CHECK constraint.
private data class PrecisionOption(val key: String, val label: String)

private val PRECISION_OPTIONS = listOf(
    PrecisionOption(DobPrecision.EXACT, "Exact DOB"),
    PrecisionOption(DobPrecision.YEAR_ONLY, "Birth year"),
    PrecisionOption(DobPrecision.AGE_ESTIMATE, "Approx age"),
    PrecisionOption(DobPrecision.UNKNOWN, "Unknown"),
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NewVisitScreen(
    onNavigateBack: () -> Unit,
    onVisitCreated: (visitId: String, patientId: String) -> Unit,
    viewModel: NewVisitViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()
    val scope = rememberCoroutineScope()
    var datePickerOpen by remember { mutableStateOf(false) }
    var moreExpanded by remember { mutableStateOf(false) }
    var dobFieldValue by remember {
        mutableStateOf(
            TextFieldValue(
                text = uiState.dateOfBirth.orEmpty(),
                selection = TextRange(uiState.dateOfBirth.orEmpty().length),
            )
        )
    }

    LaunchedEffect(uiState.dateOfBirth) {
        val latest = uiState.dateOfBirth.orEmpty()
        if (dobFieldValue.text != latest) {
            dobFieldValue = TextFieldValue(
                text = latest,
                selection = TextRange(latest.length),
            )
        }
    }

    Scaffold(
        contentWindowInsets = WindowInsets(0, 0, 0, 0),
        topBar = {
            TopAppBar(
                windowInsets = WindowInsets(0, 0, 0, 0),
                title = {
                    Text(
                        "New visit",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
        bottomBar = {
            Surface(
                modifier = Modifier.fillMaxWidth().imePadding(),
                tonalElevation = 0.dp,
                color = MaterialTheme.colorScheme.surface,
            ) {
                Box(modifier = Modifier
                    .fillMaxWidth()
                    .border(1.dp, Line, shape = RoundedCornerShape(0.dp))
                    .navigationBarsPadding()
                    .padding(horizontal = 20.dp, vertical = 16.dp)
                ) {
                    Button(
                        onClick = {
                            scope.launch {
                                val result = viewModel.createPatientAndStartVisit()
                                if (result != null) {
                                    onVisitCreated(result.visitId, result.patientId)
                                }
                            }
                        },
                        modifier = Modifier.fillMaxWidth(),
                        enabled = !uiState.isCreating,
                        colors = ButtonDefaults.buttonColors(containerColor = Cobalt),
                        shape = RoundedCornerShape(12.dp),
                        contentPadding = PaddingValues(vertical = 14.dp),
                    ) {
                        if (uiState.isCreating) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(20.dp),
                                strokeWidth = 2.dp,
                                color = Color.White,
                            )
                        } else {
                            Text(
                                text = if (uiState.foundPatient != null)
                                    "Continue to vitals"
                                else
                                    "Continue to vitals",
                                fontWeight = FontWeight.SemiBold,
                            )
                        }
                    }
                }
            }
        },
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            KhStepIndicator(step = 1, totalSteps = 3, label = "PATIENT")

            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                LabeledOutlinedField(
                    label = "FIRST NAME",
                    value = uiState.firstName,
                    onValueChange = viewModel::updateFirstName,
                    placeholder = "First name",
                    error = uiState.fieldErrors.firstName,
                    modifier = Modifier.weight(1f),
                    imeAction = ImeAction.Next,
                )
                LabeledOutlinedField(
                    label = "LAST NAME",
                    value = uiState.lastName,
                    onValueChange = viewModel::updateLastName,
                    placeholder = "Last name",
                    error = uiState.fieldErrors.lastName,
                    modifier = Modifier.weight(1f),
                    imeAction = ImeAction.Next,
                )
            }

            Column {
                KhMetaText(text = "SEX")
                Spacer(Modifier.height(6.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    SegmentedChip(
                        label = "Female",
                        selected = uiState.sex == PatientSex.F,
                        onClick = { viewModel.updateSex(PatientSex.F) },
                        modifier = Modifier.weight(1f),
                    )
                    SegmentedChip(
                        label = "Male",
                        selected = uiState.sex == PatientSex.M,
                        onClick = { viewModel.updateSex(PatientSex.M) },
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

            // dob_precision selector (migration 038). Rural HC III patients
            // commonly know only their birth year or rough age, so we let the
            // clinician pick the precision and only validate the matching
            // field. patient_age_years() on the server derives the HMIS age
            // band from whichever column ends up populated.
            Column {
                KhMetaText(text = "AGE INFO")
                Spacer(Modifier.height(6.dp))
                Row(
                    modifier = Modifier
                        .horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    PRECISION_OPTIONS.forEach { option ->
                        FilterChip(
                            selected = uiState.dobPrecision == option.key,
                            onClick = { viewModel.updateDobPrecision(option.key) },
                            label = { Text(option.label) },
                        )
                    }
                }
            }

            // Conditional age-input section keyed off dob_precision.
            when (uiState.dobPrecision) {
                DobPrecision.EXACT -> {
                    Column {
                        KhMetaText(text = "DATE OF BIRTH")
                        Spacer(Modifier.height(6.dp))
                        OutlinedTextField(
                            value = dobFieldValue,
                            onValueChange = { value ->
                                val formatted = viewModel.formatDateOfBirthInput(value.text)
                                dobFieldValue = TextFieldValue(
                                    text = formatted,
                                    selection = TextRange(formatted.length),
                                )
                                viewModel.updateDateOfBirth(formatted)
                            },
                            placeholder = { Text("DD-MM-YYYY", color = MaterialTheme.colorScheme.onSurfaceVariant) },
                            modifier = Modifier.fillMaxWidth(),
                            isError = uiState.fieldErrors.dateOfBirth != null,
                            supportingText = uiState.fieldErrors.dateOfBirth?.let { { Text(it) } }
                                ?: { Text("Type DDMMYYYY or tap the calendar", color = MaterialTheme.colorScheme.onSurfaceVariant) },
                            trailingIcon = {
                                IconButton(onClick = { datePickerOpen = true }) {
                                    Icon(Icons.Default.CalendarMonth, contentDescription = "Pick date", tint = Cobalt)
                                }
                            },
                            keyboardOptions = KeyboardOptions(
                                keyboardType = KeyboardType.Number,
                                imeAction = ImeAction.Next,
                            ),
                            singleLine = true,
                            shape = RoundedCornerShape(10.dp),
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = Cobalt,
                                unfocusedBorderColor = Line,
                            ),
                        )
                    }
                }
                DobPrecision.YEAR_ONLY -> {
                    Column {
                        KhMetaText(text = "BIRTH YEAR")
                        Spacer(Modifier.height(6.dp))
                        OutlinedTextField(
                            value = uiState.birthYear,
                            onValueChange = viewModel::updateBirthYear,
                            placeholder = { Text("e.g. 1992", color = MaterialTheme.colorScheme.onSurfaceVariant) },
                            modifier = Modifier.fillMaxWidth(),
                            isError = uiState.fieldErrors.birthYear != null,
                            supportingText = uiState.fieldErrors.birthYear?.let { { Text(it) } }
                                ?: { Text("4-digit year", color = MaterialTheme.colorScheme.onSurfaceVariant) },
                            keyboardOptions = KeyboardOptions(
                                keyboardType = KeyboardType.Number,
                                imeAction = ImeAction.Next,
                            ),
                            singleLine = true,
                            shape = RoundedCornerShape(10.dp),
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = Cobalt,
                                unfocusedBorderColor = Line,
                            ),
                        )
                    }
                }
                DobPrecision.AGE_ESTIMATE -> {
                    Column {
                        KhMetaText(text = "APPROXIMATE AGE")
                        Spacer(Modifier.height(6.dp))
                        OutlinedTextField(
                            value = uiState.approximateAge,
                            onValueChange = viewModel::updateApproximateAge,
                            placeholder = { Text("Age in years", color = MaterialTheme.colorScheme.onSurfaceVariant) },
                            modifier = Modifier.fillMaxWidth(),
                            isError = uiState.fieldErrors.approximateAge != null,
                            supportingText = uiState.fieldErrors.approximateAge?.let { { Text(it) } }
                                ?: { Text("Years (recorded today)", color = MaterialTheme.colorScheme.onSurfaceVariant) },
                            keyboardOptions = KeyboardOptions(
                                keyboardType = KeyboardType.Number,
                                imeAction = ImeAction.Next,
                            ),
                            singleLine = true,
                            shape = RoundedCornerShape(10.dp),
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = Cobalt,
                                unfocusedBorderColor = Line,
                            ),
                        )
                    }
                }
                else -> {
                    // dob_precision = 'unknown': no age input rendered. Server
                    // will record only what we know (name + location).
                }
            }

            Column {
                KhMetaText(text = "PHONE (OPTIONAL)")
                Spacer(Modifier.height(6.dp))
                OutlinedTextField(
                    value = uiState.searchQuery,
                    onValueChange = viewModel::updateSearch,
                    placeholder = { Text("+256 7XX XXX XXX", color = MaterialTheme.colorScheme.onSurfaceVariant) },
                    modifier = Modifier.fillMaxWidth(),
                    isError = uiState.fieldErrors.phone != null,
                    supportingText = uiState.fieldErrors.phone?.let { { Text(it) } },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                    singleLine = true,
                    shape = RoundedCornerShape(10.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = Cobalt,
                        unfocusedBorderColor = Line,
                    ),
                )
            }

            // Location section. Village + parish are the primary
            // disambiguators when DOB is unknown — surfaced inline. Subcounty,
            // district, guardian, and national ID live behind the "More"
            // disclosure so the form stays compact for the common case.
            Column {
                KhMetaText(text = "LOCATION")
                Spacer(Modifier.height(6.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    LabeledOutlinedField(
                        label = "VILLAGE",
                        value = uiState.village,
                        onValueChange = viewModel::updateVillage,
                        placeholder = "Village",
                        error = null,
                        helper = "Useful when DOB is unknown",
                        modifier = Modifier.weight(1f),
                        imeAction = ImeAction.Next,
                    )
                    LabeledOutlinedField(
                        label = "PARISH",
                        value = uiState.parish,
                        onValueChange = viewModel::updateParish,
                        placeholder = "Parish",
                        error = null,
                        helper = "Useful when DOB is unknown",
                        modifier = Modifier.weight(1f),
                        imeAction = ImeAction.Next,
                    )
                }
            }

            // "More" disclosure: less-used identity fields.
            Row(
                modifier = Modifier
                    .clip(RoundedCornerShape(8.dp))
                    .clickable { moreExpanded = !moreExpanded }
                    .padding(vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    imageVector = if (moreExpanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                    contentDescription = null,
                    tint = Cobalt,
                )
                Spacer(Modifier.width(4.dp))
                Text(
                    text = if (moreExpanded) "Less" else "More (subcounty, district, guardian, national ID)",
                    color = Cobalt,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Medium,
                )
            }
            AnimatedVisibility(visible = moreExpanded) {
                Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        LabeledOutlinedField(
                            label = "SUBCOUNTY",
                            value = uiState.subcounty,
                            onValueChange = viewModel::updateSubcounty,
                            placeholder = "Subcounty",
                            error = null,
                            modifier = Modifier.weight(1f),
                            imeAction = ImeAction.Next,
                        )
                        LabeledOutlinedField(
                            label = "DISTRICT",
                            value = uiState.district,
                            onValueChange = viewModel::updateDistrict,
                            placeholder = "District",
                            error = null,
                            modifier = Modifier.weight(1f),
                            imeAction = ImeAction.Next,
                        )
                    }
                    LabeledOutlinedField(
                        label = "GUARDIAN NAME",
                        value = uiState.guardianName,
                        onValueChange = viewModel::updateGuardianName,
                        placeholder = "Parent or guardian",
                        error = null,
                        modifier = Modifier.fillMaxWidth(),
                        imeAction = ImeAction.Next,
                    )
                    LabeledOutlinedField(
                        label = "NATIONAL ID",
                        value = uiState.nationalId,
                        onValueChange = viewModel::updateNationalId,
                        placeholder = "NIN (if known)",
                        error = null,
                        modifier = Modifier.fillMaxWidth(),
                        imeAction = ImeAction.Done,
                    )
                }
            }

            Column {
                KhMetaText(text = "CHIEF COMPLAINT")
                Spacer(Modifier.height(6.dp))
                OutlinedTextField(
                    value = uiState.chiefComplaint,
                    onValueChange = viewModel::updateChiefComplaint,
                    placeholder = { Text("e.g. Fever for 3 days, headache", color = MaterialTheme.colorScheme.onSurfaceVariant) },
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 80.dp),
                    singleLine = false,
                    minLines = 2,
                    shape = RoundedCornerShape(10.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = Cobalt,
                        unfocusedBorderColor = Line,
                    ),
                )
            }

            if (uiState.searchResults.isNotEmpty()) {
                Column {
                    KhMetaText(text = "MATCHING PATIENTS")
                    Spacer(Modifier.height(6.dp))
                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        uiState.searchResults.take(4).forEach { patient ->
                            ListItem(
                                headlineContent = { Text(patient.fullName.ifBlank { "Unknown" }) },
                                supportingContent = {
                                    Text(patient.patientId?.let { "#$it" } ?: patient.whatsappNumber ?: "")
                                },
                                leadingContent = { Icon(Icons.Default.Person, contentDescription = null, tint = Cobalt) },
                                modifier = Modifier
                                    .clip(RoundedCornerShape(10.dp))
                                    .border(1.dp, Line, RoundedCornerShape(10.dp))
                                    .clickable {
                                        viewModel.selectPatient(patient)
                                        scope.launch {
                                            val result = viewModel.startVisitForSelectedPatient()
                                            if (result != null) onVisitCreated(result.visitId, result.patientId)
                                        }
                                    },
                            )
                        }
                    }
                }
            }

            uiState.foundPatient?.let { patient ->
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(12.dp))
                        .background(MaterialTheme.colorScheme.surface)
                        .border(1.dp, Line, RoundedCornerShape(12.dp))
                        .padding(14.dp),
                ) {
                    Column {
                        KhMetaText(text = "PATIENT FOUND")
                        Text(
                            text = patient.fullName.ifBlank { "Unknown" },
                            style = MaterialTheme.typography.bodyLarge,
                            fontWeight = FontWeight.SemiBold,
                            color = MaterialTheme.colorScheme.onSurface,
                        )
                        patient.patientId?.let {
                            Text("ID: #$it", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }

            // Duplicate-candidate stack — replaces the old single-candidate
            // amber card. Each card surfaces match_reasons[] so the clinician
            // can see WHY a candidate matched (similar name, same village, etc).
            if (uiState.duplicateCandidates.isNotEmpty()) {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        text = "Possible matches",
                        style = MaterialTheme.typography.bodyMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = AmberInk,
                    )
                    uiState.duplicateCandidates.forEach { candidate ->
                        DuplicateCandidateCard(
                            candidate = candidate,
                            onUse = {
                                scope.launch {
                                    val result = viewModel.startVisitForCandidate(candidate.id)
                                    if (result != null) onVisitCreated(result.visitId, result.patientId)
                                }
                            },
                        )
                    }
                    OutlinedButton(
                        onClick = {
                            scope.launch {
                                val result = viewModel.createPatientAndStartVisit(confirmDuplicate = true)
                                if (result != null) onVisitCreated(result.visitId, result.patientId)
                            }
                        },
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(10.dp),
                    ) { Text("Create new patient anyway") }
                }
            }

            uiState.error?.let { error ->
                Text(error, color = MaterialTheme.colorScheme.error)
            }

            Spacer(Modifier.height(8.dp))
        }
    }

    if (datePickerOpen) {
        DobPickerDialog(
            current = uiState.dateOfBirth,
            onDismiss = { datePickerOpen = false },
            onConfirm = { iso ->
                viewModel.setDateOfBirthFromPicker(iso)
                datePickerOpen = false
            },
        )
    }
}

@Composable
private fun LabeledOutlinedField(
    label: String,
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    error: String?,
    modifier: Modifier = Modifier,
    imeAction: ImeAction = ImeAction.Next,
    helper: String? = null,
) {
    Column(modifier = modifier) {
        KhMetaText(text = label)
        Spacer(Modifier.height(6.dp))
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            placeholder = { Text(placeholder, color = MaterialTheme.colorScheme.onSurfaceVariant) },
            isError = error != null,
            supportingText = when {
                error != null -> {{ Text(error) }}
                helper != null -> {{ Text(helper, color = MaterialTheme.colorScheme.onSurfaceVariant) }}
                else -> null
            },
            singleLine = true,
            keyboardOptions = KeyboardOptions(imeAction = imeAction),
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(10.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = Cobalt,
                unfocusedBorderColor = Line,
            ),
        )
    }
}

@Composable
private fun SegmentedChip(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(10.dp))
            .background(if (selected) Cobalt else MaterialTheme.colorScheme.surface)
            .border(
                width = 1.dp,
                color = if (selected) Cobalt else Line,
                shape = RoundedCornerShape(10.dp),
            )
            .clickable(onClick = onClick)
            .padding(vertical = 12.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.SemiBold,
            color = if (selected) Color.White else MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun DuplicateCandidateCard(
    candidate: DuplicateCandidate,
    onUse: () -> Unit,
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(AmberSoft)
            .border(1.dp, Amber.copy(alpha = 0.2f), RoundedCornerShape(12.dp))
            .padding(14.dp),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(
                text = candidate.fullName,
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.SemiBold,
                color = AmberInk,
            )
            Text(
                text = candidateSubtitle(candidate),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (candidate.matchReasons.isNotEmpty()) {
                Row(
                    modifier = Modifier.horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    candidate.matchReasons.forEach { reason ->
                        AssistChip(
                            onClick = {},
                            label = { Text(humanizeMatchReason(reason)) },
                        )
                    }
                }
            }
            Spacer(Modifier.height(4.dp))
            Button(
                onClick = onUse,
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(
                    containerColor = Amber,
                    contentColor = AmberInk,
                ),
                shape = RoundedCornerShape(8.dp),
            ) { Text("Use this patient") }
        }
    }
}

private fun candidateSubtitle(candidate: DuplicateCandidate): String {
    val parts = buildList {
        candidate.sex?.let {
            add(when (it) { "M" -> "Male"; "F" -> "Female"; else -> it })
        }
        candidate.derivedAge?.let { add("$it y") }
        candidate.village?.takeIf { it.isNotBlank() }?.let { add(it) }
    }
    return parts.joinToString(" • ").ifBlank { "No further details" }
}

// Map the wire-format match_reasons strings produced by
// rpc_find_duplicate_candidates (migration 038) to human labels.
private fun humanizeMatchReason(reason: String): String = when (reason) {
    "name_match" -> "Similar name"
    "same_village" -> "Same village"
    "same_parish" -> "Same parish"
    "national_id_match" -> "Same national ID"
    "age_match" -> "Similar age"
    else -> reason
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
            it.toIsoDateFromUgandaDisplay()?.let(LocalDate::parse)
                ?: LocalDate.parse(it)
        }.map {
            it
                .atStartOfDay(ZoneId.systemDefault())
                .toInstant()
                .toEpochMilli()
        }.getOrNull()
    }
    val state = rememberDatePickerState(
        initialSelectedDateMillis = initialMillis,
        initialDisplayMode = DisplayMode.Input,
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

private fun formatDobForDisplay(isoDate: String): String {
    val parts = isoDate.split('-')
    return if (parts.size == 3) "${parts[2]}-${parts[1]}-${parts[0]}" else isoDate
}

private fun String.toIsoDateFromUgandaDisplay(): String? {
    val parts = split('-')
    if (parts.size != 3) return null
    val (day, month, year) = parts
    if (day.length != 2 || month.length != 2 || year.length != 4) return null

    return runCatching {
        LocalDate.of(year.toInt(), month.toInt(), day.toInt()).toString()
    }.getOrNull()
}
