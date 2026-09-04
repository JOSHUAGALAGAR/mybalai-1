# MyBalai v3 — phase log

The updated spec (`mybalai-instruction.md` §39–§54) mandates phase-by-phase
delivery. This file is the running record. One entry per phase; a phase is only
"complete" when the §54 gate passes and the project owner signs off.

Phase order: 0 audit → 1 landing → 2 auth → 3 role shell → 4 property mgmt →
5 caretaker assignments → 6 tenant discovery → 7 bookings → 8 payments →
9 messaging/inquiries/notifications → 10 extensions/ratings → 11 superadmin/
subscriptions → 12 reporting/hardening.

---

## Pre-history: pre-phased-spec spike

Before the phased spec arrived, a Scaffold + Auth + Properties-module build was
done in one pass. It is preserved on branch **`spike/phase4-properties`** and
was reconciled off `master`:

- **Kept:** Next.js 16 scaffold, `lib/supabase/*`, `lib/auth/*`, `lib/env*`,
  `proxy.ts`, zod infra, Vitest infra, draft migrations.
- **Shelved to the branch:** `app/(protected)/properties/**`,
  `components/properties/**`, `repositories/properties.repository.ts`,
  `services/properties.service.ts`, `schemas/property.ts`,
  `lib/permissions/properties.ts`, the property test files. These return in
  Phase 4, rebuilt on the design system.
- **Adapted:** role model `admin` → `superadmin`; signup restricted to tenant
  only; dashboard/shell reduced to a Phase-3 placeholder.

---

## PHASE 0 — Audit & foundation ✅

**Status:** complete.

**Existing:** Next 16 + React 19 + TS strict + Tailwind v4 scaffold; Supabase
client layer (browser / server-RLS / service-role); `proxy.ts` session gate;
DAL (`lib/auth/dal.ts`); zod; Vitest.

**Live DB (`bufheqqxgankkzbetkty`) verified:** 42 baseline tables present;
`current_legacy_user_id()` present; **no** match/recommend/fuzzy tables; all
operational tables + `auth.users` empty; `roles` still held `admin` (not
`superadmin`); missing `caretaker_property_assignments` and the subscription
tables.

**Needs migration:** `admin`→`superadmin`; `user_accounts.legacy_user_id`
default; `handle_new_user` trigger. (Drafted as `0001`–`0003`, **not yet
applied** — hosted-only workflow.)

**Needs refactor:** signup was multi-role → tenant-only; role code; no landing
page; route structure; Properties module built ahead of its phase.

**Phase 0 risks:** applying migrations before they settle; Google OAuth needs
dashboard credentials not yet provided.

---

## PHASE 1 — Landing page & design system ✅ (pending owner sign-off)

**Implemented:**
- **Design system:** shadcn/ui (`radix-nova` style) initialised — `components.json`,
  token CSS variables in `app/globals.css` (light + `.dark` class), `lib/utils.ts`
  (`cn`). Components added: `button`, `badge`, `card`, `accordion`, `separator`.
  Old hand-rolled `components/ui/button.ts` removed; `submit-button` and the
  protected shell migrated to the shadcn `Button`. `lib/utilities/cn.ts` now
  re-exports `@/lib/utils`.
- **Public landing (`/`):** `SiteHeader` (sticky, responsive, mobile menu),
  hero with CSS product preview, trust strip, how-it-works, for-tenants /
  for-landlords / for-caretakers, feature grid, booking-flow preview,
  landlord/subscription CTA, FAQ accordion, final CTA, `SiteFooter`.
- **SEO:** `metadataBase`, title/description, OpenGraph + Twitter in root
  layout; page-level metadata on `/`. New env var `NEXT_PUBLIC_SITE_URL`.
- **Routing:** `proxy.ts` now treats `/` as public; `app/page.tsx` is the
  landing (was a redirect to `/dashboard`).

**Database changes:** none (spec §41 — no DB for static marketing).
**RLS changes:** none.
**Routes/pages:** `/` (static). `/login`, `/signup` reachable (Phase 2 builds
them out). `/dashboard` is a placeholder.
**Components:** `components/marketing/{site-header,site-footer}.tsx`,
`components/ui/{button,badge,card,accordion,separator}.tsx`.
**Server actions/API:** none new this phase.
**Tests:** `tests/auth/roles.test.ts` (4). `tsc` ✅ · `eslint` ✅ ·
`next build` ✅ · dev smoke ✅ (`/` 200 with full content; `/dashboard`,
`/properties` → 307 `/login`).

**Known issues / follow-ups:**
- Dark mode is class-based (shadcn convention) with no toggle yet — light only
  until a theme provider lands.
- `vite-tsconfig-paths` prints a deprecation notice (Vitest 4 has native
  support) — cosmetic.
- Landing "product preview" is CSS mock, not a screenshot — revisit once real
  dashboards exist.

**Next phase:** 2 — Login + Tenant signup + Google OAuth.

---

## PHASE 2 — Login, tenant signup, Google OAuth ✅ (pending owner sign-off + migrations)

**Implemented:**
- **Login** (`/login`) — email/password via `signInWithPassword`; generic
  "Invalid email or password" (no raw errors); `next` redirect passthrough;
  notices for `check_email`, `registered`, `reset=done`, `error=oauth`,
  `error=provisioning`, `error=session_expired`; "Forgot password?" link;
  "Continue with Google".
- **Tenant signup** (`/signup`) — full name, email, password, confirm
  password (zod match refinement); always `role: 'tenant'` in metadata;
  `emailRedirectTo` → `/auth/confirm`; "Sign up with Google".
- **Google OAuth** — `signInWithGoogle` server action → `signInWithOAuth`
  (PKCE) → provider; `app/auth/callback/route.ts` exchanges `?code` for a
  session and forwards to `next`; first-time users provisioned as tenant by
  the `handle_new_user` trigger. **Untested until a Google client is added in
  Supabase → Auth → Providers → Google.**
- **Password reset** — `/forgot-password` (`resetPasswordForEmail`, always
  reports success to avoid account enumeration) → email → `/auth/callback`
  → `/reset-password` (`updateUser({ password })`, then sign-out →
  `/login?reset=done`). Needs email delivery configured for production.
- **Unauthorized page** — `app/unauthorized/page.tsx`; `requireRole()` now
  redirects there instead of `/dashboard`.
- **UI on shadcn** — auth forms rebuilt with `Input`, `Label`, `Alert`,
  `Button`; `AuthField` / `AuthDivider` / `GoogleButton` helpers. Removed the
  hand-rolled `components/ui/{field,form-message}.tsx`. Loading/disabled via
  `useFormStatus`; a11y `aria-invalid` / `aria-describedby` on fields.
- **proxy.ts** — `/forgot-password` added to public paths.

**Database changes:** none new. Auth depends on migrations **0001–0003**
(drafted, **must be applied by the owner** in the SQL editor). Until then a
signed-up user sees "Account setup incomplete".
**RLS changes:** none — baseline `user_accounts` / `*_profiles` self-access
policies cover Phase 2; `getCurrentUser()` reads roles via the service-role
client (server-only). Role-scoped policies + superadmin bypass are Phase 3+.
**Routes:** `/login` `/signup` `/forgot-password` (public) · `/reset-password`
`/unauthorized` (gated) · `/auth/callback` `/auth/confirm` (route handlers).
**Server actions:** `login`, `signup`, `logout`, `signInWithGoogle`,
`requestPasswordReset`, `updatePassword`.
**Tests:** `tests/schemas/auth.test.ts` (9) + `tests/auth/roles.test.ts` (4) =
13. `tsc` ✅ · `eslint` ✅ · `next build` ✅ · dev smoke ✅ (login shows Google
+ forgot; signup shows confirm-password; `/reset-password` & `/unauthorized`
gated; `/auth/callback` with no code → `/login?error=oauth`).

