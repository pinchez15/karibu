package com.karibuhealth.app.ui.dictation

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material3.AssistChip
import androidx.compose.material3.AssistChipDefaults
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.karibuhealth.app.domain.catalog.HcDrugCatalog

/**
 * Discrete prescription builder. Replaces free-text dispensing strings with a
 * picker that emits a canonical Sig — drug, strength, qty, route, frequency,
 * duration — so the dispenser never has to decode "twice a day" vs "BID" vs
 * "bd". Built on the HC III formulary in [HcDrugCatalog].
 *
 * @param onConfirm called with the formatted prescription line to append to
 *                  the medications free-text field.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PharmacyPickerSheet(
    onDismiss: () -> Unit,
    onConfirm: (String) -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    var drugQuery by remember { mutableStateOf("") }
    var selectedDrug by remember { mutableStateOf<HcDrugCatalog.Drug?>(null) }
    var strength by remember { mutableStateOf<String?>(null) }
    var quantityText by remember { mutableStateOf("") }
    var frequency by remember { mutableStateOf<HcDrugCatalog.Frequency?>(null) }
    var route by remember { mutableStateOf<HcDrugCatalog.Route?>(null) }
    var durationDays by remember { mutableStateOf<Int?>(null) }
    var customDurationText by remember { mutableStateOf("") }
    var notes by remember { mutableStateOf("") }

    LaunchedEffect(selectedDrug) {
        selectedDrug?.let { d ->
            strength = d.strengths.firstOrNull()
            frequency = d.defaultFrequency
            route = d.defaultRoute
            quantityText = ""
            durationDays = null
            customDurationText = ""
            notes = ""
        }
    }

    val filteredDrugs by remember(drugQuery) {
        derivedStateOf {
            if (drugQuery.isBlank()) HcDrugCatalog.drugs
            else HcDrugCatalog.drugs.filter { drug ->
                drug.name.contains(drugQuery, ignoreCase = true) ||
                    drug.code.contains(drugQuery, ignoreCase = true) ||
                    drug.aliases.any { it.contains(drugQuery, ignoreCase = true) }
            }
        }
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 8.dp)
                .heightIn(min = 200.dp, max = 700.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = if (selectedDrug == null) "Pick a medication" else "Prescribe ${selectedDrug?.name}",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.weight(1f),
                )
                if (selectedDrug != null) {
                    TextButton(onClick = { selectedDrug = null }) {
                        Text("Change")
                    }
                }
            }

            if (selectedDrug == null) {
                OutlinedTextField(
                    value = drugQuery,
                    onValueChange = { drugQuery = it },
                    placeholder = { Text("Search formulary…") },
                    singleLine = true,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 8.dp),
                )
                Spacer(Modifier.height(8.dp))
                LazyColumn(
                    modifier = Modifier.weight(1f, fill = false),
                ) {
                    items(filteredDrugs, key = { it.code }) { drug ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { selectedDrug = drug }
                                .padding(vertical = 8.dp, horizontal = 4.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = drug.name,
                                    style = MaterialTheme.typography.bodyMedium,
                                    fontWeight = FontWeight.Medium,
                                    color = MaterialTheme.colorScheme.onSurface,
                                )
                                Text(
                                    text = drug.category,
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            if (drug.strengths.isNotEmpty()) {
                                Text(
                                    text = drug.strengths.first(),
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                    }
                }
            } else {
                val drug = selectedDrug!!
                drug.warning?.let { warn ->
                    Text(
                        text = "⚠ $warn",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.tertiary,
                        modifier = Modifier.padding(top = 4.dp, bottom = 8.dp),
                    )
                }

                LazyColumn(
                    modifier = Modifier.weight(1f, fill = false),
                    verticalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    if (drug.strengths.isNotEmpty()) {
                        item {
                            DropdownPickerRow(
                                label = "Strength",
                                value = strength ?: "—",
                                options = drug.strengths,
                                onSelect = { strength = it },
                            )
                        }
                    }
                    item {
                        OutlinedTextField(
                            value = quantityText,
                            onValueChange = { quantityText = it },
                            label = { Text("Quantity (e.g. 1 tab, 5 mL)") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                    item {
                        DropdownPickerRow(
                            label = "Route",
                            value = route?.code ?: "—",
                            options = HcDrugCatalog.Route.entries.map { it.label },
                            onSelect = { picked ->
                                route = HcDrugCatalog.Route.entries.firstOrNull { it.label == picked }
                            },
                        )
                    }
                    item {
                        DropdownPickerRow(
                            label = "Frequency",
                            value = frequency?.code ?: "—",
                            options = HcDrugCatalog.Frequency.entries.map { it.label },
                            onSelect = { picked ->
                                frequency = HcDrugCatalog.Frequency.entries.firstOrNull { it.label == picked }
                            },
                        )
                    }
                    item {
                        DropdownPickerRow(
                            label = "Duration",
                            value = when {
                                durationDays != null -> "${durationDays}d"
                                customDurationText.isNotBlank() -> customDurationText
                                else -> "—"
                            },
                            options = HcDrugCatalog.durations.map { it.label } + "Custom…",
                            onSelect = { picked ->
                                val matched = HcDrugCatalog.durations.firstOrNull { it.label == picked }
                                if (matched != null) {
                                    durationDays = matched.days
                                    customDurationText = ""
                                } else {
                                    durationDays = null
                                }
                            },
                        )
                        if (durationDays == null && customDurationText.isEmpty()) {
                            // Custom path: only show when user picked "Custom…"
                            // — gated below by emptying durationDays.
                        }
                    }
                    if (durationDays == null) {
                        item {
                            OutlinedTextField(
                                value = customDurationText,
                                onValueChange = { customDurationText = it },
                                label = { Text("Custom duration (optional)") },
                                placeholder = { Text("e.g. until follow-up, until empty") },
                                singleLine = true,
                                modifier = Modifier.fillMaxWidth(),
                            )
                        }
                    }
                    item {
                        OutlinedTextField(
                            value = notes,
                            onValueChange = { notes = it },
                            label = { Text("Notes (optional)") },
                            placeholder = { Text("e.g. with food, hold if BP <100") },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Text),
                            singleLine = false,
                            minLines = 1,
                            maxLines = 3,
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                }

                Spacer(Modifier.height(10.dp))
                Button(
                    onClick = {
                        val sig = HcDrugCatalog.formatSig(
                            drug = drug,
                            strength = strength,
                            quantityText = quantityText.trim().ifBlank { null },
                            frequency = frequency,
                            route = route,
                            durationDays = durationDays,
                            notes = notes.trim().ifBlank { customDurationText.trim().ifBlank { null } },
                        )
                        onConfirm(sig)
                    },
                    enabled = strength != null || drug.strengths.isEmpty(),
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                ) {
                    Text("Add to prescription")
                }
            }
            Spacer(Modifier.height(12.dp))
        }
    }
}

@Composable
private fun DropdownPickerRow(
    label: String,
    value: String,
    options: List<String>,
    onSelect: (String) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    Column {
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(bottom = 4.dp),
        )
        Box(modifier = Modifier.fillMaxWidth()) {
            OutlinedButton(
                onClick = { expanded = true },
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(10.dp),
            ) {
                Text(value, modifier = Modifier.weight(1f), textAlign = androidx.compose.ui.text.style.TextAlign.Start)
                Icon(Icons.Default.KeyboardArrowDown, contentDescription = null)
            }
            DropdownMenu(
                expanded = expanded,
                onDismissRequest = { expanded = false },
                modifier = Modifier.heightIn(max = 320.dp),
            ) {
                options.forEach { opt ->
                    DropdownMenuItem(
                        text = { Text(opt) },
                        onClick = {
                            onSelect(opt)
                            expanded = false
                        },
                    )
                }
            }
        }
    }
}

/** Compact chip used by the dictation header — open the prescription builder. */
@Composable
fun AddRxChip(onClick: () -> Unit, modifier: Modifier = Modifier) {
    AssistChip(
        onClick = onClick,
        label = { Text("+ Add Rx") },
        colors = AssistChipDefaults.assistChipColors(
            containerColor = MaterialTheme.colorScheme.primaryContainer,
            labelColor = MaterialTheme.colorScheme.onPrimaryContainer,
        ),
        modifier = modifier,
    )
}
