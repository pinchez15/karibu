# Karibu Office (`@karibu/office`)

Business tools for local offices: the partners who sell, onboard, support and bill clinics.
Spec: `docs/karibu-office-spec.md`. Architecture: `docs/architecture/adr-0002-local-offices.md`.

## Run it

```sh
cp apps/office/.env.example apps/office/.env.local   # fill in Clerk + Supabase (same instances as apps/web)
pnpm --filter @karibu/office dev                     # http://localhost:3010
```

There is no `SUPABASE_SECRET_KEY` here, on purpose. The app uses the anon key plus the
signed-in user's Clerk token and can only reach data through the `office_*` RPCs.

## First run against a database

1. Apply migrations `115`–`118` (`packages/supabase/migrations`). They seed the office "Karibu Uganda".
2. Sign in as a user who is in `superadmins`. You land on `/foundation`.
3. Open the office, create an owner join link, and send it. The owner signs in and opens it.
4. Set the fee start date when the office should start being billed.
5. Deploy `apps/web` too: it carries the nightly job (Inngest `office-nightly`), the
   "Get help" page and the lead form on `/local/[office]`.

## Checks

```sh
pnpm --filter @karibu/office typecheck
pnpm --filter @karibu/office test                 # CSV, SMS parser, statement, outbox, photo extraction
pnpm --filter @karibu/office build && pnpm --filter @karibu/office budget   # page weight per core route
packages/supabase/scripts/test-office-local.sh    # SQL tests on a throwaway local Postgres 17
```

## Layout

```
src/app/(app)/o/[office]/     partner surface: Today, Clinics, Support, Money, More
src/app/(app)/foundation/     Karibu central: offices, fee ledger, grants, conflicts, escalations
src/app/(public)/r/[token]/   login-free readiness form a clinic fills in
src/app/(public)/i/[token]/   login-free invoice a clinic opens
src/lib/db.ts                 the only database access: rpc() as the user, rpcPublic() for token pages
src/lib/stage.ts              which nav items each business stage unlocks
src/i18n/en.ts                every string
```
