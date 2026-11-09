import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";

// Real PostgreSQL SQL/transactions/RLS in WASM, with an isolated auth.uid stub.
// No Supabase credentials, network, real QRIS recipient or money is used.
test("manual QRIS PostgreSQL lifecycle and isolation", async t => {
  const db = new PGlite({ extensions: { pg_trgm } });
  t.after(() => db.close());
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to anon,authenticated,service_role;
    grant execute on function auth.uid() to anon,authenticated,service_role;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    alter default privileges in schema public grant all on tables to authenticated,service_role;
    alter default privileges in schema public grant all on sequences to authenticated,service_role;
  `);
  const directory = new URL("../supabase/migrations/", import.meta.url);
  for (const file of (await readdir(directory)).filter(file => /^[0-9]{4}_.*\.sql$/.test(file)).sort()) await db.exec(await readFile(new URL(file, directory), "utf8"));
  async function asUser<T>(id: string, operation: () => Promise<T>): Promise<T> {
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    await db.exec("set role authenticated");
    try { return await operation(); } finally { await db.exec("reset role"); }
  }
  const uid = () => crypto.randomUUID();
  const actors = { owner: uid(), manager: uid(), kasir: uid(), dapur: uid(), other: uid() };
  for (const id of Object.values(actors)) await db.query("insert into auth.users(id,email) values($1,$2)", [id, id + "@offline.invalid"]);
  const inventory = [{ code: "beans", name: "Biji QA", unit: "g", cost: 10, reorder_point: 100, opening_stock: 1000 }];
  const products = [{ code: "coffee", name: "Kopi QA", category: "Kopi", price: 25000, recipe: [{ code: "beans", quantity: 25 }] }];
  async function workspace(owner: string, slug: string) {
    return asUser(owner, async () => (await db.query<{ id: string }>("select public.create_workspace($1,$2,$3,$4,'coffee',100000,$5::jsonb,$6::jsonb) id", ["QRIS QA", slug, "QA Owner", "QA Outlet", JSON.stringify(inventory), JSON.stringify(products)])).rows[0].id);
  }
  const business = await workspace(actors.owner, "qris-offline-a"), other = await workspace(actors.other, "qris-offline-b");
  for (const role of ["manager", "kasir", "dapur"] as const) await db.query("insert into membership(business_id,user_id,role) values($1,$2,$3)", [business, actors[role], role]);
  type Row = { id: string; status: string; total: number; subtotal: number; tax: number; order_id: string | null; payment_reference: string | null; confirmed_by: string | null; confirmed_at: string | null; recording_error: string | null; qris_snapshot: { id: string }; items_snapshot: { unit_price: number; unit_cost: number }[] };
  const cart = [{ code: "coffee", quantity: 2 }];
  // SQL deliberately validates storage boundaries. Image/payload semantics are
  // tested separately by the actual upload decoder; this fixture cannot be paid.
  const png = "data:image/png;base64,iVBORw0KGgo" + "A".repeat(40);
  const setupArgs = [business, "OFFLINE QRIS", "JAKARTA", "Fixture", "OFFLINE-NONPAYABLE-PAYLOAD", png];
  async function setup(actor = actors.owner) { return asUser(actor, async () => (await db.query<{ value: { id: string } }>("select save_qris_configuration($1,$2,$3,$4,$5,$6) value", setupArgs)).rows[0].value); }
  async function prepare(key = uid(), options: { actor?: string; business?: string; cart?: unknown; discount?: number; tax?: boolean; phone?: string } = {}) {
    return asUser(options.actor ?? actors.kasir, async () => (await db.query<{ value: Row }>("select prepare_qris_payment($1,$2::jsonb,$3,$4,$5,null,$6) value", [options.business ?? business, JSON.stringify(options.cart ?? cart), key, options.discount ?? 0, options.tax ?? false, options.phone ?? null])).rows[0].value);
  }
  async function confirm(id: string, reference: string, confirmed = true, actor = actors.kasir) {
    return asUser(actor, async () => (await db.query<{ value: Row }>("select confirm_qris_payment($1,$2,$3,$4) value", [business, id, reference, confirmed])).rows[0].value);
  }
  async function cancel(id: string, noPayment = true, actor = actors.kasir) {
    return asUser(actor, async () => (await db.query<{ value: Row }>("select cancel_qris_payment($1,$2,$3) value", [business, id, noPayment])).rows[0].value);
  }
  async function ledger() {
    const rows: Record<string, unknown> = {};
    for (const table of ["sales_order", "order_item", "payment", "stock_movement", "customer"]) rows[table] = (await db.query(`select * from public.${table} where business_id=$1 order by id`, [business])).rows;
    return rows;
  }
  const base = await ledger();
  let configuration: { id: string }, first: Row;
  await t.test("only owner can configure; direct writes and cross-tenant reads are rejected", async () => {
    for (const actor of [actors.manager, actors.kasir, actors.dapur, actors.other]) await assert.rejects(setup(actor), /pemilik/);
    configuration = await setup();
    await assert.rejects(asUser(actors.owner, () => db.query("update qris_configuration set merchant_name='Hijacked' where business_id=$1", [business])), /permission denied/);
    assert.equal((await asUser(actors.other, () => db.query("select * from qris_configuration where business_id=$1", [business]))).rows.length, 0);
  });
  await t.test("prepare freezes totals without financial writes and rejects changed idempotent input", async () => {
    const key = uid(); first = await prepare(key, { tax: true, discount: 5000, phone: "000000000000" });
    assert.equal(first.status, "pending"); assert.equal(first.total, 49500); assert.equal(first.tax, 4500);
    assert.equal((await prepare(key, { tax: true, discount: 5000, phone: "000000000000" })).id, first.id);
    await assert.rejects(prepare(key, { discount: 1 }), /keranjang berbeda/);
    assert.deepEqual(await ledger(), base);
  });
  await t.test("roles, tenant scope and old direct-paid QRIS path cannot bypass manual confirmation", async () => {
    await assert.rejects(prepare(uid(), { actor: actors.dapur }), /Akses/);
    await assert.rejects(prepare(uid(), { actor: actors.other }), /Akses/);
    await assert.rejects(prepare(uid(), { business: other }), /Akses/);
    await assert.rejects(confirm(first.id, "QA-ROLE-1", true, actors.dapur), /Akses/);
    await assert.rejects(confirm(first.id, "QA-ROLE-1", true, actors.other), /Akses/);
    await assert.rejects(cancel(first.id, true, actors.other), /Akses/);
    assert.equal((await asUser(actors.dapur, () => db.query("select * from qris_payment_request"))).rows.length, 0);
    for (const payment of ["qris", "tunai"]) await assert.rejects(asUser(actors.kasir, () => db.query("select complete_sale($1,$2::jsonb,$3,999999,null,null,0,false,'kasir',$4)", [business, JSON.stringify(cart), payment, "qris:" + first.id])), /QRIS/);
    await assert.rejects(asUser(actors.owner, () => db.query("select private.complete_sale_legacy($1,$2::jsonb,'qris')", [business, JSON.stringify(cart)])), /permission denied/);
    await assert.rejects(asUser(actors.owner, () => db.query("update qris_payment_request set status='paid' where id=$1", [first.id])), /permission denied/);
    assert.deepEqual(await ledger(), base);
  });
  await t.test("manual attestation/reference required and original price recipe tax survive catalogue changes", async () => {
    await assert.rejects(confirm(first.id, "QA-FROZEN-1", false), /konfirmasi manual/);
    await assert.rejects(confirm(first.id, "x"), /referensi/);
    await db.query("update product_variant set price=99000,hpp_cached=990 where business_id=$1", [business]);
    await db.query("update recipe_line set qty_base_unit=200 where business_id=$1", [business]);
    await db.query("update business set settings=jsonb_build_object('taxRate',50) where id=$1", [business]);
    const saved = await confirm(first.id, " qa-frozen-1 ");
    assert.equal(saved.status, "paid"); assert.equal(saved.total, 49500); assert.equal(saved.payment_reference, "QA-FROZEN-1");
    assert.equal(saved.confirmed_by, actors.kasir);
    const item = (await db.query<{ unit_price: number; quantity: number; unit_cost: number }>("select unit_price,quantity,unit_cost from order_item where order_id=$1", [saved.order_id])).rows[0];
    assert.deepEqual(item, { unit_price: 25000, quantity: 2, unit_cost: 250 });
    const delta = (await db.query<{ delta: string }>("select sum(qty_delta)::text delta from stock_movement where ref_id=$1", [saved.order_id])).rows[0].delta;
    assert.equal(Number(delta), -50);
    const after = await ledger(); assert.equal((await confirm(first.id, "QA-FROZEN-1")).order_id, saved.order_id); assert.deepEqual(await ledger(), after);
    await assert.rejects(confirm(first.id, "QA-DIFFERENT"), /Referensi berbeda/);
    await assert.rejects(cancel(first.id), /Dana telah/);
    await db.query("update product_variant set price=25000,hpp_cached=250 where business_id=$1", [business]);
    await db.query("update recipe_line set qty_base_unit=25 where business_id=$1", [business]);
    await db.query("update business set settings=jsonb_build_object('taxRate',10) where id=$1", [business]);
  });
  await t.test("one payment reference cannot credit two orders", async () => {
    const request = await prepare(); const before = await ledger();
    await assert.rejects(confirm(request.id, "QA-FROZEN-1"), /sudah dipakai/);
    assert.deepEqual(await ledger(), before);
    assert.equal((await cancel(request.id)).status, "cancelled");
  });
  await t.test("pending cancellation is explicit and repeat-safe; cancelled cannot become paid", async () => {
    const request = await prepare(); const before = await ledger();
    await assert.rejects(cancel(request.id, false), /Pastikan/);
    assert.equal((await cancel(request.id)).status, "cancelled");
    assert.equal((await cancel(request.id)).status, "cancelled");
    await assert.rejects(confirm(request.id, "QA-CANCEL-1"), /dibatalkan/);
    assert.deepEqual(await ledger(), before);
  });
  await t.test("stock contention preserves paid evidence and resumes exactly once after restock", async () => {
    const request = await prepare();
    await db.query("insert into stock_movement(business_id,outlet_id,inventory_item_id,type,qty_delta,unit_cost) select business_id,outlet_id,inventory_item_id,'adjustment',-sum(qty_delta),10 from stock_movement where business_id=$1 group by business_id,outlet_id,inventory_item_id", [business]);
    const before = await ledger(); const deferred = await confirm(request.id, "QA-RECOVER-1");
    assert.equal(deferred.status, "received_unrecorded"); assert.equal(deferred.payment_reference, "QA-RECOVER-1"); assert.ok(deferred.recording_error); assert.equal(deferred.order_id, null);
    assert.deepEqual(await ledger(), before);
    await assert.rejects(cancel(request.id), /Dana telah/);
    await db.query("insert into stock_movement(business_id,outlet_id,inventory_item_id,type,qty_delta,unit_cost) select $1,o.id,i.id,'adjustment',1000,10 from outlet o join inventory_item i on i.business_id=o.business_id where o.business_id=$1", [business]);
    const recovered = await confirm(request.id, "QA-RECOVER-1", true, actors.manager);
    assert.equal(recovered.status, "paid"); assert.equal(recovered.confirmed_by, actors.kasir); assert.equal(recovered.recording_error, null);
    const after = await ledger(); await confirm(request.id, "QA-RECOVER-1"); assert.deepEqual(await ledger(), after);
  });
  await t.test("manager can recover a confirmed payment after the original cashier account is deleted", async () => {
    const formerCashier = uid();
    await db.query("insert into auth.users(id,email) values($1,$2)", [formerCashier, formerCashier + "@offline.invalid"]);
    await db.query("insert into membership(business_id,user_id,role) values($1,$2,'kasir')", [business, formerCashier]);
    const request = await prepare(uid(), { actor: formerCashier });
    await db.query("insert into stock_movement(business_id,outlet_id,inventory_item_id,type,qty_delta,unit_cost) select business_id,outlet_id,inventory_item_id,'adjustment',-sum(qty_delta),10 from stock_movement where business_id=$1 group by business_id,outlet_id,inventory_item_id", [business]);
    const before = await ledger();
    const deferred = await confirm(request.id, "QA-DELETED-CASHIER-1", true, formerCashier);
    assert.equal(deferred.status, "received_unrecorded");
    assert.equal(deferred.confirmed_by, formerCashier); assert.ok(deferred.confirmed_at);
    assert.equal(deferred.order_id, null); assert.deepEqual(await ledger(), before);

    await db.query("delete from auth.users where id=$1", [formerCashier]);
    assert.equal((await db.query("select id from auth.users where id=$1", [formerCashier])).rows.length, 0);
    assert.equal((await db.query("select user_id from membership where user_id=$1", [formerCashier])).rows.length, 0);
    await db.query("insert into stock_movement(business_id,outlet_id,inventory_item_id,type,qty_delta,unit_cost) select $1,o.id,i.id,'adjustment',1000,10 from outlet o join inventory_item i on i.business_id=o.business_id where o.business_id=$1", [business]);
    const recovered = await confirm(request.id, "QA-DELETED-CASHIER-1", true, actors.manager);
    assert.equal(recovered.status, "paid"); assert.equal(recovered.recording_error, null);
    assert.equal(recovered.confirmed_by, formerCashier);
    assert.equal(recovered.confirmed_at, deferred.confirmed_at);
    assert.equal(recovered.payment_reference, "QA-DELETED-CASHIER-1");
    const sale = (await db.query<{ created_by: string; receipt_time_preserved: boolean }>("select created_by,created_at=$2::timestamptz receipt_time_preserved from sales_order where id=$1", [recovered.order_id, deferred.confirmed_at])).rows[0];
    assert.deepEqual(sale, { created_by: actors.manager, receipt_time_preserved: true });
    const movements = (await db.query<{ created_by: string; qty_delta: string }>("select created_by,qty_delta::text from stock_movement where ref_id=$1 and type='sale'", [recovered.order_id])).rows;
    assert.deepEqual(movements, [{ created_by: actors.manager, qty_delta: "-50.000" }]);
    const after = await ledger();
    assert.equal((await confirm(request.id, "QA-DELETED-CASHIER-1", true, actors.owner)).order_id, recovered.order_id);
    assert.deepEqual(await ledger(), after);
  });
  await t.test("recording failure rolls back all financial writes while preserving receipt attestation", async () => {
    const request = await prepare(uid(), { phone: "000000000001" }); const before = await ledger();
    await db.exec("create function private.qa_reject_payment() returns trigger language plpgsql as $$begin raise exception 'QA forced recording failure';end$$; create trigger qa_payment_fail before insert on payment for each row execute function private.qa_reject_payment();");
    try { const failed = await confirm(request.id, "QA-ROLLBACK-1"); assert.equal(failed.status, "received_unrecorded"); assert.equal(failed.order_id, null); assert.deepEqual(await ledger(), before); }
    finally { await db.exec("drop trigger qa_payment_fail on payment; drop function private.qa_reject_payment();"); }
    assert.equal((await confirm(request.id, "QA-ROLLBACK-1")).status, "paid");
  });
  await t.test("QR replacement/disable affects new requests and preserves historical recipient", async () => {
    const request = await prepare(); const oldId = request.qris_snapshot.id;
    configuration = await setup(); assert.notEqual(configuration.id, oldId);
    await asUser(actors.owner, () => db.query("select set_qris_configuration_enabled($1,$2,false)", [business, configuration.id]));
    await assert.rejects(prepare(), /belum aktif/);
    const paid = await confirm(request.id, "QA-OLD-QR-1"); assert.equal(paid.status, "paid"); assert.equal(paid.qris_snapshot.id, oldId);
    await asUser(actors.owner, () => db.query("select set_qris_configuration_enabled($1,$2,true)", [business, configuration.id]));
  });
  await t.test("invalid cart/amount rejected and immutable snapshots cannot be altered", async () => {
    for (const quantity of [0, -1, 1.5, 1000]) await assert.rejects(prepare(uid(), { cart: [{ code: "coffee", quantity }] }), /Jumlah/);
    await assert.rejects(prepare(uid(), { discount: 50001 }), /Diskon/);
    await assert.rejects(prepare(uid(), { discount: 50000 }), /Total QRIS/);
    await assert.rejects(prepare(uid(), { cart: [{ code: "coffee", quantity: 999 }] }), /Total QRIS/);
    await assert.rejects(db.query("update qris_payment_request set total=1 where id=$1", [first.id]), /Snapshot/);
    await assert.rejects(db.query("update qris_configuration set merchant_name='Other' where id=$1", [configuration.id]), /Versi QRIS/);
  });
  await t.test("cash and transfer retain the existing checkout behavior", async () => {
    for (const payment of ["tunai", "transfer"]) {
      const row = await asUser(actors.kasir, async () => (await db.query<{ id: string }>("select complete_sale($1,$2::jsonb,$3,50000,null,null,0,false,'kasir',$4) id", [business, JSON.stringify(cart), payment, uid()])).rows[0]);
      assert.ok(row.id);
    }
  });
  await t.test("unresolved request cap prevents hiding recovery records", async () => {
    for (let i = 0; i < 100; i++) await prepare();
    await assert.rejects(prepare(), /100 permintaan/);
  });
});
