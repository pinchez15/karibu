# KaribuEHR Android — Design Council Review

> **Method:** multi-agent design review (2026-06-05). A council of nine design
> personas — Jony Ive, Dieter Rams, Edward Tufte, Don Norman, Matías Duarte,
> Erik Spiekermann, Amber Case, a clinical human-factors/patient-safety voice,
> and a frontline HC III clinician — each critiqued the Android Compose source
> through their lens. Every finding was then adversarially verified against the
> cited code; only code-backed findings survived. 60 findings; phone + tablet.
> Severity reflects **clinical risk**, not aesthetics.

## 1. Executive summary

KaribuEHR's design system is well-conceived and largely well-executed: a
disciplined token palette, a coherent type scale, real adaptive primitives, and
genuine calm-tech restraint in most surfaces. But the council found a single
dominant through-line that crosses every persona: **the colour-and-salience
contract is inverted at exactly the moments clinical risk is highest.** The
app's loudest reserved colour (amber) is spent all day on the most benign, most
common state (offline), while its highest-acuity colour (red) never fires for
the one deterministic danger sign the app models — an infant high-fever
IMCI/meningitis prompt that currently renders as calm cobalt with a dismiss
button equal in weight to acknowledgement. Compounding this, AI suggestions can
be merged into the clinical note by an accidental swipe with no undo and no
provenance, prescriptions finalize on free-text with no dose check, and the
vital value — the single most safety-relevant number — renders in proportional
Inter instead of the reserved mono. None of these are aesthetic quibbles; they
are signal-economy and error-prevention failures in a sun-washed, shared-device,
intermittent-3G clinic. The fixes are nearly all low-cost and local, and the
strong underlying system means correcting the salience hierarchy will pay off
disproportionately.

## 2. Top 10 prioritized findings

