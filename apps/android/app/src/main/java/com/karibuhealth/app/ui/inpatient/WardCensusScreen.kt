package com.karibuhealth.app.ui.inpatient

import com.karibuhealth.app.util.parseServerInstant

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.karibuhealth.app.data.local.db.dao.AdmissionCensusRow
import com.karibuhealth.app.ui.adaptive.KaribuLayout
import kotlinx.coroutines.launch
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.Period
import java.time.format.DateTimeParseException

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WardCensusScreen(
    onNavigateBack: () -> Unit,
    onAdmit: () -> Unit,
    onOpenAdmission: (String) -> Unit,
    onHandover: () -> Unit = {},
    embedded: Boolean = false,
    modifier: Modifier = Modifier,
    viewModel: WardCensusViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()
    val rows = state.rows.filter { state.ward == null || it.admission.ward == state.ward }
    var isRefreshing by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    val censusContent: @Composable (Modifier) -> Unit = { contentModifier ->
        Column(contentModifier.fillMaxSize()) {
            if (embedded) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = KaribuLayout.contentPaddingHorizontal(), vertical = 8.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = "Ward census",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                    androidx.compose.material3.TextButton(onClick = onHandover) {
                        Text("Handover")
                    }
                }
            }
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                FilterChip(selected = state.ward == null, onClick = { viewModel.setWardFilter(null) }, label = { Text("All") })
                FilterChip(selected = state.ward == "general", onClick = { viewModel.setWardFilter("general") }, label = { Text("General") })
                FilterChip(selected = state.ward == "maternity", onClick = { viewModel.setWardFilter("maternity") }, label = { Text("Maternity") })
            }

            if (!state.loading && rows.isEmpty()) {
                Column(Modifier.fillMaxSize().padding(32.dp), verticalArrangement = Arrangement.Center) {
                    Text(
                        "No one is admitted right now.",
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(
                        "Tap Admit to add a patient to the ward.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(
                        start = 16.dp,
                        end = 16.dp,
                        top = 4.dp,
                        bottom = if (embedded) KaribuLayout.bottomBarScrollPadding().dp else 16.dp,
                    ),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    items(rows, key = { it.admission.id }) { row ->
                        AdmissionCard(row = row, onClick = { onOpenAdmission(row.admission.id) })
                    }
                }
            }
        }
    }

    if (embedded) {
        Scaffold(
            modifier = modifier,
            floatingActionButton = {
                ExtendedFloatingActionButton(
                    onClick = onAdmit,
                    icon = { Icon(Icons.Default.Add, contentDescription = null) },
                    text = { Text("Admit") },
                )
            },
        ) { padding ->
            PullToRefreshBox(
                isRefreshing = isRefreshing,
                onRefresh = {
                    scope.launch {
                        isRefreshing = true
                        viewModel.refresh()
                        isRefreshing = false
                    }
                },
                modifier = Modifier.padding(padding),
            ) {
                censusContent(Modifier.fillMaxSize())
            }
        }
        return
    }

    Scaffold(
        modifier = modifier,
        topBar = {
            TopAppBar(
                title = { Text("Ward") },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    androidx.compose.material3.TextButton(onClick = onHandover) { Text("Handover") }
                },
            )
        },
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = onAdmit,
                icon = { Icon(Icons.Default.Add, contentDescription = null) },
                text = { Text("Admit") },
            )
        },
    ) { padding ->
        PullToRefreshBox(
            isRefreshing = isRefreshing,
            onRefresh = {
                scope.launch {
                    isRefreshing = true
                    viewModel.refresh()
                    isRefreshing = false
                }
            },
            modifier = Modifier.padding(padding),
        ) {
            censusContent(Modifier.fillMaxSize())
        }
    }
}

@Composable
private fun AdmissionCard(row: AdmissionCensusRow, onClick: () -> Unit) {
    val a = row.admission
    OutlinedCard(modifier = Modifier.fillMaxWidth().clickable(onClick = onClick)) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = a.patientName ?: "Patient",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                )
                Text(
                    text = wardLabel(a.ward) + (a.bedLabel?.let { " · $it" } ?: ""),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            val ageSex = listOfNotNull(ageString(a.dateOfBirth), a.sex?.take(1)?.uppercase()).joinToString(" · ")
            if (ageSex.isNotBlank()) {
                Text(ageSex, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            a.chiefComplaint?.takeIf { it.isNotBlank() }?.let {
                Text(it, style = MaterialTheme.typography.bodyMedium)
            }
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(
                    text = dayOfStay(a.admittedAt),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    text = lastObsLabel(row.lastObservedAt),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

private fun wardLabel(ward: String): String = when (ward) {
    "maternity" -> "Maternity"
    else -> "General"
}

private fun ageString(dob: String?): String? {
    if (dob.isNullOrBlank()) return null
    return try {
        val d = LocalDate.parse(dob.take(10))
        val p = Period.between(d, LocalDate.now())
        when {
            p.years >= 1 -> "${p.years}y"
            p.months >= 1 -> "${p.months}m"
            else -> "${p.days}d"
        }
    } catch (_: DateTimeParseException) {
        null
    }
}

private fun dayOfStay(admittedAt: String): String = try {
    val days = Duration.between(parseServerInstant(admittedAt), Instant.now()).toDays()
    "Day ${days + 1}"
} catch (_: Exception) {
    ""
}

private fun lastObsLabel(lastObservedAt: String?): String {
    if (lastObservedAt.isNullOrBlank()) return "No obs yet"
    return try {
        val mins = Duration.between(parseServerInstant(lastObservedAt), Instant.now()).toMinutes()
        when {
            mins < 1 -> "Obs just now"
            mins < 60 -> "Obs ${mins}m ago"
            mins < 1440 -> "Obs ${mins / 60}h ago"
            else -> "Obs ${mins / 1440}d ago"
        }
    } catch (_: Exception) {
        ""
    }
}
