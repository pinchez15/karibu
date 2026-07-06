package com.karibuhealth.app.ui.calendar

import com.karibuhealth.app.util.parseServerInstant

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.karibuhealth.app.domain.ClinicAppointment
import com.karibuhealth.app.domain.ClinicCalendarEvents
import com.karibuhealth.app.domain.ClinicEventType
import com.karibuhealth.app.ui.adaptive.KaribuLayout
import com.karibuhealth.app.ui.theme.Cobalt
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun CalendarScreen(
    embedded: Boolean = false,
    onNavigateToNewVisit: () -> Unit = {},
    onOpenPatient: (String) -> Unit = {},
    modifier: Modifier = Modifier,
    viewModel: CalendarViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()
    val zone = ZoneId.systemDefault()
    val monthFormatter = DateTimeFormatter.ofPattern("MMMM yyyy")
    val dayFormatter = DateTimeFormatter.ofPattern("EEE d MMM")
    val timeFormatter = DateTimeFormatter.ofPattern("HH:mm")

    val grouped = state.appointments
        .groupBy { parseServerInstant(it.scheduledAt).atZone(zone).toLocalDate() }
        .toSortedMap()

    Scaffold(
        modifier = modifier,
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = { viewModel.openAdd() },
                containerColor = Cobalt,
                contentColor = Color.White,
                icon = { Icon(Icons.Default.Add, contentDescription = null) },
                text = { Text("Add event") },
            )
        },
    ) { padding ->
        PullToRefreshBox(
            isRefreshing = state.loading,
            onRefresh = { viewModel.refresh() },
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
        ) {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(
                    start = KaribuLayout.contentPaddingHorizontal(),
                    end = KaribuLayout.contentPaddingHorizontal(),
                    top = if (embedded) 8.dp else 12.dp,
                    bottom = KaribuLayout.bottomBarScrollPadding().dp + 72.dp,
                ),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                item {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        IconButton(onClick = { viewModel.previousMonth() }) {
                            Icon(Icons.AutoMirrored.Filled.KeyboardArrowLeft, contentDescription = "Previous month")
                        }
                        Text(
                            text = state.month.format(monthFormatter),
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.weight(1f),
                        )
                        IconButton(onClick = { viewModel.nextMonth() }) {
                            Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, contentDescription = "Next month")
                        }
                    }
                }

                item {
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        ClinicEventType.entries.forEach { type ->
                            val meta = ClinicCalendarEvents.meta[type] ?: return@forEach
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Box(
                                    modifier = Modifier
                                        .size(8.dp)
                                        .clip(CircleShape)
                                        .background(meta.color),
                                )
                                Spacer(Modifier.size(4.dp))
                                Text(meta.shortLabel, style = MaterialTheme.typography.labelSmall)
                            }
                        }
                    }
                }

                state.error?.let { err ->
                    item {
                        Text(err, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                    }
                }

                if (!state.loading && grouped.isEmpty()) {
                    item {
                        Text(
                            "No events this month. Tap Add event to schedule a follow-up, outreach day, or admin block.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(vertical = 24.dp),
                        )
                    }
                }

                grouped.forEach { (date, events) ->
                    item(key = "day-$date") {
                        Text(
                            text = dayFormatter.format(date),
                            style = MaterialTheme.typography.labelLarge,
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.padding(top = 8.dp, bottom = 4.dp),
                        )
                    }
                    items(events, key = { it.id }) { event ->
                        EventCard(event = event, onClick = { viewModel.openEvent(event) })
                    }
                }
            }
        }
    }

    if (state.showAddSheet || state.showEditSheet) {
        AddCalendarEventSheet(
            defaultDate = state.addDefaultDate ?: state.selectedEvent?.let {
                parseServerInstant(it.scheduledAt).atZone(zone).toLocalDate()
            } ?: LocalDate.now(),
            existing = if (state.showEditSheet) state.selectedEvent else null,
            onDismiss = { viewModel.dismissSheets() },
            onSave = { type, date, time, title, reason, patientId ->
                viewModel.saveEvent(
                    eventType = type,
                    date = date,
                    time = time,
                    title = title,
                    reason = reason,
                    patientId = patientId,
                    existingId = state.selectedEvent?.id,
                )
            },
            onDelete = if (state.showEditSheet) ({ viewModel.deleteSelected() }) else null,
            searchPatients = { query -> viewModel.searchPatients(query) },
        )
    } else if (state.selectedEvent != null) {
        EventDetailSheet(
            event = state.selectedEvent!!,
            onDismiss = { viewModel.dismissSheets() },
            onEdit = { viewModel.openEdit() },
            onDelete = { viewModel.deleteSelected() },
            onOpenPatient = state.selectedEvent?.patientId?.let { id ->
                { onOpenPatient(id); viewModel.dismissSheets() }
            },
        )
    }
}

@Composable
private fun EventCard(event: ClinicAppointment, onClick: () -> Unit) {
    val meta = ClinicCalendarEvents.meta[event.eventType]
    val zone = ZoneId.systemDefault()
    val time = parseServerInstant(event.scheduledAt).atZone(zone).toLocalTime()
    val timeLabel = DateTimeFormatter.ofPattern("HH:mm").format(time)

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        shape = RoundedCornerShape(12.dp),
    ) {
        Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.Top) {
            Box(
                modifier = Modifier
                    .size(4.dp, 40.dp)
                    .clip(RoundedCornerShape(2.dp))
                    .background(meta?.color ?: Cobalt),
            )
            Column(modifier = Modifier.padding(start = 10.dp)) {
                Text(
                    ClinicCalendarEvents.appointmentTitle(event),
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    "$timeLabel · ${meta?.shortLabel ?: event.eventType.wire}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                event.reason?.takeIf { it.isNotBlank() }?.let {
                    Text(it, style = MaterialTheme.typography.bodySmall)
                }
            }
        }
    }
}
