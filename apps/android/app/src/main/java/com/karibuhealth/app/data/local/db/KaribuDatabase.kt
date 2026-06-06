package com.karibuhealth.app.data.local.db

import androidx.room.Database
import androidx.room.RoomDatabase
import com.karibuhealth.app.data.local.db.dao.*
import com.karibuhealth.app.data.local.db.entity.*

@Database(
    entities = [
        ClinicEntity::class,
        StaffEntity::class,
        PatientEntity::class,
        VisitEntity::class,
        ProviderNoteEntity::class,
        PatientNoteEntity::class,
        PatientVitalsEntity::class,
        PaymentEntity::class,
        SyncQueueEntry::class,
        PharmacyStockItemEntity::class,
        ClinicLabCatalogEntity::class,
        ClinicFormularyCatalogEntity::class,
        ReferralEntity::class,
        AdmissionEntity::class,
        AdmissionObservationEntity::class,
    ],
    version = 16,
    exportSchema = true,
)
abstract class KaribuDatabase : RoomDatabase() {
    abstract fun clinicDao(): ClinicDao
    abstract fun staffDao(): StaffDao
    abstract fun patientDao(): PatientDao
    abstract fun visitDao(): VisitDao
    abstract fun providerNoteDao(): ProviderNoteDao
    abstract fun patientNoteDao(): PatientNoteDao
    abstract fun patientVitalsDao(): PatientVitalsDao
    abstract fun paymentDao(): PaymentDao
    abstract fun syncQueueDao(): SyncQueueDao
    abstract fun pharmacyStockDao(): PharmacyStockDao
    abstract fun clinicCatalogDao(): ClinicCatalogDao
    abstract fun referralDao(): ReferralDao
    abstract fun admissionDao(): AdmissionDao
    abstract fun admissionObservationDao(): AdmissionObservationDao
}
