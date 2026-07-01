package com.karibuhealth.app.ui.clinical

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Assignment
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.ChildCare
import androidx.compose.material.icons.filled.LocalHotel
import androidx.compose.material.icons.filled.Medication
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.Science
import androidx.compose.material.icons.outlined.MonitorHeart
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
import com.karibuhealth.app.domain.model.StaffRole
import com.karibuhealth.app.ui.adaptive.ClinicalShellAppBar
import com.karibuhealth.app.ui.adaptive.usesNavigationRail
import com.karibuhealth.app.ui.anc.AncRegistryScreen
import com.karibuhealth.app.ui.hivtb.HivTbRegistryScreen
import com.karibuhealth.app.ui.calendar.CalendarScreen
import com.karibuhealth.app.ui.home.HomeViewModel
import com.karibuhealth.app.ui.home.OpdTodayPane
import com.karibuhealth.app.ui.inpatient.WardCensusScreen
import com.karibuhealth.app.ui.lab.LabHomeScreen
import com.karibuhealth.app.ui.orders.OrdersScreen
import com.karibuhealth.app.ui.pharmacy.PharmacyHomeScreen

/**
 * Clinician phone/tablet shell — **one** navigation zone (bottom bar or rail).
 *
 * Calendar is the shared homepage for every role. Patients (OPD today + search),
 * Ward / Lab / Pharmacy / Orders / ANC / HIV-TB tabs vary by staff role.
 */
enum class ShellTab {
    Calendar,
    Patients,
    Ward,
    Orders,
    Anc,
    HivTb,
    Lab,
    Pharmacy,
}

