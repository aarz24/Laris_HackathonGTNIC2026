import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEMO_STORAGE_KEY, findGuideFeatures, getReceiptActions, getTourFeatures, guideFeatures, guideStorageKey, resetDemoSession } from "./laris-guide.ts";
import { completeSale, createInitialState } from "./laris-data.ts";
import { createRequestSlot } from "./ai-request.ts";

test("guide covers all workspace pages with unique IDs and instructions", () => {
  assert.equal(new Set(guideFeatures.map(feature => feature.id)).size, guideFeatures.length);
  assert.deepEqual([...new Set(guideFeatures.map(feature => feature.view))].sort(), ["overview", "pos", "transactions", "products", "inventory", "purchases", "customers", "storefront", "finance", "team"].sort());
  for (const feature of guideFeatures) {
    assert.ok(feature.title && feature.description && feature.location);
    assert.ok(feature.steps.length >= 3);
  }
});

test("every tour target is attached to the real app UI", () => {
  const source = readFileSync(new URL("../components/laris-app.tsx", import.meta.url), "utf8");
  for (const feature of [...guideFeatures, ...getTourFeatures("owner", "local")]) assert.ok(source.includes(`data-tour="${feature.target}"`), `${feature.id}: missing target ${feature.target}`);
});

test("guide search handles casing, punctuation, whitespace, and everyday questions", () => {
  for (const [query, id] of [["  STOK   OPNAME! ", "stock-count"], ["di mana cetak struk?", "transactions"], ["cara undang tim", "team"], ["where do I export csv", "export"], ["pajak", "settings"], ["mikrofon", "voice"], ["nota", "purchases"]]) {
    assert.ok(findGuideFeatures(query).some(feature => feature.id === id), query);
  }
});

test("empty searches show the directory and unmatched searches return no results", () => {
  assert.deepEqual(findGuideFeatures(""), guideFeatures);
  assert.deepEqual(findGuideFeatures("   "), guideFeatures);
  assert.deepEqual(findGuideFeatures("fiturxyz999"), []);
  assert.deepEqual(findGuideFeatures("pajak fiturxyz999"), []);
});

test("tour sequences follow responsibilities and always use existing guide entries", () => {
  for (const role of ["owner", "manager", "kasir", "dapur"] as const) {
    const features = getTourFeatures(role);
    assert.equal(features[0].id, "overview");
    assert.equal(new Set(features.map(feature => feature.id)).size, features.length);
    assert.ok(features.every(feature => guideFeatures.includes(feature)));
  }
  assert.ok(getTourFeatures("owner").findIndex(feature => feature.id === "inventory") < getTourFeatures("owner").findIndex(feature => feature.id === "pos"));
  assert.ok(getTourFeatures("kasir").some(feature => feature.id === "voice"));
  assert.ok(!getTourFeatures("dapur").some(feature => ["pos", "voice", "purchases", "finance", "team"].includes(feature.id)));
});

test("welcome preference is separated by mode, account, and workspace without email addresses", () => {
  assert.equal(guideStorageKey("local"), "laris-guide-v1:demo");
  const keys = [guideStorageKey("local", "user-a", "shop-a"), guideStorageKey("cloud", "user-a", "shop-a"), guideStorageKey("cloud", "user-b", "shop-a"), guideStorageKey("cloud", "user-a", "shop-b")];
  assert.equal(new Set(keys).size, keys.length);
});

test("demo tour previews the sale-to-impact path without opening a checkout or account dialog", () => {
  const demo = getTourFeatures("owner", "local");
  assert.deepEqual(demo.map(feature => feature.view), ["overview", "pos", "pos", "inventory", "customers", "finance"]);
  assert.equal(new Set(demo.map(feature => feature.id)).size, demo.length);
  assert.ok(demo.every(feature => !feature.dialog && feature.steps.length));
  assert.match(demo.find(feature => feature.id === "demo-pos")!.description, /ketik|tertulis/i);
  assert.match(demo.find(feature => feature.id === "demo-pos")!.description, /bukan Gemini/);
  assert.match(demo.find(feature => feature.id === "demo-checkout")!.steps[0], /Tidak perlu melakukan checkout/);
  assert.deepEqual(getTourFeatures("owner", "cloud"), getTourFeatures("owner"));
  assert.ok(!getTourFeatures("owner", "cloud").some(feature => feature.id.startsWith("demo-")));
});

