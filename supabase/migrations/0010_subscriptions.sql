-- ============================================================
-- 0010_subscriptions  (Phase 11 — part 1: plans + landlord subscriptions)
-- ============================================================
-- Verified before writing (live project bufheqqxgankkzbetkty):
--   no subscription_plans / landlord_subscriptions table exists;
--   landlord_wallets + property_boosts are a separate coin/boost economy.
--
-- Model (per product decisions):
--   * A subscription is PER LANDLORD ACCOUNT.
--   * A plan defines four caps: max_properties, max_rooms_per_property,
--     max_beds_per_room, max_caretakers.
--   * The superadmin creates plans and assigns/activates a plan for a
--     landlord by hand (no payment flow here).
--   * A landlord with no ACTIVE subscription can create nothing — the
--     service layer enforces every cap.
--
-- Adds:
--   1. subscription_plans        — the catalog (seeded with a Free plan)
--   2. landlord_subscriptions    — one row per landlord (unique), the
--      superadmin-controlled assignment
--
-- Both tables have RLS enabled with NO policy: they are reached only through
-- the service layer + service-role client, matching the rest of the app.
-- ============================================================

begin;

-- ---- 1. subscription_plans -----------------------------------------

create sequence if not exists public.subscription_plans_plan_id_seq
  as bigint start with 1 minvalue 1 increment by 1;

create table if not exists public.subscription_plans (
  plan_id bigint primary key
    default nextval('public.subscription_plans_plan_id_seq'),
  code text not null unique,
  name text not null,
  description text,
  max_properties integer not null default 0 check (max_properties >= 0),
  max_rooms_per_property integer not null default 0
    check (max_rooms_per_property >= 0),
  max_beds_per_room integer not null default 0 check (max_beds_per_room >= 0),
  max_caretakers integer not null default 0 check (max_caretakers >= 0),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter sequence public.subscription_plans_plan_id_seq
  owned by public.subscription_plans.plan_id;

alter table public.subscription_plans enable row level security;

insert into public.subscription_plans (
  code, name, description,
  max_properties, max_rooms_per_property, max_beds_per_room, max_caretakers,
  sort_order
)
select 'free', 'Free', 'Entry tier for new landlords.', 3, 3, 4, 1, 0
where not exists (
  select 1 from public.subscription_plans where code = 'free'
);

-- ---- 2. landlord_subscriptions ------------------------------------

create sequence if not exists public.landlord_subscriptions_subscription_id_seq
  as bigint start with 1 minvalue 1 increment by 1;

create table if not exists public.landlord_subscriptions (
  subscription_id bigint primary key
    default nextval('public.landlord_subscriptions_subscription_id_seq'),
  landlord_id bigint not null unique
    references public.user_accounts (legacy_user_id),
  plan_id bigint not null references public.subscription_plans (plan_id),
  status text not null default 'active'
    check (status in ('active', 'suspended', 'cancelled')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  assigned_by bigint references public.user_accounts (legacy_user_id),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter sequence public.landlord_subscriptions_subscription_id_seq
  owned by public.landlord_subscriptions.subscription_id;

create index if not exists landlord_subscriptions_plan_id_idx
  on public.landlord_subscriptions (plan_id);

alter table public.landlord_subscriptions enable row level security;

commit;

-- Verify:
--   select code, name, max_properties, max_rooms_per_property,
--          max_beds_per_room, max_caretakers, is_active
--   from public.subscription_plans order by sort_order;
--   -- free | Free | 3 | 3 | 4 | 1 | t
