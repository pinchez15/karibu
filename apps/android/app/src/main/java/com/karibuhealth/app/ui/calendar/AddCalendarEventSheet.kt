package com.karibuhealth.app.ui.calendar

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.karibuhealth.app.domain.ClinicAppointment
import com.karibuhealth.app.domain.ClinicCalendarEvents
import com.karibuhealth.app.domain.ClinicEventType
import com.karibuhealth.app.domain.model.Patient
import com.karibuhealth.app.ui.util.formatPatientName
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.format.DateTimeFormatter

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddCalendarEventSheet(
    defaultDate: LocalDate,
    existing: ClinicAppointment?,
    onDismiss: () -> Unit,
    onSave: (
        type: ClinicEventType,
        date: LocalDate,
        time: LocalTime,
        title: String?,
        reason: String?,
        patientId: String?,
    ) -> Unit,
    onDelete: (() -> Unit)?,
    searchPatients: suspend (String) -> List<Patient> = { emptyList() },
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val zone = ZoneId.systemDefault()
    val existingInstant = existing?.let { Instant.parse(it.scheduledAt).atZone(zone) }

    var eventType by remember(existing) {
        mutableStateOf(existing?.eventType ?: ClinicEventType.follow_up)
    }
    var date by remember(existing) {
        mutableStateOf(existingInstant?.toLocalDate()?.toString() ?: defaultDate.toString())
    }
    var time by remember(existing) {
        mutableStateOf(
            existingInstant?.toLocalTime()?.format(DateTimeFormatter.ofPattern("HH:mm"))
                ?: "09:00",
        )
    }
    var title by remember(existing) { mutableStateOf(existing?.title.orEmpty()) }
    var reason by remember(existing) { mutableStateOf(existing?.reason.orEmpty()) }
    var patientQuery by remember(existing) { mutableStateOf(existing?.patientName.orEmpty()) }
    var patientResults by remember { mutableStateOf<List<Patient>>(emptyList()) }
    var selectedPatientId by remember(existing) { mutableStateOf(existing?.patientId) }
    var selectedPatientName by remember(existing) { mutableStateOf(existing?.patientName.orEmpty()) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    var searchJob by remember { mutableStateOf<Job?>(null) }

    LaunchedEffect(patientQuery, eventType) {
        if (eventType != ClinicEventType.follow_up || patientQuery.length < 2) {
            patientResults = emptyList()
            return@LaunchedEffect
        }
        searchJob?.cancel()
        searchJob = scope.launch {
            delay(300)
            patientResults = searchPatients(patientQuery)
        }
    }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp)
                .padding(bottom = 24.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                if (existing == null) "Add calendar event" else "Edit calendar event",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ClinicEventType.entries.forEach { type ->
                    FilterChip(
                        selected = eventType == type,
                        onClick = { eventType = type },
                        label = { Text(ClinicCalendarEvents.meta[type]?.shortLabel ?: type.wire) },
                    )
                }
            }

            OutlinedTextField(
                value = date,
                onValueChange = { date = it },
                label = { Text("Date (YYYY-MM-DD)") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
            )
            OutlinedTextField(
                value = time,
                onValueChange = { time = it },
                label = { Text("Time (HH:mm)") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
            )

            if (eventType == ClinicEventType.follow_up) {
                OutlinedTextField(
                    value = patientQuery,
                    onValueChange = {
                        patientQuery = it
                        selectedPatientId = null
                    },
                    label = { Text("Patient") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                )
                patientResults.take(6).forEach { patient ->
                    TextButton(onClick = {
                        selectedPatientId = patient.id
                        selectedPatientName = formatPatientName(patient.firstName, patient.lastName, patient.displayName)
                        patientQuery = selectedPatientName
                        patientResults = emptyList()
                    }) {
                        Text(formatPatientName(patient.firstName, patient.lastName, patient.displayName))
                    }
                }
                OutlinedTextField(
                    value = reason,
                    onValueChange = { reason = it },
                    label = { Text("Reason") },
                    modifier = Modifier.fillMaxWidth(),
                )
            } else {
                OutlinedTextField(
                    value = title,
                    onValueChange = { title = it },
                    label = { Text("Title") },
                    modifier = Modifier.fillMaxWidth(),
                )
            }

            error?.let { Text(it, color = MaterialTheme.colorScheme.error) }

            Button(
                onClick = {
                    error = null
                    val parsedDate = runCatching { LocalDate.parse(date) }.getOrNull()
                    val parsedTime = runCatching { LocalTime.parse(time) }.getOrNull()
                    if (parsedDate == null || parsedTime == null) {
                        error = "Enter a valid date and time."
                        return@Button
                    }
                    if (eventType == ClinicEventType.follow_up && selectedPatientId == null) {
                        error = "Pick a patient for follow-up."
                        return@Button
                    }
                    if (eventType != ClinicEventType.follow_up && title.isBlank()) {
                        error = "Add a title for this event."
                        return@Button
                    }
                    onSave(
                        eventType,
                        parsedDate,
                        parsedTime,
                        title.takeIf { it.isNotBlank() },
                        reason.takeIf { it.isNotBlank() },
                        selectedPatientId,
                    )
                },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(if (existing == null) "Save event" else "Update event")
            }

            onDelete?.let { delete ->
                TextButton(onClick = delete, modifier = Modifier.fillMaxWidth()) {
                    Text("Delete event", color = MaterialTheme.colorScheme.error)
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EventDetailSheet(
    event: ClinicAppointment,
    onDismiss: () -> Unit,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState()
    val zone = ZoneId.systemDefault()
    val at = Instant.parse(event.scheduledAt).atZone(zone)
    val meta = ClinicCalendarEvents.meta[event.eventType]

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp)
                .padding(bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(ClinicCalendarEvents.appointmentTitle(event), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Text("${meta?.label ?: event.eventType.wire} · ${at.format(DateTimeFormatter.ofPattern("EEE d MMM · HH:mm"))}")
            event.reason?.takeIf { it.isNotBlank() }?.let { Text(it) }
            Button(onClick = onEdit, modifier = Modifier.fillMaxWidth()) { Text("Edit") }
            TextButton(onClick = onDelete, modifier = Modifier.fillMaxWidth()) {
                Text("Delete", color = MaterialTheme.colorScheme.error)
            }
        }
    }
}
