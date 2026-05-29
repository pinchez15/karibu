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
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import com.karibuhealth.app.ui.inpatient.InpatientHomeScreen

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
    modifier: Modifier = Modifier,
) {
    var selectedTab by rememberSaveable { mutableIntStateOf(ClinicianHomeTab.OPD.ordinal) }

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
            ClinicianHomeTab.OPD.ordinal -> HomeScreen(
                onNavigateToQueue = onNavigateToQueue,
                onNavigateToNewVisit = onNavigateToNewVisit,
                onNavigateToVisitDetails = onNavigateToVisitDetails,
                onNavigateToPatient = onNavigateToPatient,
                onNavigateToWorklists = onNavigateToWorklists,
                onNavigateToBilling = onNavigateToBilling,
                modifier = Modifier.fillMaxSize(),
            )
            else -> InpatientHomeScreen(
                onNavigateToPatient = onNavigateToPatient,
                modifier = Modifier.fillMaxSize(),
            )
        }
    }
}
