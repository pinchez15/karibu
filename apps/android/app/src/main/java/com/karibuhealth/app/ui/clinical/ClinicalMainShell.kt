package com.karibuhealth.app.ui.clinical

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Assignment
import androidx.compose.material.icons.filled.ChildCare
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.LocalHotel
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
import com.karibuhealth.app.ui.anc.AncRegistryScreen
import com.karibuhealth.app.ui.home.HomeViewModel
import com.karibuhealth.app.ui.home.OpdTodayPane
import com.karibuhealth.app.ui.inpatient.WardCensusScreen
import com.karibuhealth.app.ui.orders.OrdersScreen

/**
 * Clinician phone/tablet shell — **one** navigation zone (bottom bar or rail).
 *
 * Today · Ward · Orders · ANC are peers. The top bar is context only (clinic,
 * staff, sign-out) — not a second nav layer.
 */
enum class ClinicalTab { Today, Ward, Orders, Anc }

@Composable
fun ClinicalMainShell(
    onNavigateToQueue: () -> Unit,
    onNavigateToNewVisit: () -> Unit,
    onNavigateToVisitDetails: (String) -> Unit,
    onNavigateToPatient: (String) -> Unit,
    onNavigateToBilling: () -> Unit,
    onNavigateToAdmit: () -> Unit = {},
    onNavigateToAdmissionChart: (String) -> Unit = {},
    onNavigateToHandover: () -> Unit = {},
    onNavigateToAncRegister: () -> Unit = {},
    onNavigateToPregnancy: (String) -> Unit = {},
    onAddPatientNote: (String) -> Unit = {},
    onRecordPatientVitals: (String) -> Unit = {},
    onNavigateToReferral: (String) -> Unit = {},
    onNavigateToDictation: (String, Boolean) -> Unit = { _, _ -> },
    onNavigateToReview: (String) -> Unit = {},
    modifier: Modifier = Modifier,
    homeViewModel: HomeViewModel = hiltViewModel(),
) {
    var tab by rememberSaveable { mutableIntStateOf(ClinicalTab.Today.ordinal) }
    var profileMenuOpen by rememberSaveable { mutableStateOf(false) }
    val homeUiState by homeViewModel.uiState.collectAsState()
    val useRail = usesNavigationRail()

    val tabContent: @Composable (Modifier) -> Unit = { contentModifier ->
        when (tab) {
            ClinicalTab.Orders.ordinal -> OrdersScreen(
                onOpenVisit = onNavigateToVisitDetails,
                onOpenPatient = onNavigateToPatient,
                onAddPatientNote = onAddPatientNote,
                onRecordPatientVitals = onRecordPatientVitals,
                onNavigateToReferral = onNavigateToReferral,
                onNavigateToDictation = onNavigateToDictation,
                onNavigateToReview = onNavigateToReview,
                modifier = contentModifier.fillMaxSize(),
            )
            ClinicalTab.Ward.ordinal -> WardCensusScreen(
                embedded = true,
                onNavigateBack = { tab = ClinicalTab.Today.ordinal },
                onAdmit = onNavigateToAdmit,
                onOpenAdmission = onNavigateToAdmissionChart,
                onHandover = onNavigateToHandover,
                modifier = contentModifier.fillMaxSize(),
            )
            ClinicalTab.Anc.ordinal -> AncRegistryScreen(
                embedded = true,
                onNavigateBack = { tab = ClinicalTab.Today.ordinal },
                onRegister = onNavigateToAncRegister,
                onOpenPregnancy = onNavigateToPregnancy,
                modifier = contentModifier.fillMaxSize(),
            )
            else -> OpdTodayPane(
                onNavigateToQueue = onNavigateToQueue,
                onNavigateToNewVisit = onNavigateToNewVisit,
                onNavigateToVisitDetails = onNavigateToVisitDetails,
                onNavigateToPatient = onNavigateToPatient,
                onNavigateToBilling = onNavigateToBilling,
                onAddPatientNote = onAddPatientNote,
                onRecordPatientVitals = onRecordPatientVitals,
                onNavigateToReferral = onNavigateToReferral,
                onNavigateToDictation = { visitId ->
                    onNavigateToDictation(visitId, false)
                },
                modifier = contentModifier.fillMaxSize(),
            )
        }
    }

    val shellChrome: @Composable (Modifier) -> Unit = { chromeModifier ->
        Column(modifier = chromeModifier.fillMaxSize()) {
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
            )
            tabContent(Modifier.weight(1f))
        }
    }

    if (useRail) {
        Row(modifier = modifier.fillMaxSize()) {
            NavigationRail {
                NavigationRailItem(
                    selected = tab == ClinicalTab.Today.ordinal,
                    onClick = { tab = ClinicalTab.Today.ordinal },
                    icon = { Icon(Icons.Default.Home, contentDescription = "Today") },
                    label = { Text("Today") },
                )
                NavigationRailItem(
                    selected = tab == ClinicalTab.Ward.ordinal,
                    onClick = { tab = ClinicalTab.Ward.ordinal },
                    icon = { Icon(Icons.Default.LocalHotel, contentDescription = "Ward") },
                    label = { Text("Ward") },
                )
                NavigationRailItem(
                    selected = tab == ClinicalTab.Orders.ordinal,
                    onClick = { tab = ClinicalTab.Orders.ordinal },
                    icon = { Icon(Icons.AutoMirrored.Filled.Assignment, contentDescription = "Orders") },
                    label = { Text("Orders") },
                )
                NavigationRailItem(
                    selected = tab == ClinicalTab.Anc.ordinal,
                    onClick = { tab = ClinicalTab.Anc.ordinal },
                    icon = { Icon(Icons.Default.ChildCare, contentDescription = "ANC") },
                    label = { Text("ANC") },
                )
            }
            shellChrome(Modifier.weight(1f).fillMaxHeight())
        }
    } else {
        Scaffold(
            modifier = modifier,
            contentWindowInsets = androidx.compose.foundation.layout.WindowInsets(0, 0, 0, 0),
            bottomBar = {
                NavigationBar {
                    NavigationBarItem(
                        selected = tab == ClinicalTab.Today.ordinal,
                        onClick = { tab = ClinicalTab.Today.ordinal },
                        icon = { Icon(Icons.Default.Home, contentDescription = "Today") },
                        label = { Text("Today") },
                    )
                    NavigationBarItem(
                        selected = tab == ClinicalTab.Ward.ordinal,
                        onClick = { tab = ClinicalTab.Ward.ordinal },
                        icon = { Icon(Icons.Default.LocalHotel, contentDescription = "Ward") },
                        label = { Text("Ward") },
                    )
                    NavigationBarItem(
                        selected = tab == ClinicalTab.Orders.ordinal,
                        onClick = { tab = ClinicalTab.Orders.ordinal },
                        icon = { Icon(Icons.AutoMirrored.Filled.Assignment, contentDescription = "Orders") },
                        label = { Text("Orders") },
                    )
                    NavigationBarItem(
                        selected = tab == ClinicalTab.Anc.ordinal,
                        onClick = { tab = ClinicalTab.Anc.ordinal },
                        icon = { Icon(Icons.Default.ChildCare, contentDescription = "ANC") },
                        label = { Text("ANC") },
                    )
                }
            },
        ) { padding ->
            shellChrome(Modifier.padding(padding))
        }
    }
}
