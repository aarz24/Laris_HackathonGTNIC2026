-- Keep QRIS recovery possible after the original confirming account is deleted.
-- The request retains its immutable confirmed_by/confirmed_at receipt evidence.
-- The sale, stock movement, and recording audit attribute completion to the live
-- authorized actor performing this transaction. sales_order.created_by references
-- auth.users, so reusing a deleted historical confirmer would block every retry.
-- CREATE OR REPLACE preserves the function's existing execution grants.

begin;

create or replace function public.confirm_qris_payment(p_business_id uuid, p_request_id uuid, p_reference text, p_manual_confirmed boolean)
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
      'qris:' || v_request.id::text, v_uid, v_request.confirmed_at)
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

commit;

