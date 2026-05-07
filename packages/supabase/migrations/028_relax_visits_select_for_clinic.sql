-- The previous visits_select_policy required the requesting staff to be either
-- admin/nurse, or assigned as the visit's doctor_id/nurse_id. PostgREST's
-- INSERT-then-SELECT readback (Prefer: return=representation) then 404'd
-- newly-created visits whenever the JWT-derived staff_id didn't equal the
-- doctor_id we just wrote, even though the row was successfully inserted.
--
-- For a small clinic, every staff member needs to see today's queue anyway
-- (this matches patients_select_policy). Tighter per-row gating belongs in
-- the UI / RPC layer, not RLS.
DROP POLICY IF EXISTS "visits_select_policy" ON visits;

CREATE POLICY "visits_select_policy" ON visits
  FOR SELECT
  USING (clinic_id = get_current_clinic_id());
