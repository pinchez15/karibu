package com.karibuhealth.app.util

import com.karibuhealth.app.domain.model.Constants

fun formatPhoneNumber(phone: String): String {
    // Remove all non-digit characters except +
    var cleaned = phone.replace(Regex("[^\\d+]"), "")

    // If starts with 0, assume Uganda local format
    if (cleaned.startsWith("0")) {
        cleaned = "+256" + cleaned.substring(1)
    }

    // If doesn't start with +, assume Uganda
    if (!cleaned.startsWith("+")) {
        cleaned = "+256$cleaned"
    }

    return cleaned
}

fun isValidUgandaPhone(phone: String): Boolean {
    val formatted = formatPhoneNumber(phone)
    return Constants.PhoneFormats.REGEX.matches(formatted)
}
