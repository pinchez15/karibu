package com.karibuhealth.app.di

import android.content.Context
import androidx.work.WorkManager
import com.karibuhealth.app.data.sync.TokenRefresher
import com.karibuhealth.app.ui.auth.ClerkAuthManager
import com.karibuhealth.app.util.NetworkMonitor
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object AppModule {

    @Provides
    @Singleton
    fun provideNetworkMonitor(@ApplicationContext context: Context): NetworkMonitor {
        return NetworkMonitor(context)
    }

    /**
     * WP2 D3: bind the sync engine's [TokenRefresher] seam to the concrete
     * Clerk implementation. Kept as a @Provides delegate (not constructor
     * injection into SyncEngine) so the data layer never imports ui.auth.
     */
    @Provides
    @Singleton
    fun provideTokenRefresher(clerkAuthManager: ClerkAuthManager): TokenRefresher =
        clerkAuthManager

    @Provides
    @Singleton
    fun provideWorkManager(@ApplicationContext context: Context): WorkManager =
        WorkManager.getInstance(context)
}
