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
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.outlined.RadioButtonUnchecked
import androidx.compose.material3.AssistChip
import androidx.compose.material3.AssistChipDefaults
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.karibuhealth.app.domain.catalog.HcLabCatalog

/**
 * Discrete lab-test picker. Replaces free-form typing in the LABS section with
 * a HC III-scoped catalog. Smart-filters by patient sex (pregnancy tests only
 * for female patients).
 *
 * @param patientSex 'M' / 'F' / null. Drives sex filter.
 * @param ageYears age in whole years; null hides age-restricted tests.
 * @param onConfirm called with a comma-joined string of selected test names.
 *                  Existing free-text in the section is preserved by the
 *                  caller — this sheet only emits the additions.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LabPickerSheet(
    patientSex: String?,
    ageYears: Int?,
    onDismiss: () -> Unit,
    onConfirm: (String) -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val categories = remember(patientSex, ageYears) {
        HcLabCatalog.filtered(patientSex, ageYears)
    }
    var selected by remember { mutableStateOf(setOf<String>()) }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 8.dp)
                .heightIn(min = 200.dp, max = 600.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = "Add lab tests",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.weight(1f),
                )
                Text(
                    text = "${selected.size} selected",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Text(
                text = "HC III menu — filtered for this patient.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 2.dp, bottom = 8.dp),
            )

            LazyColumn(
                modifier = Modifier.weight(1f, fill = false),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                items(categories, key = { it.id }) { cat ->
                    Column {
                        Text(
                            text = cat.title.uppercase(),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.padding(bottom = 6.dp),
                        )
                        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            cat.tests.forEach { test ->
                                val isSelected = test.code in selected
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clickable {
                                            selected = if (isSelected) selected - test.code else selected + test.code
                                        }
                                        .padding(vertical = 6.dp, horizontal = 4.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    if (isSelected) {
                                        Icon(
                                            imageVector = Icons.Default.Check,
                                            contentDescription = null,
                                            tint = MaterialTheme.colorScheme.primary,
                                            modifier = Modifier
                                                .size(20.dp)
                                                .padding(end = 8.dp),
                                        )
                                    } else {
                                        Icon(
                                            imageVector = Icons.Outlined.RadioButtonUnchecked,
                                            contentDescription = null,
                                            tint = MaterialTheme.colorScheme.onSurfaceVariant,
                                            modifier = Modifier
                                                .size(20.dp)
                                                .padding(end = 8.dp),
                                        )
                                    }
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(
                                            text = test.name,
                                            style = MaterialTheme.typography.bodyMedium,
                                            color = MaterialTheme.colorScheme.onSurface,
                                            fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Normal,
                                        )
                                        Text(
                                            text = test.hint ?: "Standard HC III test",
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

            Spacer(Modifier.height(8.dp))
            Button(
                onClick = {
                    val text = categories
                        .flatMap { it.tests }
                        .filter { it.code in selected }
                        .joinToString(", ") { it.name }
                    onConfirm(text)
                },
                enabled = selected.isNotEmpty(),
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
            ) {
                Text(if (selected.isEmpty()) "Select tests" else "Add ${selected.size} test${if (selected.size == 1) "" else "s"}")
            }
            Spacer(Modifier.height(12.dp))
        }
    }
}

/** Compact assist chip used by the dictation header — open the picker. */
@Composable
fun AddLabsChip(onClick: () -> Unit, modifier: Modifier = Modifier) {
    AssistChip(
        onClick = onClick,
        label = { Text("+ Add tests") },
        colors = AssistChipDefaults.assistChipColors(
            containerColor = MaterialTheme.colorScheme.primaryContainer,
            labelColor = MaterialTheme.colorScheme.onPrimaryContainer,
        ),
        modifier = modifier,
    )
}
