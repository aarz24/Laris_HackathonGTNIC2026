-- Owner-supplied static merchant QRIS, with explicit manual receipt verification.
-- This is NOT a gateway, bank verification, settlement API, or subscription billing.
-- Preparing a request freezes the quote and QR version, but reserves no stock and
-- creates no revenue, payment, customer credit, or stock movement. Confirmation is
-- a cashier attestation after checking the merchant's own payment application.
-- If recording fails after that attestation, preserve received_unrecorded and its
-- reference so the same request can be recovered without collecting money again.

begin;

create table public.qris_configuration (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business(id) on delete cascade,
  merchant_name text not null check (length(merchant_name) between 1 and 80),
  merchant_city text not null check (length(merchant_city) between 1 and 80),
  provider_label text not null check (length(provider_label) between 1 and 80),
  qr_payload text not null check (length(qr_payload) between 20 and 4096),
  qr_image_data_url text not null check (
    length(qr_image_data_url) between 40 and 300000
    and qr_image_data_url ~ '^data:image/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$'
  ),
  enabled boolean not null default true,
  -- Historical actor IDs intentionally survive deletion of an auth account.
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, business_id)
);
create unique index qris_configuration_one_enabled
  on public.qris_configuration(business_id) where enabled;
create index qris_configuration_business_created
  on public.qris_configuration(business_id, created_at desc);

create table public.qris_payment_request (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business(id) on delete cascade,
  outlet_id uuid not null references public.outlet(id) on delete restrict,
  configuration_id uuid not null,
  idempotency_key text not null check (length(idempotency_key) between 1 and 100),
  request_input jsonb not null check (jsonb_typeof(request_input) = 'object'),
  items_snapshot jsonb not null check (
    jsonb_typeof(items_snapshot) = 'array' and jsonb_array_length(items_snapshot) between 1 and 100
  ),
  ingredients_snapshot jsonb not null check (jsonb_typeof(ingredients_snapshot) = 'array'),
  qris_snapshot jsonb not null check (jsonb_typeof(qris_snapshot) = 'object'),
  subtotal bigint not null check (subtotal > 0),
  discount bigint not null check (discount >= 0 and discount <= subtotal),
  tax bigint not null check (tax >= 0),
  tax_rate numeric not null check (tax_rate between 0 and 100 and tax_rate::text not in ('NaN', 'Infinity', '-Infinity')),
  total bigint not null check (total between 1 and 10000000 and total = subtotal - discount + tax),
  customer_name text check (length(customer_name) between 1 and 80),
  customer_phone text check (customer_phone ~ '^[0-9]{8,15}$'),
  channel text not null check (channel in ('kasir', 'etalase', 'wa')),
  status text not null default 'pending' check (status in ('pending', 'received_unrecorded', 'paid', 'cancelled')),
  payment_reference text check (
    length(payment_reference) between 6 and 100
    and payment_reference = upper(btrim(payment_reference))
    and payment_reference ~ '^[[:alnum:] ._:/-]+$'
  ),
  confirmed_by uuid,
  confirmed_at timestamptz,
  order_id uuid unique references public.sales_order(id) on delete restrict,
  recording_error text,
  cancelled_by uuid,
  cancelled_at timestamptz,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, idempotency_key),
  foreign key (configuration_id, business_id) references public.qris_configuration(id, business_id) on delete restrict,
  constraint qris_request_lifecycle check (
    (status = 'pending' and payment_reference is null and confirmed_by is null and confirmed_at is null
      and order_id is null and cancelled_by is null and cancelled_at is null and recording_error is null)
    or (status = 'received_unrecorded' and payment_reference is not null and confirmed_by is not null and confirmed_at is not null
      and order_id is null and cancelled_by is null and cancelled_at is null)
    or (status = 'paid' and payment_reference is not null and confirmed_by is not null and confirmed_at is not null
      and order_id is not null and cancelled_by is null and cancelled_at is null and recording_error is null)
    or (status = 'cancelled' and payment_reference is null and confirmed_by is null and confirmed_at is null
      and order_id is null and cancelled_by is not null and cancelled_at is not null and recording_error is null)
  )
);
create unique index qris_request_business_reference
  on public.qris_payment_request(business_id, payment_reference) where payment_reference is not null;
