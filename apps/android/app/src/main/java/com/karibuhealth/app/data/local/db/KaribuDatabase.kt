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
        PaymentEntity::class,
        SyncQueueEntry::class,
    ],
    version = 3,
    exportSchema = true,
)
abstract class KaribuDatabase : RoomDatabase() {
    abstract fun clinicDao(): ClinicDao
    abstract fun staffDao(): StaffDao
    abstract fun patientDao(): PatientDao
    abstract fun visitDao(): VisitDao
    abstract fun providerNoteDao(): ProviderNoteDao
    abstract fun patientNoteDao(): PatientNoteDao
    abstract fun paymentDao(): PaymentDao
    abstract fun syncQueueDao(): SyncQueueDao
}
