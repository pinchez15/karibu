package com.karibuhealth.app.ui.stock

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Science
import androidx.compose.material.icons.outlined.Medication
import androidx.compose.material.icons.outlined.Warning
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.karibuhealth.app.data.remote.dto.LabStockItemDto
import com.karibuhealth.app.data.remote.dto.PharmacyStockItemDto
import com.karibuhealth.app.ui.adaptive.KaribuLayout
import com.karibuhealth.app.ui.components.KhMetaText
import com.karibuhealth.app.ui.theme.AmberSoft
import com.karibuhealth.app.ui.theme.Cobalt
import com.karibuhealth.app.ui.theme.RedSoft

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StockOverviewScreen(
    onNavigateBack: () -> Unit,
    modifier: Modifier = Modifier,
    viewModel: StockOverviewViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()
    val lowPharmacy = uiState.pharmacy.filter(::isLowPharmacy)
    val lowLab = uiState.lab.filter(::isLowLab)

    Scaffold(
        modifier = modifier,
        topBar = {
            TopAppBar(
                title = { Text("Clinic stock") },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { padding ->
        PullToRefreshBox(
            isRefreshing = uiState.isRefreshing,
            onRefresh = viewModel::refresh,
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
        ) {
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(horizontal = KaribuLayout.contentPaddingHorizontal()),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                item {
                    KhMetaText(text = "CLINICIAN · READ-ONLY")
                }
                if (lowPharmacy.isNotEmpty() || lowLab.isNotEmpty()) {
                    item {
                        LowStockBanner(pharmacy = lowPharmacy, lab = lowLab)
                    }
                }
                item {
                    StockSection(
                        title = "Pharmacy",
                        icon = {
                            Icon(
                                Icons.Outlined.Medication,
                                contentDescription = null,
                                tint = Cobalt,
                            )
                        },
                        count = uiState.pharmacy.size,
                    ) {
                        if (uiState.pharmacy.isEmpty()) {
                            EmptyStockHint()
                        } else {
                            uiState.pharmacy.forEach { row ->
                                PharmacyStockRow(row)
                            }
                        }
                    }
                }
                item {
                    StockSection(
                        title = "Lab",
                        icon = {
                            Icon(Icons.Filled.Science, contentDescription = null, tint = Cobalt)
                        },
                        count = uiState.lab.size,
                    ) {
                        if (uiState.lab.isEmpty()) {
                            EmptyStockHint()
                        } else {
                            uiState.lab.forEach { row ->
                                LabStockRow(row)
                            }
                        }
                    }
                }
                item { Spacer(Modifier.height(24.dp)) }
            }
        }
    }
}

@Composable
private fun LowStockBanner(
    pharmacy: List<PharmacyStockItemDto>,
    lab: List<LabStockItemDto>,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(AmberSoft)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Outlined.Warning, contentDescription = null, tint = Cobalt)
            Text(
                text = "Low / out of stock",
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.padding(start = 8.dp),
            )
        }
        if (pharmacy.isNotEmpty()) {
            Text("Pharmacy", style = MaterialTheme.typography.labelMedium)
            pharmacy.forEach { row ->
                StockQtyLine(
                    label = buildString {
                        append(row.drugName)
                        row.strength?.let { append(" · $it") }
                    },
                    qty = row.quantityOnHand,
                    unit = row.unit,
                    out = row.quantityOnHand <= 0.0,
                )
            }
        }
        if (lab.isNotEmpty()) {
            Text("Lab", style = MaterialTheme.typography.labelMedium)
            lab.forEach { row ->
                StockQtyLine(
                    label = row.testName,
                    qty = row.quantityOnHand,
                    unit = row.unit,
                    out = row.quantityOnHand <= 0.0,
                )
            }
        }
    }
}

@Composable
private fun StockSection(
    title: String,
    icon: @Composable () -> Unit,
    count: Int,
    content: @Composable () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(MaterialTheme.colorScheme.surface)
            .padding(vertical = 4.dp),
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            icon()
            Text(
                text = title,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.padding(start = 8.dp),
            )
            Text(
                text = "$count items",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(start = 8.dp),
            )
        }
        content()
    }
}

@Composable
private fun PharmacyStockRow(row: PharmacyStockItemDto) {
    val low = isLowPharmacy(row)
    val out = row.quantityOnHand <= 0.0
    StockRowSurface(low = low, out = out) {
        Column(modifier = Modifier.weight(1f)) {
            Text(row.drugName, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
            val secondary = listOfNotNull(row.strength, row.formulation).joinToString(" · ")
            if (secondary.isNotBlank()) {
                Text(secondary, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
        StockQtyText(qty = row.quantityOnHand, unit = row.unit, out = out, low = low)
    }
}

@Composable
private fun LabStockRow(row: LabStockItemDto) {
    val low = isLowLab(row)
    val out = row.quantityOnHand <= 0.0
    StockRowSurface(low = low, out = out) {
        Column(modifier = Modifier.weight(1f)) {
            Text(row.testName, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium)
            Text(
                row.category.replace('_', ' '),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        StockQtyText(qty = row.quantityOnHand, unit = row.unit, out = out, low = low)
    }
}

@Composable
private fun StockRowSurface(
    low: Boolean,
    out: Boolean,
    content: @Composable RowScope.() -> Unit,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(
                when {
                    out -> RedSoft
                    low -> AmberSoft.copy(alpha = 0.35f)
                    else -> MaterialTheme.colorScheme.surface
                },
            )
            .padding(horizontal = 16.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        content = content,
    )
}

@Composable
private fun StockQtyText(qty: Double, unit: String, out: Boolean, low: Boolean) {
    Text(
        text = if (out) "OUT" else "${qty.toInt()} $unit",
        style = MaterialTheme.typography.bodyMedium,
        fontWeight = FontWeight.SemiBold,
        color = when {
            out -> MaterialTheme.colorScheme.error
            low -> Cobalt
            else -> MaterialTheme.colorScheme.onSurface
        },
    )
}

@Composable
private fun StockQtyLine(label: String, qty: Double, unit: String, out: Boolean) {
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, style = MaterialTheme.typography.bodySmall, modifier = Modifier.weight(1f))
        Text(
            if (out) "OUT" else "${qty.toInt()} $unit",
            style = MaterialTheme.typography.bodySmall,
            fontWeight = FontWeight.SemiBold,
            color = if (out) MaterialTheme.colorScheme.error else Cobalt,
        )
    }
}

@Composable
private fun EmptyStockHint() {
    Text(
        text = "No stock recorded yet.",
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
    )
}

private fun isLowPharmacy(row: PharmacyStockItemDto): Boolean =
    row.lowStockThreshold != null && row.quantityOnHand <= row.lowStockThreshold

private fun isLowLab(row: LabStockItemDto): Boolean =
    row.lowStockThreshold != null && row.quantityOnHand <= row.lowStockThreshold