**Owner actions required before Phase 2 is testable end-to-end:**
1. Apply `supabase/migrations/0001`, `0002`, `0003` in the Supabase SQL editor.
2. (For Google) add a Google OAuth client in Supabase → Auth → Providers, and
   add `http://localhost:3000/auth/callback` (+ prod URL) to Auth → URL
   Configuration → Redirect URLs.
3. Keep "Confirm email" OFF for now (already done).

**Known follow-ups:** password-reset & confirm emails use Supabase's built-in
sender (rate-limited) until SMTP is configured; no theme toggle yet;
`vite-tsconfig-paths` deprecation notice (cosmetic).

**Next phase:** 3 — Role-based dashboards & navigation shell.

---

## PHASE 3 — Role-based dashboards & navigation shell ✅ (pending owner sign-off)

**Implemented:**
- **App shell** (`components/app-shell/`) — sticky top bar + responsive
  sidebar. Desktop: collapsible sidebar (icon-only ↔ full), preference stored
  in the `mybalai_sidebar_collapsed` cookie and read server-side in the
  `(protected)` layout (no hydration flash, no effect). Mobile: shadcn `Sheet`
  drawer. `SidebarNav` highlights the active route (`usePathname`, exact or
  `startsWith`), keyboard-accessible links. `UserMenu` — shadcn
  `DropdownMenu` + `Avatar` with initials, name/email/role, Settings, Sign out.
- **Role-aware navigation** — `lib/navigation/nav-config.tsx`: one nav per
  primary role (spec §43 routes). Built destinations link; unbuilt ones render
  disabled with a "Soon" tag.
- **Primary role + home** — `lib/auth/roles.ts`: `ROLE_PRIORITY`
  (superadmin > landlord > caretaker > tenant), `primaryRole()`, `roleHome()`.
- **Role home pages** — `/dashboard` (tenant), `/landlord`, `/caretaker`,
  `/admin`. Each: `PageHeader` + a grid of `ModuleCard`s that link when the
  feature exists or show an "Available in Phase N" tag. Guarded by the new
  `requireArea(...roles)` — an authenticated user in the wrong section is
  forwarded to *their* home (not a hard 403); zero-role users go to
  `/unauthorized` (loop-safe).
- **Settings / profile** (`/settings`, any authenticated user) — view
  email/role/status; edit full name / phone / address via `updateProfile`
  server action writing `user_accounts` through the **RLS-bound** client
  (`user_accounts_self_update`), not the service role. `schemas/profile.ts`.
  `getCurrentUser()` DTO extended with `phone` / `address` / `avatarUrl`.
- **Landing header** — shows "Go to app" instead of Sign in / Get started when
  a session cookie is present (light `getAuthUser()` check; `/` is now `ƒ`).

**Database changes:** none. **RLS changes:** none — profile edit relies on the
baseline `user_accounts_self_update` policy. Role-scoped policies on
operational tables + a `superadmin` bypass are deferred to the feature phases /
Phase 12.
**Routes:** `/dashboard` `/landlord` `/caretaker` `/admin` `/settings` (all
gated; role areas forward via `requireArea`).
**Components:** `app-shell/{app-shell,sidebar-nav,user-menu}`,
`dashboard/{page-header,module-card}`, `settings/profile-form`; shadcn
`sheet` `dropdown-menu` `avatar` `tooltip` `skeleton` added.
**Server actions:** `updateProfile`.
**Tests:** `tests/navigation/nav.test.ts` (6) + auth schemas (9) + roles (4) =
19. `tsc` ✅ · `eslint` ✅ · `next build` ✅ · dev smoke ✅ (`/` shows Sign in
when logged out; all role areas + `/settings` → 307 `/login`).

**Not testable until migrations `0001–0003` are applied:** the authed sidebar,
role forwarding, and profile save (needs a real session + provisioned roles).

**Known follow-ups:** no light/dark theme toggle yet; role areas currently only
have their overview page (feature sub-pages arrive in their phases); superadmin
sees the admin nav even when visiting `/landlord` etc.

**Next phase:** 4 — Landlord property management.

---

## PHASE 4 — Landlord property management ✅ (pending owner sign-off + migration 0004)

Covers spec §44: Property → Rooms → Beds, plus Amenities, Rental Rates, and an
availability view. Ownership-scoped throughout.

**Database — migration `0004_property_module.sql` (drafted, not applied):**
- id-sequence `DEFAULT`s for `properties.property_id`, `rooms.room_id`,
  `beds.bed_id`, `rental_rates.rate_id`, `amenities.amenity_id` (start 1,000,000)
- seeds the empty reference catalogs: `property_types` (8), `room_types` (7),
  `amenity_categories` (8), `amenities` (24)
- no baseline tables/columns/constraints changed

**Data access decision:** `rooms`, `beds`, `rental_rates` have RLS enabled with
**no SELECT policy** in the baseline. Rather than add broad read policies now
(tenant discovery in Phase 6 will need carefully-scoped ones), the whole
property module goes through the **service layer** with the service-role client,
and every entry point calls a `property-access.ts` ownership gate
(`requireManageableProperty` → `…Room` → `…Bed` / `…Rate`). `properties` reads
also go through it for a consistent model.

**Implemented:**
- **Schemas** — `property`, `room`, `bed`, `rental-rate` (+ `_helpers`);
  URL validation on cover-image fields, date-range refinement on rates.
- **Repositories** — `reference`, `properties` (+ amenities join),
  `rooms`, `beds` (+ by-property rollup, unique-bed-number conflict message),
  `rental-rates` (soft delete to preserve historical booking prices, spec §5.6).
- **Services** — `properties` (create/update/archive, form options, overview,
  amenities), `rooms`, `beds` (create / status / delete), `rental-rates`;
  shared `ServiceError` + `parseOrThrow`.
- **Routes** (`/landlord/properties/*`): list with superadmin All/Mine tabs +
  `loading` + `error` boundary; `new`; `[propertyId]` overview (details, rooms
  list, availability tiles, inline `RateManager`, `AmenitiesEditor`); `edit`;
  `rooms/new`; `rooms/[roomId]` (details + inline `BedManager`);
  `rooms/[roomId]/edit`. `notFound()` masks both not-found and forbidden.
- **Components** (`components/property/*`) — `property-form`, `room-form`,
  `property-card`, `property-status-badge`, `confirm-button` (native confirm()
  guard for destructive actions), `bed-manager` (list + add + per-row status
  select that auto-submits + delete), `rate-manager` (add + per-row edit/delete
  with unique field ids), `amenities-editor` (category-grouped native
  checkboxes). New `components/ui/form-field` + restored `empty-state`; shadcn
  `textarea` / `select` / `checkbox` added.
- **Nav** — `/landlord/properties` is a live link; landlord overview card links
  to it; standalone Rooms/Beds/Rates nav items removed (managed inside a
  property).

**Images:** cover-image **URL** field only on property + room. File upload,
galleries, and `property_images` / `room_images` wiring wait for a Supabase
Storage phase.
**RLS changes:** none.
**Server actions** (`landlord/properties/actions.ts`): create/update/archive
property, saveAmenities, create/update/delete room, addBed, updateBedStatus,
deleteBed, create/update/delete rate.
**Tests:** `tests/schemas/property.test.ts` (13) +
`tests/services/property-access.test.ts` (6); suite total 34.
`tsc` ✅ · `eslint` ✅ · `next build` ✅ (7 new routes) · dev smoke ✅
(all `/landlord/properties/*` → 307 `/login` when logged out).

