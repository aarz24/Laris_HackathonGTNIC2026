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
    on v.product_id = p.id and v.business_id = p_business_id and v.is_default and v.deleted_at is null and v.is_available;
$$;

create or replace function private.check_variant_tenant() returns trigger
language plpgsql set search_path = '' as $$
declare v_business uuid;
begin
  select p.business_id into v_business from public.product p where p.id = new.product_id;
  if v_business is null or v_business <> new.business_id then
    raise exception 'Produk dan varian harus berasal dari usaha yang sama.' using errcode = '23514';
  end if;
  return new;
end $$;

create or replace function private.check_recipe_tenant() returns trigger
language plpgsql set search_path = '' as $$
declare v_variant_business uuid; v_item_business uuid;
begin
  select v.business_id into v_variant_business from public.product_variant v where v.id = new.variant_id;
  select i.business_id into v_item_business from public.inventory_item i where i.id = new.inventory_item_id;
  if v_variant_business is null or v_item_business is null or v_variant_business <> new.business_id or v_item_business <> new.business_id then
    raise exception 'Resep, varian, dan bahan harus berasal dari usaha yang sama.' using errcode = '23514';
  end if;
  return new;
end $$;

create or replace function private.check_inventory_supplier_tenant() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.supplier_id is not null and not exists (
    select 1 from public.supplier s where s.id = new.supplier_id and s.business_id = new.business_id
  ) then
    raise exception 'Supplier dan bahan harus berasal dari usaha yang sama.' using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists product_variant_tenant on public.product_variant;
create trigger product_variant_tenant before insert or update on public.product_variant
for each row execute function private.check_variant_tenant();
drop trigger if exists recipe_line_tenant on public.recipe_line;
create trigger recipe_line_tenant before insert or update on public.recipe_line
for each row execute function private.check_recipe_tenant();
drop trigger if exists inventory_supplier_tenant on public.inventory_item;
create trigger inventory_supplier_tenant before insert or update on public.inventory_item
for each row execute function private.check_inventory_supplier_tenant();

create or replace function public.list_team_members(p_business_id uuid)
returns table (user_id uuid, email text, display_name text, role text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.is_member(p_business_id) then
    raise exception 'Akses ditolak.' using errcode = '42501';
  end if;
  return query
    select m.user_id, u.email::text, nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''), m.role, m.created_at
    from public.membership m join auth.users u on u.id = m.user_id
    where m.business_id = p_business_id
    order by m.created_at;
end $$;

