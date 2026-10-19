// Seeds the "Kopi Senja" demo tenant + judge account, and a second tenant for RLS tests.
// Usage: npm run db:seed            (history ends today, Asia/Jakarta)
//        npm run db:seed -- 2026-10-18
// Re-running is safe: the demo businesses are deleted (cascade) and recreated.
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createInitialState, inventory, products } from "../src/lib/laris-data.ts";
import { adminClient, DEMO_SLUG, ensureUser, jakartaDate, requireEnv, TENANT_B_EMAIL, TENANT_B_SLUG } from "./lib.ts";

async function insertChunks(db: SupabaseClient, table: string, rows: Record<string, unknown>[], size = 500) {
  for (let i = 0; i < rows.length; i += size) {
    const { error } = await db.from(table).insert(rows.slice(i, i + size));
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

async function resetBusiness(db: SupabaseClient, slug: string) {
  const { data, error } = await db.from("business").select("id").eq("slug", slug).maybeSingle();
  if (error) throw new Error(`reset ${slug}: ${error.message}`);
  if (!data) return;
  // Children first: several FKs are ON DELETE RESTRICT, which can abort a single cascading delete.
  for (const table of ["order_item", "payment", "purchase_line", "stock_movement", "recipe_line", "sales_order", "purchase", "expense", "ai_event", "audit_log"]) {
    const { error: deleteError } = await db.from(table).delete().eq("business_id", data.id);
    if (deleteError) throw new Error(`reset ${table}: ${deleteError.message}`);
  }
  const { error: businessError } = await db.from("business").delete().eq("id", data.id);
  if (businessError) throw new Error(`reset ${slug}: ${businessError.message}`);
}

async function seedKopiSenja(db: SupabaseClient, ownerId: string, endDate: string) {
  const state = createInitialState(endDate);
  await resetBusiness(db, DEMO_SLUG);

  const businessId = randomUUID();
  const outletId = randomUUID();
  const { error: bErr } = await db.from("business").insert({
    id: businessId, name: state.business.name, slug: DEMO_SLUG, type: "fnb", owner_name: state.business.owner, day_target: state.dayTarget,
  });
  if (bErr) throw new Error(`business: ${bErr.message}`);
  await insertChunks(db, "outlet", [{ id: outletId, business_id: businessId, name: state.business.outlet, address: "Jl. Ir. H. Juanda, Dago, Bandung" }]);
  await insertChunks(db, "membership", [{ business_id: businessId, user_id: ownerId, role: "owner" }]);

  const supplierIds = new Map<string, string>();
  for (const name of new Set(inventory.map((item) => item.supplier))) supplierIds.set(name, randomUUID());
  await insertChunks(db, "supplier", [...supplierIds].map(([name, id]) => ({ id, business_id: businessId, name, lead_time_days: 1 })));

  const itemIds = new Map(inventory.map((item) => [item.id, randomUUID()]));
  await insertChunks(db, "inventory_item", inventory.map((item) => ({
    id: itemIds.get(item.id), business_id: businessId, code: item.id, name: item.name, base_unit: item.unit,
    avg_cost_per_unit: item.cost, reorder_point: item.reorderPoint, safety_stock: Math.round(item.reorderPoint / 2),
    supplier_id: supplierIds.get(item.supplier),
  })));

  const productIds = new Map(products.map((p) => [p.id, randomUUID()]));
  const variantIds = new Map(products.map((p) => [p.id, randomUUID()]));
  await insertChunks(db, "product", products.map((p) => ({
    id: productIds.get(p.id), business_id: businessId, code: p.id, name: p.name, category: p.category, image_url: p.image,
  })));
  await insertChunks(db, "product_variant", products.map((p) => ({
    id: variantIds.get(p.id), business_id: businessId, product_id: productIds.get(p.id), name: "Reguler", is_default: true, price: p.price, hpp_cached: p.cost,
  })));
  await insertChunks(db, "recipe_line", products.flatMap((p) => p.recipe.map((line) => ({
    business_id: businessId, variant_id: variantIds.get(p.id), inventory_item_id: itemIds.get(line.itemId), qty_base_unit: line.quantity,
  }))));

  // Opening balance = the demo's "current" stock. Like local mode, history is not deducted.
  const openingAt = `${endDate}T06:00:00+07:00`;
  await insertChunks(db, "stock_movement", inventory.map((item) => ({
    business_id: businessId, outlet_id: outletId, inventory_item_id: itemIds.get(item.id), type: "opening",
    qty_delta: item.openingStock, unit_cost: item.cost, created_by: ownerId, created_at: openingAt,
  })));

  const customerIds = new Map(state.customers.map((c) => [c.name, randomUUID()]));
  await insertChunks(db, "customer", state.customers.map((c) => ({
    id: customerIds.get(c.name), business_id: businessId, name: c.name, phone: c.phone, rfm_segment: c.segment,
    points_balance: c.points, visits: c.visits, total_spent: c.totalSpent, last_visit_at: c.lastVisit || null, marketing_consent: true,
  })));

  const orders: Record<string, unknown>[] = [];
  const items: Record<string, unknown>[] = [];
  const payments: Record<string, unknown>[] = [];
  const byCode = new Map(products.map((p) => [p.id, p]));
  for (const sale of state.sales) {
    const orderId = randomUUID();
    orders.push({
      id: orderId, business_id: businessId, outlet_id: outletId, customer_id: customerIds.get(sale.customerName) ?? null,
      customer_name: sale.customerName, channel: sale.channel.toLowerCase(), status: "paid", subtotal: sale.subtotal,
      discount: sale.discount, tax: sale.tax, total: sale.total, cash_received: sale.cashReceived, created_by: ownerId, created_at: sale.createdAt,
    });
    for (const line of sale.items) {
      const product = byCode.get(line.productId)!;
      items.push({
        business_id: businessId, order_id: orderId, variant_id: variantIds.get(line.productId), product_code: product.id,
        name: product.name, unit_price: product.price, unit_cost: product.cost, quantity: line.quantity, note: line.note ?? null,
      });
    }
    payments.push({ business_id: businessId, order_id: orderId, method: sale.payment.toLowerCase(), amount: sale.total, status: "paid", created_at: sale.createdAt });
  }
  await insertChunks(db, "sales_order", orders);
  await insertChunks(db, "order_item", items, 1000);
  await insertChunks(db, "payment", payments, 1000);

  await insertChunks(db, "expense", state.expenses.map((e) => ({
    business_id: businessId, description: e.description, category: e.category, amount: e.amount, spent_at: e.createdAt, created_by: ownerId, created_at: e.createdAt,
  })));

  return { businessId, sales: orders.length, items: items.length, expenses: state.expenses.length, customers: state.customers.length };
}

/** Tiny second tenant whose rows must never be visible to the judge account. */
async function seedTenantB(db: SupabaseClient, ownerId: string) {
  await resetBusiness(db, TENANT_B_SLUG);
  const businessId = randomUUID(), outletId = randomUUID(), itemId = randomUUID(), productId = randomUUID(), variantId = randomUUID(), orderId = randomUUID();
  const steps: [string, Record<string, unknown>[]][] = [
    ["business", [{ id: businessId, name: "Warung Bu Sri", slug: TENANT_B_SLUG, type: "fnb", owner_name: "Sri", day_target: 1000000 }]],
    ["outlet", [{ id: outletId, business_id: businessId, name: "Yogyakarta" }]],
    ["membership", [{ business_id: businessId, user_id: ownerId, role: "owner" }]],
    ["inventory_item", [{ id: itemId, business_id: businessId, code: "beras", name: "Beras", base_unit: "g", avg_cost_per_unit: 14 }]],
    ["product", [{ id: productId, business_id: businessId, code: "nasi-gudeg", name: "Nasi Gudeg", category: "Makanan" }]],
    ["product_variant", [{ id: variantId, business_id: businessId, product_id: productId, price: 18000, hpp_cached: 7000 }]],
    ["customer", [{ business_id: businessId, name: "Pelanggan Rahasia B", phone: "081299999999" }]],
    ["sales_order", [{ id: orderId, business_id: businessId, outlet_id: outletId, customer_name: "Pelanggan Rahasia B", subtotal: 18000, total: 18000, cash_received: 20000 }]],
    ["order_item", [{ business_id: businessId, order_id: orderId, variant_id: variantId, product_code: "nasi-gudeg", name: "Nasi Gudeg", unit_price: 18000, unit_cost: 7000, quantity: 1 }]],
    ["payment", [{ business_id: businessId, order_id: orderId, method: "tunai", amount: 18000 }]],
    ["expense", [{ business_id: businessId, description: "Pengeluaran rahasia B", amount: 50000, created_by: ownerId }]],
  ];
  for (const [table, rows] of steps) await insertChunks(db, table, rows);
  return businessId;
}

async function main() {
  const endDate = process.argv[2] ?? jakartaDate();
  const db = adminClient();
  const demoEmail = requireEnv("LARIS_DEMO_EMAIL");
  const demoPassword = requireEnv("LARIS_DEMO_PASSWORD");
  if (demoPassword.length < 8) throw new Error("LARIS_DEMO_PASSWORD minimal 8 karakter.");

  console.log(`Seeding Laris demo (history ends ${endDate})…`);
  const owner = await ensureUser(db, demoEmail, demoPassword, { full_name: "Raka (Juri)" });
  const tenantB = await ensureUser(db, TENANT_B_EMAIL, randomUUID(), { full_name: "Sri" });
  const result = await seedKopiSenja(db, owner, endDate);
  await seedTenantB(db, tenantB);
  console.log(`✔ Kopi Senja: ${result.sales} transaksi, ${result.items} item, ${result.customers} pelanggan, ${result.expenses} pengeluaran`);
  console.log(`✔ Tenant B (Warung Bu Sri) dibuat untuk uji RLS`);
  console.log(`✔ Akun juri: ${demoEmail}`);
}

main().catch((error: unknown) => {
  console.error("✖ Seed gagal:", error instanceof Error ? error.message : error);
  process.exit(1);
});
