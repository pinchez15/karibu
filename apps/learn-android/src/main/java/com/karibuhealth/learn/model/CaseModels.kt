package com.karibuhealth.learn.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * KaribuLearn case-content schema.
 *
 * This is the contract the case-authoring **Python pipeline** targets. A
 * "pack" is the unit of download — Ugandan clinicians are data-conscious, so
 * the app ships a small core pack and lets users pull additional packs (each
 * a few MB) on demand over their own data plan. Everything here is generated
 * teaching content: no real patient data ever appears.
 *
 * See docs/karibu-learn-pack-schema.md for the authoring guide.
 */

/** Top-level manifest listing every pack the app knows about. */
@Serializable
data class PackManifest(
    val packs: List<PackInfo> = emptyList(),
)

/** Lightweight pack descriptor — enough to list it before downloading. */
@Serializable
data class PackInfo(
    val id: String,
    val title: String,
    val subtitle: String = "",
    val topic: String? = null,
    @SerialName("case_count") val caseCount: Int = 0,
    @SerialName("approx_size_kb") val approxSizeKb: Int = 0,
    /** true → content ships inside the APK at [assetPath]; false → downloaded. */
    val bundled: Boolean = false,
    /** Asset path for a bundled pack, e.g. "learn/packs/core-opd.json". */
    @SerialName("asset_path") val assetPath: String? = null,
    /**
     * Where a non-bundled pack is fetched from. In production this is an https
     * URL (CDN / Supabase Storage) the pipeline publishes to. The custom scheme
     * "bundled-remote://<asset>" lets us demo the download UX offline by copying
     * from a packaged asset — see LearnRepository.downloadPack.
     */
    @SerialName("download_url") val downloadUrl: String? = null,
    val version: Int = 1,
)

/** A downloaded/loaded pack: the full case content. */
@Serializable
data class CasePack(
    val id: String,
    val title: String,
    val cases: List<LearnCase> = emptyList(),
)

@Serializable
data class LearnCase(
    val id: String,
    val title: String,
    val topic: String,
    val difficulty: String = "Core",
    val mins: Int = 12,
    val credit: Double = 0.25,
    val setting: String? = null,
    val patient: CasePatient,
    val blurb: String = "",
    val objectives: List<String> = emptyList(),
    val skills: List<String> = emptyList(),
    /** false → a catalog stub ("COMING SOON"); true → a walkable case. */
    val ready: Boolean = false,
    val steps: List<CaseStep> = emptyList(),
    val takeaways: List<String> = emptyList(),
    val citations: List<String> = emptyList(),
    @SerialName("dose_calc") val doseCalc: DoseCalcSpec? = null,
    // ── Content-strategy fields (docs/karibu-learn/case-content-strategy.md) ──
    // A playable variant derived from a canonical case. These describe how the
    // case is sourced/framed and how hard it is, without a "real vs generated"
    // quality hierarchy.
    /** "Guideline Practice" | "Challenge" | "Case Conference" | "From the Literature". */
    @SerialName("source_type") val sourceType: String? = null,
    /** Library mode: "Core Practice" | "Challenge Cases" | "Case Conference". */
    val mode: String? = null,
    /** Playable difficulty level 1–5 (how much is given vs requested/entered). */
    val level: Int? = null,
    /** Shareable artifacts for WhatsApp-style peer learning. */
    val share: ShareMeta? = null,
    /** Provenance, review, and CPD-readiness metadata. Carried, not yet surfaced. */
    val meta: CaseMeta? = null,
    /** Pack this case belongs to — filled in at load time, not authored. */
    @SerialName("pack_id") val packId: String = "",
)

/** WhatsApp-style shareable artifacts (case-content-strategy → Sharing). */
@Serializable
data class ShareMeta(
    @SerialName("share_title") val shareTitle: String? = null,
    @SerialName("share_prompt") val sharePrompt: String? = null,
    @SerialName("share_summary") val shareSummary: String? = null,
    @SerialName("share_url") val shareUrl: String? = null,
    @SerialName("evidence_card") val evidenceCard: String? = null,
    @SerialName("discussion_question") val discussionQuestion: String? = null,
)

/**
 * Pipeline scoring + provenance + CPD-readiness metadata. Built now so the
 * data exists later; no accreditation workflow is built against it yet.
 */
@Serializable
data class CaseMeta(
    @SerialName("complexity_score") val complexityScore: Double? = null,
    @SerialName("clinical_correctness_score") val clinicalCorrectnessScore: Double? = null,
    @SerialName("hc3_reality_score") val hc3RealityScore: Double? = null,
    @SerialName("learning_value_score") val learningValueScore: Double? = null,
    @SerialName("source_guideline_ids") val sourceGuidelineIds: List<String> = emptyList(),
    @SerialName("original_citation") val originalCitation: String? = null,
    @SerialName("license_status") val licenseStatus: String? = null,
    @SerialName("adaptation_notes") val adaptationNotes: String? = null,
    @SerialName("review_status") val reviewStatus: String? = null,
    @SerialName("reviewed_by") val reviewedBy: String? = null,
    @SerialName("reviewed_at") val reviewedAt: String? = null,
    @SerialName("case_version") val caseVersion: String? = null,
)

