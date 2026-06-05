package com.karibuhealth.app.ui.home

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.PrimaryTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import com.karibuhealth.app.ui.adaptive.KaribuListDetailScaffold
import com.karibuhealth.app.ui.adaptive.ListDetailEmptyPlaceholder
import com.karibuhealth.app.ui.adaptive.supportsListDetail
import com.karibuhealth.app.ui.inpatient.InpatientHomeScreen
import com.karibuhealth.app.ui.patientdetail.PatientTimelineScreen

enum class ClinicianHomeTab { OPD, Inpatient }

/**
 * Top-level clinician shell: OPD patient list vs inpatient admissions.
 * Lab/pharmacy role homes bypass this and render their own screens.
 */
@Composable
fun MainShell(
    onNavigateToQueue: () -> Unit,
    onNavigateToNewVisit: () -> Unit,
    onNavigateToVisitDetails: (String) -> Unit,
    onNavigateToPatient: (String) -> Unit,
    onNavigateToWorklists: () -> Unit,
    onNavigateToBilling: () -> Unit,
    onAddPatientNote: (String) -> Unit = {},
    onRecordPatientVitals: (String) -> Unit = {},
    onNavigateToReferral: (String) -> Unit = {},
    onNavigateToDictation: (String) -> Unit = {},
    showShellAppBar: Boolean = true,
    modifier: Modifier = Modifier,
) {
    var selectedTab by rememberSaveable { mutableIntStateOf(ClinicianHomeTab.OPD.ordinal) }
    var selectedPatientId by rememberSaveable { mutableStateOf<String?>(null) }
    val listDetail = supportsListDetail()

    Column(modifier = modifier.fillMaxSize()) {
        PrimaryTabRow(
            selectedTabIndex = selectedTab,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Tab(
                selected = selectedTab == ClinicianHomeTab.OPD.ordinal,
                onClick = { selectedTab = ClinicianHomeTab.OPD.ordinal },
                text = { Text("OPD", fontWeight = FontWeight.SemiBold) },
            )
            Tab(
                selected = selectedTab == ClinicianHomeTab.Inpatient.ordinal,
                onClick = { selectedTab = ClinicianHomeTab.Inpatient.ordinal },
                text = { Text("Inpatient", fontWeight = FontWeight.SemiBold) },
            )
        }

        when (selectedTab) {
            ClinicianHomeTab.OPD.ordinal -> {
                val homeScreen: @Composable (Modifier) -> Unit = { homeModifier ->
                    HomeScreen(
                        onNavigateToQueue = onNavigateToQueue,
                        onNavigateToNewVisit = onNavigateToNewVisit,
                        onNavigateToVisitDetails = onNavigateToVisitDetails,
                        onNavigateToPatient = onNavigateToPatient,
                        onNavigateToWorklists = onNavigateToWorklists,
                        onNavigateToBilling = onNavigateToBilling,
                        showAppBar = showShellAppBar,
                        selectedPatientId = if (listDetail) selectedPatientId else null,
                        onSelectPatient = { patientId ->
                            if (listDetail) {
                                selectedPatientId = patientId
                            } else {
                                onNavigateToPatient(patientId)
                            }
                        },
                        modifier = homeModifier,
                    )
                }

                if (listDetail) {
                    KaribuListDetailScaffold(
                        listContent = { homeScreen(Modifier.fillMaxSize()) },
                        showDetail = selectedPatientId != null,
                        emptyDetail = {
                            ListDetailEmptyPlaceholder(
                                title = "Select a patient",
                                subtitle = "Tap a patient in today's list or search results to open their chart.",
                            )
                        },
                        detailContent = {
                            val patientId = selectedPatientId ?: return@KaribuListDetailScaffold
                            PatientTimelineScreen(
                                patientId = patientId,
                                embedInPane = true,
                                onNavigateBack = { selectedPatientId = null },
                                onNavigateToVisit = onNavigateToVisitDetails,
                                onAddNote = onAddPatientNote,
                                onRecordVitals = onRecordPatientVitals,
                                onNavigateToBilling = onNavigateToBilling,
                                onNavigateToReferral = onNavigateToReferral,
                                onNavigateToDictation = onNavigateToDictation,
                            )
                        },
                        modifier = Modifier.fillMaxSize(),
                    )
                } else {
                    homeScreen(Modifier.fillMaxSize())
                }
            }
            else -> InpatientHomeScreen(
                onNavigateToPatient = onNavigateToPatient,
                modifier = Modifier.fillMaxSize(),
            )
        }
    }
}
