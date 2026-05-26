package com.karibuhealth.app.ui.navigation

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.toRoute
import com.karibuhealth.app.ui.auth.AuthScreen
import com.karibuhealth.app.ui.home.HomeScreen
import com.karibuhealth.app.ui.queue.QueueScreen
import com.karibuhealth.app.ui.checkin.CheckInScreen
import com.karibuhealth.app.ui.newvisit.NewVisitScreen
import com.karibuhealth.app.ui.dictation.DictationScreen
import com.karibuhealth.app.ui.patientdetail.PatientTimelineScreen
import com.karibuhealth.app.ui.patientnote.PatientNoteScreen
import com.karibuhealth.app.ui.vitals.VitalsScreen
import com.karibuhealth.app.ui.visitdetails.VisitDetailsScreen
import com.karibuhealth.app.ui.review.ReviewScreen
import com.karibuhealth.app.ui.payment.PaymentScreen
import com.karibuhealth.app.ui.success.SuccessScreen
import com.karibuhealth.app.ui.billing.BillingHomeScreen
import com.karibuhealth.app.ui.worklists.WorklistsScreen

@Composable
fun KaribuNavHost(
    navController: NavHostController,
    isAuthenticated: Boolean,
    modifier: Modifier = Modifier,
) {
    NavHost(
        navController = navController,
        startDestination = if (isAuthenticated) NavRoute.Home else NavRoute.Auth,
        modifier = modifier,
    ) {
        composable<NavRoute.Auth> {
            AuthScreen(onAuthenticated = {
                navController.navigate(NavRoute.Home) {
                    popUpTo(NavRoute.Auth) { inclusive = true }
                }
            })
        }

        composable<NavRoute.Home> {
            HomeScreen(
                onNavigateToQueue = { navController.navigate(NavRoute.Queue) },
                onNavigateToNewVisit = { navController.navigate(NavRoute.NewVisit) },
                onNavigateToVisitDetails = { visitId ->
                    navController.navigate(NavRoute.VisitDetails(visitId))
                },
                onNavigateToPatient = { patientId ->
                    navController.navigate(NavRoute.PatientDetail(patientId))
                },
                onNavigateToWorklists = { navController.navigate(NavRoute.Worklists) },
                onNavigateToBilling = { navController.navigate(NavRoute.Billing) },
            )
        }

        composable<NavRoute.Queue> {
            QueueScreen(
                onNavigateBack = { navController.popBackStack() },
                onNavigateToCheckIn = { navController.navigate(NavRoute.CheckIn) },
                onNavigateToVisitDetails = { visitId ->
                    navController.navigate(NavRoute.VisitDetails(visitId))
                },
            )
        }

        composable<NavRoute.CheckIn> {
            CheckInScreen(
                onNavigateBack = { navController.popBackStack() },
                onCheckedIn = { visitId ->
                    navController.navigate(NavRoute.VisitDetails(visitId)) {
                        popUpTo(NavRoute.Queue)
                    }
                },
            )
        }

        composable<NavRoute.NewVisit> {
            NewVisitScreen(
                onNavigateBack = { navController.popBackStack() },
                // After patient + visit is created, route through the vitals
                // capture screen, then dictation. Both are skippable.
                onVisitCreated = { visitId, patientId ->
                    navController.navigate(NavRoute.Vitals(visitId, patientId)) {
                        popUpTo(NavRoute.Home)
                    }
                },
            )
        }

        composable<NavRoute.Vitals> { backStackEntry ->
            val route = backStackEntry.toRoute<NavRoute.Vitals>()
            VitalsScreen(
                visitId = route.visitId,
                patientId = route.patientId,
                onNavigateBack = { navController.popBackStack() },
                onContinue = { visitId ->
                    // Whether the clinician saved vitals or skipped, next is the
                    // note. aiMode=false — Save flow no longer toggles AI here.
                    // visitId is non-null here because the visit-tied route
                    // always supplies one; ignore the rare null case.
                    if (visitId != null) {
                        navController.navigate(NavRoute.Dictation(visitId, false)) {
                            popUpTo(NavRoute.Home)
                        }
                    }
                },
            )
        }

        composable<NavRoute.VisitDetails> { backStackEntry ->
            val route = backStackEntry.toRoute<NavRoute.VisitDetails>()
            VisitDetailsScreen(
                visitId = route.visitId,
                onNavigateBack = { navController.popBackStack() },
                onNavigateToDictation = { visitId, aiMode ->
                    navController.navigate(NavRoute.Dictation(visitId, aiMode))
                },
                onNavigateToReview = { visitId ->
                    navController.navigate(NavRoute.Review(visitId))
                },
                // Direct-saved visits (status='sent', documentation_complete=true)
                // skip the AI review screen and go straight to payment.
                onNavigateToPayment = { visitId ->
                    navController.navigate(NavRoute.Payment(visitId))
                },
            )
        }

        composable<NavRoute.Dictation> { backStackEntry ->
            val route = backStackEntry.toRoute<NavRoute.Dictation>()
            DictationScreen(
                visitId = route.visitId,
                aiMode = route.aiMode,
                onNavigateBack = { navController.popBackStack() },
                onSubmitted = { visitId ->
                    // Dictation submitted; visit is now in 'pending' while
                    // Inngest structures the note. Drop back to VisitDetails
                    // so the clinician sees the AI working.
                    navController.navigate(NavRoute.VisitDetails(visitId)) {
                        popUpTo(NavRoute.Home)
                    }
                },
            )
        }

        composable<NavRoute.Review> { backStackEntry ->
            val route = backStackEntry.toRoute<NavRoute.Review>()
            ReviewScreen(
                visitId = route.visitId,
                onNavigateBack = { navController.popBackStack() },
                onApproved = { visitId ->
                    navController.navigate(NavRoute.VisitDetails(visitId)) {
                        popUpTo(NavRoute.Home)
                    }
                },
                onRejected = { visitId ->
                    // Back to dictation so the clinician can edit the kept
                    // transcript and re-submit. Inngest will run again on the
                    // new transcript.
                    navController.navigate(NavRoute.Dictation(visitId, true)) {
                        popUpTo(NavRoute.Home)
                    }
                },
            )
        }

        composable<NavRoute.Payment> { backStackEntry ->
            val route = backStackEntry.toRoute<NavRoute.Payment>()
            PaymentScreen(
                visitId = route.visitId,
                onNavigateBack = { navController.popBackStack() },
                onPaymentComplete = { visitId ->
                    navController.navigate(NavRoute.Success(visitId)) {
                        popUpTo(NavRoute.Home)
                    }
                },
            )
        }

        composable<NavRoute.Success> { backStackEntry ->
            val route = backStackEntry.toRoute<NavRoute.Success>()
            SuccessScreen(
                visitId = route.visitId,
                onNavigateHome = {
                    navController.navigate(NavRoute.Home) {
                        popUpTo(NavRoute.Home) { inclusive = true }
                    }
                },
            )
        }

        // Phase 3 — patient timeline (one patient, longitudinal context) and
        // the patient-only note editor (no visit). The timeline FAB routes to
        // PatientNote; PatientNote pops back to the timeline on Sign.
        composable<NavRoute.PatientDetail> { backStackEntry ->
            val route = backStackEntry.toRoute<NavRoute.PatientDetail>()
            PatientTimelineScreen(
                patientId = route.patientId,
                onNavigateBack = { navController.popBackStack() },
                onNavigateToVisit = { visitId ->
                    navController.navigate(NavRoute.VisitDetails(visitId))
                },
                onAddNote = { patientId ->
                    navController.navigate(NavRoute.PatientNote(patientId, null))
                },
                onRecordVitals = { patientId ->
                    navController.navigate(NavRoute.PatientVitals(patientId))
                },
            )
        }

        composable<NavRoute.PatientNote> { backStackEntry ->
            val route = backStackEntry.toRoute<NavRoute.PatientNote>()
            PatientNoteScreen(
                patientId = route.patientId,
                initialSource = route.source,
                onNavigateBack = { navController.popBackStack() },
                onSigned = { navController.popBackStack() },
            )
        }

        // Phase 4 — patient-only vitals capture (no visit). Reuses
        // VitalsScreen with visitId=null. On save, pops back to the
        // PatientTimelineScreen so the new vitals row renders in the
        // timeline.
        composable<NavRoute.PatientVitals> { backStackEntry ->
            val route = backStackEntry.toRoute<NavRoute.PatientVitals>()
            VitalsScreen(
                visitId = null,
                patientId = route.patientId,
                onNavigateBack = { navController.popBackStack() },
                onContinue = { _ ->
                    navController.popBackStack()
                },
            )
        }

        // Phase 5 — operational worklists. Reached from the Home app bar.
        // Tapping a row routes to the appropriate detail screen so the
        // clinician can act on the item without losing the worklist context.
        composable<NavRoute.Worklists> {
            WorklistsScreen(
                onNavigateBack = { navController.popBackStack() },
                onNavigateToVisit = { visitId ->
                    navController.navigate(NavRoute.VisitDetails(visitId))
                },
                onNavigateToPatient = { patientId ->
                    navController.navigate(NavRoute.PatientDetail(patientId))
                },
            )
        }

        composable<NavRoute.Billing> {
            BillingHomeScreen(
                onNavigateBack = { navController.popBackStack() },
                onNavigateToVisit = { visitId ->
                    navController.navigate(NavRoute.VisitDetails(visitId))
                },
            )
        }
    }
}
