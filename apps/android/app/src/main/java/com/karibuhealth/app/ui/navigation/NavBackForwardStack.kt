package com.karibuhealth.app.ui.navigation

/**
 * Pure back/forward history for the swipe gesture, modelled like a browser's:
 * a left-edge swipe goes **back** a level; a right-edge swipe goes **forward**
 * to where you just came from ("next in flow"). Navigating somewhere new clears
 * the forward stack.
 *
 * This is intentionally free of Compose / NavController so it can be unit tested.
 * [KaribuNavigator] mirrors real navigation into it. Generic over the route type
 * so tests can use plain strings.
 *
 * Equality is by value (route objects are data classes / objects), which is what
 * `popUpTo` mirroring relies on.
 */
class NavBackForwardStack<T>(root: T) {
    private val back = ArrayDeque<T>().apply { addLast(root) }
    private val forward = ArrayDeque<T>()

    val current: T? get() = back.lastOrNull()
    val canGoBack: Boolean get() = back.size > 1
    val canGoForward: Boolean get() = forward.isNotEmpty()

    /** Snapshot for tests/inspection: back stack from root → current. */
    fun backStack(): List<T> = back.toList()

    fun forwardStack(): List<T> = forward.toList()

    /** Reset to a single root (login / hard flow reset). */
    fun reset(root: T) {
        back.clear()
        forward.clear()
        back.addLast(root)
    }

    /** A plain forward navigation to a new destination. Clears forward history. */
    fun push(route: T) {
        back.addLast(route)
        forward.clear()
    }

    /**
     * Navigate with `popUpTo(target){ inclusive }` semantics, then land on [route].
     * Pops the back stack down to (and optionally including) the most recent
     * [target] before pushing, mirroring Navigation-Compose's popUpTo.
     */
    fun pushPopUpTo(route: T, target: T, inclusive: Boolean) {
        while (back.isNotEmpty() && back.last() != target) back.removeLast()
        if (inclusive && back.isNotEmpty() && back.last() == target) back.removeLast()
        back.addLast(route)
        forward.clear()
    }

    /**
     * Record a back step. Moves current onto the forward stack. Returns true if a
     * back step was possible (i.e. we were not already at the root).
     */
    fun back(): Boolean {
        if (back.size <= 1) return false
        forward.addLast(back.removeLast())
        return true
    }

    /**
     * Pop the next forward destination to navigate to, or null if none. The caller
     * performs the actual navigation; this just advances the history.
     */
    fun forward(): T? {
        val next = forward.removeLastOrNull() ?: return null
        back.addLast(next)
        return next
    }
}
