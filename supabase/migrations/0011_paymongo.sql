-- ============================================================
-- 0011_paymongo  (Phase 11 — PayMongo plumbing)
-- ============================================================
-- Adds the columns/tables the PayMongo (hosted Checkout Sessions) integration
-- needs. Money settles into ONE platform PayMongo account; landlord payouts
-- are handled off-platform. Fully optional at runtime — with no PayMongo keys
-- the app ignores all of this and stays on the manual flows.
--
--   1. subscription_plans.price + billing_interval_days  (plans can now cost)
--   2. payments: link a payment to its checkout session / PayMongo payment
--   3. subscription_orders  — a landlord's checkout attempt for a plan
--   4. paymongo_events       — processed webhook event ids (idempotency)
--
-- RLS: the two new tables are enabled with no policy (service layer only).
-- ============================================================

begin;

-- ---- 1. priced plans --------------------------------------------------

alter table public.subscription_plans
  add column if not exists price numeric not null default 0
    check (price >= 0),
  add column if not exists billing_interval_days integer not null default 30
    check (billing_interval_days > 0);

-- ---- 2. payment <-> checkout session link ---------------------------

alter table public.payments
  add column if not exists paymongo_session_id text,
  add column if not exists paymongo_payment_id text,
  add column if not exists paid_channel text;

create index if not exists payments_paymongo_session_idx
  on public.payments (paymongo_session_id);

-- ---- 3. subscription_orders ---------------------------------------

create sequence if not exists public.subscription_orders_order_id_seq
  as bigint start with 1 minvalue 1 increment by 1;

create table if not exists public.subscription_orders (
  order_id bigint primary key
    default nextval('public.subscription_orders_order_id_seq'),
  landlord_id bigint not null
    references public.user_accounts (legacy_user_id),
  plan_id bigint not null references public.subscription_plans (plan_id),
  amount numeric not null default 0,
  currency text not null default 'PHP',
  interval_days integer not null default 30,
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'failed', 'cancelled')),
  paymongo_session_id text,
  paymongo_payment_id text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter sequence public.subscription_orders_order_id_seq
  owned by public.subscription_orders.order_id;

create index if not exists subscription_orders_landlord_idx
  on public.subscription_orders (landlord_id);
create index if not exists subscription_orders_session_idx
  on public.subscription_orders (paymongo_session_id);

alter table public.subscription_orders enable row level security;

-- ---- 4. webhook idempotency -------------------------------------

create table if not exists public.paymongo_events (
  event_id text primary key,
  event_type text,
  processed_at timestamptz not null default now()
);

alter table public.paymongo_events enable row level security;

commit;
