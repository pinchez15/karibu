package com.karibuhealth.app.ui.visitdetails

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.RateReview
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.karibuhealth.app.domain.model.AiStructuredSuggestions
import com.karibuhealth.app.domain.model.PatientVitals
import com.karibuhealth.app.domain.model.Visit
import com.karibuhealth.app.domain.model.VisitStatus
import com.karibuhealth.app.ui.components.KhAccentPill
import com.karibuhealth.app.ui.components.KhMetaText
import com.karibuhealth.app.ui.components.KhVitalChip
import com.karibuhealth.app.ui.components.AiReviewBanner
import com.karibuhealth.app.ui.components.incorporationFor
import com.karibuhealth.app.ui.components.DictationIncorporate
import com.karibuhealth.app.ui.util.BottomBarScrollPadding
import com.karibuhealth.app.ui.util.formatClinicalLine
import com.karibuhealth.app.ui.util.formatClinicalList
import com.karibuhealth.app.ui.util.formatPatientName
import com.karibuhealth.app.ui.theme.Amber
import com.karibuhealth.app.ui.theme.AmberSoft
import com.karibuhealth.app.ui.theme.Body
import com.karibuhealth.app.ui.theme.Cobalt
import com.karibuhealth.app.ui.theme.Green
import com.karibuhealth.app.ui.theme.Ink
import com.karibuhealth.app.ui.theme.Line
import com.karibuhealth.app.ui.theme.Muted
import java.time.LocalDate

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VisitDetailsScreen(
    visitId: String,
    onNavigateBack: () -> Unit,
    onNavigateToDictation: (String, Boolean, DictationIncorporate?) -> Unit,
    onNavigateToReview: (String) -> Unit,
    onNavigateToPayment: (String) -> Unit,
    viewModel: VisitDetailsViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()

    LaunchedEffect(visitId) {
        viewModel.loadVisit(visitId)
    }

    Scaffold(
        contentWindowInsets = WindowInsets(0, 0, 0, 0),
        topBar = {
            TopAppBar(
                windowInsets = WindowInsets(0, 0, 0, 0),
                title = {
                    Text(
                        "Visit",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    val visit = uiState.visit
                    val docComplete = visit?.documentationComplete == true
                    val isStreaming = visit?.status == VisitStatus.pending && docComplete
                    val pendingAi = uiState.pendingAiReviewCount
                    val isReady = visit?.status == VisitStatus.review || visit?.status == VisitStatus.sent

                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.padding(end = 16.dp),
                    ) {
                        when {
                            isStreaming -> {
                                Icon(
                                    imageVector = Icons.Default.AutoAwesome,
                                    contentDescription = null,
                                    tint = Amber,
                                    modifier = Modifier.size(14.dp),
                                )
                                Spacer(Modifier.width(4.dp))
                                Text(
                                    text = "STRUCTURING",
                                    color = Amber,
                                    fontWeight = FontWeight.SemiBold,
                                    fontSize = 11.sp,
                                )
                            }
                            isReady && pendingAi > 0 -> {
                                Text(
                                    text = "NEEDS REVIEW",
                                    color = Amber,
                                    fontWeight = FontWeight.SemiBold,
                                    fontSize = 11.sp,
                                )
                            }
                            isReady -> {
                                Icon(
                                    imageVector = Icons.Default.Check,
                                    contentDescription = null,
                                    tint = Green,
                                    modifier = Modifier.size(14.dp),
                                )
                                Spacer(Modifier.width(4.dp))
                                Text(
                                    text = "READY",
                                    color = Green,
                                    fontWeight = FontWeight.SemiBold,
                                    fontSize = 11.sp,
                                )
                            }
                            else -> {
                                KhMetaText(text = visit?.status?.name?.uppercase() ?: "")
                            }
                        }
                    }
                },
            )
        },
        bottomBar = {
            uiState.visit?.let { visit ->
                VisitDetailsBottomAction(
                    visit = visit,
                    visitId = visitId,
                    hasLocalDraft = uiState.hasLocalDraft,
                    onNavigateToDictation = onNavigateToDictation,
                    onNavigateToReview = onNavigateToReview,
                    onNavigateToPayment = onNavigateToPayment,
                )
            }
        },
    ) { innerPadding ->
        if (uiState.isLoading) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding),
                contentAlignment = Alignment.Center,
            ) {
                CircularProgressIndicator()
            }
        } else {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding)
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 20.dp, vertical = 12.dp)
                    .padding(bottom = BottomBarScrollPadding.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                if (uiState.syncErrors.isNotEmpty()) {
                    SyncErrorBanner(
                        errors = uiState.syncErrors,
                        canSync = !uiState.isSyncing && uiState.connectionStatus.isOnline,
                        isSyncing = uiState.isSyncing,
                        onRetry = { viewModel.trySync(visitId) },
                    )
                }

                uiState.patient?.let { patient ->
                    PatientCard(
                        name = formatPatientName(
                            patient.firstName,
                            patient.lastName,
                            patient.displayName,
                        ),
                        patientId = patient.patientNumber ?: "PT-${patient.id.take(6)}",
                        ageBand = listOfNotNull(
                            patient.dateOfBirth?.let(::formatAgeFromDob),
                            patient.sex?.firstOrNull()?.uppercaseChar()?.toString(),
                        ).joinToString(""),
                        phone = patient.whatsappNumber,
                        complaint = uiState.visit?.chiefComplaint?.takeIf { it.isNotBlank() },
                        vitals = uiState.latestVitals,
                    )
                }

                uiState.visit?.let { visit ->
                    if (
                        !visit.diagnosis.isNullOrBlank() ||
                        !visit.followUpInstructions.isNullOrBlank() ||
                        !visit.testsOrdered.isNullOrBlank() ||
                        !visit.medications.isNullOrBlank()
                    ) {
                        ClinicalSummaryCard(visit = visit)
                    }
                }

                run {
                    val clinicianText = uiState.patientNote?.content
                        ?.takeIf { it.isNotBlank() }
                        ?: uiState.providerNote?.transcript?.takeIf { it.isNotBlank() }
                    if (clinicianText != null) {
                        ClinicianNoteCard(content = clinicianText)
                    }
                }

                uiState.providerNote?.let { note ->
                    NoteLifecycleActionsCard(
                        noteStatus = note.status.name,
                        noteAuthorId = note.createdBy ?: note.finalizedBy,
                        requiresCosign = note.requiresCosign,
                        currentTranscript = note.transcript.orEmpty(),
                        currentStaffId = uiState.currentStaff?.id,
                        currentStaffRole = uiState.currentStaff?.role,
                        onAddend = viewModel::addendCurrentNote,
                        onAmend = viewModel::amendCurrentNote,
                        onVoid = viewModel::voidCurrentNote,
                        onCosign = viewModel::cosignCurrentNote,
                    )
                }

                uiState.aiPatientNote?.content?.takeIf { it.isNotBlank() }?.let { summary ->
                    AiReceiptCard(summary = summary)
                }

                uiState.visit?.let { visit ->
                    val canSendPharmacy =
                        !visit.medications.isNullOrBlank() && visit.pharmacyOrderSubmittedAt == null
                    if (canSendPharmacy) {
                        OutlinedButton(
                            onClick = { viewModel.sendToPharmacy() },
                            enabled = !uiState.isSendingToPharmacy,
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Text(
                                if (uiState.isSendingToPharmacy) "Sending to pharmacy…"
                                else "Send to pharmacy",
                            )
                        }
                        uiState.pharmacyMessage?.let { msg ->
                            Text(msg, style = MaterialTheme.typography.bodySmall, color = Muted)
                        }
                    }
                    val hasLab =
                        !visit.testsOrdered.isNullOrBlank() || !visit.labResults.isNullOrBlank()
                    val hasPharmacy =
                        !visit.medications.isNullOrBlank() || visit.dispensingStatus != "not_started"
                    if (hasLab || hasPharmacy) {
                        CareDeliveredCard(visit = visit)
                    }
                }

                AiReviewBanner(
                    suggestions = uiState.aiReviewSuggestions,
                    onDismiss = { suggestion ->
                        viewModel.dismissAiSuggestion(suggestion.id)
                    },
                    onIncorporate = { suggestion ->
                        val incorporate = incorporationFor(suggestion)
                        viewModel.incorporateAiSuggestion(suggestion.id) {
                            onNavigateToDictation(visitId, false, incorporate)
                        }
                    },
                )

                uiState.aiReviewError?.let { err ->
                    Text(
                        text = err,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                }

                if (uiState.hasPendingVisitSync || uiState.syncErrors.isNotEmpty()) {
                    SyncCard(
                        statusMessage = uiState.aiAvailabilityMessage,
                        canSync = !uiState.isSyncing && uiState.connectionStatus.isOnline,
                        isSyncing = uiState.isSyncing,
                        errors = uiState.syncErrors,
                        onTrySync = { viewModel.trySync(visitId) },
                    )
                }

                uiState.visit?.errorMessage?.let { error ->
                    Surface(
                        shape = RoundedCornerShape(12.dp),
                        color = MaterialTheme.colorScheme.errorContainer,
                    ) {
                        Text(
                            error,
                            modifier = Modifier.padding(14.dp),
                            color = MaterialTheme.colorScheme.onErrorContainer,
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                }

                Spacer(Modifier.height(16.dp))
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun PatientCard(
    name: String,
    patientId: String,
    ageBand: String,
    phone: String?,
    complaint: String?,
    vitals: PatientVitals?,
) {
    var complaintExpanded by rememberSaveable { mutableStateOf(false) }
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(MaterialTheme.colorScheme.surface)
            .border(1.dp, Line, RoundedCornerShape(14.dp))
            .padding(14.dp),
    ) {
        Column {
            Row(verticalAlignment = Alignment.Top) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = name,
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                    Spacer(Modifier.height(2.dp))
                    KhMetaText(
                        text = listOfNotNull(
                            patientId,
                            ageBand.takeIf { it.isNotBlank() },
                            phone?.takeIf { it.isNotBlank() },
                        ).joinToString(" · "),
                    )
                }

                if (!complaint.isNullOrBlank()) {
                    val showFull = complaintExpanded || complaint.length <= 28
                    KhAccentPill(
                        label = if (showFull) complaint else "${complaint.take(28)}…",
                        fg = Amber,
                        bg = AmberSoft,
                        paddingValues = PaddingValues(horizontal = 12.dp, vertical = 4.dp),
                        modifier = Modifier.clickable { complaintExpanded = !complaintExpanded },
                    )
                }
            }

            if (!complaint.isNullOrBlank() && complaintExpanded && complaint.length > 28) {
                Spacer(Modifier.height(8.dp))
                Text(
                    text = complaint,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            // Inline vital chips — only when we have at least one reading
            if (vitals != null && hasAnyReading(vitals)) {
                Spacer(Modifier.height(12.dp))
                FlowRow(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    vitals.tempC?.let {
                        KhVitalChip(
                            label = "T",
                            value = "${formatDecimal(it)}°C",
                            valueColor = if (it >= 38.0) Amber else MaterialTheme.colorScheme.onSurface,
                        )
                    }
                    if (vitals.bpSystolic != null && vitals.bpDiastolic != null) {
                        val high = (vitals.bpSystolic >= 140) || (vitals.bpDiastolic >= 90)
                        KhVitalChip(
                            label = "BP",
                            value = "${vitals.bpSystolic}/${vitals.bpDiastolic}",
                            valueColor = if (high) Amber else MaterialTheme.colorScheme.onSurface,
                        )
                    }
                    vitals.pulseBpm?.let {
                        KhVitalChip(label = "HR", value = it.toString())
                    }
                    vitals.respRate?.let {
                        KhVitalChip(label = "RR", value = it.toString())
                    }
                    vitals.spo2Pct?.let {
                        KhVitalChip(
                            label = "SpO₂",
                            value = "$it%",
                            valueColor = if (it < 94) Amber else MaterialTheme.colorScheme.onSurface,
                        )
                    }
                    vitals.weightKg?.let {
                        KhVitalChip(label = "Wt", value = "${formatDecimal(it)} kg")
                    }
                }
            }
        }
    }
}

@Composable
private fun AiReceiptCard(summary: String) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(MaterialTheme.colorScheme.surface)
            .border(1.dp, Line, RoundedCornerShape(14.dp))
            .padding(14.dp),
    ) {
        Column {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = Icons.Default.AutoAwesome,
                    contentDescription = null,
                    tint = Amber,
                    modifier = Modifier.size(16.dp),
                )
                Spacer(Modifier.width(8.dp))
                Text(
                    text = "Patient receipt summary",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurface,
                )
            }
            Spacer(Modifier.height(6.dp))
            Text(
                text = summary,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface,
            )
        }
    }
}

