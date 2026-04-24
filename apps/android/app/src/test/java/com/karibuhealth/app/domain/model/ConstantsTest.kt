package com.karibuhealth.app.domain.model

import org.junit.Assert.*
import org.junit.Test

class ConstantsTest {

    @Test
    fun `session expiry is 7 days`() {
        assertEquals(7L * 24 * 60 * 60 * 1000, Constants.SESSION_EXPIRY_MS)
    }

    @Test
    fun `phone format regex validates Uganda numbers`() {
        assertTrue(Constants.PhoneFormats.REGEX.matches("+256701234567"))
        assertTrue(Constants.PhoneFormats.REGEX.matches("+256770123456"))
        assertFalse(Constants.PhoneFormats.REGEX.matches("0701234567"))
        assertFalse(Constants.PhoneFormats.REGEX.matches("+1234567890"))
        assertFalse(Constants.PhoneFormats.REGEX.matches(""))
    }

    @Test
    fun `visit status flow has correct order`() {
        assertEquals(
            listOf(
                VisitStatus.pending,
                VisitStatus.review,
                VisitStatus.sent,
                VisitStatus.completed,
            ),
            Constants.VISIT_STATUS_FLOW,
        )
    }

    @Test
    fun `only cash payment is enabled`() {
        assertFalse(Constants.PAYMENT_METHODS[PaymentMethod.cash]!!.disabled)
        assertTrue(Constants.PAYMENT_METHODS[PaymentMethod.mtn_momo]!!.disabled)
        assertTrue(Constants.PAYMENT_METHODS[PaymentMethod.airtel_money]!!.disabled)
    }
}
