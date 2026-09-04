# Live Supabase verification — 2026-09-04

Checked project **`mybalai` (`bufheqqxgankkzbetkty`)** via the PostgREST
OpenAPI spec and `count=exact` HEAD requests using the secret key.

## Schema

- **All 42 tables** from the spec §31 baseline exist.
- `public.current_legacy_user_id()` RPC exists.
- One extra RPC not in the spec: `public.rls_auto_enable` (noted, not used).
- **No** `%match%` / `%recommend%` / `%fuzzy%` tables — consistent with the
  BAIMatch removal (spec §4).

## Reference data (seeded by the baseline)

| Table | Rows |
| --- | --- |
| `roles` | 4 |
| `property_statuses` | 5 |
| `room_statuses` | 5 |
| `bed_statuses` | 5 |
| `booking_statuses` | 6 |
| `payment_methods` | 5 |
| `payment_statuses` | 6 |
| `property_types` | **0** |
| `room_types` | **0** |
| `amenity_categories` | **0** |

## Operational / legacy data

**Every operational table is empty** — `user_accounts`, `user_roles`,
`properties`, `rooms`, `beds`, `rental_rates`, `bookings`, `booking_beds`,
`payments`, `chat_messages`, `property_inquiries`, `property_ratings`,
`landlord_wallets`, `property_boosts`, `portal_ads`, `push_tokens`,
`notifications`, `audit_logs`, `activity_logs` = 0 rows.

## Auth

`GET /auth/v1/admin/users` → **0 users**.

## Implications carried into this build

1. No identities exist → signup + provisioning trigger built from scratch
   (migration `0002`).
2. `user_accounts.legacy_user_id` and `properties.property_id` are bare BIGINT
   PKs with no default → sequences added (migration `0001`).
3. `property_types` empty → the property form's "type" select renders with only
   "Not specified" until types are seeded.
4. Nothing to reconcile yet; legacy data migration remains a separate future
   effort (spec §15, §33).
