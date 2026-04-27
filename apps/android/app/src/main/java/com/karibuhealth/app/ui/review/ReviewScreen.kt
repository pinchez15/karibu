package com.karibuhealth.app.ui.review

import android.content.Intent
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.core.net.toUri
import androidx.hilt.navigation.compose.hiltViewModel
import com.karibuhealth.app.domain.model.AiDiagnosis
import com.karibuhealth.app.domain.model.AiStructuredSuggestions

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReviewScreen(
    visitId: String,
    onNavigateBack: () -> Unit,
    onApproved: (String) -> Unit,
    onRejected: (String) -> Unit,
    viewModel: ReviewViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()

    LaunchedEffect(visitId) {
        viewModel.loadVisit(visitId)
    }

    // The viewmodel sets these flags after the server confirms the action; we
    // navigate from here (rather than inline at the button) so the user sees
    // the loading spinner long enough to know the request actually happened.
    LaunchedEffect(uiState.approved) {
        if (uiState.approved) onApproved(visitId)
    }
    LaunchedEffect(uiState.rejected) {
        if (uiState.rejected) onRejected(visitId)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Review Notes") },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { innerPadding ->
        if (uiState.isLoading) {
            Box(
                modifier = Modifier.fillMaxSize().padding(innerPadding),
                contentAlignment = androidx.compose.ui.Alignment.Center,
            ) {
                CircularProgressIndicator()
            }
        } else {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding)
                    .verticalScroll(rememberScrollState())
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                // Provider Note
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(
                            "Provider Note (SOAP)",
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Spacer(Modifier.height(8.dp))
                        Text(
                            uiState.providerNote?.noteContent ?: "No note available",
                            style = MaterialTheme.typography.bodyMedium,
                        )
                    }
                }

                // AI suggestions — diagnoses with citations + optional learning
                // note + optional missing-info banner. Renders only when the
                // Inngest pipeline produced something. Never blocks approve /
                // reject — both buttons stay live regardless.
                uiState.suggestions?.takeUnless { it.isEmpty }?.let { suggestions ->
                    AiSuggestionsSection(suggestions)
                }

                // Transcript
                uiState.providerNote?.transcript?.let { transcript ->
                    Card(modifier = Modifier.fillMaxWidth()) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Text(
                                "Transcript",
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.SemiBold,
                            )
                            Spacer(Modifier.height(8.dp))
                            Text(
                                transcript,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }

                // Patient Summary
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(
                            "Patient Summary",
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Spacer(Modifier.height(8.dp))
                        Text(
                            uiState.patientNote?.content ?: "No summary available",
                            style = MaterialTheme.typography.bodyMedium,
                        )
                    }
                }

                uiState.error?.let { error ->
                    Card(
                        colors = CardDefaults.cardColors(
                            containerColor = MaterialTheme.colorScheme.errorContainer,
                        ),
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Row(
                            modifier = Modifier.padding(12.dp),
                            verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
                        ) {
                            Text(
                                text = error,
                                modifier = Modifier.weight(1f),
                                color = MaterialTheme.colorScheme.onErrorContainer,
                                style = MaterialTheme.typography.bodySmall,
                            )
                            TextButton(onClick = { viewModel.dismissError() }) {
                                Text("Dismiss")
                            }
                        }
                    }
                }

                Spacer(Modifier.height(8.dp))

                val isBusy = uiState.isApproving || uiState.isRejecting

                Button(
                    onClick = { viewModel.approveNote(visitId) },
                    modifier = Modifier.fillMaxWidth(),
                    enabled = !isBusy,
                ) {
                    if (uiState.isApproving) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(20.dp),
                            strokeWidth = 2.dp,
                            color = MaterialTheme.colorScheme.onPrimary,
                        )
                    } else {
                        Text("Approve & Continue to Payment")
                    }
                }
                // Reject = AI got it wrong. Server clears the structured note +
                // patient summary, keeps the original transcript so the
                // clinician can edit it on the dictation screen instead of
                // starting over.
                OutlinedButton(
                    onClick = { viewModel.rejectNote(visitId) },
                    modifier = Modifier.fillMaxWidth(),
                    enabled = !isBusy,
                ) {
                    if (uiState.isRejecting) {
                        CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                    } else {
                        Text("Re-dictate (AI got it wrong)")
                    }
                }
            }
        }
    }
}

// Subtle, non-blocking AI suggestions panel. Mirrors the tone of the web
// ReviewQueueClient renderer: diagnoses with citations as tappable links,
// optional "worth a read" learning note, optional "worth confirming"
// missing-info list. Approve / reject are unaffected by anything in here.
@Composable
private fun AiSuggestionsSection(suggestions: AiStructuredSuggestions) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        if (suggestions.diagnoses.isNotEmpty()) {
            Text(
                "AI suggestions",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            suggestions.diagnoses.forEach { dx ->
                DiagnosisCard(dx)
            }
        }

        suggestions.learningNote?.takeIf { it.isNotBlank() }?.let { note ->
            Card(
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.tertiaryContainer,
                ),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Column(modifier = Modifier.padding(12.dp)) {
                    Text(
                        "Worth a read",
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onTertiaryContainer,
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        note,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onTertiaryContainer,
                    )
                }
            }
        }

        if (suggestions.missingInfo.isNotEmpty()) {
            Card(
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.secondaryContainer,
                ),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Column(modifier = Modifier.padding(12.dp)) {
                    Text(
                        "Worth confirming",
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.onSecondaryContainer,
                    )
                    Spacer(Modifier.height(4.dp))
                    suggestions.missingInfo.forEach { item ->
                        Text(
                            "• $item",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSecondaryContainer,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun DiagnosisCard(dx: AiDiagnosis) {
    val context = LocalContext.current
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                Text(
                    dx.name,
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.Medium,
                    modifier = Modifier.weight(1f),
                )
                ConfidenceChip(dx.confidence)
            }
            dx.icd10?.takeIf { it.isNotBlank() }?.let { icd ->
                Text(
                    icd,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (dx.rationale.isNotBlank()) {
                Text(
                    dx.rationale,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (dx.citations.isNotEmpty()) {
                Spacer(Modifier.height(4.dp))
                dx.citations.forEach { citation ->
                    val labelText = if (citation.source.isNotBlank()) {
                        "${citation.title} — ${citation.source}"
                    } else {
                        citation.title
                    }
                    if (citation.url != null) {
                        Text(
                            text = buildAnnotatedString {
                                withStyle(SpanStyle(textDecoration = TextDecoration.Underline)) {
                                    append(labelText)
                                }
                            },
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.clickable {
                                context.startActivity(
                                    Intent(Intent.ACTION_VIEW, citation.url.toUri()),
                                )
                            },
                        )
                    } else {
                        Text(
                            labelText,
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ConfidenceChip(confidence: String) {
    val (label, color) = when (confidence) {
        "high" -> "high" to MaterialTheme.colorScheme.primary
        "medium" -> "medium" to MaterialTheme.colorScheme.tertiary
        else -> "low" to MaterialTheme.colorScheme.outline
    }
    SuggestionChip(
        onClick = {},
        label = { Text(label, style = MaterialTheme.typography.labelSmall) },
        colors = SuggestionChipDefaults.suggestionChipColors(
            containerColor = color.copy(alpha = 0.12f),
            labelColor = color,
        ),
    )
}
