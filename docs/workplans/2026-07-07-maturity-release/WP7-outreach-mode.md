# WP7 — Outreach mode (field enrollment: ANC / HIV / TB / general registration)

**Priority:** P2 · **Platform:** Android ONLY, tier A-OFF (platform contract §4)
**Depends on:** WP2 (register-without-visit), WP4 Stage 3 (program sensitivity)
**Theme:** Staff leave the clinic to enroll catchment residents into the medical system
(ANC, TB, HIV, general registration) — the strongest argument for the Android-offline
clinical core. Web plays no role in the field.

---

## Requirements

### A. Register-only, offline (delivered by WP2 — verify here)

1. Field staff can create patient records with NO visit, fully offline, syncing on
   return to clinic Wi-Fi. Verify WP2's Android register-only path under sustained
   offline (dozens of registrations, one sync).

### B. Program enrollment offline

2. HIV/TB registry writes (088 RPCs: `rpc_record_hts_event`, `rpc_upsert_hiv_care`,
   `rpc_upsert_tb_episode`, `rpc_record_tpt`) and ANC enrollment gain Android outbox
   operations (Room-first + `SyncEngine` handlers + `p_client_op_id` idempotency), if
   not already fully wired offline. Audit current Android HIV/TB DAO/sync coverage
   first (HIV/TB DAOs exist per WP2-era sync tests) and close gaps.
3. Enrollment flows must work against a patient row that itself is still unsynced
   (outbox `depends_on` FK ordering: patient before program rows).

### C. Field device protection (coordinates with WP4)

4. A phone carrying HIV/TB enrollment data through a village raises stakes: require an
   app-level lock (PIN/biometric re-auth after backgrounding) — at minimum when program
   registry data is cached locally. Respect WP4's sensitivity model in any offline
   list/search UI (program data behind the same uniform section).

### D. Duplicate management (the genuinely new backend piece)

5. Offline field registration WILL create duplicates against existing clinic records
   (name variants, no ID, shared phones). v1 mitigations:
   - **At capture:** offline fuzzy search against the local Room patient cache
     (name + age band + village) with "possible existing match" prompt before creating.
   - **At sync:** server-side match hints — flag incoming registrations that match
     existing `(phone)` or `(name trigram + age band + sex)` into a
     `patient_duplicate_candidates` table (migration) rather than blocking sync.
   - **Review queue:** records-officer web surface listing candidate pairs with a
     "not a duplicate" dismissal. Full merge tooling is OUT OF SCOPE v1 — capture the
     candidates now, merge tooling is a follow-up WP (merging clinical artifacts is
     high-risk and needs its own design).

### E. Practical field kit

6. Pre-departure "pack for outreach" action: force a full pull (patients, catalog,
   program registries per WP4 access rules) so the device leaves with a warm cache.
7. Post-return sync status: outreach sessions surface "N records captured, M synced,
   K need attention" using the existing `OfflineBanner`/`SyncDetailsSheet` machinery.

## Acceptance

- A nurse spends a day offline in a village: registers 30 residents (no visits), enrolls
  5 in ANC and 2 in TB follow-up, returns to clinic Wi-Fi, opens the app: everything
  syncs; 2 duplicate candidates appear in the records officer's review queue; nothing is
  lost; program data never displayed outside the WP4 sensitivity rules; app demanded PIN
  after every backgrounding.
