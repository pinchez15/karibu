package com.karibuhealth.app.data.sync

import com.karibuhealth.app.data.local.db.entity.PatientEntity

object PatientMerge {
    fun mergeRemote(local: PatientEntity?, remote: PatientEntity): PatientEntity {
        if (local == null) return remote.copy(isSynced = true)
        if (local.isSynced) return remote.copy(isSynced = true)
        return local.copy(
            patientId = remote.patientId ?: local.patientId,
            patientNumber = remote.patientNumber ?: local.patientNumber,
            displayName = remote.displayName ?: local.displayName,
            isSynced = false,
        )
    }
}
