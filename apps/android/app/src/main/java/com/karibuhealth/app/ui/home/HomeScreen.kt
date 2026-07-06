package com.karibuhealth.app.ui.home

import com.karibuhealth.app.util.parseServerInstant

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.karibuhealth.app.domain.model.OpdPatientFilter
import com.karibuhealth.app.domain.model.OpdPatientRow
import com.karibuhealth.app.domain.model.Patient
import com.karibuhealth.app.data.local.db.entity.VisitWithPatient
import com.karibuhealth.app.domain.model.StaffRole
import com.karibuhealth.app.ui.lab.LabHomeScreen
import com.karibuhealth.app.ui.pharmacy.PharmacyHomeScreen
import com.karibuhealth.app.ui.components.KhMetaText
import com.karibuhealth.app.ui.components.KhStatusKind
import com.karibuhealth.app.ui.components.KhStatusPill
import com.karibuhealth.app.ui.components.SyncDetailsSheet
import com.karibuhealth.app.ui.theme.Amber
import com.karibuhealth.app.ui.theme.Cobalt
import com.karibuhealth.app.ui.theme.CobaltSoft
import com.karibuhealth.app.ui.theme.Green
import com.karibuhealth.app.ui.theme.Ink
import com.karibuhealth.app.ui.theme.Line
import com.karibuhealth.app.ui.theme.Muted
import com.karibuhealth.app.ui.adaptive.KaribuLayout
import com.karibuhealth.app.ui.adaptive.supportsListDetail
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    onNavigateToQueue: () -> Unit,
    onNavigateToNewVisit: () -> Unit,
    onNavigateToVisitDetails: (String) -> Unit,
    onNavigateToPatient: (String) -> Unit,
    onNavigateToBilling: () -> Unit = {},
    selectedPatientId: String? = null,
    onSelectPatient: (String) -> Unit = onNavigateToPatient,
    modifier: Modifier = Modifier,
    viewModel: HomeViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()

    when (uiState.staff?.role) {
        StaffRole.lab_tech -> {
            LabHomeScreen(
                onNavigateToVisit = onNavigateToVisitDetails,
            )
            return
        }
        StaffRole.dispenser -> {
            PharmacyHomeScreen(
                onNavigateToVisit = onNavigateToVisitDetails,
                onNavigateToBilling = onNavigateToBilling,
            )
            return
        }
        else -> Unit
    }

    var isRefreshing by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    // WP2 D4: tapping the TO SYNC tile opens the sync-details sheet so the
    // clinician can see (and rescue) stuck clinical writes.
    var showSyncSheet by remember { mutableStateOf(false) }
    val pendingEntries by viewModel.pendingEntries.collectAsState()
    val failedEntries by viewModel.failedEntries.collectAsState()

    if (showSyncSheet) {
        SyncDetailsSheet(
            entries = pendingEntries,
            failedEntries = failedEntries,
            onDismiss = { showSyncSheet = false },
            onRetryAll = {
                viewModel.retryAllSync()
                showSyncSheet = false
            },
            onMarkSynced = viewModel::markEntrySynced,
        )
    }

    Scaffold(
        contentWindowInsets = WindowInsets(0, 0, 0, 0),
        floatingActionButton = {
            FloatingActionButton(
                onClick = onNavigateToNewVisit,
                modifier = Modifier.imePadding(),
                containerColor = Cobalt,
                contentColor = Color.White,
                shape = RoundedCornerShape(20.dp),
            ) {
                Icon(Icons.Default.Add, contentDescription = "New patient")
            }
        },
    ) { innerPadding ->
        PullToRefreshBox(
            isRefreshing = isRefreshing,
            onRefresh = {
                scope.launch {
                    isRefreshing = true
                    viewModel.refreshAndAwait()
                    isRefreshing = false
                }
            },
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .then(modifier),
        ) {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(
                    top = 12.dp,
                    bottom = KaribuLayout.bottomBarScrollPadding().dp,
                ),
                verticalArrangement = Arrangement.spacedBy(0.dp),
            ) {
                item {
                    HomeHero(
                        seen = uiState.doneTodayCount,
                        waiting = uiState.waitingCount,
                    )
                }

                item {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = KaribuLayout.contentPaddingHorizontal(), vertical = 4.dp),
                    ) {
                        OutlinedTextField(
                            value = uiState.searchQuery,
                            onValueChange = viewModel::updateSearch,
                            modifier = Modifier.fillMaxWidth(),
                            placeholder = { Text("Find patient by phone or name", color = MaterialTheme.colorScheme.onSurfaceVariant) },
                            leadingIcon = {
                                Icon(Icons.Default.Search, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                            },
                            singleLine = true,
                            shape = RoundedCornerShape(12.dp),
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedBorderColor = Cobalt,
                                unfocusedBorderColor = Line,
                            ),
                        )
                    }
                }

                item {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = KaribuLayout.contentPaddingHorizontal(), vertical = 4.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        StatTile(
                            label = "WAITING",
                            value = uiState.waitingCount.toString(),
                            modifier = Modifier.weight(1f),
                        )
                        StatTile(
                            label = "TO SYNC",
                            value = uiState.pendingSyncCount.toString(),
                            modifier = Modifier.weight(1f),
                            indicatorColor = if (uiState.pendingSyncCount > 0) Amber else null,
                            attentionCount = uiState.needsAttentionCount,
                            onClick = if (
                                uiState.pendingSyncCount > 0 || uiState.needsAttentionCount > 0
                            ) {
                                { showSyncSheet = true }
                            } else {
                                null
                            },
                        )
                        StatTile(
                            label = "DONE",
                            value = uiState.doneTodayCount.toString(),
                            modifier = Modifier.weight(1f),
                        )
                    }
                }

                if (uiState.searchQuery.isNotBlank()) {
                    item {
                        SectionHeader(
                            title = "Search Results",
                            countSuffix = uiState.searchResults.size.takeIf { it > 0 },
                        )
                    }

                    if (uiState.isSearching) {
                        item {
                            EmptyHint("Searching patients...")
                        }
                    } else if (uiState.searchResults.isEmpty()) {
                        item {
                            EmptyHint("No matching patients. Tap + to register a new one.")
                        }
                    } else {
                        items(uiState.searchResults, key = { "p-${it.id}" }) { patient ->
                            SearchResultCard(
                                patient = patient,
                                // Tap the card body to open the patient
                                // timeline (Phase 3 patient-first UX).
                                // "Start Visit" stays on the right for the
                                // legacy queue-driven flow.
                                onOpenPatient = { onSelectPatient(patient.id) },
                                onStartVisit = {
                                    scope.launch {
                                        viewModel.startVisitForPatient(patient.id)?.let(onNavigateToVisitDetails)
                                    }
                                },
                            )
                        }
                    }
                }

                if (uiState.searchQuery.isBlank()) {
                    val patients = uiState.activePatients
                    item {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = KaribuLayout.contentPaddingHorizontal(), vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                text = if (uiState.waitingCount > 0) "Up next" else "Today's patients",
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.SemiBold,
                                color = MaterialTheme.colorScheme.onSurface,
                                modifier = Modifier.weight(1f),
                            )
                            KhMetaText(
                                text = if (patients.size == 1) {
                                    "1 PATIENT"
                                } else {
                                    "${patients.size} PATIENTS"
                                },
                            )
                        }
                    }

                    if (patients.isEmpty()) {
                        item {
                            EmptyHint(
                                text = if (uiState.isLoading) {
                                    "Loading..."
                                } else {
                                    "No patients waiting. Tap + to register one."
                                },
                            )
                        }
                    } else {
                        items(patients, key = { "opd-${it.patientId}" }) { row ->
                            Box(modifier = Modifier.padding(horizontal = KaribuLayout.contentPaddingHorizontal(), vertical = 4.dp)) {
                                OpdPatientCard(
                                    row = row,
                                    selected = selectedPatientId == row.patientId,
                                    onClick = {
                                        viewModel.recordPatientTouch(
                                            row.patientId,
                                            row.patientName,
                                            row.visitId,
                                        )
                                        onSelectPatient(row.patientId)
                                    },
                                )
                            }
                        }
                    }

                    if (uiState.showPhysicalQueueFilter && uiState.doneTodayCount > 0) {
                        item {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(horizontal = KaribuLayout.contentPaddingHorizontal())
                                    .padding(top = 12.dp, bottom = 16.dp)
                                    .clickable(onClick = onNavigateToQueue),
                            ) {
                                Text(
                                    text = "${uiState.doneTodayCount} completed today · open queue",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                    } else if (!uiState.showPhysicalQueueFilter && uiState.doneTodayCount > 0) {
                        item {
                            Text(
                                text = "${uiState.doneTodayCount} completed today",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                modifier = Modifier.padding(horizontal = KaribuLayout.contentPaddingHorizontal(), vertical = 12.dp),
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun HomeHero(
    seen: Int,
    waiting: Int,
) {
    val today = LocalDate.now()
    val datePretty = today.format(DateTimeFormatter.ofPattern("EEE d MMM"))

    Column(modifier = Modifier.padding(horizontal = KaribuLayout.contentPaddingHorizontal(), vertical = 4.dp)) {
        Text(
            text = "Today, $datePretty",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Spacer(Modifier.height(4.dp))
        Text(
            text = buildAnnotatedString {
                withStyle(SpanStyle(color = MaterialTheme.colorScheme.onSurface, fontWeight = FontWeight.SemiBold)) {
                    append("$seen seen.")
                }
                append(" ")
                withStyle(SpanStyle(color = Cobalt, fontWeight = FontWeight.SemiBold)) {
                    append("$waiting waiting.")
                }
            },
            fontSize = 30.sp,
            lineHeight = 34.sp,
        )
    }
}

@Composable
private fun StatTile(
    label: String,
    value: String,
    modifier: Modifier = Modifier,
    indicatorColor: Color? = null,
    // WP2 D4: terminally-failed outbox count. Rendered in error style as a
    // second line so a shrinking "to sync" number never hides stuck writes.
    attentionCount: Int = 0,
    onClick: (() -> Unit)? = null,
) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(12.dp))
            .background(MaterialTheme.colorScheme.surface)
            .border(1.dp, Line, RoundedCornerShape(12.dp))
            .then(if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier)
            .padding(horizontal = 12.dp, vertical = 10.dp),
    ) {
        Column {
            KhMetaText(text = label)
            Spacer(Modifier.height(4.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = value,
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                if (indicatorColor != null) {
                    Spacer(Modifier.width(6.dp))
                    Box(
                        modifier = Modifier
                            .size(6.dp)
                            .clip(CircleShape)
                            .background(indicatorColor),
                    )
                }
            }
            if (attentionCount > 0) {
                Text(
                    text = "$attentionCount need attention",
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.error,
                )
            }
        }
    }
}

@Composable
private fun SectionHeader(
    title: String,
    countSuffix: Int? = null,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = KaribuLayout.contentPaddingHorizontal(), vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = if (countSuffix != null) "$title ($countSuffix)" else title,
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onSurface,
        )
    }
}

@Composable
private fun EmptyHint(text: String) {
    Box(modifier = Modifier.padding(horizontal = KaribuLayout.contentPaddingHorizontal(), vertical = 8.dp)) {
        Text(
            text = text,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun SearchResultCard(
    patient: Patient,
    onOpenPatient: () -> Unit,
    onStartVisit: () -> Unit,
) {
    val name = listOfNotNull(patient.firstName, patient.lastName)
        .joinToString(" ")
        .ifBlank { patient.displayName ?: "Unknown" }
    val age = patient.dateOfBirth?.let(::formatAgeFromDob)

    Box(modifier = Modifier.padding(horizontal = KaribuLayout.contentPaddingHorizontal(), vertical = 4.dp)) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(14.dp))
                .background(MaterialTheme.colorScheme.surface)
                .border(1.dp, Line, RoundedCornerShape(14.dp))
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // Tap the patient-summary column to open the timeline. Keeps
            // "Start Visit" as a discrete button so the existing queue-driven
            // flow stays clickable without a long-press.
            Column(
                modifier = Modifier
                    .weight(1f)
                    .clickable(onClick = onOpenPatient),
            ) {
                Text(
                    text = name,
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurface,
                )
                val meta = listOfNotNull(
                    age,
                    patient.whatsappNumber,
                ).joinToString(" · ")
                if (meta.isNotBlank()) {
                    Text(
                        text = meta,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                patient.dateOfBirth?.let {
                    Text(
                        text = "DOB: ${formatDobForDisplay(it)}",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Text(
                    text = "Tap to open patient",
                    style = MaterialTheme.typography.labelSmall,
                    color = Cobalt,
                )
            }

            Button(
                onClick = onStartVisit,
                colors = ButtonDefaults.buttonColors(containerColor = Cobalt),
                shape = RoundedCornerShape(10.dp),
            ) {
                Text("Start Visit")
            }
        }
    }
}

@Composable
private fun OpdPatientCard(
    row: OpdPatientRow,
    onClick: () -> Unit,
    selected: Boolean = false,
) {
    val (kind, statusLabel) = when (row.bucket) {
        OpdPatientFilter.Waiting -> KhStatusKind.Waiting to "Waiting"
        OpdPatientFilter.NeedsVitals -> KhStatusKind.Vitals to "Needs vitals"
        OpdPatientFilter.WithClinician -> KhStatusKind.InNote to "With clinician"
        OpdPatientFilter.AwaitingLabs -> KhStatusKind.Lab to "Awaiting labs"
        OpdPatientFilter.AtPharmacy -> KhStatusKind.Ready to "At pharmacy"
        OpdPatientFilter.DoneToday -> KhStatusKind.Done to "Done"
    }
    val accentColor: Color = when (kind) {
        KhStatusKind.Urgent -> Amber
        KhStatusKind.Vitals, KhStatusKind.Sent, KhStatusKind.Signed, KhStatusKind.Cosigned -> Green
        KhStatusKind.Errored, KhStatusKind.Voided -> Amber
        KhStatusKind.Addended, KhStatusKind.Amended -> Amber
        KhStatusKind.InNote, KhStatusKind.Ready, KhStatusKind.Review,
        KhStatusKind.Lab, KhStatusKind.Waiting, KhStatusKind.Done,
        KhStatusKind.Draft, KhStatusKind.PendingReview -> Cobalt
    }
    val waitText = row.checkedInAt?.let { "${formatWaitTime(it)} ago" } ?: "—"
    val ageBand = listOfNotNull(row.ageLabel, row.sex?.firstOrNull()?.uppercaseChar()?.toString())
        .joinToString("")

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(
                if (selected) CobaltSoft.copy(alpha = 0.35f) else MaterialTheme.colorScheme.surface,
            )
            .border(
                width = if (selected) 2.dp else 1.dp,
                color = if (selected) Cobalt else Line,
                shape = RoundedCornerShape(14.dp),
            )
            .clickable(onClick = onClick),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .width(3.dp)
                .height(64.dp)
                .background(accentColor),
        )
        Column(modifier = Modifier.padding(12.dp).weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = row.patientName,
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier.weight(1f),
                )
                if (ageBand.isNotBlank()) {
                    Spacer(Modifier.width(8.dp))
                    KhMetaText(text = ageBand)
                }
                Spacer(Modifier.width(8.dp))
                KhStatusPill(kind = kind, label = statusLabel)
            }
            Spacer(Modifier.height(4.dp))
            Text(
                text = row.chiefComplaint?.takeIf { it.isNotBlank() } ?: "—",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Spacer(Modifier.height(6.dp))
            KhMetaText(text = waitText)
        }
    }
}

@Composable
private fun QueueCard(visit: VisitWithPatient, onClick: () -> Unit) {
    val v = visit.visit
    val p = visit.patient ?: return // orphaned visit (patient not synced) — skip
    val name = listOfNotNull(p.firstName, p.lastName)
        .joinToString(" ")
        .ifBlank { p.displayName ?: p.whatsappNumber ?: "Unknown" }

    val (kind, statusLabel) = when {
        v.priority == "urgent" || v.priority == "high" -> KhStatusKind.Urgent to "Urgent"
        v.queueStatus == "with_nurse" -> KhStatusKind.Vitals to "In vitals"
        v.queueStatus == "ready_for_doctor" -> KhStatusKind.Ready to "Ready"
        v.queueStatus == "with_doctor" -> KhStatusKind.InNote to "With me"
        else -> KhStatusKind.Waiting to "Waiting"
    }
    val accentColor: Color = when (kind) {
        KhStatusKind.Urgent -> Amber
        KhStatusKind.Vitals, KhStatusKind.Sent, KhStatusKind.Signed, KhStatusKind.Cosigned -> Green
        KhStatusKind.Errored, KhStatusKind.Voided -> Amber
        KhStatusKind.Addended, KhStatusKind.Amended -> Amber
        // All other queue + note kinds anchor on the brand cobalt accent.
        KhStatusKind.InNote, KhStatusKind.Ready, KhStatusKind.Review,
        KhStatusKind.Lab, KhStatusKind.Waiting, KhStatusKind.Done,
        KhStatusKind.Draft, KhStatusKind.PendingReview -> Cobalt
    }
    val patientId = p.patientNumber ?: "PT-${p.id.take(6)}"
    val ageBand = listOfNotNull(
        p.dateOfBirth?.let(::formatAgeFromDob),
        p.sex?.firstOrNull()?.uppercaseChar()?.toString(),
    ).joinToString("")
    val waitText = v.checkedInAt?.let { "${formatWaitTime(it)} ago" } ?: "—"

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(MaterialTheme.colorScheme.surface)
            .border(1.dp, Line, RoundedCornerShape(14.dp))
            .clickable(onClick = onClick),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .width(3.dp)
                .height(64.dp)
                .background(accentColor),
        )
        Column(modifier = Modifier.padding(12.dp).weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = name,
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier.weight(1f),
                )
                if (ageBand.isNotBlank()) {
                    Spacer(Modifier.width(8.dp))
                    KhMetaText(text = ageBand)
                }
                Spacer(Modifier.width(8.dp))
                KhStatusPill(kind = kind, label = statusLabel)
            }
            Spacer(Modifier.height(4.dp))
            Text(
                text = v.chiefComplaint?.takeIf { it.isNotBlank() } ?: "—",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Spacer(Modifier.height(6.dp))
            KhMetaText(text = "$patientId · $waitText")
        }
    }
}

