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
    consentRecording = consentRecording, consentTimestamp = consentTimestamp,
    sourceLanguage = sourceLanguage, consentVerified = consentVerified,
    consentId = consentId, reviewStatus = reviewStatus,
    reviewedBy = reviewedBy, reviewedAt = reviewedAt,
    audioDeletedAt = audioDeletedAt, retentionExpiresAt = retentionExpiresAt,
    diagnosis = diagnosis, medications = medications,
    followUpInstructions = followUpInstructions, testsOrdered = testsOrdered,
    visitDate = visitDate, createdAt = createdAt, updatedAt = updatedAt,
    finalizedAt = finalizedAt, errorMessage = errorMessage, errorAt = errorAt,
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
    consentRecording = consentRecording, consentTimestamp = consentTimestamp,
    sourceLanguage = SourceLanguage.valueOf(sourceLanguage),
    consentVerified = consentVerified, consentId = consentId,
    reviewStatus = ReviewStatus.valueOf(reviewStatus),
    reviewedBy = reviewedBy, reviewedAt = reviewedAt,
    audioDeletedAt = audioDeletedAt, retentionExpiresAt = retentionExpiresAt,
    diagnosis = diagnosis, medications = medications,
    followUpInstructions = followUpInstructions, testsOrdered = testsOrdered,
    visitDate = visitDate, createdAt = createdAt, updatedAt = updatedAt,
    finalizedAt = finalizedAt, errorMessage = errorMessage, errorAt = errorAt,
)

fun Visit.toCreateDto() = VisitCreateDto(
    id = id, clinicId = clinicId, patientId = patientId,
    doctorId = doctorId, consentRecording = consentRecording,
    sourceLanguage = sourceLanguage.name, visitDate = visitDate,
    chiefComplaint = chiefComplaint,
)

fun Visit.toEntity(isSynced: Boolean = true) = VisitEntity(
    id = id, clinicId = clinicId, patientId = patientId,
    doctorId = doctorId, nurseId = nurseId,
    status = status.name, queueStatus = queueStatus.name,
    queuePosition = queuePosition, priority = priority.name,
    chiefComplaint = chiefComplaint, checkedInAt = checkedInAt,
    consentRecording = consentRecording, consentTimestamp = consentTimestamp,
    sourceLanguage = sourceLanguage.name, consentVerified = consentVerified,
    consentId = consentId, reviewStatus = reviewStatus.name,
    reviewedBy = reviewedBy, reviewedAt = reviewedAt,
    audioDeletedAt = audioDeletedAt, retentionExpiresAt = retentionExpiresAt,
    diagnosis = diagnosis, medications = medications,
    followUpInstructions = followUpInstructions, testsOrdered = testsOrdered,
    visitDate = visitDate, createdAt = createdAt, updatedAt = updatedAt,
    finalizedAt = finalizedAt, errorMessage = errorMessage, errorAt = errorAt,
    isSynced = isSynced,
)

// ========== AudioUpload ==========

fun AudioUploadDto.toEntity(localFilePath: String? = null) = AudioUploadEntity(
    id = id, visitId = visitId, storagePath = storagePath,
    fileSizeBytes = fileSizeBytes, durationSeconds = durationSeconds,
    mimeType = mimeType, uploadedAt = uploadedAt,
    transcriptionStartedAt = transcriptionStartedAt,
    transcriptionCompletedAt = transcriptionCompletedAt,
    status = status, errorMessage = errorMessage,
    createdAt = createdAt, updatedAt = updatedAt,
    localFilePath = localFilePath,
)

fun AudioUploadEntity.toDomain() = AudioUpload(
    id = id, visitId = visitId, storagePath = storagePath,
    fileSizeBytes = fileSizeBytes, durationSeconds = durationSeconds,
    mimeType = mimeType, uploadedAt = uploadedAt,
    transcriptionStartedAt = transcriptionStartedAt,
    transcriptionCompletedAt = transcriptionCompletedAt,
    status = AudioUploadStatus.valueOf(status),
    errorMessage = errorMessage,
    createdAt = createdAt, updatedAt = updatedAt,
)