create or replace function public.create_workspace(
  p_name text,
  p_slug text,
  p_owner_name text,
  p_outlet_name text,
  p_kind text,
  p_day_target bigint,
  p_inventory jsonb default '[]'::jsonb,
  p_products jsonb default '[]'::jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_business uuid;
  v_outlet uuid;
  v_supplier uuid;
  v_item uuid;
  v_product uuid;
  v_variant uuid;
  v_supplier_name text;
  r record;
  line record;
begin
  if v_uid is null then raise exception 'Silakan masuk terlebih dahulu.' using errcode = '42501'; end if;
  if p_kind not in ('coffee', 'restaurant', 'bakery', 'bar', 'other') then
    raise exception 'Jenis usaha tidak valid.' using errcode = '22023';
  end if;
  if p_day_target < 0 or p_day_target > 1000000000000 then
    raise exception 'Target harian tidak valid.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_inventory) is distinct from 'array' or jsonb_array_length(p_inventory) > 200
     or jsonb_typeof(p_products) is distinct from 'array' or jsonb_array_length(p_products) > 200 then
    raise exception 'Katalog awal tidak valid atau terlalu besar.' using errcode = '22023';
  end if;

  insert into public.business (name, slug, type, owner_name, day_target, settings)
  values (btrim(p_name), lower(btrim(p_slug)), 'fnb', btrim(p_owner_name), p_day_target, jsonb_build_object('kind', p_kind))
  returning id into v_business;
  insert into public.outlet (business_id, name) values (v_business, coalesce(nullif(btrim(p_outlet_name), ''), 'Outlet utama')) returning id into v_outlet;
  insert into public.membership (business_id, user_id, role) values (v_business, v_uid, 'owner');

  for r in select value from jsonb_array_elements(p_inventory) loop
    v_supplier := null;
    v_supplier_name := nullif(left(btrim(coalesce(r.value ->> 'supplier', '')), 100), '');
    if v_supplier_name is not null then
      insert into public.supplier (business_id, name) values (v_business, v_supplier_name)
      on conflict (business_id, name) do update set name = excluded.name
      returning id into v_supplier;
    end if;
    insert into public.inventory_item (business_id, code, name, base_unit, avg_cost_per_unit, reorder_point, safety_stock, supplier_id)
    values (
      v_business, r.value ->> 'code', btrim(r.value ->> 'name'), r.value ->> 'unit',
      (r.value ->> 'cost')::numeric, (r.value ->> 'reorder_point')::numeric,
      round((r.value ->> 'reorder_point')::numeric / 2, 3), v_supplier
    ) returning id into v_item;
    if coalesce((r.value ->> 'opening_stock')::numeric, 0) > 0 then
      insert into public.stock_movement (business_id, outlet_id, inventory_item_id, type, qty_delta, unit_cost, created_by)
      values (v_business, v_outlet, v_item, 'opening', (r.value ->> 'opening_stock')::numeric, (r.value ->> 'cost')::numeric, v_uid);
    end if;
  end loop;

  for r in select value from jsonb_array_elements(p_products) loop
    insert into public.product (business_id, code, name, category, image_url)
    values (v_business, r.value ->> 'code', btrim(r.value ->> 'name'), coalesce(nullif(btrim(r.value ->> 'category'), ''), 'Lainnya'), nullif(r.value ->> 'image', ''))
    returning id into v_product;
    insert into public.product_variant (business_id, product_id, name, is_default, price, hpp_cached)
    values (v_business, v_product, 'Reguler', true, (r.value ->> 'price')::bigint, 0)
    returning id into v_variant;
    for line in select value from jsonb_array_elements(coalesce(r.value -> 'recipe', '[]'::jsonb)) loop
      select i.id into v_item from public.inventory_item i
      where i.business_id = v_business and i.code = line.value ->> 'code' and i.deleted_at is null;
      if v_item is null then raise exception 'Bahan resep tidak ditemukan: %.', line.value ->> 'code' using errcode = '22023'; end if;
      insert into public.recipe_line (business_id, variant_id, inventory_item_id, qty_base_unit)
      values (v_business, v_variant, v_item, (line.value ->> 'quantity')::numeric);
    end loop;
  end loop;

  perform private.refresh_hpp(v_business);
  insert into public.audit_log (business_id, actor_id, action, entity, entity_id, data)
  values (v_business, v_uid, 'business.create', 'business', v_business, jsonb_build_object('kind', p_kind, 'starter_catalog', jsonb_array_length(p_products) > 0));
  return v_business;
end $$;

create or replace function public.save_product(
  p_business_id uuid,
  p_code text,
  p_name text,
  p_category text,
  p_price bigint,
  p_image_url text,
  p_active boolean,
  p_recipe jsonb
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_code text := nullif(lower(btrim(coalesce(p_code, ''))), '');
  v_product uuid;
  v_variant uuid;
  v_item uuid;
  line record;
begin
  if v_uid is null or not private.is_member(p_business_id, array['owner', 'manager']) then
    raise exception 'Akses ditolak.' using errcode = '42501';
  end if;
  if p_price < 0 or p_price > 1000000000000 then raise exception 'Harga tidak valid.' using errcode = '22023'; end if;
  if jsonb_typeof(p_recipe) is distinct from 'array' or jsonb_array_length(p_recipe) > 100 then
    raise exception 'Resep tidak valid atau terlalu besar.' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_recipe) r
    group by r.value ->> 'code' having count(*) > 1
  ) then raise exception 'Bahan yang sama hanya boleh muncul sekali dalam resep.' using errcode = '22023'; end if;

  if v_code is null then
    v_code := 'menu-' || substr(gen_random_uuid()::text, 1, 10);
    insert into public.product (business_id, code, name, category, image_url, is_active)
    values (p_business_id, v_code, btrim(p_name), btrim(p_category), nullif(btrim(coalesce(p_image_url, '')), ''), p_active)
    returning id into v_product;
  else
    select p.id into v_product from public.product p
    where p.business_id = p_business_id and p.code = v_code and p.deleted_at is null for update;
    if v_product is null then raise exception 'Menu tidak ditemukan.' using errcode = '22023'; end if;
    update public.product set name = btrim(p_name), category = btrim(p_category), image_url = nullif(btrim(coalesce(p_image_url, '')), ''), is_active = p_active
    where id = v_product;
  end if;

  select v.id into v_variant from public.product_variant v where v.product_id = v_product and v.is_default and v.deleted_at is null for update;
  if v_variant is null then
    insert into public.product_variant (business_id, product_id, name, is_default, price, hpp_cached, is_available)
    values (p_business_id, v_product, 'Reguler', true, p_price, 0, p_active) returning id into v_variant;
  else
    update public.product_variant set price = p_price, is_available = p_active where id = v_variant;
  end if;

  delete from public.recipe_line where variant_id = v_variant;
  for line in select value from jsonb_array_elements(p_recipe) loop
    select i.id into v_item from public.inventory_item i
    where i.business_id = p_business_id and i.code = line.value ->> 'code' and i.deleted_at is null;
    if v_item is null then raise exception 'Bahan resep tidak ditemukan: %.', line.value ->> 'code' using errcode = '22023'; end if;
    if coalesce((line.value ->> 'quantity')::numeric, 0) <= 0 then raise exception 'Jumlah bahan resep harus positif.' using errcode = '22023'; end if;
    insert into public.recipe_line (business_id, variant_id, inventory_item_id, qty_base_unit)
    values (p_business_id, v_variant, v_item, (line.value ->> 'quantity')::numeric);
  end loop;

  perform private.refresh_hpp(p_business_id);
  insert into public.audit_log (business_id, actor_id, action, entity, entity_id, data)
  values (p_business_id, v_uid, 'product.save', 'product', v_product, jsonb_build_object('code', v_code, 'active', p_active));
  return v_code;
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
  if p_avg_cost < 0 or p_reorder_point < 0 or coalesce(p_opening_stock, 0) < 0 or coalesce(p_counted_stock, 0) < 0 then
    raise exception 'Biaya, batas stok, dan jumlah stok tidak boleh negatif.' using errcode = '22023';
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

