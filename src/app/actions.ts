"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { appOrigin } from "@/lib/app-url";
import { isCloudConfigured } from "@/lib/env";
import type { Customer, Expense, InventoryItem, Product, Purchase, Sale, StockMovement, TeamMember } from "@/lib/laris-data";
import {
  currentMembership, CUSTOMER_SELECT, EXPENSE_SELECT, loadCatalog, mapCustomer, mapExpense, mapMovement, mapPurchase, mapSale,
  MOVEMENT_SELECT, ORDER_SELECT, PURCHASE_SELECT, type Membership,
} from "@/lib/repo";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

const code = z.string().trim().toLowerCase().regex(/^[a-z0-9-]{1,80}$/, "Kode tidak valid.");
const rupiah = z.number().int().min(0).max(1_000_000_000_000);
const quantity = z.number().positive().max(10_000_000);

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
    return { ok: false, error: /fetch failed|network|ECONN/i.test(message) ? "Tidak bisa terhubung ke server. Periksa koneksi internet." : message };
  }
}

const saleInput = z.object({
  items: z.array(z.object({ productId: code, quantity: z.number().int().min(1).max(999), note: z.string().trim().max(200).optional() })).min(1).max(100),
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
      p_items: input.items.map((item) => ({ code: item.productId, quantity: item.quantity, note: item.note ?? null })),
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
        ? supabase.from("customer").select(CUSTOMER_SELECT).eq("business_id", membership.businessId).eq("phone", input.customerPhone.replace(/^\+/, "")).is("deleted_at", null).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (order.error) throw new Error(order.error.message);
    if (movements.error) throw new Error(movements.error.message);
    if (customer.error) throw new Error(customer.error.message);
    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- PostgREST embed typing
      sale: mapSale(order.data as any),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      stockMovements: (movements.data ?? []).map((movement) => mapMovement(movement as any)).filter((movement): movement is StockMovement => movement !== null),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      customer: customer.data ? mapCustomer(customer.data as any) : null,
    };
  });
}

const purchaseInput = z.object({
  lines: z.array(z.object({ itemId: code, quantity, total: rupiah.min(1) })).min(1).max(50),
  source: z.enum(["manual", "scan"]).default("manual"),
  idempotencyKey: z.string().min(8).max(100),
});

export async function recordPurchaseAction(raw: z.input<typeof purchaseInput>): Promise<ActionResult<{ purchases: Purchase[]; stockMovements: StockMovement[]; products: Product[]; inventory: InventoryItem[] }>> {
  return run(async () => {
    const input = purchaseInput.parse(raw);
    const { supabase, membership } = await context(["owner", "manager", "kasir"]);
    const { data: purchaseId, error } = await supabase.rpc("record_purchase", {
      p_business_id: membership.businessId,
      p_lines: input.lines.map((line) => ({ code: line.itemId, quantity: line.quantity, total: Math.round(line.total) })),
      p_source: input.source,
      p_idempotency_key: input.idempotencyKey,
    });
    if (error) throw new Error(error.message);
    const [lines, movements, catalog] = await Promise.all([
      supabase.from("purchase_line").select(PURCHASE_SELECT).eq("purchase_id", purchaseId),
      supabase.from("stock_movement").select(MOVEMENT_SELECT).eq("ref_id", purchaseId).eq("type", "purchase"),
      loadCatalog(supabase, membership.businessId),
    ]);
    if (lines.error) throw new Error(lines.error.message);
    if (movements.error) throw new Error(movements.error.message);
    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      purchases: (lines.data ?? []).map((line) => mapPurchase(line as any)).filter((purchase): purchase is Purchase => purchase !== null),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      stockMovements: (movements.data ?? []).map((movement) => mapMovement(movement as any)).filter((movement): movement is StockMovement => movement !== null),
      products: catalog.products,
      inventory: catalog.inventory,
    };
  });
}

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
    const phone = input.phone.replace(/^\+/, "");
    const { data, error } = await supabase.from("customer")
      .insert({ business_id: membership.businessId, name: input.name, phone })
      .select(CUSTOMER_SELECT).single();
    if (error?.code === "23505") {
      // The phone may belong to a soft-deleted profile (unique per business). Revive it instead of failing,
      // mirroring complete_sale which also restores deleted customers on checkout.
      const { data: revived, error: reviveError } = await supabase.from("customer")
        .update({ name: input.name, deleted_at: null })
        .eq("business_id", membership.businessId).eq("phone", phone).not("deleted_at", "is", null)
        .select(CUSTOMER_SELECT).maybeSingle();
      if (reviveError) throw new Error(reviveError.message);
      if (!revived) throw new Error("Nomor telepon ini sudah terdaftar.");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return mapCustomer(revived as any);
    }
    if (error) throw new Error(error.message);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return mapCustomer(data as any);
  });
}

