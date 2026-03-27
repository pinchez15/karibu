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
        AudioUploadEntity::class,
        PatientConsentEntity::class,
        ProviderNoteEntity::class,
        PatientNoteEntity::class,
        PaymentEntity::class,
        SyncQueueEntry::class,
    ],
    version = 1,
    exportSchema = true,
)
abstract class KaribuDatabase : RoomDatabase() {
    abstract fun clinicDao(): ClinicDao
    abstract fun staffDao(): StaffDao
    abstract fun patientDao(): PatientDao
    abstract fun visitDao(): VisitDao
    abstract fun audioUploadDao(): AudioUploadDao
    abstract fun consentDao(): ConsentDao
    abstract fun providerNoteDao(): ProviderNoteDao
    abstract fun patientNoteDao(): PatientNoteDao
    abstract fun paymentDao(): PaymentDao
    abstract fun syncQueueDao(): SyncQueueDao
}
