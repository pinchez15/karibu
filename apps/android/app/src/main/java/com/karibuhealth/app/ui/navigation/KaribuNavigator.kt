package com.karibuhealth.app.ui.navigation

import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.navigation.NavHostController

/**
 * Wraps the app's [NavHostController] and mirrors navigation into a pure
 * [NavBackForwardStack] so the swipe gestures can offer **back** (left-edge
 * swipe) and **forward / next in flow** (right-edge swipe).
 *
 * Back is crash-safe: it always defers to [NavHostController.popBackStack],
 * independent of the tracked history. The tracked history only powers forward,
 * which no-ops when empty — so a mis-mirror degrades to "forward does nothing",
 * never a crash or a wrong-screen jump that the user didn't initiate.
 *
 * All navigation in [KaribuNavHost] routes through this holder so the typed
 * route objects are captured for forward re-navigation.
 */
class KaribuNavigator(
    val controller: NavHostController,
    root: NavRoute,
) {
    private val history = NavBackForwardStack<NavRoute>(root)

    val canGoForward: Boolean get() = history.canGoForward

    /** Plain navigation to a new destination. */
    fun go(route: NavRoute) {
        controller.navigate(route)
        history.push(route)
    }

    /**
     * Navigate to [route] with `popUpTo(target){ inclusive }`, the flow-reset
     * pattern used across the graph (e.g. dropping back to Home after a save).
     */
    fun goReset(route: NavRoute, target: NavRoute, inclusive: Boolean = false) {
        controller.navigate(route) {
            popUpTo(target) { this.inclusive = inclusive }
        }
        history.pushPopUpTo(route, target, inclusive)
    }

    /** Hard reset to a single root (used on auth transitions). */
    fun resetRoot(route: NavRoute, popUpTo: NavRoute, inclusive: Boolean = true) {
        controller.navigate(route) {
            popUpTo(popUpTo) { this.inclusive = inclusive }
        }
        history.reset(route)
    }

    /** Back a level. Returns true if a back step happened. */
    fun back(): Boolean {
        // popBackStack is the source of truth; history is best-effort for forward.
        val popped = controller.popBackStack()
        if (popped) history.back()
        return popped
    }

    /** Forward to where we just came from, if anything. */
    fun forward(): Boolean {
        val next = history.forward() ?: return false
        controller.navigate(next)
        return true
    }
}

@Composable
fun rememberKaribuNavigator(
    controller: NavHostController,
    root: NavRoute,
): KaribuNavigator = remember(controller) { KaribuNavigator(controller, root) }

/**
 * Edge-swipe navigation:
 *  - a drag starting from the **left edge** moving right → [onBack]
 *  - a drag starting from the **right edge** moving left → [onForward]
 *
 * Restricting the trigger to the screen edges keeps it from fighting in-screen
 * horizontal controls (the dose-calculator slider, horizontal chip rows): those
 * live in the middle of the screen, not the [edgeWidth] gutters.
 */
fun Modifier.edgeSwipeNavigation(
    onBack: () -> Unit,
    onForward: () -> Unit,
    edgeWidth: Dp = 28.dp,
    threshold: Dp = 72.dp,
): Modifier = this.pointerInput(onBack, onForward) {
    val edgePx = edgeWidth.toPx()
    val thresholdPx = threshold.toPx()
    var startX = 0f
    var total = 0f
    detectHorizontalDragGestures(
        onDragStart = { offset ->
            startX = offset.x
            total = 0f
        },
        onHorizontalDrag = { _, dragAmount -> total += dragAmount },
        onDragEnd = {
            val width = size.width.toFloat()
            when {
                startX <= edgePx && total > thresholdPx -> onBack()
                startX >= width - edgePx && total < -thresholdPx -> onForward()
            }
        },
    )
}
