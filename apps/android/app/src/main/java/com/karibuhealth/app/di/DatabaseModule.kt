package com.karibuhealth.app.di

import android.content.Context
import androidx.room.Room
import com.karibuhealth.app.data.local.db.KaribuDatabase
import com.karibuhealth.app.data.local.db.dao.*
import com.karibuhealth.app.data.local.db.migrations.MIGRATION_2_3
import com.karibuhealth.app.data.local.db.migrations.MIGRATION_3_4
import com.karibuhealth.app.data.local.db.migrations.MIGRATION_4_5
import com.karibuhealth.app.data.local.db.migrations.MIGRATION_5_6
import com.karibuhealth.app.data.local.db.migrations.MIGRATION_6_7
import com.karibuhealth.app.data.local.db.migrations.MIGRATION_7_8
import com.karibuhealth.app.data.local.db.migrations.MIGRATION_8_9
import com.karibuhealth.app.data.local.db.migrations.MIGRATION_10_11
import com.karibuhealth.app.data.local.db.migrations.MIGRATION_11_12
import com.karibuhealth.app.data.local.db.migrations.MIGRATION_9_10
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
            // Offline-first means unsynced patient/visit/payment rows live only
            // in this DB until the next sync. fallbackToDestructiveMigration()
            // would wipe all of that on every schema bump. Only allow destructive
            // wipe on downgrade. Schema upgrades MUST register a real Migration
            // here or Room will throw on first open.
            .addMigrations(
                MIGRATION_2_3, MIGRATION_3_4, MIGRATION_4_5, MIGRATION_5_6, MIGRATION_6_7, MIGRATION_7_8,
                MIGRATION_8_9,
                MIGRATION_9_10,
                MIGRATION_10_11,
                MIGRATION_11_12,
            )
            .fallbackToDestructiveMigrationOnDowngrade()
            .build()
    }

    @Provides fun provideClinicDao(db: KaribuDatabase): ClinicDao = db.clinicDao()
    @Provides fun provideStaffDao(db: KaribuDatabase): StaffDao = db.staffDao()
    @Provides fun providePatientDao(db: KaribuDatabase): PatientDao = db.patientDao()
    @Provides fun provideVisitDao(db: KaribuDatabase): VisitDao = db.visitDao()
    @Provides fun provideProviderNoteDao(db: KaribuDatabase): ProviderNoteDao = db.providerNoteDao()
    @Provides fun providePatientNoteDao(db: KaribuDatabase): PatientNoteDao = db.patientNoteDao()
    @Provides fun providePatientVitalsDao(db: KaribuDatabase): PatientVitalsDao = db.patientVitalsDao()
    @Provides fun providePaymentDao(db: KaribuDatabase): PaymentDao = db.paymentDao()
    @Provides fun provideSyncQueueDao(db: KaribuDatabase): SyncQueueDao = db.syncQueueDao()
    @Provides fun providePharmacyStockDao(db: KaribuDatabase): PharmacyStockDao = db.pharmacyStockDao()
}
