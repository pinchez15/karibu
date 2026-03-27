package com.karibuhealth.app.data.local.db.converter

import com.karibuhealth.app.data.remote.dto.PatientDto
import com.karibuhealth.app.data.remote.dto.VisitDto
import com.karibuhealth.app.domain.model.*
import org.junit.Assert.*
import org.junit.Test

class MappersTest {

    @Test
    fun `PatientDto to Entity preserves all fields`() {
        val dto = PatientDto(
            id = "p1",
            clinicId = "c1",
            patientNumber = "KDC-0001",
            whatsappNumber = "+256701234567",
            displayName = "John Doe",
            dateOfBirth = "1990-01-15",
            sex = "M",
            createdAt = "2026-01-01T00:00:00Z",
            updatedAt = "2026-01-01T00:00:00Z",
        )

        val entity = dto.toEntity(isSynced = true)

        assertEquals("p1", entity.id)
        assertEquals("c1", entity.clinicId)
        assertEquals("KDC-0001", entity.patientNumber)
        assertEquals("+256701234567", entity.whatsappNumber)
        assertEquals("John Doe", entity.displayName)
        assertEquals("M", entity.sex)
        assertTrue(entity.isSynced)
    }

    @Test
    fun `PatientEntity to Domain maps correctly`() {
        val dto = PatientDto(
            id = "p1", clinicId = "c1",
            displayName = "Jane", sex = "F",
        )
        val entity = dto.toEntity()
        val domain = entity.toDomain()

        assertEquals("p1", domain.id)
        assertEquals("c1", domain.clinicId)
        assertEquals("Jane", domain.displayName)
        assertEquals("F", domain.sex)
        assertNull(domain.patientNumber) // Not set in dto
    }

    @Test
    fun `Patient domain to CreateDto`() {
        val patient = Patient(
            id = "p1", clinicId = "c1", patientNumber = null,
            whatsappNumber = "+256701234567", displayName = "Test",
            dateOfBirth = null, sex = null,
            createdAt = "", updatedAt = "",
        )

        val createDto = patient.toCreateDto()

        assertEquals("p1", createDto.id)
        assertEquals("c1", createDto.clinicId)
        assertEquals("+256701234567", createDto.whatsappNumber)
        assertEquals("Test", createDto.displayName)
    }

    @Test
    fun `VisitDto to Entity to Domain roundtrip`() {
        val dto = VisitDto(
            id = "v1", clinicId = "c1", patientId = "p1",
            status = "recording", queueStatus = "waiting",
            priority = "normal", sourceLanguage = "eng",
            consentRecording = true, consentVerified = false,
            reviewStatus = "pending", visitDate = "2026-03-27",
        )

        val entity = dto.toEntity()
        val domain = entity.toDomain()

        assertEquals("v1", domain.id)
        assertEquals(VisitStatus.recording, domain.status)
        assertEquals(QueueStatus.waiting, domain.queueStatus)
        assertEquals(VisitPriority.normal, domain.priority)
        assertEquals(SourceLanguage.eng, domain.sourceLanguage)
        assertTrue(domain.consentRecording)
        assertFalse(domain.consentVerified)
        assertEquals(ReviewStatus.pending, domain.reviewStatus)
    }

    @Test
    fun `Visit domain to CreateDto`() {
        val visit = Visit(
            id = "v1", clinicId = "c1", patientId = "p1",
            doctorId = "d1", nurseId = null,
            status = VisitStatus.recording,
            queueStatus = QueueStatus.waiting,
            queuePosition = null, priority = VisitPriority.normal,
            chiefComplaint = "Headache",
            checkedInAt = null, consentRecording = true,
            consentTimestamp = null,
            sourceLanguage = SourceLanguage.eng,
            consentVerified = false, consentId = null,
            reviewStatus = ReviewStatus.pending,
            reviewedBy = null, reviewedAt = null,
            audioDeletedAt = null, retentionExpiresAt = null,
            diagnosis = null, medications = null,
            followUpInstructions = null, testsOrdered = null,
            visitDate = "2026-03-27",
            createdAt = "", updatedAt = "",
            finalizedAt = null, errorMessage = null, errorAt = null,
        )

        val createDto = visit.toCreateDto()

        assertEquals("v1", createDto.id)
        assertEquals("c1", createDto.clinicId)
        assertEquals("p1", createDto.patientId)
        assertEquals("d1", createDto.doctorId)
        assertEquals("eng", createDto.sourceLanguage)
        assertEquals("Headache", createDto.chiefComplaint)
    }

    @Test
    fun `handles nullable fields gracefully`() {
        val dto = PatientDto(id = "p1", clinicId = "c1")
        val entity = dto.toEntity()
        val domain = entity.toDomain()

        assertNull(domain.patientNumber)
        assertNull(domain.whatsappNumber)
        assertNull(domain.displayName)
        assertNull(domain.dateOfBirth)
        assertNull(domain.sex)
    }
}
