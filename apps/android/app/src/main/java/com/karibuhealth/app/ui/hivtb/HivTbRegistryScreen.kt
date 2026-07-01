package com.karibuhealth.app.ui.hivtb

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.karibuhealth.app.data.local.db.entity.HivCareEnrollmentEntity
import com.karibuhealth.app.data.local.db.entity.HtsEventEntity
import com.karibuhealth.app.data.local.db.entity.TbEpisodeEntity
import com.karibuhealth.app.ui.adaptive.KaribuLayout

private val CARE_STATUS_LABEL = mapOf("pre_art" to "Pre-ART", "on_art" to "On ART")
private val TB_CASE_LABEL = mapOf(
    "new" to "New",
    "relapse" to "Relapse",
    "retreatment_default" to "After default",
    "failure" to "Failure",
    "other" to "Other",
)
private val TB_CLASS_LABEL = mapOf(
    "pulmonary_smear_positive" to "Pulm +",
    "pulmonary_smear_negative" to "Pulm −",
    "extrapulmonary" to "EPT",
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HivTbRegistryScreen(
    onNavigateBack: () -> Unit,
    onRecordHts: () -> Unit,
    onRecordHivCare: () -> Unit,
    onRecordTb: () -> Unit,
    onOpenHivCare: (String) -> Unit,
    onOpenTbEpisode: (String) -> Unit,
    embedded: Boolean = false,
    modifier: Modifier = Modifier,
    viewModel: HivTbRegistryViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsState()
    var tabIndex by rememberSaveable { mutableIntStateOf(0) }
    val tabs = listOf("HTS (${state.hts.size})", "HIV (${state.hiv.size})", "TB (${state.tb.size})")

    val listContent: @Composable (Modifier) -> Unit = { contentModifier ->
        Column(contentModifier.fillMaxSize()) {
            TabRow(selectedTabIndex = tabIndex) {
                tabs.forEachIndexed { index, label ->
                    Tab(
                        selected = tabIndex == index,
                        onClick = { tabIndex = index },
                        text = { Text(label, maxLines = 1) },
                    )
                }
            }
            when (tabIndex) {
                0 -> HtsTab(
                    rows = state.hts,
                    onRecord = onRecordHts,
                    modifier = Modifier.weight(1f),
                    embedded = embedded,
                )
                1 -> HivTab(
                    rows = state.hiv,
                    onRecord = onRecordHivCare,
                    onOpen = onOpenHivCare,
                    modifier = Modifier.weight(1f),
                    embedded = embedded,
                )
                else -> TbTab(
                    rows = state.tb,
                    onRecord = onRecordTb,
                    onOpen = onOpenTbEpisode,
                    modifier = Modifier.weight(1f),
                    embedded = embedded,
                )
            }
        }
    }

    if (embedded) {
        Scaffold(modifier = modifier) { padding ->
            Column(Modifier.padding(padding)) {
                Text(
                    "HIV / TB registers",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
                )
                listContent(Modifier.fillMaxSize())
            }
        }
        return
    }

    Scaffold(
        modifier = modifier,
        topBar = {
            TopAppBar(
                title = { Text("HIV / TB registers") },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { padding ->
        listContent(Modifier.padding(padding))
    }
}

@Composable
private fun HtsTab(
    rows: List<HtsEventEntity>,
    onRecord: () -> Unit,
    embedded: Boolean,
    modifier: Modifier = Modifier,
) {
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(
            start = 16.dp,
            end = 16.dp,
            top = 12.dp,
            bottom = if (embedded) KaribuLayout.bottomBarScrollPadding().dp else 16.dp,
        ),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item {
            TextButton(onClick = onRecord, modifier = Modifier.fillMaxWidth()) {
                Text("+ Record HIV test / counseling")
            }
        }
        if (rows.isEmpty()) {
            item {
                Text(
                    "No HTS events yet.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(vertical = 24.dp),
                )
            }
        } else {
            items(rows, key = { it.id }) { row -> HtsRow(row) }
        }
    }
}

@Composable
private fun HivTab(
    rows: List<HivCareEnrollmentEntity>,
    onRecord: () -> Unit,
    onOpen: (String) -> Unit,
    embedded: Boolean,
    modifier: Modifier = Modifier,
) {
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(
            start = 16.dp,
            end = 16.dp,
            top = 12.dp,
            bottom = if (embedded) KaribuLayout.bottomBarScrollPadding().dp else 16.dp,
        ),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item {
            TextButton(onClick = onRecord, modifier = Modifier.fillMaxWidth()) {
                Text("+ Enroll in HIV care / update ART")
            }
        }
        if (rows.isEmpty()) {
            item {
                Text(
                    "No active HIV enrollments.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(vertical = 24.dp),
                )
            }
        } else {
            items(rows, key = { it.id }) { row -> HivRow(row, onOpen) }
        }
    }
}

@Composable
private fun TbTab(
    rows: List<TbEpisodeEntity>,
    onRecord: () -> Unit,
    onOpen: (String) -> Unit,
    embedded: Boolean,
    modifier: Modifier = Modifier,
) {
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = PaddingValues(
            start = 16.dp,
            end = 16.dp,
            top = 12.dp,
            bottom = if (embedded) KaribuLayout.bottomBarScrollPadding().dp else 16.dp,
        ),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item {
            TextButton(onClick = onRecord, modifier = Modifier.fillMaxWidth()) {
                Text("+ Register TB episode")
            }
        }
        if (rows.isEmpty()) {
            item {
                Text(
                    "No active TB episodes.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(vertical = 24.dp),
                )
            }
        } else {
            items(rows, key = { it.id }) { row -> TbRow(row, onOpen) }
        }
    }
}

@Composable
private fun HtsRow(row: HtsEventEntity) {
    OutlinedCard(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(row.patientName ?: "Patient", fontWeight = FontWeight.SemiBold)
            val meta = buildString {
                append(row.eventDate.take(10))
                if (row.tested) {
                    append(" · ")
                    append(row.result ?: "pending")
                    if (row.resultReceived) append(" (result given)")
                }
            }
            Text(meta, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun HivRow(row: HivCareEnrollmentEntity, onOpen: (String) -> Unit) {
    OutlinedCard(Modifier.fillMaxWidth().clickable { onOpen(row.id) }) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(row.patientName ?: "Patient", fontWeight = FontWeight.SemiBold)
            val meta = listOfNotNull(
                CARE_STATUS_LABEL[row.careStatus] ?: row.careStatus,
                row.artRegimen,
                row.enrolledAt.take(10).let { "since $it" },
            ).joinToString(" · ")
            Text(meta, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

@Composable
private fun TbRow(row: TbEpisodeEntity, onOpen: (String) -> Unit) {
    OutlinedCard(Modifier.fillMaxWidth().clickable { onOpen(row.id) }) {
        Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(row.patientName ?: "Patient", fontWeight = FontWeight.SemiBold)
            val meta = listOfNotNull(
                TB_CASE_LABEL[row.caseType] ?: row.caseType,
                TB_CLASS_LABEL[row.diseaseClass] ?: row.diseaseClass,
                row.unitTbNumber?.let { "TB #$it" },
            ).joinToString(" · ")
            Text(meta, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