create index qris_request_business_status_created
  on public.qris_payment_request(business_id, status, created_at desc);

-- All authenticated members can read the merchant configuration. Only operational
-- roles may read pending/manual payment details. Neither table permits direct client
-- writes, including by owners. Owner configuration RPCs create immutable versions;
-- operational RPCs are the only path to request lifecycle changes.
alter table public.qris_configuration enable row level security;
alter table public.qris_configuration force row level security;
alter table public.qris_payment_request enable row level security;
alter table public.qris_payment_request force row level security;
revoke all on public.qris_configuration, public.qris_payment_request from public, anon, authenticated;
grant select on public.qris_configuration, public.qris_payment_request to authenticated;
create policy qris_configuration_select on public.qris_configuration for select to authenticated
  using (private.is_member(business_id));
create policy qris_payment_request_select on public.qris_payment_request for select to authenticated
  using (private.is_member(business_id, array['owner', 'manager', 'kasir']));

create function private.protect_qris_configuration() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (to_jsonb(new) - array['enabled', 'updated_at']) is distinct from (to_jsonb(old) - array['enabled', 'updated_at']) then
    raise exception 'Versi QRIS tidak dapat diubah. Simpan versi baru.' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger qris_configuration_immutable before update on public.qris_configuration
  for each row execute function private.protect_qris_configuration();

create function private.protect_qris_request() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (to_jsonb(new) - array['status', 'payment_reference', 'confirmed_by', 'confirmed_at', 'order_id', 'recording_error', 'cancelled_by', 'cancelled_at', 'updated_at'])
     is distinct from
     (to_jsonb(old) - array['status', 'payment_reference', 'confirmed_by', 'confirmed_at', 'order_id', 'recording_error', 'cancelled_by', 'cancelled_at', 'updated_at']) then
    raise exception 'Snapshot permintaan QRIS tidak dapat diubah.' using errcode = '23514';
  end if;
  if not (
    (old.status = 'pending' and new.status in ('pending', 'received_unrecorded', 'cancelled'))
    or (old.status = 'received_unrecorded' and new.status in ('received_unrecorded', 'paid'))
    or (old.status in ('paid', 'cancelled') and (to_jsonb(new) - 'updated_at') = (to_jsonb(old) - 'updated_at'))
  ) then
    raise exception 'Transisi status QRIS tidak diizinkan.' using errcode = '23514';
  end if;
  if old.confirmed_at is not null and (
    new.confirmed_at is distinct from old.confirmed_at or new.confirmed_by is distinct from old.confirmed_by
    or new.payment_reference is distinct from old.payment_reference
  ) then
    raise exception 'Bukti konfirmasi QRIS tidak dapat diganti.' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger qris_request_immutable before update on public.qris_payment_request
  for each row execute function private.protect_qris_request();

