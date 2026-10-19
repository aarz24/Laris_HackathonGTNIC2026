-- Laris · transactional functions
-- All ledger writes go through these SECURITY DEFINER functions. Each one:
--   1. re-checks membership + role via private.is_member()
--   2. takes prices/costs from the database (never trusts client totals)
--   3. runs in a single transaction (PRD M1 acceptance: order + items + payment + stock = atomic)
--   4. writes an audit_log row

-- ---------------------------------------------------------------------------
-- private helpers
-- ---------------------------------------------------------------------------
create or replace function private.stock_of(p_item uuid, p_outlet uuid)
returns numeric language sql stable set search_path = '' as $$
  select coalesce(sum(qty_delta), 0) from public.stock_movement
  where inventory_item_id = p_item and outlet_id = p_outlet;
$$;

create or replace function private.segment_for(p_visits int, p_last timestamptz)
returns text language sql stable set search_path = '' as $$
  select case
    when p_last is null then 'Potensial'
    when now() - p_last > interval '60 days' then 'Hilang'
    when now() - p_last > interval '30 days' then 'Berisiko'
    when p_visits >= 20 then 'Juara'
    when p_visits >= 8 then 'Setia'
    else 'Potensial'
  end;
$$;

create or replace function private.rupiah(p_amount bigint)
returns text language sql immutable set search_path = '' as $$
  select 'Rp' || replace(to_char(p_amount, 'FM999,999,999,999,999'), ',', '.');
$$;

-- Resolve cart lines against the catalog. Prices and HPP come from the DB.
create or replace function private.sale_lines(p_business_id uuid, p_items jsonb)
returns table (variant_id uuid, code text, name text, price bigint, cost bigint, quantity int, note text)
language sql stable set search_path = '' as $$
  select v.id, p.code, p.name, v.price, v.hpp_cached,
         (i.value ->> 'quantity')::int,
         nullif(left(btrim(coalesce(i.value ->> 'note', '')), 200), '')
  from jsonb_array_elements(p_items) i
  join public.product p
    on p.business_id = p_business_id and p.code = i.value ->> 'code' and p.deleted_at is null and p.is_active
  join public.product_variant v
    on v.product_id = p.id and v.is_default and v.deleted_at is null and v.is_available;
$$;

-- Recalculate cached recipe cost (HPP) for variants that use any of the given items.
create or replace function private.refresh_hpp(p_business_id uuid, p_items uuid[] default null)
returns void language sql set search_path = '' as $$
  update public.product_variant v
  set hpp_cached = coalesce((
    select round(sum(rl.qty_base_unit * ii.avg_cost_per_unit))
    from public.recipe_line rl join public.inventory_item ii on ii.id = rl.inventory_item_id
    where rl.variant_id = v.id
  ), 0)
  where v.business_id = p_business_id
    and (p_items is null or exists (
      select 1 from public.recipe_line rl where rl.variant_id = v.id and rl.inventory_item_id = any (p_items)
    ));
$$;

create or replace function private.resolve_outlet(p_business_id uuid, p_outlet_id uuid)
returns uuid language sql stable set search_path = '' as $$
  select o.id from public.outlet o
  where o.business_id = p_business_id and o.deleted_at is null and (p_outlet_id is null or o.id = p_outlet_id)
  order by o.created_at limit 1;
$$;

