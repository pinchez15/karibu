-- Fix: realtime.send() doesn't exist on this Supabase instance.
-- Remove visits from the realtime publication to prevent the trigger error.
-- The web app already refreshes the queue via server actions after each mutation,
-- so Postgres-level realtime is not needed for queue updates.

ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS visits;
