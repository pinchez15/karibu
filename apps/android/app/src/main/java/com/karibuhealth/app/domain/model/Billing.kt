package com.karibuhealth.app.domain.model

data class PatientBalanceItem(
    val patientId: String,
    val patientName: String,
    val charged: Long,
    val paid: Long,
    val balance: Long,
    val lastChargeAt: String? = null,
)

data class PatientBillingBalance(
    val charged: Long,
    val paid: Long,
    val balance: Long,
)

data class ChargeItem(
    val id: String,
    val description: String,
    val category: String?,
    val amountUgx: Int,
    val quantity: Double,
    val unitPriceUgx: Int?,
    val visitId: String?,
    val source: String,
    val createdAt: String,
    val voided: Boolean,
)

data class BillingPaymentItem(
    val id: String,
    val amountUgx: Int,
    val amountBarterUgx: Int,
    val barterDescription: String?,
    val paymentMethod: String,
    val receiptNumber: String?,
    val createdAt: String,
)
