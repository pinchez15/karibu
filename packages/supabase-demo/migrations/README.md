# Demo baseline migrations

`0001_baseline.sql` is generated here by `../scripts/build-baseline.sh` — a
schema-only dump of the production database (the consolidated end state of
`packages/supabase/migrations` 001–105). Review and commit it once generated.

Do not author new migrations in this directory. New migrations live in
`packages/supabase/migrations/` and are applied to prod and demo alike
(`supabase db push --db-url "$DEMO_DB_URL"`).
