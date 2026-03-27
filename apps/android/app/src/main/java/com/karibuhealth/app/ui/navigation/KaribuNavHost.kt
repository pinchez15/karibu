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
import com.karibuhealth.app.ui.consent.ConsentScreen
import com.karibuhealth.app.ui.recording.RecordingScreen
import com.karibuhealth.app.ui.visitdetails.VisitDetailsScreen
import com.karibuhealth.app.ui.processing.ProcessingScreen
import com.karibuhealth.app.ui.review.ReviewScreen
import com.karibuhealth.app.ui.payment.PaymentScreen
import com.karibuhealth.app.ui.success.SuccessScreen

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
                onPatientSelected = { patientId ->
                    navController.navigate(NavRoute.Consent(patientId))
                },
            )
        }

        composable<NavRoute.Consent> { backStackEntry ->
            val route = backStackEntry.toRoute<NavRoute.Consent>()
            ConsentScreen(
                patientId = route.patientId,
                onNavigateBack = { navController.popBackStack() },
                onConsentGranted = { visitId ->
                    navController.navigate(NavRoute.Recording(visitId)) {
                        popUpTo(NavRoute.Home)
                    }
                },
            )
        }

        composable<NavRoute.Recording> { backStackEntry ->
            val route = backStackEntry.toRoute<NavRoute.Recording>()
            RecordingScreen(
                visitId = route.visitId,
                onNavigateBack = { navController.popBackStack() },
                onRecordingComplete = { visitId ->
                    navController.navigate(NavRoute.Processing(visitId)) {
                        popUpTo(NavRoute.Home)
                    }
                },
            )
        }

        composable<NavRoute.VisitDetails> { backStackEntry ->
            val route = backStackEntry.toRoute<NavRoute.VisitDetails>()
            VisitDetailsScreen(
                visitId = route.visitId,
                onNavigateBack = { navController.popBackStack() },
                onNavigateToRecording = { visitId ->
                    navController.navigate(NavRoute.Recording(visitId))
                },
                onNavigateToReview = { visitId ->
                    navController.navigate(NavRoute.Review(visitId))
                },
            )
        }

        composable<NavRoute.Processing> { backStackEntry ->
            val route = backStackEntry.toRoute<NavRoute.Processing>()
            ProcessingScreen(
                visitId = route.visitId,
                onNavigateBack = { navController.popBackStack() },
                onProcessingComplete = { visitId ->
                    navController.navigate(NavRoute.Review(visitId)) {
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
                    navController.navigate(NavRoute.Payment(visitId)) {
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
    }
}
