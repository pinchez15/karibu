package com.karibuhealth.app.data.local.db.converter

import com.karibuhealth.app.data.local.db.entity.*
import com.karibuhealth.app.data.remote.dto.*
import com.karibuhealth.app.domain.model.*

// ========== Clinic ==========

fun ClinicDto.toEntity() = ClinicEntity(
    id = id, name = name, slug = slug,
    clerkOrganizationId = clerkOrganizationId,
    timezone = timezone, isActive = isActive,
    createdAt = createdAt, updatedAt = updatedAt,
)

fun ClinicEntity.toDomain() = Clinic(
    id = id, name = name, slug = slug,
    clerkOrganizationId = clerkOrganizationId,
    timezone = timezone, isActive = isActive,
    createdAt = createdAt, updatedAt = updatedAt,
)

// ========== Staff ==========

fun StaffDto.toEntity() = StaffEntity(
    id = id, clerkUserId = clerkUserId, clinicId = clinicId,
    email = email, displayName = displayName, role = role,
    isActive = isActive, deactivatedAt = deactivatedAt,
    createdAt = createdAt, updatedAt = updatedAt,
)

fun StaffEntity.toDomain() = Staff(
    id = id, clerkUserId = clerkUserId, clinicId = clinicId,
    email = email, displayName = displayName,
    role = StaffRole.valueOf(role),
    isActive = isActive, deactivatedAt = deactivatedAt,
    createdAt = createdAt, updatedAt = updatedAt,
)

// ========== Patient ==========

fun PatientDto.toEntity(isSynced: Boolean = true) = PatientEntity(
    id = id, clinicId = clinicId,
    patientId = patientId, patientNumber = patientNumber,
    firstName = firstName, lastName = lastName, displayName = displayName,
    whatsappNumber = whatsappNumber,
    dateOfBirth = dateOfBirth, sex = sex,
    createdAt = createdAt, updatedAt = updatedAt,
    isSynced = isSynced,
)

fun PatientEntity.toDomain() = Patient(
    id = id, clinicId = clinicId,
    patientId = patientId, patientNumber = patientNumber,
    firstName = firstName, lastName = lastName, displayName = displayName,
    whatsappNumber = whatsappNumber,
    dateOfBirth = dateOfBirth, sex = sex,
    createdAt = createdAt, updatedAt = updatedAt,
    isSynced = isSynced,
)

fun Patient.toEntity(isSynced: Boolean = true, localCreatedAt: Long? = null) = PatientEntity(
    id = id, clinicId = clinicId,
    patientId = patientId, patientNumber = patientNumber,
    firstName = firstName, lastName = lastName, displayName = displayName,
    whatsappNumber = whatsappNumber,
    dateOfBirth = dateOfBirth, sex = sex,
    createdAt = createdAt, updatedAt = updatedAt,
    isSynced = isSynced, localCreatedAt = localCreatedAt,
)

fun Patient.toCreateDto() = PatientCreateDto(
    id = id, clinicId = clinicId,
    firstName = firstName, lastName = lastName,
    whatsappNumber = whatsappNumber,
    dateOfBirth = dateOfBirth, sex = sex,
)

// ========== Visit ==========

fun VisitDto.toEntity(isSynced: Boolean = true) = VisitEntity(
    id = id, clinicId = clinicId, patientId = patientId,
    doctorId = doctorId, nurseId = nurseId,
    status = status, queueStatus = queueStatus,
    queuePosition = queuePosition, priority = priority,
    chiefComplaint = chiefComplaint, checkedInAt = checkedInAt,
    department = department,
    reviewStatus = reviewStatus,
    reviewedBy = reviewedBy, reviewedAt = reviewedAt,
    diagnosis = diagnosis, medications = medications,
    followUpInstructions = followUpInstructions, testsOrdered = testsOrdered,
    visitDate = visitDate, createdAt = createdAt, updatedAt = updatedAt,
    finalizedAt = finalizedAt, errorMessage = errorMessage, errorAt = errorAt,
    documentationComplete = documentationComplete,
    documentationCompletedAt = documentationCompletedAt,
    isSynced = isSynced,
)