-- The server action decodes/validates the static QRIS payload and renders canonical
-- PNG. The database additionally rejects arbitrary URLs/HTML/SVG and oversized data.
-- Merchant labels remain owner-supplied metadata, not issuer/ownership verification.
create function public.save_qris_configuration(
  p_business_id uuid,
  p_merchant_name text,
  p_merchant_city text,
  p_provider_label text,
  p_qr_payload text,
  p_qr_image_data_url text,
  p_enabled boolean default true
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_config public.qris_configuration;
begin
  if v_uid is null or not private.is_member(p_business_id, array['owner']) then
    raise exception 'Hanya pemilik usaha yang dapat mengatur QRIS.' using errcode = '42501';
  end if;
  perform 1 from public.business where id = p_business_id for update;
  if p_enabled is null or p_merchant_name is null or length(btrim(p_merchant_name)) not between 1 and 80
    or p_merchant_city is null or length(btrim(p_merchant_city)) not between 1 and 80
    or p_provider_label is null or length(btrim(p_provider_label)) not between 1 and 80
    or p_qr_payload is null or length(p_qr_payload) not between 20 and 4096
    or p_qr_image_data_url is null or length(p_qr_image_data_url) not between 40 and 300000
    or p_qr_image_data_url !~ '^data:image/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$' then
    raise exception 'Konfigurasi QRIS tidak valid. Unggah QRIS merchant yang sesuai.' using errcode = '22023';
  end if;
  if p_enabled then update public.qris_configuration set enabled = false where business_id = p_business_id and enabled; end if;
  insert into public.qris_configuration(business_id, merchant_name, merchant_city, provider_label, qr_payload, qr_image_data_url, enabled, created_by)
  values (p_business_id, btrim(p_merchant_name), btrim(p_merchant_city), btrim(p_provider_label), p_qr_payload, p_qr_image_data_url, p_enabled, v_uid)
  returning * into v_config;
  insert into public.audit_log(business_id, actor_id, action, entity, entity_id, data)
  values (p_business_id, v_uid, 'qris.configuration.create', 'qris_configuration', v_config.id,
    jsonb_build_object('merchant_name', v_config.merchant_name, 'enabled', v_config.enabled, 'verification', 'owner_supplied'));
  return to_jsonb(v_config);
end $$;

create function public.set_qris_configuration_enabled(p_business_id uuid, p_configuration_id uuid, p_enabled boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_config public.qris_configuration;
begin
  if v_uid is null or not private.is_member(p_business_id, array['owner']) then
    raise exception 'Hanya pemilik usaha yang dapat mengatur QRIS.' using errcode = '42501';
  end if;
  if p_enabled is null then raise exception 'Status QRIS tidak valid.' using errcode = '22023'; end if;
  perform 1 from public.business where id = p_business_id for update;
  select * into v_config from public.qris_configuration where id = p_configuration_id and business_id = p_business_id for update;
  if not found then raise exception 'Konfigurasi QRIS tidak ditemukan.' using errcode = '22023'; end if;
  if p_enabled then
    update public.qris_configuration set enabled = false where business_id = p_business_id and enabled and id <> p_configuration_id;
  end if;
  update public.qris_configuration set enabled = p_enabled where id = p_configuration_id returning * into v_config;
  insert into public.audit_log(business_id, actor_id, action, entity, entity_id, data)
  values (p_business_id, v_uid, 'qris.configuration.toggle', 'qris_configuration', v_config.id, jsonb_build_object('enabled', p_enabled));
  return to_jsonb(v_config);
end $$;

-- Returns the complete request row as JSON. Input items match complete_sale:
-- [{code, quantity, note?}]. Prices/costs/recipes/tax/QR all come from locked DB rows.
-- Idempotency is scoped to business and rejects reusing a key for different input.
create function public.prepare_qris_payment(
  p_business_id uuid,
  p_items jsonb,
  p_idempotency_key text,
  p_discount bigint default 0,
  p_tax_enabled boolean default false,
  p_customer_name text default null,
  p_customer_phone text default null,
  p_channel text default 'kasir',
  p_outlet_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_request public.qris_payment_request;
  v_config public.qris_configuration;
  v_settings jsonb;
  v_input jsonb;
  v_cart jsonb;
  v_items jsonb;
  v_ingredients jsonb;
  v_qr jsonb;
  v_name text := nullif(btrim(coalesce(p_customer_name, '')), '');
  v_phone text := nullif(regexp_replace(btrim(coalesce(p_customer_phone, '')), '^\+', ''), '');
  v_key text := btrim(coalesce(p_idempotency_key, ''));
  v_outlet uuid;
  v_count int;
  v_subtotal numeric;
  v_discount bigint := coalesce(p_discount, 0);
  v_tax numeric := 0;
  v_tax_rate numeric := 10;
  v_total numeric;
  v_stock numeric;
  r record;
begin
  if v_uid is null or not private.is_member(p_business_id, array['owner', 'manager', 'kasir']) then
    raise exception 'Akses ditolak.' using errcode = '42501';
  end if;
  select settings into v_settings from public.business where id = p_business_id and deleted_at is null for update;
  if not found then raise exception 'Usaha tidak ditemukan.' using errcode = '22023'; end if;
  if length(v_key) not between 1 and 100 or p_tax_enabled is null or p_channel is null or p_channel not in ('kasir', 'etalase', 'wa')
    or length(coalesce(v_name, '')) > 80 or (v_phone is not null and v_phone !~ '^[0-9]{8,15}$') then
    raise exception 'Detail permintaan QRIS tidak valid.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' then raise exception 'Keranjang harus berupa daftar menu.' using errcode = '22023'; end if;
  if jsonb_array_length(p_items) not between 1 and 100 then raise exception 'Keranjang harus berisi 1–100 baris menu.' using errcode = '22023'; end if;
  for r in select value from jsonb_array_elements(p_items) loop
    if jsonb_typeof(r.value) is distinct from 'object'
      or jsonb_typeof(r.value -> 'code') is distinct from 'string'
      or length(r.value ->> 'code') not between 1 and 120
      or jsonb_typeof(r.value -> 'quantity') is distinct from 'number' then
      raise exception 'Baris keranjang tidak valid.' using errcode = '22023';
    end if;
    if (r.value ->> 'quantity')::numeric not between 1 and 999
      or trunc((r.value ->> 'quantity')::numeric) <> (r.value ->> 'quantity')::numeric
      or ((r.value -> 'note') is not null and jsonb_typeof(r.value -> 'note') not in ('string', 'null'))
      or length(coalesce(r.value ->> 'note', '')) > 200 then
      raise exception 'Jumlah menu harus bilangan bulat 1–999; catatan maksimal 200 karakter.' using errcode = '22023';
    end if;
  end loop;
  -- Store only validated cart fields; unknown client properties cannot enlarge the
  -- frozen input. Normalize integer JSON numbers and optional notes for retries.
  select jsonb_agg(jsonb_build_object('code', e.value ->> 'code',
    'quantity', ((e.value ->> 'quantity')::numeric)::int,
    'note', nullif(btrim(coalesce(e.value ->> 'note', '')), '')) order by e.ordinality)
  into v_cart from jsonb_array_elements(p_items) with ordinality as e(value, ordinality);
  v_input := jsonb_build_object('items', v_cart, 'discount', v_discount, 'tax_enabled', p_tax_enabled,
    'customer_name', v_name, 'customer_phone', v_phone, 'channel', p_channel, 'outlet_id', p_outlet_id);
  select * into v_request from public.qris_payment_request where business_id = p_business_id and idempotency_key = v_key;
  if found then
    if v_request.request_input is distinct from v_input then
      raise exception 'Kunci permintaan telah dipakai untuk keranjang berbeda. Gunakan permintaan baru.' using errcode = '22023';
    end if;
    return to_jsonb(v_request);
  end if;
  if (select count(*) from public.qris_payment_request where business_id = p_business_id and status in ('pending', 'received_unrecorded')) >= 100 then
    raise exception 'Ada 100 permintaan QRIS belum selesai. Selesaikan pencatatan atau batalkan yang belum dibayar sebelum membuat baru.' using errcode = '22023';
  end if;
  select * into v_config from public.qris_configuration where business_id = p_business_id and enabled;
  if not found then raise exception 'QRIS usaha belum aktif. Hubungi pemilik usaha.' using errcode = '22023'; end if;
  v_outlet := private.resolve_outlet(p_business_id, p_outlet_id);
  if v_outlet is null then raise exception 'Outlet tidak ditemukan.' using errcode = '22023'; end if;

  select count(*), coalesce(sum(l.price::numeric * l.quantity), 0),
    jsonb_agg(jsonb_build_object('variant_id', l.variant_id, 'product_code', l.code, 'name', l.name,
      'unit_price', l.price, 'unit_cost', l.cost, 'quantity', l.quantity, 'note', l.note) order by l.variant_id, l.note)
  into v_count, v_subtotal, v_items from private.sale_lines(p_business_id, v_cart) l;
  if v_count <> jsonb_array_length(p_items) then
    raise exception 'Ada menu yang tidak dikenal atau sedang tidak tersedia.' using errcode = '22023';
  end if;
  if v_discount < 0 or v_discount > v_subtotal then raise exception 'Diskon tidak boleh melebihi subtotal.' using errcode = '22023'; end if;
  if jsonb_typeof(v_settings -> 'taxRate') = 'number' then
    v_tax_rate := least(greatest((v_settings ->> 'taxRate')::numeric, 0), 100);
  end if;
  if p_tax_enabled then v_tax := round((v_subtotal - v_discount) * v_tax_rate / 100); end if;
  v_total := v_subtotal - v_discount + v_tax;
  if v_total not between 1 and 10000000 or v_subtotal > 9223372036854775807 then
    raise exception 'Total QRIS harus Rp1–Rp10.000.000.' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('inventory_item_id', a.inventory_item_id, 'name', a.name,
    'base_unit', a.base_unit, 'quantity', a.quantity, 'unit_cost', a.unit_cost) order by a.inventory_item_id), '[]'::jsonb)
  into v_ingredients from (
    select ii.id as inventory_item_id, ii.name, ii.base_unit, ii.avg_cost_per_unit as unit_cost,
      sum(rl.qty_base_unit * l.quantity) as quantity
    from private.sale_lines(p_business_id, v_cart) l
    join public.recipe_line rl on rl.variant_id = l.variant_id and rl.business_id = p_business_id
    join public.inventory_item ii on ii.id = rl.inventory_item_id and ii.business_id = p_business_id
    group by ii.id, ii.name, ii.base_unit, ii.avg_cost_per_unit
  ) a;
  for r in select * from jsonb_to_recordset(v_ingredients) as x(inventory_item_id uuid, name text, base_unit text, quantity numeric, unit_cost numeric) loop
    perform 1 from public.inventory_item where id = r.inventory_item_id and business_id = p_business_id for update;
    v_stock := private.stock_of(r.inventory_item_id, v_outlet);
    if r.quantity > 99999999999.999 or v_stock < r.quantity then
      raise exception 'Stok % tidak cukup. Tersedia % %, dibutuhkan % %.',
        r.name, trim_scale(v_stock), r.base_unit, trim_scale(r.quantity), r.base_unit using errcode = 'P0001';
    end if;
  end loop;
  v_qr := jsonb_build_object('id', v_config.id, 'merchant_name', v_config.merchant_name,
    'merchant_city', v_config.merchant_city, 'provider_label', v_config.provider_label,
    'qr_payload', v_config.qr_payload, 'qr_image_data_url', v_config.qr_image_data_url);
  insert into public.qris_payment_request(business_id, outlet_id, configuration_id, idempotency_key,
    request_input, items_snapshot, ingredients_snapshot, qris_snapshot, subtotal, discount, tax, tax_rate, total,
    customer_name, customer_phone, channel, created_by)
  values (p_business_id, v_outlet, v_config.id, v_key, v_input, v_items, v_ingredients, v_qr,
    v_subtotal::bigint, v_discount, v_tax::bigint, v_tax_rate, v_total::bigint, v_name, v_phone, p_channel, v_uid)
  returning * into v_request;
  insert into public.audit_log(business_id, actor_id, action, entity, entity_id, data)
  values (p_business_id, v_uid, 'qris.request.prepare', 'qris_payment_request', v_request.id,
    jsonb_build_object('total', v_request.total, 'configuration_id', v_config.id, 'stock_reserved', false));
  return to_jsonb(v_request);
end $$;

create function public.confirm_qris_payment(p_business_id uuid, p_request_id uuid, p_reference text, p_manual_confirmed boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_request public.qris_payment_request;
  v_reference text := upper(btrim(coalesce(p_reference, '')));
  v_order uuid;
  v_customer uuid;
  v_name text;
  v_stock numeric;
  v_unit text;
  v_error text;
  v_error_code text;
  r record;
begin
  if v_uid is null or not private.is_member(p_business_id, array['owner', 'manager', 'kasir']) then
    raise exception 'Akses ditolak.' using errcode = '42501';
  end if;
  if p_manual_confirmed is distinct from true then
    raise exception 'Periksa penerimaan dana di aplikasi merchant dan centang konfirmasi manual.' using errcode = '22023';
  end if;
  if length(v_reference) not between 6 and 100 or v_reference !~ '^[[:alnum:] ._:/-]+$' then
    raise exception 'Isi nomor referensi penerimaan yang valid, 6–100 karakter.' using errcode = '22023';
  end if;
  -- Same lock order as catalog edits, purchases, and legacy checkout.
  perform 1 from public.business where id = p_business_id for update;
  select * into v_request from public.qris_payment_request where id = p_request_id and business_id = p_business_id for update;
  if not found then raise exception 'Permintaan QRIS tidak ditemukan.' using errcode = '22023'; end if;
  if v_request.status = 'cancelled' then raise exception 'Permintaan ini sudah dibatalkan.' using errcode = '22023'; end if;
  if v_request.payment_reference is not null and v_request.payment_reference <> v_reference then
    raise exception 'Referensi berbeda dari konfirmasi sebelumnya. Gunakan referensi yang sudah tersimpan.' using errcode = '22023';
  end if;
  if v_request.status = 'paid' then return to_jsonb(v_request); end if;
  if exists (select 1 from public.qris_payment_request where business_id = p_business_id and payment_reference = v_reference and id <> p_request_id) then
    raise exception 'Referensi penerimaan ini sudah dipakai oleh permintaan lain.' using errcode = '23505';
  end if;
  if v_request.status = 'pending' then
    update public.qris_payment_request set status = 'received_unrecorded', payment_reference = v_reference,
      confirmed_by = v_uid, confirmed_at = now() where id = p_request_id returning * into v_request;
    insert into public.audit_log(business_id, actor_id, action, entity, entity_id, data)
    values (p_business_id, v_uid, 'qris.receipt.manual_confirm', 'qris_payment_request', p_request_id,
      jsonb_build_object('total', v_request.total, 'reference', v_reference, 'verification', 'cashier_manual', 'provider_verified', false));
  end if;

  -- This inner block is a subtransaction. Any recording error rolls back every
  -- sale/item/payment/customer/stock write while retaining the attestation above.
  begin
    for r in select * from jsonb_to_recordset(v_request.ingredients_snapshot)
      as x(inventory_item_id uuid, name text, base_unit text, quantity numeric, unit_cost numeric)
      order by inventory_item_id
    loop
      select base_unit into v_unit from public.inventory_item where id = r.inventory_item_id and business_id = p_business_id for update;
      if not found or v_unit <> r.base_unit then
        v_error := 'Dana dikonfirmasi, tetapi bahan pada snapshot tidak tersedia atau satuannya berubah. Hubungi pemilik usaha.';
        exit;
      end if;
      v_stock := private.stock_of(r.inventory_item_id, v_request.outlet_id);
      if v_stock < r.quantity then
        v_error := format('Dana dikonfirmasi, tetapi stok % belum cukup: tersedia % %; perlu % %. Tambah stok lalu ulangi pencatatan tanpa meminta pembayaran lagi.',
          r.name, trim_scale(v_stock), r.base_unit, trim_scale(r.quantity), r.base_unit);
        exit;
      end if;
    end loop;
    if v_error is not null then
      update public.qris_payment_request set recording_error = v_error where id = p_request_id returning * into v_request;
      insert into public.audit_log(business_id, actor_id, action, entity, entity_id, data)
      values (p_business_id, v_uid, 'qris.recording.deferred', 'qris_payment_request', p_request_id,
        jsonb_build_object('reason', 'snapshot_stock_unavailable'));
      return to_jsonb(v_request);
    end if;

    insert into public.sales_order(business_id, outlet_id, customer_name, channel, status, subtotal, discount, tax, total,
      cash_received, idempotency_key, created_by, created_at)
    values (p_business_id, v_request.outlet_id, coalesce(v_request.customer_name, 'Pelanggan umum'), v_request.channel, 'paid',
      v_request.subtotal, v_request.discount, v_request.tax, v_request.total, v_request.total,
      'qris:' || v_request.id::text, v_request.confirmed_by, v_request.confirmed_at)
    returning id into v_order;

    if v_request.customer_phone is not null then
      insert into public.customer as c(business_id, name, phone, visits, total_spent, points_balance, last_visit_at)
      values (p_business_id, coalesce(v_request.customer_name, 'Pelanggan baru'), v_request.customer_phone,
        1, v_request.total, v_request.total / 1000, v_request.confirmed_at)
      on conflict (business_id, phone) do update set
        name = coalesce(v_request.customer_name, c.name), visits = c.visits + 1,
        total_spent = c.total_spent + excluded.total_spent,
        points_balance = c.points_balance + excluded.points_balance,
        last_visit_at = greatest(c.last_visit_at, excluded.last_visit_at), deleted_at = null
      returning c.id, c.name into v_customer, v_name;
      update public.customer set rfm_segment = private.segment_for(visits, last_visit_at) where id = v_customer;
      update public.sales_order set customer_id = v_customer, customer_name = v_name where id = v_order;
    end if;
    insert into public.order_item(business_id, order_id, variant_id, product_code, name, unit_price, unit_cost, quantity, note)
    select p_business_id, v_order, l.variant_id, l.product_code, l.name, l.unit_price, l.unit_cost, l.quantity, l.note
    from jsonb_to_recordset(v_request.items_snapshot)
      as l(variant_id uuid, product_code text, name text, unit_price bigint, unit_cost bigint, quantity int, note text);
    insert into public.payment(business_id, order_id, method, amount, provider_ref, status)
    values (p_business_id, v_order, 'qris', v_request.total, v_reference, 'paid');
    insert into public.stock_movement(business_id, outlet_id, inventory_item_id, type, qty_delta, unit_cost, ref_id, created_by)
    select p_business_id, v_request.outlet_id, i.inventory_item_id, 'sale', -i.quantity, i.unit_cost, v_order, v_uid
    from jsonb_to_recordset(v_request.ingredients_snapshot) as i(inventory_item_id uuid, quantity numeric, unit_cost numeric);
    update public.qris_payment_request set status = 'paid', order_id = v_order, recording_error = null
      where id = p_request_id returning * into v_request;
    insert into public.audit_log(business_id, actor_id, action, entity, entity_id, data)
    values (p_business_id, v_uid, 'qris.sale.recorded', 'sales_order', v_order,
      jsonb_build_object('request_id', p_request_id, 'total', v_request.total, 'verification', 'cashier_manual', 'provider_verified', false));
  exception when others then
    get stacked diagnostics v_error_code = returned_sqlstate;
    update public.qris_payment_request set recording_error =
      'Dana sudah dikonfirmasi, tetapi transaksi belum tercatat. Hubungi pemilik usaha lalu ulangi pencatatan pada permintaan yang sama; jangan minta pembayaran lagi.'
      where id = p_request_id returning * into v_request;
    insert into public.audit_log(business_id, actor_id, action, entity, entity_id, data)
    values (p_business_id, v_uid, 'qris.recording.deferred', 'qris_payment_request', p_request_id,
      jsonb_build_object('reason', 'recording_error', 'sqlstate', v_error_code));
  end;
  return to_jsonb(v_request);
end $$;

-- Closing a modal does not call this RPC. Cancellation needs a separate explicit
-- attestation that no payment was received; confirmed receipts cannot be cancelled.
create function public.cancel_qris_payment(p_business_id uuid, p_request_id uuid, p_no_payment_received boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_request public.qris_payment_request;
begin
  if v_uid is null or not private.is_member(p_business_id, array['owner', 'manager', 'kasir']) then
    raise exception 'Akses ditolak.' using errcode = '42501';
  end if;
  if p_no_payment_received is distinct from true then
    raise exception 'Pastikan belum ada dana diterima sebelum membatalkan.' using errcode = '22023';
  end if;
  perform 1 from public.business where id = p_business_id for update;
  select * into v_request from public.qris_payment_request where id = p_request_id and business_id = p_business_id for update;
  if not found then raise exception 'Permintaan QRIS tidak ditemukan.' using errcode = '22023'; end if;
  if v_request.status = 'cancelled' then return to_jsonb(v_request); end if;
  if v_request.status <> 'pending' then raise exception 'Dana telah dikonfirmasi. Permintaan ini tidak dapat dibatalkan.' using errcode = '22023'; end if;
  update public.qris_payment_request set status = 'cancelled', cancelled_by = v_uid, cancelled_at = now()
    where id = p_request_id returning * into v_request;
  insert into public.audit_log(business_id, actor_id, action, entity, entity_id, data)
  values (p_business_id, v_uid, 'qris.request.cancel', 'qris_payment_request', p_request_id,
    jsonb_build_object('no_payment_received', true));
  return to_jsonb(v_request);
end $$;

-- Preserve the deployed cash/transfer implementation without exposing a second
-- checkout RPC. Moving it into private retains its auth checks and SECURITY DEFINER
-- behavior; its execution grants are revoked. The public wrapper blocks every QRIS
-- call, including old clients, so no direct qris -> paid ledger path remains.
alter function public.complete_sale(uuid, jsonb, text, bigint, text, text, bigint, boolean, text, text, uuid)
  set schema private;
alter function private.complete_sale(uuid, jsonb, text, bigint, text, text, bigint, boolean, text, text, uuid)
  rename to complete_sale_legacy;
revoke all on function private.complete_sale_legacy(uuid, jsonb, text, bigint, text, text, bigint, boolean, text, text, uuid)
  from public, anon, authenticated;

create function public.complete_sale(
  p_business_id uuid, p_items jsonb, p_payment text,
  p_cash_received bigint default 0, p_customer_name text default null, p_customer_phone text default null,
  p_discount bigint default 0, p_tax_enabled boolean default false, p_channel text default 'kasir',
  p_idempotency_key text default null, p_outlet_id uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.is_member(p_business_id, array['owner', 'manager', 'kasir']) then
    raise exception 'Akses ditolak.' using errcode = '42501';
  end if;
  if p_payment is null or p_payment not in ('tunai', 'transfer') then
    raise exception 'QRIS harus memakai permintaan pembayaran dan konfirmasi penerimaan manual.' using errcode = '22023';
  end if;
  if p_idempotency_key like 'qris:%' then
    raise exception 'Kunci transaksi tersebut khusus untuk pencatatan QRIS.' using errcode = '22023';
  end if;
  return private.complete_sale_legacy(p_business_id, p_items, p_payment, p_cash_received, p_customer_name,
    p_customer_phone, p_discount, p_tax_enabled, p_channel, p_idempotency_key, p_outlet_id);
end $$;

revoke all on function private.protect_qris_configuration(), private.protect_qris_request() from public, anon, authenticated;
revoke all on function public.save_qris_configuration(uuid, text, text, text, text, text, boolean),
  public.set_qris_configuration_enabled(uuid, uuid, boolean),
  public.prepare_qris_payment(uuid, jsonb, text, bigint, boolean, text, text, text, uuid),
  public.confirm_qris_payment(uuid, uuid, text, boolean),
  public.cancel_qris_payment(uuid, uuid, boolean),
  public.complete_sale(uuid, jsonb, text, bigint, text, text, bigint, boolean, text, text, uuid)
  from public, anon;
grant execute on function public.save_qris_configuration(uuid, text, text, text, text, text, boolean),
  public.set_qris_configuration_enabled(uuid, uuid, boolean),
  public.prepare_qris_payment(uuid, jsonb, text, bigint, boolean, text, text, text, uuid),
  public.confirm_qris_payment(uuid, uuid, text, boolean),
  public.cancel_qris_payment(uuid, uuid, boolean),
  public.complete_sale(uuid, jsonb, text, bigint, text, text, bigint, boolean, text, text, uuid)
  to authenticated;

commit;
