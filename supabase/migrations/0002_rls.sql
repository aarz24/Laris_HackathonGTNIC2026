-- Laris · Row Level Security
-- Model:
--   * reads: any member of the business
--   * catalog writes (product, inventory, supplier…): owner / manager
--   * ledger tables (sales, payments, stock, purchases, audit): NO direct client writes;
--     they are only written through SECURITY DEFINER functions in 0003_functions.sql,
--     which re-check membership + role and keep everything atomic.

-- ---------------------------------------------------------------------------
-- membership helper (security definer so policies don't recurse on membership)
-- ---------------------------------------------------------------------------
create or replace function private.is_member(p_business_id uuid, p_roles text[] default null)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.membership m
    where m.business_id = p_business_id
      and m.user_id = (select auth.uid())
      and (p_roles is null or m.role = any (p_roles))
  );
$$;

grant usage on schema private to authenticated;
grant execute on function private.is_member(uuid, text[]) to authenticated;
revoke execute on function private.is_member(uuid, text[]) from anon, public;

-- ---------------------------------------------------------------------------
-- enable RLS everywhere
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'business','outlet','membership','supplier','inventory_item','product','product_variant','recipe_line',
    'customer','sales_order','order_item','payment','stock_movement','purchase','purchase_line','expense',
    'audit_log','ai_event','holiday_calendar'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- tenancy
-- ---------------------------------------------------------------------------
create policy business_select on public.business for select to authenticated
  using (private.is_member(id));
create policy business_update on public.business for update to authenticated
  using (private.is_member(id, array['owner'])) with check (private.is_member(id, array['owner']));

create policy outlet_select on public.outlet for select to authenticated
  using (private.is_member(business_id));
create policy outlet_write on public.outlet for all to authenticated
  using (private.is_member(business_id, array['owner'])) with check (private.is_member(business_id, array['owner']));

create policy membership_select on public.membership for select to authenticated
  using (user_id = (select auth.uid()) or private.is_member(business_id, array['owner', 'manager']));
create policy membership_owner_write on public.membership for all to authenticated
  using (private.is_member(business_id, array['owner'])) with check (private.is_member(business_id, array['owner']));

-- ---------------------------------------------------------------------------
-- catalog: members read, owner/manager write
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['supplier','inventory_item','product','product_variant','recipe_line'] loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (private.is_member(business_id))',
      t || '_select', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (private.is_member(business_id, array[''owner'',''manager''])) with check (private.is_member(business_id, array[''owner'',''manager'']))',
      t || '_write', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- customers: cashier can create/update (checkout, quick add); owner/manager can delete
-- ---------------------------------------------------------------------------
create policy customer_select on public.customer for select to authenticated
  using (private.is_member(business_id));
create policy customer_insert on public.customer for insert to authenticated
  with check (private.is_member(business_id, array['owner', 'manager', 'kasir']));
create policy customer_update on public.customer for update to authenticated
  using (private.is_member(business_id, array['owner', 'manager', 'kasir']))
  with check (private.is_member(business_id, array['owner', 'manager', 'kasir']));
create policy customer_delete on public.customer for delete to authenticated
  using (private.is_member(business_id, array['owner', 'manager']));

-- ---------------------------------------------------------------------------
-- ledger tables: read-only for members
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['sales_order','order_item','payment','stock_movement','purchase','purchase_line'] loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (private.is_member(business_id))',
      t || '_select', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- expenses
-- ---------------------------------------------------------------------------
create policy expense_select on public.expense for select to authenticated
  using (private.is_member(business_id));
create policy expense_insert on public.expense for insert to authenticated
  with check (private.is_member(business_id, array['owner', 'manager', 'kasir']) and created_by = (select auth.uid()));
create policy expense_modify on public.expense for update to authenticated
  using (private.is_member(business_id, array['owner', 'manager']))
  with check (private.is_member(business_id, array['owner', 'manager']));
create policy expense_delete on public.expense for delete to authenticated
  using (private.is_member(business_id, array['owner', 'manager']));

-- ---------------------------------------------------------------------------
-- audit & AI telemetry
-- ---------------------------------------------------------------------------
create policy audit_select on public.audit_log for select to authenticated
  using (private.is_member(business_id, array['owner', 'manager']));

create policy ai_event_insert on public.ai_event for insert to authenticated
  with check (user_id = (select auth.uid()) and (business_id is null or private.is_member(business_id)));
create policy ai_event_select on public.ai_event for select to authenticated
  using (private.is_member(business_id, array['owner', 'manager']));

-- ---------------------------------------------------------------------------
-- shared reference data
-- ---------------------------------------------------------------------------
create policy holiday_select on public.holiday_calendar for select to authenticated using (true);
