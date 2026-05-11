package com.karibuhealth.app.data.repository

import com.karibuhealth.app.data.local.db.KaribuDatabase
import com.karibuhealth.app.data.local.db.converter.toCreateDto
import com.karibuhealth.app.data.local.db.converter.toDomain
import com.karibuhealth.app.data.local.db.converter.toEntity
import com.karibuhealth.app.data.local.db.dao.PaymentDao
import com.karibuhealth.app.data.local.db.dao.SyncQueueDao
import com.karibuhealth.app.data.local.db.dao.VisitDao
import androidx.room.withTransaction
import com.karibuhealth.app.data.local.db.entity.SyncQueueEntry
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
    private val visitDao: VisitDao,
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
        val completeEntry = SyncQueueEntry(
            id = UUID.randomUUID().toString(),
            operationType = "queue_op",
            entityType = "visits",
            entityId = visitId,
            payload = """{"rpc":"complete_visit_queue","params":{"p_visit_id":"$visitId","p_staff_id":"$collectedBy"}}""",
            status = "pending",
            attempts = 0,
            createdAt = System.currentTimeMillis(),
            dependsOn = syncEntry.id,
        )

        // withTransaction is the suspend-friendly Room transaction API. The
        // previous runInTransaction { runBlocking { ... } } pattern crashed
        // when called from viewModelScope (Main dispatcher) because the
        // sync database.runInTransaction enforces "not on main thread."
        // withContext(IO) for belt-and-braces in case withTransaction
        // dispatches differently across Room versions.
        withContext(Dispatchers.IO) {
            database.withTransaction {
                paymentDao.upsert(entity)
                syncQueueDao.insert(syncEntry)
                syncQueueDao.insert(completeEntry)
                visitDao.updateStatusAndQueueStatus(
                    id = visitId,
                    status = VisitStatus.completed.name,
                    queueStatus = QueueStatus.completed.name,
                    finalizedAt = now,
                    updatedAt = now,
                )
            }
        }

        return payment
    }

    suspend fun skipPayment(
        visitId: String,
        staffId: String,
    ) {
        val now = Instant.now().toString()
        val completeEntry = SyncQueueEntry(
            id = UUID.randomUUID().toString(),
            operationType = "queue_op",
            entityType = "visits",
            entityId = visitId,
            payload = """{"rpc":"complete_visit_queue","params":{"p_visit_id":"$visitId","p_staff_id":"$staffId"}}""",
            status = "pending",
            attempts = 0,
            createdAt = System.currentTimeMillis(),
        )

        withContext(Dispatchers.IO) {
            database.withTransaction {
                syncQueueDao.insert(completeEntry)
                visitDao.updateStatusAndQueueStatus(
                    id = visitId,
                    status = VisitStatus.completed.name,
                    queueStatus = QueueStatus.completed.name,
                    finalizedAt = now,
                    updatedAt = now,
                )
            }
        }
    }
}
