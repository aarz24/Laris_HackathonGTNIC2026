// RLS isolation test against the real Supabase project: tenant A must never see or write tenant B rows.
// Usage: npm run test:rls   (run `npm run db:seed` first)
import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient, DEMO_SLUG, ensureUser, requireEnv, TENANT_B_EMAIL, TENANT_B_SLUG, userClient } from "./lib.ts";

const TABLES = ["business", "outlet", "membership", "supplier", "inventory_item", "product", "product_variant", "recipe_line", "customer",
  "sales_order", "order_item", "payment", "stock_movement", "purchase", "purchase_line", "expense", "audit_log", "ai_event"];

async function signIn(email: string, password: string): Promise<SupabaseClient> {
  const client = userClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign in ${email}: ${error.message}`);
  return client;
}

async function businessId(admin: SupabaseClient, slug: string): Promise<string> {
  const { data, error } = await admin.from("business").select("id").eq("slug", slug).single();
  if (error || !data) throw new Error(`Bisnis ${slug} tidak ada. Jalankan npm run db:seed dulu.`);
  return data.id as string;
}

const admin = adminClient();
const tenantBPassword = randomUUID();
const ctx = (async () => {
  await ensureUser(admin, TENANT_B_EMAIL, tenantBPassword);
  return {
    a: await signIn(requireEnv("LARIS_DEMO_EMAIL"), requireEnv("LARIS_DEMO_PASSWORD")),
    b: await signIn(TENANT_B_EMAIL, tenantBPassword),
    aId: await businessId(admin, DEMO_SLUG),
    bId: await businessId(admin, TENANT_B_SLUG),
  };
})();

test("tenant A only sees its own business", async () => {
  const { a, aId } = await ctx;
  const { data, error } = await a.from("business").select("id");
  assert.ifError(error);
  assert.deepEqual(data?.map((row) => row.id), [aId]);
});

for (const table of TABLES) {
  test(`tenant A cannot read tenant B rows in ${table}`, async () => {
    const { a, bId } = await ctx;
    const column = table === "business" ? "id" : "business_id";
    const { data, error } = await a.from(table).select("*").eq(column, bId);
    assert.ifError(error);
    assert.equal(data?.length, 0, `${table} leaked ${data?.length} rows`);
  });
}

test("tenant B cannot read tenant A sales or customers", async () => {
  const { b, aId } = await ctx;
  for (const table of ["sales_order", "customer", "expense", "product"]) {
    const { data, error } = await b.from(table).select("id").eq("business_id", aId).limit(5);
    assert.ifError(error);
    assert.equal(data?.length, 0, `${table} leaked to tenant B`);
  }
});

test("ledger tables reject direct client writes", async () => {
  const { a, aId } = await ctx;
  const { data: outlet } = await a.from("outlet").select("id").eq("business_id", aId).single();
  const { error } = await a.from("sales_order").insert({ business_id: aId, outlet_id: outlet?.id, subtotal: 1, total: 1 });
  assert.ok(error, "direct insert into sales_order must fail");
});

test("tenant A cannot write into tenant B", async () => {
  const { a, bId } = await ctx;
  const { error: expenseError } = await a.from("expense").insert({ business_id: bId, description: "x", amount: 1000, created_by: (await a.auth.getUser()).data.user?.id });
  assert.ok(expenseError, "cross-tenant expense insert must fail");
  const { error: saleError } = await a.rpc("complete_sale", { p_business_id: bId, p_items: [{ code: "nasi-gudeg", quantity: 1 }], p_payment: "qris" });
  assert.ok(saleError, "cross-tenant complete_sale must fail");
  assert.match(saleError.message, /Akses ditolak/);
});

test("anonymous users see nothing", async () => {
  const anon = userClient();
  const { data } = await anon.from("sales_order").select("id").limit(1);
  assert.equal(data?.length ?? 0, 0);
});

test.after(async () => {
  const { a, b } = await ctx;
  await Promise.allSettled([a.auth.signOut(), b.auth.signOut()]);
});
