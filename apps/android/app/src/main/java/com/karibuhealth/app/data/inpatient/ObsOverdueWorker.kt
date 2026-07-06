package com.karibuhealth.app.data.inpatient

import com.karibuhealth.app.util.parseServerInstant

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.PeriodicWorkRequest
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkerParameters
import com.karibuhealth.app.data.local.datastore.AuthTokenStore
import com.karibuhealth.app.data.local.db.dao.AdmissionDao
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import java.time.Duration
import java.time.Instant
import java.util.concurrent.TimeUnit

/**
 * Obs-overdue escalation (docs/hciii-inpatient-panel-spec.md, Phase 2).
 *
 * The whole inpatient design assumes a single night nurse covering the ward —
 * and the patient she hasn't opened in hours is the one who dies. An in-chart
 * banner only reaches her once she's already looking. This worker runs on-device
 * (no network needed) and raises a real device notification when an admitted
 * patient hasn't been observed within the expected window, so the nurse is
 * nudged to the patient she hasn't been back to.
 */
@HiltWorker
class ObsOverdueWorker @AssistedInject constructor(
    @Assisted context: Context,
    @Assisted params: WorkerParameters,
    private val admissionDao: AdmissionDao,
    private val authTokenStore: AuthTokenStore,
) : CoroutineWorker(context, params) {

    companion object {
        const val WORK_NAME_PERIODIC = "karibu_obs_overdue_periodic"
        const val CHANNEL_ID = "inpatient_obs_overdue"
        private const val NOTIF_ID = 4201
        private const val TAG = "ObsOverdueWorker"

        /** Hours since the last round before a patient is flagged overdue. */
        const val OBS_OVERDUE_HOURS = 6L

        fun buildPeriodicRequest(): PeriodicWorkRequest =
            PeriodicWorkRequestBuilder<ObsOverdueWorker>(1, TimeUnit.HOURS).build()

        fun ensureChannel(context: Context) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Ward observations due",
                NotificationManager.IMPORTANCE_HIGH,
            ).apply { description = "Nudges when an admitted patient is overdue for observation." }
            context.getSystemService(NotificationManager::class.java)?.createNotificationChannel(channel)
        }
    }

    override suspend fun doWork(): Result {
        val ctx = applicationContext
        ensureChannel(ctx)
        val manager = NotificationManagerCompat.from(ctx)

        val clinicId = authTokenStore.getClinicId() ?: return Result.success()
        val rows = runCatching { admissionDao.activeCensusOnce(clinicId) }.getOrElse {
            Log.e(TAG, "census query failed", it)
            return Result.success()
        }

        val now = Instant.now()
        val threshold = Duration.ofHours(OBS_OVERDUE_HOURS)
        val overdue = rows.filter { row ->
            // No obs yet → measure from admission time; otherwise from last round.
            val reference = row.lastObservedAt ?: row.admission.admittedAt
            val at = runCatching { parseServerInstant(reference) }.getOrNull() ?: return@filter false
            Duration.between(at, now) >= threshold
        }

        // Keep a single, updating notification (no stacking/spam). Clear it when
        // nothing is overdue.
        if (overdue.isEmpty()) {
            manager.cancel(NOTIF_ID)
            return Result.success()
        }
        if (!canPostNotifications(ctx)) return Result.success()

        val names = overdue.mapNotNull { it.admission.patientName?.takeIf { n -> n.isNotBlank() } }
        val text = when {
            overdue.size == 1 && names.isNotEmpty() -> "${names.first()} is due for observation."
            names.isNotEmpty() -> "${overdue.size} patients due for observation — ${names.take(3).joinToString(", ")}${if (names.size > 3) "…" else ""}"
            else -> "${overdue.size} admitted patient(s) due for observation."
        }

        val launch = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)
        val contentIntent = launch?.let {
            PendingIntent.getActivity(ctx, 0, it, PendingIntent.FLAG_IMMUTABLE)
        }

        val notification = NotificationCompat.Builder(ctx, CHANNEL_ID)
            .setSmallIcon(ctx.applicationInfo.icon)
            .setContentTitle("Ward observations due")
            .setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setAutoCancel(true)
            .apply { contentIntent?.let { setContentIntent(it) } }
            .build()

        runCatching { manager.notify(NOTIF_ID, notification) }
            .onFailure { Log.e(TAG, "notify failed", it) }
        return Result.success()
    }

    private fun canPostNotifications(ctx: Context): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED
}