@Serializable
data class CasePatient(
    val name: String,
    val id: String? = null,
    val age: String,
    val sex: String? = null,
)

enum class StepKind { story, decision }

@Serializable
data class CaseStep(
    val kind: StepKind,
    /** The cobalt EHR chart shown for this step (left/top of the split). */
    val chart: ChartSpec? = null,
    /** The coral coaching panel (right/bottom of the split). */
    val coach: Coach,
    /** Present only when kind == decision. */
    val question: Question? = null,
)

@Serializable
data class Coach(
    val eyebrow: String = "",
    val title: String = "",
    val body: String = "",
    val quote: String? = null,
    val teach: Teach? = null,
)

@Serializable
data class Teach(val label: String, val text: String)

@Serializable
data class Question(
    val prompt: String,
    val options: List<AnswerOption> = emptyList(),
    val right: String = "",
    val wrong: String = "",
    /** Surface the dose calculator on this decision. */
    val calculator: Boolean = false,
)

@Serializable
data class AnswerOption(val text: String, val correct: Boolean = false)

// ── EHR chart (cobalt) — fully data-driven ──────────────────────────────────
// A chart is an ordered list of typed sections. The renderer
// (walkthrough/ChartFragment.kt) switches on [ChartSection.type]; the
// `revealed` flag (story steps = always; decision steps = after answering)
// toggles each section's before/after presentation.

@Serializable
data class ChartSpec(
    /** Header chip on the cobalt chrome, e.g. "VITALS", "PRESCRIBE". */
    val tag: String = "",
    val sections: List<ChartSection> = emptyList(),
)

/**
 * One chart section. Fields are optional and interpreted per [type]:
 *
 *  - "chiefComplaint" → text, chips
 *  - "keyValues"      → title, rows
 *  - "vitals"         → title, rightLabel, vitals, critical?
 *  - "subjective"     → title, text, revealText?
 *  - "dangerScreen"   → title, dangerSigns, revealNote?
 *  - "assessment"     → title, text, emphasis?
 *  - "investigations" → title, orders
 *  - "result"         → title, rightLabel, resultLabel, resultValue, badge?, ai?
 *  - "prescription"   → title, calculator, drug, detail, revealDetail?, counselling, confirmedOnReveal
 *  - "diagnosis"      → title, codes, receipt?
 */
@Serializable
data class ChartSection(
    val type: String,
    val title: String? = null,
    val text: String? = null,
    @SerialName("reveal_text") val revealText: String? = null,
    val emphasis: String? = null,
    @SerialName("right_label") val rightLabel: String? = null,
    val chips: List<String> = emptyList(),
    val rows: List<KeyVal> = emptyList(),
    val vitals: List<Vital> = emptyList(),
    val critical: Critical? = null,
    @SerialName("danger_signs") val dangerSigns: List<String> = emptyList(),
    @SerialName("reveal_note") val revealNote: String? = null,
    val orders: List<OrderRow> = emptyList(),
    @SerialName("result_label") val resultLabel: String? = null,
    @SerialName("result_value") val resultValue: String? = null,
    val badge: String? = null,
    val ai: AiBanner? = null,
    val drug: String? = null,
    val detail: String? = null,
    @SerialName("reveal_detail") val revealDetail: String? = null,
    @SerialName("confirmed_on_reveal") val confirmedOnReveal: Boolean = false,
    val calculator: Boolean = false,
    val counselling: List<String> = emptyList(),
    val codes: List<HmisCode> = emptyList(),
    val receipt: String? = null,
)

@Serializable
data class KeyVal(val label: String, val value: String)

@Serializable
data class Vital(val label: String, val value: String, val hot: Boolean = false)

@Serializable
data class Critical(val title: String, val body: String? = null, val count: Int = 1)

@Serializable
data class OrderRow(
    val name: String,
    val sub: String? = null,
    @SerialName("reveal_sub") val revealSub: String? = null,
    /** "order" | "pending" | "done" */
    val status: String = "order",
    @SerialName("reveal_status") val revealStatus: String? = null,
)

@Serializable
data class AiBanner(val headline: String, val sub: String? = null)

@Serializable
data class HmisCode(
    val code: String,
    val name: String,
    val confidence: String? = null,
    val primary: Boolean = false,
)

// ── Dose calculator ─────────────────────────────────────────────────────────

@Serializable
data class DoseCalcSpec(
    val drug: String = "",
    @SerialName("drug_sub") val drugSub: String = "",
    @SerialName("source_label") val sourceLabel: String = "",
    @SerialName("start_weight") val startWeight: Double = 60.0,
    @SerialName("min_weight") val minWeight: Double = 5.0,
    @SerialName("doses_per_day") val dosesPerDay: Int = 2,
    val days: Int = 3,
    val bands: List<DoseBand> = emptyList(),
) {
    fun bandFor(weight: Double): DoseBand? {
        if (weight < minWeight) return null
        return bands.firstOrNull { weight >= it.lo && weight <= (it.hi ?: Double.MAX_VALUE) }
            ?: bands.lastOrNull()
    }
}

@Serializable
data class DoseBand(
    val lo: Double,
    /** null → open-ended upper band (≥ lo). */
    val hi: Double? = null,
    val tabs: Int,
    val label: String,
)
