-- Laris · production hardening
-- Catalog writes and checkouts share a per-business lock so prices, recipes,
-- stock checks, and deductions cannot observe different catalog versions.

alter table public.purchase add column if not exists idempotency_key text;
create unique index if not exists purchase_business_idempotency on public.purchase (business_id, idempotency_key)
  where idempotency_key is not null;

alter table public.customer alter column points_balance type bigint;

-- Numeric NaN satisfies ordinary sign checks in PostgreSQL, so reject all non-finite values explicitly.
alter table public.inventory_item drop constraint inventory_item_avg_cost_per_unit_check;
alter table public.inventory_item add constraint inventory_item_avg_cost_per_unit_check
  check (avg_cost_per_unit >= 0 and avg_cost_per_unit::text not in ('NaN', 'Infinity', '-Infinity'));
alter table public.inventory_item drop constraint inventory_item_reorder_point_check;
alter table public.inventory_item add constraint inventory_item_reorder_point_check
  check (reorder_point >= 0 and reorder_point::text not in ('NaN', 'Infinity', '-Infinity'));
alter table public.inventory_item drop constraint inventory_item_safety_stock_check;
alter table public.inventory_item add constraint inventory_item_safety_stock_check
  check (safety_stock >= 0 and safety_stock::text not in ('NaN', 'Infinity', '-Infinity'));
alter table public.recipe_line drop constraint recipe_line_qty_base_unit_check;
alter table public.recipe_line add constraint recipe_line_qty_base_unit_check
  check (qty_base_unit > 0 and qty_base_unit::text not in ('NaN', 'Infinity', '-Infinity'));
alter table public.stock_movement drop constraint stock_movement_qty_delta_check;
alter table public.stock_movement add constraint stock_movement_qty_delta_check
  check (qty_delta <> 0 and qty_delta::text not in ('NaN', 'Infinity', '-Infinity'));
alter table public.stock_movement drop constraint if exists stock_movement_unit_cost_finite;
alter table public.stock_movement add constraint stock_movement_unit_cost_finite
  check (unit_cost::text not in ('NaN', 'Infinity', '-Infinity'));
alter table public.purchase_line drop constraint purchase_line_quantity_check;
alter table public.purchase_line add constraint purchase_line_quantity_check
  check (quantity > 0 and quantity::text not in ('NaN', 'Infinity', '-Infinity'));

create or replace function private.prevent_tenant_move() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.business_id is distinct from old.business_id then
    raise exception 'business_id tidak dapat diubah setelah baris dibuat.' using errcode = '23514';
  end if;
  return new;
end $$;