fun VisitEntity.toDomain() = Visit(
    id = id, clinicId = clinicId, patientId = patientId,
    doctorId = doctorId, nurseId = nurseId,
    status = VisitStatus.valueOf(status),
    queueStatus = QueueStatus.valueOf(queueStatus),
    queuePosition = queuePosition,
    priority = VisitPriority.valueOf(priority),
    chiefComplaint = chiefComplaint, checkedInAt = checkedInAt,
    department = runCatching { Department.valueOf(department) }.getOrDefault(Department.opd),
    reviewStatus = ReviewStatus.valueOf(reviewStatus),
    reviewedBy = reviewedBy, reviewedAt = reviewedAt,
    diagnosis = diagnosis, medications = medications,
    followUpInstructions = followUpInstructions, testsOrdered = testsOrdered,
    visitDate = visitDate, createdAt = createdAt, updatedAt = updatedAt,
    finalizedAt = finalizedAt, errorMessage = errorMessage, errorAt = errorAt,
    documentationComplete = documentationComplete,
    documentationCompletedAt = documentationCompletedAt,
    isSynced = isSynced,
)

fun Visit.toCreateDto() = VisitCreateDto(
    id = id, clinicId = clinicId, patientId = patientId,
    doctorId = doctorId, visitDate = visitDate,
    chiefComplaint = chiefComplaint,
    department = department.name,
)

fun Visit.toCreateRpcDto() = VisitCreateRpcDto(
    id = id, clinicId = clinicId, patientId = patientId,
    doctorId = doctorId, visitDate = visitDate,
    chiefComplaint = chiefComplaint,
    department = department.name,
)

fun Visit.toEntity(isSynced: Boolean = true) = VisitEntity(
    id = id, clinicId = clinicId, patientId = patientId,
    doctorId = doctorId, nurseId = nurseId,
    status = status.name, queueStatus = queueStatus.name,
    queuePosition = queuePosition, priority = priority.name,
    chiefComplaint = chiefComplaint, checkedInAt = checkedInAt,
    department = department.name,
    reviewStatus = reviewStatus.name,
    reviewedBy = reviewedBy, reviewedAt = reviewedAt,
    diagnosis = diagnosis, medications = medications,
    followUpInstructions = followUpInstructions, testsOrdered = testsOrdered,
    visitDate = visitDate, createdAt = createdAt, updatedAt = updatedAt,
    finalizedAt = finalizedAt, errorMessage = errorMessage, errorAt = errorAt,
    documentationComplete = documentationComplete,
    documentationCompletedAt = documentationCompletedAt,
    isSynced = isSynced,
)

// ========== ProviderNote ==========

fun ProviderNoteDto.toEntity() = ProviderNoteEntity(
    id = id, visitId = visitId, transcript = transcript,
    noteContent = noteContent,
    structuredData = structuredData, status = status,
    createdAt = createdAt, updatedAt = updatedAt,
    finalizedAt = finalizedAt, finalizedBy = finalizedBy,
)

fun ProviderNoteEntity.toDomain() = ProviderNote(
    id = id, visitId = visitId, transcript = transcript,
    noteContent = noteContent, structuredData = structuredData,
    status = NoteStatus.valueOf(status),
    createdAt = createdAt, updatedAt = updatedAt,
    finalizedAt = finalizedAt, finalizedBy = finalizedBy,
)

// ========== PatientNote ==========

fun PatientNoteDto.toEntity() = PatientNoteEntity(
    id = id, visitId = visitId, content = content,
    language = language, status = status, source = source,
    createdAt = createdAt, updatedAt = updatedAt,
)

fun PatientNoteEntity.toDomain() = PatientNote(
    id = id, visitId = visitId, content = content,
    language = language, status = NoteStatus.valueOf(status),
    source = runCatching { PatientNoteSource.valueOf(source) }
        .getOrDefault(PatientNoteSource.ai_generated),
    createdAt = createdAt, updatedAt = updatedAt,
)

