package com.karibuhealth.app.ui.home

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import com.karibuhealth.app.ui.adaptive.KaribuListDetailScaffold
import com.karibuhealth.app.ui.adaptive.ListDetailEmptyPlaceholder
import com.karibuhealth.app.ui.adaptive.supportsListDetail
import com.karibuhealth.app.ui.patientdetail.PatientTimelineScreen

/** OPD "Today" list — search, queue, and + FAB. Shown inside [ClinicalMainShell]. */
@Composable
fun OpdTodayPane(
    onNavigateToQueue: () -> Unit,
    onNavigateToNewVisit: () -> Unit,
    onNavigateToVisitDetails: (String) -> Unit,
    onNavigateToPatient: (String) -> Unit,
    onNavigateToBilling: () -> Unit,
    onAddPatientNote: (String) -> Unit = {},
    onRecordPatientVitals: (String) -> Unit = {},
    onNavigateToReferral: (String) -> Unit = {},
    onNavigateToDictation: (String) -> Unit = {},
    modifier: Modifier = Modifier,
) {
    var selectedPatientId by rememberSaveable { mutableStateOf<String?>(null) }
    val listDetail = supportsListDetail()

    val homeScreen: @Composable (Modifier) -> Unit = { homeModifier ->
        HomeScreen(
            onNavigateToQueue = onNavigateToQueue,
            onNavigateToNewVisit = onNavigateToNewVisit,
            onNavigateToVisitDetails = onNavigateToVisitDetails,
            onNavigateToPatient = onNavigateToPatient,
            onNavigateToBilling = onNavigateToBilling,
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
            modifier = modifier.fillMaxSize(),
        )
    } else {
        homeScreen(modifier)
    }
}
