import type { Customer, Sale, StockMovement } from "./laris-data";

export interface QrisConfig {
  id: string; merchantName: string; merchantCity: string; providerLabel: string;
  imageDataUrl: string; enabled: boolean; createdAt: string;
}
export interface QrisCheckoutInput {
  items: { productId: string; quantity: number; note?: string }[];
  discount: number; taxEnabled: boolean; customerName?: string; customerPhone?: string;
  channel: "Kasir" | "Etalase"; idempotencyKey: string;
}
export interface QrisRequest {
  id: string; status: "pending" | "received_unrecorded" | "paid" | "cancelled";
  configuration: QrisConfig; total: number; subtotal: number; discount: number; tax: number;
  items: { productId: string; name: string; quantity: number; unitPrice: number; unitCost: number; note?: string }[];
  customerName: string; customerPhone?: string; paymentReference?: string; recordingError?: string;
  orderId?: string; createdAt: string; confirmedAt?: string;
}
export interface QrisSaleResult { sale: Sale; stockMovements: StockMovement[]; customer: Customer | null }
export type QrisRequestSummary = Pick<QrisRequest, "id" | "status" | "total" | "customerName" | "createdAt">;
export interface QrisImagePreview {
  merchantName: string; merchantCity: string; imageDataUrl: string; payload: string; validationToken: string;
}

/** EMV MPM CRC16/CCITT-FALSE, including the final 6304 field header. */
export function qrisCrc(value: string): string {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(value)) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit++) crc = ((crc & 0x8000) ? (crc << 1) ^ 0x1021 : crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function fields(payload: string): Map<string, string> {
  const result = new Map<string, string>();
  for (let offset = 0; offset < payload.length;) {
    const tag = payload.slice(offset, offset + 2), lengthText = payload.slice(offset + 2, offset + 4);
    if (!/^\d{2}$/.test(tag) || !/^\d{2}$/.test(lengthText)) throw new Error("Struktur QRIS tidak valid.");
    const length = Number(lengthText), end = offset + 4 + length;
    if (!length || end > payload.length || result.has(tag)) throw new Error("Struktur QRIS tidak valid atau memuat kolom ganda.");
    result.set(tag, payload.slice(offset + 4, end)); offset = end;
  }
  return result;
}

/** Structural validation only; does not prove merchant ownership, activation or payment. */
export function parseStaticQris(payload: string): { merchantName: string; merchantCity: string; payload: string } {
  if (typeof payload !== "string" || payload.length < 50 || payload.length > 4096 || /[^\x20-\x7e]/.test(payload)) {
    throw new Error("Gunakan QRIS merchant statis yang diterbitkan penyedia pembayaran.");
  }
  if (!payload.startsWith("000201") || !/6304[\dA-F]{4}$/i.test(payload) || qrisCrc(payload.slice(0, -4)) !== payload.slice(-4).toUpperCase()) {
    throw new Error("Checksum QRIS tidak valid. Unduh ulang QRIS asli dari aplikasi merchant.");
  }
  const data = fields(payload);
  if (data.get("00") !== "01" || Array.from(data.keys()).at(-1) !== "63") throw new Error("Format QRIS tidak didukung.");
  if (data.has("01") && data.get("01") !== "11") throw new Error("QRIS sekali pakai/dinamis tidak dapat disimpan. Gunakan QRIS statis toko.");
  if (data.has("54") || data.has("55") || data.has("56") || data.has("57")) throw new Error("Gunakan QRIS statis tanpa nominal tetap atau biaya tambahan.");
  if (data.get("53") !== "360" || data.get("58") !== "ID") throw new Error("Gunakan QRIS Indonesia dengan mata uang Rupiah.");
  if (!/^\d{4}$/.test(data.get("52") ?? "")) throw new Error("Kategori merchant QRIS tidak valid.");
  const qrisAccount = data.get("51");
  if (!qrisAccount || fields(qrisAccount).get("00") !== "ID.CO.QRIS.WWW") throw new Error("Kode ini bukan QRIS merchant Indonesia yang didukung.");
  const merchantName = data.get("59")?.trim(), merchantCity = data.get("60")?.trim();
  if (!merchantName || merchantName.length > 25 || !merchantCity || merchantCity.length > 15) throw new Error("Nama atau kota merchant pada QRIS tidak valid.");
  return { merchantName, merchantCity, payload };
}
