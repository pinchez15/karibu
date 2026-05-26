package com.karibuhealth.app.data.local.db.converter

import com.karibuhealth.app.data.local.db.entity.*
import com.karibuhealth.app.data.remote.dto.*
import com.karibuhealth.app.domain.model.*
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonPrimitive

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
    birthYear = birthYear, approximateAge = approximateAge,
    ageRecordedAt = ageRecordedAt, dobPrecision = dobPrecision,
    village = village, parish = parish, subcounty = subcounty, district = district,
    guardianName = guardianName, nationalId = nationalId,
    createdAt = createdAt, updatedAt = updatedAt,
    isSynced = isSynced,
)

fun PatientEntity.toDomain() = Patient(
    id = id, clinicId = clinicId,
    patientId = patientId, patientNumber = patientNumber,
    firstName = firstName, lastName = lastName, displayName = displayName,
    whatsappNumber = whatsappNumber,
    dateOfBirth = dateOfBirth, sex = sex,
    birthYear = birthYear, approximateAge = approximateAge,
    ageRecordedAt = ageRecordedAt, dobPrecision = dobPrecision,
    village = village, parish = parish, subcounty = subcounty, district = district,
    guardianName = guardianName, nationalId = nationalId,
    createdAt = createdAt, updatedAt = updatedAt,
    isSynced = isSynced,
)

fun Patient.toEntity(isSynced: Boolean = true, localCreatedAt: Long? = null) = PatientEntity(
    id = id, clinicId = clinicId,
    patientId = patientId, patientNumber = patientNumber,
    firstName = firstName, lastName = lastName, displayName = displayName,
    whatsappNumber = whatsappNumber,
    dateOfBirth = dateOfBirth, sex = sex,
    birthYear = birthYear, approximateAge = approximateAge,
    ageRecordedAt = ageRecordedAt, dobPrecision = dobPrecision,
    village = village, parish = parish, subcounty = subcounty, district = district,
    guardianName = guardianName, nationalId = nationalId,
    createdAt = createdAt, updatedAt = updatedAt,
    isSynced = isSynced, localCreatedAt = localCreatedAt,
)

fun Patient.toCreateDto() = PatientCreateDto(
    id = id, clinicId = clinicId,
    firstName = firstName, lastName = lastName,
    whatsappNumber = whatsappNumber,
    dateOfBirth = dateOfBirth, sex = sex,
    birthYear = birthYear, approximateAge = approximateAge,
    ageRecordedAt = ageRecordedAt, dobPrecision = dobPrecision,
    village = village, parish = parish, subcounty = subcounty, district = district,
    guardianName = guardianName, nationalId = nationalId,
)

// Map the duplicate-candidate RPC row to the domain projection. Strips NULLs
// out of the match_reasons array; SQL is supposed to do this but we keep the
// list non-null on the Kotlin side anyway.
fun DuplicateCandidateDto.toDomain() = com.karibuhealth.app.domain.model.DuplicateCandidate(
    id = id,
    patientId = patientId,
    firstName = firstName,
    lastName = lastName,
    sex = sex,
    village = village,
    parish = parish,
    nationalId = nationalId,
    whatsappNumber = whatsappNumber,
    derivedAge = derivedAge,
    matchScore = matchScore,
    matchReasons = matchReasons.filterNotNull(),
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
    aiStructureStatus = aiStructureStatus,
    aiStructureStartedAt = aiStructureStartedAt,
    aiStructureCompletedAt = aiStructureCompletedAt,
    aiStructureError = aiStructureError,
    aiStructureAttempts = aiStructureAttempts,
    dispensingStatus = dispensingStatus, dispenseNotes = dispenseNotes,
    dispensedAt = dispensedAt, dispensedBy = dispensedBy,
    pharmacyOrderSubmittedAt = pharmacyOrderSubmittedAt,
    pharmacyOrderSubmittedBy = pharmacyOrderSubmittedBy,
    labStatus = labStatus, labResults = labResults, labAbnormal = labAbnormal,
    labCompletedAt = labCompletedAt, labCompletedBy = labCompletedBy,
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
    aiStructureStatus = aiStructureStatus,
    aiStructureStartedAt = aiStructureStartedAt,
    aiStructureCompletedAt = aiStructureCompletedAt,
    aiStructureError = aiStructureError,
    aiStructureAttempts = aiStructureAttempts,
    dispensingStatus = dispensingStatus, dispenseNotes = dispenseNotes,
    dispensedAt = dispensedAt, dispensedBy = dispensedBy,
    pharmacyOrderSubmittedAt = pharmacyOrderSubmittedAt,
    pharmacyOrderSubmittedBy = pharmacyOrderSubmittedBy,
    labStatus = labStatus, labResults = labResults, labAbnormal = labAbnormal,
    labCompletedAt = labCompletedAt, labCompletedBy = labCompletedBy,
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
    aiStructureStatus = aiStructureStatus,
    aiStructureStartedAt = aiStructureStartedAt,
    aiStructureCompletedAt = aiStructureCompletedAt,
    aiStructureError = aiStructureError,
    aiStructureAttempts = aiStructureAttempts,
    dispensingStatus = dispensingStatus, dispenseNotes = dispenseNotes,
    dispensedAt = dispensedAt, dispensedBy = dispensedBy,
    pharmacyOrderSubmittedAt = pharmacyOrderSubmittedAt,
    pharmacyOrderSubmittedBy = pharmacyOrderSubmittedBy,
    labStatus = labStatus, labResults = labResults, labAbnormal = labAbnormal,
    labCompletedAt = labCompletedAt, labCompletedBy = labCompletedBy,
    isSynced = isSynced,
)

