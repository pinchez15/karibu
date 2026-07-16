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
        MedicationOrderEntity::class,
        MedicationAdministrationEntity::class,
        DeliveryEntity::class,
        PostnatalObservationEntity::class,
        AdmissionNoteEntity::class,
        PregnancyEntity::class,
        AncContactEntity::class,
        HtsEventEntity::class,
        HivCareEnrollmentEntity::class,
        TbEpisodeEntity::class,
        ViralLoadTestEntity::class,
        EbolaScreeningEntity::class,
        PrescriptionOrderEntity::class,
        IvInfusionEntity::class,
        IvInfusionCheckEntity::class,
    ],
    version = 33,
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
    abstract fun deliveryDao(): DeliveryDao
    abstract fun postnatalObservationDao(): PostnatalObservationDao
    abstract fun pregnancyDao(): PregnancyDao
    abstract fun ancContactDao(): AncContactDao
    abstract fun htsEventDao(): HtsEventDao
    abstract fun hivCareDao(): HivCareDao
    abstract fun tbEpisodeDao(): TbEpisodeDao
    abstract fun viralLoadDao(): ViralLoadDao
    abstract fun ebolaScreeningDao(): EbolaScreeningDao
    abstract fun admissionNoteDao(): AdmissionNoteDao
    abstract fun admissionDao(): AdmissionDao
    abstract fun admissionObservationDao(): AdmissionObservationDao
    abstract fun medicationOrderDao(): MedicationOrderDao
    abstract fun medicationAdministrationDao(): MedicationAdministrationDao
    abstract fun prescriptionOrderDao(): PrescriptionOrderDao
    abstract fun ivInfusionDao(): IvInfusionDao
    abstract fun ivInfusionCheckDao(): IvInfusionCheckDao
}