test("confirmed demo reset restores fresh sample data and removes only demo storage", () => {
  const initial = createInitialState();
  const edited = completeSale(initial, { items: [{ productId: "americano", quantity: 1 }], payment: "QRIS", cashReceived: 100000 });
  const accountKey = guideStorageKey("cloud", "owner", "business");
  const otherAccountKey = guideStorageKey("cloud", "cashier", "other-business");
  const entries = new Map([
    [DEMO_STORAGE_KEY, JSON.stringify(edited.state)], [guideStorageKey("local"), "seen"],
    [accountKey, "seen"], [otherAccountKey, "seen"], ["auth-session", "unchanged"], ["unrelated", "keep"],
  ]);
  const order: string[] = [];
  const slot = createRequestSlot();
  const pending = slot.begin();
  const result = resetDemoSession("local", true, {
    storage: { removeItem: key => { order.push(key); entries.delete(key); } },
    cancelPending: () => { order.push("cancel"); slot.cancel(); },
    createFreshState: () => { order.push("fresh"); return createInitialState(); },
  });
  assert.deepEqual(order, ["cancel", "fresh", DEMO_STORAGE_KEY, guideStorageKey("local")]);
  assert.equal(pending.canCommit(), false);
  assert.equal(pending.signal.aborted, true);
  assert.equal(result?.storageCleared, true);
  assert.deepEqual(result?.state, initial);
  assert.notEqual(result?.state, initial);
  assert.equal(edited.state.sales.length, initial.sales.length + 1);
  assert.deepEqual([...entries], [[accountKey, "seen"], [otherAccountKey, "seen"], ["auth-session", "unchanged"], ["unrelated", "keep"]]);
});

test("canceling reset or requesting it in cloud has no effects", () => {
  for (const [mode, confirmed] of [["local", false], ["cloud", true], ["cloud", false]] as const) {
    const forbidden = () => { assert.fail("A canceled or cloud reset must not touch state, requests, or storage"); };
    assert.equal(resetDemoSession(mode, confirmed, { storage: { removeItem: forbidden }, cancelPending: forbidden, createFreshState: forbidden }), null);
  }
});

test("blocked demo storage still permits a fresh session and attempts both demo keys", () => {
  const removed: string[] = [];
  const result = resetDemoSession("local", true, {
    storage: { removeItem: key => { removed.push(key); throw new Error("Storage blocked"); } },
    cancelPending: () => {}, createFreshState: () => ({ sample: true }),
  });
  assert.deepEqual(removed, [DEMO_STORAGE_KEY, guideStorageKey("local")]);
  assert.deepEqual(result, { state: { sample: true }, storageCleared: false });
});

test("receipt actions link only the actual checkout customer and use their current phone", () => {
  const customers = [{ id: "customer-a", phone: "08123456789" }, { id: "customer-b", phone: "08987654321" }];
  const actions = getReceiptActions("sale-a", { saleId: "sale-a", customerId: "customer-b" }, customers);
  assert.deepEqual(actions.map(action => action.view), ["inventory", "customers", "finance"]);
  assert.equal(actions[1].query, "08987654321");
  assert.deepEqual(customers[1], { id: "customer-b", phone: "08987654321" });
  for (const link of [null, { saleId: "old-sale", customerId: "customer-a" }, { saleId: "sale-a", customerId: "deleted" }]) {
    assert.deepEqual(getReceiptActions("sale-a", link, customers).map(action => action.view), ["inventory", "finance"]);
  }
  assert.ok(!getReceiptActions("sale-a", { saleId: "sale-a", customerId: "customer-a" }, []).some(action => action.view === "customers"));
});

test("guide explains existing limitations rather than promising live integrations", () => {
  assert.match(guideFeatures.find(feature => feature.id === "pos")!.note!, /simulasi/);
  assert.match(guideFeatures.find(feature => feature.id === "storefront")!.note!, /bukan tautan publik/);
  assert.match(guideFeatures.find(feature => feature.id === "forecast")!.note!, /bukan prediksi AI/);
  assert.match(guideFeatures.find(feature => feature.id === "export")!.steps.join(" "), /seluruh transaksi/);
});
