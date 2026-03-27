package com.karibuhealth.app.di

import android.content.Context
import androidx.room.Room
import com.karibuhealth.app.data.local.db.KaribuDatabase
import com.karibuhealth.app.data.local.db.dao.*
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object DatabaseModule {

    @Provides
    @Singleton
    fun provideDatabase(@ApplicationContext context: Context): KaribuDatabase {
        return Room.databaseBuilder(
            context,
            KaribuDatabase::class.java,
            "karibu_health.db",
        )
            .fallbackToDestructiveMigration()
            .build()
    }

    @Provides fun provideClinicDao(db: KaribuDatabase): ClinicDao = db.clinicDao()
    @Provides fun provideStaffDao(db: KaribuDatabase): StaffDao = db.staffDao()
    @Provides fun providePatientDao(db: KaribuDatabase): PatientDao = db.patientDao()
    @Provides fun provideVisitDao(db: KaribuDatabase): VisitDao = db.visitDao()
    @Provides fun provideAudioUploadDao(db: KaribuDatabase): AudioUploadDao = db.audioUploadDao()
    @Provides fun provideConsentDao(db: KaribuDatabase): ConsentDao = db.consentDao()
    @Provides fun provideProviderNoteDao(db: KaribuDatabase): ProviderNoteDao = db.providerNoteDao()
    @Provides fun providePatientNoteDao(db: KaribuDatabase): PatientNoteDao = db.patientNoteDao()
    @Provides fun providePaymentDao(db: KaribuDatabase): PaymentDao = db.paymentDao()
    @Provides fun provideSyncQueueDao(db: KaribuDatabase): SyncQueueDao = db.syncQueueDao()
}
