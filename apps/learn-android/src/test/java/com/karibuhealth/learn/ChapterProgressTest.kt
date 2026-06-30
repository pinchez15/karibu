package com.karibuhealth.learn

import com.karibuhealth.learn.data.PackEntry
import com.karibuhealth.learn.data.PackStatus
import com.karibuhealth.learn.data.supabase.CaseCompletionRow
import com.karibuhealth.learn.model.CasePatient
import com.karibuhealth.learn.model.CaseProgressStatus
import com.karibuhealth.learn.model.LearnCase
import com.karibuhealth.learn.model.PackInfo
import com.karibuhealth.learn.model.buildChapters
import com.karibuhealth.learn.model.caseProgressStatus
import com.karibuhealth.learn.model.chapterProgress
import com.karibuhealth.learn.model.mergeCompletion
import com.karibuhealth.learn.model.resolveLevel
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ChapterProgressTest {

    private fun pack(id: String, title: String, level: Int? = null, chapterId: String? = null) =
        PackEntry(
            info = PackInfo(
                id = id,
                title = title,
                level = level,
                chapterId = chapterId,
            ),
            status = PackStatus.Installed,
        )

    private fun case(id: String, packId: String, ready: Boolean = true) = LearnCase(
        id = id,
        title = id,
        topic = "Topic",
        patient = CasePatient(name = "Test", age = "30y"),
        ready = ready,
        packId = packId,
    )

    @Test
    fun `buildChapters groups level packs under chapter id`() {
        val packs = listOf(
            pack("core-opd", "Everyday OPD"),
            pack("fever-malaria-acute-illness-l1", "Fever L1", level = 1),
            pack("fever-malaria-acute-illness-l2", "Fever L2", level = 2),
            pack("child-health-imnci-l1", "IMNCI L1", level = 1),
        )
        val chapters = buildChapters(packs)

        assertEquals(3, chapters.size)
        assertEquals("core-opd", chapters.first().id)
        val fever = chapters.first { it.id == "fever-malaria-acute-illness" }
        assertEquals(2, fever.packs.size)
        assertEquals(1, fever.packs.first().info.resolveLevel())
        assertEquals(2, fever.packs.last().info.resolveLevel())
    }

    @Test
    fun `caseProgressStatus reflects pass and redo`() {
        assertEquals(CaseProgressStatus.NotStarted, caseProgressStatus(null))
        assertEquals(
            CaseProgressStatus.Passed,
            caseProgressStatus(CaseCompletionRow("c1", "p1", score = 5, total = 5)),
        )
        assertEquals(
            CaseProgressStatus.NeedsRedo,
            caseProgressStatus(CaseCompletionRow("c1", "p1", score = 4, total = 5)),
        )
    }

    @Test
    fun `mergeCompletion keeps best score`() {
        val existing = CaseCompletionRow("c1", "p1", score = 3, total = 5)
        val better = CaseCompletionRow("c1", "p1", score = 5, total = 5)
        val worse = CaseCompletionRow("c1", "p1", score = 2, total = 5)
        assertEquals(5, mergeCompletion(existing, better).score)
        assertEquals(3, mergeCompletion(existing, worse).score)
    }

    @Test
    fun `chapterProgress counts passed and redo among playable cases`() {
        val cases = listOf(
            case("a", "fever-malaria-acute-illness-l1"),
            case("b", "fever-malaria-acute-illness-l1"),
            case("c", "fever-malaria-acute-illness-l1"),
            case("stub", "fever-malaria-acute-illness-l1", ready = false),
        )
        val completions = mapOf(
            "a" to CaseCompletionRow("a", "fever-malaria-acute-illness-l1", score = 5, total = 5),
            "b" to CaseCompletionRow("b", "fever-malaria-acute-illness-l1", score = 3, total = 5),
        )
        val progress = chapterProgress(cases, completions)

        assertEquals(3, progress.totalInstalledPlayable)
        assertEquals(1, progress.passed)
        assertEquals(1, progress.needsRedo)
        assertEquals(2, progress.started)
        assertTrue(progress.fraction > 0.3f && progress.fraction < 0.4f)
    }
}