-- ---------------------------------------------------------------------------
-- create_business: onboarding (M0.1) — creator becomes owner
-- ---------------------------------------------------------------------------
create or replace function public.create_business(
  p_name text, p_slug text, p_type text default 'fnb', p_owner_name text default '', p_outlet_name text default 'Outlet utama'
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_business uuid;
begin
  if v_uid is null then raise exception 'Silakan masuk terlebih dahulu.' using errcode = '42501'; end if;
  insert into public.business (name, slug, type, owner_name) values (btrim(p_name), lower(btrim(p_slug)), p_type, btrim(p_owner_name))
  returning id into v_business;
  insert into public.outlet (business_id, name) values (v_business, coalesce(nullif(btrim(p_outlet_name), ''), 'Outlet utama'));
  insert into public.membership (business_id, user_id, role) values (v_business, v_uid, 'owner');
  insert into public.audit_log (business_id, actor_id, action, entity, entity_id) values (v_business, v_uid, 'business.create', 'business', v_business);
  return v_business;
end $$;

-- ---------------------------------------------------------------------------
-- complete_sale: POS checkout (M1.2/M1.3, M3.3, M6.1)
--   p_items: [{ "code": "kopi-susu", "quantity": 2, "note": "less sugar" }, ...]
-- ---------------------------------------------------------------------------
create or replace function public.complete_sale(
  p_business_id     uuid,
  p_items           jsonb,
  p_payment         text,
  p_cash_received   bigint  default 0,
  p_customer_name   text    default null,
  p_customer_phone  text    default null,
  p_discount        bigint  default 0,
  p_tax_enabled     boolean default false,
  p_channel         text    default 'kasir',
  p_idempotency_key text    default null,
  p_outlet_id       uuid    default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid      uuid := auth.uid();
  v_order    uuid;
  v_outlet   uuid;
  v_matched  int;
  v_subtotal bigint;
  v_discount bigint := coalesce(p_discount, 0);
  v_tax      bigint := 0;
  v_total    bigint;
  v_phone    text;
  v_customer uuid;
  v_name     text := nullif(left(btrim(coalesce(p_customer_name, '')), 80), '');
  v_stock    numeric;
  r          record;
begin
  if v_uid is null or not private.is_member(p_business_id, array['owner', 'manager', 'kasir']) then
    raise exception 'Akses ditolak.' using errcode = '42501';
  end if;

  -- idempotent retry (offline outbox, double taps)
  if p_idempotency_key is not null then
    if length(p_idempotency_key) > 100 then raise exception 'Kunci transaksi terlalu panjang.' using errcode = '22023'; end if;
    select id into v_order from public.sales_order where business_id = p_business_id and idempotency_key = p_idempotency_key;
    if found then return v_order; end if;
  end if;

  if p_payment is null or p_payment not in ('tunai', 'qris', 'transfer') then
    raise exception 'Metode pembayaran tidak valid.' using errcode = '22023';
  end if;
  if p_channel is null or p_channel not in ('kasir', 'etalase', 'wa') then
    raise exception 'Kanal penjualan tidak valid.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 100 then
    raise exception 'Keranjang tidak boleh kosong.' using errcode = '22023';
  end if;

  v_outlet := private.resolve_outlet(p_business_id, p_outlet_id);
  if v_outlet is null then raise exception 'Outlet tidak ditemukan.' using errcode = '22023'; end if;

  select count(*), coalesce(sum(price * quantity), 0) into v_matched, v_subtotal
  from private.sale_lines(p_business_id, p_items);
  if v_matched <> jsonb_array_length(p_items) then
    raise exception 'Ada menu yang tidak dikenal atau sedang tidak tersedia.' using errcode = '22023';
  end if;
  if exists (select 1 from private.sale_lines(p_business_id, p_items) l where l.quantity is null or l.quantity <= 0 or l.quantity > 999) then
    raise exception 'Jumlah menu harus bilangan bulat 1–999.' using errcode = '22023';
  end if;
  if v_discount < 0 or v_discount > v_subtotal then
    raise exception 'Diskon tidak boleh melebihi subtotal.' using errcode = '22023';
  end if;
  if p_tax_enabled then v_tax := round((v_subtotal - v_discount) * 0.1); end if;  -- demo PBJT 10%
  v_total := v_subtotal - v_discount + v_tax;
  if p_payment = 'tunai' and coalesce(p_cash_received, 0) < v_total then
    raise exception 'Uang tunai tidak cukup. Total pembayaran %.', private.rupiah(v_total) using errcode = '22023';
  end if;

  -- lock ingredients in a stable order, then verify stock for the whole basket
  for r in
    select rl.inventory_item_id, ii.name, ii.base_unit, sum(rl.qty_base_unit * l.quantity) as needed
    from private.sale_lines(p_business_id, p_items) l
    join public.recipe_line rl on rl.variant_id = l.variant_id
    join public.inventory_item ii on ii.id = rl.inventory_item_id
    group by rl.inventory_item_id, ii.name, ii.base_unit
    order by rl.inventory_item_id
  loop
    perform 1 from public.inventory_item where id = r.inventory_item_id for update;
    v_stock := private.stock_of(r.inventory_item_id, v_outlet);
    if v_stock < r.needed then
      raise exception 'Stok % tidak cukup. Tersedia % %, dibutuhkan % %.',
        r.name, trim_scale(v_stock), r.base_unit, trim_scale(r.needed), r.base_unit using errcode = 'P0001';
    end if;
  end loop;

  begin
    insert into public.sales_order (business_id, outlet_id, customer_name, channel, status, subtotal, discount, tax, total, cash_received, idempotency_key, created_by)
    values (p_business_id, v_outlet, coalesce(v_name, 'Pelanggan umum'), p_channel, 'paid', v_subtotal, v_discount, v_tax, v_total,
            case when p_payment = 'tunai' then p_cash_received else v_total end, p_idempotency_key, v_uid)
    returning id into v_order;
  exception when unique_violation then
    -- concurrent retry with the same key won the race
    select id into v_order from public.sales_order where business_id = p_business_id and idempotency_key = p_idempotency_key;
    return v_order;
  end;

  if nullif(btrim(coalesce(p_customer_phone, '')), '') is not null then
    v_phone := regexp_replace(btrim(p_customer_phone), '^\+', '');
    if v_phone !~ '^\d{8,15}$' then
      raise exception 'Nomor telepon harus terdiri dari 8–15 digit, boleh diawali +.' using errcode = '22023';
    end if;
    insert into public.customer as c (business_id, name, phone, visits, total_spent, points_balance, last_visit_at)
    values (p_business_id, coalesce(v_name, 'Pelanggan baru'), v_phone, 1, v_total, (v_total / 1000)::int, now())
    on conflict (business_id, phone) do update set
      name           = coalesce(v_name, c.name),
      visits         = c.visits + 1,
      total_spent    = c.total_spent + excluded.total_spent,
      points_balance = c.points_balance + excluded.points_balance,
      last_visit_at  = now(),
      deleted_at     = null
    returning c.id, c.name into v_customer, v_name;
    update public.customer set rfm_segment = private.segment_for(visits, last_visit_at) where id = v_customer;
    update public.sales_order set customer_id = v_customer, customer_name = v_name where id = v_order;
  end if;

  insert into public.order_item (business_id, order_id, variant_id, product_code, name, unit_price, unit_cost, quantity, note)
  select p_business_id, v_order, l.variant_id, l.code, l.name, l.price, l.cost, l.quantity, l.note
  from private.sale_lines(p_business_id, p_items) l;

  insert into public.payment (business_id, order_id, method, amount, status)
  values (p_business_id, v_order, p_payment, v_total, 'paid');

  insert into public.stock_movement (business_id, outlet_id, inventory_item_id, type, qty_delta, unit_cost, ref_id, created_by)
  select p_business_id, v_outlet, rl.inventory_item_id, 'sale', -sum(rl.qty_base_unit * l.quantity), ii.avg_cost_per_unit, v_order, v_uid
  from private.sale_lines(p_business_id, p_items) l
  join public.recipe_line rl on rl.variant_id = l.variant_id
  join public.inventory_item ii on ii.id = rl.inventory_item_id
  group by rl.inventory_item_id, ii.avg_cost_per_unit;

  insert into public.audit_log (business_id, actor_id, action, entity, entity_id, data)
  values (p_business_id, v_uid, 'sale.complete', 'sales_order', v_order,
          jsonb_build_object('total', v_total, 'payment', p_payment, 'channel', p_channel, 'discount', v_discount));

  return v_order;
end $$;

-- ---------------------------------------------------------------------------
-- record_purchase: stock-in + moving-average cost + HPP refresh (M4.2, M3.8)
--   p_lines: [{ "code": "milk", "quantity": 5000, "total": 110000 }, ...]
-- ---------------------------------------------------------------------------
create or replace function public.record_purchase(
  p_business_id  uuid,
  p_lines        jsonb,
  p_supplier_id  uuid default null,
  p_source       text default 'manual',
  p_receipt_path text default null,
  p_outlet_id    uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid      uuid := auth.uid();
  v_outlet   uuid;
  v_purchase uuid;
  v_total    bigint := 0;
  v_items    uuid[] := '{}';
  v_stock    numeric;
  r          record;
begin
  if v_uid is null or not private.is_member(p_business_id, array['owner', 'manager', 'kasir']) then
    raise exception 'Akses ditolak.' using errcode = '42501';
  end if;
  if p_source not in ('manual', 'scan') then raise exception 'Sumber pembelian tidak valid.' using errcode = '22023'; end if;
  if jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) = 0 or jsonb_array_length(p_lines) > 50 then
    raise exception 'Isi minimal satu bahan pembelian.' using errcode = '22023';
  end if;
  if p_supplier_id is not null and not exists (select 1 from public.supplier where id = p_supplier_id and business_id = p_business_id) then
    raise exception 'Supplier tidak ditemukan.' using errcode = '22023';
  end if;

  v_outlet := private.resolve_outlet(p_business_id, p_outlet_id);
  if v_outlet is null then raise exception 'Outlet tidak ditemukan.' using errcode = '22023'; end if;

  insert into public.purchase (business_id, outlet_id, supplier_id, total, source, receipt_path, created_by)
  values (p_business_id, v_outlet, p_supplier_id, 0, p_source, p_receipt_path, v_uid)
  returning id into v_purchase;

  for r in
    select ii.id, ii.name, (l.value ->> 'quantity')::numeric as qty, (l.value ->> 'total')::bigint as total, l.value ->> 'code' as code
    from jsonb_array_elements(p_lines) l
    left join public.inventory_item ii
      on ii.business_id = p_business_id and ii.code = l.value ->> 'code' and ii.deleted_at is null
    order by ii.id
  loop
    if r.id is null then raise exception 'Bahan tidak dikenal: %.', r.code using errcode = '22023'; end if;
    if r.qty is null or r.qty <= 0 or r.total is null or r.total <= 0 then
      raise exception 'Jumlah dan total pembelian % harus positif.', r.name using errcode = '22023';
    end if;
    perform 1 from public.inventory_item where id = r.id for update;
    v_stock := greatest(private.stock_of(r.id, v_outlet), 0);
    update public.inventory_item
      set avg_cost_per_unit = round(((v_stock * avg_cost_per_unit) + r.total) / (v_stock + r.qty), 4)
      where id = r.id;
    insert into public.purchase_line (business_id, purchase_id, inventory_item_id, quantity, total)
    values (p_business_id, v_purchase, r.id, r.qty, r.total);
    insert into public.stock_movement (business_id, outlet_id, inventory_item_id, type, qty_delta, unit_cost, ref_id, created_by)
    values (p_business_id, v_outlet, r.id, 'purchase', r.qty, round(r.total / r.qty, 4), v_purchase, v_uid);
    v_total := v_total + r.total;
    v_items := array_append(v_items, r.id);
  end loop;

  update public.purchase set total = v_total where id = v_purchase;
  perform private.refresh_hpp(p_business_id, v_items);

  insert into public.audit_log (business_id, actor_id, action, entity, entity_id, data)
  values (p_business_id, v_uid, 'purchase.record', 'purchase', v_purchase,
          jsonb_build_object('total', v_total, 'source', p_source, 'lines', jsonb_array_length(p_lines)));
  return v_purchase;
end $$;

-- ---------------------------------------------------------------------------
-- privileges
-- ---------------------------------------------------------------------------
revoke execute on function private.stock_of(uuid, uuid), private.segment_for(int, timestamptz), private.rupiah(bigint),
  private.sale_lines(uuid, jsonb), private.refresh_hpp(uuid, uuid[]), private.resolve_outlet(uuid, uuid)
  from public, anon, authenticated;

revoke execute on function public.create_business(text, text, text, text, text),
  public.complete_sale(uuid, jsonb, text, bigint, text, text, bigint, boolean, text, text, uuid),
  public.record_purchase(uuid, jsonb, uuid, text, text, uuid)
  from public, anon;
grant execute on function public.create_business(text, text, text, text, text),
  public.complete_sale(uuid, jsonb, text, bigint, text, text, bigint, boolean, text, text, uuid),
  public.record_purchase(uuid, jsonb, uuid, text, text, uuid)
  to authenticated;