| Rank | Severity | Finding | Where | Fix | Form factor | Raised by |
|------|----------|---------|-------|-----|-------------|-----------|
| 1 | **Critical** | Critical IMCI danger-sign alert has the same (or lower) salience as a routine AI hint — calm cobalt, grey body, three equal buttons, no red, no icon. Salience is inversely matched to clinical risk. | `ui/components/VisitCriticalAlertBanner.kt:34`, `domain/CriticalAlertRules.kt:27-33` | Reserve RED for this surface: red left-border + priority icon; make "Yes, correct" dominant; demote "Dismiss". Clinical tier drives colour (deterministic rule = red, AI suggestion = amber). | both | Clinical-safety; Case; Rams; Ive; Norman (×5) |
| 2 | **Critical** | No reliable red critical pathway: `CriticalAlertRules` emits only one rule (infant temp ≥39.4) and early-returns when temp is null, so SpO₂/BP-only danger never alerts; all abnormals render identical amber. A 210/130 BP looks like 142/91; SpO₂ 80% looks like SpO₂ 93%. | `domain/CriticalAlertRules.kt:20,27`; `ui/vitals/VitalsScreen.kt:57-60`; `ui/components/VisitCriticalAlertBanner.kt:34` | Expand rules to the HC III danger-sign set (SpO₂<90, SBP<90 or ≥180/120, age-banded fast breathing, temp≥40); stop the null-temp early-return; route true danger signs through a red banner variant. | both | Frontline; Clinical-safety |
| 3 | **High** | AI suggestions can be incorporated into the clinical note (or a guideline/safety flag silently dismissed) by an accidental swipe — `confirmValueChange` commits on threshold with no settle, no undo, no Snackbar. The sibling timeline uses explicit buttons, so the two AI surfaces disagree. | `ui/components/AiReviewBanner.kt:75-89`; cf. `ui/components/AiNotesTimeline.kt:137-143` | Drop gesture-as-commit for the note-mutating direction; use the explicit-button pattern the timeline already has, or make swipe reveal-only; add Snackbar undo for dismiss. | both | Norman; Duarte; Clinical-safety (×3) |
| 4 | **High** | "Send to pharmacy" is a one-tap irreversible dispatch (stock decrements downstream) with no confirm, no medication recap, no undo, visually identical to reversible outlined actions (Refer). A stray tap on a shared device in sun submits the wrong patient's Rx. | `ui/visitdetails/VisitDetailsScreen.kt:307-317` (dup `:372-390`) | Insert a confirm step recapping patient + med list + "this notifies pharmacy now"; add a short post-submit "Undo (cancel order)" grace window; differentiate from reversible actions. | both | Norman |
| 5 | **High** | Prescription is finalized by a single tap with a free-text Quantity field — no numeric validation, no mg/kg check, no patient weight/age in the sheet — so a 10× error ("50 mL" vs "5 mL") or an adult dose for a 6 kg infant flows straight onto the printed receipt. | `ui/dictation/PharmacyPickerSheet.kt:311-319,465-471` | Pass patient weight/age into the picker; surface a per-drug dose sanity band; escalate Confirm to an explicit override when out of range; at minimum validate Quantity as number+unit. | both | Clinical-safety |
| 6 | **High** | Offline floods the whole top bar in solid amber (white-on-amber), aliasing the reserved colour as `Amber as KaribuWarning`. Offline is the *normal* state on intermittent 3G, so the loudest token shouts about a non-event all day and desensitizes clinicians to genuine amber AI/urgency. | `ui/components/OfflineBanner.kt:20,43,54,69` (root-mounted `MainActivity.kt:83`) | Demote offline to calm neutral chrome (surfaceVariant + Muted + CloudOff), matching the component's own pending-sync branch which already uses `primaryContainer`. Delete the `KaribuWarning` alias. | both | Ive; Rams; Duarte; Norman; Case; Frontline (×6) |
| 7 | **High** | The LATEST KNOWN vitals card — the most-consulted longitudinal reference — never flags out-of-range values; every reading renders identical `onSurface`, so an abnormal is indistinguishable from a normal, inconsistent with PatientCard chips and the vitals entry screen. | `ui/patientdetail/PatientTimelineScreen.kt:484-509` vs `ui/visitdetails/VisitDetailsScreen.kt:497-523` | Lift the existing PatientCard thresholds (temp≥38, BP≥140/90, SpO₂<94) directly onto `LatestVitalRow`'s value text. | both | Tufte |
| 8 | **High** | Lab & pharmacy role homes short-circuit before the adaptive shell — bare Scaffold+TopAppBar, no nav rail, no list-detail. The bench-tablet users get the *least* adaptive workstation; selecting a patient pushes a full-screen route instead of a detail pane. | `ui/home/HomeScreen.kt:78-94` → `ui/lab/LabHomeScreen.kt:36`, `ui/pharmacy/PharmacyHomeScreen.kt:37` | Route both homes through a shell honouring `usesNavigationRail()` and wrap their queues in the existing `KaribuListDetailScaffold`. The primitives already exist. | tablet | Duarte |
| 9 | **High** | Pharmacy dispense has no "out of stock" outcome and no stock display, despite a RED out_of_stock pill already existing and the locked offline-stock-decrement decision. "We don't have it" / "6 of 10" are the commonest HC III realities, forced into free text. | `ui/pharmacy/PharmacyHomeScreen.kt:76-112`; cf. `ui/visitdetails/VisitDetailsScreen.kt:763` | Add an explicit "Out of stock" action writing `dispensing_status=out_of_stock` (fires the existing red pill); show available stock; capture partial quantity vs prescribed. | both | Frontline |
| 10 | **High** | The large vital value — the single most safety-relevant figure — renders in proportional Inter, not the reserved mono, so digits aren't tabular (38.4 vs 36.1 misalign) and transposition errors are harder to catch. The decorative meta-label *is* mono; the hierarchy is literally inverted. | `ui/components/KhVitalCard.kt:103`; `ui/components/KhVitalChip.kt:25,31`; `ui/theme/Type.kt:95-101` | Set `fontFamily = MonoFamily` on the value field/chip + placeholder; enable `tnum`. One-line change. (Severity split — see §6.) | both | Spiekermann; Ive; Tufte; Norman; Duarte; Rams; Frontline (×7) |

