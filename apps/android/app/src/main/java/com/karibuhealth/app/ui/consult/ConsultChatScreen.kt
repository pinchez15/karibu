package com.karibuhealth.app.ui.consult

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ConsultChatScreen(
    visitId: String,
    onNavigateBack: () -> Unit,
    viewModel: ConsultChatViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()
    var confirmedDeidentified by remember { mutableStateOf(false) }
    androidx.compose.runtime.LaunchedEffect(visitId) { viewModel.loadThread(visitId) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Case · second opinion") },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(
                "Not a substitute for supervisor review, referral, or emergency care.",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            uiState.error?.let {
                Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }
            LazyColumn(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                items(uiState.messages) { msg ->
                    Column(Modifier.fillMaxWidth().padding(4.dp)) {
                        Text(
                            if (msg.role == "assistant") "Reply" else "You",
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.SemiBold,
                        )
                        Text(msg.content, style = MaterialTheme.typography.bodyMedium)
                    }
                }
            }
            if (!uiState.readOnly) {
                Row(
                    verticalAlignment = androidx.compose.ui.Alignment.CenterVertically,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Checkbox(
                        checked = confirmedDeidentified,
                        onCheckedChange = { confirmedDeidentified = it },
                    )
                    Text(
                        "I confirm my message has no patient names or identifiers",
                        style = MaterialTheme.typography.bodySmall,
                    )
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = uiState.draft,
                        onValueChange = viewModel::updateDraft,
                        modifier = Modifier.weight(1f),
                        placeholder = { Text("Ask about this case…") },
                        enabled = uiState.isOnline && !uiState.isSending && confirmedDeidentified,
                    )
                    TextButton(
                        onClick = viewModel::send,
                        enabled = uiState.isOnline &&
                            !uiState.isSending &&
                            uiState.threadId != null &&
                            confirmedDeidentified &&
                            uiState.draft.isNotBlank(),
                    ) {
                        Text("Send")
                    }
                }
            }
        }
    }
}
