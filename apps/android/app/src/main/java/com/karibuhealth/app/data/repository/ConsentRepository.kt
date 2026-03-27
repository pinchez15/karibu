package com.karibuhealth.app.data.repository

import com.karibuhealth.app.data.local.db.KaribuDatabase
import com.karibuhealth.app.data.local.db.converter.toCreateDto
import com.karibuhealth.app.data.local.db.converter.toDomain
import com.karibuhealth.app.data.local.db.converter.toEntity
import com.karibuhealth.app.data.local.db.dao.ConsentDao
import com.karibuhealth.app.data.local.db.dao.SyncQueueDao
import com.karibuhealth.app.data.local.db.entity.SyncQueueEntry
import com.karibuhealth.app.domain.model.*
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.json.Json
import java.time.Instant
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ConsentRepository @Inject constructor(
    private val database: KaribuDatabase,
    private val consentDao: ConsentDao,
    private val syncQueueDao: SyncQueueDao,
    private val json: Json,
) {
    fun getConsentsForVisit(patientId: String, visitId: String): Flow<List<PatientConsent>> =
        consentDao.getByPatientAndVisit(patientId, visitId).map { list -> list.map { it.toDomain() } }

    suspend fun recordConsent(
        patientId: String,
        visitId: String,
        consentType: ConsentType,
        granted: Boolean,
        grantedBy: ConsentGrantedBy = ConsentGrantedBy.patient,
        guardianName: String? = null,
        guardianRelationship: String? = null,
        consentMethod: ConsentMethod = ConsentMethod.digital_app,
        consentLanguage: String = "en",
    ): PatientConsent {
        val now = Instant.now().toString()
        val consent = PatientConsent(
            id = UUID.randomUUID().toString(),
            patientId = patientId,
            visitId = visitId,
            consentType = consentType,
            granted = granted,
            grantedAt = now,
            grantedBy = grantedBy,
            guardianName = guardianName,
            guardianRelationship = guardianRelationship,
            withdrawalAt = null,
            consentMethod = consentMethod,
            consentLanguage = consentLanguage,
            ipAddress = null,
            createdAt = now,
        )

        val entity = consent.toEntity(isSynced = false)
        val createDto = consent.toCreateDto()
        val syncEntry = SyncQueueEntry(
            id = UUID.randomUUID().toString(),
            operationType = "record_consent",
            entityType = "patient_consents",
            entityId = consent.id,
            payload = json.encodeToString(
                com.karibuhealth.app.data.remote.dto.ConsentCreateDto.serializer(),
                createDto,
            ),
            status = "pending",
            attempts = 0,
            createdAt = System.currentTimeMillis(),
        )

        database.runInTransaction {
            kotlinx.coroutines.runBlocking {
                consentDao.upsert(entity)
                syncQueueDao.insert(syncEntry)
            }
        }

        return consent
    }

    suspend fun recordAllConsents(
        patientId: String,
        visitId: String,
        grantedBy: ConsentGrantedBy = ConsentGrantedBy.patient,
        guardianName: String? = null,
        guardianRelationship: String? = null,
    ) {
        Constants.REQUIRED_CONSENT_TYPES.forEach { type ->
            recordConsent(
                patientId = patientId,
                visitId = visitId,
                consentType = type,
                granted = true,
                grantedBy = grantedBy,
                guardianName = guardianName,
                guardianRelationship = guardianRelationship,
            )
        }
    }
}