@Composable
private fun StatusCard(
    visit: VisitWithPatient,
    kind: KhStatusKind,
    statusLabel: String,
    onClick: () -> Unit,
) {
    val v = visit.visit
    val p = visit.patient ?: return // orphaned visit (patient not synced) — skip
    val name = listOfNotNull(p.firstName, p.lastName)
        .joinToString(" ")
        .ifBlank { p.displayName ?: p.whatsappNumber ?: "Unknown" }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(MaterialTheme.colorScheme.surface)
            .border(1.dp, Line, RoundedCornerShape(14.dp))
            .clickable(onClick = onClick)
            .padding(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = name,
                style = MaterialTheme.typography.bodyLarge,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Text(
                text = v.chiefComplaint?.takeIf { it.isNotBlank() } ?: v.visitDate,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        KhStatusPill(kind = kind, label = statusLabel)
    }
}

private fun formatWaitTime(checkedInAt: String): String {
    return try {
        val checkedIn = parseServerInstant(checkedInAt)
        val mins = ChronoUnit.MINUTES.between(checkedIn, Instant.now())
        when {
            mins < 1 -> "just now"
            mins < 60 -> "${mins}m"
            else -> "${mins / 60}h ${mins % 60}m"
        }
    } catch (_: Exception) {
        ""
    }
}

private fun formatDobForDisplay(isoDate: String): String {
    val parts = isoDate.split('-')
    return if (parts.size == 3) "${parts[2]}-${parts[1]}-${parts[0]}" else isoDate
}

private fun formatAgeFromDob(isoDate: String): String? {
    return try {
        val dob = LocalDate.parse(isoDate)
        val today = LocalDate.now()
        val period = java.time.Period.between(dob, today)
        when {
            period.years > 0 -> "${period.years}y"
            period.months > 0 -> "${period.months}m"
            else -> "${period.days}d"
        }
    } catch (_: Exception) {
        null
    }
}
