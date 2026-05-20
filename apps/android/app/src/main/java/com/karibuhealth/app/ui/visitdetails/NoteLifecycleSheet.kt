package com.karibuhealth.app.ui.visitdetails

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Stamp
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.NoteAdd
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
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
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.karibuhealth.app.domain.model.StaffRole

/** Roles that can addend a note (mirrors rpc_addend_provider_note). */
private val AddendRoles = setOf(
    StaffRole.admin,
    StaffRole.doctor,
    StaffRole.clinical_officer,
    StaffRole.midwife,
    StaffRole.nurse,
    StaffRole.nursing_assistant,
)

/** Roles that can amend a previously-signed note. */
private val AmendRoles = setOf(
    StaffRole.admin,
    StaffRole.doctor,
    StaffRole.clinical_officer,
    StaffRole.midwife,
)

/** Roles that can void a note. */
private val VoidRoles = setOf(
    StaffRole.admin,
    StaffRole.doctor,
    StaffRole.clinical_officer,
)

/** Roles that can cosign a mid-level provider's note. */
private val CosignRoles = AmendRoles

/**
 * Inline lifecycle actions for a signed clinical note. Rendered below the
 * clinician-note card on [VisitDetailsScreen]. Hidden when the note is in
 * draft state — drafts are edited via the dictation screen instead.
 *
 *  @param noteStatus current provider_notes.status
 *  @param noteAuthorId resolved from created_by / finalized_by
 *  @param requiresCosign true when a mid-level signer hasn't yet been
 *         counter-signed; surfaces an "Awaiting cosign" badge + Cosign button
 *  @param currentTranscript prefill for the Amend editor
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NoteLifecycleActionsCard(
    noteStatus: String,
    noteAuthorId: String?,
    requiresCosign: Boolean,
    currentTranscript: String,
    currentStaffId: String?,
    currentStaffRole: StaffRole?,
    onAddend: (String) -> Unit,
    onAmend: (transcript: String, reason: String) -> Unit,
    onVoid: (String) -> Unit,
    onCosign: () -> Unit,
) {
    if (noteStatus == "draft") return

    var addendOpen by remember { mutableStateOf(false) }
    var amendOpen by remember { mutableStateOf(false) }
    var voidOpen by remember { mutableStateOf(false) }

    val role = currentStaffRole
    val canAddend = role != null && role in AddendRoles && noteStatus != "voided"
    val canAmend = role != null && role in AmendRoles && noteStatus != "voided"
    val canVoid = role != null && role in VoidRoles && noteStatus != "voided"
    val canCosign = requiresCosign &&
        role != null && role in CosignRoles &&
        noteStatus != "voided" && noteStatus != "cosigned" &&
        currentStaffId != null && currentStaffId != noteAuthorId

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        if (requiresCosign && noteStatus != "cosigned" && noteStatus != "voided") {
            Text(
                text = "Awaiting attending cosign",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.tertiary,
                fontWeight = FontWeight.SemiBold,
            )
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            if (canCosign) {
                Button(
                    onClick = onCosign,
                    shape = RoundedCornerShape(12.dp),
                ) {
                    Icon(Icons.Default.Stamp, contentDescription = null, modifier = Modifier.height(14.dp))
                    Spacer(Modifier.height(0.dp))
                    Text("Cosign")
                }
            }
            if (canAddend) {
                OutlinedButton(
                    onClick = { addendOpen = true },
                    shape = RoundedCornerShape(12.dp),
                ) {
                    Icon(Icons.Outlined.NoteAdd, contentDescription = null, modifier = Modifier.height(14.dp))
                    Spacer(Modifier.height(0.dp))
                    Text("Add addendum")
                }
            }
            if (canAmend) {
                OutlinedButton(
                    onClick = { amendOpen = true },
                    shape = RoundedCornerShape(12.dp),
                ) {
                    Icon(Icons.Outlined.Edit, contentDescription = null, modifier = Modifier.height(14.dp))
                    Spacer(Modifier.height(0.dp))
                    Text("Amend")
                }
            }
            if (canVoid) {
                TextButton(onClick = { voidOpen = true }) {
                    Text("Void", color = MaterialTheme.colorScheme.error)
                }
            }
        }
    }

    if (addendOpen) {
        AddendumSheet(
            onDismiss = { addendOpen = false },
            onSubmit = { text ->
                onAddend(text)
                addendOpen = false
            },
        )
    }

    if (amendOpen) {
        AmendmentSheet(
            initialTranscript = currentTranscript,
            onDismiss = { amendOpen = false },
            onSubmit = { transcript, reason ->
                onAmend(transcript, reason)
                amendOpen = false
            },
        )
    }

    if (voidOpen) {
        VoidSheet(
            onDismiss = { voidOpen = false },
            onSubmit = { reason ->
                onVoid(reason)
                voidOpen = false
            },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AddendumSheet(onDismiss: () -> Unit, onSubmit: (String) -> Unit) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var text by remember { mutableStateOf("") }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(
                text = "Add addendum",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                text = "Original note is preserved. Each addendum is its own audit row.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            OutlinedTextField(
                value = text,
                onValueChange = { text = it },
                modifier = Modifier.fillMaxWidth(),
                minLines = 4,
                maxLines = 8,
                placeholder = { Text("New information…") },
                shape = RoundedCornerShape(10.dp),
            )
            Button(
                onClick = { onSubmit(text.trim()) },
                enabled = text.trim().length >= 3,
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
            ) {
                Text("Append")
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AmendmentSheet(
    initialTranscript: String,
    onDismiss: () -> Unit,
    onSubmit: (transcript: String, reason: String) -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var transcript by remember { mutableStateOf(initialTranscript) }
    var reason by remember { mutableStateOf("") }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(
                text = "Amend note",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                text = "Prior version is preserved in the audit trail.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            OutlinedTextField(
                value = reason,
                onValueChange = { reason = it },
                modifier = Modifier.fillMaxWidth(),
                placeholder = { Text("Reason for amendment") },
                singleLine = true,
                shape = RoundedCornerShape(10.dp),
            )
            OutlinedTextField(
                value = transcript,
                onValueChange = { transcript = it },
                modifier = Modifier.fillMaxWidth(),
                minLines = 6,
                maxLines = 12,
                shape = RoundedCornerShape(10.dp),
            )
            Button(
                onClick = { onSubmit(transcript.trim(), reason.trim()) },
                enabled = transcript.trim().length >= 10 && reason.trim().isNotEmpty(),
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
            ) {
                Text("Save amendment")
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun VoidSheet(onDismiss: () -> Unit, onSubmit: (String) -> Unit) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var reason by remember { mutableStateOf("") }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(
                text = "Void note",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.error,
            )
            Text(
                text = "Marks the note as withdrawn. It stays in the audit trail.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            OutlinedTextField(
                value = reason,
                onValueChange = { reason = it },
                modifier = Modifier.fillMaxWidth(),
                minLines = 3,
                maxLines = 6,
                placeholder = { Text("Reason (required)") },
                shape = RoundedCornerShape(10.dp),
            )
            Button(
                onClick = { onSubmit(reason.trim()) },
                enabled = reason.trim().isNotEmpty(),
                colors = ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.error,
                    contentColor = MaterialTheme.colorScheme.onError,
                ),
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
            ) {
                Text("Void note")
            }
        }
    }
}
