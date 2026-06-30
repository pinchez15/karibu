package com.karibuhealth.learn

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.lightColorScheme
import androidx.compose.ui.Modifier
import androidx.lifecycle.viewmodel.compose.viewModel
import com.karibuhealth.learn.chart.Cobalt
import com.karibuhealth.learn.data.LearnRepository
import com.karibuhealth.learn.data.supabase.LearnAuthRepository
import com.karibuhealth.learn.data.supabase.LearnCorrectionsRepository
import com.karibuhealth.learn.data.supabase.LearnProgressRepository
import com.karibuhealth.learn.data.supabase.LearnSupabase
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.handleDeeplinks

class MainActivity : ComponentActivity() {
    override fun onNewIntent(intent: android.content.Intent) {
        super.onNewIntent(intent)
        LearnSupabase.client?.handleDeeplinks(intent)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        LearnSupabase.client?.handleDeeplinks(intent)
        enableEdgeToEdge()

        val repository = LearnRepository(applicationContext)
        val authRepository = LearnAuthRepository()
        val progressRepository = LearnProgressRepository(authRepository)
        val correctionsRepository = LearnCorrectionsRepository(authRepository)
        val factory = LearnViewModelFactory(repository, authRepository, progressRepository, correctionsRepository)

        setContent {
            MaterialTheme(
                colorScheme = lightColorScheme(primary = Cobalt),
            ) {
                Surface(Modifier.fillMaxSize()) {
                    KaribuLearnRoot(
                        onExit = { finish() },
                        viewModel = viewModel(factory = factory),
                        authRepository = authRepository,
                    )
                }
            }
        }
    }
}
