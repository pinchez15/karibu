package com.karibuhealth.app.ui.navigation

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.toRoute
import com.karibuhealth.app.ui.auth.AuthScreen
import com.karibuhealth.app.ui.home.HomeScreen
import com.karibuhealth.app.ui.clinical.ClinicalMainShell
import com.karibuhealth.app.ui.referral.ReferralScreen
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
import com.karibuhealth.app.ui.billing.PatientBillScreen
import com.karibuhealth.app.ui.worklists.WorklistsScreen
import com.karibuhealth.app.ui.inpatient.WardCensusScreen
import com.karibuhealth.app.ui.anc.AncRegistryScreen
import com.karibuhealth.app.ui.anc.StartPregnancyScreen
import com.karibuhealth.app.ui.anc.PregnancyDetailScreen
import com.karibuhealth.app.ui.inpatient.WardHandoverScreen
import com.karibuhealth.app.ui.inpatient.AdmitPatientScreen
import com.karibuhealth.app.ui.inpatient.AdmissionChartScreen
import com.karibuhealth.app.ui.onboarding.OnboardingBlockedScreen
import com.karibuhealth.app.ui.onboarding.OnboardingRoot

@Composable
fun KaribuNavHost(
    navController: NavHostController,
    isAuthenticated: Boolean,
    needsOnboarding: Boolean,
    modifier: Modifier = Modifier,
) {
    val startRoute: NavRoute = when {
        !isAuthenticated -> NavRoute.Auth
        needsOnboarding -> NavRoute.Onboarding
        else -> NavRoute.Home
    }
    val navigator = rememberKaribuNavigator(navController, startRoute)

    androidx.compose.runtime.LaunchedEffect(isAuthenticated, needsOnboarding) {
        if (!isAuthenticated) return@LaunchedEffect
        val target = if (needsOnboarding) NavRoute.Onboarding else NavRoute.Home
        navigator.resetRoot(target, NavRoute.Auth, inclusive = true)
    }

    // Edge-swipe navigation wraps the whole host: a left-edge swipe goes back a
    // level (always safe — defers to popBackStack), a right-edge swipe goes
    // forward to where you came from. All in-graph navigation routes through the
    // navigator so the forward history captures the typed routes.
    Box(
        modifier = modifier
            .fillMaxSize()
            .edgeSwipeNavigation(
                onBack = { navigator.back() },
                onForward = { navigator.forward() },
            ),
    ) {
        NavHost(
            navController = navController,
            startDestination = startRoute,
        ) {
            composable<NavRoute.Auth> {
                AuthScreen(onAuthenticated = {
                    // Post-auth destination is chosen by LaunchedEffect(isAuthenticated, needsOnboarding).
                })
            }

            composable<NavRoute.Onboarding> {
                OnboardingRoot(
                    onFinished = {
                        navigator.resetRoot(NavRoute.Home, NavRoute.Onboarding, inclusive = true)
                    },
                )
            }

            composable<NavRoute.Home> {
                ClinicalMainShell(
                    onNavigateToQueue = { navigator.go(NavRoute.Queue) },
                    onNavigateToNewVisit = { navigator.go(NavRoute.NewVisit) },
                    onNavigateToVisitDetails = { visitId ->
                        navigator.go(NavRoute.VisitDetails(visitId))
                    },
                    onNavigateToPatient = { patientId ->
                        navigator.go(NavRoute.PatientDetail(patientId))
                    },
                    onNavigateToBilling = { navigator.go(NavRoute.Billing) },
                    onNavigateToAdmit = { navigator.go(NavRoute.AdmitPatient) },
                    onNavigateToAdmissionChart = { admissionId ->
                        navigator.go(NavRoute.AdmissionChart(admissionId))
                    },
                    onNavigateToHandover = { navigator.go(NavRoute.WardHandover) },
                    onNavigateToAncRegister = { navigator.go(NavRoute.StartPregnancy) },
                    onNavigateToPregnancy = { id -> navigator.go(NavRoute.PregnancyDetail(id)) },
                    onAddPatientNote = { patientId ->
                        navigator.go(NavRoute.PatientNote(patientId, null))
                    },
                    onRecordPatientVitals = { patientId ->
                        navigator.go(NavRoute.PatientVitals(patientId))
                    },
                    onNavigateToReferral = { visitId ->
                        navigator.go(NavRoute.Referral(visitId))
                    },
                    onNavigateToDictation = { visitId, aiMode ->
                        navigator.go(NavRoute.Dictation(visitId, aiMode))
                    },
                    onNavigateToReview = { visitId ->
                        navigator.go(NavRoute.Review(visitId))
                    },
                )
            }

            composable<NavRoute.Queue> {
                QueueScreen(
                    onNavigateBack = { navigator.back() },
                    onNavigateToCheckIn = { navigator.go(NavRoute.CheckIn) },
                    onNavigateToVisitDetails = { visitId ->
                        navigator.go(NavRoute.VisitDetails(visitId))
                    },
                )
            }

            composable<NavRoute.CheckIn> {
                if (needsOnboarding) {
                    OnboardingBlockedScreen(onOpenTraining = { navigator.go(NavRoute.Onboarding) })
                } else {
                    CheckInScreen(
                        onNavigateBack = { navigator.back() },
                        onCheckedIn = { visitId ->
                            navigator.goReset(NavRoute.VisitDetails(visitId), NavRoute.Queue)
                        },
                    )
                }
            }

            composable<NavRoute.NewVisit> {
                if (needsOnboarding) {
                    OnboardingBlockedScreen(onOpenTraining = { navigator.go(NavRoute.Onboarding) })
                } else {
                    NewVisitScreen(
                        onNavigateBack = { navigator.back() },
                        // After patient + visit is created, route through the vitals
                        // capture screen, then dictation. Both are skippable.
                        onVisitCreated = { visitId, patientId ->
                            navigator.goReset(NavRoute.Vitals(visitId, patientId), NavRoute.Home)
                        },
                    )
                }
            }

            composable<NavRoute.Vitals> { backStackEntry ->
                val route = backStackEntry.toRoute<NavRoute.Vitals>()
                VitalsScreen(
                    visitId = route.visitId,
                    patientId = route.patientId,
                    onNavigateBack = { navigator.back() },
                    onContinue = { visitId ->
                        // Whether the clinician saved vitals or skipped, next is the
                        // note. aiMode=false — Save flow no longer toggles AI here.
                        // visitId is non-null here because the visit-tied route
                        // always supplies one; ignore the rare null case.
                        if (visitId != null) {
                            navigator.goReset(NavRoute.Dictation(visitId, false), NavRoute.Home)
                        }
                    },
                )
            }

            composable<NavRoute.VisitDetails> { backStackEntry ->
                val route = backStackEntry.toRoute<NavRoute.VisitDetails>()
                VisitDetailsScreen(
                    visitId = route.visitId,
                    onNavigateBack = { navigator.back() },
                    onNavigateToReferral = { visitId ->
                        navigator.go(NavRoute.Referral(visitId))
                    },
                    onNavigateToDictation = { visitId, aiMode, incorporate ->
                        navigator.go(
                            NavRoute.Dictation(
                                visitId = visitId,
                                aiMode = aiMode,
                                incorporateSection = incorporate?.section?.name,
                                incorporatePrefill = incorporate?.prefill,
                                openLabPicker = incorporate?.openLabPicker == true,
                                openRxPicker = incorporate?.openRxPicker == true,
                            ),
                        )
                    },
                    onNavigateToReview = { visitId ->
                        navigator.go(NavRoute.Review(visitId))
                    },
                )
            }

            composable<NavRoute.Dictation> { backStackEntry ->
                val route = backStackEntry.toRoute<NavRoute.Dictation>()
                DictationScreen(
                    visitId = route.visitId,
                    aiMode = route.aiMode,
                    incorporateSection = route.incorporateSection,
                    incorporatePrefill = route.incorporatePrefill,
                    openLabPicker = route.openLabPicker,
                    openRxPicker = route.openRxPicker,
                    onNavigateBack = { navigator.back() },
                    onSubmitted = { visitId ->
                        // Dictation submitted; visit is now in 'pending' while
                        // Inngest structures the note. Drop back to VisitDetails
                        // so the clinician sees the AI working.
                        navigator.goReset(NavRoute.VisitDetails(visitId), NavRoute.Home)
                    },
                )
            }

            composable<NavRoute.Review> { backStackEntry ->
                val route = backStackEntry.toRoute<NavRoute.Review>()
                ReviewScreen(
                    visitId = route.visitId,
                    onNavigateBack = { navigator.back() },
                    onApproved = { visitId ->
                        navigator.goReset(NavRoute.VisitDetails(visitId), NavRoute.Home)
                    },
                    onRejected = { visitId ->
                        // Back to dictation so the clinician can edit the kept
                        // transcript and re-submit. Inngest will run again on the
                        // new transcript.
                        navigator.goReset(NavRoute.Dictation(visitId, true), NavRoute.Home)
                    },
                )
            }

            composable<NavRoute.Payment> { backStackEntry ->
                val route = backStackEntry.toRoute<NavRoute.Payment>()
                PaymentScreen(
                    visitId = route.visitId,
                    onNavigateBack = { navigator.back() },
                    onPaymentComplete = { visitId ->
                        navigator.goReset(NavRoute.Success(visitId), NavRoute.Home)
                    },
                )
            }

            composable<NavRoute.Success> { backStackEntry ->
                val route = backStackEntry.toRoute<NavRoute.Success>()
                SuccessScreen(
                    visitId = route.visitId,
                    onNavigateHome = {
                        navigator.resetRoot(NavRoute.Home, NavRoute.Home, inclusive = true)
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
                    onNavigateBack = { navigator.back() },
                    onNavigateToVisit = { visitId ->
                        navigator.go(NavRoute.VisitDetails(visitId))
                    },
                    onAddNote = { patientId ->
                        navigator.go(NavRoute.PatientNote(patientId, null))
                    },
                    onRecordVitals = { patientId ->
                        navigator.go(NavRoute.PatientVitals(patientId))
                    },
                    onNavigateToBilling = {
                        navigator.go(NavRoute.Billing)
                    },
                    onNavigateToReferral = { visitId ->
                        navigator.go(NavRoute.Referral(visitId))
                    },
                    onNavigateToDictation = { visitId ->
                        navigator.go(NavRoute.Dictation(visitId, false))
                    },
                )
            }

            composable<NavRoute.PatientNote> { backStackEntry ->
                val route = backStackEntry.toRoute<NavRoute.PatientNote>()
                PatientNoteScreen(
                    patientId = route.patientId,
                    initialSource = route.source,
                    onNavigateBack = { navigator.back() },
                    onSigned = { navigator.back() },
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
                    onNavigateBack = { navigator.back() },
                    onContinue = { _ ->
                        navigator.back()
                    },
                )
            }

            // Phase 5 — operational worklists. Reached from the Home app bar.
            // Tapping a row routes to the appropriate detail screen so the
            // clinician can act on the item without losing the worklist context.
            composable<NavRoute.Worklists> {
                WorklistsScreen(
                    onNavigateBack = { navigator.back() },
                    onNavigateToVisit = { visitId ->
                        navigator.go(NavRoute.VisitDetails(visitId))
                    },
                    onNavigateToPatient = { patientId ->
                        navigator.go(NavRoute.PatientDetail(patientId))
                    },
                    onNavigateToReferral = { visitId ->
                        navigator.go(NavRoute.Referral(visitId))
                    },
                    onNavigateToDictation = { visitId, aiMode ->
                        navigator.go(NavRoute.Dictation(visitId, aiMode))
                    },
                    onNavigateToReview = { visitId ->
                        navigator.go(NavRoute.Review(visitId))
                    },
                    onAddPatientNote = { patientId ->
                        navigator.go(NavRoute.PatientNote(patientId, null))
                    },
                    onRecordPatientVitals = { patientId ->
                        navigator.go(NavRoute.PatientVitals(patientId))
                    },
                )
            }

            composable<NavRoute.Billing> {
                BillingHomeScreen(
                    onNavigateBack = { navigator.back() },
                    onOpenPatientBill = { patientId ->
                        navigator.go(NavRoute.PatientBill(patientId))
                    },
                )
            }

            composable<NavRoute.PatientBill> {
                PatientBillScreen(
                    onNavigateBack = { navigator.back() },
                )
            }

            composable<NavRoute.Referral> { backStackEntry ->
                val route = backStackEntry.toRoute<NavRoute.Referral>()
                ReferralScreen(
                    visitId = route.visitId,
                    onNavigateBack = { navigator.back() },
                    onComplete = { navigator.back() },
                )
            }

            // Inpatient ward spine (migration 053).
            composable<NavRoute.Inpatient> {
                WardCensusScreen(
                    onNavigateBack = { navigator.back() },
                    onAdmit = { navigator.go(NavRoute.AdmitPatient) },
                    onOpenAdmission = { admissionId ->
                        navigator.go(NavRoute.AdmissionChart(admissionId))
                    },
                    onHandover = { navigator.go(NavRoute.WardHandover) },
                )
            }

            composable<NavRoute.WardHandover> {
                WardHandoverScreen(
                    onNavigateBack = { navigator.back() },
                    onOpenAdmission = { admissionId ->
                        navigator.go(NavRoute.AdmissionChart(admissionId))
                    },
                )
            }

            composable<NavRoute.AdmitPatient> {
                AdmitPatientScreen(
                    onNavigateBack = { navigator.back() },
                    onAdmitted = { admissionId ->
                        // Replace the admit form with the chart so Back returns to the census.
                        navigator.goReset(NavRoute.AdmissionChart(admissionId), NavRoute.Home)
                    },
                )
            }

            composable<NavRoute.AdmissionChart> {
                AdmissionChartScreen(
                    onNavigateBack = { navigator.back() },
                )
            }

            // ANC registry (migration 059).
            composable<NavRoute.AncRegistry> {
                AncRegistryScreen(
                    onNavigateBack = { navigator.back() },
                    onRegister = { navigator.go(NavRoute.StartPregnancy) },
                    onOpenPregnancy = { id -> navigator.go(NavRoute.PregnancyDetail(id)) },
                )
            }

            composable<NavRoute.StartPregnancy> {
                StartPregnancyScreen(
                    onNavigateBack = { navigator.back() },
                    onStarted = { id ->
                        navigator.goReset(NavRoute.PregnancyDetail(id), NavRoute.Home)
                    },
                )
            }

            composable<NavRoute.PregnancyDetail> {
                PregnancyDetailScreen(
                    onNavigateBack = { navigator.back() },
                )
            }
        }
    }
}
