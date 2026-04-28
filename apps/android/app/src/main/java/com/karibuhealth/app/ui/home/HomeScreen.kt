package com.karibuhealth.app.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.automirrored.filled.Logout
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.karibuhealth.app.domain.model.Patient
import com.karibuhealth.app.data.local.db.entity.VisitWithPatient
import com.karibuhealth.app.domain.model.Staff
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.temporal.ChronoUnit

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    onNavigateToQueue: () -> Unit,
    onNavigateToNewVisit: () -> Unit,
    onNavigateToVisitDetails: (String) -> Unit,
    viewModel: HomeViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()
    var isRefreshing by remember { mutableStateOf(false) }
    var profileMenuOpen by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    Scaffold(
        // The outer Scaffold in MainActivity already applies status-bar insets
        // for the OfflineBanner. Reapplying them here doubles the top gap.
        contentWindowInsets = WindowInsets(0, 0, 0, 0),
        floatingActionButton = {
            FloatingActionButton(onClick = onNavigateToNewVisit) {
                Icon(Icons.Default.Add, contentDescription = "New patient")
            }
        },
        topBar = {
            // Compact single-line top bar. Profile menu is the only top-bar
            // action — destructive sign-out lives behind it, not as a sibling
            // to the primary "+ New visit" target.
            TopAppBar(
                windowInsets = WindowInsets(0, 0, 0, 0),
                title = {
                    Text(
                        text = uiState.clinic?.name ?: "Karibu Health",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                },
                actions = {
                    Box {
                        ProfileAvatar(
                            staff = uiState.staff,
                            onClick = { profileMenuOpen = true },
                        )
                        ProfileMenu(
                            expanded = profileMenuOpen,
                            staff = uiState.staff,
                            clinicName = uiState.clinic?.name,
                            onDismiss = { profileMenuOpen = false },
                            onSignOut = {
                                profileMenuOpen = false
                                viewModel.signOut()
                            },
                        )
                    }
                },
            )
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
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                item {
                    OutlinedTextField(
                        value = uiState.searchQuery,
                        onValueChange = viewModel::updateSearch,
                        modifier = Modifier.fillMaxWidth(),
                        placeholder = { Text("Search patients by name or phone") },
                        leadingIcon = {
                            Icon(Icons.Default.Search, contentDescription = null)
                        },
                        singleLine = true,
                    )
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
                            EmptyHint("No matching patients. Use + to register a new one.")
                        }
                    } else {
                        items(uiState.searchResults, key = { "p-${it.id}" }) { patient ->
                            SearchResultCard(
                                patient = patient,
                                onStartVisit = {
                                    scope.launch {
                                        viewModel.startVisitForPatient(patient.id)?.let(onNavigateToVisitDetails)
                                    }
                                },
                            )
                        }
                    }
                }

                // ------- Today's Queue -------
                item {
                    SectionHeader(
                        title = "Today",
                        countSuffix = uiState.todayEncounterCount.takeIf { it > 0 },
                    )
                }

                if (uiState.queue.isEmpty()) {
                    item {
                        EmptyHint(
                            text = if (uiState.isLoading) "Loading..." else "No patients in the queue. Tap + New to register one.",
                        )
                    }
                } else {
                    items(uiState.queue, key = { "q-${it.visit.id}" }) { v ->
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

                // ------- Needs Dictation -------
                if (uiState.toDictate.isNotEmpty()) {
                    item { SectionHeader(title = "Needs Dictation", countSuffix = uiState.toDictate.size) }
                    items(uiState.toDictate, key = { "d-${it.visit.id}" }) { v ->
                        StatusCard(
                            visit = v,
                            statusLabel = "To Dictate",
                            statusColor = MaterialTheme.colorScheme.tertiary,
                            onClick = { onNavigateToVisitDetails(v.visit.id) },
                        )
                    }
                }

                // ------- Needs Review -------
                if (uiState.toReview.isNotEmpty()) {
                    item { SectionHeader(title = "Needs Review", countSuffix = uiState.toReview.size) }
                    items(uiState.toReview, key = { "r-${it.visit.id}" }) { v ->
                        StatusCard(
                            visit = v,
                            statusLabel = "Review",
                            statusColor = MaterialTheme.colorScheme.primary,
                            onClick = { onNavigateToVisitDetails(v.visit.id) },
                        )
                    }
                }

                // ------- Done Today (compact footer) -------
                if (uiState.doneTodayCount > 0) {
                    item {
                        Spacer(Modifier.height(4.dp))
                        Text(
                            text = "${uiState.doneTodayCount} completed today",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(top = 8.dp, bottom = 16.dp)
                                .clickable(onClick = onNavigateToQueue),
                        )
                    }
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
            .padding(end = 8.dp)
            .size(36.dp)
            .clip(CircleShape)
            .background(MaterialTheme.colorScheme.primaryContainer)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = initials,
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.onPrimaryContainer,
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
        // Header (read-only): name, role, clinic. Mirrors what was in the
        // top-bar subtitle before; just a less hazardous home for it.
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
    actionLabel: String? = null,
    onActionClick: (() -> Unit)? = null,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = if (countSuffix != null) "$title ($countSuffix)" else title,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.weight(1f),
        )
        if (actionLabel != null && onActionClick != null) {
            TextButton(onClick = onActionClick) {
                Text(actionLabel)
            }
        }
    }
}

@Composable
private fun EmptyHint(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(vertical = 8.dp),
    )
}