@Composable
private fun ClinicianNoteCard(content: String) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(MaterialTheme.colorScheme.surface)
            .border(1.dp, Line, RoundedCornerShape(14.dp))
            .padding(14.dp),
    ) {
        Column {
            KhMetaText(text = "CLINICIAN NOTE")
            Spacer(Modifier.height(6.dp))
            Text(
                text = content,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface,
            )
        }
    }
}

@Composable
private fun ClinicalSummaryCard(visit: Visit) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(MaterialTheme.colorScheme.surface)
            .border(1.dp, Line, RoundedCornerShape(14.dp))
            .padding(14.dp),
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
            KhMetaText(text = "CLINICAL SUMMARY")
            visit.diagnosis?.takeIf { it.isNotBlank() }?.let {
                SummaryRow(label = "Diagnosis", value = formatClinicalLine(it))
            }
            visit.medications?.takeIf { it.isNotBlank() }?.let {
                SummaryListRow(label = "Pharmacy", lines = it.lines().filter { line -> line.isNotBlank() })
            }
            visit.testsOrdered?.takeIf { it.isNotBlank() }?.let {
                SummaryListRow(label = "Labs", lines = formatClinicalList(it))
            }
            visit.followUpInstructions?.takeIf { it.isNotBlank() }?.let {
                SummaryRow(label = "Follow-up", value = formatClinicalLine(it))
            }
        }
    }
}