create or replace function public.add_team_member_by_email(
  p_business_id uuid,
  p_email text,
  p_role text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_user uuid;
  v_name text;
  v_email text;
  v_role text;
  v_count int;
begin
  if v_actor is null or not private.is_member(p_business_id, array['owner']) then
    raise exception 'Hanya pemilik usaha yang dapat mengelola tim.' using errcode = '42501';
  end if;
  if p_role not in ('manager', 'kasir', 'dapur') then raise exception 'Peran tidak valid.' using errcode = '22023'; end if;
  select u.id, u.email::text, nullif(btrim(u.raw_user_meta_data ->> 'full_name'), '')
  into v_user, v_email, v_name from auth.users u where lower(u.email) = lower(btrim(p_email)) limit 1;
  if v_user is null then return null; end if;

  insert into public.membership (business_id, user_id, role) values (p_business_id, v_user, p_role)
  on conflict (business_id, user_id) do nothing;
  get diagnostics v_count = row_count;
  select m.role into v_role from public.membership m where m.business_id = p_business_id and m.user_id = v_user;
  if v_count > 0 then
    insert into public.audit_log (business_id, actor_id, action, entity, entity_id, data)
    values (p_business_id, v_actor, 'membership.create', 'membership', v_user, jsonb_build_object('role', p_role));
  end if;
  return jsonb_build_object('userId', v_user, 'email', v_email, 'name', coalesce(v_name, split_part(v_email, '@', 1)), 'role', v_role, 'created', v_count > 0);
end $$;

revoke execute on function private.check_variant_tenant(), private.check_recipe_tenant(), private.check_inventory_supplier_tenant() from public, anon, authenticated;
revoke execute on function public.list_team_members(uuid),
  public.create_workspace(text, text, text, text, text, bigint, jsonb, jsonb),
  public.save_product(uuid, text, text, text, bigint, text, boolean, jsonb),
  public.save_inventory_item(uuid, text, text, text, numeric, numeric, text, numeric, numeric),
  public.add_team_member_by_email(uuid, text, text) from public, anon;
grant execute on function public.list_team_members(uuid),
  public.create_workspace(text, text, text, text, text, bigint, jsonb, jsonb),
  public.save_product(uuid, text, text, text, bigint, text, boolean, jsonb),
  public.save_inventory_item(uuid, text, text, text, numeric, numeric, text, numeric, numeric),
  public.add_team_member_by_email(uuid, text, text) to authenticated;
