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
            patientId = 100001,
            patientNumber = "100001",
            firstName = "John",
            lastName = "Doe",
            displayName = "John Doe",
            whatsappNumber = "+256701234567",
            dateOfBirth = "1990-01-15",
            sex = "M",
            createdAt = "2026-01-01T00:00:00Z",
            updatedAt = "2026-01-01T00:00:00Z",
        )

        val entity = dto.toEntity(isSynced = true)

        assertEquals("p1", entity.id)
        assertEquals("c1", entity.clinicId)
        assertEquals(100001L, entity.patientId)
        assertEquals("John", entity.firstName)
        assertEquals("Doe", entity.lastName)
        assertEquals("+256701234567", entity.whatsappNumber)
        assertEquals("M", entity.sex)
        assertTrue(entity.isSynced)
    }

    @Test
    fun `PatientEntity to Domain maps correctly`() {
        val dto = PatientDto(
            id = "p1", clinicId = "c1",
            firstName = "Jane", lastName = "Doe", sex = "F",
        )
        val entity = dto.toEntity()
        val domain = entity.toDomain()

        assertEquals("p1", domain.id)
        assertEquals("c1", domain.clinicId)
        assertEquals("Jane", domain.firstName)
        assertEquals("Doe", domain.lastName)
        assertEquals("Jane Doe", domain.fullName)
        assertEquals("F", domain.sex)
        assertNull(domain.patientId)
    }

    @Test
    fun `Patient domain to CreateDto`() {
        val patient = Patient(
            id = "p1", clinicId = "c1",
            patientId = null, patientNumber = null,
            firstName = "Grace", lastName = "Natukunda",
            displayName = "Grace Natukunda",
            whatsappNumber = "+256701234567",
            dateOfBirth = null, sex = null,
            createdAt = "", updatedAt = "",
        )

        val createDto = patient.toCreateDto()

        assertEquals("p1", createDto.id)
        assertEquals("c1", createDto.clinicId)
        assertEquals("Grace", createDto.firstName)
        assertEquals("Natukunda", createDto.lastName)
        assertEquals("+256701234567", createDto.whatsappNumber)
    }

    @Test
    fun `VisitDto to Entity to Domain roundtrip`() {
        val dto = VisitDto(
            id = "v1", clinicId = "c1", patientId = "p1",
            status = "pending", queueStatus = "waiting",
            priority = "normal",
            reviewStatus = "pending", visitDate = "2026-04-24",
        )

        val entity = dto.toEntity()
        val domain = entity.toDomain()

        assertEquals("v1", domain.id)
        assertEquals(VisitStatus.pending, domain.status)
        assertEquals(QueueStatus.waiting, domain.queueStatus)
        assertEquals(VisitPriority.normal, domain.priority)
        assertEquals(ReviewStatus.pending, domain.reviewStatus)
    }

    @Test
    fun `Visit domain to CreateDto`() {
        val visit = Visit(
            id = "v1", clinicId = "c1", patientId = "p1",
            doctorId = "d1", nurseId = null,
            status = VisitStatus.pending,
            queueStatus = QueueStatus.waiting,
            queuePosition = null, priority = VisitPriority.normal,
            chiefComplaint = "Headache",
            checkedInAt = null,
            reviewStatus = ReviewStatus.pending,
            reviewedBy = null, reviewedAt = null,
            diagnosis = null, medications = null,
            followUpInstructions = null, testsOrdered = null,
            visitDate = "2026-04-24",
            createdAt = "", updatedAt = "",
            finalizedAt = null, errorMessage = null, errorAt = null,
        )

        val createDto = visit.toCreateDto()

        assertEquals("v1", createDto.id)
        assertEquals("c1", createDto.clinicId)
        assertEquals("p1", createDto.patientId)
        assertEquals("d1", createDto.doctorId)
        assertEquals("Headache", createDto.chiefComplaint)
    }

    @Test
    fun `handles nullable fields gracefully`() {
        val dto = PatientDto(id = "p1", clinicId = "c1")
        val entity = dto.toEntity()
        val domain = entity.toDomain()

        assertNull(domain.patientId)
        assertNull(domain.whatsappNumber)
        assertNull(domain.firstName)
        assertNull(domain.lastName)
        assertNull(domain.dateOfBirth)
        assertNull(domain.sex)
        assertEquals("", domain.fullName)
    }

    @Test
    fun `fullName computed property works correctly`() {
        val patientBothNames = Patient(
            id = "p1", clinicId = "c1", patientId = null, patientNumber = null,
            firstName = "Grace", lastName = "Natukunda", displayName = "Grace Natukunda",
            whatsappNumber = null, dateOfBirth = null, sex = null,
            createdAt = "", updatedAt = "",
        )
        assertEquals("Grace Natukunda", patientBothNames.fullName)

        val patientFirstOnly = patientBothNames.copy(firstName = "Grace", lastName = null)
        assertEquals("Grace", patientFirstOnly.fullName)

        val patientLastOnly = patientBothNames.copy(firstName = null, lastName = "Natukunda")
        assertEquals("Natukunda", patientLastOnly.fullName)

        val patientFallback = patientBothNames.copy(firstName = null, lastName = null, displayName = "Legacy Name")
        assertEquals("Legacy Name", patientFallback.fullName)
    }
}
