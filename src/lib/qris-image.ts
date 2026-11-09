import sharp from "sharp";
import jsQR from "jsqr";
import QRCode from "qrcode";
import { parseStaticQris } from "./qris.ts";
import { MAX_UPLOAD_BYTES } from "./upload-limits.ts";

// Server-side only: no uploaded image or recipient data is sent to an AI service.
export async function inspectQrisImage(bytes: Uint8Array, mime: string) {
  if (!bytes.length || bytes.length > MAX_UPLOAD_BYTES) throw new Error("Ukuran gambar QRIS maksimal 3 MB.");
  const expected = new Map([["image/png", "png"], ["image/jpeg", "jpeg"], ["image/webp", "webp"]]).get(mime);
  if (!expected) throw new Error("Unggah QRIS dalam format PNG, JPG, atau WebP.");
  const image = sharp(bytes, { limitInputPixels: 12_000_000, animated: false, failOn: "warning" });
  const metadata = await image.metadata().catch(() => { throw new Error("Gambar QRIS rusak atau tidak dapat dibaca."); });
  if (metadata.format !== expected || (metadata.pages ?? 1) > 1) throw new Error("Gunakan gambar QRIS statis yang sesuai format berkasnya.");
  const { data, info } = await image.rotate().resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true }).toColourspace("srgb").ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixels = new Uint8ClampedArray(data);
  const code = jsQR(pixels, info.width, info.height, { inversionAttempts: "attemptBoth" });
  if (!code) throw new Error("Kode QR tidak terbaca. Unggah hasil unduhan QRIS asli atau potong gambar agar kode terlihat jelas.");
  const parsed = parseStaticQris(code.data);
  const corners = [code.location.topLeftCorner, code.location.topRightCorner, code.location.bottomLeftCorner, code.location.bottomRightCorner];
  const x0 = Math.max(0, Math.floor(Math.min(...corners.map(p => p.x))) - 8), x1 = Math.min(info.width, Math.ceil(Math.max(...corners.map(p => p.x))) + 8);
  const y0 = Math.max(0, Math.floor(Math.min(...corners.map(p => p.y))) - 8), y1 = Math.min(info.height, Math.ceil(Math.max(...corners.map(p => p.y))) + 8);
  for (let y = y0; y < y1; y++) pixels.fill(255, (y * info.width + x0) * 4, (y * info.width + x1) * 4);
  if (jsQR(pixels, info.width, info.height, { inversionAttempts: "attemptBoth" })) throw new Error("Gambar berisi lebih dari satu QR. Unggah hanya QRIS toko yang ingin digunakan.");
  return { ...parsed, imageDataUrl: await renderQris(parsed.payload) };
}

const rendered = new Map<string, Promise<string>>();

export async function renderQris(payload: string): Promise<string> {
  parseStaticQris(payload);
  // Re-encode the unchanged payload; never add an amount or change the recipient.
  const cached = rendered.get(payload);
  if (cached) return cached;
  if (rendered.size >= 16) rendered.delete(rendered.keys().next().value!);
  const image = QRCode.toDataURL(payload, { type: "image/png", errorCorrectionLevel: "M", width: 768, margin: 4 });
  rendered.set(payload, image);
  try { return await image; }
  catch (error) { if (rendered.get(payload) === image) rendered.delete(payload); throw error; }
}
