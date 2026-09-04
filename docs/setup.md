# MyBalai v3 — local setup

## 1. Environment

```bash
cp .env.example .env.local
```

| Variable | Where |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable / anon key |
| `SUPABASE_SECRET_KEY` | Secret / service-role key (server only) |
| `NEXT_PUBLIC_SITE_URL` | Public origin for metadata/OG (`http://localhost:3000` in dev) |

## 2. Run

```bash
npm run dev          # http://localhost:3000  (Next 16 + Turbopack)
npm test             # Vitest unit tests
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
npm run build        # production build
```

The landing page (`/`) needs no database. Migrations and auth settings below
are needed from **Phase 2** onward.

## 3. Database migrations (hosted-only, applied by hand)

Supabase dashboard → **SQL Editor**, in order:

| File | Phase |
| --- | --- |
| `0001_new_record_id_sequences.sql` | 2 |
| `0002_roles_admin_to_superadmin.sql` | 2 |
| `0003_handle_new_user.sql` | 2 |

Verification queries + non-tenant provisioning snippet:
`supabase/migrations/README.md`.

## 4. Auth settings (hosted, Phase 2)

- **Authentication → Providers → Email → Confirm email: OFF** for now
  (`/auth/confirm` is wired for when it is re-enabled).
- **Authentication → Providers → Google:** add a Google OAuth client
  (ID + secret) when wiring "Continue with Google".

## Architecture at a glance

```
proxy.ts ──────────── session refresh + coarse route gate (Next 16 "proxy")
app/page.tsx ───────── public landing page (Phase 1)
components/marketing/  landing header / footer
components/ui/ ─────── shadcn/ui components + tokens
app/(auth)/ ───────── login / signup / logout  (Server Actions)
app/(protected)/ ──── authenticated area (Phase 3 rebuilds this shell)
lib/supabase/ ─────── client (browser) · server (RLS) · admin (service-role)
lib/auth/ ─────────── dal.ts (getCurrentUser → legacy id + roles) · roles.ts
lib/utils.ts ───────── cn() (shadcn)
schemas/ ──────────── zod input validation
supabase/migrations/  tracked SQL, applied by hand
```

> Shelved on branch `spike/phase4-properties` until their phases: the
> repositories/services/permissions layers and the Properties module UI.
