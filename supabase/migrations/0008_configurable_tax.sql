-- Laris · configurable tax rate
-- Owners can set business.settings.taxRate (0–100, e.g. PBJT 10% or PPN 11%) from Pengaturan.
-- complete_sale previously hard-coded 10%; it now reads the rate from the business row it already
-- locks, so the server stays the source of truth for totals. Missing/invalid values fall back to 10%.
-- Body is identical to 0005 except for v_tax_rate. Safe to re-run (create or replace, same signature).

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
  v_tax_rate numeric := 10;
  v_settings jsonb;
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
  select b.settings into v_settings from public.business b where b.id = p_business_id for update;
  if jsonb_typeof(v_settings -> 'taxRate') = 'number' then
    v_tax_rate := least(greatest((v_settings ->> 'taxRate')::numeric, 0), 100);
  end if;

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
  if p_tax_enabled then v_tax := round((v_subtotal - v_discount) * v_tax_rate / 100); end if;
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
          jsonb_build_object('total', v_total, 'payment', p_payment, 'channel', p_channel, 'discount', v_discount, 'tax_rate', v_tax_rate));
  return v_order;
end $$;
