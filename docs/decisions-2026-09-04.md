# Session decisions — 2026-09-04

Answers given by the project owner that shaped this first build of
`mybalai_v3`. Recorded so later work does not re-litigate them.

| # | Question | Decision |
| --- | --- | --- |
| 1 | Session scope | Scaffold **+ Auth + one full module** (Properties). |
| 2 | Verify live Supabase now? | Yes — see `db-verification-2026-09-04.md`. |
| 3 | Package manager / VCS | **npm**, `git init` (done by `create-next-app`). |
| 4 | Secrets handling | Standard `.env.local`; `.env.example` committed; `.env*` git-ignored. Secret key stays server-only. |
| 5 | Auth bootstrap | **Build signup + provisioning** (no manual seed users). |
| 6 | New-user ID strategy | **New migration adds a sequence** on `user_accounts.legacy_user_id`, starting at 1,000,000. |
| 7 | First module | **Properties** (list / detail / create / edit / archive). |
| 8 | Dev DB workflow | **Hosted-only** — migrations are tracked `.sql`, applied by hand in the dashboard SQL editor. |
| 9 | Signup role | User **picks one** of tenant / landlord / caretaker at signup. Admin seeded manually. |
| 10 | Email confirmation | **Off** for now (owner toggled it in the dashboard). Confirm route still wired for later. |
| 11 | Provisioning mechanism | **DB trigger** `handle_new_user()` (SECURITY DEFINER) on `auth.users`. |
| 12 | Property write authorization | **Server-side, service-role** — reads via RLS, writes via the service layer after app-code checks. No new RLS write policies. |

## Derived decisions (made during implementation, not asked)

- **Next.js 16** (what `create-next-app` installed) — uses `proxy.ts`, not
  `middleware.ts`; async `cookies()`/`params`/`searchParams`; Turbopack default.
- Sequence pattern from decision 6 also applied to **`properties.property_id`**
  (same bare-BIGINT-PK problem). To be repeated per table as modules land.
- New properties are always created with status **`pending`**; landlords may
  later set `active` / `inactive` / `maintenance`; `is_verified` / `is_featured`
  remain admin-only (no admin UI yet).
- Authenticated route group `app/(protected)/` provides the shared shell; URLs
  are unchanged (`/dashboard`, `/properties`). Spec §23 lists these at the app
  root — the route group is a structural convenience, not a divergence.
- Identity lookup (`lib/auth/dal.ts`) uses the **service-role client** because
  `public.user_roles` has RLS enabled with no SELECT policy. If role checks are
  later needed inside RLS predicates on other tables, add a
  `user_roles_self_read` policy then.
- Tests: **Vitest**, logic-only (schemas / permissions / services). Component
  and RLS/integration tests deferred (the latter needs seed data).

## Not in this build

Legacy data migration · Supabase Storage buckets · Realtime config · other
domain modules · admin UI · `supabase gen types` (types hand-written for the
tables in scope) · full email-confirmation UX.
