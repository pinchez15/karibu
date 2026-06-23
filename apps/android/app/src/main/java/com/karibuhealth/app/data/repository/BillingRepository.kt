package com.karibuhealth.app.data.repository

import com.karibuhealth.app.data.remote.api.SupabaseApi
import com.karibuhealth.app.data.remote.dto.*
import com.karibuhealth.app.domain.model.*
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class BillingRepository @Inject constructor(
    private val supabaseApi: SupabaseApi,
) {
    suspend fun getPatientBalances(clinicId: String): List<PatientBalanceItem> =
        supabaseApi.rpcBillingPatientBalances(WorklistClinicOnlyRequest(clinicId = clinicId))
            .map { row ->
                PatientBalanceItem(
                    patientId = row.patientId,
                    patientName = row.patientName.orEmpty().ifBlank { "Patient" },
                    charged = row.charged,
                    paid = row.paid,
                    balance = row.balance,
                    lastChargeAt = row.lastChargeAt,
                )
            }

    suspend fun getPatientBalance(clinicId: String, patientId: String): PatientBillingBalance {
        val rows = supabaseApi.rpcPatientBalance(
            PatientBalanceRequest(clinicId = clinicId, patientId = patientId),
        )
        val row = rows.firstOrNull()
        return PatientBillingBalance(
            charged = row?.charged ?: 0,
            paid = row?.paid ?: 0,
            balance = row?.balance ?: 0,
        )
    }

    suspend fun getCharges(clinicId: String, patientId: String): List<ChargeItem> =
        supabaseApi.getChargesForPatient(
            patientId = "eq.$patientId",
            clinicId = "eq.$clinicId",
        ).map { it.toDomain() }

    suspend fun getPayments(clinicId: String, patientId: String): List<BillingPaymentItem> =
        supabaseApi.getBillingPaymentsForPatient(
            patientId = "eq.$patientId",
            clinicId = "eq.$clinicId",
        ).map { it.toDomain() }

    suspend fun voidCharge(chargeId: String) {
        supabaseApi.rpcVoidCharge(VoidChargeRequest(chargeId = chargeId))
    }

    suspend fun recordBillingPayment(
        clinicId: String,
        patientId: String,
        amountCashUgx: Int,
        amountBarterUgx: Int,
        paymentMethod: String,
        barterDescription: String? = null,
        visitId: String? = null,
        notes: String? = null,
    ): String? {
        val response = supabaseApi.rpcRecordBillingPayment(
            RecordBillingPaymentRequest(
                clinicId = clinicId,
                patientId = patientId,
                amountCashUgx = amountCashUgx,
                paymentMethod = paymentMethod,
                visitId = visitId,
                amountBarterUgx = amountBarterUgx,
                barterDescription = barterDescription,
                notes = notes,
            ),
        )
        return response.receiptNumber
    }

    suspend fun getPatientName(patientId: String): String? {
        val rows = supabaseApi.getPatientById(id = "eq.$patientId")
        val p = rows.firstOrNull() ?: return null
        return p.displayName?.takeIf { it.isNotBlank() }
            ?: listOfNotNull(p.firstName, p.lastName).joinToString(" ").takeIf { it.isNotBlank() }
    }
}

private fun ChargeDto.toDomain() = ChargeItem(
    id = id,
    description = description,
    category = category,
    amountUgx = amountUgx,
    quantity = quantity ?: 1.0,
    unitPriceUgx = unitPriceUgx,
    visitId = visitId,
    source = source ?: "manual",
    createdAt = createdAt.orEmpty(),
    voided = voided ?: false,
)

private fun BillingPaymentDto.toDomain() = BillingPaymentItem(
    id = id,
    amountUgx = amountUgx,
    amountBarterUgx = amountBarterUgx ?: 0,
    barterDescription = barterDescription,
    paymentMethod = paymentMethod,
    receiptNumber = receiptNumber,
    createdAt = createdAt.orEmpty(),
)
