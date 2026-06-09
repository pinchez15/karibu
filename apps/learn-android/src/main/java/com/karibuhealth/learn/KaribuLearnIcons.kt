package com.karibuhealth.learn

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material.icons.outlined.BarChart
import androidx.compose.material.icons.outlined.Calculate
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.DownloadForOffline
import androidx.compose.material.icons.outlined.EmojiEvents
import androidx.compose.material.icons.outlined.Flag
import androidx.compose.material.icons.outlined.GpsFixed
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.Lightbulb
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.Medication
import androidx.compose.material.icons.outlined.MonitorHeart
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material.icons.outlined.Science
import androidx.compose.material.icons.outlined.Share
import androidx.compose.ui.graphics.vector.ImageVector

/**
 * KaribuLearn icon set.
 *
 * The design ships inline 24×24 / currentColor / ~1.8px-stroke SVGs
 * (karibu-learn/kl-icons.jsx). Per the design system's substitution policy,
 * where the codebase doesn't already vend a matching glyph we use the nearest
 * Material (extended) equivalent — Material's outline set matches the stroke
 * weight and grid closely enough.
 *
 * The one icon that is always FILLED, never outline, is [sparkle] — it is the
 * AI marker and appears only inside the simulated EHR (amber).
 */
object KlIcons {
    // Shell / tab bar
    val home: ImageVector = Icons.Outlined.Home
    val cases: ImageVector = Icons.Outlined.Description
    val award: ImageVector = Icons.Outlined.EmojiEvents
    val info: ImageVector = Icons.Outlined.Info

    // Coaching + flow
    val bulb: ImageVector = Icons.Outlined.Lightbulb          // KaribuLearn coach marker
    val play: ImageVector = Icons.Filled.PlayArrow
    val arrowRight: ImageVector = Icons.AutoMirrored.Filled.ArrowForward
    val check: ImageVector = Icons.Filled.Check
    val checkCircle: ImageVector = Icons.Filled.CheckCircle
    val target: ImageVector = Icons.Outlined.GpsFixed
    val clock: ImageVector = Icons.Outlined.Schedule
    val lock: ImageVector = Icons.Outlined.Lock
    val close: ImageVector = Icons.Filled.Close
    val download: ImageVector = Icons.Outlined.DownloadForOffline
    val share: ImageVector = Icons.Outlined.Share

    // Clinical glyphs (case cards, "what you build", calculator)
    val stethoscope: ImageVector = Icons.Outlined.MonitorHeart // nearest Material analog
    val flask: ImageVector = Icons.Outlined.Science
    val pill: ImageVector = Icons.Outlined.Medication
    val calc: ImageVector = Icons.Outlined.Calculate
    val chart: ImageVector = Icons.Outlined.BarChart
    val flag: ImageVector = Icons.Outlined.Flag

    // Stepper
    val minus: ImageVector = Icons.Filled.Remove
    val plus: ImageVector = Icons.Filled.Add

    // The AI marker — FILLED only, used inside the cobalt EHR.
    val sparkle: ImageVector = Icons.Filled.AutoAwesome
}