// ========== PatientVitals ==========

fun PatientVitalsDto.toEntity(isSynced: Boolean = true) = PatientVitalsEntity(
    id = id, patientId = patientId, visitId = visitId,
    recordedAt = recordedAt, recordedBy = recordedBy,
    weightKg = weightKg, heightCm = heightCm, tempC = tempC,
    bpSystolic = bpSystolic, bpDiastolic = bpDiastolic,
    pulseBpm = pulseBpm, respRate = respRate, spo2Pct = spo2Pct,
    muacCm = muacCm, notes = notes, isSynced = isSynced,
)

fun PatientVitalsEntity.toDomain() = PatientVitals(
    id = id, patientId = patientId, visitId = visitId,
    recordedAt = recordedAt, recordedBy = recordedBy,
    weightKg = weightKg, heightCm = heightCm, tempC = tempC,
    bpSystolic = bpSystolic, bpDiastolic = bpDiastolic,
    pulseBpm = pulseBpm, respRate = respRate, spo2Pct = spo2Pct,
    muacCm = muacCm, notes = notes, isSynced = isSynced,
)

fun PatientVitals.toEntity(isSynced: Boolean = true) = PatientVitalsEntity(
    id = id, patientId = patientId, visitId = visitId,
    recordedAt = recordedAt, recordedBy = recordedBy,
    weightKg = weightKg, heightCm = heightCm, tempC = tempC,
    bpSystolic = bpSystolic, bpDiastolic = bpDiastolic,
    pulseBpm = pulseBpm, respRate = respRate, spo2Pct = spo2Pct,
    muacCm = muacCm, notes = notes, isSynced = isSynced,
)

fun PatientVitals.toCreateDto() = PatientVitalsCreateDto(
    id = id, patientId = patientId, visitId = visitId,
    weightKg = weightKg, heightCm = heightCm, tempC = tempC,
    bpSystolic = bpSystolic, bpDiastolic = bpDiastolic,
    pulseBpm = pulseBpm, respRate = respRate, spo2Pct = spo2Pct,
    muacCm = muacCm, notes = notes,
    recordedAt = recordedAt,
)

// ========== Payment ==========

fun PaymentDto.toEntity(isSynced: Boolean = true) = PaymentEntity(
    id = id, visitId = visitId, clinicId = clinicId,
    patientId = patientId, amountUgx = amountUgx,
    paymentMethod = paymentMethod, status = status,
    receiptNumber = receiptNumber, serviceType = serviceType,
    notes = notes, collectedBy = collectedBy,
    createdAt = createdAt, updatedAt = updatedAt,
    isSynced = isSynced,
)

fun PaymentEntity.toDomain() = Payment(
    id = id, visitId = visitId, clinicId = clinicId,
    patientId = patientId, amountUgx = amountUgx,
    paymentMethod = PaymentMethod.valueOf(paymentMethod),
    status = PaymentStatus.valueOf(status),
    receiptNumber = receiptNumber, serviceType = serviceType,
    notes = notes, collectedBy = collectedBy,
    createdAt = createdAt, updatedAt = updatedAt,
)

fun Payment.toEntity(isSynced: Boolean = true) = PaymentEntity(
    id = id, visitId = visitId, clinicId = clinicId,
    patientId = patientId, amountUgx = amountUgx,
    paymentMethod = paymentMethod.name, status = status.name,
    receiptNumber = receiptNumber, serviceType = serviceType,
    notes = notes, collectedBy = collectedBy,
    createdAt = createdAt, updatedAt = updatedAt,
    isSynced = isSynced,
)

fun Payment.toCreateDto() = PaymentCreateDto(
    id = id, visitId = visitId, clinicId = clinicId,
    patientId = patientId, amountUgx = amountUgx,
    paymentMethod = paymentMethod.name, status = status.name,
    serviceType = serviceType, notes = notes,
    collectedBy = collectedBy,
)
