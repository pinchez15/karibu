package com.karibuhealth.app.ui.visitdetails

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * T3 (2026-07-09 tester feedback): the `pending + documentationComplete`
 * bottom-action label used to always read "AI checking…", which lied
 * indefinitely if the doc-complete/sign RPC was still sitting in the local
 * sync outbox (e.g. airplane-mode sign) — the AI never started because the
 * op hadn't left the device. `pendingDocCompleteLabel` is the mapping
 * `VisitDetailsBottomAction` uses to distinguish the two cases from
 * `SyncQueueDao.getPendingCountForVisit`'s count, surfaced on
 * `VisitDetailsUiState.pendingSyncCount`.
 */
class VisitDetailsBottomActionLabelTest {

    @Test
    fun `pending outbox entries for this visit reads waiting-to-sync`() {
        assertEquals("Waiting to sync…", pendingDocCompleteLabel(pendingSyncCount = 3))
    }

    @Test
    fun `a single pending outbox entry still reads waiting-to-sync`() {
        assertEquals("Waiting to sync…", pendingDocCompleteLabel(pendingSyncCount = 1))
    }

    @Test
    fun `nothing left in the outbox reads ai-checking`() {
        assertEquals("AI checking…", pendingDocCompleteLabel(pendingSyncCount = 0))
    }
}
