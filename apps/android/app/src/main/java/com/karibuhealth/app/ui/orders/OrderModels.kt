package com.karibuhealth.app.ui.orders

import com.karibuhealth.app.ui.components.KhStatusKind

enum class OrderCategory { All, Labs, Pharmacy, Referrals }

enum class OrderKind { Lab, Pharmacy, Referral }

data class OrderRow(
    val id: String,
    val visitId: String?,
    val patientId: String,
    val patientName: String,
    val kind: OrderKind,
    val summary: String,
    val statusLabel: String,
    val statusKind: KhStatusKind,
)