**Owner action:** apply `supabase/migrations/0004_property_module.sql` (after
`0001–0003`). Then a landlord account can create a property → rooms → beds →
rates end to end.

**Known follow-ups:** editing a rate is per-row inline (no dedicated route); no
image upload; superadmin uses the admin nav while inside `/landlord`; a
`caretaker` cannot see assigned properties yet (Phase 5).

**Next phase:** 5 — Caretaker management & property assignments.

---

## PHASE 5 — Caretaker management & property assignments ✅ (pending owner sign-off + migration 0005)

Covers spec §45: a landlord creates caretaker accounts and assigns them to
specific properties; caretaker operational access is derived from an **active
assignment row**, never the `caretaker` role alone.

**Database — migration `0005_caretaker_assignments.sql` (drafted, not applied):**
- `caretaker_property_assignments` (`caretaker_id`, `property_id`,
  `assigned_by`, `assigned_at`, `unassigned_at`, `is_active`,
  `unique(caretaker_id, property_id)`) + 3 indexes.
- RLS enabled, no policy — service-layer gated like the rest of the module.

**Access model:** `property-access.ts` gained **"operate"** gates
(`requireOperableProperty` / `…Room` / `…Bed`) = owner / superadmin **OR** a
caretaker with an active assignment. Bed-status changes and the new
room-status change use these; full CRUD stays on the "manage" gates. An
unassigned caretaker gets `not_found` (no existence leak).

**Implemented:**
- **Schemas** — `caretaker` (create + assignments).
- **Repositories** — `caretakers` (list caretaker ids / assignments for a
  landlord or caretaker, `isPropertyAssigned`, `reconcileAssignments` scoped to
  the landlord's own property ids), `users` (by email / auth id / legacy id,
  role codes), `properties.listPropertiesByIds`.
- **Services** — `caretakers`: `createCaretaker`
  (`supabase.auth.admin.createUser` with `role: caretaker` metadata → the 0003
  trigger provisions the account; friendly "email in use"),
  `listMyCaretakers`, `getCaretakerDetail`, `updateAssignments`,
  `listMyAssignedProperties`, `getAssignedPropertyDetail`.
  `rooms.setRoomStatus` + `getOperableRoomDetail`.