const settingsInput = z.object({
  name: z.string().trim().min(1).max(80),
  owner: z.string().trim().min(1).max(80),
  outlet: z.string().trim().min(1).max(80),
  dayTarget: z.number().int().min(1).max(1_000_000_000_000),
  kind: z.enum(["coffee", "restaurant", "bakery", "bar", "other"]).optional(),
  taxRate: z.number().min(0).max(100).default(10),
  receiptFooter: z.string().trim().max(200).optional(),
});

export async function updateSettingsAction(raw: z.input<typeof settingsInput>): Promise<ActionResult<z.output<typeof settingsInput>>> {
  return run(async () => {
    const input = settingsInput.parse(raw);
    const { supabase, membership } = await context(["owner"]);
    const { data: current, error: currentError } = await supabase.from("business").select("settings").eq("id", membership.businessId).single();
    if (currentError) throw new Error(currentError.message);
    // Merge so keys written elsewhere (onboarding, future features) are preserved.
    const existing = (current?.settings && typeof current.settings === "object" ? current.settings : {}) as Record<string, unknown>;
    const { error } = await supabase.from("business").update({
      name: input.name, owner_name: input.owner, day_target: input.dayTarget,
      settings: {
        ...existing,
        ...(input.kind ? { kind: input.kind } : {}),
        taxRate: input.taxRate,
        receiptFooter: input.receiptFooter ?? "",
      },
    }).eq("id", membership.businessId);
    if (error) throw new Error(error.message);
    const { data: outlet, error: outletLookupError } = await supabase.from("outlet").select("id").eq("business_id", membership.businessId).is("deleted_at", null).order("created_at").limit(1).maybeSingle();
    if (outletLookupError) throw new Error(outletLookupError.message);
    if (outlet) {
      const { error: outletError } = await supabase.from("outlet").update({ name: input.outlet }).eq("id", outlet.id);
      if (outletError) throw new Error(outletError.message);
    }
    revalidatePath("/");
    return input;
  });
}

const productInput = z.object({
  code: code.nullable().optional(),
  name: z.string().trim().min(1, "Nama menu wajib diisi.").max(80),
  category: z.string().trim().min(1).max(40),
  price: rupiah,
  image: z.string().trim().max(1000).refine((value) => !value || /^\/images\/[a-z0-9-]+\.webp$/.test(value) || /^https:\/\/\S+$/i.test(value), "Gunakan tautan https yang valid atau unggah gambar menu."),
  active: z.boolean(),
  recipe: z.array(z.object({ itemId: code, quantity })).max(100),
});

export async function saveProductAction(raw: z.input<typeof productInput>): Promise<ActionResult<{ products: Product[]; inventory: InventoryItem[] }>> {
  return run(async () => {
    const input = productInput.parse(raw);
    const { supabase, membership } = await context(["owner", "manager"]);
    const { error } = await supabase.rpc("save_product", {
      p_business_id: membership.businessId, p_code: input.code || null, p_name: input.name, p_category: input.category,
      p_price: input.price, p_image_url: input.image, p_active: input.active,
      p_recipe: input.recipe.map((line) => ({ code: line.itemId, quantity: line.quantity })),
    });
    if (error) throw new Error(error.message);
    const catalog = await loadCatalog(supabase, membership.businessId);
    revalidatePath("/");
    return catalog;
  });
}

const MENU_IMAGE_BUCKET = "menu-images";
const MENU_IMAGE_EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

