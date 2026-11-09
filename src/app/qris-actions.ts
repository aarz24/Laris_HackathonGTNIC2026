"use server";

import { createHmac, timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { currentMembership, CUSTOMER_SELECT, MOVEMENT_SELECT, ORDER_SELECT, mapCustomer, mapMovement, mapSale } from "@/lib/repo";
import { serverEnv } from "@/lib/env";
import { parseStaticQris, type QrisConfig, type QrisRequest, type QrisRequestSummary, type QrisCheckoutInput, type QrisImagePreview, type QrisSaleResult } from "@/lib/qris";
import { inspectQrisImage, renderQris } from "@/lib/qris-image";
import type { ActionResult } from "@/app/actions";

async function access(ownerOnly = false) {
  const client = await createClient();
  const member = await currentMembership(client);
  if (!member) throw new Error("Sesi berakhir. Silakan masuk kembali.");
  if (ownerOnly ? member.role !== "owner" : !["owner", "manager", "kasir"].includes(member.role)) throw new Error("Peranmu tidak memiliki akses pembayaran QRIS.");
  return { client, member };
}

async function attempt<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try { return { ok: true, data: await fn() }; }
  catch (error) {
    if (error instanceof z.ZodError) return { ok: false, error: error.issues[0]?.message ?? "Data pembayaran tidak valid." };
    const message = error instanceof Error ? error.message : "Pembayaran belum dapat diproses.";
    if (/schema cache|does not exist|could not find.*function/i.test(message)) return { ok: false, error: "Fitur QRIS belum diaktifkan di server. Hubungi pengelola Laris." };
    return { ok: false, error: /fetch failed|network|ECONN/i.test(message) ? "Koneksi terputus. Muat ulang daftar pembayaran sebelum mencoba lagi; jangan meminta pelanggan membayar ulang." : message };
  }
}

const dbConfig = z.object({ id: z.string().uuid(), merchant_name: z.string(), merchant_city: z.string(), provider_label: z.string(), qr_payload: z.string(), qr_image_data_url: z.string(), enabled: z.boolean().optional(), created_at: z.string().optional() });
async function config(value: unknown): Promise<QrisConfig> {
  const row = dbConfig.parse(value);
  const decoded = parseStaticQris(row.qr_payload);
  if (decoded.merchantName !== row.merchant_name || decoded.merchantCity !== row.merchant_city || !/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(row.qr_image_data_url) || row.qr_image_data_url.length > 300_000) throw new Error("Konfigurasi QRIS tidak valid. Minta owner mengunggah ulang QRIS.");
  // RPC callers can provide arbitrary stored PNGs. Always derive the displayed
  // code from the validated payload used for the merchant labels.
  return { id: row.id, merchantName: decoded.merchantName, merchantCity: decoded.merchantCity, providerLabel: row.provider_label, imageDataUrl: await renderQris(decoded.payload), enabled: row.enabled ?? true, createdAt: row.created_at ?? "" };
}
const dbRequest = z.object({
  id: z.string().uuid(), status: z.enum(["pending", "received_unrecorded", "paid", "cancelled"]), qris_snapshot: dbConfig,
  items_snapshot: z.array(z.object({ product_code: z.string(), name: z.string(), unit_price: z.coerce.number(), unit_cost: z.coerce.number(), quantity: z.coerce.number(), note: z.string().nullable().optional() })),
  total: z.coerce.number(), subtotal: z.coerce.number(), discount: z.coerce.number(), tax: z.coerce.number(), customer_name: z.string().nullable(), customer_phone: z.string().nullable(),
  payment_reference: z.string().nullable(), recording_error: z.string().nullable(), order_id: z.string().uuid().nullable(), created_at: z.string(), confirmed_at: z.string().nullable(),
});
async function request(value: unknown): Promise<QrisRequest> {
  const row = dbRequest.parse(value);
  return { id: row.id, status: row.status, configuration: await config(row.qris_snapshot), total: row.total, subtotal: row.subtotal, discount: row.discount, tax: row.tax,
    items: row.items_snapshot.map(item => ({ productId: item.product_code, name: item.name, unitPrice: item.unit_price, unitCost: item.unit_cost, quantity: item.quantity, ...(item.note ? { note: item.note } : {}) })),
    customerName: row.customer_name ?? "Pelanggan umum", customerPhone: row.customer_phone ?? undefined, paymentReference: row.payment_reference ?? undefined,
    recordingError: row.recording_error ?? undefined, orderId: row.order_id ?? undefined, createdAt: row.created_at, confirmedAt: row.confirmed_at ?? undefined };
}

