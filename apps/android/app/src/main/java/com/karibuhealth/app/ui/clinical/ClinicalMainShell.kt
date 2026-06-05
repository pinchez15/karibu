package com.karibuhealth.app.ui.clinical

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.Assignment
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationRail
import androidx.compose.material3.NavigationRailItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import com.karibuhealth.app.ui.adaptive.ClinicalShellAppBar
import com.karibuhealth.app.ui.adaptive.usesNavigationRail
import com.karibuhealth.app.ui.home.HomeViewModel
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
    onAddPatientNote: (String) -> Unit = {},
    onRecordPatientVitals: (String) -> Unit = {},
    onNavigateToReferral: (String) -> Unit = {},
    onNavigateToDictation: (String, Boolean) -> Unit = { _, _ -> },
    onNavigateToReview: (String) -> Unit = {},
    modifier: Modifier = Modifier,
    homeViewModel: HomeViewModel = hiltViewModel(),
) {
    var tab by rememberSaveable { mutableIntStateOf(ClinicalTab.Patients.ordinal) }
    var profileMenuOpen by rememberSaveable { mutableStateOf(false) }
    val homeUiState by homeViewModel.uiState.collectAsState()
    val useRail = usesNavigationRail()

    val shellContent: @Composable (Modifier) -> Unit = { contentModifier ->
        Column(modifier = contentModifier.fillMaxSize()) {
            if (useRail) {
                ClinicalShellAppBar(
                    clinicName = homeUiState.clinic?.name,
                    staff = homeUiState.staff,
                    profileMenuOpen = profileMenuOpen,
                    onAvatarClick = { profileMenuOpen = true },
                    onDismissMenu = { profileMenuOpen = false },
                    onSignOut = {
                        profileMenuOpen = false
                        homeViewModel.signOut()
                    },
                    onOpenWorklists = onNavigateToWorklists,
                    onOpenBilling = onNavigateToBilling,
                )
            }
            when (tab) {
                ClinicalTab.Orders.ordinal -> OrdersScreen(
                    onOpenVisit = onNavigateToVisitDetails,
                    onOpenPatient = onNavigateToPatient,
                    onAddPatientNote = onAddPatientNote,
                    onRecordPatientVitals = onRecordPatientVitals,
                    onNavigateToReferral = onNavigateToReferral,
                    onNavigateToDictation = onNavigateToDictation,
                    onNavigateToReview = onNavigateToReview,
                    modifier = Modifier.fillMaxSize(),
                )
                else -> MainShell(
                    onNavigateToQueue = onNavigateToQueue,
                    onNavigateToNewVisit = onNavigateToNewVisit,
                    onNavigateToVisitDetails = onNavigateToVisitDetails,
                    onNavigateToPatient = onNavigateToPatient,
                    onNavigateToWorklists = onNavigateToWorklists,
                    onNavigateToBilling = onNavigateToBilling,
                    onAddPatientNote = onAddPatientNote,
                    onRecordPatientVitals = onRecordPatientVitals,
                    onNavigateToReferral = onNavigateToReferral,
                    onNavigateToDictation = { visitId ->
                        onNavigateToDictation(visitId, false)
                    },
                    showShellAppBar = !useRail,
                    modifier = Modifier.fillMaxSize(),
                )
            }
        }
    }

    if (useRail) {
        Row(modifier = modifier.fillMaxSize()) {
            NavigationRail {
                NavigationRailItem(
                    selected = tab == ClinicalTab.Patients.ordinal,
                    onClick = { tab = ClinicalTab.Patients.ordinal },
                    icon = { Icon(Icons.AutoMirrored.Filled.List, contentDescription = "Patients") },
                    label = { Text("Patients") },
                )
                NavigationRailItem(
                    selected = tab == ClinicalTab.Orders.ordinal,
                    onClick = { tab = ClinicalTab.Orders.ordinal },
                    icon = { Icon(Icons.Default.Assignment, contentDescription = "Orders") },
                    label = { Text("Orders") },
                )
            }
            shellContent(Modifier.weight(1f).fillMaxHeight())
        }
    } else {
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
            shellContent(Modifier.padding(padding))
        }
    }
}