export async function uploadMenuImageAction(form: FormData): Promise<ActionResult<{ url: string }>> {
  return run(async () => {
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) throw new Error("Pilih berkas gambar terlebih dahulu.");
    const ext = MENU_IMAGE_EXT[file.type];
    if (!ext) throw new Error("Format gambar harus JPG, PNG, WebP, atau GIF.");
    if (file.size > 5 * 1024 * 1024) throw new Error("Ukuran gambar maksimal 5 MB.");
    const { membership } = await context(["owner", "manager"]);
    const admin = (() => {
      try { return createAdminClient(); }
      catch { throw new Error("Gagal mengunggah gambar. Pastikan SUPABASE_SERVICE_ROLE_KEY sudah dikonfigurasi di server."); }
    })();
    const path = `${membership.businessId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await admin.storage.from(MENU_IMAGE_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw new Error(error.message);
    const { data } = admin.storage.from(MENU_IMAGE_BUCKET).getPublicUrl(path);
    return { url: data.publicUrl };
  });
}

const inventoryInput = z.object({
  code: code.nullable().optional(),
  name: z.string().trim().min(1, "Nama bahan wajib diisi.").max(100),
  unit: z.string().trim().regex(/^[a-zA-Z][a-zA-Z0-9 ]{0,19}$/, "Satuan tidak valid."),
  cost: z.number().min(0).max(9_999_999_999),
  reorderPoint: z.number().min(0).max(1_000_000_000),
  supplier: z.string().trim().max(100),
  openingStock: z.number().min(0).max(1_000_000_000).default(0),
  countedStock: z.number().min(0).max(1_000_000_000).nullable().optional(),
});

export async function saveInventoryItemAction(raw: z.input<typeof inventoryInput>): Promise<ActionResult<{ products: Product[]; inventory: InventoryItem[]; movement: StockMovement | null }>> {
  return run(async () => {
    const input = inventoryInput.parse(raw);
    const { supabase, membership } = await context(["owner", "manager"]);
    const { data, error } = await supabase.rpc("save_inventory_item", {
      p_business_id: membership.businessId, p_code: input.code || null, p_name: input.name, p_base_unit: input.unit,
      p_avg_cost: input.cost, p_reorder_point: input.reorderPoint, p_supplier_name: input.supplier,
      p_opening_stock: input.openingStock, p_counted_stock: input.countedStock ?? null,
    });
    if (error) throw new Error(error.message);
    const result = z.object({ code: z.string(), movementId: z.string().uuid().nullable() }).parse(data);
    const [catalog, movement] = await Promise.all([
      loadCatalog(supabase, membership.businessId),
      result.movementId ? supabase.from("stock_movement").select(MOVEMENT_SELECT).eq("id", result.movementId).single() : Promise.resolve({ data: null, error: null }),
    ]);
    if (movement.error) throw new Error(movement.error.message);
    revalidatePath("/");
    return {
      ...catalog,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      movement: movement.data ? mapMovement(movement.data as any) : null,
    };
  });
}

const inviteInput = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  role: z.enum(["manager", "kasir", "dapur"]),
});
const invitedMember = z.object({
  userId: z.string().uuid(), email: z.string().email(), name: z.string(), role: z.enum(["owner", "manager", "kasir", "dapur"]), created: z.boolean(),
});

export async function inviteTeamMemberAction(raw: z.input<typeof inviteInput>): Promise<ActionResult<{ member: TeamMember; invited: boolean; alreadyMember: boolean }>> {
  return run(async () => {
    const input = inviteInput.parse(raw);
    const { supabase, membership } = await context(["owner"]);
    const { data: initialData, error } = await supabase.rpc("add_team_member_by_email", { p_business_id: membership.businessId, p_email: input.email, p_role: input.role });
    if (error) throw new Error(error.message);
    let data = initialData;
    let invited = false;
    if (!data) {
      const admin = (() => {
        try { return createAdminClient(); }
        catch { throw new Error("Undangan email belum dikonfigurasi. Minta anggota mendaftar lebih dulu, lalu tambahkan emailnya kembali."); }
      })();
      const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(input.email, {
        redirectTo: `${await appOrigin()}/auth/callback?next=/`, data: { full_name: input.email.split("@")[0] },
      });
      if (inviteError) throw new Error(inviteError.message);
      invited = true;
      const second = await supabase.rpc("add_team_member_by_email", { p_business_id: membership.businessId, p_email: input.email, p_role: input.role });
      data = second.data;
      if (second.error) throw new Error(second.error.message);
    }
    if (!data) throw new Error("Anggota belum dapat ditambahkan. Coba lagi.");
    const result = invitedMember.parse(data);
    revalidatePath("/");
    return {
      member: { id: result.userId, name: result.name, email: result.email, role: result.role },
      invited,
      alreadyMember: !result.created,
    };
  });
}

// ---------------------------------------------------------------------------
// Correction paths: soft deletes and edits (migration 0007)
// ---------------------------------------------------------------------------

/** The UI catalog identifies rows by code; resolve it to the row id the RPCs expect. */
async function resolveCatalogRowId(supabase: SupabaseClient, businessId: string, table: "product" | "inventory_item", codeValue: string): Promise<string> {
  const { data, error } = await supabase.from(table).select("id").eq("business_id", businessId).eq("code", codeValue).is("deleted_at", null).maybeSingle();
  if (error) throw new Error(error.message);
  const id = (data as { id: string } | null)?.id;
  if (!id) throw new Error(table === "product" ? "Menu tidak ditemukan." : "Bahan tidak ditemukan.");
  return id;
}

export async function deleteProductAction(raw: { code: string }): Promise<ActionResult<{ products: Product[]; inventory: InventoryItem[] }>> {
  return run(async () => {
    const input = z.object({ code }).parse(raw);
    const { supabase, membership } = await context(["owner", "manager"]);
    const productId = await resolveCatalogRowId(supabase, membership.businessId, "product", input.code);
    const { error } = await supabase.rpc("delete_product", { p_business_id: membership.businessId, p_product_id: productId });
    if (error) throw new Error(error.message);
    const catalog = await loadCatalog(supabase, membership.businessId);
    revalidatePath("/");
    return catalog;
  });
}

export async function deleteInventoryItemAction(raw: { code: string }): Promise<ActionResult<{ products: Product[]; inventory: InventoryItem[] }>> {
  return run(async () => {
    const input = z.object({ code }).parse(raw);
    const { supabase, membership } = await context(["owner", "manager"]);
    const itemId = await resolveCatalogRowId(supabase, membership.businessId, "inventory_item", input.code);
    const { error } = await supabase.rpc("delete_inventory_item", { p_business_id: membership.businessId, p_item_id: itemId });
    if (error) throw new Error(error.message);
    const catalog = await loadCatalog(supabase, membership.businessId);
    revalidatePath("/");
    return catalog;
  });
}

export async function deleteCustomerAction(raw: { id: string }): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const input = z.object({ id: z.string().uuid() }).parse(raw);
    const { supabase, membership } = await context(["owner", "manager"]);
    const { error } = await supabase.rpc("delete_customer", { p_business_id: membership.businessId, p_customer_id: input.id });
    if (error) throw new Error(error.message);
    return { id: input.id };
  });
}

export async function deleteExpenseAction(raw: { id: string }): Promise<ActionResult<{ id: string }>> {
  return run(async () => {
    const input = z.object({ id: z.string().uuid() }).parse(raw);
    const { supabase, membership } = await context(["owner", "manager"]);
    const { error } = await supabase.rpc("delete_expense", { p_business_id: membership.businessId, p_expense_id: input.id });
    if (error) throw new Error(error.message);
    return { id: input.id };
  });
}

export async function updateCustomerAction(raw: { id: string; name: string; phone: string }): Promise<ActionResult<Customer>> {
  return run(async () => {
    const input = z.object({ id: z.string().uuid(), ...customerInput.shape }).parse(raw);
    const { supabase, membership } = await context(["owner", "manager", "kasir"]);
    const { error } = await supabase.rpc("update_customer", {
      p_business_id: membership.businessId, p_customer_id: input.id, p_name: input.name, p_phone: input.phone,
    });
    if (error) throw new Error(error.message);
    const { data, error: fetchError } = await supabase.from("customer").select(CUSTOMER_SELECT).eq("id", input.id).is("deleted_at", null).single();
    if (fetchError) throw new Error(fetchError.message);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return mapCustomer(data as any);
  });
}

export async function removeTeamMemberAction(raw: { userId: string }): Promise<ActionResult<{ userId: string }>> {
  return run(async () => {
    const input = z.object({ userId: z.string().uuid() }).parse(raw);
    const { supabase, membership } = await context(["owner"]);
    const { error } = await supabase.rpc("remove_team_member", { p_business_id: membership.businessId, p_user_id: input.userId });
    if (error) throw new Error(error.message);
    revalidatePath("/");
    return { userId: input.userId };
  });
}

export async function updateTeamMemberRoleAction(raw: { userId: string; role: "manager" | "kasir" | "dapur" }): Promise<ActionResult<{ userId: string; role: "manager" | "kasir" | "dapur" }>> {
  return run(async () => {
    const input = z.object({ userId: z.string().uuid(), role: z.enum(["manager", "kasir", "dapur"]) }).parse(raw);
    const { supabase, membership } = await context(["owner"]);
    const { error } = await supabase.rpc("update_team_member_role", {
      p_business_id: membership.businessId, p_user_id: input.userId, p_new_role: input.role,
    });
    if (error) throw new Error(error.message);
    revalidatePath("/");
    return { userId: input.userId, role: input.role };
  });
}
