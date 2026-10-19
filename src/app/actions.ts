"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isCloudConfigured } from "@/lib/env";
import { products, inventory, type Customer, type Expense, type Purchase, type Sale, type StockMovement } from "@/lib/laris-data";
import {
  currentMembership, CUSTOMER_SELECT, EXPENSE_SELECT, mapCustomer, mapExpense, mapMovement, mapPurchase, mapSale,
  MOVEMENT_SELECT, ORDER_SELECT, PURCHASE_SELECT, type Membership,
} from "@/lib/repo";
import { createClient } from "@/lib/supabase/server";

// Errors are returned as values: thrown errors are masked by Next.js in production builds.
export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

const productCode = z.enum(products.map((p) => p.id) as [string, ...string[]]);
const inventoryCode = z.enum(inventory.map((i) => i.id) as [string, ...string[]]);
const rupiah = z.number().int().min(0).max(1_000_000_000_000);

async function context(roles?: Membership["role"][]) {
  if (!isCloudConfigured) throw new Error("Mode cloud belum dikonfigurasi.");
  const supabase = await createClient();
  const membership = await currentMembership(supabase);
  if (!membership) throw new Error("Sesi berakhir. Silakan masuk kembali.");
  if (roles && !roles.includes(membership.role)) throw new Error("Peranmu tidak memiliki akses untuk tindakan ini.");
  return { supabase, membership };
}

async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    if (error instanceof z.ZodError) return { ok: false, error: error.issues[0]?.message ?? "Data tidak valid." };
    const message = error instanceof Error ? error.message : "Terjadi kesalahan. Coba lagi.";
    // Network failures surface as TypeError("fetch failed"): give the cashier something actionable.
    return { ok: false, error: /fetch failed|network|ECONN/i.test(message) ? "Tidak bisa terhubung ke server. Periksa koneksi internet." : message };
  }
}

// ---------------------------------------------------------------------------
// Sales
// ---------------------------------------------------------------------------
const saleInput = z.object({
  items: z.array(z.object({ productId: productCode, quantity: z.number().int().min(1).max(999), note: z.string().trim().max(200).optional() })).min(1).max(100),
  payment: z.enum(["Tunai", "QRIS", "Transfer"]),
  cashReceived: rupiah,
  customerName: z.string().trim().max(80).optional(),
  customerPhone: z.string().trim().regex(/^\+?\d{8,15}$/, "Nomor telepon harus terdiri dari 8–15 digit, boleh diawali +.").optional(),
  discount: rupiah.default(0),
  taxEnabled: z.boolean().default(false),
  channel: z.enum(["Kasir", "Etalase"]).default("Kasir"),
  idempotencyKey: z.string().min(8).max(100),
});

export async function completeSaleAction(raw: z.input<typeof saleInput>): Promise<ActionResult<{ sale: Sale; stockMovements: StockMovement[]; customer: Customer | null }>> {
  return run(async () => {
    const input = saleInput.parse(raw);
    const { supabase, membership } = await context(["owner", "manager", "kasir"]);
    const { data: orderId, error } = await supabase.rpc("complete_sale", {
      p_business_id: membership.businessId,
      p_items: input.items.map((i) => ({ code: i.productId, quantity: i.quantity, note: i.note ?? null })),
      p_payment: input.payment.toLowerCase(),
      p_cash_received: input.cashReceived,
      p_customer_name: input.customerName || null,
      p_customer_phone: input.customerPhone || null,
      p_discount: input.discount,
      p_tax_enabled: input.taxEnabled,
      p_channel: input.channel.toLowerCase(),
      p_idempotency_key: input.idempotencyKey,
    });
    if (error) throw new Error(error.message);

    const [order, movements, customer] = await Promise.all([
      supabase.from("sales_order").select(ORDER_SELECT).eq("id", orderId).single(),
      supabase.from("stock_movement").select(MOVEMENT_SELECT).eq("ref_id", orderId).eq("type", "sale"),
      input.customerPhone
        ? supabase.from("customer").select(CUSTOMER_SELECT).eq("business_id", membership.businessId).eq("phone", input.customerPhone.replace(/^\+/, "")).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (order.error) throw new Error(order.error.message);
    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- PostgREST embed typing
      sale: mapSale(order.data as any),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      stockMovements: (movements.data ?? []).map((m) => mapMovement(m as any)).filter((m): m is StockMovement => m !== null),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      customer: customer.data ? mapCustomer(customer.data as any) : null,
    };
  });
}

// ---------------------------------------------------------------------------
// Purchases
// ---------------------------------------------------------------------------
const purchaseInput = z.object({
  lines: z.array(z.object({ itemId: inventoryCode, quantity: z.number().positive().max(10_000_000), total: rupiah.min(1) })).min(1).max(50),
  source: z.enum(["manual", "scan"]).default("manual"),
});

export async function recordPurchaseAction(raw: z.input<typeof purchaseInput>): Promise<ActionResult<{ purchases: Purchase[]; stockMovements: StockMovement[] }>> {
  return run(async () => {
    const input = purchaseInput.parse(raw);
    const { supabase, membership } = await context(["owner", "manager", "kasir"]);
    const { data: purchaseId, error } = await supabase.rpc("record_purchase", {
      p_business_id: membership.businessId,
      p_lines: input.lines.map((l) => ({ code: l.itemId, quantity: l.quantity, total: Math.round(l.total) })),
      p_source: input.source,
    });
    if (error) throw new Error(error.message);
    const [lines, movements] = await Promise.all([
      supabase.from("purchase_line").select(PURCHASE_SELECT).eq("purchase_id", purchaseId),
      supabase.from("stock_movement").select(MOVEMENT_SELECT).eq("ref_id", purchaseId).eq("type", "purchase"),
    ]);
    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      purchases: (lines.data ?? []).map((l) => mapPurchase(l as any)).filter((p): p is Purchase => p !== null),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      stockMovements: (movements.data ?? []).map((m) => mapMovement(m as any)).filter((m): m is StockMovement => m !== null),
    };
  });
}