@Composable
private fun SearchResultCard(
    patient: Patient,
    onStartVisit: () -> Unit,
) {
    val name = listOfNotNull(patient.firstName, patient.lastName)
        .joinToString(" ")
        .ifBlank { patient.displayName ?: "Unknown" }
    val age = patient.dateOfBirth?.let(::formatAgeFromDob)

    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = name,
                        style = MaterialTheme.typography.bodyLarge,
                        fontWeight = FontWeight.Medium,
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
                }

                Button(onClick = onStartVisit) {
                    Text("Start Visit")
                }
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

    val (statusLabel, statusColor) = when (v.queueStatus) {
        "waiting" -> "Waiting" to MaterialTheme.colorScheme.outline
        "with_nurse" -> "Triage" to MaterialTheme.colorScheme.tertiary
        "ready_for_doctor" -> "Ready" to MaterialTheme.colorScheme.secondary
        "with_doctor" -> "With me" to MaterialTheme.colorScheme.primary
        else -> v.queueStatus to MaterialTheme.colorScheme.outline
    }
    val priorityColor = when (v.priority) {
        "urgent" -> MaterialTheme.colorScheme.error
        "high" -> MaterialTheme.colorScheme.tertiary
        else -> null
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = name,
                        style = MaterialTheme.typography.bodyLarge,
                        fontWeight = FontWeight.Medium,
                    )
                    priorityColor?.let {
                        Spacer(Modifier.width(8.dp))
                        Box(
                            modifier = Modifier
                                .size(8.dp)
                                .clip(CircleShape)
                                .background(it),
                        )
                    }
                }
                Text(
                    text = v.chiefComplaint?.takeIf { it.isNotBlank() } ?: "—",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                v.checkedInAt?.let {
                    Text(
                        text = "${formatWaitTime(it)} ago",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            StatusChip(label = statusLabel, color = statusColor)
        }
    }
}

@Composable
private fun StatusCard(
    visit: VisitWithPatient,
    statusLabel: String,
    statusColor: Color,
    onClick: () -> Unit,
) {
    val v = visit.visit
    val p = visit.patient
    val name = listOfNotNull(p.firstName, p.lastName)
        .joinToString(" ")
        .ifBlank { p.displayName ?: p.whatsappNumber ?: "Unknown" }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = name,
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.Medium,
                )
                Text(
                    text = v.chiefComplaint?.takeIf { it.isNotBlank() } ?: v.visitDate,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            StatusChip(label = statusLabel, color = statusColor)
        }
    }
}

@Composable
private fun StatusChip(label: String, color: Color) {
    SuggestionChip(
        onClick = {},
        label = { Text(label, style = MaterialTheme.typography.labelSmall) },
        colors = SuggestionChipDefaults.suggestionChipColors(
            containerColor = color.copy(alpha = 0.12f),
            labelColor = color,
        ),
    )
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
        val dob = java.time.LocalDate.parse(isoDate)
        val today = java.time.LocalDate.now()
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
