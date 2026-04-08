package com.karibuhealth.app.domain.model

object Constants {

    // Visit status flow
    val VISIT_STATUS_FLOW = listOf(
        VisitStatus.recording,
        VisitStatus.uploading,
        VisitStatus.processing,
        VisitStatus.review,
        VisitStatus.sent,
        VisitStatus.completed,
    )

    // Audio retention (90 days before automatic deletion)
    const val AUDIO_RETENTION_DAYS = 90

    // Session expiry (7 days in milliseconds)
    const val SESSION_EXPIRY_MS = 7L * 24 * 60 * 60 * 1000

    // Required consent types for DPPA compliance
    val REQUIRED_CONSENT_TYPES = listOf(
        ConsentType.audio_recording,
        ConsentType.ai_processing,
        ConsentType.data_storage,
        ConsentType.cross_border_transfer,
    )

    // Audio recording settings
    object AudioSettings {
        const val MAX_DURATION_SECONDS = 3600 // 1 hour
        const val SAMPLE_RATE = 44100
        const val CHANNELS = 1 // Mono
        const val BIT_RATE = 128000
        const val FORMAT = "m4a"
        const val MIME_TYPE = "audio/m4a"
    }

    // Language options
    data class LanguageOption(
        val label: String,
        val provider: String,
        val description: String? = null,
        val disabled: Boolean = false,
    )

    val LANGUAGE_OPTIONS = mapOf(
        SourceLanguage.eng to LanguageOption(label = "English", provider = "openai"),
        SourceLanguage.local to LanguageOption(
            label = "Local Language",
            provider = "sunbird",
            description = "Coming soon — Luganda, Acholi, Runyankole, Ateso, Lugbara, Swahili",
            disabled = true,
        ),
    )

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
        const val UPLOAD_FAILED = "Upload failed. Tap to retry."
        const val TRANSCRIPTION_FAILED = "Transcription failed. Please try again."
        const val CONSENT_REQUIRED = "Patient consent is required before recording."
        const val PATIENT_NOT_FOUND = "Patient not found."
        const val VISIT_NOT_FOUND = "Visit not found."
    }

    // Consent display labels
    val CONSENT_LABELS = mapOf(
        ConsentType.audio_recording to "Audio Recording" to "I consent to this consultation being audio recorded.",
        ConsentType.ai_processing to "AI Processing" to "I consent to the recording being processed by AI to generate clinical notes.",
        ConsentType.data_storage to "Data Storage" to "I consent to my health data being stored securely.",
        ConsentType.cross_border_transfer to "Cross-Border Transfer" to "I consent to my data being processed by servers outside Uganda.",
    )
}
