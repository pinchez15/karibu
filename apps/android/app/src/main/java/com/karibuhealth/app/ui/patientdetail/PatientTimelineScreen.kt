package com.karibuhealth.app.ui.patientdetail

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SmallFloatingActionButton
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.karibuhealth.app.domain.model.Patient
import com.karibuhealth.app.domain.model.PatientLatestVitals
import com.karibuhealth.app.domain.model.PatientTimelineEvent
import com.karibuhealth.app.ui.components.KhMetaText
import com.karibuhealth.app.ui.components.KhStatusKind
import com.karibuhealth.app.ui.components.KhStatusPill
import com.karibuhealth.app.ui.theme.Amber
import com.karibuhealth.app.ui.theme.Cobalt
import com.karibuhealth.app.ui.theme.CobaltSoft
import com.karibuhealth.app.ui.theme.Green
import com.karibuhealth.app.ui.theme.Line
import com.karibuhealth.app.ui.theme.Slate
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/**
 * Phase 3 patient timeline screen. One surface where a clinician opens a
 * patient, sees their longitudinal context (visits / notes / vitals /
 * payments in chronological order), the latest-known value for each vital,
 * and can add a new note without first creating a visit.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PatientTimelineScreen(
    patientId: String,
    onNavigateBack: () -> Unit,
    onNavigateToVisit: (String) -> Unit,
    onAddNote: (String) -> Unit,
    onRecordVitals: (String) -> Unit,
    viewModel: PatientTimelineViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()

    LaunchedEffect(patientId) {
        viewModel.loadPatient(patientId)
    }

    // Refresh on resume so when the user returns from PatientVitals (Phase
    // 4) or any future patient-scoped editor, the timeline reflects the new
    // row without forcing a pull-to-refresh. The initial load is gated by
    // loadedPatientId so this doesn't double-fetch on first composition.
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                viewModel.refresh()
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    val listState = rememberLazyListState()
    // Trigger pagination when the user is within ~6 items of the tail. Using
    // derivedStateOf so we don't rerun the predicate on every visible-item
    // recomposition tick.
    val shouldLoadMore by remember {
        derivedStateOf {
            val layout = listState.layoutInfo
            val lastVisible = layout.visibleItemsInfo.lastOrNull()?.index ?: 0
            val total = layout.totalItemsCount
            total > 0 && lastVisible >= total - 6
        }
    }
    LaunchedEffect(shouldLoadMore, uiState.events.size) {
        if (shouldLoadMore && uiState.hasMore && !uiState.isLoadingMore && !uiState.isLoading) {
            viewModel.loadMore()
        }
    }

    Scaffold(
        contentWindowInsets = WindowInsets(0, 0, 0, 0),
        topBar = {
            TopAppBar(
                windowInsets = WindowInsets(0, 0, 0, 0),
                title = {
                    Column {
                        Text(
                            text = uiState.patient?.fullName?.ifBlank { "Patient" } ?: "Patient",
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.SemiBold,
                            color = MaterialTheme.colorScheme.onSurface,
                        )
                        val sub = uiState.patient?.let { patientSubtitle(it) }
                        if (!sub.isNullOrBlank()) {
                            KhMetaText(text = sub)
                        }
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Back",
                        )
                    }
                },
            )
        },
        floatingActionButton = {
            // Two stacked FABs: vitals (secondary, small) above the primary
            // "Add note" extended FAB. The patient timeline is the entry point
            // for both patient-scoped actions; visit-tied entry stays in the
            // visit flow.
            Column(
                modifier = Modifier.imePadding(),
                horizontalAlignment = Alignment.End,
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                SmallFloatingActionButton(
                    onClick = { onRecordVitals(patientId) },
                    containerColor = MaterialTheme.colorScheme.surface,
                    contentColor = Cobalt,
                    shape = RoundedCornerShape(16.dp),
                ) {
                    Icon(Icons.Default.Favorite, contentDescription = "Record vitals")
                }
                ExtendedFloatingActionButton(
                    onClick = { onAddNote(patientId) },
                    containerColor = Cobalt,
                    contentColor = Color.White,
                    shape = RoundedCornerShape(20.dp),
                    icon = { Icon(Icons.Default.Edit, contentDescription = null) },
                    text = { Text("Add note", fontWeight = FontWeight.SemiBold) },
                )
            }
        },
    ) { innerPadding ->
        LazyColumn(
            state = listState,
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
            contentPadding = PaddingValues(top = 12.dp, bottom = 96.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            item {
                LatestVitalsCard(latestVitals = uiState.latestVitals)
            }

            item {
                SectionHeader(title = "Timeline")
            }

            if (uiState.isLoading) {
                item { EmptyHint("Loading timeline...") }
            } else if (uiState.events.isEmpty()) {
                item {
                    EmptyHint(
                        text = uiState.error
                            ?: "No history yet. Tap \"Add note\" to start.",
                    )
                }
            } else {
                items(uiState.events, key = { it.eventId }) { event ->
                    Box(modifier = Modifier.padding(horizontal = 20.dp)) {
                        when (event) {
                            is PatientTimelineEvent.VisitEvent -> VisitEventCard(
                                event = event,
                                onClick = { onNavigateToVisit(event.visitId) },
                            )
                            is PatientTimelineEvent.NoteEvent -> NoteEventCard(event = event)
                            is PatientTimelineEvent.VitalEvent -> VitalEventCard(event = event)
                            is PatientTimelineEvent.PaymentEvent -> PaymentEventCard(event = event)
                            is PatientTimelineEvent.TaskEvent -> TaskEventCard(event = event)
                        }
                    }
                }
            }

            if (uiState.isLoadingMore) {
                item {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(20.dp),
                            strokeWidth = 2.dp,
                            color = Cobalt,
                        )
                    }
                }
            }
        }
    }
}

// -----------------------------------------------------------------------------
// Latest-known vitals card
// -----------------------------------------------------------------------------

@Composable
private fun LatestVitalsCard(latestVitals: PatientLatestVitals?) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(14.dp))
                .background(MaterialTheme.colorScheme.surface)
                .border(1.dp, Line, RoundedCornerShape(14.dp))
                .padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            KhMetaText(text = "LATEST KNOWN")
            if (latestVitals == null) {
                Text(
                    text = "Latest vitals unavailable",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                return@Column
            }
            // Each row: name on the left, value + relative date on the right.
            // Captured rows are emphasized; never-measured rows are subdued
            // ("not yet captured") so the clinician can quickly see which
            // measurements still need to be taken.
            LatestVitalRow(
                label = "Weight",
                value = latestVitals.weightKg?.let { "%.1f kg".format(it) },
                at = latestVitals.weightKgAt,
            )
            LatestVitalRow(
                label = "Height",
                value = latestVitals.heightCm?.let { "%.1f cm".format(it) },
                at = latestVitals.heightCmAt,
            )
            LatestVitalRow(
                label = "Temperature",
                value = latestVitals.tempC?.let { "%.1f °C".format(it) },
                at = latestVitals.tempCAt,
            )
            LatestVitalRow(
                label = "Blood pressure",
                value = if (latestVitals.bpSystolic != null && latestVitals.bpDiastolic != null) {
                    "${latestVitals.bpSystolic}/${latestVitals.bpDiastolic}"
                } else null,
                at = latestVitals.bpAt,
            )
            LatestVitalRow(
                label = "Pulse",
                value = latestVitals.pulseBpm?.let { "$it bpm" },
                at = latestVitals.pulseBpmAt,
            )
            LatestVitalRow(
                label = "Resp. rate",
                value = latestVitals.respRate?.let { "$it /min" },
                at = latestVitals.respRateAt,
            )
            LatestVitalRow(
                label = "SpO₂",
                value = latestVitals.spo2Pct?.let { "$it%" },
                at = latestVitals.spo2PctAt,
            )
            LatestVitalRow(
                label = "MUAC",
                value = latestVitals.muacCm?.let { "%.1f cm".format(it) },
                at = latestVitals.muacCmAt,
            )
        }
    }
}

@Composable
private fun LatestVitalRow(label: String, value: String?, at: String?) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = label,
            modifier = Modifier.width(120.dp),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (value != null) {
            Text(
                text = value,
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurface,
            )
            if (!at.isNullOrBlank()) {
                Spacer(Modifier.width(8.dp))
                Text(
                    text = "· ${formatShortDate(at)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        } else {
            Text(
                text = "not yet captured",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}

// -----------------------------------------------------------------------------
// Timeline event cards — one composable per event_type
// -----------------------------------------------------------------------------

@Composable
private fun TimelineCardFrame(
    accent: Color,
    onClick: (() -> Unit)? = null,
    content: @Composable () -> Unit,
) {
    val rowModifier = Modifier
        .fillMaxWidth()
        .clip(RoundedCornerShape(14.dp))
        .background(MaterialTheme.colorScheme.surface)
        .border(1.dp, Line, RoundedCornerShape(14.dp))
        .let { if (onClick != null) it.clickable(onClick = onClick) else it }

    Row(
        modifier = rowModifier,
        verticalAlignment = Alignment.Top,
    ) {
        Box(
            modifier = Modifier
                .width(3.dp)
                .height(72.dp)
                .background(accent),
        )
        Column(
            modifier = Modifier
                .padding(12.dp)
                .fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            content()
        }
    }
}

@Composable
private fun VisitEventCard(event: PatientTimelineEvent.VisitEvent, onClick: () -> Unit) {
    // Clinical-note display labels (May 2026 rename). The underlying status
    // enum stayed the same; only the user-facing language changed to match
    // the clinical-note vocabulary clinicians know from other EMRs.
    val statusPill = when (event.status) {
        "sent" -> KhStatusKind.Signed to "Signed"
        "completed" -> KhStatusKind.Done to "Closed"
        "review" -> KhStatusKind.PendingReview to "Pending Review"
        "error" -> KhStatusKind.Errored to "Errored"
        "pending" -> KhStatusKind.Draft to "Draft"
        else -> KhStatusKind.Waiting to event.status.replaceFirstChar { it.uppercase() }
    }
    TimelineCardFrame(accent = Cobalt, onClick = onClick) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            KhMetaText(text = "VISIT · ${event.department.uppercase()}")
            Spacer(Modifier.weight(1f))
            KhStatusPill(kind = statusPill.first, label = statusPill.second)
        }
        Text(
            text = event.chiefComplaint?.takeIf { it.isNotBlank() } ?: "(no chief complaint recorded)",
            style = MaterialTheme.typography.bodyLarge,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onSurface,
        )
        event.diagnosis?.takeIf { it.isNotBlank() }?.let {
            Text(
                text = "Dx: $it",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface,
            )
        }
        KhMetaText(text = formatLongDate(event.eventAt))
    }
}

@Composable
private fun NoteEventCard(event: PatientTimelineEvent.NoteEvent) {
    val (sourceLabel, sourceColor) = when (event.source) {
        "visit" -> "Visit" to Cobalt
        "phone_call" -> "Phone call" to Slate
        "follow_up" -> "Follow-up" to Slate
        "lab_update" -> "Lab update" to Slate
        "pharmacy_update" -> "Pharmacy update" to Slate
        "general" -> "General" to Slate
        else -> event.source.replaceFirstChar { it.uppercase() } to Slate
    }
    val statusPill = when (event.status) {
        "signed" -> KhStatusKind.Sent to "Signed"
        "amended" -> KhStatusKind.Review to "Amended"
        "draft" -> KhStatusKind.InNote to "Draft"
        else -> KhStatusKind.Waiting to event.status.replaceFirstChar { it.uppercase() }
    }
    TimelineCardFrame(accent = sourceColor) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            KhMetaText(text = "NOTE · ${sourceLabel.uppercase()}")
            Spacer(Modifier.weight(1f))
            KhStatusPill(kind = statusPill.first, label = statusPill.second)
        }
        Text(
            text = event.transcriptPreview.ifBlank { "(empty note)" },
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurface,
            maxLines = 6,
        )
        KhMetaText(text = formatLongDate(event.eventAt))
    }
}

@Composable
private fun VitalEventCard(event: PatientTimelineEvent.VitalEvent) {
    TimelineCardFrame(accent = Green) {
        KhMetaText(text = "VITALS")
        // Bold the actually-captured measurements; rendering "—" for missing
        // would be noisy. Compact strip per the prompt.
        val captured = buildList {
            event.weightKg?.let { add("Weight ${"%.1f".format(it)} kg") }
            event.heightCm?.let { add("Height ${"%.1f".format(it)} cm") }
            event.tempC?.let { add("Temp ${"%.1f".format(it)} °C") }
            if (event.bpSystolic != null && event.bpDiastolic != null) {
                add("BP ${event.bpSystolic}/${event.bpDiastolic}")
            }
            event.pulseBpm?.let { add("Pulse $it bpm") }
            event.respRate?.let { add("Resp $it/min") }
            event.spo2Pct?.let { add("SpO₂ $it%") }
            event.muacCm?.let { add("MUAC ${"%.1f".format(it)} cm") }
        }
        if (captured.isEmpty()) {
            Text(
                text = "(no measurements recorded)",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        } else {
            Text(
                text = captured.joinToString(" · "),
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurface,
            )
        }
        event.notes?.takeIf { it.isNotBlank() }?.let {
            Text(
                text = it,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        KhMetaText(text = formatLongDate(event.eventAt))
    }
}

@Composable
private fun PaymentEventCard(event: PatientTimelineEvent.PaymentEvent) {
    val accent = when (event.status) {
        "paid" -> Green
        "waived" -> Slate
        "failed" -> Amber
        else -> Cobalt
    }
    TimelineCardFrame(accent = accent) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            KhMetaText(text = "PAYMENT · ${event.paymentMethod.uppercase().replace('_', ' ')}")
            Spacer(Modifier.weight(1f))
            KhStatusPill(
                kind = when (event.status) {
                    "paid" -> KhStatusKind.Sent
                    "waived" -> KhStatusKind.Done
                    "failed" -> KhStatusKind.Urgent
                    else -> KhStatusKind.Waiting
                },
                label = event.status.replaceFirstChar { it.uppercase() },
            )
        }
        Text(
            text = "UGX ${formatAmount(event.amountUgx)}",
            style = MaterialTheme.typography.bodyLarge,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onSurface,
        )
        val receipt = event.receiptNumber?.takeIf { it.isNotBlank() }
            ?.let { "Receipt $it" }
        val service = event.serviceType?.takeIf { it.isNotBlank() }
        val sub = listOfNotNull(service, receipt).joinToString(" · ")
        if (sub.isNotBlank()) {
            Text(
                text = sub,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        KhMetaText(text = formatLongDate(event.eventAt))
    }
}

@Composable
private fun TaskEventCard(event: PatientTimelineEvent.TaskEvent) {
    // Type chip vocabulary mirrors the care_tasks task_type CHECK enum from
    // migration 041. Unknown types fall through to the raw token so a future
    // server-side addition still renders something legible.
    val typeLabel = when (event.taskType) {
        "lab_followup" -> "Lab follow-up"
        "phone_callback" -> "Phone callback"
        "home_visit" -> "Home visit"
        "medication_review" -> "Medication review"
        "referral_followup" -> "Referral follow-up"
        "general" -> "General"
        else -> event.taskType.replace('_', ' ').replaceFirstChar { it.uppercase() }
    }
    val (statusKind, statusLabel) = when (event.status) {
        "completed" -> KhStatusKind.Sent to "Completed"
        "in_progress" -> KhStatusKind.InNote to "In progress"
        "cancelled" -> KhStatusKind.Done to "Cancelled"
        "open" -> KhStatusKind.Waiting to "Open"
        else -> KhStatusKind.Waiting to event.status.replaceFirstChar { it.uppercase() }
    }
    val accent = when (event.status) {
        "completed" -> Green
        "cancelled" -> Slate
        else -> Amber
    }

    TimelineCardFrame(accent = accent) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            KhMetaText(text = "TASK · ${typeLabel.uppercase()}")
            Spacer(Modifier.weight(1f))
            KhStatusPill(kind = statusKind, label = statusLabel)
        }
        Text(
            text = event.title.ifBlank { "(no title)" },
            style = MaterialTheme.typography.bodyLarge,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onSurface,
        )
        event.description?.takeIf { it.isNotBlank() }?.let {
            Text(
                text = it,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 4,
            )
        }
        // Due-date copy: "Overdue Xd" / "Due in Xd" / "Due today" / "Due
        // <date>" when more than a week out. Hidden once completed.
        val dueLabel = if (event.status != "completed" && event.status != "cancelled") {
            event.dueAt?.let { formatDueLabel(it) }
        } else null
        val assigneeLabel = event.assigneeRole?.let { roleLabel(it) }
        val metaParts = listOfNotNull(
            dueLabel,
            assigneeLabel?.let { "Assigned: $it" },
        )
        if (metaParts.isNotEmpty()) {
            Text(
                text = metaParts.joinToString(" · "),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        KhMetaText(text = formatLongDate(event.eventAt))
    }
}

private fun roleLabel(role: String): String =
    role.replace('_', ' ').replaceFirstChar { it.uppercase() }

private fun formatDueLabel(dueAtIso: String): String {
    return runCatching {
        val due = Instant.parse(dueAtIso)
        val today = LocalDate.now(ZoneId.systemDefault())
        val dueDate = due.atZone(ZoneId.systemDefault()).toLocalDate()
        val days = java.time.temporal.ChronoUnit.DAYS.between(today, dueDate).toInt()
        when {
            days < 0 -> "Overdue ${-days}d"
            days == 0 -> "Due today"
            days == 1 -> "Due tomorrow"
            days <= 7 -> "Due in ${days}d"
            else -> "Due ${
                DateTimeFormatter.ofPattern("d MMM").format(dueDate)
            }"
        }
    }.getOrElse { "Due ${dueAtIso.take(10)}" }
}

// -----------------------------------------------------------------------------
// Small helpers
// -----------------------------------------------------------------------------

@Composable
private fun SectionHeader(title: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = title,
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onSurface,
        )
    }
}

@Composable
private fun EmptyHint(text: String) {
    Box(modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp)) {
        Text(
            text = text,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

private fun patientSubtitle(patient: Patient): String {
    val parts = buildList<String> {
        patient.patientId?.let { add("PT-$it") }
        patient.sex?.firstOrNull()?.uppercaseChar()?.toString()?.let { add(it) }
        ageBand(patient)?.let { add(it) }
        patient.village?.takeIf { it.isNotBlank() }?.let { add(it) }
    }
    return parts.joinToString(" · ")
}

private fun ageBand(patient: Patient): String? {
    patient.dateOfBirth?.let { dob ->
        return runCatching {
            val period = java.time.Period.between(LocalDate.parse(dob), LocalDate.now())
            "${period.years}y"
        }.getOrNull()
    }
    patient.approximateAge?.let { return "~${it}y" }
    patient.birthYear?.let { return "${LocalDate.now().year - it}y" }
    return null
}

private fun formatAmount(ugx: Int): String = "%,d".format(ugx)

// "2026-04-08" — keeps it dense and unambiguous on small phones.
private fun formatShortDate(isoTimestamp: String): String {
    return runCatching {
        val instant = Instant.parse(isoTimestamp)
        DateTimeFormatter.ISO_LOCAL_DATE
            .withZone(ZoneId.systemDefault())
            .format(instant)
    }.getOrNull() ?: isoTimestamp.take(10)
}

// "Wed 8 Apr 2026 · 09:21"
private fun formatLongDate(isoTimestamp: String): String {
    return runCatching {
        val instant = Instant.parse(isoTimestamp)
        DateTimeFormatter.ofPattern("EEE d MMM yyyy · HH:mm")
            .withZone(ZoneId.systemDefault())
            .format(instant)
    }.getOrNull() ?: isoTimestamp
}
