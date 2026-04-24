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
import com.karibuhealth.app.ui.visitdetails.VisitDetailsScreen
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
                onVisitCreated = { visitId ->
                    navController.navigate(NavRoute.VisitDetails(visitId)) {
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
                onNavigateToDictation = { visitId ->
                    navController.navigate(NavRoute.Dictation(visitId))
                },
                onNavigateToReview = { visitId ->
                    navController.navigate(NavRoute.Review(visitId))
                },
            )
        }

        composable<NavRoute.Dictation> { backStackEntry ->
            val route = backStackEntry.toRoute<NavRoute.Dictation>()
            DictationScreen(
                visitId = route.visitId,
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
                    navController.navigate(NavRoute.Payment(visitId)) {
                        popUpTo(NavRoute.Home)
                    }
                },
                onRejected = { visitId ->
                    // Back to dictation so the clinician can edit the kept
                    // transcript and re-submit. Inngest will run again on the
                    // new transcript.
                    navController.navigate(NavRoute.Dictation(visitId)) {
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
