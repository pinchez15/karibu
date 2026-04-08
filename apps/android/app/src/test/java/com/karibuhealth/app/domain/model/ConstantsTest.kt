package com.karibuhealth.app.domain.model

import org.junit.Assert.*
import org.junit.Test

class ConstantsTest {

    @Test
    fun `required consent types has exactly 4 entries`() {
        assertEquals(4, Constants.REQUIRED_CONSENT_TYPES.size)
        assertTrue(Constants.REQUIRED_CONSENT_TYPES.contains(ConsentType.audio_recording))
        assertTrue(Constants.REQUIRED_CONSENT_TYPES.contains(ConsentType.ai_processing))
        assertTrue(Constants.REQUIRED_CONSENT_TYPES.contains(ConsentType.data_storage))
        assertTrue(Constants.REQUIRED_CONSENT_TYPES.contains(ConsentType.cross_border_transfer))
    }

    @Test
    fun `audio settings match Expo app`() {
        assertEquals(3600, Constants.AudioSettings.MAX_DURATION_SECONDS)
        assertEquals(44100, Constants.AudioSettings.SAMPLE_RATE)
        assertEquals(1, Constants.AudioSettings.CHANNELS)
        assertEquals(128000, Constants.AudioSettings.BIT_RATE)
        assertEquals("m4a", Constants.AudioSettings.FORMAT)
    }

    @Test
    fun `audio retention is 90 days`() {
        assertEquals(90, Constants.AUDIO_RETENTION_DAYS)
    }

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
                VisitStatus.recording,
                VisitStatus.uploading,
                VisitStatus.processing,
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

    @Test
    fun `english language is enabled, local is disabled`() {
        assertFalse(Constants.LANGUAGE_OPTIONS[SourceLanguage.eng]!!.disabled)
        assertTrue(Constants.LANGUAGE_OPTIONS[SourceLanguage.local]!!.disabled)
    }
}
