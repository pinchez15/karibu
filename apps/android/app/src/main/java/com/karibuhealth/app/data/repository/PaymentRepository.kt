package com.karibuhealth.app.data.repository

import com.karibuhealth.app.data.local.db.KaribuDatabase
import com.karibuhealth.app.data.local.db.converter.toCreateDto
import com.karibuhealth.app.data.local.db.converter.toDomain
import com.karibuhealth.app.data.local.db.converter.toEntity
import com.karibuhealth.app.data.local.db.dao.PaymentDao
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
class PaymentRepository @Inject constructor(
    private val database: KaribuDatabase,
    private val paymentDao: PaymentDao,
    private val syncQueueDao: SyncQueueDao,
    private val json: Json,
) {
    fun getPaymentForVisit(visitId: String): Flow<Payment?> =
        paymentDao.getByVisitId(visitId).map { it?.toDomain() }

    suspend fun recordPayment(
        visitId: String,
        clinicId: String,
        patientId: String,
        amountUgx: Int,
        paymentMethod: PaymentMethod,
        collectedBy: String,
        serviceType: String? = null,
        notes: String? = null,
        waived: Boolean = false,
    ): Payment {
        val now = Instant.now().toString()
        val payment = Payment(
            id = UUID.randomUUID().toString(),
            visitId = visitId,
            clinicId = clinicId,
            patientId = patientId,
            amountUgx = amountUgx,
            paymentMethod = paymentMethod,
            status = if (waived) PaymentStatus.waived else PaymentStatus.paid,
            receiptNumber = "", // Assigned by server
            serviceType = serviceType,
            notes = notes,
            collectedBy = collectedBy,
            createdAt = now,
            updatedAt = now,
        )

        val entity = payment.toEntity(isSynced = false)
        val createDto = payment.toCreateDto()
        val syncEntry = SyncQueueEntry(
            id = UUID.randomUUID().toString(),
            operationType = "record_payment",
            entityType = "payments",
            entityId = payment.id,
            payload = json.encodeToString(
                com.karibuhealth.app.data.remote.dto.PaymentCreateDto.serializer(),
                createDto,
            ),
            status = "pending",
            attempts = 0,
            createdAt = System.currentTimeMillis(),
        )

        database.runInTransaction {
            kotlinx.coroutines.runBlocking {
                paymentDao.upsert(entity)
                syncQueueDao.insert(syncEntry)
            }
        }

        return payment
    }
}
