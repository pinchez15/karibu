package com.karibuhealth.app.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.automirrored.filled.List
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
import com.karibuhealth.app.domain.model.Patient
import com.karibuhealth.app.data.local.db.entity.VisitWithPatient
import com.karibuhealth.app.domain.model.Staff
import com.karibuhealth.app.ui.components.KhMetaText
import com.karibuhealth.app.ui.components.KhStatusKind
import com.karibuhealth.app.ui.components.KhStatusPill
import com.karibuhealth.app.ui.theme.Amber
import com.karibuhealth.app.ui.theme.Cobalt
import com.karibuhealth.app.ui.theme.CobaltSoft
import com.karibuhealth.app.ui.theme.Green
import com.karibuhealth.app.ui.theme.Ink
import com.karibuhealth.app.ui.theme.Line
import com.karibuhealth.app.ui.theme.Muted
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
    onNavigateToWorklists: () -> Unit,
    viewModel: HomeViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()
    var isRefreshing by remember { mutableStateOf(false) }
    var profileMenuOpen by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

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
                isRefreshing = true
                viewModel.refresh()
                isRefreshing = false
            },
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
        ) {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(top = 12.dp, bottom = 96.dp),
                verticalArrangement = Arrangement.spacedBy(0.dp),
            ) {
                item {
                    HomeAppBar(
                        clinicName = uiState.clinic?.name,
                        staff = uiState.staff,
                        onAvatarClick = { profileMenuOpen = true },
                        profileMenuOpen = profileMenuOpen,
                        onDismissMenu = { profileMenuOpen = false },
                        onSignOut = {
                            profileMenuOpen = false
                            viewModel.signOut()
                        },
                        onOpenWorklists = onNavigateToWorklists,
                    )
                }

                item {
                    HomeHero(
                        seen = uiState.doneTodayCount,
                        waiting = uiState.queue.size,
                    )
                }

                item {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 20.dp, vertical = 8.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        StatTile(
                            label = "TO REVIEW",
                            value = uiState.toReview.size.toString(),
                            modifier = Modifier.weight(1f),
                        )
                        StatTile(
                            label = "TO SYNC",
                            value = uiState.pendingSyncCount.toString(),
                            modifier = Modifier.weight(1f),
                            indicatorColor = if (uiState.pendingSyncCount > 0) Amber else null,
                        )
                        StatTile(
                            label = "DRAFTS",
                            value = uiState.toDictate.size.toString(),
                            modifier = Modifier.weight(1f),
                        )
                    }
                }

                item {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 20.dp, vertical = 8.dp),
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
                                onOpenPatient = { onNavigateToPatient(patient.id) },
                                onStartVisit = {
                                    scope.launch {
                                        viewModel.startVisitForPatient(patient.id)?.let(onNavigateToVisitDetails)
                                    }
                                },
                            )
                        }
                    }
                }

                item {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 20.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(
                            text = "Queue",
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.SemiBold,
                            color = MaterialTheme.colorScheme.onSurface,
                            modifier = Modifier.weight(1f),
                        )
                        KhMetaText(
                            text = if (uiState.queue.size == 1) "1 PATIENT" else "${uiState.queue.size} PATIENTS",
                        )
                    }
                }

                if (uiState.queue.isEmpty()) {
                    item {
                        EmptyHint(
                            text = if (uiState.isLoading) "Loading..." else "No patients in the queue. Tap + to register one.",
                        )
                    }
                } else {
                    items(uiState.queue, key = { "q-${it.visit.id}" }) { v ->
                        Box(modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp)) {
                            QueueCard(
                                visit = v,
                                onClick = {
                                    if (v.visit.queueStatus == "with_doctor") {
                                        onNavigateToVisitDetails(v.visit.id)
                                    } else {
                                        viewModel.startVisit(v.visit.id)
                                        onNavigateToVisitDetails(v.visit.id)
                                    }
                                },
                            )
                        }
                    }
                }

                if (uiState.toReview.isNotEmpty()) {
                    item {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 20.dp, vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                text = "AI review",
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.SemiBold,
                                color = MaterialTheme.colorScheme.onSurface,
                                modifier = Modifier.weight(1f),
                            )
                            KhMetaText(text = "${uiState.toReview.size} READY")
                        }
                    }
                    items(uiState.toReview, key = { "r-${it.visit.id}" }) { v ->
                        Box(modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp)) {
                            StatusCard(
                                visit = v,
                                kind = KhStatusKind.Review,
                                statusLabel = "Review",
                                onClick = { onNavigateToVisitDetails(v.visit.id) },
                            )
                        }
                    }
                }

                if (uiState.toDictate.isNotEmpty()) {
                    item {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 20.dp, vertical = 8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(
                                text = "Drafts",
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.SemiBold,
                                color = MaterialTheme.colorScheme.onSurface,
                                modifier = Modifier.weight(1f),
                            )
                            KhMetaText(text = "${uiState.toDictate.size} TO FINISH")
                        }
                    }
                    items(uiState.toDictate, key = { "d-${it.visit.id}" }) { v ->
                        Box(modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp)) {
                            StatusCard(
                                visit = v,
                                kind = KhStatusKind.InNote,
                                statusLabel = "Draft",
                                onClick = { onNavigateToVisitDetails(v.visit.id) },
                            )
                        }
                    }
                }

                if (uiState.doneTodayCount > 0) {
                    item {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 20.dp)
                                .padding(top = 12.dp, bottom = 16.dp)
                                .clickable(onClick = onNavigateToQueue),
                        ) {
                            Text(
                                text = "${uiState.doneTodayCount} completed today",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun HomeAppBar(
    clinicName: String?,
    staff: Staff?,
    onAvatarClick: () -> Unit,
    profileMenuOpen: Boolean,
    onDismissMenu: () -> Unit,
    onSignOut: () -> Unit,
    onOpenWorklists: () -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            KhMetaText(text = (clinicName ?: "Karibu Health").uppercase())
            Spacer(Modifier.height(2.dp))
            Text(
                text = staff?.displayName ?: "—",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurface,
            )
        }

        // Phase 5 — worklists entry point. Sits next to the profile avatar so
        // it's reachable from the same one-tap zone the clinician already
        // uses for sign-out / clinic info.
        IconButton(onClick = onOpenWorklists) {
            Icon(
                imageVector = Icons.AutoMirrored.Filled.List,
                contentDescription = "Open worklists",
                tint = Cobalt,
            )
        }

        Box {
            ProfileAvatar(staff = staff, onClick = onAvatarClick)
            ProfileMenu(
                expanded = profileMenuOpen,
                staff = staff,
                clinicName = clinicName,
                onDismiss = onDismissMenu,
                onSignOut = onSignOut,
            )
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

    Column(modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp)) {
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
) {
    Box(
        modifier = modifier
            .clip(RoundedCornerShape(12.dp))
            .background(MaterialTheme.colorScheme.surface)
            .border(1.dp, Line, RoundedCornerShape(12.dp))
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
        }
    }
}

@Composable
private fun ProfileAvatar(staff: Staff?, onClick: () -> Unit) {
    val initials = staff?.displayName?.split(" ")
        ?.mapNotNull { it.firstOrNull()?.uppercaseChar() }
        ?.take(2)
        ?.joinToString("")
        ?.ifBlank { null } ?: "?"
    Box(
        modifier = Modifier
            .size(36.dp)
            .clip(CircleShape)
            .background(CobaltSoft)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = initials,
            style = MaterialTheme.typography.labelLarge,
            color = Cobalt,
            fontWeight = FontWeight.SemiBold,
        )
    }
}

