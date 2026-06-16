# TODOS

Trigger-gated work deferred from the laptop webapp / Scope+Workspace eng review
(2026-06-16). Full context: `~/.gstack/projects/pinchez15-karibu/natepinches-main-design-20260616-105537.md`.

## On clinic #2 onboarding — multi-clinic auth refactor

**What:** Make staff identity org-aware so a user can belong to more than one clinic.

**Why:** Today `staff.clerk_user_id` is UNIQUE (001:23) and `getStaff()` uses `.single()`,
so a second clinic membership throws and logs the user out. The local admin runs 2 clinics;
this is the first real multi-clinic trigger.

**LIVE LATENT BUG to fix as part of this:** `upsertStaff` already keys on
`(clerk_user_id, clinic_id)` (`clerk.ts:331-332, 358-359`), but `staff.clerk_user_id` is
still `UNIQUE` (001:23). The first time a second clinic adds an EXISTING user, the webhook
INSERT (clerk.ts:357) throws a unique violation and the membership webhook 500s. Relaxing
the constraint (step 2) fixes it. Harmless at 1 clinic; hard failure on clinic #2's first
shared user.

**Steps:**
1. **org_id foundation as a LOAD-BEARING auth change (not a no-op).** Add `org_id` to the
   Clerk session token, force an active org on sign-in, and add active-org middleware.
   Verify the live JWT actually carries `org_id` and document the Clerk dashboard config.
   Test at the DATA-ACCESS level (authed query returns the right clinic's rows), not just
   "login works" — making RLS depend on org_id can fail closed (every query empty).
2. Relax `staff.clerk_user_id UNIQUE` → `UNIQUE (clerk_user_id, clinic_id)` (or a
   `staff_clinic_roles` junction).
3. Redefine `get_current_staff_id()` (006:53, 49 refs) to resolve the staff row for the
   ACTIVE clinic via `auth.jwt()->>'org_id'`; migrate the 25 inline
   `staff WHERE clerk_user_id = sub LIMIT 1` sites to call it (DRY).
4. Change `get_current_clinic_id()` fallback (006:41-46) to fail-closed (return NULL, not
   an arbitrary clinic).
5. Make web `getStaff()` resolve `(user, active clinic)` via Clerk `auth().orgId`; drop
   `.single()`.

**Depends on / blocked by:** triggered by a real second clinic onboarding — do not build
ahead of it. Operational RLS stays scalar (decision 1A) — do NOT rewrite the 94
`get_current_clinic_id()` policies to set-membership. Add tests with the refactor.

## On first diocese onboarding — diocese oversight tier

**What:** Promote diocese to a first-class entity and build cross-clinic rollup.

**Why:** Ugandan clinics are run by dioceses (20+ clinics each). The diocese needs HMIS/P&L
rolled up across all its Karibu clinics, with drill-down to one clinic.

**Steps:**
1. `clinics.diocese` TEXT → `dioceses` table + `clinics.diocese_id` FK (backfill from the
   existing TEXT values).
2. Generalize `diocese_coordinators` (052) → `diocese_members(clerk_user_id, diocese_id,
   role)` with `is_diocese_member(diocese_id)`.
3. Materialized diocese rollup RPCs (SECURITY DEFINER, check membership, select
   `clinic_id IN (clinics WHERE diocese_id = X)`). On-demand HMIS aggregation across 20+
   clinics is not feasible — precompute.
4. Diocese cross-clinic reads must emit audit entries (`_shared/audit.ts`).

**Depends on / blocked by:** multi-clinic auth refactor above. Design the rollup mechanism
so it can also feed the investor impact-metrics layer (ADR-0001) — aggregate, de-identified,
different read scope. Build cross-clinic aggregation once.
