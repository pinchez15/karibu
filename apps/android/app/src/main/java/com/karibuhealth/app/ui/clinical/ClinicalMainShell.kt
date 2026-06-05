package com.karibuhealth.app.ui.clinical

import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.Assignment
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
import com.karibuhealth.app.ui.home.MainShell
import com.karibuhealth.app.ui.orders.OrdersScreen

enum class ClinicalTab { Patients, Orders }

@Composable
fun ClinicalMainShell(
    onNavigateToQueue: () -> Unit,
    onNavigateToNewVisit: () -> Unit,
    onNavigateToVisitDetails: (String) -> Unit,
    onNavigateToPatient: (String) -> Unit,
    onNavigateToWorklists: () -> Unit,
    onNavigateToBilling: () -> Unit,
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
                    selected = tab == ClinicalTab.Orders.ordinal,
                    onClick = { tab = ClinicalTab.Orders.ordinal },
                    icon = { Icon(Icons.Default.Assignment, contentDescription = null) },
                    label = { Text("Orders") },
                )
            }
        },
    ) { padding ->
        when (tab) {
            ClinicalTab.Orders.ordinal -> OrdersScreen(
                onOpenVisit = onNavigateToVisitDetails,
                onOpenPatient = onNavigateToPatient,
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
