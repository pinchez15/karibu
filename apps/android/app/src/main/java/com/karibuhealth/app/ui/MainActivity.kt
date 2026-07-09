package com.karibuhealth.app.ui

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.runtime.LaunchedEffect
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import androidx.lifecycle.lifecycleScope
import androidx.navigation.compose.rememberNavController
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.WorkManager
import com.karibuhealth.app.data.inpatient.ObsOverdueWorker
import com.karibuhealth.app.data.sync.PullSyncManager
import com.karibuhealth.app.data.sync.SyncQueueHelper
import com.karibuhealth.app.data.sync.SyncWorker
import com.karibuhealth.app.util.SessionMonitor
import com.karibuhealth.app.ui.components.OfflineBanner
import com.karibuhealth.app.ui.components.SyncDetailsSheet
import com.karibuhealth.app.ui.adaptive.KaribuAdaptiveProvider
import com.karibuhealth.app.ui.navigation.KaribuNavHost
import com.karibuhealth.app.ui.theme.KaribuHealthTheme
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.launch
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    @Inject lateinit var pullSyncManager: PullSyncManager
    @Inject lateinit var sessionMonitor: SessionMonitor
    @Inject lateinit var syncQueueHelper: SyncQueueHelper

    private val requestNotificationsPermission =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { /* best-effort */ }

    private fun maybeRequestNotificationsPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
        val granted = ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED
        if (!granted) requestNotificationsPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        val workManager = WorkManager.getInstance(this)

        // Enqueue periodic sync
        workManager.enqueueUniquePeriodicWork(
            SyncWorker.WORK_NAME_PERIODIC,
            ExistingPeriodicWorkPolicy.KEEP,
            SyncWorker.buildPeriodicRequest(),
        )

        // Inpatient obs-overdue escalation: ensure the channel, ask for the
        // notification permission once (Android 13+), and schedule the hourly check.
        ObsOverdueWorker.ensureChannel(this)
        maybeRequestNotificationsPermission()
        workManager.enqueueUniquePeriodicWork(
            ObsOverdueWorker.WORK_NAME_PERIODIC,
            ExistingPeriodicWorkPolicy.KEEP,
            ObsOverdueWorker.buildPeriodicRequest(),
        )

        // Start observing network for reconnect-triggered sync
        pullSyncManager.startObserving(lifecycleScope, workManager)

        // Pull fresh data each time app comes to foreground
        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                syncQueueHelper.scheduleImmediateSync()
                pullSyncManager.pullAll()
            }
        }

        // Monitor session token freshness
        sessionMonitor.startMonitoring(lifecycleScope)

        setContent {
            KaribuHealthTheme {
                KaribuAdaptiveProvider {
                val viewModel: MainViewModel = hiltViewModel()
                val isAuthenticated by viewModel.isAuthenticated.collectAsState()
                val needsOnboarding by viewModel.needsOnboarding.collectAsState()
                val isOnline by viewModel.isOnline.collectAsState()
                val pendingSyncCount by viewModel.pendingSyncCount.collectAsState()
                val deviceSavedCount by viewModel.deviceSavedCount.collectAsState()
                val pendingEntries by viewModel.pendingEntries.collectAsState()
                val failedSyncCount by viewModel.failedSyncCount.collectAsState()
                val failedEntries by viewModel.failedEntries.collectAsState()
                val navController = rememberNavController()

                val lifecycleOwner = LocalLifecycleOwner.current
                LaunchedEffect(lifecycleOwner, isAuthenticated) {
                    if (!isAuthenticated) return@LaunchedEffect
                    lifecycleOwner.lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
                        viewModel.refreshOnboardingFromServer()
                    }
                }

                var showSyncSheet by remember { mutableStateOf(false) }

                Scaffold(
                    modifier = Modifier.fillMaxSize(),
                    topBar = {
                        OfflineBanner(
                            isOnline = isOnline,
                            pendingSyncCount = pendingSyncCount,
                            deviceSavedCount = deviceSavedCount,
                            failedSyncCount = failedSyncCount,
                            onClick = { showSyncSheet = true },
                        )
                    },
                ) { innerPadding ->
                    KaribuNavHost(
                        navController = navController,
                        isAuthenticated = isAuthenticated,
                        needsOnboarding = needsOnboarding,
                        modifier = Modifier.padding(innerPadding),
                    )
                }

                if (showSyncSheet) {
                    SyncDetailsSheet(
                        entries = pendingEntries,
                        failedEntries = failedEntries,
                        onDismiss = { showSyncSheet = false },
                        onRetryAll = {
                            viewModel.retryAll()
                            showSyncSheet = false
                        },
                        onMarkSynced = viewModel::markEntrySynced,
                        onExportDebugLog = viewModel::readDebugLog,
                    )
                }
                }
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        pullSyncManager.stopObserving()
    }
}