- **Landlord routes** — `/landlord/caretakers` (list), `/new` (create form →
  redirects to the assignment screen), `/[caretakerId]` (checkbox
  `AssignmentEditor` over the landlord's own properties).
- **Caretaker routes** — `/caretaker/properties` (assigned list),
  `/[propertyId]` (read-only overview + rooms), `/[propertyId]/rooms/[roomId]`
  (`BedManager` with `canManage={false}` → status only; `RoomStatusControl`).
- **Components** — `caretaker/caretaker-form`, `caretaker/assignment-editor`,
  `property/room-status-control`; `BedManager` gains `canManage`.
- **Nav** — `/landlord/caretakers` and `/caretaker/properties` are live;
  standalone caretaker rooms/beds nav items removed.
- **Tests** — `vitest.config` now injects dummy Supabase env so modules that
  eagerly validate it can be imported. New: `schemas/caretaker` (5) +
  `services/caretaker-access` operable-gate matrix (5). Suite total 43.

**RLS changes:** RLS enabled on the new table (no policy).
**Server actions:** `createCaretakerAction`, `updateAssignmentsAction`
(landlord), `setRoomStatusAction` (caretaker). Bed status reuses the Phase 4
action (its gate now allows an assigned caretaker).
`tsc` ✅ · `eslint` ✅ · `next build` ✅ (6 new routes) · dev smoke ✅
(all new routes → 307 `/login` when logged out).

**Owner action:** apply `supabase/migrations/0005_caretaker_assignments.sql`
(after `0001–0004`). Then a landlord can create a caretaker, assign properties,
and the caretaker sees only those.

**Known follow-ups:** a caretaker with zero assignments does not appear in the
landlord's list (the create flow always lands on the assignment screen);
"invite by email" is not built (create-with-temp-password only); caretaker
messaging/inquiries are later phases; superadmin still uses the admin nav
inside `/landlord` and `/caretaker`.

**Next phase:** 6 — Tenant property discovery.

---

## PHASE 6 — Tenant property discovery ✅ (pending owner sign-off)

Covers spec §46: browse / search / filter / sort + a full property detail
view. **No recommendation or matching layer** — plain queries only.

**Database:** none. The baseline already indexes `properties(status_id)`,
`(property_type_id)`, `rental_rates(property_id)`, `property_ratings(property_id)`,
etc. Trigram indexes for `ILIKE` name/address search are a scale follow-up, not
justified at current volume.

**Data access:** consistent with Phases 4–5 — reads go through
`discovery.service` + `discovery.repository` on the service-role client, and
only surface **`status = active`, non-deleted** properties (and their rooms /
beds / rates / amenities / ratings). No new RLS policies; a truly public
(anon, no login) catalog would want them and is noted as a later option.
Routes live under the authenticated area (`requireUser()` — any signed-in
role can browse; the nav entry is tenant-only).

**Implemented:**
- **Schema** — `discoveryQuerySchema` parses the `/discover` querystring
  (`q`, `type`, `min`/`max` monthly price, `amenities[]`, `sort`, `page`) with
  coercion + clamping; `PAGE_SIZE = 12`.
- **Repository** — `listVisibleProperties` (name/address `ILIKE`, type eq,
  escaped wildcards), `listActiveRates`, `listAmenityLinks`,
  `listRoomsForProperty` / `listBedsForRooms`, `listRatings`, `reviewerNames`.
- **Service** — `searchProperties`: has-all-amenities filter, monthly "from"
  price (min monthly rate, else min of any period) with min/max range, 4 sorts
  (newest / price ↑ / price ↓ / name; no-rate sorts last), pagination →
  `{ items, total, page, pageCount }`. `getDiscoveryDetail`: amenities grouped
  by category, per-room bed availability + rates, ratings avg/count + up to 8
  reviews (reviewer first name via admin read), Google Maps link from
  lat/lng or place id. `getDiscoveryFilters` for the sidebar.
- **Routes** — `/discover`: filter sidebar (`<form method="get">`, no JS
  needed) + responsive result grid + prev/next `Pager` that preserves the
  query; `loading` skeleton + `error` boundary. `/discover/[propertyId]`:
  cover image, about / booking policy / house rules, amenities, rooms
  (available/total beds, rates), reviews, and a disabled **"Booking opens
  soon"** CTA (Phase 7).
- **Components** — `discovery/{discovery-filters,property-result-card,star-rating,pager}`.
  Remote `property_image` URLs render via a plain lazy `<img>` (arbitrary hosts
  — `next/image` would need wildcard `remotePatterns`).
- **Nav** — tenant "Find a place" → `/discover`; the tenant dashboard card
  links there.
- **Types** — added `property_ratings` to `types/database.ts`.

**RLS changes:** none.
**Server actions:** none (discovery is read-only).
**Tests:** `schemas/discovery` (4) + `services/discovery` filter/sort/paginate
(7). Suite total 54. `tsc` ✅ · `eslint` ✅ · `next build` ✅ (2 new routes) ·
dev smoke ✅ (`/discover` + `/discover/[id]` → 307 `/login` when logged out).

**Known follow-ups:** discovery requires login (no anon catalog);
price/amenity filtering happens in the service (fine at small scale, revisit
with a SQL aggregate + trigram indexes later); the detail page's booking and
"ask about this property" CTAs are placeholders until Phases 7 / 9.

**Next phase:** 7 — Booking & reservation lifecycle.

---

## PHASE 7 — Booking & reservation lifecycle ✅ (pending owner sign-off + migration 0006)

Covers spec §47 / §26: request → pending → confirmed / rejected / cancelled →
checked_in → checked_out, with the database as the final authority on
double-booking.

**Database — migration `0006_booking_module.sql` (drafted, not applied):**
- sequence-backed `DEFAULT` for `bookings.booking_id`.
- **`create_booking()`** — one transaction: insert booking (`pending`) +
  `booking_beds` allocation + `booking_rate_snapshots` + `booking_status_history`
  (null→pending) + a `notifications` row for the property owner.
- **`set_booking_status()`** — `SELECT … FOR UPDATE` on the booking, validates
  the transition (`pending`→confirmed/rejected/cancelled, `confirmed`→checked_in/
  cancelled, `checked_in`→checked_out), updates status + landlord-response
  fields, and — when entering an inventory-blocking status — runs
  `UPDATE booking_beds SET bed_id = bed_id` so the **baseline
  `prevent_overlapping_bed_booking` trigger** re-checks against other
  confirmed/checked_in bookings and rolls the whole transaction back on a
  `23P01` conflict. Also writes history + a counterparty notification.
- Both functions are `SECURITY DEFINER`, `REVOKE`d from `public` and granted to
  **`service_role` only** — the app calls them via the service-role client after
  its own authorization. The `create → pending` path lets multiple tenants
  request the same bed; the conflict is enforced at confirm time.

**Implemented:**
- **Schema** — `createBookingSchema` (room/bed/period/dates + refine
  check-out > check-in), `bookingActionSchema`, `nightsBetween` /
  `estimateTotal` (daily = per night, weekly/monthly = `ceil` units, min 1).
- **Repository** (`bookings`) — booking reads, `listBlockingBookingsForBed`
  (availability), `getRateSnapshot`, `listStatusHistory`, batch label lookups
  (property / room / bed / tenant name), RPC wrappers `callCreateBooking` /
  `callSetBookingStatus` mapping `23P01` → "that bed is already booked" and
  `22023` → the transition message.
- **Service** (`bookings`) — `getBookingFormContext` (rooms that have a bed
  *and* a rate), `createBooking` (tenant/superadmin only; resolves the rate
  whose validity window covers check-in; optimistic availability check;
  computes total; calls the RPC), `listMyBookings` / `getMyBooking` /
  `cancelMyBooking` (tenant), `listManagedBookings` (owner+superadmin see all,
  caretaker sees assigned) / `getManagedBooking` / `transitionManagedBooking`
  (all gated by `requireOperableProperty`).
- **Routes** — tenant: `/discover/[id]/book`, `/bookings`, `/bookings/[id]`
  (with a `?created=1` confirmation). Landlord + caretaker:
  `/{landlord,caretaker}/bookings` (status-filter tabs) + `/[id]`, sharing
  `BookingDetailView` + `ManageBookingPanel`. `/discover/[id]` now shows a
  "Request to book" button for tenants.
- **Components** (`components/booking/*`) — `booking-form` (client, live
  estimate), `booking-list`, `booking-detail-view` (details + message +
  landlord response + status history timeline), `booking-status-badge`,
  `manage-booking-panel` (transition buttons + response note + confirm()
  guards), `cancel-booking-form`, `status-filter-tabs`.
- **Nav** — `/bookings`, `/landlord/bookings`, `/caretaker/bookings` are live;
  the three overview cards link there.
- **Notifications** rows are written by the RPCs; the notifications UI is
  Phase 9 (nav item stays "Soon").
- **Types** — added `bookings`, `booking_statuses`, `booking_beds`,
  `booking_rate_snapshots`, `booking_status_history`, `notifications`, and the
  two RPC signatures to `types/database.ts`.

**RLS changes:** none (RPCs are service-role; app authz in the service layer).
**Server actions:** `createBookingAction` (tenant), `cancelBookingAction`
(tenant), `transitionBookingAction` (manager — used by both landlord and
caretaker pages).
**Tests:** `schemas/booking` (11) + `services/bookings` — non-tenant rejected,
monthly total computed, missing-rate rejected, overlap conflict rejected,
transition 404 + RPC args (8). Suite total 69. `tsc` ✅ · `eslint` ✅ ·
`next build` ✅ (6 new routes) · dev smoke ✅ (all new routes → 307 `/login`).

**Owner action:** apply `supabase/migrations/0006_booking_module.sql` (after
`0001–0005`), then the full request → confirm → check-in → check-out flow, and
the double-booking rollback on a second confirm, are exercisable.

**Known follow-ups:** total is an estimate (30-day month approximation);
managers can act on bookings for any of their properties but there is no
bulk view; no date-range availability picker on the booking form (it validates
on submit); booking *extensions* are Phase 10; the notifications those RPCs
write have no UI yet (Phase 9).

**Next phase:** 8 — Payments.

---

## PHASE 8 — Payments ✅ (pending owner sign-off + migrations 0007 / 0007b)

Covers spec §48 / §27 / §6.1 / §6.2: payment records → pending → paid / rejected
/ cancelled, verified **server-side only**, with receipts in Storage and a
notes thread.

**Database — `0007_payment_module.sql` (drafted, not applied):**
- sequence-backed `DEFAULT`s for `payments.payment_id` and
  `payment_note_replies.reply_id`.
- **`create_payment()`** — pending payment + `payment_status_history`
  (`pending`) + a `notifications` row for the property owner.
- **`set_payment_status()`** — `SELECT … FOR UPDATE`, validates
  `pending → paid | rejected | cancelled | unpaid`, sets `paid_at` on verify,
  writes history + an optional `payment_notes` row + a payer notification.
- Both are `SECURITY DEFINER`, `REVOKE`d from `public`, granted to
  **`service_role` only** — spec §27: "the client must never be able to
  directly mark a payment as verified."

**Database — `0007b_receipt_storage.sql` (drafted, not applied):** creates the
private `payment-receipts` Storage bucket + an authenticated INSERT policy.
Reads use short-lived signed URLs generated server-side, so no SELECT policy.

**Implemented:**
- **Schema** — `createPaymentSchema` (booking/amount>0/method + optional
  reference/date/note), `paymentDecisionSchema` (`paid` | `rejected` only),
  `paymentNoteSchema`, `paymentReplySchema`, `attachReceiptSchema`,
  `RECEIPT_BUCKET`.
- **Repository** (`payments`) — payment reads, status history, notes / replies
  / receipts, `signedReceiptUrl` (admin `createSignedUrl`), method resolution,
  RPC wrappers (map `22023` → the transition message); `reference`
  `listPaymentMethods` / `listPaymentStatuses`.
- **Service** (`payments`) — `getPaymentFormContext` (the tenant's
  non-cancelled bookings + active methods), `createPayment` (tenant/superadmin,
  own booking only), `listMyPayments` / `getMyPayment` / `cancelMyPayment`,
  `addNote` / `addReply` / `attachReceipt` (any participant — payer or an
  operable-property manager, checked via `resolvePaymentAccess`),
  `listManagedPayments` (owner+superadmin all, caretaker assigned) /
  `getManagedPayment`, and `decidePayment` — **`requireManageableProperty`**
  so verify / reject is owner or superadmin only. Caretakers get read + notes,
  never a verify button (`canManage` is false → panel hidden).
- **Routes** — tenant `/payments` (+ `/new`, `/[id]` with `?created=1`);
  landlord + caretaker `/*/payments` (status-filter tabs) + `/[id]` sharing
  `PaymentDetailView`.
- **Components** (`components/payment/*`) — `payment-form`, `payment-list`,
  `payment-detail-view` (details + note + receipts + notes thread + history +
  the decide / cancel panels), `payment-status-badge` / `-tabs`,
  `decide-payment-panel` (Verify / Reject + note), `cancel-payment-form`,
  `payment-notes` (thread + add-note + reply forms), `receipt-uploader`
  (browser Storage upload → `attachReceiptAction` records the metadata; the
  service checks the path is prefixed by the payment id).
- **Nav** — `/payments`, `/landlord/payments`, `/caretaker/payments` live;
  overview cards; caretaker overview trimmed (rooms/beds live inside a
  property, matching the landlord one).
- **Types** — `payments`, `payment_statuses`, `payment_methods`,
  `payment_status_history`, `payment_receipts`, `payment_notes`,
  `payment_note_replies` + the two RPC signatures.

**RLS changes:** none in `public` (RPCs are service-role). Storage gets one
INSERT policy (`0007b`).
**Server actions:** `createPaymentAction`, `cancelPaymentAction`,
`decidePaymentAction`, `addNoteAction`, `addReplyAction`, `attachReceiptAction`.
**Tests:** `schemas/payment` (11) + `services/payments` — non-tenant rejected,
foreign-booking rejected, create → RPC args, decide requires
`requireManageableProperty` + RPC args, invalid decision rejected, no-booking
payment 404 (7). Suite total 82. `tsc` ✅ · `eslint` ✅ · `next build` ✅
(7 new routes) · dev smoke ✅ (all → 307 `/login`).

**Owner action:** apply `0007` **and** `0007b` (after `0001–0006`). `0007b`
can also be done in the dashboard (Storage → new private bucket
`payment-receipts` + an authenticated INSERT policy).

**Known follow-ups:** receipt upload trusts client-reported filename/size/mime
(the file itself is the source of truth and only participants can attach);
`refunded` is a valid status but there's no refund flow; the notes thread is
flat (notes + replies merged chronologically, no nesting); notification UI is
still Phase 9.

**Next phase:** 9 — Messaging, inquiries & notifications (spec §49): direct
tenant ↔ landlord / caretaker messaging (Supabase Realtime), property
inquiries, and the in-app notifications inbox that Phases 7–8 have been
populating.

---

## PHASE 9 — Messaging, inquiries & notifications ✅ (pending owner sign-off + migration 0008)

Covers spec §49: direct messaging between a tenant and the manager side
(landlord / caretaker), property inquiries, and the in-app notifications inbox.

**Database — `0008_messaging_module.sql` (drafted, not applied):**
- sequence-backed `DEFAULT`s + `setval` guards for `chat_messages.message_id`
  and `property_inquiries.inquiry_id`.
- adds `chat_messages` and `notifications` to the `supabase_realtime`
  publication (wrapped so a re-run is a no-op).
- no new RLS: `chat_messages` / `property_inquiries` / `notifications` already
  carry working policies, but every write still goes through the service layer
  for consistency. Realtime subscriptions use the browser (session) client and
  rely on RLS filtering.

**Implemented:**
- **Schema** (`schemas/messaging.ts`) — `sendMessageSchema` (receiver, optional
  property + reply-to, body 1–4000), `editMessageSchema`, `createInquirySchema`
  (subject 3–200, message 10–4000), `respondInquirySchema` (response + `close`
  checkbox via preprocess).
- **Repository** (`messaging`) — conversation + per-user message reads,
  `insertMessage` / `updateMessageBody` (sets `is_edited` / `edited_at`),
  `markConversationRead`; inquiry reads for tenant / for a set of properties,
  `insertInquiry` / `updateInquiry`; notification list + unread count +
  mark-read / mark-all-read; `notify()`; `tenantIsLinkedToProperty` (a booking
  or a prior inquiry links a tenant to a property).
- **Services** —
  - `messaging` — `canMessage` (a manager and a linked tenant, both ways),
    `getConversation` (validates, marks read, decorates each message with
    sender name + a reply preview), `sendMessage`, `editMessage` (sender only),
    `listMyConversations` (grouped by counterparty + property, unread counts).
  - `inquiries` — `createInquiry` (tenant only, property must be visible;
    landlord = property owner; notifies), `listMyInquiries` / `getMyInquiry`
    (stamps `tenant_read_at`), `listManagedInquiries` / `getManagedInquiry`
    (owner + superadmin all, caretaker assigned; stamps the reader timestamp
    and moves `new → read`), `respondToInquiry` (**`requireOperableProperty`**,
    writes the response + responder, `read` or `closed`, notifies the tenant).
  - `notifications` — `getNotifications` (maps each row to a role-aware `href`
    via `linkFor`), `getUnreadCount`, `markNotificationRead`,
    `markAllNotificationsRead`.
- **Routes** — tenant `/messages` (+ `/[otherUserId]?property=`),
  `/notifications`, `/inquiries` (+ `/[inquiryId]`),
  `/discover/[propertyId]/inquire`; manager `/landlord/inquiries` +
  `/caretaker/inquiries` (+ `/[inquiryId]`). Messages / notifications guard
  with `requireUser` (any role); inquiries with `requireArea`.
- **Components** — `messaging/message-thread` (client; Realtime
  `postgres_changes` on `chat_messages` filtered by property, INSERT-append /
  UPDATE-patch with de-dupe, reply bar, inline sender-only edit, send form via
  `useActionState`), `messaging/conversation-list`, `inquiry/*` (form, list,
  detail, respond form, status badge), `notifications/notification-list`
  (mark-read forms), `app-shell/notification-bell` (client; Realtime INSERT on
  `notifications` filtered by `user_id` bumps the unread badge).
- **App shell** — the layout fetches the unread count and passes it plus the
  viewer's legacy id to `AppShell`, which renders `<NotificationBell>` in the
  top bar. Booking + inquiry detail views gained a "Message the
  landlord / tenant" link; discover detail offers tenants "Request to book" +
  "Ask about this property".
- **Nav** — `/messages`, `/inquiries`, `/notifications` live for tenants;
  `/landlord/inquiries` + `/caretaker/inquiries` live; landlord / caretaker /
  superadmin Account sections get Messages + Notifications entries.
- **Types** — `chat_messages` + `property_inquiries` added to the hand-written
  `Database` type (`notifications` landed in Phase 7).

**Server actions:** `sendMessageAction`, `editMessageAction`,
`markNotificationReadAction`, `markAllNotificationsReadAction`,
`createInquiryAction`, `respondInquiryAction`.
**Tests:** `schemas/messaging` (6) — send / edit / inquiry / respond
validation incl. the `close` checkbox coercion. Suite total 88.
`tsc` ✅ · `eslint` ✅ · `vitest` ✅ · `next build` ✅ (10 new routes) ·
dev smoke ✅ (all Phase 9 routes → 307 `/login`).

**Owner action:** apply `0008` (after `0001–0007b`). Until the migration runs,
messaging / inquiry inserts fail on the missing id defaults and the bell / list
won't update live (no Realtime publication).

**Known follow-ups:** a conversation is keyed by counterparty + property, so a
tenant with two bookings at one property shares one thread; inquiry threads are
single request + single response (no back-and-forth — that's what messaging is
for); `linkFor` routes message notifications to `/messages` without the
counterparty, so the inbox opens the list, not the thread; no typing / presence
indicators; notification rows are never garbage-collected.

**Next phase:** 10 — Extensions & ratings (spec §50): booking extension
requests and the tenant review / rating flow the dashboard has been stubbing.

---

## PHASE 10 — Booking extensions & property ratings ✅ (pending owner sign-off + migration 0009)

Covers spec §50: a tenant can ask to extend a stay, and can rate a property
after staying there; the landlord side approves extensions and answers reviews.

Owner decisions taken up front (all four = the recommended option):
extensions are a **request → approve** flow (the baseline `booking_extensions`
table has no status column, so 0009 adds one); the extension charge is
**auto-computed from the booking's rate snapshot**; a tenant may rate once a
booking there **reached checked-in or checked-out**; reviews are **public and
the landlord can post one response**.

**Database — `0009_extensions_ratings.sql` (drafted, not applied):**
- id sequences (+ `setval` guards) for `booking_extensions.extension_id` and
  `property_ratings.rating_id`.
- `booking_extensions`: adds `status` (CHECK `pending|approved|rejected|
  cancelled`, default `pending`), `tenant_message`, `decided_by` / `decided_
  role` / `decided_at`, `manager_response`; index on `booking_id`.
- `property_ratings`: `rating` CHECK `1..5`; unique `(property_id, user_id)`
  (so the service can upsert on that target); `landlord_response` /
  `landlord_response_by` / `landlord_response_at`.
- **`create_booking_extension()`** — validates the booking is `confirmed` or
  `checked_in`, the new date is later, and there is no other pending request;
  inserts the row; notifies the owner (referencing the *booking* so the
  notification links to the booking detail).
- **`set_booking_extension_status()`** — `SELECT … FOR UPDATE` the extension +
  booking; only `pending →`; `cancelled` is restricted to the requester. On
  **approve**: moves `bookings.check_out_date`, re-touches `booking_beds` so
  `prevent_overlapping_bed_booking()` re-checks the longer stay (rolls back on
  `23P01`), then opens a pending payment for the amount via `create_payment()`
  and links it back onto the extension. Notifies the tenant (approve / reject)
  or the owner (cancel).
- Both functions `SECURITY DEFINER`, `REVOKE`d from public, granted to
  `service_role` only.

**Implemented:**
- **Schemas** — `schemas/extension.ts` (`requestExtensionSchema`,
  `extensionDecisionSchema` = `approved` | `rejected`), `schemas/rating.ts`
  (`upsertRatingSchema` 1–5 + optional review, `respondReviewSchema`).
- **Repositories** — `extensions.repository.ts` (reads + `callCreateExtension`
  / `callSetExtensionStatus`, `mapDbError` maps `23P01` → overlap message),
  `ratings.repository.ts` (`getRating` / `getUserRating`, `upsertRating` on
  the `(property_id,user_id)` conflict target, `listRatingsByUser` /
  `…ByProperty` / `…ByProperties`, `respondToRating`).
- **Services** —
  - `extensions.service.ts` — `getExtensionContext` (current check-out, rate,
    `canRequest`), `requestExtension` (tenant/superadmin, own booking, active
    status, amount via `estimateTotal` on the rate snapshot),
    `getBookingExtensions(viewer)`, `cancelMyExtension` (requester only),
    `decideExtension` (**`requireOperableProperty`**, parses the decision, RPC).
  - `ratings.service.ts` — `getRatingContext` / `submitRating` (gated on a
    checked-in/out booking, upsert, owner notified), `listMyRatings`,
    `listManagedReviews` (owner + superadmin), `respondToReview`
    (**`requireManageableProperty`** — landlord/superadmin only; reviewer
    notified). `discovery.service.ts` now also returns `landlordResponse` per
    review.
  - `notifications.service.ts` — `linkFor` gains a `review` case
    (`/reviews` ↔ `/landlord/reviews`).
- **Routes** — `bookings/[id]/extend` (tenant request form),
  `discover/[propertyId]/review` (rate form, edits an existing rating),
  `reviews` (tenant's own), `landlord/reviews` (respond). The three booking
  detail pages render an **Extensions** section (`extras` slot on
  `BookingDetailView`); the tenant page also shows a "Rate this stay" link
  once checked-in/out. Discovery detail shows a "Write a review" link for
  tenants and any landlord response under each review.
- **Components** — `components/extension/*` (`request-extension-form`,
  `extension-list`, `decide-extension-panel`, `cancel-extension-form`,
  `extension-status-badge`), `components/rating/*` (`rating-form` with a
  click-to-set star row, `respond-review-form`, `managed-review-list`).
- **Nav / dashboards** — tenant "Reviews" and landlord "Reviews"
  (`/landlord/reviews`) go live; the tenant dashboard "Reviews" card and a new
  landlord "Reviews" card link through.
- **Types** — `property_ratings` gains the landlord-response columns;
  `booking_extensions` table type added; `create_booking_extension` +
  `set_booking_extension_status` added to `Functions`.

**Server actions:** `requestExtensionAction`, `cancelExtensionAction`,
`decideExtensionAction` (`app/(protected)/extensions/actions.ts`);
`submitRatingAction`, `respondReviewAction` (`app/(protected)/reviews/actions.ts`).
**Tests:** `schemas/extension` (4) + `schemas/rating` (5) +
`services/extensions` (7 — landlord rejected, foreign booking 404, amount from
the snapshot, inactive-booking conflict, past-date validation, decide 404,
decide authorizes + RPC args) + `services/ratings` (6 — landlord rejected,
no-stay rejected, upsert + owner notice, `canRate`, respond 404, respond
authorizes + notifies). Suite total 108. `tsc` ✅ · `eslint` ✅ · `vitest` ✅ ·
`next build` ✅ (4 new routes) · dev smoke ✅ (all → 307 `/login`).

**Owner action:** apply `0009` (after `0001`–`0008` + `0007b`). Until then the
extend / rate forms fail on the missing id defaults and the extension RPCs.

**Known follow-ups:** the extension amount reuses the booking's period math, so
a 31-night extension on a monthly rate bills two month-units (rough but matches
how the original booking totals); the pending payment created on approval has
no method until the tenant pays it (they use the existing receipt-upload flow,
and a manager verifies via the Phase 8 decide panel); ratings are not tied to a
specific booking, so one rating covers all stays at a property; there is no
review moderation / hiding; a rejected-then-resubmitted extension is allowed
(only one *pending* at a time is enforced).

**Next phase:** 11 — Superadmin console & subscriptions (spec §51): the
superadmin management surfaces (users, landlords, properties, oversight) and
the subscription-plan / billing tables that are still unbuilt.

---

## PHASE 11 (part A) — Superadmin property review + landlord subscriptions ✅ (pending owner sign-off + migration 0010)

Built in two slices at the owner's direction, both superadmin-facing.

### Slice 1 — read-only property-listings console

- `/admin` overview shows live listing counts (total / pending / active /
  inactive) linking into the filtered list.
- `/admin/properties` — every property across all landlords, status-filter
  tabs (pending queue first), owner + business + type + status +
  verified/featured + submission date.
- `/admin/properties/[id]` — read-only review of a submitted listing (owner
  contact, details, rules, amenities, rooms/beds/rates, rating summary).
- `services/admin.service.ts` (`requireRole('superadmin')` on every call);
  `getAdminProperty` falls back to a direct read so non-active listings stay
  visible to the admin. No mutations (approve / verify deferred).

### Slice 2 — per-landlord subscriptions with automatic caps

Owner decisions: subscription is **per landlord account**; a plan caps
**max_properties, max_rooms_per_property, max_beds_per_room, max_caretakers**;
the **superadmin assigns & activates** a plan (no payment flow); a landlord
with **no active subscription can create nothing**.

The seeded `landlord@example.com` / `caretaker@example.com` accounts were
**deleted** (auth + app rows) — landlords are now superadmin-provisioned.

**Database — `0010_subscriptions.sql` (drafted, not applied):**
- `subscription_plans` — `code` (unique), `name`, `description`, the four
  integer caps (CHECK `>= 0`), `is_active`, `sort_order`. Seeds a **Free**
  plan (3 properties / 3 rooms per property / 4 beds per room / 1 caretaker).
- `landlord_subscriptions` — **one row per landlord** (`landlord_id` unique),
  `plan_id`, `status` CHECK `active|suspended|cancelled`, `starts_at` /
  `ends_at` (null = open-ended), `assigned_by`, `note`.
- Both tables: RLS enabled, **no policy** — reached only through the service
  layer + service-role client, like the rest of the app.

**Implemented:**
- **Schema** — `schemas/subscription.ts`: `planFormSchema` (lowercased slug
  code, four caps, `is_active` checkbox), `assignSubscriptionSchema`
  (landlord + plan + status + optional `ends_at` / note), `createLandlordSchema`
  (email / password / name / business / optional `plan_id`).
- **Repositories** — `subscriptions.repository.ts` (plan CRUD,
  `getSubscriptionForLandlord`, `listSubscriptions`, `upsertSubscription` on
  the `landlord_id` conflict target); `admin.repository.ts` gains
  `listLandlordAccounts` and `ensureLandlordProvisioned` (idempotent — mirrors
  the `handle_new_user` trigger so landlord creation works even before 0003 is
  applied).
- **Service** — `subscriptions.service.ts`:
  - `getEffectiveLimits(landlordId)` → caps, or `null` when there is no
    subscription, it is not `active`, it is past `ends_at`, or the plan is
    inactive.
  - `assertCanAddProperty / Room / Bed / Caretaker` — throw `forbidden`
    (no plan) or `conflict` (over the cap, message names the plan + limit).
    Wired into `properties.service.createProperty`,
    `rooms.service.createRoom`, `beds.service.createBed`,
    `caretakers.service.createCaretaker`; **the superadmin bypasses every
    check**.
  - Superadmin: `listPlansForAdmin` / `getPlanForAdmin` / `createPlan` /
    `updatePlan`; `listLandlordSubscriptions` / `getLandlordSubscription` /
    `assignSubscription` (rejects a non-landlord target);
    `createLandlord` (auth user → `ensureLandlordProvisioned` → optional plan
    assignment); `getSubscriptionOverview` for the `/admin` tiles.
  - Landlord: `getMyPlan` — plan, status, and usage (properties / caretakers
    used vs. max).
- **Routes** — superadmin `/admin/plans` (+ `/new`, `/[planId]`),
  `/admin/subscriptions`, `/admin/landlords` (+ `/new`, `/[landlordId]`
  assign); landlord `/landlord/plan`. `/admin` overview gains a "Landlords &
  subscriptions" tile row.
- **Components** — `components/admin/{plan-form,plan-list,landlord-form,
  subscription-form}.tsx`, `components/subscription/my-plan-view.tsx`
  (usage bars).
- **Nav** — superadmin Landlords / Subscriptions / Plans live; landlord
  "My plan".
- **Types** — `subscription_plans` + `landlord_subscriptions` added.

**Server actions:** `createPlanAction` / `updatePlanAction`
(`app/(protected)/admin/plans/actions.ts`); `createLandlordAction` /
`assignSubscriptionAction` (`app/(protected)/admin/landlords/actions.ts`).
**Tests:** `schemas/subscription` (8) + `services/admin` (6, slice 1) +
`services/subscriptions` (11 — effective-limits null cases, property-cap
enforcement, `assignSubscription` non-landlord rejection + upsert args,
`createPlan` role guard). Suite total 131. `tsc` ✅ · `eslint` ✅ · `vitest` ✅ ·
`next build` ✅ (11 new routes across both slices) · dev smoke ✅
(all → 307 `/login`).

**Owner action:** apply `0010` (after `0001`–`0009`). `APPLY_ALL.sql` now runs
`0001`–`0010`. Until it is applied, `/admin/plans` and landlord creation fail
on the missing tables. After applying, create landlords from
`/admin/landlords/new` and give each a plan.

**Known follow-ups / still Phase 11:** no payment flow for subscriptions
(superadmin assigns by hand); property "approve / verify / feature" actions
still deferred (console is read-only); no superadmin Users management, portal
ads, or platform-wide payment oversight yet; subscription history is not
kept (the single row is updated in place); caps are checked at create time
only — lowering a plan below current usage does not retroactively remove
anything.

**Next:** finish Phase 11 (property approve/verify actions, users management,
portal ads, platform oversight) then Phase 12 (reporting & hardening).

---

## PHASE 11 (part B) — Property review actions + Users management ✅ (pending owner sign-off)

- **Property review** (spec §38) — the `/admin/properties` console is no longer
  read-only. `/admin/properties/[id]` gains a panel: approve (any status →
  `active`, so it shows in discovery), set `inactive`, `archive`; and
  verified / featured toggles (`admin.service.setPropertyStatus` /
  `setPropertyFlags`, superadmin-only, reuse `propertiesRepo.updateProperty`).
- **Users** — `/admin/users` (every account, roles, active flag, name/email
  search) + `/admin/users/[id]` (detail + activate / deactivate).
  `setUserActive` refuses to disable your own account or the last active
  superadmin. `requireUser()` now bounces a deactivated account to
  `/unauthorized`, so the toggle actually cuts access.
- Nav: superadmin **Users** live; `/admin` overview cards link through.
- Tests: +6. Suite 137.

## PHASE 11 (part C) — PayMongo payment gateway ✅ (pending owner sign-off + migration 0011 + keys)

Owner decision: **hosted Checkout Sessions**, single platform PayMongo
account (landlord payouts off-platform), **test mode first**. Entirely
optional — with no `PAYMONGO_SECRET_KEY` the app is unchanged and runs on the
manual flows.

**Database — `0011_paymongo.sql` (drafted, not applied):**
- `subscription_plans` gains `price` (PHP) + `billing_interval_days` — plans
  can now cost money.
- `payments` gains `paymongo_session_id` / `paymongo_payment_id` /
  `paid_channel`.
- `subscription_orders` — a landlord's checkout attempt for a plan
  (pending → paid, links the session).
- `paymongo_events` — processed webhook event ids (idempotency).
- The two new tables: RLS on, no policy.

**Implemented:**
- **`lib/paymongo/client.ts`** — `createCheckoutSession` (line item in
  centavos, `card / gcash / paymaya / grab_pay`, success/cancel URLs,
  metadata), `getCheckoutSession`, `verifyWebhookSignature` (HMAC-SHA256 of
  `t.rawBody`, constant-time compare against `te` / `li`), `PaymongoError`.
- **`lib/env.server.ts`** — optional `paymongo.{secretKey,webhookSecret}` +
  `isPaymongoConfigured()`. `.env.example` documents the vars.
- **`services/paymongo.service.ts`** — `startBookingPaymentCheckout(paymentId)`
  (tenant/superadmin, own *pending* payment → session, stores the id, returns
  the URL); `startSubscriptionCheckout(planId)` (landlord/superadmin, priced
  active plan → `subscription_orders` row + session); `handleWebhook` — verify
  → `claimEvent` (idempotent) → on `checkout_session.payment.paid`:
  `booking_payment` calls the `set_payment_status` RPC to `paid` (skips if not
  pending); `subscription` marks the order paid, upserts
  `landlord_subscriptions` active with `ends_at = now + interval_days`, and
  notifies.
- **`app/api/paymongo/webhook/route.ts`** — POST, `force-dynamic`; 401 on a
  bad signature, 500 on a fulfilment error (PayMongo retries), 200 otherwise.
  `proxy.ts` allow-lists `/api/paymongo` so the session gate does not redirect
  it.
- **UI** — tenant payment detail shows a **Pay online** button on a pending
  payment (only when configured), with a `?paid=1` confirmation; superadmin
  plan form gains **Price** + **Billing interval**, plan list shows them;
  `/landlord/plan` shows a **plan picker** for priced active plans → checkout,
  with a `?subscribed=1` confirmation.
- **Types** — `subscription_orders`, `paymongo_events`, the new
  `subscription_plans` / `payments` columns.

**Server actions:** `payOnlineAction` (`payments/actions.ts`),
`subscribeAction` (`landlord/plan/actions.ts`).
**Tests:** `lib/paymongo` signature verify (4) + plan price/interval parsing
(1). Suite total 142. `tsc` ✅ · `eslint` ✅ · `vitest` ✅ · `next build` ✅
(webhook route + updated pages) · dev smoke ✅ (webhook → 401 without a
signing secret; pages → 307 `/login`).

**Owner action:**
1. Apply `0011` (after `0001`–`0010`). `APPLY_ALL.sql` now runs `0001`–`0011`.
2. In the PayMongo dashboard (test mode): copy the secret key to
   `PAYMONGO_SECRET_KEY`; create a webhook pointing at
   `https://<site>/api/paymongo/webhook` for event
   `checkout_session.payment.paid`, and put its signing secret in
   `PAYMONGO_WEBHOOK_SECRET`. Restart the app.
3. Give priced plans a `price` in `/admin/plans` so landlords can buy them.

**Known follow-ups:** no recurring billing — a subscription is one payment per
period and expires at `ends_at` (a renewal is another checkout); the webhook
only handles `checkout_session.payment.paid` (no refund / failed / expired
handling, no reconciliation job); landlord earnings are not yet tracked in a
ledger/wallet (payouts are fully off-platform); the success page just says
"clearing" — it does not poll `getCheckoutSession`.

**Still Phase 11:** portal ads, platform-wide payment/booking oversight
consoles. **Then Phase 12:** reporting & hardening.

---

## PHASE 11 (part D) — Booking↔payment lifecycle for PayMongo ✅ (pending owner sign-off + migration 0012)

Built to the attached "MyBalai — PayMongo Payment Integration Specification"
(§6–§16). Payment is now part of the booking state machine.

```
pending (REQUESTED)
  -> landlord approves -> payment_pending   [bed HELD; deadline stamped]
      -> verified payment (webhook / reconcile) -> confirmed
      -> deadline elapses                       -> expired  [hold released]
      -> tenant cancels / landlord rejects      -> cancelled / rejected
confirmed -> checked_in -> checked_out
```

`confirmed` is reachable **only** through a verified payment
(`settle_booking_payment`) — never a manual action. `BOOKING_TRANSITIONS`
drops `confirmed`; `transitionManagedBooking` and `cancelMyBooking` re-check
the allowed set server-side.

**Database — `0012_booking_payment_flow.sql` (drafted, not applied):**
- `booking_statuses` += `payment_pending` (inventory-blocking) / `expired`
  (final); `payment_statuses` += `failed` / `expired`.
- `properties.payment_deadline_minutes` (default 30, 5–10080);
  `bookings.payment_due_at`; `payments.expires_at`.
- **`set_booking_status`** rewritten: `pending → payment_pending` stamps
  `payment_due_at = now() + deadline`; `payment_pending → confirmed | expired
  | cancelled | rejected`; friendly per-status notifications.
- **`settle_booking_payment(p_payment, p_paymongo_payment_id)`** — payment
  `pending → paid` and, if the booking is `payment_pending`, booking
  `→ confirmed` (+ re-touch `booking_beds`, history, notify tenant & owner).
  Returns `already_paid` on replay (idempotent, §11).
- **`fail_booking_payment(p_payment, p_reason)`** — payment `→ failed`,
  booking untouched, notify the tenant to retry (§9).
- **`expire_overdue_bookings(p_booking default null)`** — `payment_pending`
  past `payment_due_at` → `expired`, its pending payment → `expired`, notify;
  scheduled every minute via `pg_cron` **when the extension is available**
  (the block raises a NOTICE and the app sweeps lazily on every booking read
  otherwise), plus a targeted call before each booking detail / transition.

**Service / webhook:**
- `lib/paymongo/status.ts` — `mapPaymongoEvent` (`paid` | `failed` |
  `ignore`), `checkoutSessionIsPaid`; **the one place PayMongo event names
  live** (§13). `client.extractPaidPayment` reads amount / currency /
  payment-id from a `checkout_session` or `payment` resource.
- `handleWebhook` (§7) — verify signature (→ 401), `claimEvent` (idempotent),
  map the event; resolve the MyBalai record via `metadata` or the session id;
  on **paid** re-verify **amount + currency** against the record and only then
  call `settle_booking_payment` (mismatch → logged, not settled — §7.6/§12/
  §18); on **failed** call `fail_booking_payment`; subscription orders
  unchanged.
- `startPaymentCheckout({ bookingId | paymentId })` — §3 "Pay Now" from a
  `payment_pending` booking (creates the payment record, amount from
  `booking.total_amount`, `expires_at` from the deadline) **or** retry an
  existing pending payment. Sweeps expiry first; rejects a closed window.
- `reconcilePayment(paymentId)` (§16) — `getCheckoutSession` → verify →
  `settle_booking_payment`; returns `paid | pending | failed | expired`.

**UI:**
- Booking detail (tenant): a **Payment required** panel with the amount + the
  deadline; **Pay now** when PayMongo is configured, otherwise a note to use
  the manual receipt flow. Manage panel: **"Approve — request payment"**
  replaces "Confirm".
- `/payments/[id]?paid=1` renders **`PaymentSettlementPoller`** — "Payment
  processing…", polls `reconcilePaymentAction` (~10× / 3s) and a **Check now**
  button, resolving to Verified / Failed / Expired (§16). The stale static
  "clearing…" alert is gone.
- Booking status badges gain `payment_pending` / `expired`.

**Server actions:** `payForBookingAction` (`bookings/actions.ts`),
`payOnlineAction` + `reconcilePaymentAction` (`payments/actions.ts`).
**Tests:** `lib/paymongo-status` (extract + mapping, 3) +
`services/paymongo` (webhook: bad sig, idempotent replay, amount mismatch not
settled, settle on match, failed → fail RPC, 5) + booking-transition rework
fixes. Suite total 154. `tsc` ✅ · `eslint` ✅ · `vitest` ✅ · `next build` ✅
· dev smoke ✅ (webhook → 401 without a signing secret; routes → 307 `/login`).

**Owner action:**
1. Apply `0012` (after `0001`–`0011`). `APPLY_ALL.sql` now runs `0001`–`0012`.
2. If the `0012` NOTICE says `pg_cron` is unavailable: Dashboard → Database →
   Extensions → enable **pg_cron**, then re-run `0012`'s final `do $$ … $$`
   block. (Bookings still expire lazily without it, just not while unattended.)
3. Set each property's `payment_deadline_minutes` if 30 isn't right.

**Not built (spec, deferred — flag before starting):** §17 refunds
(`REFUNDED` / `PARTIALLY_REFUNDED`, policy-aware); §15 instant-booking mode.
**§20:** the PayMongo API shapes (Checkout Sessions, `Paymongo-Signature`
`t,te,li` HMAC, centavo amounts, `checkout_session.payment.paid` /
`payment.failed` event names, resource nesting) are implemented from
knowledge, **not** verified against live docs — confirm at
developers.paymongo.com before the live cutover.
