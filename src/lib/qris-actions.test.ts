import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import * as crypto from "node:crypto";
import ts from "typescript";
import { z } from "zod";
import * as qris from "./qris.ts";

// Execute the actual action bodies with framework/auth/storage boundaries mocked.
// Payload validation and HMAC signing are real; no credentials or live writes.
const source = ts.transpileModule(readFileSync(new URL("../app/qris-actions.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const id = "11111111-1111-4111-8111-111111111111";
const business = "22222222-2222-4222-8222-222222222222";
const user = "33333333-3333-4333-8333-333333333333";
const field = (tag: string, value: string) => tag + String(value.length).padStart(2, "0") + value;
const body = field("00", "01") + field("01", "11") + field("51", field("00", "ID.CO.QRIS.WWW") + field("02", "ID0000000000000")) + field("52", "5812") + field("53", "360") + field("58", "ID") + field("59", "LARIS TEST ONLY") + field("60", "JAKARTA") + "6304";
const payload = body + qris.qrisCrc(body);
const configuration = { id, merchant_name: "LARIS TEST ONLY", merchant_city: "JAKARTA", provider_label: "Fictional", qr_payload: payload, qr_image_data_url: "data:image/png;base64,iVBORw0KGgoAAAA=", enabled: true, created_at: "2026-11-05T00:00:00Z" };
function payment(status = "pending") {
  return { id, status, qris_snapshot: configuration, items_snapshot: [{ product_code: "coffee", name: "Kopi QA", unit_price: "25000", unit_cost: "250", quantity: "1", note: null }],
    total: "25000", subtotal: "25000", discount: "0", tax: "0", customer_name: null, customer_phone: null, payment_reference: status === "pending" ? null : "FICTIONAL-123", recording_error: null, order_id: status === "paid" ? id : null, created_at: "2026-11-05T00:00:00Z", confirmed_at: null };
}
function harness() {
  const state = { member: { businessId: business, userId: user, role: "owner" } as { businessId: string; userId: string; role: string } | null,
    now: Date.now(), rpcData: configuration as unknown, rpcError: null as null | { message: string }, readError: null as null | { message: string },
    rows: { qris_configuration: configuration, qris_payment_request: [payment()], sales_order: { id, customer_id: null }, stock_movement: [] } as Record<string, unknown>,
    calls: [] as { name: string; params: Record<string, unknown> }[], reads: [] as { table: string; filters: Record<string, unknown> }[], invalidations: 0 };
  const client = {
    rpc: async (name: string, params: Record<string, unknown>) => { state.calls.push({ name, params }); return { data: state.rpcData, error: state.rpcError }; },
    from: (table: string) => {
      const read = { table, filters: {} as Record<string, unknown> }; state.reads.push(read);
      const result = () => ({ data: state.rows[table] ?? null, error: state.readError });
      const builder = {
        select: () => builder, eq: (name: string, value: unknown) => { read.filters[name] = value; return builder; },
        in: (name: string, value: unknown) => { read.filters[name] = value; return builder; }, order: () => builder, limit: () => builder, returns: () => builder,
        maybeSingle: async () => result(), single: async () => result(), then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
      };
      return builder;
    },
  };
  const dependencies: Record<string, unknown> = {
    "node:crypto": crypto, "zod": { z }, "next/cache": { revalidatePath: () => { state.invalidations++; } },
    "@/lib/supabase/server": { createClient: async () => client },
    "@/lib/repo": { currentMembership: async () => state.member, ORDER_SELECT: "id", MOVEMENT_SELECT: "id", CUSTOMER_SELECT: "id", mapSale: (row: unknown) => row, mapMovement: (row: unknown) => row, mapCustomer: (row: unknown) => row },
    "@/lib/env": { serverEnv: () => ({ serviceRoleKey: "OFFLINE-TEST-KEY-NEVER-A-CREDENTIAL" }) },
    "@/lib/qris": qris,
    "@/lib/qris-image": { inspectQrisImage: async () => ({ ...qris.parseStaticQris(payload), imageDataUrl: "CANONICAL:" + payload }), renderQris: async (value: string) => "CANONICAL:" + value },
  };
  const vmModule = { exports: {} };
  class TestDate extends Date { static now() { return state.now; } }
  runInNewContext(source, { exports: vmModule.exports, module: vmModule, Buffer, File, Date: TestDate, Error, console,
    require: (name: string) => { if (!(name in dependencies)) throw new Error("Unexpected import " + name); return dependencies[name]; },
  });
  return { state, actions: vmModule.exports as typeof import("../app/qris-actions") };
}
const cart: qris.QrisCheckoutInput = { items: [{ productId: "coffee", quantity: 1 }], discount: 0, taxEnabled: false, channel: "Kasir", idempotencyKey: id };

test("QRIS actions reject missing sessions, kitchen roles and cashier configuration before database access", async () => {
  for (const member of [null, { businessId: business, userId: user, role: "dapur" }]) {
    const { actions, state } = harness(); state.member = member;
    assert.equal((await actions.loadQrisAction()).ok, false);
    assert.equal((await actions.prepareQrisAction(cart)).ok, false);
    assert.equal((await actions.confirmQrisAction({ id, reference: "FICTIONAL-123", confirmed: true })).ok, false);
    assert.equal(state.calls.length + state.reads.length, 0);
  }
  const { actions, state } = harness(); state.member!.role = "kasir";
  assert.equal((await actions.setQrisEnabledAction({ id, enabled: true })).ok, false);
  assert.equal((await actions.saveQrisAction({ validationToken: "tampered", providerLabel: "Fictional", ownershipConfirmed: true })).ok, false);
  assert.equal(state.calls.length, 0);
});

test("saved images cannot override merchant payload and nullable customer maps safely", async () => {
  const { actions, state } = harness();
  state.rows.qris_payment_request = Array.from({ length: 100 }, () => ({ ...payment(), items_snapshot: Array.from({ length: 100 }, () => payment().items_snapshot[0]) }));
  const result = await actions.loadQrisAction(); assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.configuration!.imageDataUrl, "CANONICAL:" + payload);
  assert.notEqual(result.data.configuration!.imageDataUrl, configuration.qr_image_data_url);
  assert.equal(result.data.requests[0].customerName, "Pelanggan umum");
  assert.equal(result.data.requests[0].total, 25000);
  assert.deepEqual(Object.keys(result.data.requests[0]).sort(), ["createdAt", "customerName", "id", "status", "total"]);
  assert.equal(result.data.requests.length, 100);
  assert.ok(JSON.stringify(result.data).length < 40_000, "List stays bounded without repeating large carts or QR images");
  assert.ok(state.reads.every(read => read.filters.business_id === business));
  state.rows.qris_configuration = { ...configuration, merchant_name: "DIFFERENT RECIPIENT" };
  assert.equal((await actions.loadQrisAction()).ok, false);
});

test("preview signatures bind payload to current owner, business and ten-minute expiry", async () => {
  const { actions, state } = harness();
  const form = new FormData(); form.set("file", new File(["FICTIONAL IMAGE"], "qris.png", { type: "image/png" }));
  const preview = await actions.inspectQrisImageAction(form); assert.equal(preview.ok, true);
  if (!preview.ok) return;
  const token = preview.data.validationToken;
  const save = (validationToken = token) => actions.saveQrisAction({ validationToken, providerLabel: "Fictional", ownershipConfirmed: true });
  assert.equal((await save(token + "x")).ok, false);
  assert.equal((await save(token + ".extra")).ok, false);
  state.member!.businessId = id; assert.equal((await save()).ok, false); state.member!.businessId = business;
  state.member!.userId = id; assert.equal((await save()).ok, false); state.member!.userId = user;
  state.now += 600_001; assert.equal((await save()).ok, false); state.now -= 600_001;
  assert.equal(state.calls.length, 0);
  assert.equal((await save()).ok, true);
  assert.equal(state.calls.length, 1); assert.equal(state.calls[0].params.p_business_id, business);
  assert.equal(state.calls[0].params.p_qr_payload, payload);
  assert.equal(state.calls[0].params.p_qr_image_data_url, "CANONICAL:" + payload);
});

test("prepare ignores client tenant/prices and sends only validated server-scoped input", async () => {
  const { actions, state } = harness(); state.rpcData = payment();
  const result = await actions.prepareQrisAction({ ...cart, businessId: id, total: 1, items: [{ ...cart.items[0], price: 1 }] } as unknown as qris.QrisCheckoutInput);
  assert.equal(result.ok, true); assert.equal(state.calls[0].params.p_business_id, business);
  assert.equal(state.calls[0].params.total, undefined);
  assert.equal(JSON.stringify(state.calls[0].params.p_items), '[{"code":"coffee","quantity":1,"note":null}]');
  for (const quantity of [0, -1, 0.5, 1000]) assert.equal((await actions.prepareQrisAction({ ...cart, items: [{ productId: "coffee", quantity }] })).ok, false);
  assert.equal(state.calls.length, 1);
});

test("fresh payment status is read-only, tenant-scoped and recovers existing paid receipt", async () => {
  const { actions, state } = harness(); state.rows.qris_payment_request = payment("paid");
  const result = await actions.getQrisRequestAction({ id }); assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.data.request.status, "paid"); assert.equal(result.data.saleResult!.sale.id, id);
  assert.equal(state.calls.length, 0); assert.equal(state.invalidations, 0);
  assert.ok(state.reads.every(read => read.filters.business_id === business));
  state.rows.qris_payment_request = null;
  assert.equal((await actions.getQrisRequestAction({ id })).ok, false);
});

test("received-but-unrecorded remains recoverable and requires explicit cashier attestation", async () => {
  const { actions, state } = harness(); state.rpcData = payment("received_unrecorded");
  assert.equal((await actions.confirmQrisAction({ id, reference: "FICTIONAL-123", confirmed: false } as never)).ok, false);
  assert.equal((await actions.cancelQrisAction({ id, noPaymentReceived: false } as never)).ok, false);
  assert.equal(state.calls.length, 0);
  const result = await actions.confirmQrisAction({ id, reference: "FICTIONAL-123", confirmed: true });
  assert.equal(result.ok, true);
  if (result.ok) { assert.equal(result.data.request.status, "received_unrecorded"); assert.equal(result.data.saleResult, undefined); }
  assert.equal(state.reads.length, 0);
});

test("lost connection and paid receipt read failure never invite a second payment", async () => {
  const { actions, state } = harness(); state.rpcError = { message: "fetch failed" };
  const result = await actions.prepareQrisAction(cart); assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /jangan meminta pelanggan membayar ulang/);
  state.rpcError = null; state.rpcData = payment("paid"); state.readError = { message: "unavailable" };
  const confirmed = await actions.confirmQrisAction({ id, reference: "FICTIONAL-123", confirmed: true });
  assert.equal(confirmed.ok, false); if (!confirmed.ok) assert.match(confirmed.error, /sudah tercatat.*jangan meminta pembayaran ulang/);
});
