# Platform contract — Android vs Web

> **Status:** Authoritative product decision of record (2026-07-07 session).
> **Audience:** Anyone defining or implementing a feature. Every new feature MUST declare
> its platform tier (§3) at design time.
> **Context:** Clinics increasingly have Wi-Fi (donated routers with power backup) and
> desktop/tablet devices are appearing. This does NOT change the architecture — it changes
> rollout economics and device mix. Offline-first Android remains non-negotiable.

---

## 1. Core principle

**Capability parity for the clinical core; ergonomic specialization everywhere else.**

The dividing line is not "simple vs. complex." It is **capture vs. composition**:

- **Android owns capture at the point of care.** Work that happens away from a desk,
  mid-patient-flow, where losing a write to a network drop means losing clinical truth.
  Room-first writes, outbox sync. Always works offline.
- **Web owns composition, review, and administration.** Work that happens at a desk with
  a wide screen, keyboard, and printer — multi-patient density, long-form editing,
  reports, admin. Online-only, and that is fine: the desk has the backed-up Wi-Fi.

Analogy that guided the decision: phone email vs. desktop email. Same account, same
messages; you triage on the phone and compose on the desktop.

## 2. Hard rules

1. **The full clinical day must be runnable on Android, offline, end to end**
   (register → check in → vitals → note → orders → lab result → dispense → billing
   capture). Wi-Fi must never be an adoption barrier for a new clinic.
2. **No clinically critical action may be web-only.** (Live violation being fixed:
   per-line pharmacy send-back exists only on web.) Admin/reporting actions MAY be
   web-only.
3. **No offline capability on web.** Do not build service-worker/PWA offline sync.
   Android is the offline client; duplicating Room+outbox+reconciliation in the browser
   is out of scope permanently unless the product owner reverses this in writing.
4. **All business logic lives in shared SECURITY DEFINER RPCs.** The platform split is
   purely a UX-layer decision. Never fork business rules per platform.
5. **Tablets run the Android app** (wide screen + offline; adaptive layouts exist).
   Desktops/laptops run web. Do not build a tablet web mode.
6. **Android does not get admin surfaces** (staff management, catalog editing, stock
   import, superadmin, HMIS report configuration) unless a field-specific need is
   documented.
7. **Parity review checklist item:** every PR that adds a clinical action must state
   which platforms receive it and, if not both, why that complies with rule 2.

## 3. Feature tiers

Every feature declares one tier:

| Tier | Meaning |
|------|---------|
| **A-OFF** | Android, must work offline (Room-first + outbox). Web may also have it. |
| **A-ON** | Android, online acceptable (e.g. AI assist, Consult). Web may also have it. |
| **WEB** | Web-only. Permitted only for admin/reporting/composition surfaces (rule 2). |

## 4. Workflow assignments (current product)

| Workflow | Primary platform | Tier | Notes |
|----------|-----------------|------|-------|
| Patient registration + check-in | Android | A-OFF | Web has full parity for desk registration |
| Vitals capture | Android | A-OFF | Web parity exists |
| Clinical notes (dictation/voice) | Android | A-OFF | Voice is phone-native; web has text editing |
| Long-form note review / cosign / amend | **Web** | A-ON on Android | Keyboard + screen work |
| Lab resulting (bench) | Android | A-OFF | Web lab page is the wide-screen alternative |
| Dispensing (window) | Android | A-OFF | Local stock decrement offline |
| Pharmacy worksheet at fixed station + printing | **Web** | — | Thermal printing is web |
| Pharmacy send-back (whole + per-line) | Both | A-OFF | Parity required (rule 2) |
| Billing capture (record payment) | Android | A-OFF | |
| Billing / bursar day, balances, reports | **Web** | WEB | |
| Stock management, stock-take, requisitions | **Web** | WEB | Android keeps read-only stock + dispense decrement |
| HMIS / reports / exports | **Web** | WEB | Hard role gates (see access model) |
| Staff / catalog / clinic admin | **Web** | WEB | |
| AI notes (draft + lab triggers) | Both | A-ON | Skipped offline by design |
| Consult (second opinion) | Both | A-ON | Hard-blocked offline per spec |
| Patient chart reading | Both | A-OFF (Android) | |
| Queues / worklists | Both | A-OFF (Android has local fallbacks) | |
| Inpatient rounds / obs | Android | A-OFF | Web has admin views |
| **Outreach enrollment (ANC/HIV/TB, field)** | Android only | A-OFF | See WP7 |

## 5. Investment guidance

- **Web performance is a product feature** (sub-2s pages): the web app's job is to be
  the visibly superior desk experience. See WP6.
- **Android investment goes to capture ergonomics**: voice, camera (future barcode
  receiving — GS1 DataMatrix carries GTIN + lot + expiry), one-handed flows, resilience
  UX (saved-on-device vs synced-to-cloud).
- **Rollout for connected clinics:** web-first onboarding at the desk (zero install),
  Android as the resilience + field layer. Both from day one.

## 6. AI platform decision

All model calls run on **OpenAI** (chat + embeddings), server-side only. This supersedes
Gemini references in `docs/ai-clinical-assist.md` and older rules. Update stale spec text
when touching those files; do not migrate providers without an eval harness in place
(WP5).
