package com.karibuhealth.app.ui.referral

import android.content.Intent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.karibuhealth.app.domain.model.ReferralUrgency
import com.karibuhealth.app.ui.adaptive.KaribuLayout
import com.karibuhealth.app.ui.adaptive.KaribuTwoColumnRow
import com.karibuhealth.app.ui.adaptive.supportsMultiColumn
import com.karibuhealth.app.ui.components.KhMetaText
import com.karibuhealth.app.ui.theme.Cobalt
import com.karibuhealth.app.ui.util.formatPatientName

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun ReferralScreen(
    visitId: String,
    onNavigateBack: () -> Unit,
    onComplete: () -> Unit = onNavigateBack,
    embedInPane: Boolean = false,
    viewModel: ReferralViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()
    val context = LocalContext.current

    LaunchedEffect(visitId) {
        viewModel.load(visitId)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            "Refer to hospital",
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.SemiBold,
                        )
                        KhMetaText(text = "TRANSFER")
                    }
                },
                navigationIcon = {
                    if (!embedInPane) {
                        IconButton(onClick = onNavigateBack) {
                            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                        }
                    }
                },
            )
        },
    ) { padding ->
        if (uiState.isLoading) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
                verticalArrangement = Arrangement.Center,
            ) {
                CircularProgressIndicator(modifier = Modifier.padding(24.dp))
            }
            return@Scaffold
        }

        val printable = uiState.printableSummary
        val tablet = supportsMultiColumn()
        if (printable != null) {
            if (!tablet) {
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(padding)
                        .padding(KaribuLayout.contentPadding()),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Text(
                        "Referral recorded",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                    )
                    Text(
                        "Print or share this summary with the patient for the receiving facility.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Surface(
                        shape = RoundedCornerShape(12.dp),
                        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f),
                        modifier = Modifier
                            .weight(1f)
                            .fillMaxWidth(),
                    ) {
                        Text(
                            text = printable,
                            modifier = Modifier
                                .verticalScroll(rememberScrollState())
                                .padding(16.dp),
                            style = MaterialTheme.typography.bodySmall,
                            fontFamily = FontFamily.Monospace,
                        )
                    }
                    Button(
                        onClick = {
                            val send = Intent(Intent.ACTION_SEND).apply {
                                type = "text/plain"
                                putExtra(Intent.EXTRA_SUBJECT, "Karibu referral summary")
                                putExtra(Intent.EXTRA_TEXT, printable)
                            }
                            context.startActivity(
                                Intent.createChooser(send, "Share referral summary"),
                            )
                        },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Icon(Icons.Default.Share, contentDescription = null)
                        Spacer(Modifier.padding(horizontal = 4.dp))
                        Text("Share / print summary")
                    }
                    // Few ambulances; patients travel in open-air trucks where a
                    // single thermal slip can tear or wash out. Offer an instant
                    // backup copy (two copies, with a cut line between).
                    OutlinedButton(
                        onClick = {
                            val cut = "\n\n" + "-".repeat(48) +
                                "\n        CUT HERE — SECOND COPY (BACKUP)\n" +
                                "-".repeat(48) + "\n\n"
                            val send = Intent(Intent.ACTION_SEND).apply {
                                type = "text/plain"
                                putExtra(Intent.EXTRA_SUBJECT, "Karibu referral summary (2 copies)")
                                putExtra(Intent.EXTRA_TEXT, printable + cut + printable)
                            }
                            context.startActivity(
                                Intent.createChooser(send, "Print 2 copies"),
                            )
                        },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text("Print 2 copies (backup)")
                    }
                    OutlinedButton(
                        onClick = onComplete,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text("Done")
                    }
                }
                return@Scaffold
            }

            // Tablet: split the generated preview beside the key referral fields.
            KaribuTwoColumnRow(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .padding(KaribuLayout.contentPadding()),
                leftWeight = 0.44f,
                rightWeight = 0.56f,
                left = {
                    Column(
                        modifier = Modifier.fillMaxWidth(),
                        verticalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        Text(
                            "Referral details",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold,
                        )
                        uiState.toFacility.takeIf { it.isNotBlank() }?.let {
                            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                KhMetaText(text = "Receiving hospital / HCIV")
                                Text(it, style = MaterialTheme.typography.bodyMedium)
                            }
                        }
                        Text(
                            "Urgency: ${uiState.urgency.label}",
                            style = MaterialTheme.typography.bodyMedium,
                        )
                        uiState.reason.takeIf { it.isNotBlank() }?.let {
                            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                KhMetaText(text = "Reason for referral")
                                Text(it, style = MaterialTheme.typography.bodyMedium)
                            }
                        }
                        uiState.clinicalSummary.takeIf { it.isNotBlank() }?.let {
                            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                KhMetaText(text = "Clinical summary (printout)")
                                Text(it, style = MaterialTheme.typography.bodyMedium)
                            }
                        }
                    }
                },
                right = {
                    Column(
                        modifier = Modifier.fillMaxWidth(),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        Text(
                            "Referral recorded",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Text(
                            "Print or share this summary with the patient for the receiving facility.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Surface(
                            shape = RoundedCornerShape(12.dp),
                            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f),
                            modifier = Modifier
                                .weight(1f)
                                .fillMaxWidth(),
                        ) {
                            Text(
                                text = printable,
                                modifier = Modifier
                                    .verticalScroll(rememberScrollState())
                                    .padding(16.dp),
                                style = MaterialTheme.typography.bodySmall,
                                fontFamily = FontFamily.Monospace,
                            )
                        }
                        Button(
                            onClick = {
                                val send = Intent(Intent.ACTION_SEND).apply {
                                    type = "text/plain"
                                    putExtra(Intent.EXTRA_SUBJECT, "Karibu referral summary")
                                    putExtra(Intent.EXTRA_TEXT, printable)
                                }
                                context.startActivity(
                                    Intent.createChooser(send, "Share referral summary"),
                                )
                            },
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Icon(Icons.Default.Share, contentDescription = null)
                            Spacer(Modifier.padding(horizontal = 4.dp))
                            Text("Share / print summary")
                        }
                        OutlinedButton(
                            onClick = onComplete,
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Text("Done")
                        }
                    }
                },
            )
            return@Scaffold
        }

        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(KaribuLayout.contentPadding()),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (tablet) {
                KaribuTwoColumnRow(
                    leftWeight = 0.48f,
                    rightWeight = 0.52f,
                    left = {
                        ReferralFormFields(
                            uiState = uiState,
                            viewModel = viewModel,
                        )
                    },
                    right = {
                        ReferralDraftPreviewPane(uiState = uiState)
                    },
                )
            } else {
                ReferralFormFields(
                    uiState = uiState,
                    viewModel = viewModel,
                )
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ReferralFormFields(
    uiState: ReferralUiState,
    viewModel: ReferralViewModel,
) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        uiState.patient?.let { patient ->
            Text(
                formatPatientName(patient.firstName, patient.lastName, patient.displayName),
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
            )
            patient.patientNumber?.let {
                Text(
                    it,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        OutlinedTextField(
            value = uiState.toFacility,
            onValueChange = viewModel::updateToFacility,
            label = { Text("Receiving hospital / HCIV") },
            placeholder = { Text("e.g. District Hospital") },
            modifier = Modifier.fillMaxWidth(),
            minLines = 1,
        )

        Text(
            "Urgency",
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.SemiBold,
        )
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            ReferralUrgency.entries.forEach { urgency ->
                FilterChip(
                    selected = uiState.urgency == urgency,
                    onClick = { viewModel.updateUrgency(urgency) },
                    label = { Text(urgency.label) },
                )
            }
        }

        OutlinedTextField(
            value = uiState.reason,
            onValueChange = viewModel::updateReason,
            label = { Text("Reason for referral") },
            placeholder = { Text("Why the patient needs higher-level care") },
            modifier = Modifier.fillMaxWidth(),
            minLines = 2,
        )

        OutlinedTextField(
            value = uiState.clinicalSummary,
            onValueChange = viewModel::updateClinicalSummary,
            label = { Text("Clinical summary (for printout)") },
            modifier = Modifier.fillMaxWidth(),
            minLines = 6,
        )

        OutlinedTextField(
            value = uiState.transportMode,
            onValueChange = viewModel::updateTransportMode,
            label = { Text("Transport (optional)") },
            placeholder = { Text("Ambulance, private vehicle, etc.") },
            modifier = Modifier.fillMaxWidth(),
        )

        uiState.error?.let { err ->
            Text(err, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
        }

        Button(
            onClick = viewModel::submit,
            enabled = !uiState.isSaving,
            modifier = Modifier.fillMaxWidth(),
        ) {
            if (uiState.isSaving) {
                CircularProgressIndicator(modifier = Modifier.height(20.dp))
            } else {
                Text("Create referral & prepare summary")
            }
        }
        Spacer(Modifier.height(24.dp))
    }
}

@Composable
private fun ReferralDraftPreviewPane(uiState: ReferralUiState) {
    val patient = uiState.patient
    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(
            "Live preview",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
        )
        Text(
            "Updates as you fill the form. This is what staff can print or share with the patient.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Surface(
            shape = RoundedCornerShape(12.dp),
            color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f),
            modifier = Modifier.fillMaxWidth(),
        ) {
            val preview = if (patient != null) {
                ReferralSummaryFormatter.buildDraftPreview(
                    clinicName = uiState.clinicName,
                    patient = patient,
                    visit = uiState.visit,
                    vitals = uiState.vitals,
                    toFacility = uiState.toFacility,
                    urgency = uiState.urgency,
                    reason = uiState.reason,
                    clinicalSummary = uiState.clinicalSummary,
                    transportMode = uiState.transportMode,
                    referringClinician = uiState.staff?.displayName,
                )
            } else {
                "Patient details loading…"
            }
            Text(
                text = preview,
                modifier = Modifier
                    .verticalScroll(rememberScrollState())
                    .padding(16.dp),
                style = MaterialTheme.typography.bodySmall,
                fontFamily = FontFamily.Monospace,
            )
        }
    }
}