// ========== PatientConsent ==========

fun ConsentDto.toEntity(isSynced: Boolean = true) = PatientConsentEntity(
    id = id, patientId = patientId, visitId = visitId,
    consentType = consentType, granted = granted,
    grantedAt = grantedAt, grantedBy = grantedBy,
    guardianName = guardianName, guardianRelationship = guardianRelationship,
    withdrawalAt = withdrawalAt, consentMethod = consentMethod,
    consentLanguage = consentLanguage, ipAddress = ipAddress,
    createdAt = createdAt, isSynced = isSynced,
)

fun PatientConsentEntity.toDomain() = PatientConsent(
    id = id, patientId = patientId, visitId = visitId,
    consentType = ConsentType.valueOf(consentType),
    granted = granted, grantedAt = grantedAt,
    grantedBy = ConsentGrantedBy.valueOf(grantedBy),
    guardianName = guardianName, guardianRelationship = guardianRelationship,
    withdrawalAt = withdrawalAt,
    consentMethod = ConsentMethod.valueOf(consentMethod),
    consentLanguage = consentLanguage, ipAddress = ipAddress,
    createdAt = createdAt,
)

fun PatientConsent.toEntity(isSynced: Boolean = true) = PatientConsentEntity(
    id = id, patientId = patientId, visitId = visitId,
    consentType = consentType.name, granted = granted,
    grantedAt = grantedAt, grantedBy = grantedBy.name,
    guardianName = guardianName, guardianRelationship = guardianRelationship,
    withdrawalAt = withdrawalAt, consentMethod = consentMethod.name,
    consentLanguage = consentLanguage, ipAddress = ipAddress,
    createdAt = createdAt, isSynced = isSynced,
)

fun PatientConsent.toCreateDto() = ConsentCreateDto(
    id = id, patientId = patientId, visitId = visitId,
    consentType = consentType.name, granted = granted,
    grantedAt = grantedAt, grantedBy = grantedBy.name,
    guardianName = guardianName, guardianRelationship = guardianRelationship,
    consentMethod = consentMethod.name, consentLanguage = consentLanguage,
)

// ========== ProviderNote ==========

fun ProviderNoteDto.toEntity() = ProviderNoteEntity(
    id = id, visitId = visitId, transcript = transcript,
    transcriptOriginal = transcriptOriginal, transcriptEnglish = transcriptEnglish,
    transcriptionProvider = transcriptionProvider,
    transcriptionConfidence = transcriptionConfidence,
    diarizationOutput = diarizationOutput,
    audioTrimmed = audioTrimmed, noteContent = noteContent,
    structuredData = structuredData, status = status,
    createdAt = createdAt, updatedAt = updatedAt,
    finalizedAt = finalizedAt, finalizedBy = finalizedBy,
)

fun ProviderNoteEntity.toDomain() = ProviderNote(
    id = id, visitId = visitId, transcript = transcript,
    transcriptOriginal = transcriptOriginal, transcriptEnglish = transcriptEnglish,
    transcriptionProvider = transcriptionProvider?.let { TranscriptionProvider.valueOf(it) },
    transcriptionConfidence = transcriptionConfidence,
    diarizationOutput = diarizationOutput,
    audioTrimmed = audioTrimmed, noteContent = noteContent,
    structuredData = structuredData,
    status = NoteStatus.valueOf(status),
    createdAt = createdAt, updatedAt = updatedAt,
    finalizedAt = finalizedAt, finalizedBy = finalizedBy,
)

// ========== PatientNote ==========

fun PatientNoteDto.toEntity() = PatientNoteEntity(
    id = id, visitId = visitId, content = content,
    language = language, status = status,
    createdAt = createdAt, updatedAt = updatedAt,
)

fun PatientNoteEntity.toDomain() = PatientNote(
    id = id, visitId = visitId, content = content,
    language = language, status = NoteStatus.valueOf(status),
    createdAt = createdAt, updatedAt = updatedAt,
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