// ---------------------------------------------------------------------------
// Expenses, customers, settings
// ---------------------------------------------------------------------------
const expenseInput = z.object({
  description: z.string().trim().min(1, "Isi keperluan pengeluaran.").max(150),
  category: z.string().trim().min(1).max(40),
  amount: z.number().int().min(1, "Jumlah harus lebih dari nol.").max(1_000_000_000_000),
});

export async function addExpenseAction(raw: z.input<typeof expenseInput>): Promise<ActionResult<Expense>> {
  return run(async () => {
    const input = expenseInput.parse(raw);
    const { supabase, membership } = await context(["owner", "manager", "kasir"]);
    const { data: claims } = await supabase.auth.getClaims();
    const { data, error } = await supabase.from("expense")
      .insert({ business_id: membership.businessId, ...input, created_by: claims?.claims?.sub })
      .select(EXPENSE_SELECT).single();
    if (error) throw new Error(error.message);
    return mapExpense(data);
  });
}

const customerInput = z.object({
  name: z.string().trim().min(1, "Isi nama pelanggan.").max(80),
  phone: z.string().trim().regex(/^\+?\d{8,15}$/, "Nomor telepon harus terdiri dari 8–15 digit, boleh diawali +."),
});

export async function addCustomerAction(raw: z.input<typeof customerInput>): Promise<ActionResult<Customer>> {
  return run(async () => {
    const input = customerInput.parse(raw);
    const { supabase, membership } = await context(["owner", "manager", "kasir"]);
    const { data, error } = await supabase.from("customer")
      .insert({ business_id: membership.businessId, name: input.name, phone: input.phone.replace(/^\+/, "") })
      .select(CUSTOMER_SELECT).single();
    if (error) throw new Error(error.code === "23505" ? "Nomor telepon ini sudah terdaftar." : error.message);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return mapCustomer(data as any);
  });
}

const settingsInput = z.object({
  name: z.string().trim().min(1).max(80),
  owner: z.string().trim().min(1).max(80),
  outlet: z.string().trim().min(1).max(80),
  dayTarget: z.number().int().min(1).max(1_000_000_000_000),
});

export async function updateSettingsAction(raw: z.input<typeof settingsInput>): Promise<ActionResult<z.output<typeof settingsInput>>> {
  return run(async () => {
    const input = settingsInput.parse(raw);
    const { supabase, membership } = await context(["owner"]);
    const { error } = await supabase.from("business").update({ name: input.name, owner_name: input.owner, day_target: input.dayTarget }).eq("id", membership.businessId);
    if (error) throw new Error(error.message);
    const { data: outlet } = await supabase.from("outlet").select("id").eq("business_id", membership.businessId).is("deleted_at", null).order("created_at").limit(1).maybeSingle();
    if (outlet) {
      const { error: outletError } = await supabase.from("outlet").update({ name: input.outlet }).eq("id", outlet.id);
      if (outletError) throw new Error(outletError.message);
    }
    revalidatePath("/");
    return input;
  });
}
