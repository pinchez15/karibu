package com.karibuhealth.app.data.repository

import com.karibuhealth.app.data.local.db.KaribuDatabase
import com.karibuhealth.app.data.local.db.converter.toDomain
import com.karibuhealth.app.data.local.db.converter.toEntity
import com.karibuhealth.app.data.local.db.dao.PaymentDao
import com.karibuhealth.app.data.local.db.entity.SyncQueueEntry
import com.karibuhealth.app.data.remote.dto.RecordPaymentRpcRequest
import com.karibuhealth.app.data.sync.SyncQueueHelper
import com.karibuhealth.app.domain.model.*
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import java.time.Instant
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class PaymentRepository @Inject constructor(
    private val database: KaribuDatabase,
    private val paymentDao: PaymentDao,
    private val syncQueueHelper: SyncQueueHelper,
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
        val paymentId = UUID.randomUUID().toString()
        val payment = Payment(
            id = paymentId,
            visitId = visitId,
            clinicId = clinicId,
            patientId = patientId,
            amountUgx = amountUgx,
            paymentMethod = paymentMethod,
            status = if (waived) PaymentStatus.waived else PaymentStatus.paid,
            receiptNumber = "",
            serviceType = serviceType,
            notes = notes,
            collectedBy = collectedBy,
            createdAt = now,
            updatedAt = now,
        )

        val syncEntryId = UUID.randomUUID().toString()
        val rpcBody = RecordPaymentRpcRequest(
            id = paymentId,
            visitId = visitId,
            clinicId = clinicId,
            patientId = patientId,
            amountUgx = amountUgx,
            paymentMethod = paymentMethod.name,
            status = payment.status.name,
            serviceType = serviceType,
            notes = notes,
            collectedBy = collectedBy,
            clientOpId = syncEntryId,
        )
        val syncEntry = SyncQueueEntry(
            id = syncEntryId,
            operationType = "record_payment",
            entityType = "payments",
            entityId = paymentId,
            payload = json.encodeToString(RecordPaymentRpcRequest.serializer(), rpcBody),
            status = "pending",
            attempts = 0,
            createdAt = System.currentTimeMillis(),
        )

        withContext(Dispatchers.IO) {
            database.withTransaction {
                paymentDao.upsert(payment.toEntity(isSynced = false))
                syncQueueHelper.enqueue(syncEntry)
            }
        }

        return payment
    }

    /** Billing skipped — payment no longer closes the clinical encounter. */
    suspend fun skipPayment(visitId: String, staffId: String) {
        // No queue mutation; visit lifecycle is independent of payment (EHR pivot).
    }
}