// ========== ProviderNote ==========

fun ProviderNoteDto.toEntity() = ProviderNoteEntity(
    id = id, patientId = patientId, visitId = visitId,
    transcript = transcript,
    noteContent = noteContent,
    structuredData = structuredData, status = status, source = source,
    createdAt = createdAt, updatedAt = updatedAt,
    finalizedAt = finalizedAt, finalizedBy = finalizedBy,
    amendedAt = amendedAt, amendedBy = amendedBy,
    voidedAt = voidedAt, voidedBy = voidedBy, voidReason = voidReason,
    createdBy = createdBy,
    requiresCosign = requiresCosign,
    cosignedAt = cosignedAt,
    cosignedBy = cosignedBy,
)

fun ProviderNoteEntity.toDomain() = ProviderNote(
    id = id, patientId = patientId, visitId = visitId,
    transcript = transcript,
    noteContent = noteContent, structuredData = structuredData,
    // NoteStatus enum (migration 044) is draft | signed | cosigned |
    // addended | amended | voided. Pre-migration rows that persisted
    // 'finalized' get promoted to 'signed' here as a safety net.
    status = runCatching { NoteStatus.valueOf(status) }
        .getOrDefault(if (status == "finalized") NoteStatus.signed else NoteStatus.draft),
    source = source,
    createdAt = createdAt, updatedAt = updatedAt,
    finalizedAt = finalizedAt, finalizedBy = finalizedBy,
    amendedAt = amendedAt, amendedBy = amendedBy,
    voidedAt = voidedAt, voidedBy = voidedBy, voidReason = voidReason,
    createdBy = createdBy,
    requiresCosign = requiresCosign,
    cosignedAt = cosignedAt,
    cosignedBy = cosignedBy,
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

// ========== Phase 3 — patient timeline + latest vitals ==========

// Helpers to peek at fields inside the JsonObject event_data payloads. The
// server's jsonb_build_object encodes SQL NULLs as JSON null (a JsonPrimitive
// with `isString == false` whose contents are the literal "null"), so we
// guard with `JsonNull` detection via stdlib's `*OrNull` accessors.
private fun JsonObject.stringOrNull(key: String): String? {
    val element = this[key] ?: return null
    val primitive = (element as? JsonPrimitive) ?: return null
    if (!primitive.isString && primitive.content == "null") return null
    return primitive.content.takeIf { it.isNotEmpty() }
}

private fun JsonObject.intOrNull(key: String): Int? =
    (this[key] as? JsonPrimitive)?.intOrNull

private fun JsonObject.doubleOrNull(key: String): Double? =
    (this[key] as? JsonPrimitive)?.doubleOrNull

private fun JsonObject.booleanOrFalse(key: String): Boolean =
    (this[key] as? JsonPrimitive)?.booleanOrNull == true

/**
 * Parse one DTO row into the typed domain sealed-class subtype. Unknown event
 * types fall back to null so an unexpected payload doesn't crash the timeline
 * — the ViewModel filters those out before rendering.
 */
fun PatientTimelineEventDto.toDomain(): PatientTimelineEvent? {
    val data = eventData
    return when (eventType) {
        "visit" -> PatientTimelineEvent.VisitEvent(
            eventId = eventId,
            eventAt = eventAt,
            visitId = data.stringOrNull("visit_id") ?: eventId,
            status = data.stringOrNull("status") ?: "pending",
            queueStatus = data.stringOrNull("queue_status") ?: "waiting",
            department = data.stringOrNull("department") ?: "opd",
            chiefComplaint = data.stringOrNull("chief_complaint"),
            diagnosis = data.stringOrNull("diagnosis"),
            medications = data.stringOrNull("medications"),
            followUpInstructions = data.stringOrNull("follow_up_instructions"),
            testsOrdered = data.stringOrNull("tests_ordered"),
            dispensingStatus = data.stringOrNull("dispensing_status") ?: "not_started",
            labStatus = data.stringOrNull("lab_status") ?: "not_ordered",
            labAbnormal = data.booleanOrFalse("lab_abnormal"),
            documentationComplete = data.booleanOrFalse("documentation_complete"),
            visitDate = data.stringOrNull("visit_date"),
            doctorId = data.stringOrNull("doctor_id"),
        )
        "note" -> PatientTimelineEvent.NoteEvent(
            eventId = eventId,
            eventAt = eventAt,
            noteId = data.stringOrNull("note_id") ?: eventId,
            visitId = data.stringOrNull("visit_id"),
            status = data.stringOrNull("status") ?: "draft",
            source = data.stringOrNull("source") ?: "general",
            transcriptPreview = data.stringOrNull("transcript_preview").orEmpty(),
            hasTranscript = data.booleanOrFalse("has_transcript"),
            signedAt = data.stringOrNull("signed_at"),
            signedBy = data.stringOrNull("signed_by"),
            amendedAt = data.stringOrNull("amended_at"),
            updatedAt = data.stringOrNull("updated_at"),
        )
        "vital" -> PatientTimelineEvent.VitalEvent(
            eventId = eventId,
            eventAt = eventAt,
            vitalId = data.stringOrNull("vital_id") ?: eventId,
            visitId = data.stringOrNull("visit_id"),
            recordedBy = data.stringOrNull("recorded_by"),
            weightKg = data.doubleOrNull("weight_kg"),
            heightCm = data.doubleOrNull("height_cm"),
            tempC = data.doubleOrNull("temp_c"),
            bpSystolic = data.intOrNull("bp_systolic"),
            bpDiastolic = data.intOrNull("bp_diastolic"),
            pulseBpm = data.intOrNull("pulse_bpm"),
            respRate = data.intOrNull("resp_rate"),
            spo2Pct = data.intOrNull("spo2_pct"),
            muacCm = data.doubleOrNull("muac_cm"),
            notes = data.stringOrNull("notes"),
        )
        "payment" -> PatientTimelineEvent.PaymentEvent(
            eventId = eventId,
            eventAt = eventAt,
            paymentId = data.stringOrNull("payment_id") ?: eventId,
            visitId = data.stringOrNull("visit_id"),
            amountUgx = data.intOrNull("amount_ugx") ?: 0,
            paymentMethod = data.stringOrNull("payment_method") ?: "cash",
            receiptNumber = data.stringOrNull("receipt_number"),
            serviceType = data.stringOrNull("service_type"),
            status = data.stringOrNull("status") ?: "paid",
            collectedBy = data.stringOrNull("collected_by"),
        )
        // Migration 042: task events come back with a strict superset of
        // care_tasks columns (plus the JSON keys created_by / completed_by /
        // assignee_id which the timeline card doesn't render today).
        "task" -> PatientTimelineEvent.TaskEvent(
            eventId = eventId,
            eventAt = eventAt,
            taskId = data.stringOrNull("task_id") ?: eventId,
            visitId = data.stringOrNull("visit_id"),
            taskType = data.stringOrNull("task_type") ?: "general",
            title = data.stringOrNull("title").orEmpty(),
            description = data.stringOrNull("description"),
            assigneeRole = data.stringOrNull("assignee_role"),
            dueAt = data.stringOrNull("due_at"),
            status = data.stringOrNull("status") ?: "open",
            completedAt = data.stringOrNull("completed_at"),
        )
        else -> null
    }
}

fun PatientLatestVitalsDto.toDomain() = PatientLatestVitals(
    weightKg = weightKg,
    weightKgAt = weightKgAt,
    heightCm = heightCm,
    heightCmAt = heightCmAt,
    tempC = tempC,
    tempCAt = tempCAt,
    bpSystolic = bpSystolic,
    bpDiastolic = bpDiastolic,
    bpAt = bpAt,
    pulseBpm = pulseBpm,
    pulseBpmAt = pulseBpmAt,
    respRate = respRate,
    respRateAt = respRateAt,
    spo2Pct = spo2Pct,
    spo2PctAt = spo2PctAt,
    muacCm = muacCm,
    muacCmAt = muacCmAt,
)
