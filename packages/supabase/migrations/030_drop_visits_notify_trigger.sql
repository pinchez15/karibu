-- Defensive cleanup: drop a stray trigger that was added directly in the
-- Supabase dashboard (not via any prior migration) and was the actual root
-- cause of three days of "create_visit HTTP 404" errors.
--
-- The trigger fired AFTER INSERT/UPDATE/DELETE on visits and called
-- visits_notify_queue() which used the older
-- realtime.send(text, unknown, jsonb, boolean) signature. Recent Supabase
-- Realtime versions changed the signature, so every visit INSERT raised
-- 42883 (undefined_function). PostgREST surfaced that as HTTP 404 with the
-- response body containing "No function matches the given name and argument
-- types..." — only visible once the Android client started capturing the
-- error body in 1.0.9 (10).
--
-- Migration 018 had previously dropped visits from the supabase_realtime
-- publication, but the trigger itself was not removed. Capturing the drop
-- here so a fresh Supabase project setup or any dashboard restore can't
-- silently re-introduce the bug.
DROP TRIGGER IF EXISTS visits_notify_trigger ON public.visits;
DROP FUNCTION IF EXISTS public.visits_notify_queue();