@Composable
private fun ProfileMenu(
    expanded: Boolean,
    staff: Staff?,
    clinicName: String?,
    onDismiss: () -> Unit,
    onSignOut: () -> Unit,
) {
    DropdownMenu(expanded = expanded, onDismissRequest = onDismiss) {
        Column(modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) {
            Text(
                text = staff?.displayName ?: "—",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                text = staff?.role?.name?.replace('_', ' ')?.replaceFirstChar { it.titlecase() }
                    ?: "",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            clinicName?.let {
                Text(
                    text = it,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        HorizontalDivider()
        DropdownMenuItem(
            text = { Text("Sign out") },
            leadingIcon = { Icon(Icons.AutoMirrored.Filled.Logout, contentDescription = null) },
            onClick = onSignOut,
        )
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
            .padding(horizontal = 20.dp, vertical = 8.dp),
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
    Box(modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp)) {
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

    Box(modifier = Modifier.padding(horizontal = 20.dp, vertical = 4.dp)) {
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
private fun QueueCard(visit: VisitWithPatient, onClick: () -> Unit) {
    val v = visit.visit
    val p = visit.patient
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
        KhStatusKind.Vitals -> Green
        KhStatusKind.InNote, KhStatusKind.Ready, KhStatusKind.Review -> Cobalt
        KhStatusKind.Sent -> Green
        KhStatusKind.Lab -> Cobalt
        KhStatusKind.Waiting, KhStatusKind.Done -> Cobalt
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
    val p = visit.patient
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
        val checkedIn = Instant.parse(checkedInAt)
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