## 3. Findings grouped by theme

### Clinical safety & AI trust (the core of the report)

- **Inverted salience on the one critical rule** (rank 1) and **the missing red danger pathway** (rank 2) are the gravest findings — six personas independently arrived at the same conclusion that red is reserved but never reaches the clinician for a danger sign. `CriticalAlertRules.kt:20`'s null-temp early-return is the most concrete defect: a child with SpO₂ 50 and no temperature recorded yields zero alerts.
- **AI provenance is destroyed at merge** (high): `ui/dictation/DictationViewModel.kt:711-728` merges AI words with a bare `"$trimmed $chunk"` — no attribution token, so the receipt and HMIS record inherit unattributed AI text as fact. The "AI proposes / clinician disposes" boundary, loud everywhere else, vanishes at disposal. Pair the fix with rank 3.
- **Gesture-as-commit for clinical mutation** (rank 3) and **one-tap irreversible pharmacy dispatch** (rank 4) are the two error-prevention slips where a low-precision action on a shared device has outsized downstream consequences.
- **Free-text prescription with no dose check** (rank 5) is the weakest safety link specifically for infants — the app's own critical-rule population.
- **Dismiss adjacent and equal-weight to "Yes, correct"** on the verification prompt (high, `VisitCriticalAlertBanner.kt:48-52`) invites reflexive silencing of a danger sign with no record left behind.
- **Approve note** commits AI-structured SOAP with no diff, no AI-origin label, and no confirm — yet **Void of the clinician's *own* note requires a typed reason** (`NoteLifecycleSheet.kt:285-321`). The app guards undoing more heavily than ratifying the AI's draft, which is backwards (medium).
- **Single amber tier with no escalation** for clearly dangerous vitals (medium): 38.1 °C and SpO₂ 80% wear the same amber.
- **Dispense dialog puts committing "Partial" in the dismiss slot** beside "Cancel" (medium, `PharmacyHomeScreen.kt:92-111`) — a committing action in the escape slot is an anti-pattern, and the decrement is hard to reverse offline.

### Information density & legibility

- **No sparkline / small-multiple for any serial vital** (medium, `PatientTimelineScreen.kt:627-668`): the highest-value comparison — a malnourished child's weight trend, temperature defervescence — is missing. The data already exists in `PatientTimelineEvent.VitalEvent`.
- **LATEST KNOWN card has a low data-ink ratio** (low): 8 unconditional rows with a 120dp empty gutter bury the 2-3 real values.
- **Vital values in Inter, not mono** (rank 10) — the most-converged typographic finding.
- **Units dropped inconsistently** (low): "HR 88" bare on chips, "88 bpm" on the latest-vitals card — same measurement, two surfaces.
- **Redundant identity labels on the queue card** (low): age AND DOB encode the same fact; "Tap to open patient" is instructional chrome on an already-clickable row.
- **Mono floor at 11sp** carrying IDs/status/ages, uppercased at +0.5–0.6 tracking, is at the edge of sunlight legibility (medium, `Type.kt:100-103`).
- **Muted #6B7385 fails WCAG 4.5:1 on Bg** (4.48:1, a hairline) at small mono sizes in `DictationScreen.kt:191` and the Learn walkthrough (low).

### Calm / alert discipline (amber & red)

- **OfflineBanner amber flood** (rank 6) — the single most-converged finding in the review.
- **SyncStatusPill tints routine backlog amber** (medium, `:35`) by borrowing note-lifecycle `KhStatusKind` to drive a sync colour — a category mismatch that puts two amber meanings inches apart in the VisitDetails bar.
- **Two amber signals can share the top-bar actions row** (low, phone-scoped): the sync pill plus the AI STRUCTURING/NEEDS REVIEW word.
- **Two AI surfaces at two volumes** (medium): `AiReviewBanner` (amber-filled, swipe) vs `AiNotesTimeline` (calm, neutral) render the *same* suggestion set — the loud one trains reflexive dismissal.
- **Amber vitals fire at mild thresholds** (medium): temp≥38 is common and often benign, so amber drifts to baseline decoration — and is looser than the app's own 39.4 critical rule.
- **AiReviewBanner dismiss-swipe paints red** for a benign "no thanks" (low) — spends the critical colour on a non-event.

