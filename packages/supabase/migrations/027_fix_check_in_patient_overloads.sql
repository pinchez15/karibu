-- Remove legacy check_in_patient overloads so PostgREST can resolve the
-- current dictation-first queue RPC unambiguously.

DROP FUNCTION IF EXISTS check_in_patient(UUID, UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS check_in_patient(UUID, UUID, TEXT, TEXT, UUID);

GRANT EXECUTE ON FUNCTION check_in_patient(UUID, UUID, TEXT, TEXT, UUID, TEXT) TO anon, authenticated;