function signingKey() {
  const key = serverEnv().serviceRoleKey;
  if (!key) throw new Error("Unggah QRIS belum tersedia. Hubungi pengelola Laris.");
  return key;
}
function sign(value: string) { return createHmac("sha256", signingKey()).update("laris:qris-preview:v1:" + value).digest("base64url"); }

export async function loadQrisAction(): Promise<ActionResult<{ configuration: QrisConfig | null; requests: QrisRequestSummary[] }>> {
  return attempt(async () => {
    const { client, member } = await access();
    const [setup, pending] = await Promise.all([
      client.from("qris_configuration").select("*").eq("business_id", member.businessId).order("enabled", { ascending: false }).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      client.from("qris_payment_request").select("id,status,total,customer_name,created_at").eq("business_id", member.businessId).in("status", ["pending", "received_unrecorded"]).order("created_at", { ascending: false }).limit(100),
    ]);
    if (setup.error) throw new Error(setup.error.message);
    if (pending.error) throw new Error(pending.error.message);
    // List summaries stay small even for 100 large carts. Fetch one frozen QR
    // and its item details only when opened, avoiding hosting response limits.
    const summaries = (pending.data ?? []).map(value => {
      const row = dbRequest.pick({ id: true, status: true, total: true, customer_name: true, created_at: true }).parse(value);
      return { id: row.id, status: row.status, total: row.total, customerName: row.customer_name ?? "Pelanggan umum", createdAt: row.created_at };
    });
    return { configuration: setup.data ? await config(setup.data) : null, requests: summaries };
  });
}

export async function inspectQrisImageAction(form: FormData): Promise<ActionResult<QrisImagePreview>> {
  return attempt(async () => {
    const { member } = await access(true);
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("Pilih gambar QRIS merchant.");
    if (file.size > 3 * 1024 * 1024) throw new Error("Ukuran gambar QRIS maksimal 3 MB.");
    const preview = await inspectQrisImage(new Uint8Array(await file.arrayBuffer()), file.type);
    const value = Buffer.from(JSON.stringify({ businessId: member.businessId, userId: member.userId, payload: preview.payload, expiresAt: Date.now() + 10 * 60_000 })).toString("base64url");
    return { ...preview, validationToken: value + "." + sign(value) };
  });
}