private fun shellTabsFor(role: StaffRole?): List<ShellTab> = when (role) {
    StaffRole.lab_tech -> listOf(ShellTab.Calendar, ShellTab.Lab, ShellTab.Orders)
    StaffRole.dispenser -> listOf(ShellTab.Calendar, ShellTab.Pharmacy, ShellTab.Orders)
    else -> listOf(
        ShellTab.Calendar,
        ShellTab.Patients,
        ShellTab.Ward,
        ShellTab.Orders,
        ShellTab.Anc,
        ShellTab.HivTb,
    )
}

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
    onNavigateToRecordHts: () -> Unit = {},
    onNavigateToRecordHivCare: () -> Unit = {},
    onNavigateToRecordTb: () -> Unit = {},
    onNavigateToHivCare: (String) -> Unit = {},
    onNavigateToTbEpisode: (String) -> Unit = {},
    onAddPatientNote: (String) -> Unit = {},
    onRecordPatientVitals: (String) -> Unit = {},
    onNavigateToReferral: (String) -> Unit = {},
    onNavigateToDictation: (String, Boolean) -> Unit = { _, _ -> },
    onNavigateToReview: (String) -> Unit = {},
    onNavigateToWorklists: () -> Unit = {},
    onNavigateToStock: () -> Unit = {},
    modifier: Modifier = Modifier,
    homeViewModel: HomeViewModel = hiltViewModel(),
) {
    val homeUiState by homeViewModel.uiState.collectAsState()
    val tabs = shellTabsFor(homeUiState.staff?.role)
    var tabIndex by rememberSaveable { mutableIntStateOf(0) }
    if (tabIndex >= tabs.size) tabIndex = 0
    val tab = tabs[tabIndex]
    var profileMenuOpen by rememberSaveable { mutableStateOf(false) }
    val useRail = usesNavigationRail()

    val tabContent: @Composable (Modifier) -> Unit = { contentModifier ->
        when (tab) {
            ShellTab.Calendar -> CalendarScreen(
                embedded = true,
                onNavigateToNewVisit = onNavigateToNewVisit,
                onOpenPatient = onNavigateToPatient,
                modifier = contentModifier.fillMaxSize(),
            )
            ShellTab.Patients -> OpdTodayPane(
                onNavigateToQueue = onNavigateToQueue,
                onNavigateToNewVisit = onNavigateToNewVisit,
                onNavigateToVisitDetails = onNavigateToVisitDetails,
                onNavigateToPatient = onNavigateToPatient,
                onNavigateToBilling = onNavigateToBilling,
                onAddPatientNote = onAddPatientNote,
                onRecordPatientVitals = onRecordPatientVitals,
                onNavigateToReferral = onNavigateToReferral,
                onNavigateToDictation = onNavigateToDictation,
                modifier = contentModifier.fillMaxSize(),
            )
            ShellTab.Orders -> OrdersScreen(
                onOpenVisit = onNavigateToVisitDetails,
                onOpenPatient = onNavigateToPatient,
                onAddPatientNote = onAddPatientNote,
                onRecordPatientVitals = onRecordPatientVitals,
                onNavigateToReferral = onNavigateToReferral,
                onNavigateToDictation = onNavigateToDictation,
                onNavigateToReview = onNavigateToReview,
                modifier = contentModifier.fillMaxSize(),
            )
            ShellTab.Ward -> WardCensusScreen(
                embedded = true,
                onNavigateBack = { tabIndex = 0 },
                onAdmit = onNavigateToAdmit,
                onOpenAdmission = onNavigateToAdmissionChart,
                onHandover = onNavigateToHandover,
                modifier = contentModifier.fillMaxSize(),
            )
            ShellTab.Anc -> AncRegistryScreen(
                embedded = true,
                onNavigateBack = { tabIndex = 0 },
                onRegister = onNavigateToAncRegister,
                onOpenPregnancy = onNavigateToPregnancy,
                modifier = contentModifier.fillMaxSize(),
            )
            ShellTab.HivTb -> HivTbRegistryScreen(
                embedded = true,
                onNavigateBack = { tabIndex = 0 },
                onRecordHts = onNavigateToRecordHts,
                onRecordHivCare = onNavigateToRecordHivCare,
                onRecordTb = onNavigateToRecordTb,
                onOpenHivCare = onNavigateToHivCare,
                onOpenTbEpisode = onNavigateToTbEpisode,
                modifier = contentModifier.fillMaxSize(),
            )
            ShellTab.Lab -> Box(modifier = contentModifier.fillMaxSize()) {
                LabHomeScreen(onNavigateToVisit = onNavigateToVisitDetails)
            }
            ShellTab.Pharmacy -> Box(modifier = contentModifier.fillMaxSize()) {
                PharmacyHomeScreen(
                    onNavigateToVisit = onNavigateToVisitDetails,
                    onNavigateToBilling = onNavigateToBilling,
                )
            }
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
                onOpenWorklists = when (homeUiState.staff?.role) {
                    StaffRole.lab_tech, StaffRole.dispenser -> null
                    else -> onNavigateToWorklists
                },
                onOpenBilling = onNavigateToBilling,
                onOpenStock = onNavigateToStock,
            )
            tabContent(Modifier.weight(1f))
        }
    }

    if (useRail) {
        Row(modifier = modifier.fillMaxSize()) {
            NavigationRail {
                tabs.forEachIndexed { index, shellTab ->
                    NavigationRailItem(
                        selected = tabIndex == index,
                        onClick = { tabIndex = index },
                        icon = { Icon(shellTab.icon(), contentDescription = shellTab.label()) },
                        label = { Text(shellTab.label()) },
                    )
                }
            }
            shellChrome(Modifier.weight(1f).fillMaxHeight())
        }
    } else {
        Scaffold(
            modifier = modifier,
            contentWindowInsets = androidx.compose.foundation.layout.WindowInsets(0, 0, 0, 0),
            bottomBar = {
                NavigationBar {
                    tabs.forEachIndexed { index, shellTab ->
                        NavigationBarItem(
                            selected = tabIndex == index,
                            onClick = { tabIndex = index },
                            icon = { Icon(shellTab.icon(), contentDescription = shellTab.label()) },
                            label = { Text(shellTab.label()) },
                        )
                    }
                }
            },
        ) { padding ->
            shellChrome(Modifier.padding(padding))
        }
    }
}

@Composable
private fun ShellTab.icon() = when (this) {
    ShellTab.Calendar -> Icons.Default.CalendarMonth
    ShellTab.Patients -> Icons.Default.People
    ShellTab.Ward -> Icons.Default.LocalHotel
    ShellTab.Orders -> Icons.AutoMirrored.Filled.Assignment
    ShellTab.Anc -> Icons.Default.ChildCare
    ShellTab.HivTb -> Icons.Outlined.MonitorHeart
    ShellTab.Lab -> Icons.Default.Science
    ShellTab.Pharmacy -> Icons.Default.Medication
}

private fun ShellTab.label() = when (this) {
    ShellTab.Calendar -> "Calendar"
    ShellTab.Patients -> "Patients"
    ShellTab.Ward -> "Ward"
    ShellTab.Orders -> "Orders"
    ShellTab.Anc -> "ANC"
    ShellTab.HivTb -> "HIV/TB"
    ShellTab.Lab -> "Lab"
    ShellTab.Pharmacy -> "Pharmacy"
}