### Reduction & consistency

- **Card-status double-encoding** (medium): every OPD card carries a coloured stripe (local `when`) AND a coloured pill (M3-role-based) from two independent sources that can drift.
- **Dead amber branches** in the OPD card accent map (low) — statuses the bucket can never produce, loosening apparent token discipline.
- **VisitDetails stacks seven equal-weight bordered cards** with no inevitable primary (medium) — hierarchy carried only by vertical order, the weakest cue.
- **Hardcoded 11sp Inter AI status tags** (low) instead of canonical `KhMetaText`, and **HomeHero's raw 30sp** outside the scale (low).
- **KaribuLearn abandons the type scale** (medium) with fractional sub-11sp literals (8.5/9/9.5sp) — below any defensible floor for this hardware.

### Android / Material craft & dark mode

- **Brand signals imported as light constants, so they never pick up the dark palette** (medium, `Color.kt:32-40` defines DarkAmber/DarkPrimary that never reach `OfflineBanner`, `AiReviewBanner`, `KhVitalCard`, etc.) — the exact "outdoor/low-power" tokens the dark theme brightened for sunlight are bypassed.
- **Dictation mic is a hand-rolled Box+clickable** (low) — no ripple, no pressed state, no disabled affordance on the screen's most-used control.
- **No motion on selection / pane swaps / tab switches** (low) — acceptable for a calm brand, but tablet selection (the "which patient drives the detail pane" signal) pops rather than settles.
- **Out-of-range vitals lean on colour alone** (medium) — no icon/label/shape, fragile under sunlight and colour-vision deficiency.

## 4. Phone vs Tablet — what the in-progress `ui/adaptive` work must get right

The adaptive primitives (`KaribuListDetailScaffold`, `KaribuAdaptiveQueue`,
`KaribuLayoutWidth`) are genuinely good and already scale padding and queues.
The gaps are at the screen level:

- **List-detail (the populated detail pane has NO back/close control) — fix first.** `PatientTimelineScreen.kt:173-182` suppresses its back icon when `embedInPane=true`, and `KaribuListDetailScaffold.kt:44-55` adds no chrome, so `onNavigateBack` (which clears the selection) is wired to nothing surfaced. The user can switch patients but never *deselect* the chart. Render a ≥48dp close/back affordance in the detail header. (medium, `MainShell.kt:88-116`)
- **Breakpoint too aggressive.** `supportsListDetail()` is true at ≥600dp (`KaribuLayoutWidth.kt:28,54-56`), so a small tablet in portrait crams the dense `PatientTimelineScreen` into a 0.42 pane. Gate full side-by-side to Expanded (or landscape); use single-pane-with-back at Medium/portrait.
- **Nav rail — lab/pharmacy bypass it entirely** (rank 8). Even a single-destination rail reads as "this is a workstation." Route the role homes through a shell that consults `usesNavigationRail()`.
- **Multi-column vitals squander pixels** (low): `VitalsScreen.kt:183` uses `GridCells.Fixed(2)` of tall full-width cards. Use `GridCells.Adaptive` or 3 columns at Expanded, and place the prior LATEST KNOWN vitals *alongside* entry as a small-multiple reference.
- **Type scale doesn't step up for tablet reading distance** (low): padding scales by `KaribuLayoutWidth` but font size is fixed, so the 11sp mono / 12sp chips that are already at the floor on a phone shrink in the visual field on a held-back tablet. Bump the small-text floor (11→12, 12→13) at Medium/Expanded.
- **Dictation mic-target feedback splits across the wide screen** (low): the active-target label sits at the distant left field while the mic is at the bottom. Echo the `activeSection`/`statusText` (already computed at `DictationBottomToolbar:805-809`) right at the mic.
- **The 58mm thermal receipt at tablet width:** the receipt is the entire patient-facing surface and must remain 58mm-faithful regardless of form factor — it is *not* a layout that should expand with the screen. No persona found a defect here, but the council flags it as a deliberate constraint the adaptive pass must **not** "improve": preview and print width stay fixed; only the surrounding chrome adapts. **Human eye recommended** to confirm the receipt preview is pinned to print width on tablet.

