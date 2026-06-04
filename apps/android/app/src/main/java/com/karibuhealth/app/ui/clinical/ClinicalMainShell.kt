package com.karibuhealth.app.ui.clinical

import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.MenuBook
import androidx.compose.material.icons.filled.Psychology
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import com.karibuhealth.app.ui.consult.ConsultListScreen
import com.karibuhealth.app.ui.home.MainShell

enum class ClinicalTab { Patients, Learn, Consult }

@Composable
fun ClinicalMainShell(
    onNavigateToQueue: () -> Unit,
    onNavigateToNewVisit: () -> Unit,
    onNavigateToVisitDetails: (String) -> Unit,
    onNavigateToPatient: (String) -> Unit,
    onNavigateToWorklists: () -> Unit,
    onNavigateToBilling: () -> Unit,
    onNavigateToConsultChat: (String) -> Unit,
    onOpenLearn: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var tab by rememberSaveable { mutableIntStateOf(ClinicalTab.Patients.ordinal) }

    Scaffold(
        modifier = modifier,
        contentWindowInsets = androidx.compose.foundation.layout.WindowInsets(0, 0, 0, 0),
        bottomBar = {
            NavigationBar {
                NavigationBarItem(
                    selected = tab == ClinicalTab.Patients.ordinal,
                    onClick = { tab = ClinicalTab.Patients.ordinal },
                    icon = { Icon(Icons.AutoMirrored.Filled.List, contentDescription = null) },
                    label = { Text("Patients") },
                )
                NavigationBarItem(
                    // Learn launches the standalone KaribuLearn app full-screen
                    // (its own coral chrome), so it acts as a launcher rather
                    // than swapping content under the EHR's bottom bar.
                    selected = false,
                    onClick = onOpenLearn,
                    icon = { Icon(Icons.Default.MenuBook, contentDescription = null) },
                    label = { Text("Learn") },
                )
                NavigationBarItem(
                    selected = tab == ClinicalTab.Consult.ordinal,
                    onClick = { tab = ClinicalTab.Consult.ordinal },
                    icon = { Icon(Icons.Default.Psychology, contentDescription = null) },
                    label = { Text("Consult") },
                )
            }
        },
    ) { padding ->
        when (tab) {
            ClinicalTab.Consult.ordinal -> ConsultListScreen(
                onOpenVisitConsult = onNavigateToConsultChat,
                modifier = Modifier.padding(padding),
            )
            else -> MainShell(
                onNavigateToQueue = onNavigateToQueue,
                onNavigateToNewVisit = onNavigateToNewVisit,
                onNavigateToVisitDetails = onNavigateToVisitDetails,
                onNavigateToPatient = onNavigateToPatient,
                onNavigateToWorklists = onNavigateToWorklists,
                onNavigateToBilling = onNavigateToBilling,
                modifier = Modifier.padding(padding),
            )
        }
    }
}