export async function saveQrisAction(raw: { validationToken: string; providerLabel: string; ownershipConfirmed: true }): Promise<ActionResult<QrisConfig>> {
  return attempt(async () => {
    const input = z.object({ validationToken: z.string().max(12_000), providerLabel: z.string().trim().min(2, "Isi nama bank atau penyedia QRIS.").max(80), ownershipConfirmed: z.literal(true, "Konfirmasi bahwa QRIS ini milik toko Anda.") }).parse(raw);
    const { client, member } = await access(true);
    const [value, signature, extra] = input.validationToken.split(".");
    const expected = Buffer.from(sign(value ?? "")), actual = Buffer.from(signature ?? "");
    if (!value || extra || expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new Error("Pratinjau QRIS tidak valid. Unggah ulang gambar.");
    const preview = z.object({ businessId: z.string(), userId: z.string(), payload: z.string(), expiresAt: z.number() }).parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
    if (preview.businessId !== member.businessId || preview.userId !== member.userId || preview.expiresAt < Date.now()) throw new Error("Pratinjau QRIS kedaluwarsa atau berasal dari sesi lain. Unggah ulang.");
    const parsed = parseStaticQris(preview.payload);
    const image = await renderQris(parsed.payload);
    const { data, error } = await client.rpc("save_qris_configuration", { p_business_id: member.businessId, p_merchant_name: parsed.merchantName, p_merchant_city: parsed.merchantCity, p_provider_label: input.providerLabel, p_qr_payload: parsed.payload, p_qr_image_data_url: image, p_enabled: true });
    if (error) throw new Error(error.message);
    revalidatePath("/"); return config(data);
  });
}

export async function setQrisEnabledAction(raw: { id: string; enabled: boolean }): Promise<ActionResult<QrisConfig>> {
  return attempt(async () => {
    const input = z.object({ id: z.string().uuid(), enabled: z.boolean() }).parse(raw);
    const { client, member } = await access(true);
    const { data, error } = await client.rpc("set_qris_configuration_enabled", { p_business_id: member.businessId, p_configuration_id: input.id, p_enabled: input.enabled });
    if (error) throw new Error(error.message);
    revalidatePath("/"); return config(data);
  });
}

export async function prepareQrisAction(raw: QrisCheckoutInput): Promise<ActionResult<QrisRequest>> {
  return attempt(async () => {
    const input = z.object({ items: z.array(z.object({ productId: z.string().regex(/^[a-z0-9-]{1,80}$/), quantity: z.number().int().min(1).max(999), note: z.string().trim().max(200).optional() })).min(1).max(100), discount: z.number().int().min(0).max(1_000_000_000_000), taxEnabled: z.boolean(), customerName: z.string().trim().max(80).optional(), customerPhone: z.string().regex(/^\+?\d{8,15}$/).optional(), channel: z.enum(["Kasir", "Etalase"]), idempotencyKey: z.string().uuid() }).parse(raw);
    const { client, member } = await access();
    const { data, error } = await client.rpc("prepare_qris_payment", { p_business_id: member.businessId, p_items: input.items.map(item => ({ code: item.productId, quantity: item.quantity, note: item.note ?? null })), p_idempotency_key: input.idempotencyKey, p_discount: input.discount, p_tax_enabled: input.taxEnabled, p_customer_name: input.customerName || null, p_customer_phone: input.customerPhone || null, p_channel: input.channel.toLowerCase() });
    if (error) throw new Error(error.message);
    return request(data);
  });
}

async function paymentResult(payment: QrisRequest, { client, member }: Awaited<ReturnType<typeof access>>): Promise<{ request: QrisRequest; saleResult?: QrisSaleResult }> {
    if (payment.status !== "paid" || !payment.orderId) return { request: payment };
    const [order, movements] = await Promise.all([
      client.from("sales_order").select(ORDER_SELECT + ",customer_id").eq("business_id", member.businessId).eq("id", payment.orderId).returns<(Parameters<typeof mapSale>[0] & { customer_id: string | null })[]>().single(),
      client.from("stock_movement").select(MOVEMENT_SELECT).eq("business_id", member.businessId).eq("ref_id", payment.orderId).eq("type", "sale").returns<Parameters<typeof mapMovement>[0][]>(),
    ]);
    if (order.error) throw new Error("Pembayaran sudah tercatat. Muat ulang untuk membuka struk; jangan meminta pembayaran ulang.");
    if (movements.error) throw new Error("Pembayaran sudah tercatat. Muat ulang untuk menyegarkan stok.");
    const customer = order.data.customer_id ? await client.from("customer").select(CUSTOMER_SELECT).eq("business_id", member.businessId).eq("id", order.data.customer_id).maybeSingle() : { data: null, error: null };
    if (customer.error) throw new Error("Pembayaran sudah tercatat. Muat ulang untuk menyegarkan data pelanggan.");
    const saleResult: QrisSaleResult = { sale: mapSale(order.data), stockMovements: (movements.data ?? []).map(row => mapMovement(row)).filter(row => row !== null), customer: customer.data ? mapCustomer(customer.data) : null };
    return { request: payment, saleResult };
}

export async function getQrisRequestAction(raw: { id: string }): Promise<ActionResult<{ request: QrisRequest; saleResult?: QrisSaleResult }>> {
  return attempt(async () => {
    const input = z.object({ id: z.string().uuid() }).parse(raw);
    const context = await access();
    const { data, error } = await context.client.from("qris_payment_request").select("*").eq("business_id", context.member.businessId).eq("id", input.id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Permintaan pembayaran tidak ditemukan di usaha ini.");
    return paymentResult(await request(data), context);
  });
}

export async function confirmQrisAction(raw: { id: string; reference: string; confirmed: true }): Promise<ActionResult<{ request: QrisRequest; saleResult?: QrisSaleResult }>> {
  return attempt(async () => {
    const input = z.object({ id: z.string().uuid(), reference: z.string().trim().min(6, "Isi nomor referensi dari aplikasi merchant (minimal 6 karakter).").max(100), confirmed: z.literal(true, "Periksa pembayaran masuk di aplikasi merchant terlebih dahulu.") }).parse(raw);
    const context = await access();
    const { data, error } = await context.client.rpc("confirm_qris_payment", { p_business_id: context.member.businessId, p_request_id: input.id, p_reference: input.reference, p_manual_confirmed: true });
    if (error) throw new Error(error.message);
    const result = await paymentResult(await request(data), context);
    revalidatePath("/");
    return result;
  });
}

export async function cancelQrisAction(raw: { id: string; noPaymentReceived: true }): Promise<ActionResult<QrisRequest>> {
  return attempt(async () => {
    const input = z.object({ id: z.string().uuid(), noPaymentReceived: z.literal(true, "Pastikan belum ada pembayaran masuk.") }).parse(raw);
    const { client, member } = await access();
    const { data, error } = await client.rpc("cancel_qris_payment", { p_business_id: member.businessId, p_request_id: input.id, p_no_payment_received: true });
    if (error) throw new Error(error.message);
    return request(data);
  });
}
