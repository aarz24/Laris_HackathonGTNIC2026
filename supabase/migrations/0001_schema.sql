-- Laris · core schema
-- Conventions (PRD §10):
--   * every tenant table carries business_id and is protected by RLS (see 0002_rls.sql)
--   * money = BIGINT rupiah, quantities = NUMERIC(14,3) in base units
--   * stock is a ledger (stock_movement); current stock = SUM(qty_delta)
--   * `code` columns are stable, human-readable keys per business (used by the UI catalog and AI parser)

create extension if not exists pg_trgm;
create schema if not exists private;

-- ---------------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------------
create or replace function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- tenancy
-- ---------------------------------------------------------------------------
create table public.business (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(name) between 1 and 80),
  slug        text not null unique check (slug ~ '^[a-z0-9-]{3,60}$'),
  type        text not null default 'fnb' check (type in ('fnb', 'retail', 'service')),
  owner_name  text not null default '',
  npwp        text,
  nib         text,
  day_target  bigint not null default 0 check (day_target >= 0),
  settings    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create table public.outlet (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business (id) on delete cascade,
  name        text not null,
  address     text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create table public.membership (
  business_id uuid not null references public.business (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        text not null check (role in ('owner', 'manager', 'kasir', 'dapur')),
  pin_hash    text,
  created_at  timestamptz not null default now(),
  primary key (business_id, user_id)
);

-- ---------------------------------------------------------------------------
-- catalog & inventory
-- ---------------------------------------------------------------------------
create table public.supplier (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references public.business (id) on delete cascade,
  name           text not null,
  phone          text,
  lead_time_days int not null default 1 check (lead_time_days between 0 and 60),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,
  unique (business_id, name)
);

create table public.inventory_item (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references public.business (id) on delete cascade,
  code              text not null,
  name              text not null,
  base_unit         text not null,
  -- moving-average cost per base unit; fractional rupiah allowed (e.g. Rp22,4 per ml)
  avg_cost_per_unit numeric(14,4) not null default 0 check (avg_cost_per_unit >= 0),
  reorder_point     numeric(14,3) not null default 0 check (reorder_point >= 0),
  safety_stock      numeric(14,3) not null default 0 check (safety_stock >= 0),
  supplier_id       uuid references public.supplier (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  unique (business_id, code)
);
create index inventory_item_name_trgm on public.inventory_item using gin (name gin_trgm_ops);

create table public.product (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business (id) on delete cascade,
  code        text not null,
  name        text not null,
  category    text not null default 'Lainnya',
  image_url   text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  unique (business_id, code)
);

create table public.product_variant (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.business (id) on delete cascade,
  product_id   uuid not null references public.product (id) on delete cascade,
  name         text not null default 'Reguler',
  is_default   boolean not null default true,
  price        bigint not null check (price >= 0),
  hpp_cached   bigint not null default 0 check (hpp_cached >= 0),
  is_available boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
create unique index product_variant_one_default on public.product_variant (product_id) where is_default and deleted_at is null;

create table public.recipe_line (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references public.business (id) on delete cascade,
  variant_id        uuid not null references public.product_variant (id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_item (id) on delete restrict,
  qty_base_unit     numeric(14,3) not null check (qty_base_unit > 0),
  unique (variant_id, inventory_item_id)
);

-- ---------------------------------------------------------------------------
-- customers
-- ---------------------------------------------------------------------------
create table public.customer (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references public.business (id) on delete cascade,
  name              text not null,
  phone             text not null check (phone ~ '^\d{8,15}$'),  -- stored without leading +
  birthday          date,
  rfm_segment       text not null default 'Potensial' check (rfm_segment in ('Juara', 'Setia', 'Potensial', 'Berisiko', 'Hilang')),
  points_balance    int not null default 0 check (points_balance >= 0),
  visits            int not null default 0 check (visits >= 0),
  total_spent       bigint not null default 0 check (total_spent >= 0),
  last_visit_at     timestamptz,
  marketing_consent boolean not null default false,  -- UU PDP: explicit opt-in
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  unique (business_id, phone)
);

-- ---------------------------------------------------------------------------
-- sales
-- ---------------------------------------------------------------------------
create table public.sales_order (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references public.business (id) on delete cascade,
  outlet_id       uuid not null references public.outlet (id) on delete restrict,
  customer_id     uuid references public.customer (id) on delete set null,
  customer_name   text not null default 'Pelanggan umum',
  channel         text not null default 'kasir' check (channel in ('kasir', 'etalase', 'wa')),
  status          text not null default 'paid' check (status in ('open', 'paid', 'void', 'refunded')),
  subtotal        bigint not null check (subtotal >= 0),
  discount        bigint not null default 0 check (discount >= 0),
  tax             bigint not null default 0 check (tax >= 0),
  total           bigint not null check (total >= 0),
  cash_received   bigint not null default 0 check (cash_received >= 0),
  idempotency_key text,
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (business_id, idempotency_key)
);
create index sales_order_business_created on public.sales_order (business_id, created_at desc);

create table public.order_item (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business (id) on delete cascade,
  order_id    uuid not null references public.sales_order (id) on delete cascade,
  variant_id  uuid not null references public.product_variant (id) on delete restrict,
  product_code text not null,          -- denormalised for history/reporting
  name        text not null,
  unit_price  bigint not null check (unit_price >= 0),
  unit_cost   bigint not null default 0 check (unit_cost >= 0),
  quantity    int not null check (quantity > 0),
  note        text check (length(note) <= 200)
);
create index order_item_order on public.order_item (order_id);

create table public.payment (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.business (id) on delete cascade,
  order_id     uuid not null references public.sales_order (id) on delete cascade,
  method       text not null check (method in ('tunai', 'qris', 'transfer')),
  amount       bigint not null check (amount >= 0),
  provider_ref text,
  status       text not null default 'paid' check (status in ('pending', 'paid', 'failed', 'refunded')),
  created_at   timestamptz not null default now()
);
create index payment_order on public.payment (order_id);

-- ---------------------------------------------------------------------------
-- stock ledger, purchasing, expenses
-- ---------------------------------------------------------------------------
create table public.stock_movement (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references public.business (id) on delete cascade,
  outlet_id         uuid not null references public.outlet (id) on delete restrict,
  inventory_item_id uuid not null references public.inventory_item (id) on delete restrict,
  type              text not null check (type in ('opening', 'sale', 'purchase', 'adjustment', 'waste', 'opname')),
  qty_delta         numeric(14,3) not null check (qty_delta <> 0),
  unit_cost         numeric(14,4) not null default 0,
  ref_id            uuid,
  created_by        uuid references auth.users (id) on delete set null,
  created_at        timestamptz not null default now()
);
create index stock_movement_item on public.stock_movement (inventory_item_id, outlet_id);
create index stock_movement_business_created on public.stock_movement (business_id, created_at desc);

create table public.purchase (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.business (id) on delete cascade,
  outlet_id    uuid not null references public.outlet (id) on delete restrict,
  supplier_id  uuid references public.supplier (id) on delete set null,
  total        bigint not null check (total >= 0),
  source       text not null default 'manual' check (source in ('manual', 'scan')),
  receipt_path text,
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now()
);

create table public.purchase_line (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references public.business (id) on delete cascade,
  purchase_id       uuid not null references public.purchase (id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_item (id) on delete restrict,
  quantity          numeric(14,3) not null check (quantity > 0),
  total             bigint not null check (total >= 0)
);

create table public.expense (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.business (id) on delete cascade,
  description  text not null check (length(description) between 1 and 150),
  category     text not null default 'Operasional',
  amount       bigint not null check (amount > 0),
  spent_at     timestamptz not null default now(),
  receipt_path text,
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now()
);
create index expense_business_spent on public.expense (business_id, spent_at desc);

-- ---------------------------------------------------------------------------
-- audit, AI telemetry, calendar
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id          bigint generated always as identity primary key,
  business_id uuid not null references public.business (id) on delete cascade,
  actor_id    uuid references auth.users (id) on delete set null,
  action      text not null,
  entity      text not null,
  entity_id   uuid,
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index audit_log_business_created on public.audit_log (business_id, created_at desc);

create table public.ai_event (
  id          bigint generated always as identity primary key,
  business_id uuid references public.business (id) on delete cascade,
  user_id     uuid references auth.users (id) on delete set null,
  feature     text not null check (feature in ('parse-order', 'scan-receipt', 'ask')),
  model       text not null,
  input       jsonb not null default '{}'::jsonb,
  output      jsonb not null default '{}'::jsonb,
  latency_ms  int,
  ok          boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.holiday_calendar (
  date date primary key,
  name text not null,
  kind text not null check (kind in ('national', 'religious', 'ramadan', 'school', 'payday'))
);

-- updated_at triggers
do $$
declare t text;
begin
  foreach t in array array['business','outlet','supplier','inventory_item','product','product_variant','customer','sales_order'] loop
    execute format('create trigger %I_touch before update on public.%I for each row execute function private.touch_updated_at()', t, t);
  end loop;
end $$;
