package com.karibuhealth.learn.model

import com.karibuhealth.learn.data.PackEntry
import com.karibuhealth.learn.data.PackStatus
import com.karibuhealth.learn.data.supabase.CaseCompletionRow

/** Curriculum chapter — groups level 1–3 packs under one topic arc. */
data class LearnChapter(
    val id: String,
    val title: String,
    val packs: List<PackEntry>,
) {
    val installedPacks: List<PackEntry> get() = packs.filter { it.status == PackStatus.Installed }
    val isInstalled: Boolean get() = installedPacks.isNotEmpty()
    val catalogCaseCount: Int get() = packs.sumOf { it.info.caseCount }
}

data class ChapterProgress(
    val passed: Int,
    val needsRedo: Int,
    val started: Int,
    val totalInstalledPlayable: Int,
) {
    val fraction: Float
        get() = if (totalInstalledPlayable == 0) 0f else passed.toFloat() / totalInstalledPlayable
}

fun PackInfo.resolveChapterId(): String =
    chapterId?.takeIf { it.isNotBlank() }
        ?: when {
            id == "core-opd" -> "core-opd"
            CHAPTER_LEVEL_SUFFIX.containsMatchIn(id) -> id.replace(CHAPTER_LEVEL_SUFFIX, "")
            else -> id
        }

fun PackInfo.resolveLevel(): Int? =
    level ?: CHAPTER_LEVEL_SUFFIX.find(id)?.groupValues?.get(1)?.toIntOrNull()

fun buildChapters(packs: List<PackEntry>): List<LearnChapter> =
    packs
        .groupBy { it.info.resolveChapterId() }
        .map { (id, group) ->
            LearnChapter(
                id = id,
                title = group.first().info.title,
                packs = group.sortedBy { it.info.resolveLevel() ?: 0 },
            )
        }
        .sortedWith(
            compareBy<LearnChapter> { if (it.id == "core-opd") 0 else 1 }
                .thenBy { it.title },
        )

fun chapterProgress(
    cases: List<LearnCase>,
    completions: Map<String, CaseCompletionRow>,
): ChapterProgress {
    val playable = cases.filter { it.ready }
    var passed = 0
    var needsRedo = 0
    var started = 0
    playable.forEach { case ->
        when (caseProgressStatus(completions[case.id])) {
            CaseProgressStatus.Passed -> {
                passed++
                started++
            }
            CaseProgressStatus.NeedsRedo -> {
                needsRedo++
                started++
            }
            CaseProgressStatus.NotStarted -> Unit
        }
    }
    return ChapterProgress(
        passed = passed,
        needsRedo = needsRedo,
        started = started,
        totalInstalledPlayable = playable.size,
    )
}

private val CHAPTER_LEVEL_SUFFIX = Regex("-l([123])$")