@Composable
private fun SummaryListRow(label: String, lines: List<String>) {
    Column {
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.SemiBold,
            color = Cobalt,
        )
        Spacer(Modifier.height(4.dp))
        lines.forEach { line ->
            Text(
                text = "• $line",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.padding(bottom = 2.dp),
            )
        }
    }
}

@Composable
private fun SummaryRow(label: String, value: String) {
    Column {
        Text(
            text = label,
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.SemiBold,
            color = Cobalt,
        )
        Spacer(Modifier.height(2.dp))
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurface,
        )
    }
}

@Composable
private fun CareDeliveredCard(visit: Visit) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(MaterialTheme.colorScheme.surface)
            .border(1.dp, Line, RoundedCornerShape(14.dp))
            .padding(14.dp),
    ) {
        Column {
            KhMetaText(text = "CARE DELIVERED")

            // Pharmacy block
            if (!visit.medications.isNullOrBlank() || visit.dispensingStatus != "not_started") {
                Spacer(Modifier.height(10.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = "Medications",
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                    Spacer(Modifier.width(8.dp))
                    DispensingPill(status = visit.dispensingStatus)
                }
                if (!visit.medications.isNullOrBlank()) {
                    Spacer(Modifier.height(2.dp))
                    Text(
                        text = visit.medications,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                }
                if (!visit.dispenseNotes.isNullOrBlank()) {
                    Spacer(Modifier.height(4.dp))
                    Text(
                        text = "Dispenser note: ${visit.dispenseNotes}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            // Lab block
            if (!visit.testsOrdered.isNullOrBlank() || !visit.labResults.isNullOrBlank()) {
                Spacer(Modifier.height(12.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = "Tests",
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                    Spacer(Modifier.width(8.dp))
                    LabPill(status = visit.labStatus, abnormal = visit.labAbnormal)
                }
                if (!visit.testsOrdered.isNullOrBlank()) {
                    Spacer(Modifier.height(2.dp))
                    Text(
                        text = visit.testsOrdered,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                }
                if (!visit.labResults.isNullOrBlank()) {
                    Spacer(Modifier.height(8.dp))
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(8.dp))
                            .background(if (visit.labAbnormal) AmberSoft else MaterialTheme.colorScheme.surfaceVariant)
                            .border(
                                1.dp,
                                if (visit.labAbnormal) Amber.copy(alpha = 0.3f) else Line,
                                RoundedCornerShape(8.dp),
                            )
                            .padding(10.dp),
                    ) {
                        Column {
                            KhMetaText(
                                text = "RESULT",
                                color = if (visit.labAbnormal) Amber else MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            Spacer(Modifier.height(2.dp))
                            Text(
                                text = visit.labResults,
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurface,
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DispensingPill(status: String) {
    val (label, fg, bg) = when (status) {
        "dispensed" -> Triple("Dispensed", Green, com.karibuhealth.app.ui.theme.GreenSoft)
        "in_progress" -> Triple("In progress", Cobalt, com.karibuhealth.app.ui.theme.CobaltSoft)
        "partial" -> Triple("Partial", com.karibuhealth.app.ui.theme.AmberInk, AmberSoft)
        "out_of_stock" -> Triple("Out of stock", com.karibuhealth.app.ui.theme.Red, com.karibuhealth.app.ui.theme.RedSoft)
        else -> Triple("Pending", MaterialTheme.colorScheme.onSurfaceVariant, MaterialTheme.colorScheme.surfaceVariant)
    }
    com.karibuhealth.app.ui.components.KhAccentPill(label = label, fg = fg, bg = bg)
}

@Composable
private fun LabPill(status: String, abnormal: Boolean) {
    if (abnormal) {
        com.karibuhealth.app.ui.components.KhAccentPill(
            label = "Abnormal",
            fg = com.karibuhealth.app.ui.theme.AmberInk,
            bg = AmberSoft,
        )
        return
    }
    val (label, fg, bg) = when (status) {
        "running" -> Triple("Running", Cobalt, com.karibuhealth.app.ui.theme.CobaltSoft)
        "done" -> Triple("Done", Green, com.karibuhealth.app.ui.theme.GreenSoft)
        "abnormal" -> Triple("Abnormal", com.karibuhealth.app.ui.theme.AmberInk, AmberSoft)
        "pending" -> Triple("Pending", MaterialTheme.colorScheme.onSurfaceVariant, MaterialTheme.colorScheme.surfaceVariant)
        else -> Triple("—", MaterialTheme.colorScheme.onSurfaceVariant, MaterialTheme.colorScheme.surfaceVariant)
    }
    com.karibuhealth.app.ui.components.KhAccentPill(label = label, fg = fg, bg = bg)
}

@Composable
private fun HmisCodesCard(suggestions: AiStructuredSuggestions) {
    Column {
        KhMetaText(text = "HMIS CODES — SUGGESTED")
        Spacer(Modifier.height(8.dp))
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            suggestions.diagnoses
                .filter { !it.icd10.isNullOrBlank() }
                .take(5)
                .forEach { diagnosis ->
                    HmisCodeRow(
                        code = diagnosis.icd10!!,
                        name = diagnosis.name,
                        confidence = diagnosis.confidence,
                    )
                }
        }
    }
}

@Composable
private fun HmisCodeRow(
    code: String,
    name: String,
    confidence: String,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(MaterialTheme.colorScheme.surface)
            .border(1.dp, Line, RoundedCornerShape(12.dp))
            .padding(horizontal = 12.dp, vertical = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = code,
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.SemiBold,
            color = Cobalt,
        )
        Spacer(Modifier.width(10.dp))
        Text(
            text = name,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.weight(1f),
        )
        KhMetaText(
            text = confidence.uppercase(),
            color = when (confidence.lowercase()) {
                "high" -> Green
                "medium" -> Cobalt
                else -> MaterialTheme.colorScheme.onSurfaceVariant
            },
        )
    }
}

@Composable
private fun SyncErrorBanner(
    errors: List<SyncErrorInfo>,
    canSync: Boolean,
    isSyncing: Boolean,
    onRetry: () -> Unit,
) {
    // Show the most recent failing entry up top — that's almost always the
    // root cause. The chain of dependent operations can't proceed past it.
    val first = errors.first()

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(com.karibuhealth.app.ui.theme.RedSoft)
            .border(1.dp, com.karibuhealth.app.ui.theme.Red.copy(alpha = 0.3f), RoundedCornerShape(14.dp))
            .padding(14.dp),
    ) {
        Column {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = "Sync stuck",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = com.karibuhealth.app.ui.theme.Red,
                )
                Spacer(Modifier.weight(1f))
                KhMetaText(
                    text = if (errors.size == 1) "1 OPERATION" else "${errors.size} OPERATIONS",
                    color = com.karibuhealth.app.ui.theme.Red,
                )
            }
            Spacer(Modifier.height(8.dp))
            Text(
                text = first.operationType,
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.SemiBold,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Spacer(Modifier.height(2.dp))
            Text(
                text = first.lastError.ifBlank { "(no error message)" },
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 2.dp),
            )
            Spacer(Modifier.height(4.dp))
            KhMetaText(text = "ATTEMPTS: ${first.attempts}")

            if (errors.size > 1) {
                Spacer(Modifier.height(8.dp))
                errors.drop(1).take(2).forEach { err ->
                    Text(
                        text = "${err.operationType}: ${err.lastError.take(80)}",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 2.dp),
                    )
                }
            }

            Spacer(Modifier.height(10.dp))
            OutlinedButton(
                onClick = onRetry,
                enabled = canSync,
                shape = RoundedCornerShape(10.dp),
            ) {
                if (isSyncing) {
                    CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                    Spacer(Modifier.width(8.dp))
                }
                Text(if (isSyncing) "Retrying…" else "Retry sync")
            }
        }
    }
}

@Composable
private fun SyncCard(
    statusMessage: String,
    canSync: Boolean,
    isSyncing: Boolean,
    errors: List<SyncErrorInfo>,
    onTrySync: () -> Unit,
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .border(1.dp, Line, RoundedCornerShape(12.dp))
            .padding(14.dp),
    ) {
        Column {
            KhMetaText(text = "OFFLINE SYNC")
            Spacer(Modifier.height(4.dp))
            Text(
                text = statusMessage,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(10.dp))
            OutlinedButton(
                onClick = onTrySync,
                enabled = canSync,
                shape = RoundedCornerShape(10.dp),
            ) {
                if (isSyncing) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(16.dp),
                        strokeWidth = 2.dp,
                    )
                    Spacer(Modifier.width(8.dp))
                }
                Text(if (isSyncing) "Syncing…" else "Try sync")
            }
            if (errors.isNotEmpty()) {
                Spacer(Modifier.height(8.dp))
                KhMetaText(text = "RECENT ERRORS", color = MaterialTheme.colorScheme.error)
                Spacer(Modifier.height(4.dp))
                errors.take(3).forEach { err ->
                    Text(
                        text = "${err.operationType} (${err.attempts}): ${err.lastError}",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                }
            }
        }
    }
}

/**
 * Status-driven bottom actions on visit-detail. Payment is intentionally
 * NOT the dominant CTA after a save — patients often still need lab /
 * pharmacy work before payment, and clinicians want to keep editing the
 * note as new information lands. Layout per status:
 *
 *   pending + !doc complete → primary "Write note"
 *   pending +  doc complete → primary disabled "AI checking…"
 *   sent                    → primary "Edit note" + secondary "Take payment"
 *   review                  → primary "Review notes"
 *   error                   → primary "Edit and retry"
 *   completed               → primary "Edit note"
 */
@Composable
private fun VisitDetailsBottomAction(
    visit: Visit,
    visitId: String,
    hasLocalDraft: Boolean,
    onNavigateToDictation: (String, Boolean, DictationIncorporate?) -> Unit,
    onNavigateToReview: (String) -> Unit,
    onNavigateToPayment: (String) -> Unit,
) {
    val docComplete = visit.documentationComplete

    val primary: BottomActionConfig
    val secondary: BottomActionConfig?

    when {
        visit.status == VisitStatus.pending && !docComplete -> {
            primary = BottomActionConfig(
                label = if (hasLocalDraft) "Continue note" else "Write note",
                onClick = { onNavigateToDictation(visitId, false, null) },
                icon = Icons.Default.Mic,
                enabled = true,
            )
            secondary = null
        }
        visit.status == VisitStatus.pending && docComplete -> {
            primary = BottomActionConfig(
                label = "AI checking…",
                onClick = {},
                icon = null,
                enabled = false,
            )
            secondary = null
        }
        visit.status == VisitStatus.sent -> {
            primary = BottomActionConfig(
                label = "Edit note",
                onClick = { onNavigateToDictation(visitId, false, null) },
                icon = Icons.Default.Mic,
                enabled = true,
            )
            secondary = BottomActionConfig(
                label = "Take payment",
                onClick = { onNavigateToPayment(visitId) },
                icon = null,
                enabled = true,
            )
        }
        visit.status == VisitStatus.review -> {
            primary = BottomActionConfig(
                label = "Review notes",
                onClick = { onNavigateToReview(visitId) },
                icon = Icons.Default.RateReview,
                enabled = true,
            )
            secondary = null
        }
        visit.status == VisitStatus.error -> {
            primary = BottomActionConfig(
                label = "Edit and retry",
                onClick = { onNavigateToDictation(visitId, false, null) },
                icon = Icons.Default.Mic,
                enabled = true,
            )
            secondary = null
        }
        visit.status == VisitStatus.completed -> {
            primary = BottomActionConfig(
                label = "Edit note",
                onClick = { onNavigateToDictation(visitId, false, null) },
                icon = Icons.Default.Mic,
                enabled = true,
            )
            secondary = null
        }
        else -> return
    }

    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .imePadding(),
        color = MaterialTheme.colorScheme.surface,
        tonalElevation = 0.dp,
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .border(1.dp, Line, RoundedCornerShape(0.dp))
                .navigationBarsPadding()
                .padding(horizontal = 20.dp, vertical = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (secondary != null) {
                OutlinedButton(
                    onClick = secondary.onClick,
                    modifier = Modifier.weight(1f),
                    enabled = secondary.enabled,
                    shape = RoundedCornerShape(12.dp),
                    contentPadding = PaddingValues(vertical = 14.dp),
                ) {
                    if (secondary.icon != null) {
                        Icon(secondary.icon, contentDescription = null)
                        Spacer(Modifier.width(8.dp))
                    }
                    Text(secondary.label, fontWeight = FontWeight.SemiBold)
                }
            }
            Button(
                onClick = primary.onClick,
                modifier = Modifier.weight(1f),
                enabled = primary.enabled,
                colors = ButtonDefaults.buttonColors(
                    containerColor = if (primary.enabled) Cobalt else Line,
                    disabledContainerColor = Line,
                    disabledContentColor = MaterialTheme.colorScheme.onSurfaceVariant,
                ),
                shape = RoundedCornerShape(12.dp),
                contentPadding = PaddingValues(vertical = 14.dp),
            ) {
                if (primary.icon != null) {
                    Icon(primary.icon, contentDescription = null)
                    Spacer(Modifier.width(8.dp))
                }
                Text(primary.label, fontWeight = FontWeight.SemiBold)
            }
        }
    }
}

private data class BottomActionConfig(
    val label: String,
    val onClick: () -> Unit,
    val icon: androidx.compose.ui.graphics.vector.ImageVector?,
    val enabled: Boolean,
)

private fun hasAnyReading(v: PatientVitals): Boolean {
    return v.tempC != null || v.bpSystolic != null || v.bpDiastolic != null ||
        v.pulseBpm != null || v.respRate != null || v.spo2Pct != null ||
        v.weightKg != null || v.heightCm != null || v.muacCm != null
}

private fun formatDecimal(v: Double): String {
    return if (v == v.toInt().toDouble()) v.toInt().toString() else "%.1f".format(v)
}

private fun formatAgeFromDob(isoDate: String): String? {
    return try {
        val dob = LocalDate.parse(isoDate)
        val today = LocalDate.now()
        val period = java.time.Period.between(dob, today)
        when {
            period.years > 0 -> "${period.years}y"
            period.months > 0 -> "${period.months}m"
            else -> "${period.days}d"
        }
    } catch (_: Exception) {
        null
    }
}
