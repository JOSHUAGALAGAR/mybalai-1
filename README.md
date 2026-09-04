# MyBalai v3

Property and rental management platform. Next.js 16 (App Router) · React 19 ·
TypeScript · Tailwind CSS v4 · shadcn/ui · Supabase (PostgreSQL / Auth / RLS).

Built **phase by phase** per `mybalai-instruction.md` (§39–§54). Progress is
tracked in [`docs/phase-log.md`](docs/phase-log.md).

## Status

| Phase | Scope | State |
| --- | --- | --- |
| 0 | Audit & foundation | ✅ complete |
| 1 | Landing page + design system | ✅ built, awaiting sign-off |
| 2 | Login + tenant signup + Google OAuth | not started |
| 3+ | Role shell, property mgmt, bookings, payments, … | not started |

The pre-phased-spec Auth + Properties spike lives on branch
`spike/phase4-properties` and will be folded back in at Phase 2 / Phase 4.

## Account types (spec §38)

`tenant` · `landlord` · `caretaker` · `superadmin`. Only **tenant** self-registers.

## Getting started

See [`docs/setup.md`](docs/setup.md).

```bash
cp .env.example .env.local      # fill in Supabase keys
# apply supabase/migrations/0001–0003 in the Supabase SQL editor (Phase 2)
npm run dev                     # http://localhost:3000
```

## Docs

- [`docs/phase-log.md`](docs/phase-log.md) — per-phase progress and gates
- [`docs/setup.md`](docs/setup.md) — environment, migrations, commands
- [`docs/db-verification-2026-09-04.md`](docs/db-verification-2026-09-04.md) — live DB audit
- [`docs/decisions-2026-09-04.md`](docs/decisions-2026-09-04.md) — early decisions (pre-phased-spec)
- [`supabase/migrations/README.md`](supabase/migrations/README.md) — migration workflow + provisioning
