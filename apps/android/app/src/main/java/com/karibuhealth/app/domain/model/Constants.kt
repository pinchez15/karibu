package com.karibuhealth.app.domain.model

object Constants {

    // Visit status flow (dictation-first product)
    val VISIT_STATUS_FLOW = listOf(
        VisitStatus.pending,
        VisitStatus.review,
        VisitStatus.sent,
        VisitStatus.completed,
    )

    // Session expiry (7 days in milliseconds)
    const val SESSION_EXPIRY_MS = 7L * 24 * 60 * 60 * 1000

    // Payment methods
    data class PaymentMethodOption(val label: String, val disabled: Boolean)

    val PAYMENT_METHODS = mapOf(
        PaymentMethod.cash to PaymentMethodOption("Cash", disabled = false),
        PaymentMethod.mtn_momo to PaymentMethodOption("MTN Mobile Money", disabled = true),
        PaymentMethod.airtel_money to PaymentMethodOption("Airtel Money", disabled = true),
    )

    // Service types for payment categorisation
    val SERVICE_TYPES = listOf(
        "Consultation",
        "Laboratory",
        "Pharmacy",
        "Imaging",
        "Procedure",
        "Other",
    )

    // Phone number formatting (Uganda)
    object PhoneFormats {
        const val COUNTRY_CODE = "+256"
        const val EXAMPLE_FORMAT = "+256 7XX XXX XXX"
        val REGEX = Regex("^\\+256[0-9]{9}$")
    }

    // Error messages
    object ErrorMessages {
        const val NETWORK_ERROR = "Unable to connect. Your data is saved and will sync when online."
        const val PATIENT_NOT_FOUND = "Patient not found."
        const val VISIT_NOT_FOUND = "Visit not found."
    }
}
