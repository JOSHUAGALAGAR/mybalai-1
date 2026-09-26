# Supabase migrations

Workflow is **hosted-only**: these `.sql` files are the tracked source of
truth, applied by hand through the Supabase dashboard SQL editor
(Database → SQL Editor) against project `bufheqqxgankkzbetkty`.

Apply in numeric order. Each file is wrapped in `begin; … commit;` and is
idempotent (safe to re-run).

## Fastest path: `APPLY_ALL.sql`

`APPLY_ALL.sql` is `0001`–`0009` concatenated in order. Open it, copy the whole
file into the SQL editor, and **Run**. That is the one step needed to make the
app work against a fresh copy of the baseline schema.

> Symptom when the migrations have **not** been applied:
> `null value in column "property_id" of relation "properties" violates
> not-null constraint` when a landlord submits **/landlord/properties/new** —
> the baseline PK has no sequence default until `0004` runs.

| File | Purpose | Phase | Depends on |
| --- | --- | --- | --- |
| `0001_new_record_id_sequences.sql` | Sequence-backed `DEFAULT` (+ `setval` guard) for `user_accounts.legacy_user_id` | 2 | Baseline schema (spec §31) |
| `0002_roles_admin_to_superadmin.sql` | Migrate the `admin` role to `superadmin` (spec §38); repoints `user_roles` and drops the stale row if both exist | 2 | Baseline |
| `0003_handle_new_user.sql` | `handle_new_user()` trigger on `auth.users` — provisions `user_accounts` + `user_roles` + role profile on signup | 2 | `0001`, `0002` |
| `0004_property_module.sql` | **Sequence-backed `DEFAULT`s for `properties` / `rooms` / `beds` / `rental_rates` / `amenities`** + seeds property types, room types, amenity catalog | 4 | Baseline |
| `0005_caretaker_assignments.sql` | `caretaker_property_assignments` id default + guards | 5 | `0004` |
| `0006_booking_module.sql` | `bookings.booking_id` default; `create_booking()` / `set_booking_status()` transactional RPCs (service_role only) | 7 | `0004` |
| `0007_payment_module.sql` | `payments` / `payment_note_replies` id defaults; `create_payment()` / `set_payment_status()` RPCs (service_role only) | 8 | `0006` |
| `0007b_receipt_storage.sql` | Private `payment-receipts` Storage bucket + authenticated INSERT policy | 8 | — |
| `0008_messaging_module.sql` | `chat_messages` / `property_inquiries` id defaults; adds `chat_messages` + `notifications` to the `supabase_realtime` publication | 9 | `0004` |
| `0009_extensions_ratings.sql` | `booking_extensions` / `property_ratings` id defaults; extension workflow columns + status CHECK; rating `1..5` CHECK, unique `(property_id, user_id)`, landlord-response columns; `create_booking_extension()` / `set_booking_extension_status()` RPCs (service_role only) | 10 | `0004`, `0006`, `0007` |
| `0010_subscriptions.sql` | `subscription_plans` (four caps + `is_active`, seeds a Free plan) + `landlord_subscriptions` (one per landlord, status/dates). RLS on, no policy. | 11 | `0001`, `0004` |
| `0011_paymongo.sql` | `subscription_plans.price` + `billing_interval_days`; `payments` PayMongo link columns; `subscription_orders` + `paymongo_events` (RLS on, no policy). Optional — inert without PayMongo keys. | 11 | `0007`, `0010` |
| `0012_booking_payment_flow.sql` | `payment_pending` / `expired` booking statuses, `failed` / `expired` payment statuses; `properties.payment_deadline_minutes`, `bookings.payment_due_at`, `payments.expires_at`; rewrites `set_booking_status`; adds `settle_booking_payment` / `fail_booking_payment` / `expire_overdue_bookings` (service_role). Final block schedules a `pg_cron` sweeper — **enable `pg_cron`** in Dashboard → Database → Extensions if the NOTICE says it is missing, then re-run that block. | 11 | `0006`, `0007`, `0011` |
| `0013_property_images.sql` | Extends the baseline `property_images` / `room_images` tables (id sequences, `room_images` cover/type/size columns, one cover each) and creates the public 5 MB `property-images` Storage bucket. Uploads use server-issued signed URLs, so no Storage policy is needed. | 12 | `0004` |
| `0014_advance_and_deposit.sql` | Optional "1 month advance" / "1 month deposit" per property (default for its rooms) and per room; bookings snapshot `advance_amount` / `deposit_amount` (included in `total_amount`); `create_booking()` gains optional `p_advance` / `p_deposit`. | 13 | `0006` |
| `0015_profile_photos_and_id_verification.sql` | Public `profile-images` bucket; PRIVATE `id-documents` bucket; `identity_verifications` (tenant ID front/back, pending/approved/rejected, admin review); `user_accounts.id_verified_at` for the Verified badge. | 14 | `0004` |
| `0016_audit_logs_and_portal_ads.sql` | Makes the existing `audit_logs` append-only + indexed; adds `link_label` / `updated_at` to the existing `portal_ads` and a public `portal-ads` bucket. | 15 | `0015` |
| `0017_landlord_payouts.sql` | Wires up landlord earnings and withdrawals on the existing tables: PayMongo fee setting, a trigger that records each online payment's net (fees snapshotted), and `request_landlord_payout()`. | 16 | `0016` |
| `0018_property_boosts.sql` | Replaces subscriptions with optional paid boosts: `boost_packages` (admin-priced), purchase columns on `property_boosts`, and `settle_property_boost()`. | 17 | `0017` |
| `0019_refunds_and_boost_lifecycle.sql` | Refunds (`refund_payment()`, clawbacks netted off withdrawals), `refund_amount` / `mybalai_revenue` on earnings, boost expiry and cancellation columns. | 18 | `0018` |
| `0020_landlord_applications.sql` | `landlord_applications`: property owners apply from the landing page; the superadmin reviews them. | 19 | `0019` |
| `0021_application_documents.sql` | Private `application-documents` bucket and `landlord_application_documents` (permits, DTI, proof of ownership, ID) for landlord applications. | 20 | `0020` |
| `0022_tenant_preferences_and_matching.sql` | Tenant preferences (budget, area, amenities, room kind, opt-in lifestyle) and `match_logs` (recommendations shown, for evaluation). | 21 | `0021` |
| `0023_tenant_room_types.sql` | Matching preferences use the landlord's room types (Single, Double, …) instead of solo/shared: adds `tenant_preferences.room_type_ids`, drops `room_kind`. | 22 | `0022` |
| `0024_property_boost_ids.sql` | Gives `property_boosts.boost_id` a sequence default (buying a boost failed with a null `boost_id`). | 23 | `0018` |
| `0025_app_downloads.sql` | `app_downloads`: one row per Android app download from the landing page (time + platform only), shown on the admin overview. | 24 | — |
| `0026_cancel_payments_with_booking.sql` | Cancelling or rejecting a booking now also cancels its pending / failed payments (trigger + backfill); paid payments go through refunds. | 25 | `0012` |

