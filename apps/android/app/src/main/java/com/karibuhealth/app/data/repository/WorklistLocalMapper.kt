package com.karibuhealth.app.data.repository

import com.karibuhealth.app.data.local.db.converter.toDomain
import com.karibuhealth.app.data.local.db.dao.PatientDao
import com.karibuhealth.app.data.local.db.dao.VisitDao
import com.karibuhealth.app.data.local.db.entity.VisitEntity
import com.karibuhealth.app.domain.model.NeedsLabItem
import com.karibuhealth.app.domain.model.NeedsPharmacyItem
import java.time.LocalDate

internal suspend fun VisitDao.mapLocalLabQueue(
    clinicId: String,
    patientDao: PatientDao,
): List<NeedsLabItem> {
    val today = LocalDate.now().toString()
    return getLocalNeedsLabVisits(clinicId, today).mapNotNull { visit ->
        visit.toNeedsLabItem(patientDao)
    }
}

internal suspend fun VisitDao.mapLocalPharmacyQueue(
    clinicId: String,
    patientDao: PatientDao,
): List<NeedsPharmacyItem> {
    val today = LocalDate.now().toString()
    return getLocalNeedsPharmacyVisits(clinicId, today).mapNotNull { visit ->
        visit.toNeedsPharmacyItem(patientDao)
    }
}

private suspend fun VisitEntity.toNeedsLabItem(patientDao: PatientDao): NeedsLabItem? {
    val patient = patientDao.getByIdOnce(patientId)?.toDomain() ?: return null
    val name = listOfNotNull(patient.firstName, patient.lastName).joinToString(" ").ifBlank {
        patient.displayName ?: "Unknown"
    }
    return NeedsLabItem(
        visitId = id,
        patientId = patientId,
        patientName = name,
        sex = patient.sex,
        derivedAge = patient.approximateAge,
        chiefComplaint = chiefComplaint,
        labStatus = labStatus,
        doctorId = doctorId,
        visitDate = visitDate,
    )
}

private suspend fun VisitEntity.toNeedsPharmacyItem(patientDao: PatientDao): NeedsPharmacyItem? {
    val patient = patientDao.getByIdOnce(patientId)?.toDomain() ?: return null
    val name = listOfNotNull(patient.firstName, patient.lastName).joinToString(" ").ifBlank {
        patient.displayName ?: "Unknown"
    }
    return NeedsPharmacyItem(
        visitId = id,
        patientId = patientId,
        patientName = name,
        sex = patient.sex,
        derivedAge = patient.approximateAge,
        medications = medications,
        dispensingStatus = dispensingStatus,
        doctorId = doctorId,
        visitDate = visitDate,
    )
}
