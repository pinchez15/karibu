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
import com.karibuhealth.app.data.local.db.migrations.MIGRATION_12_13
import com.karibuhealth.app.data.local.db.migrations.MIGRATION_13_14
import com.karibuhealth.app.data.local.db.migrations.MIGRATION_14_15
import com.karibuhealth.app.data.local.db.migrations.MIGRATION_15_16
import com.karibuhealth.app.data.local.db.migrations.MIGRATION_16_17
import com.karibuhealth.app.data.local.db.migrations.MIGRATION_17_18
import com.karibuhealth.app.data.local.db.migrations.MIGRATION_18_19
import com.karibuhealth.app.data.local.db.migrations.MIGRATION_19_20
import com.karibuhealth.app.data.local.db.migrations.MIGRATION_20_21
import com.karibuhealth.app.data.local.db.migrations.MIGRATION_21_22
import com.karibuhealth.app.data.local.db.migrations.MIGRATION_22_23
import com.karibuhealth.app.data.local.db.migrations.MIGRATION_23_24
import com.karibuhealth.app.data.local.db.migrations.MIGRATION_24_25
import com.karibuhealth.app.data.local.db.migrations.MIGRATION_25_26
import com.karibuhealth.app.data.local.db.migrations.MIGRATION_28_29
import com.karibuhealth.app.data.local.db.migrations.MIGRATION_29_30
import com.karibuhealth.app.data.local.db.migrations.MIGRATION_30_31
import com.karibuhealth.app.data.local.db.migrations.MIGRATION_27_28
import com.karibuhealth.app.data.local.db.migrations.MIGRATION_26_27
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
                MIGRATION_12_13,
                MIGRATION_13_14,
                MIGRATION_14_15,
                MIGRATION_15_16,
                MIGRATION_16_17,
                MIGRATION_17_18,
                MIGRATION_18_19,
                MIGRATION_19_20,
                MIGRATION_20_21,
                MIGRATION_21_22,
                MIGRATION_22_23,
                MIGRATION_23_24,
                MIGRATION_24_25,
                MIGRATION_25_26,
                MIGRATION_26_27,
                MIGRATION_27_28,
                MIGRATION_28_29,
                MIGRATION_29_30,
                MIGRATION_30_31,
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
    @Provides fun provideClinicCatalogDao(db: KaribuDatabase): ClinicCatalogDao = db.clinicCatalogDao()
    @Provides fun provideReferralDao(db: KaribuDatabase): ReferralDao = db.referralDao()
    @Provides fun provideDeliveryDao(db: KaribuDatabase): DeliveryDao = db.deliveryDao()
    @Provides fun providePostnatalObservationDao(db: KaribuDatabase): PostnatalObservationDao =
        db.postnatalObservationDao()
    @Provides fun provideAdmissionNoteDao(db: KaribuDatabase): AdmissionNoteDao =
        db.admissionNoteDao()
    @Provides fun providePregnancyDao(db: KaribuDatabase): PregnancyDao = db.pregnancyDao()
    @Provides fun provideAncContactDao(db: KaribuDatabase): AncContactDao = db.ancContactDao()
    @Provides fun provideHtsEventDao(db: KaribuDatabase): HtsEventDao = db.htsEventDao()
    @Provides fun provideHivCareDao(db: KaribuDatabase): HivCareDao = db.hivCareDao()
    @Provides fun provideTbEpisodeDao(db: KaribuDatabase): TbEpisodeDao = db.tbEpisodeDao()
    @Provides fun provideViralLoadDao(db: KaribuDatabase): ViralLoadDao = db.viralLoadDao()
    @Provides fun provideEbolaScreeningDao(db: KaribuDatabase): EbolaScreeningDao = db.ebolaScreeningDao()
    @Provides fun provideAdmissionDao(db: KaribuDatabase): AdmissionDao = db.admissionDao()
    @Provides fun provideAdmissionObservationDao(db: KaribuDatabase): AdmissionObservationDao =
        db.admissionObservationDao()
    @Provides fun provideMedicationOrderDao(db: KaribuDatabase): MedicationOrderDao =
        db.medicationOrderDao()
    @Provides fun provideMedicationAdministrationDao(db: KaribuDatabase): MedicationAdministrationDao =
        db.medicationAdministrationDao()
    @Provides fun providePrescriptionOrderDao(db: KaribuDatabase): PrescriptionOrderDao =
        db.prescriptionOrderDao()
    @Provides fun provideIvInfusionDao(db: KaribuDatabase): IvInfusionDao = db.ivInfusionDao()
    @Provides fun provideIvInfusionCheckDao(db: KaribuDatabase): IvInfusionCheckDao =
        db.ivInfusionCheckDao()
}
