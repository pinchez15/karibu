package com.karibuhealth.app.ui.visitdetails

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
    onNavigateToDictation: (String, Boolean) -> Unit,
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
                        color = Ink,
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
                    .padding(horizontal = 20.dp, vertical = 12.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                // Patient card with inline vital chips
                uiState.patient?.let { patient ->
                    PatientCard(
                        name = listOfNotNull(patient.firstName, patient.lastName)
                            .joinToString(" ")
                            .ifBlank { patient.displayName ?: "Unknown" },
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

                // AI structured note card with shimmer
                uiState.visit?.let { visit ->
                    AiNoteCard(
                        visit = visit,
                        transcript = uiState.providerNote?.transcript,
                        structured = AiStructuredSuggestions.parseOrNull(uiState.providerNote?.structuredData),
                        noteContent = uiState.providerNote?.noteContent,
                    )
                }

                // HMIS codes — only render once AI has produced suggestions.
                AiStructuredSuggestions.parseOrNull(uiState.providerNote?.structuredData)
                    ?.takeIf { it.diagnoses.any { d -> !d.icd10.isNullOrBlank() } }
                    ?.let { suggestions ->
                        HmisCodesCard(suggestions = suggestions)
                    }

                // Care delivered — lab + pharmacy outcomes (read-only).
                // Renders only when there's something to show: tests ordered,
                // a lab result, medications, or a dispensing decision.
                uiState.visit?.let { visit ->
                    val hasLab =
                        !visit.testsOrdered.isNullOrBlank() || !visit.labResults.isNullOrBlank()
                    val hasPharmacy =
                        !visit.medications.isNullOrBlank() || visit.dispensingStatus != "not_started"
                    if (hasLab || hasPharmacy) {
                        CareDeliveredCard(visit = visit)
                    }
                }

                // Sync card — only when there are actually pending syncs.
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
                        color = Ink,
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
                    KhAccentPill(
                        label = complaint.take(20).let { if (complaint.length > 20) "$it…" else it },
                        fg = Amber,
                        bg = AmberSoft,
                        paddingValues = PaddingValues(horizontal = 12.dp, vertical = 4.dp),
                    )
                }
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
                            valueColor = if (it >= 38.0) Amber else Ink,
                        )
                    }
                    if (vitals.bpSystolic != null && vitals.bpDiastolic != null) {
                        val high = (vitals.bpSystolic >= 140) || (vitals.bpDiastolic >= 90)
                        KhVitalChip(
                            label = "BP",
                            value = "${vitals.bpSystolic}/${vitals.bpDiastolic}",
                            valueColor = if (high) Amber else Ink,
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
                            valueColor = if (it < 94) Amber else Ink,
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
private fun AiNoteCard(
    visit: Visit,
    transcript: String?,
    structured: AiStructuredSuggestions?,
    noteContent: String?,
) {
    val isStreaming = visit.status == VisitStatus.pending && visit.documentationComplete
    val isPending = visit.status == VisitStatus.pending && !visit.documentationComplete
    val isError = visit.status == VisitStatus.error
    val isReady = visit.status == VisitStatus.review || visit.status == VisitStatus.sent

    val borderColor = when {
        isStreaming -> Amber
        isError -> MaterialTheme.colorScheme.error
        else -> Line
    }
    val borderWidth = if (isStreaming) 1.5.dp else 1.dp

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(MaterialTheme.colorScheme.surface)
            .border(borderWidth, borderColor, RoundedCornerShape(14.dp))
            .padding(16.dp),
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
                    text = "SOAP note",
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = Ink,
                )
                if (isStreaming) {
                    Spacer(Modifier.weight(1f))
                    Pulses(color = Amber)
                }
            }

            Spacer(Modifier.height(12.dp))

            when {
                isPending -> {
                    Text(
                        text = "Awaiting dictation. Tap the mic below to start.",
                        style = MaterialTheme.typography.bodySmall,
                        color = Muted,
                    )
                }
                isStreaming -> {
                    SoapSection(label = "SUBJECTIVE", body = "Awaiting structure…", streaming = true)
                    SoapSection(label = "OBJECTIVE", body = "Awaiting structure…", streaming = true)
                    SoapSection(label = "ASSESSMENT", body = "Awaiting structure…", streaming = true)
                    SoapSection(label = "PLAN", body = "Awaiting structure…", streaming = true)
                }
                isError -> {
                    Text(
                        text = "AI structuring failed. Edit the note and retry, or proceed without structuring.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error,
                    )
                    Spacer(Modifier.height(8.dp))
                    transcript?.takeIf { it.isNotBlank() }?.let {
                        SoapSection(label = "RAW", body = it, streaming = false)
                    }
                }
                isReady -> {
                    val sections = parseSoap(noteContent, structured, transcript)
                    sections.forEach { (label, body) ->
                        SoapSection(label = label, body = body, streaming = false)
                    }
                }
            }
        }
    }
}

