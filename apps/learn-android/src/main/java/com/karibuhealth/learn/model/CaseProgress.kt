package com.karibuhealth.learn.model

import com.karibuhealth.learn.data.supabase.CaseCompletionRow

/** How a learner stands on a single case attempt (best score kept). */
enum class CaseProgressStatus {
    /** Not attempted, or no score on record. */
    NotStarted,
    /** Finished with a perfect score — full credit earned. */
    Passed,
    /** Attempted but missed one or more decisions — eligible to retake. */
    NeedsRedo,
}

fun CaseProgressStatus.label(): String = when (this) {
    CaseProgressStatus.NotStarted -> "Not started"
    CaseProgressStatus.Passed -> "Complete"
    CaseProgressStatus.NeedsRedo -> "Retry for full credit"
}

fun caseProgressStatus(completion: CaseCompletionRow?): CaseProgressStatus {
    if (completion == null || completion.total <= 0) return CaseProgressStatus.NotStarted
    return if (completion.score >= completion.total) CaseProgressStatus.Passed
    else CaseProgressStatus.NeedsRedo
}

fun mergeCompletion(existing: CaseCompletionRow?, incoming: CaseCompletionRow): CaseCompletionRow {
    if (existing == null) return incoming
    return if (incoming.score >= existing.score) incoming else existing
}
