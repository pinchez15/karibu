## EHR pivot (authoritative implementation guide)

The clinic queue model is being replaced with a **patient-centered EHR** (pre-launch big-bang).
Before implementing sync, Android role homes, lab/pharmacy, pharmacy order timing, or schema
changes for this effort, read **`docs/ehr-pivot-implementation.md`** end-to-end.

Before implementing or changing **AI notes or Consult** in Karibu EHR, read
**`docs/ai-clinical-assist.md`** end-to-end.

Before implementing **Karibu Learn** (standalone CME app, not EHR), read
**`docs/karibu-learn/product-boundary.md`** and **`docs/karibu-learn/vision.md`**
end-to-end. Learn and EHR are separate apps: different auth, different databases,
not reachable from each other. They share this monorepo only so Learn can mirror
EHR chart UX for pre-onboarding.

That doc supersedes older planning docs when they conflict. Key locked decisions:

- Pharmacy queues on **order submitted**, not note finalization
- Lab + pharmacy on **one Android app** (role-based homes)
- Offline dispense with **local stock decrement**, sync when online
- Payment **decoupled** from clinical closure; all writes via **SECURITY DEFINER RPCs**

## Karibu Office (partner business tools, `apps/office`)

Before changing `apps/office`, the `office` schema or any `office_*` RPC, read
**`docs/karibu-office-spec.md`** (Section 14 holds the decided questions) and
**`docs/architecture/adr-0002-local-offices.md`**. Rules that must not be broken:

- **No patient data in Karibu Office.** `office_*` RPCs return counts, timestamps and staff
  names only. `packages/supabase/tests/office_operations.sql` fails if any office function
  references a patient or clinical column.
- **`apps/office` never gets the Supabase service-role key.** It uses the anon key plus the
  user's Clerk token. Scheduled work runs from `apps/web` (Inngest) by calling SQL.
- **Never create a clinic's Clerk organization with `createdBy`** from the office app: the
  webhook would give the partner a clinic `staff` row.
- Every office migration ends with `office.apply_rpc_grants(...)`.
- Run the SQL tests with `packages/supabase/scripts/test-office-local.sh` (local Postgres 17,
  no production contact).