@Composable
private fun SoapSection(
    label: String,
    body: String,
    streaming: Boolean,
) {
    Column(modifier = Modifier.padding(bottom = 14.dp)) {
        KhMetaText(
            text = label,
            color = if (streaming) Amber else Muted,
        )
        Spacer(Modifier.height(4.dp))
        Text(
            text = body,
            style = MaterialTheme.typography.bodyMedium,
            color = if (streaming) Muted else Ink,
            modifier = Modifier.alpha(if (streaming) 0.6f else 1f),
        )
    }
}

@Composable
private fun Pulses(color: Color) {
    val transition = rememberInfiniteTransition(label = "pulses")
    val phase by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1200),
            repeatMode = RepeatMode.Restart,
        ),
        label = "pulse-phase",
    )
    Row {
        repeat(3) { i ->
            val offset = (i * 0.15f)
            val a = ((kotlin.math.sin((phase + offset) * 2 * Math.PI) + 1) / 2).coerceIn(0.3, 1.0)
            Box(
                modifier = Modifier
                    .size(4.dp)
                    .clip(CircleShape)
                    .background(color)
                    .alpha(a.toFloat()),
            )
            if (i < 2) Spacer(Modifier.width(3.dp))
        }
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
                        color = Ink,
                    )
                    Spacer(Modifier.width(8.dp))
                    DispensingPill(status = visit.dispensingStatus)
                }
                if (!visit.medications.isNullOrBlank()) {
                    Spacer(Modifier.height(2.dp))
                    Text(
                        text = visit.medications,
                        style = MaterialTheme.typography.bodyMedium,
                        color = Ink,
                    )
                }
                if (!visit.dispenseNotes.isNullOrBlank()) {
                    Spacer(Modifier.height(4.dp))
                    Text(
                        text = "Dispenser note: ${visit.dispenseNotes}",
                        style = MaterialTheme.typography.bodySmall,
                        color = Muted,
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
                        color = Ink,
                    )
                    Spacer(Modifier.width(8.dp))
                    LabPill(status = visit.labStatus, abnormal = visit.labAbnormal)
                }
                if (!visit.testsOrdered.isNullOrBlank()) {
                    Spacer(Modifier.height(2.dp))
                    Text(
                        text = visit.testsOrdered,
                        style = MaterialTheme.typography.bodyMedium,
                        color = Ink,
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
                                color = if (visit.labAbnormal) Amber else Muted,
                            )
                            Spacer(Modifier.height(2.dp))
                            Text(
                                text = visit.labResults,
                                style = MaterialTheme.typography.bodyMedium,
                                color = Ink,
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
        else -> Triple("Pending", Muted, com.karibuhealth.app.ui.theme.LineSoft)
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
        "pending" -> Triple("Pending", Muted, com.karibuhealth.app.ui.theme.LineSoft)
        else -> Triple("—", Muted, com.karibuhealth.app.ui.theme.LineSoft)
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
            color = Ink,
            modifier = Modifier.weight(1f),
        )
        KhMetaText(
            text = confidence.uppercase(),
            color = when (confidence.lowercase()) {
                "high" -> Green
                "medium" -> Cobalt
                else -> Muted
            },
        )
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
                color = Body,
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

@Composable
private fun VisitDetailsBottomAction(
    visit: Visit,
    visitId: String,
    hasLocalDraft: Boolean,
    onNavigateToDictation: (String, Boolean) -> Unit,
    onNavigateToReview: (String) -> Unit,
    onNavigateToPayment: (String) -> Unit,
) {
    val docComplete = visit.documentationComplete

    val (label, action, icon, enabled) = when {
        visit.status == VisitStatus.pending && !docComplete -> {
            BottomActionConfig(
                label = if (hasLocalDraft) "Continue note" else "Write note",
                onClick = { onNavigateToDictation(visitId, false) },
                icon = Icons.Default.Mic,
                enabled = true,
            )
        }
        visit.status == VisitStatus.sent -> {
            BottomActionConfig(
                label = "Approve and proceed to payment",
                onClick = { onNavigateToPayment(visitId) },
                icon = null,
                enabled = true,
            )
        }
        visit.status == VisitStatus.pending && docComplete -> {
            BottomActionConfig(
                label = "Wait for structure…",
                onClick = {},
                icon = null,
                enabled = false,
            )
        }
        visit.status == VisitStatus.review -> {
            BottomActionConfig(
                label = "Review notes",
                onClick = { onNavigateToReview(visitId) },
                icon = Icons.Default.RateReview,
                enabled = true,
            )
        }
        visit.status == VisitStatus.error -> {
            BottomActionConfig(
                label = "Edit and retry",
                onClick = { onNavigateToDictation(visitId, false) },
                icon = Icons.Default.Mic,
                enabled = true,
            )
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
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .border(1.dp, Line, RoundedCornerShape(0.dp))
                .navigationBarsPadding()
                .padding(horizontal = 20.dp, vertical = 16.dp),
        ) {
            Button(
                onClick = action,
                modifier = Modifier.fillMaxWidth(),
                enabled = enabled,
                colors = ButtonDefaults.buttonColors(
                    containerColor = if (enabled) Cobalt else Line,
                    disabledContainerColor = Line,
                    disabledContentColor = Muted,
                ),
                shape = RoundedCornerShape(12.dp),
                contentPadding = PaddingValues(vertical = 14.dp),
            ) {
                if (icon != null) {
                    Icon(icon, contentDescription = null)
                    Spacer(Modifier.width(8.dp))
                }
                Text(label, fontWeight = FontWeight.SemiBold)
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

/**
 * Render the AI note as ordered SOAP sections. Falls back to the raw transcript
 * (or a single block of note_content) when the structured payload is missing.
 */
private fun parseSoap(
    noteContent: String?,
    structured: AiStructuredSuggestions?,
    transcript: String?,
): List<Pair<String, String>> {
    val sections = mutableListOf<Pair<String, String>>()

    // Try to split the noteContent into SOAP sections by header keywords.
    if (!noteContent.isNullOrBlank()) {
        val parts = splitSoap(noteContent)
        if (parts.isNotEmpty()) return parts
        return listOf("NOTE" to noteContent)
    }

    if (structured != null && structured.diagnoses.isNotEmpty()) {
        val assessment = structured.diagnoses.joinToString(", ") { d ->
            listOfNotNull(d.name.takeIf { it.isNotBlank() }, d.icd10).joinToString(" · ")
        }
        sections += "ASSESSMENT" to assessment
        if (structured.medications.isNotEmpty()) {
            val plan = structured.medications.joinToString("; ") { m ->
                listOfNotNull(
                    m.name.takeIf { it.isNotBlank() },
                    m.dosage.takeIf { it.isNotBlank() },
                    m.duration.takeIf { it.isNotBlank() },
                ).joinToString(" ")
            }
            sections += "PLAN" to plan
        }
    }

    if (sections.isEmpty() && !transcript.isNullOrBlank()) {
        sections += "NOTE" to transcript
    }

    return sections
}

private fun splitSoap(text: String): List<Pair<String, String>> {
    val markers = listOf("SUBJECTIVE", "OBJECTIVE", "ASSESSMENT", "PLAN")
    val regex = Regex("(?im)^\\s*(${markers.joinToString("|")})\\s*:?\\s*$")
    val matches = regex.findAll(text).toList()
    if (matches.isEmpty()) return emptyList()

    val out = mutableListOf<Pair<String, String>>()
    matches.forEachIndexed { i, m ->
        val start = m.range.last + 1
        val end = if (i + 1 < matches.size) matches[i + 1].range.first else text.length
        val body = text.substring(start, end).trim()
        if (body.isNotEmpty()) out += m.groupValues[1].uppercase() to body
    }
    return out
}

