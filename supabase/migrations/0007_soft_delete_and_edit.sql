-- Laris · soft deletes & correction paths
-- Mistake-fixing flows for catalog, customers, expenses, and team access.
-- Every function follows the 0003–0005 conventions:
--   * SECURITY DEFINER with hardened search_path
--   * membership + role re-checked via private.is_member()
--   * validates that the row belongs to the business and is not already deleted
--   * writes an audit_log row
-- Deletes are soft (deleted_at) so ledgers and sales history stay intact.
-- recipe_line has no deleted_at column; delete_product removes its lines
-- outright (save_product already rewrites recipe lines the same way).

-- expense historically had no deleted_at column; add it (additive) so expense
-- corrections are soft like the rest of the catalog.
alter table public.expense add column if not exists deleted_at timestamptz;

-- ---------------------------------------------------------------------------
-- product: soft-delete product + variants, hard-delete recipe lines
-- ---------------------------------------------------------------------------
create or replace function public.delete_product(
  p_business_id uuid,
  p_product_id  uuid
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_uid     uuid := auth.uid();
  v_product uuid;
  v_code    text;
begin
  if v_uid is null or not private.is_member(p_business_id, array['owner', 'manager']) then
    raise exception 'Akses ditolak.' using errcode = '42501';
  end if;
  perform 1 from public.business where id = p_business_id for update;

  select p.id, p.code into v_product, v_code
  from public.product p
  where p.id = p_product_id and p.business_id = p_business_id and p.deleted_at is null
  for update;
  if v_product is null then raise exception 'Menu tidak ditemukan.' using errcode = '22023'; end if;

  delete from public.recipe_line
  where business_id = p_business_id
    and variant_id in (select v.id from public.product_variant v where v.product_id = v_product);
  update public.product_variant set deleted_at = now() where product_id = v_product and deleted_at is null;
  update public.product set deleted_at = now() where id = v_product;

  insert into public.audit_log (business_id, actor_id, action, entity, entity_id, data)
  values (p_business_id, v_uid, 'product.delete', 'product', v_product, jsonb_build_object('code', v_code));
  return v_code;
end $$;

-- ---------------------------------------------------------------------------
-- inventory: refuse while any live recipe still uses the ingredient
-- ---------------------------------------------------------------------------
create or replace function public.delete_inventory_item(
  p_business_id uuid,
  p_item_id     uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid  uuid := auth.uid();
  v_item uuid;
  v_code text;
  v_used text;
begin
  if v_uid is null or not private.is_member(p_business_id, array['owner', 'manager']) then
    raise exception 'Akses ditolak.' using errcode = '42501';
  end if;
  perform 1 from public.business where id = p_business_id for update;

  select i.id, i.code into v_item, v_code
  from public.inventory_item i
  where i.id = p_item_id and i.business_id = p_business_id and i.deleted_at is null
  for update;
  if v_item is null then raise exception 'Bahan tidak ditemukan.' using errcode = '22023'; end if;

  select p.name into v_used
  from public.recipe_line rl
  join public.product_variant v on v.id = rl.variant_id and v.deleted_at is null
  join public.product p on p.id = v.product_id and p.deleted_at is null
  where rl.inventory_item_id = v_item
  order by p.name
  limit 1;
  if v_used is not null then
    raise exception 'Bahan masih dipakai resep menu %. Hapus atau ubah resep menu tersebut terlebih dahulu.', v_used using errcode = '22023';
  end if;

  update public.inventory_item set deleted_at = now() where id = v_item;

  insert into public.audit_log (business_id, actor_id, action, entity, entity_id, data)
  values (p_business_id, v_uid, 'inventory.delete', 'inventory_item', v_item, jsonb_build_object('code', v_code));
  return jsonb_build_object('code', v_code);
end $$;

-- ---------------------------------------------------------------------------
-- customer: soft-delete; sales_order keeps customer_id + denormalised name
-- ---------------------------------------------------------------------------
create or replace function public.delete_customer(
  p_business_id uuid,
  p_customer_id uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid      uuid := auth.uid();
  v_customer uuid;
begin
  -- Same rule as the customer_delete RLS policy (0002): cashiers may add/edit, only owner/manager remove.
  if v_uid is null or not private.is_member(p_business_id, array['owner', 'manager']) then
    raise exception 'Akses ditolak.' using errcode = '42501';
  end if;
  select c.id into v_customer from public.customer c
  where c.id = p_customer_id and c.business_id = p_business_id and c.deleted_at is null
  for update;
  if v_customer is null then raise exception 'Pelanggan tidak ditemukan.' using errcode = '22023'; end if;

  update public.customer set deleted_at = now() where id = v_customer;

  insert into public.audit_log (business_id, actor_id, action, entity, entity_id, data)
  values (p_business_id, v_uid, 'customer.delete', 'customer', v_customer, jsonb_build_object('id', v_customer));
  return jsonb_build_object('id', v_customer);
end $$;

-- ---------------------------------------------------------------------------
-- expense: soft-delete a wrongly recorded operational cost
-- ---------------------------------------------------------------------------
create or replace function public.delete_expense(
  p_business_id uuid,
  p_expense_id  uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid     uuid := auth.uid();
  v_expense uuid;
begin
  if v_uid is null or not private.is_member(p_business_id, array['owner', 'manager']) then
    raise exception 'Akses ditolak.' using errcode = '42501';
  end if;
  select e.id into v_expense from public.expense e
  where e.id = p_expense_id and e.business_id = p_business_id and e.deleted_at is null
  for update;
  if v_expense is null then raise exception 'Pengeluaran tidak ditemukan.' using errcode = '22023'; end if;

  update public.expense set deleted_at = now() where id = v_expense;

  insert into public.audit_log (business_id, actor_id, action, entity, entity_id, data)
  values (p_business_id, v_uid, 'expense.delete', 'expense', v_expense, jsonb_build_object('id', v_expense));
  return jsonb_build_object('id', v_expense);
end $$;

-- ---------------------------------------------------------------------------
-- customer edit: name/phone correction with duplicate-phone guard
-- ---------------------------------------------------------------------------
create or replace function public.update_customer(
  p_business_id uuid,
  p_customer_id uuid,
  p_name        text,
  p_phone       text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid      uuid := auth.uid();
  v_customer uuid;
  v_name     text := nullif(left(btrim(coalesce(p_name, '')), 80), '');
  v_phone    text := regexp_replace(btrim(coalesce(p_phone, '')), '^\+', '');
begin
  if v_uid is null or not private.is_member(p_business_id, array['owner', 'manager', 'kasir']) then
    raise exception 'Akses ditolak.' using errcode = '42501';
  end if;
  if v_name is null then raise exception 'Isi nama pelanggan.' using errcode = '22023'; end if;
  if v_phone !~ '^\d{8,15}$' then
    raise exception 'Nomor telepon harus terdiri dari 8–15 digit, boleh diawali +.' using errcode = '22023';
  end if;

  select c.id into v_customer from public.customer c
  where c.id = p_customer_id and c.business_id = p_business_id and c.deleted_at is null
  for update;
  if v_customer is null then raise exception 'Pelanggan tidak ditemukan.' using errcode = '22023'; end if;

  -- (business_id, phone) is unique across live and soft-deleted rows, so check both to avoid a raw 23505.
  if exists (
    select 1 from public.customer c
    where c.business_id = p_business_id
      and c.phone = v_phone
      and c.id <> v_customer
      and c.deleted_at is null
  ) then
    raise exception 'Nomor telepon ini sudah terdaftar untuk pelanggan lain.' using errcode = '23505';
  end if;
  if exists (
    select 1 from public.customer c
    where c.business_id = p_business_id
      and c.phone = v_phone
      and c.id <> v_customer
      and c.deleted_at is not null
  ) then
    raise exception 'Nomor telepon ini milik pelanggan yang sudah dihapus. Tambahkan ulang pelanggan tersebut dengan nomor ini.' using errcode = '23505';
  end if;

  update public.customer set name = v_name, phone = v_phone where id = v_customer;

  insert into public.audit_log (business_id, actor_id, action, entity, entity_id, data)
  values (p_business_id, v_uid, 'customer.update', 'customer', v_customer, jsonb_build_object('name', v_name));
  return jsonb_build_object('id', v_customer, 'name', v_name, 'phone', v_phone);
end $$;

-- ---------------------------------------------------------------------------
-- team: owner-only removal (membership has no deleted_at → hard delete)
-- ---------------------------------------------------------------------------
create or replace function public.remove_team_member(
  p_business_id uuid,
  p_user_id     uuid
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_role  text;
begin
  if v_actor is null or not private.is_member(p_business_id, array['owner']) then
    raise exception 'Hanya pemilik usaha yang dapat mengelola tim.' using errcode = '42501';
  end if;
  select m.role into v_role from public.membership m
  where m.business_id = p_business_id and m.user_id = p_user_id
  for update;
  if v_role is null then raise exception 'Anggota tidak ditemukan.' using errcode = '22023'; end if;
  if v_role = 'owner' then raise exception 'Pemilik usaha tidak dapat dikeluarkan.' using errcode = '42501'; end if;

  delete from public.membership where business_id = p_business_id and user_id = p_user_id;

  insert into public.audit_log (business_id, actor_id, action, entity, entity_id, data)
  values (p_business_id, v_actor, 'membership.remove', 'membership', p_user_id, jsonb_build_object('role', v_role));
  return jsonb_build_object('userId', p_user_id);
end $$;

-- ---------------------------------------------------------------------------
-- team: owner-only role change (owner role itself is immutable)
-- ---------------------------------------------------------------------------
create or replace function public.update_team_member_role(
  p_business_id uuid,
  p_user_id     uuid,
  p_new_role    text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_role  text;
begin
  if v_actor is null or not private.is_member(p_business_id, array['owner']) then
    raise exception 'Hanya pemilik usaha yang dapat mengelola tim.' using errcode = '42501';
  end if;
  if p_new_role not in ('manager', 'kasir', 'dapur') then raise exception 'Peran tidak valid.' using errcode = '22023'; end if;
  select m.role into v_role from public.membership m
  where m.business_id = p_business_id and m.user_id = p_user_id
  for update;
  if v_role is null then raise exception 'Anggota tidak ditemukan.' using errcode = '22023'; end if;
  if v_role = 'owner' then raise exception 'Peran pemilik tidak dapat diubah.' using errcode = '42501'; end if;

  update public.membership set role = p_new_role where business_id = p_business_id and user_id = p_user_id;

  insert into public.audit_log (business_id, actor_id, action, entity, entity_id, data)
  values (p_business_id, v_actor, 'membership.update_role', 'membership', p_user_id, jsonb_build_object('role', p_new_role));
  return jsonb_build_object('userId', p_user_id, 'role', p_new_role);
end $$;

-- ---------------------------------------------------------------------------
-- privileges (mirror 0004/0005)
-- ---------------------------------------------------------------------------
revoke execute on function public.delete_product(uuid, uuid),
  public.delete_inventory_item(uuid, uuid),
  public.delete_customer(uuid, uuid),
  public.delete_expense(uuid, uuid),
  public.update_customer(uuid, uuid, text, text),
  public.remove_team_member(uuid, uuid),
  public.update_team_member_role(uuid, uuid, text)
  from public, anon;
grant execute on function public.delete_product(uuid, uuid),
  public.delete_inventory_item(uuid, uuid),
  public.delete_customer(uuid, uuid),
  public.delete_expense(uuid, uuid),
  public.update_customer(uuid, uuid, text, text),
  public.remove_team_member(uuid, uuid),
  public.update_team_member_role(uuid, uuid, text)
  to authenticated;
