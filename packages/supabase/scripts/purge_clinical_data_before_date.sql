-- Purge clinician-entered demo data before a cutoff date.
--
-- If you see "Only platform superadmins may purge clinical data", run the
-- patch in migrations/085_purge_rpc_sql_editor_auth.sql first (Supabase SQL
-- editor runs as postgres, not with your Clerk JWT).
--
-- Optional — inspect your session:
-- SELECT is_superadmin(), karibu_is_service_role(), current_user,
--        current_setting('request.jwt.claims', true);
--
-- Optional — confirm your Clerk user is in platform superadmins (for app calls):
-- SELECT * FROM superadmins WHERE is_active;

-- Step 1 — preview counts (no deletes):
SELECT rpc_admin_purge_clinical_data_before(
  '2026-06-05'::date,  -- strictly before this date
  NULL,                -- all clinics; or pass a clinic UUID for one site
  TRUE,                -- remove patients left with no visits on/after cutoff
  TRUE                 -- dry run
);

-- Step 2 — execute (only after the preview looks right):
-- SELECT rpc_admin_purge_clinical_data_before(
--   '2026-06-05'::date,
--   NULL,
--   TRUE,
--   FALSE
-- );

-- Ssunga only example:
-- SELECT rpc_admin_purge_clinical_data_before(
--   '2026-06-05'::date,
--   '30033fce-aab4-4d87-b580-191d516f60b2'::uuid,
--   TRUE,
--   FALSE
-- );
