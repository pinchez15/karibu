package com.karibuhealth.app.ui.worklists

import androidx.compose.animation.AnimatedVisibility
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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.karibuhealth.app.domain.model.CareTaskItem
import com.karibuhealth.app.domain.model.MyDraftItem
import com.karibuhealth.app.domain.model.NeedsClinicianItem
import com.karibuhealth.app.domain.model.NeedsLabItem
import com.karibuhealth.app.domain.model.NeedsPaymentItem
import com.karibuhealth.app.domain.model.NeedsPharmacyItem
import com.karibuhealth.app.domain.model.NeedsVitalsItem
import com.karibuhealth.app.ui.components.KhMetaText
import com.karibuhealth.app.ui.theme.Amber
import com.karibuhealth.app.ui.theme.Cobalt
import com.karibuhealth.app.ui.theme.CobaltSoft
import com.karibuhealth.app.ui.theme.Green
import com.karibuhealth.app.ui.theme.Line
import com.karibuhealth.app.ui.theme.Slate

/**
 * Phase 5 worklists screen.
 *
 * One screen, seven collapsible sections — each section is a worklist RPC
 * from migration 041. Tap the header to expand; tap a row to drop into the
 * appropriate detail screen (visit details or patient detail). Pull to
 * refresh re-runs all seven RPCs in parallel.
 *
 * Role-specific home screens for the HC III rollout will reuse the same
 * RPCs but only render the relevant sections (e.g. dispenser home only
 * shows needs-pharmacy + care-tasks). This screen renders all seven so an
 * admin / clinician can see the whole clinic's pull lists at a glance.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WorklistsScreen(
    onNavigateBack: () -> Unit,
    onNavigateToVisit: (String) -> Unit,
    onNavigateToPatient: (String) -> Unit,
    viewModel: WorklistsViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()

    Scaffold(
        contentWindowInsets = WindowInsets(0, 0, 0, 0),
        topBar = {
            TopAppBar(
                windowInsets = WindowInsets(0, 0, 0, 0),
                title = {
                    Text(
                        text = "Worklists",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
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
    ) { innerPadding ->
        PullToRefreshBox(
            isRefreshing = uiState.isRefreshing,
            onRefresh = { viewModel.refresh() },
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding),
        ) {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(top = 12.dp, bottom = 96.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                if (uiState.isLoading) {
                    item { LoadingHint() }
                } else {
                    item {
                        // needs-vitals
                        WorklistSection(
                            title = "Needs vitals",
                            accent = Green,
                            count = uiState.needsVitals.size,
                            items = uiState.needsVitals,
                            rowKey = { it.visitId },
                            rowContent = { item ->
                                VitalsRowBody(item = item)
                            },
                            onRowClick = { onNavigateToVisit(it.visitId) },
                        )
                    }
                    item {
                        WorklistSection(
                            title = "Needs clinician",
                            accent = Cobalt,
                            count = uiState.needsClinician.size,
                            items = uiState.needsClinician,
                            rowKey = { it.visitId },
                            rowContent = { item ->
                                ClinicianRowBody(item = item)
                            },
                            onRowClick = { onNavigateToVisit(it.visitId) },
                        )
                    }
                    item {
                        WorklistSection(
                            title = "Needs lab",
                            accent = Slate,
                            count = uiState.needsLab.size,
                            items = uiState.needsLab,
                            rowKey = { it.visitId },
                            rowContent = { item ->
                                LabRowBody(item = item)
                            },
                            onRowClick = { onNavigateToVisit(it.visitId) },
                        )
                    }
                    item {
                        WorklistSection(
                            title = "Needs pharmacy",
                            accent = Slate,
                            count = uiState.needsPharmacy.size,
                            items = uiState.needsPharmacy,
                            rowKey = { it.visitId },
                            rowContent = { item ->
                                PharmacyRowBody(item = item)
                            },
                            onRowClick = { onNavigateToVisit(it.visitId) },
                        )
                    }
                    item {
                        WorklistSection(
                            title = "Needs payment",
                            accent = Amber,
                            count = uiState.needsPayment.size,
                            items = uiState.needsPayment,
                            rowKey = { it.visitId },
                            rowContent = { item ->
                                PaymentRowBody(item = item)
                            },
                            onRowClick = { onNavigateToVisit(it.visitId) },
                        )
                    }
                    item {
                        WorklistSection(
                            title = "My drafts",
                            accent = Cobalt,
                            count = uiState.myDrafts.size,
                            items = uiState.myDrafts,
                            rowKey = { it.noteId },
                            rowContent = { item ->
                                DraftRowBody(item = item)
                            },
                            onRowClick = { item ->
                                // Visit-tied drafts route to the visit; standalone
                                // drafts (no visit_id) open the patient timeline.
                                val visitId = item.visitId
                                if (visitId != null) {
                                    onNavigateToVisit(visitId)
                                } else {
                                    onNavigateToPatient(item.patientId)
                                }
                            },
                        )
                    }
                    item {
                        WorklistSection(
                            title = "Care tasks",
                            accent = Amber,
                            count = uiState.careTasks.size,
                            items = uiState.careTasks,
                            rowKey = { it.taskId },
                            rowContent = { item ->
                                CareTaskRowBody(item = item)
                            },
                            // Care tasks aren't bound to a single visit — open
                            // the patient timeline so the clinician sees the
                            // full context before acting.
                            onRowClick = { onNavigateToPatient(it.patientId) },
                        )
                    }
                }
            }
        }
    }
}

// -----------------------------------------------------------------------------
// Section frame (header + collapsible body)
// -----------------------------------------------------------------------------

private const val PREVIEW_ROW_LIMIT = 10

@Composable
private fun <T> WorklistSection(
    title: String,
    accent: Color,
    count: Int,
    items: List<T>,
    rowKey: (T) -> String,
    rowContent: @Composable (T) -> Unit,
    onRowClick: (T) -> Unit,
) {
    // Start collapsed; clinicians scan the counts first and only expand the
    // list they're acting on. Keep state per section, scoped to recomposition.
    var expanded by rememberSaveable(title) { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(14.dp))
                .background(MaterialTheme.colorScheme.surface)
                .border(1.dp, Line, RoundedCornerShape(14.dp))
                .clickable { expanded = !expanded }
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier = Modifier
                    .width(3.dp)
                    .height(28.dp)
                    .background(accent),
            )
            Spacer(Modifier.width(10.dp))
            Text(
                text = title,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.weight(1f),
            )
            CountBadge(count = count)
            Spacer(Modifier.width(8.dp))
            Icon(
                imageVector = if (expanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                contentDescription = if (expanded) "Collapse" else "Expand",
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        AnimatedVisibility(visible = expanded) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 8.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                if (items.isEmpty()) {
                    EmptyHint("No items")
                } else {
                    items.take(PREVIEW_ROW_LIMIT).forEach { item ->
                        SectionRow(onClick = { onRowClick(item) }) {
                            rowContent(item)
                        }
                    }
                    if (items.size > PREVIEW_ROW_LIMIT) {
                        Text(
                            text = "View all ${items.size}",
                            style = MaterialTheme.typography.bodySmall,
                            color = Cobalt,
                            modifier = Modifier.padding(vertical = 4.dp),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun SectionRow(
    onClick: () -> Unit,
    content: @Composable () -> Unit,
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(MaterialTheme.colorScheme.surface)
            .border(1.dp, Line, RoundedCornerShape(12.dp))
            .clickable(onClick = onClick)
            .padding(12.dp),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            content()
        }
    }
}

@Composable
private fun CountBadge(count: Int) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(10.dp))
            .background(CobaltSoft)
            .padding(horizontal = 10.dp, vertical = 4.dp),
    ) {
        Text(
            text = count.toString(),
            style = MaterialTheme.typography.labelMedium,
            color = Cobalt,
            fontWeight = FontWeight.SemiBold,
        )
    }
}

@Composable
private fun LoadingHint() {
    Box(modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp)) {
        Text(
            text = "Loading worklists...",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun EmptyHint(text: String) {
    Box(modifier = Modifier.padding(horizontal = 4.dp, vertical = 4.dp)) {
        Text(
            text = text,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

// -----------------------------------------------------------------------------
// Per-section row bodies
// -----------------------------------------------------------------------------
// One per worklist row type. Keeping these small and explicit beats trying to
// shoehorn seven different shapes into a single generic row.

@Composable
private fun VitalsRowBody(item: NeedsVitalsItem) {
    PrimaryRow(name = item.patientName, ageSex = ageSexLabel(item.derivedAge, item.sex))
    item.chiefComplaint?.takeIf { it.isNotBlank() }?.let { SecondaryRow(it) }
    item.queueStatus?.let { KhMetaText(text = it.uppercase().replace('_', ' ')) }
}

@Composable
private fun ClinicianRowBody(item: NeedsClinicianItem) {
    PrimaryRow(name = item.patientName, ageSex = ageSexLabel(item.derivedAge, item.sex))
    item.chiefComplaint?.takeIf { it.isNotBlank() }?.let { SecondaryRow(it) }
    val meta = listOfNotNull(
        item.priority?.takeIf { it.isNotBlank() }?.uppercase(),
        item.queueStatus?.uppercase()?.replace('_', ' '),
        item.waitMinutes?.let { "${it}m wait" },
    ).joinToString(" · ")
    if (meta.isNotBlank()) KhMetaText(text = meta)
}

@Composable
private fun LabRowBody(item: NeedsLabItem) {
    PrimaryRow(name = item.patientName, ageSex = ageSexLabel(item.derivedAge, item.sex))
    item.chiefComplaint?.takeIf { it.isNotBlank() }?.let { SecondaryRow(it) }
    val meta = listOfNotNull(
        item.labStatus?.uppercase()?.replace('_', ' '),
        item.visitDate,
    ).joinToString(" · ")
    if (meta.isNotBlank()) KhMetaText(text = meta)
}

@Composable
private fun PharmacyRowBody(item: NeedsPharmacyItem) {
    PrimaryRow(name = item.patientName, ageSex = ageSexLabel(item.derivedAge, item.sex))
    item.medications?.takeIf { it.isNotBlank() }?.let { SecondaryRow(it) }
    val meta = listOfNotNull(
        item.dispensingStatus?.uppercase()?.replace('_', ' '),
        item.visitDate,
    ).joinToString(" · ")
    if (meta.isNotBlank()) KhMetaText(text = meta)
}

@Composable
private fun PaymentRowBody(item: NeedsPaymentItem) {
    PrimaryRow(name = item.patientName, ageSex = ageSexLabel(item.derivedAge, item.sex))
    item.diagnosis?.takeIf { it.isNotBlank() }?.let { SecondaryRow("Dx: $it") }
    item.visitDate?.let { KhMetaText(text = it) }
}

@Composable
private fun DraftRowBody(item: MyDraftItem) {
    PrimaryRow(name = item.patientName, ageSex = null)
    item.transcriptPreview?.takeIf { it.isNotBlank() }?.let { SecondaryRow(it) }
    val meta = listOfNotNull(
        item.source?.takeIf { it.isNotBlank() }?.replace('_', ' ')?.replaceFirstChar { it.uppercase() },
        item.updatedAt?.take(10),
    ).joinToString(" · ")
    if (meta.isNotBlank()) KhMetaText(text = meta)
}

@Composable
private fun CareTaskRowBody(item: CareTaskItem) {
    val typeLabel = item.taskType.replace('_', ' ').replaceFirstChar { it.uppercase() }
    PrimaryRow(name = item.patientName, ageSex = null)
    SecondaryRow(item.title.ifBlank { typeLabel })
    val meta = listOfNotNull(
        typeLabel,
        item.assigneeRole?.replace('_', ' ')?.replaceFirstChar { it.uppercase() },
        item.dueAt?.take(10)?.let { "Due $it" },
    ).joinToString(" · ")
    if (meta.isNotBlank()) KhMetaText(text = meta)
}

@Composable
private fun PrimaryRow(name: String, ageSex: String?) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = name,
            style = MaterialTheme.typography.bodyLarge,
            fontWeight = FontWeight.SemiBold,
            color = MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.weight(1f),
        )
        if (!ageSex.isNullOrBlank()) {
            KhMetaText(text = ageSex)
        }
    }
}

@Composable
private fun SecondaryRow(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurface,
        maxLines = 2,
    )
}

private fun ageSexLabel(age: Int?, sex: String?): String? {
    val parts = buildList {
        age?.let { add("${it}y") }
        sex?.firstOrNull()?.uppercaseChar()?.toString()?.let { add(it) }
    }
    return parts.takeIf { it.isNotEmpty() }?.joinToString(" ")
}
