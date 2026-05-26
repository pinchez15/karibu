package com.karibuhealth.app.ui.dictation

import androidx.compose.foundation.border
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.outlined.RadioButtonUnchecked
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
import androidx.compose.material3.Surface
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
import com.karibuhealth.app.ui.theme.Amber
import com.karibuhealth.app.ui.theme.Line

private enum class RxPickerStep { Category, Drug, Sig, Confirm }

/**
 * Category-first prescription builder with a confirm step to reduce wrong-drug taps.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PharmacyPickerSheet(
    onDismiss: () -> Unit,
    onConfirm: (String) -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var step by remember { mutableStateOf(RxPickerStep.Category) }
    var selectedCategory by remember { mutableStateOf<String?>(null) }
    var categoryQuery by remember { mutableStateOf("") }
    var drugQuery by remember { mutableStateOf("") }
    var selectedDrug by remember { mutableStateOf<HcDrugCatalog.Drug?>(null) }
    var strength by remember { mutableStateOf<String?>(null) }
    var quantityText by remember { mutableStateOf("") }
    var frequency by remember { mutableStateOf<HcDrugCatalog.Frequency?>(null) }
    var route by remember { mutableStateOf<HcDrugCatalog.Route?>(null) }
    var durationDays by remember { mutableStateOf<Int?>(null) }
    var customDurationText by remember { mutableStateOf("") }
    var notes by remember { mutableStateOf("") }
    var pendingSig by remember { mutableStateOf("") }

    val categories = remember { HcDrugCatalog.drugsByCategory() }
    val filteredCategories by remember(categoryQuery, categories) {
        derivedStateOf {
            if (categoryQuery.isBlank()) categories
            else categories.filter { (title, drugs) ->
                title.contains(categoryQuery, ignoreCase = true) ||
                    drugs.any { it.name.contains(categoryQuery, ignoreCase = true) }
            }
        }
    }
    val drugsInCategory by remember(selectedCategory, drugQuery) {
        derivedStateOf {
            val base = categories.firstOrNull { it.first == selectedCategory }?.second.orEmpty()
            if (drugQuery.isBlank()) base
            else base.filter { drug ->
                drug.name.contains(drugQuery, ignoreCase = true) ||
                    drug.code.contains(drugQuery, ignoreCase = true) ||
                    drug.aliases.any { it.contains(drugQuery, ignoreCase = true) }
            }
        }
    }

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

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        modifier = Modifier.heightIn(min = 240.dp, max = 720.dp),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 8.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = when (step) {
                        RxPickerStep.Category -> "Pick category"
                        RxPickerStep.Drug -> selectedCategory ?: "Pick medication"
                        RxPickerStep.Sig -> "Prescribe ${selectedDrug?.name ?: ""}"
                        RxPickerStep.Confirm -> "Confirm prescription"
                    },
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.weight(1f),
                )
                if (step != RxPickerStep.Category) {
                    TextButton(onClick = {
                        when (step) {
                            RxPickerStep.Drug -> {
                                step = RxPickerStep.Category
                                selectedDrug = null
                                drugQuery = ""
                            }
                            RxPickerStep.Sig -> step = RxPickerStep.Drug
                            RxPickerStep.Confirm -> step = RxPickerStep.Sig
                            else -> {}
                        }
                    }) {
                        Text("Back")
                    }
                }
            }

            when (step) {
                RxPickerStep.Category -> {
                    OutlinedTextField(
                        value = categoryQuery,
                        onValueChange = { categoryQuery = it },
                        placeholder = { Text("Search categories…") },
                        leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                        singleLine = true,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 8.dp),
                    )
                    Spacer(Modifier.height(8.dp))
                    LazyColumn(
                        modifier = Modifier.heightIn(max = 480.dp),
                    ) {
                        items(filteredCategories, key = { it.first }) { (title, drugs) ->
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable {
                                        selectedCategory = title
                                        step = RxPickerStep.Drug
                                        drugQuery = ""
                                    }
                                    .padding(vertical = 12.dp, horizontal = 4.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = title,
                                        style = MaterialTheme.typography.bodyMedium,
                                        fontWeight = FontWeight.SemiBold,
                                    )
                                    Text(
                                        text = "${drugs.size} medications",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                                Icon(
                                    Icons.Default.KeyboardArrowDown,
                                    contentDescription = null,
                                    modifier = Modifier.size(18.dp),
                                )
                            }
                        }
                    }
                }

                RxPickerStep.Drug -> {
                    OutlinedTextField(
                        value = drugQuery,
                        onValueChange = { drugQuery = it },
                        placeholder = { Text("Search in $selectedCategory…") },
                        leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                        singleLine = true,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 8.dp),
                    )
                    Spacer(Modifier.height(8.dp))
                    LazyColumn(
                        modifier = Modifier.heightIn(max = 480.dp),
                    ) {
                        items(drugsInCategory, key = { it.code }) { drug ->
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clickable {
                                        selectedDrug = drug
                                        step = RxPickerStep.Sig
                                    }
                                    .padding(vertical = 10.dp, horizontal = 4.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Icon(
                                    Icons.Outlined.RadioButtonUnchecked,
                                    contentDescription = null,
                                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                    modifier = Modifier
                                        .size(20.dp)
                                        .padding(end = 8.dp),
                                )
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(
                                        text = drug.name,
                                        style = MaterialTheme.typography.bodyMedium,
                                        fontWeight = FontWeight.Medium,
                                    )
                                    Text(
                                        text = drug.strengths.joinToString(" · ").ifBlank { drug.category },
                                        style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                            }
                        }
                    }
                }

                RxPickerStep.Sig -> {
                    val drug = selectedDrug ?: return@Column
                    drug.warning?.let { warn ->
                        Text(
                            text = "⚠ $warn",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.tertiary,
                            modifier = Modifier.padding(top = 4.dp, bottom = 8.dp),
                        )
                    }
                    LazyColumn(
                        modifier = Modifier.heightIn(max = 420.dp),
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
                        }
                        if (durationDays == null) {
                            item {
                                OutlinedTextField(
                                    value = customDurationText,
                                    onValueChange = { customDurationText = it },
                                    label = { Text("Custom duration (optional)") },
                                    placeholder = { Text("e.g. until follow-up") },
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
                            pendingSig = HcDrugCatalog.formatSig(
                                drug = drug,
                                strength = strength,
                                quantityText = quantityText.trim().ifBlank { null },
                                frequency = frequency,
                                route = route,
                                durationDays = durationDays,
                                notes = notes.trim().ifBlank { customDurationText.trim().ifBlank { null } },
                            )
                            step = RxPickerStep.Confirm
                        },
                        enabled = strength != null || drug.strengths.isEmpty(),
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(12.dp),
                    ) {
                        Text("Review prescription")
                    }
                }

                RxPickerStep.Confirm -> {
                    val drug = selectedDrug ?: return@Column
                    val confusables = HcDrugCatalog.confusableDrugNames(drug)
                    Column(
                        modifier = Modifier.heightIn(max = 420.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Surface(
                            shape = RoundedCornerShape(12.dp),
                            color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.35f),
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Column(modifier = Modifier.padding(14.dp)) {
                                Text(
                                    text = "You are prescribing",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                                Spacer(Modifier.height(4.dp))
                                Text(
                                    text = pendingSig,
                                    style = MaterialTheme.typography.titleMedium,
                                    fontWeight = FontWeight.SemiBold,
                                )
                                Text(
                                    text = drug.category,
                                    style = MaterialTheme.typography.labelMedium,
                                    color = MaterialTheme.colorScheme.primary,
                                    modifier = Modifier.padding(top = 6.dp),
                                )
                            }
                        }
                        if (confusables.isNotEmpty()) {
                            Surface(
                                shape = RoundedCornerShape(12.dp),
                                color = Amber.copy(alpha = 0.12f),
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .border(1.dp, Amber.copy(alpha = 0.35f), RoundedCornerShape(12.dp)),
                            ) {
                                Column(modifier = Modifier.padding(12.dp)) {
                                    Text(
                                        text = "Not these look-alikes:",
                                        style = MaterialTheme.typography.labelMedium,
                                        fontWeight = FontWeight.SemiBold,
                                        color = Amber,
                                    )
                                    confusables.forEach { name ->
                                        Text(
                                            text = "• $name",
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        )
                                    }
                                }
                            }
                        }
                    }
                    Spacer(Modifier.height(10.dp))
                    Button(
                        onClick = { onConfirm(pendingSig) },
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(12.dp),
                    ) {
                        Text("Confirm prescription")
                    }
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