## 5. What's working (preserve these)

- **The token system and brand law are real and mostly honoured** — the *reason* the colour-misuse findings land is that the discipline is otherwise tight. The fix is to enforce the existing rules, not invent new ones.
- **`KhMetaText` / `KhStepIndicator` correctly default to `onSurfaceVariant` (~9.45:1)** — safe contrast, mono where it belongs.
- **The OfflineBanner's own pending-sync branch already uses `primaryContainer`** — the calm treatment the offline branch should copy. The fix is in the file.
- **PatientCard vitals chips already threshold-colour abnormals** — the logic is liftable to the latest-vitals card (rank 7).
- **AiNotesTimeline's explicit-button interaction** (Dismiss / Acknowledge / Incorporate) is the safe pattern — make it canonical (rank 3).
- **The ambient AI status word (STRUCTURING / NEEDS REVIEW / READY)** in the top bar is exactly right calm-tech signalling — small, peripheral, semantic colour.
- **Offline copy is genuinely reassuring** ("Saved on this device", "Saved offline — will sync") — keep the wording; only the amber treatment is wrong.
- **The referral generates a shareable mono summary; the Rx builder has a look-alike-name guard; the recording-target amber label exists** — the scaffolding is thoughtful even where it needs deepening.
- **The adaptive primitives exist and the queues already upgrade to grids** — the foundation for the tablet fixes is in place.

## 6. Dissents & uncertainties worth a human eye

- **Severity of the mono-vital finding (rank 10) is genuinely split.** Spiekermann rates it **high** (the canonical `KhVitalChip` is the T/BP/HR/RR/SpO₂ readout everywhere); Ive/Tufte rate it **medium**; Duarte/Rams/Frontline rate it **low** ("correct value still renders legibly"). Placed at rank 10 to honour the convergence, but a human should decide whether tabular legibility of vitals is high- or low-tier. The fix is one line either way.
- **The "red is idle / never spent" framing was partly false and was trimmed.** Red *is* used — `DoseCalculator.kt:191-193`, `ChartFragment.kt:325-410`, the out_of_stock pill (`VisitDetailsScreen.kt:763`), and the sync-error banner (`:863-878`). The accurate, surviving claim is narrower: red is spent on *infrastructure* (sync errors, stock) but **not** on the one *clinical* danger sign.
- **The critical-banner risk is currently forward-looking, not realised.** `CriticalAlertRules.evaluate` today emits only a *data-confirmation* prompt ("Was this temperature entered correctly?"). The dangerous "same surface carries a live acuity flag" scenario is hypothetical until acuity rules are added (ranks 1-2). This makes the fix *preventive design* — confirm the sequencing (expand rules and red treatment together, not red treatment first on a data-confirm prompt).
- **Dead-branch finding over-reached on QueueCard.** `QueueCard`'s `when` *can* produce `Urgent`, so Urgent→Amber is reachable there, not dead — only Errored/Voided/Addended/Amended are dead. The OpdPatientCard half holds.
- **The shared-device "sign under wrong identity" claim is unverified** — no signer-identity widget is present in the cited code. Treat the offline-state-awareness copy fix (medium) as the supported part; the identity concern needs a human to check the auth/session layer (`AuthTokenStore`) directly.
- **The Muted contrast failure is a 0.02 hairline and only against Bg** (4.48:1); it passes on Surface (4.76:1) where vital cards actually render. A human may reasonably route the two offending small-text call sites through `onSurfaceVariant` instead of changing the token.