## Verify after applying

```sql
-- roles: tenant, landlord, caretaker, superadmin   (no `admin`)
select role_id, role_code, role_name from public.roles order by role_id;

-- operational id defaults are set
select table_name, column_default
from information_schema.columns
where table_schema = 'public'
  and column_name in ('legacy_user_id','property_id','room_id','bed_id',
                      'rate_id','booking_id','payment_id')
  and table_name in ('user_accounts','properties','rooms','beds',
                     'rental_rates','bookings','payments')
order by table_name;
--   every row's column_default is nextval('..._seq'::regclass)

-- signup trigger
select tgname from pg_trigger where tgrelid = 'auth.users'::regclass;
--   on_auth_user_created

-- transactional RPCs exist
select proname from pg_proc
where proname in ('create_booking','set_booking_status','create_payment',
                  'set_payment_status','create_booking_extension',
                  'set_booking_extension_status')
order by proname;
```

## Provisioning a non-tenant account (before the Superadmin UI exists)

Public signup only creates **tenant** accounts. To make a **landlord**
(or caretaker / superadmin) for testing:

1. Dashboard → Authentication → Users → **Add user** (set email + password,
   tick "Auto Confirm User"). The `0003` trigger provisions a tenant row.
2. Run this to swap the role (replace the email):

```sql
with acc as (
  select ua.legacy_user_id
  from public.user_accounts ua
  join auth.users au on au.id = ua.auth_user_id
  where au.email = 'landlord@example.com'
),
role as (select role_id from public.roles where role_code = 'landlord')
delete from public.user_roles
  where legacy_user_id = (select legacy_user_id from acc);
insert into public.user_roles (legacy_user_id, role_id)
  select (select legacy_user_id from acc), (select role_id from role);
insert into public.landlord_profiles (legacy_user_id)
  select (select legacy_user_id from acc)
  on conflict (legacy_user_id) do nothing;
```

Adjust `landlord` → `caretaker` / `superadmin` as needed. Superadmin has no
profile table, so drop the last statement for that role.