create or replace function private.lock_business_for_catalog_write() returns trigger
language plpgsql set search_path = '' as $$
declare v_business uuid;
begin
  v_business := case when tg_op = 'DELETE' then old.business_id else new.business_id end;
  perform 1 from public.business where id = v_business for update;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'outlet','membership','supplier','inventory_item','product','product_variant','recipe_line','customer',
    'sales_order','order_item','payment','stock_movement','purchase','purchase_line','expense','audit_log','ai_event'
  ] loop
    execute format('drop trigger if exists business_id_immutable on public.%I', t);
    execute format('create trigger business_id_immutable before update on public.%I for each row execute function private.prevent_tenant_move()', t);
  end loop;
  foreach t in array array['supplier','inventory_item','product','product_variant','recipe_line'] loop
    execute format('drop trigger if exists catalog_business_lock on public.%I', t);
    execute format('create trigger catalog_business_lock before insert or update or delete on public.%I for each row execute function private.lock_business_for_catalog_write()', t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
  end loop;
end $$;

create or replace function public.list_team_members(p_business_id uuid)
returns table (user_id uuid, email text, display_name text, role text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.is_member(p_business_id, array['owner', 'manager']) then
    raise exception 'Akses ditolak.' using errcode = '42501';
  end if;
  return query
    select m.user_id, u.email::text, nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''), m.role, m.created_at
    from public.membership m join auth.users u on u.id = m.user_id
    where m.business_id = p_business_id
    order by m.created_at;
end $$;

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
  perform 1 from public.business where id = p_business_id for update;

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
  if p_tax_enabled then v_tax := round((v_subtotal - v_discount) * 0.1); end if;
  v_total := v_subtotal - v_discount + v_tax;
  if p_payment = 'tunai' and coalesce(p_cash_received, 0) < v_total then
    raise exception 'Uang tunai tidak cukup. Total pembayaran %.', private.rupiah(v_total) using errcode = '22023';
  end if;

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
    select id into v_order from public.sales_order where business_id = p_business_id and idempotency_key = p_idempotency_key;
    return v_order;
  end;

  if nullif(btrim(coalesce(p_customer_phone, '')), '') is not null then
    v_phone := regexp_replace(btrim(p_customer_phone), '^\+', '');
    if v_phone !~ '^\d{8,15}$' then
      raise exception 'Nomor telepon harus terdiri dari 8–15 digit, boleh diawali +.' using errcode = '22023';
    end if;
    insert into public.customer as c (business_id, name, phone, visits, total_spent, points_balance, last_visit_at)
    values (p_business_id, coalesce(v_name, 'Pelanggan baru'), v_phone, 1, v_total, v_total / 1000, now())
    on conflict (business_id, phone) do update set
      name = coalesce(v_name, c.name), visits = c.visits + 1,
      total_spent = c.total_spent + excluded.total_spent,
      points_balance = c.points_balance + excluded.points_balance,
      last_visit_at = now(), deleted_at = null
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

drop function if exists public.record_purchase(uuid, jsonb, uuid, text, text, uuid);
create or replace function public.record_purchase(
  p_business_id     uuid,
  p_lines           jsonb,
  p_supplier_id     uuid default null,
  p_source          text default 'manual',
  p_receipt_path    text default null,
  p_outlet_id       uuid default null,
  p_idempotency_key text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid       uuid := auth.uid();
  v_outlet    uuid;
  v_purchase  uuid;
  v_total     bigint := 0;
  v_items     uuid[] := '{}';
  v_stock     numeric;
  v_unit_cost numeric;
  r           record;
begin
  if v_uid is null or not private.is_member(p_business_id, array['owner', 'manager', 'kasir']) then
    raise exception 'Akses ditolak.' using errcode = '42501';
  end if;
  perform 1 from public.business where id = p_business_id for update;

  if p_idempotency_key is not null then
    if length(p_idempotency_key) < 8 or length(p_idempotency_key) > 100 then
      raise exception 'Kunci pembelian harus terdiri dari 8–100 karakter.' using errcode = '22023';
    end if;
    select id into v_purchase from public.purchase where business_id = p_business_id and idempotency_key = p_idempotency_key;
    if found then return v_purchase; end if;
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

  begin
    insert into public.purchase (business_id, outlet_id, supplier_id, total, source, receipt_path, idempotency_key, created_by)
    values (p_business_id, v_outlet, p_supplier_id, 0, p_source, p_receipt_path, p_idempotency_key, v_uid)
    returning id into v_purchase;
  exception when unique_violation then
    select id into v_purchase from public.purchase where business_id = p_business_id and idempotency_key = p_idempotency_key;
    return v_purchase;
  end;

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
    v_unit_cost := round(r.total / r.qty, 4);
    if v_unit_cost > 9999999999.9999 then
      raise exception 'Biaya per unit % melebihi batas sistem.', r.name using errcode = '22023';
    end if;
    perform 1 from public.inventory_item where id = r.id for update;
    v_stock := greatest((
      select coalesce(sum(sm.qty_delta), 0) from public.stock_movement sm
      where sm.business_id = p_business_id and sm.inventory_item_id = r.id
    ), 0);
    update public.inventory_item
      set avg_cost_per_unit = round(((v_stock * avg_cost_per_unit) + r.total) / (v_stock + r.qty), 4)
      where id = r.id;
    insert into public.purchase_line (business_id, purchase_id, inventory_item_id, quantity, total)
    values (p_business_id, v_purchase, r.id, r.qty, r.total);
    insert into public.stock_movement (business_id, outlet_id, inventory_item_id, type, qty_delta, unit_cost, ref_id, created_by)
    values (p_business_id, v_outlet, r.id, 'purchase', r.qty, v_unit_cost, v_purchase, v_uid);
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

create or replace function public.save_inventory_item(
  p_business_id uuid,
  p_code text,
  p_name text,
  p_base_unit text,
  p_avg_cost numeric,
  p_reorder_point numeric,
  p_supplier_name text default '',
  p_opening_stock numeric default 0,
  p_counted_stock numeric default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_code text := nullif(lower(btrim(coalesce(p_code, ''))), '');
  v_item uuid;
  v_outlet uuid;
  v_supplier uuid;
  v_supplier_name text := nullif(left(btrim(coalesce(p_supplier_name, '')), 100), '');
  v_movement uuid;
  v_current numeric;
  v_delta numeric;
  v_old_unit text;
begin
  if v_uid is null or not private.is_member(p_business_id, array['owner', 'manager']) then
    raise exception 'Akses ditolak.' using errcode = '42501';
  end if;
  perform 1 from public.business where id = p_business_id for update;
  if p_avg_cost < 0 or p_reorder_point < 0 or coalesce(p_opening_stock, 0) < 0 or coalesce(p_counted_stock, 0) < 0 then
    raise exception 'Biaya, batas stok, dan jumlah stok tidak boleh negatif.' using errcode = '22023';
  end if;
  if p_avg_cost > 9999999999.9999 then
    raise exception 'Biaya per satuan melebihi batas sistem.' using errcode = '22023';
  end if;
  if v_supplier_name is not null then
    insert into public.supplier (business_id, name) values (p_business_id, v_supplier_name)
    on conflict (business_id, name) do update set name = excluded.name
    returning id into v_supplier;
  end if;

  if v_code is null then
    v_code := 'item-' || substr(gen_random_uuid()::text, 1, 10);
    v_outlet := private.resolve_outlet(p_business_id, null);
    if v_outlet is null then raise exception 'Outlet tidak ditemukan.' using errcode = '22023'; end if;
    insert into public.inventory_item (business_id, code, name, base_unit, avg_cost_per_unit, reorder_point, safety_stock, supplier_id)
    values (p_business_id, v_code, btrim(p_name), btrim(p_base_unit), p_avg_cost, p_reorder_point, round(p_reorder_point / 2, 3), v_supplier)
    returning id into v_item;
    if coalesce(p_opening_stock, 0) > 0 then
      insert into public.stock_movement (business_id, outlet_id, inventory_item_id, type, qty_delta, unit_cost, created_by)
      values (p_business_id, v_outlet, v_item, 'opening', p_opening_stock, p_avg_cost, v_uid) returning id into v_movement;
    end if;
  else
    select i.id, i.base_unit into v_item, v_old_unit from public.inventory_item i
    where i.business_id = p_business_id and i.code = v_code and i.deleted_at is null for update;
    if v_item is null then raise exception 'Bahan tidak ditemukan.' using errcode = '22023'; end if;
    if v_old_unit <> btrim(p_base_unit) and exists (
      select 1 from public.stock_movement sm where sm.inventory_item_id = v_item
      union select 1 from public.recipe_line rl where rl.inventory_item_id = v_item
    ) then
      raise exception 'Satuan tidak dapat diubah setelah bahan dipakai dalam resep atau ledger.' using errcode = '22023';
    end if;
    update public.inventory_item
    set name = btrim(p_name), base_unit = btrim(p_base_unit), avg_cost_per_unit = p_avg_cost,
        reorder_point = p_reorder_point, safety_stock = round(p_reorder_point / 2, 3), supplier_id = v_supplier
    where id = v_item;
    if p_counted_stock is not null then
      v_outlet := private.resolve_outlet(p_business_id, null);
      v_current := private.stock_of(v_item, v_outlet);
      v_delta := p_counted_stock - v_current;
      if v_delta <> 0 then
        insert into public.stock_movement (business_id, outlet_id, inventory_item_id, type, qty_delta, unit_cost, created_by)
        values (p_business_id, v_outlet, v_item, 'opname', v_delta, p_avg_cost, v_uid) returning id into v_movement;
      end if;
    end if;
  end if;

  perform private.refresh_hpp(p_business_id);
  insert into public.audit_log (business_id, actor_id, action, entity, entity_id, data)
  values (p_business_id, v_uid, 'inventory.save', 'inventory_item', v_item,
          jsonb_build_object('code', v_code, 'movement_id', v_movement, 'counted_stock', p_counted_stock));
  return jsonb_build_object('code', v_code, 'movementId', v_movement);
end $$;

revoke execute on function private.prevent_tenant_move(), private.lock_business_for_catalog_write() from public, anon, authenticated;
revoke execute on function public.record_purchase(uuid, jsonb, uuid, text, text, uuid, text) from public, anon;
grant execute on function public.record_purchase(uuid, jsonb, uuid, text, text, uuid, text) to authenticated;
grant execute on function public.list_team_members(uuid) to authenticated;
