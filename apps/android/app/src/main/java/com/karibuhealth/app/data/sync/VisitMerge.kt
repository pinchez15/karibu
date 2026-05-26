package com.karibuhealth.app.data.sync

import com.karibuhealth.app.data.local.db.entity.VisitEntity

/**
 * Merge a server-pulled visit into the local cache without clobbering
 * in-flight clinical edits (EHR pivot §2.4).
 */
object VisitMerge {
    fun mergeRemote(local: VisitEntity?, remote: VisitEntity): VisitEntity {
        if (local == null) return remote.copy(isSynced = true)
        if (local.isSynced) return remote.copy(isSynced = true)

        // Local row has unsynced edits — keep clinician-owned fields, take
        // server read-only / workflow fields that other roles may have updated.
        return local.copy(
            queueStatus = remote.queueStatus,
            queuePosition = remote.queuePosition,
            status = remote.status,
            reviewStatus = remote.reviewStatus,
            reviewedBy = remote.reviewedBy,
            reviewedAt = remote.reviewedAt,
            aiStructureStatus = remote.aiStructureStatus,
            aiStructureStartedAt = remote.aiStructureStartedAt,
            aiStructureCompletedAt = remote.aiStructureCompletedAt,
            aiStructureError = remote.aiStructureError,
            aiStructureAttempts = remote.aiStructureAttempts,
            labStatus = if (local.labStatus == "not_ordered" || local.labStatus == remote.labStatus) {
                remote.labStatus
            } else {
                local.labStatus
            },
            labResults = local.labResults ?: remote.labResults,
            labAbnormal = local.labAbnormal || remote.labAbnormal,
            labCompletedAt = local.labCompletedAt ?: remote.labCompletedAt,
            labCompletedBy = local.labCompletedBy ?: remote.labCompletedBy,
            dispensingStatus = if (local.dispensingStatus == "not_started") {
                remote.dispensingStatus
            } else {
                local.dispensingStatus
            },
            dispenseNotes = local.dispenseNotes ?: remote.dispenseNotes,
            dispensedAt = local.dispensedAt ?: remote.dispensedAt,
            dispensedBy = local.dispensedBy ?: remote.dispensedBy,
            pharmacyOrderSubmittedAt = local.pharmacyOrderSubmittedAt ?: remote.pharmacyOrderSubmittedAt,
            pharmacyOrderSubmittedBy = local.pharmacyOrderSubmittedBy ?: remote.pharmacyOrderSubmittedBy,
            documentationComplete = local.documentationComplete || remote.documentationComplete,
            documentationCompletedAt = local.documentationCompletedAt ?: remote.documentationCompletedAt,
            isSynced = false,
        )
    }
}
