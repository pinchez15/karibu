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
import androidx.compose.runtime.collectAsState
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
import androidx.hilt.navigation.compose.hiltViewModel
import com.karibuhealth.app.data.remote.dto.PrescriptionLineRpc
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
    onConfirm: (PharmacyPickerResult) -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var step by remember { mutableStateOf(RxPickerStep.Category) }
    var selectedCategory by remember { mutableStateOf<String?>(null) }
    var categoryQuery by remember { mutableStateOf("") }
    var drugQuery by remember { mutableStateOf("") }
    var selectedDrug by remember { mutableStateOf<HcDrugCatalog.Drug?>(null) }
    var strength by remember { mutableStateOf<String?>(null) }
    // PHARM-4 structured entry: numeric dose + dose_unit; computed/overridable qty.
    var doseAmountText by remember { mutableStateOf("") }
    var doseUnit by remember { mutableStateOf(HcDrugCatalog.DoseUnit.TAB) }
    var orderMode by remember { mutableStateOf(HcDrugCatalog.OrderMode.SCHEDULED) }
    var quantityText by remember { mutableStateOf("") }
    var quantityOverridden by remember { mutableStateOf(false) }
    var frequency by remember { mutableStateOf<HcDrugCatalog.Frequency?>(null) }
    var route by remember { mutableStateOf<HcDrugCatalog.Route?>(null) }
    var durationDays by remember { mutableStateOf<Int?>(null) }
    var notes by remember { mutableStateOf("") }
    var pendingSig by remember { mutableStateOf("") }
    // Structured fields captured on confirm (parsed from the selected strength).
    var pendingLine by remember { mutableStateOf<PrescriptionLineRpc?>(null) }

    val catalogViewModel: CatalogViewModel = hiltViewModel()
    LaunchedEffect(Unit) { catalogViewModel.ensureLoaded() }
    val catalogState by catalogViewModel.state.collectAsState()

    val categories = remember(catalogState.formularyCategories) {
        val hcByCategory = HcDrugCatalog.drugsByCategory()
        fun drugFromRef(ref: FormularyDrugRef): HcDrugCatalog.Drug {
            if (ref.strengths.isNotEmpty() || ref.defaultFrequency != null) {
                return HcDrugCatalog.Drug(
                    code = ref.code ?: ref.name.uppercase().replace(" ", "_").take(32),
                    name = ref.name,
                    aliases = ref.aliases,
                    strengths = ref.strengths,
                    defaultFrequency = ref.defaultFrequency?.let { code ->
                        HcDrugCatalog.Frequency.entries.find { it.code.equals(code, ignoreCase = true) }
                    },
                    defaultRoute = ref.defaultRoute?.let { code ->
                        HcDrugCatalog.Route.entries.find { it.code.equals(code, ignoreCase = true) }
                    } ?: HcDrugCatalog.Route.PO,
                    category = ref.category,
                    warning = ref.warning,
                )
            }
            val allHcDrugs = hcByCategory.flatMap { it.second }
            val byCode = ref.code?.let { code ->
                allHcDrugs.find { it.code.equals(code, ignoreCase = true) }
            }
            if (byCode != null) return byCode
            return allHcDrugs.find { drug ->
                drug.name.equals(ref.name, ignoreCase = true) ||
                    drug.aliases.any { it.equals(ref.name, ignoreCase = true) }
            } ?: HcDrugCatalog.Drug(
                code = ref.code ?: ref.name.uppercase().replace(" ", "_").take(32),
                name = ref.name,
                category = ref.category,
            )
        }

        if (catalogState.formularyCategories.isNotEmpty()) {
            catalogState.formularyCategories.map { (title, drugs) ->
                title to drugs.map(::drugFromRef)
            }
        } else {
            hcByCategory
        }
    }
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
            durationDays = null
            notes = ""
            quantityText = ""
            quantityOverridden = false
            // PRN drugs default to a clinician-entered total; everything else computes.
            orderMode = if (d.defaultFrequency == HcDrugCatalog.Frequency.PRN) {
                HcDrugCatalog.OrderMode.FIXED_QUANTITY
            } else {
                HcDrugCatalog.OrderMode.SCHEDULED
            }
        }
    }

    // Parse the selected catalog strength into structured strength/form/dispense
    // hints and seed sensible dose defaults (spec R5). Re-runs when strength changes.
    val parsedStrength = remember(strength) { HcDrugCatalog.parseStrength(strength) }
    LaunchedEffect(strength) {
        doseUnit = parsedStrength.defaultDoseUnit ?: HcDrugCatalog.DoseUnit.TAB
        doseAmountText = when (parsedStrength.defaultDoseUnit) {
            HcDrugCatalog.DoseUnit.TAB, HcDrugCatalog.DoseUnit.CAP -> "1"
            null -> "1"
            else -> ""
        }
        quantityOverridden = false
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
                    val dispenseUnit = parsedStrength.dispenseUnit ?: defaultDispenseFor(doseUnit)
                    val doseAmount = doseAmountText.trim().toDoubleOrNull()
                    val isScheduled = orderMode == HcDrugCatalog.OrderMode.SCHEDULED
                    val isStat = frequency?.code.equals("STAT", ignoreCase = true)
                    val showDuration = isScheduled && !isStat &&
                        frequency != HcDrugCatalog.Frequency.PRN

                    // Deterministic computed quantity (spec R5). For scheduled orders we
                    // push the computed number into the editable Qty field until the
                    // clinician overrides it; for fixed_quantity (PRN) the clinician types
                    // the total directly. Either way the final number is human-confirmed.
                    val computed = if (doseAmount != null && doseAmount > 0.0) {
                        HcDrugCatalog.computePrescriptionQuantity(
                            HcDrugCatalog.QuantityComputeInput(
                                orderMode = orderMode,
                                frequencyCode = frequency?.code,
                                durationDays = durationDays,
                                doseAmount = doseAmount,
                                doseUnit = doseUnit,
                                strengthAmount = parsedStrength.strengthAmount,
                                dispenseUnit = dispenseUnit,
                                fixedQuantity = quantityText.trim().toDoubleOrNull(),
                                containerSize = parsedStrength.containerSize,
                            ),
                        )
                    } else {
                        null
                    }
                    val computedQtyStr = if (isScheduled) {
                        computed?.quantity?.let { formatQty(it) }
                    } else {
                        null
                    }
                    LaunchedEffect(computedQtyStr, isScheduled) {
                        if (isScheduled && !quantityOverridden && computedQtyStr != null) {
                            quantityText = computedQtyStr
                        }
                    }

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
                            DropdownPickerRow(
                                label = "Order type",
                                value = if (isScheduled) "Scheduled — auto quantity" else "PRN / fixed quantity",
                                options = listOf("Scheduled — auto quantity", "PRN / fixed quantity"),
                                onSelect = { picked ->
                                    orderMode = if (picked.startsWith("Scheduled")) {
                                        HcDrugCatalog.OrderMode.SCHEDULED
                                    } else {
                                        HcDrugCatalog.OrderMode.FIXED_QUANTITY
                                    }
                                    quantityOverridden = false
                                },
                            )
                        }
                        item {
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                OutlinedTextField(
                                    value = doseAmountText,
                                    onValueChange = {
                                        doseAmountText = it
                                        quantityOverridden = false
                                    },
                                    label = { Text("Dose amount") },
                                    singleLine = true,
                                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                                    modifier = Modifier.weight(1f),
                                )
                                Box(modifier = Modifier.weight(1f)) {
                                    DropdownPickerRow(
                                        label = "Dose unit",
                                        value = doseUnit.code,
                                        options = HcDrugCatalog.DoseUnit.entries.map { it.code },
                                        onSelect = { picked ->
                                            HcDrugCatalog.DoseUnit.fromCode(picked)?.let {
                                                doseUnit = it
                                                quantityOverridden = false
                                            }
                                        },
                                    )
                                }
                            }
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
                                    val f = HcDrugCatalog.Frequency.entries.firstOrNull { it.label == picked }
                                    frequency = f
                                    // Keep order mode consistent with the frequency choice:
                                    // PRN -> clinician-entered total; anything else -> computed.
                                    if (f == HcDrugCatalog.Frequency.PRN) {
                                        orderMode = HcDrugCatalog.OrderMode.FIXED_QUANTITY
                                    } else if (orderMode == HcDrugCatalog.OrderMode.FIXED_QUANTITY) {
                                        orderMode = HcDrugCatalog.OrderMode.SCHEDULED
                                    }
                                    quantityOverridden = false
                                },
                            )
                        }
                        if (showDuration) {
                            item {
                                DropdownPickerRow(
                                    label = "Duration",
                                    value = durationDays?.let { "${it} days" } ?: "—",
                                    options = HcDrugCatalog.durations.map { it.label },
                                    onSelect = { picked ->
                                        durationDays = HcDrugCatalog.durations
                                            .firstOrNull { it.label == picked }?.days
                                        quantityOverridden = false
                                    },
                                )
                            }
                        }
                        item {
                            OutlinedTextField(
                                value = quantityText,
                                onValueChange = {
                                    quantityText = it
                                    quantityOverridden = true
                                },
                                label = {
                                    Text(
                                        if (isScheduled) "Quantity (${dispenseUnit.code}) — computed"
                                        else "Total quantity (${dispenseUnit.code})",
                                    )
                                },
                                singleLine = true,
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                                modifier = Modifier.fillMaxWidth(),
                            )
                        }
                        if (computed != null && isScheduled) {
                            item {
                                val upd = computed.unitsPerDose
                                val total = computed.totalDoses
                                if (upd != null && total != null) {
                                    Text(
                                        "= ${formatQty(upd)} ${dispenseUnit.code}/dose × $total doses",
                                        style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                                if (computed.needsConfirmation) {
                                    Text(
                                        "⚠ Please double-check this quantity before confirming.",
                                        style = MaterialTheme.typography.labelSmall,
                                        color = Amber,
                                    )
                                }
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
                    val finalQty = quantityText.trim().toDoubleOrNull()
                    Button(
                        onClick = {
                            val durForLine = if (showDuration) durationDays else null
                            val qtySource = if (isScheduled && !quantityOverridden) {
                                HcDrugCatalog.QuantitySource.COMPUTED
                            } else {
                                HcDrugCatalog.QuantitySource.OVERRIDDEN
                            }
                            pendingLine = PrescriptionLineRpc(
                                medicationCode = drug.code,
                                freeTextName = drug.name,
                                doseText = strength,
                                routeText = route?.code,
                                frequencyText = frequency?.code,
                                durationText = durForLine?.let { "${it}d" },
                                quantityPrescribed = finalQty,
                                // "unit" is never null now (spec R5): dispense unit == quantity unit.
                                quantityUnit = dispenseUnit.code,
                                notes = notes.trim().ifBlank { null },
                                source = "manual",
                                // Canonical frequency_code is UPPERCASE (DB CHECK requires it).
                                frequencyCode = frequency?.code?.uppercase(),
                                durationDays = durForLine,
                                doseAmount = doseAmount,
                                doseUnit = doseUnit.code,
                                strengthAmount = parsedStrength.strengthAmount,
                                strengthUnit = parsedStrength.strengthUnit,
                                form = parsedStrength.form,
                                orderMode = orderMode.code,
                                quantitySource = qtySource.code,
                                dispenseUnit = dispenseUnit.code,
                            )
                            pendingSig = HcDrugCatalog.formatSig(
                                drug = drug,
                                strength = strength,
                                quantityText = finalQty?.let { "${formatQty(it)} ${dispenseUnit.code}" },
                                frequency = frequency,
                                route = route,
                                durationDays = durForLine,
                                notes = notes.trim().ifBlank { null },
                            )
                            step = RxPickerStep.Confirm
                        },
                        enabled = (strength != null || drug.strengths.isEmpty()) &&
                            doseAmount != null && doseAmount > 0.0 &&
                            finalQty != null && finalQty > 0.0,
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
                        onClick = {
                            val line = pendingLine ?: return@Button
                            onConfirm(
                                PharmacyPickerResult(
                                    displaySig = pendingSig,
                                    line = line,
                                ),
                            )
                        },
                        enabled = pendingLine != null,
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

/** Fallback dispense unit when the catalog strength didn't parse one out. */
private fun defaultDispenseFor(doseUnit: HcDrugCatalog.DoseUnit): HcDrugCatalog.DispenseUnit =
    when (doseUnit) {
        HcDrugCatalog.DoseUnit.TAB -> HcDrugCatalog.DispenseUnit.TAB
        HcDrugCatalog.DoseUnit.CAP -> HcDrugCatalog.DispenseUnit.CAP
        HcDrugCatalog.DoseUnit.ML -> HcDrugCatalog.DispenseUnit.ML
        HcDrugCatalog.DoseUnit.DROP -> HcDrugCatalog.DispenseUnit.DROP
        HcDrugCatalog.DoseUnit.PUFF -> HcDrugCatalog.DispenseUnit.PUFF
        HcDrugCatalog.DoseUnit.MG -> HcDrugCatalog.DispenseUnit.TAB
    }

/** Trim a computed quantity to a tidy string (drops a trailing .0). */
private fun formatQty(value: Double): String =
    if (value % 1.0 == 0.0) value.toInt().toString() else value.toString()

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
