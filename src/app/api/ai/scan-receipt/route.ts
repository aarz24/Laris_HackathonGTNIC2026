import { NextResponse, type NextRequest } from "next/server";
import { generateText, Output } from "ai";
import { z } from "zod";
import { aiErrorResponse, catalogContext, getGoogleModel, logAiTelemetry, requireAiContext, type AiContext } from "@/lib/ai";
import type { InventoryItem } from "@/lib/laris-data";
import { aiRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_BODY_BYTES = 12 * 1024 * 1024;
const imageMimes = ["image/jpeg", "image/png", "image/webp"] as const;
const modeSchema = z.enum(["local", "cloud"]);

const receiptSchema = z.object({
  supplierName: z.string().max(200).optional().describe("Nama toko atau supplier yang tercetak"),
  receiptDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Tanggal nota YYYY-MM-DD jika terbaca"),
  lines: z.array(z.object({
    rawName: z.string().min(1).max(200),
    matchedInventoryCode: z.string().max(120).nullable(),
    quantity: z.number().positive().max(1_000_000),
    unit: z.string().min(1).max(30),
    unitPrice: z.number().nonnegative().max(Number.MAX_SAFE_INTEGER),
    totalPrice: z.number().positive().max(Number.MAX_SAFE_INTEGER),
  })).max(100),
  totalReceipt: z.number().positive().max(Number.MAX_SAFE_INTEGER),
});

function normalizeQuantityAndUnit(item: InventoryItem, rawQty: number, rawUnit: string) {
  const unit = rawUnit.toLowerCase().trim();
  const baseUnit = item.unit.toLowerCase().trim();
  let factor: number | null = null;
  if (baseUnit === "g") {
    if (["g", "gr", "gram"].includes(unit)) factor = 1;
    if (["kg", "kilogram"].includes(unit)) factor = 1000;
  } else if (baseUnit === "ml") {
    if (unit === "ml") factor = 1;
    if (["l", "lt", "liter"].includes(unit)) factor = 1000;
  } else if (baseUnit === "pcs") {
    if (["pcs", "pc", "unit", "buah"].includes(unit)) factor = 1;
    if (["lusin", "doz", "dozen"].includes(unit)) factor = 12;
  } else if (unit === baseUnit) factor = 1;
  if (factor === null) return null;
  const quantity = rawQty * factor;
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1_000_000_000) return null;
  return { quantity, unit: item.unit };
}

function validReceiptDate(value: string | undefined) {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : undefined;
}

export async function POST(request: NextRequest) {
  const start = Date.now();
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) return NextResponse.json({ error: "Ukuran permintaan maksimal 12 MB." }, { status: 413 });

  let imageBase64 = "";
  let mimeType = "";
  let rawMode: unknown;
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      rawMode = formData.get("mode");
      const file = formData.get("file");
      if (file instanceof File) {
        if (file.size > MAX_IMAGE_BYTES) return NextResponse.json({ error: "Ukuran foto maksimal 8 MB." }, { status: 413 });
        if (!imageMimes.includes(file.type as typeof imageMimes[number])) return NextResponse.json({ error: "Gunakan foto nota berformat JPG, PNG, atau WebP." }, { status: 415 });
        const buffer = Buffer.from(await file.arrayBuffer());
        imageBase64 = buffer.toString("base64");
        mimeType = file.type;
      }
    } else {
      const body = z.object({
        mode: modeSchema,
        image: z.string().max(MAX_BODY_BYTES),
        mimeType: z.enum(imageMimes).optional(),
      }).parse(await request.json());
      rawMode = body.mode;
      const match = body.image.match(/^data:([^;]+);base64,/);
      imageBase64 = body.image.replace(/^data:[^;]+;base64,/, "");
      mimeType = match?.[1] ?? body.mimeType ?? "";
    }
  } catch {
    return NextResponse.json({ error: "Permintaan tidak valid. Periksa mode dan file gambar." }, { status: 400 });
  }

  const parsedMode = modeSchema.safeParse(rawMode);
  if (!parsedMode.success) return NextResponse.json({ error: "Mode workspace tidak valid." }, { status: 400 });
  if (!imageBase64) return NextResponse.json({ error: "File gambar nota wajib diunggah." }, { status: 400 });
  if (!imageMimes.includes(mimeType as typeof imageMimes[number])) return NextResponse.json({ error: "Gunakan foto nota berformat JPG, PNG, atau WebP." }, { status: 415 });
  const imageBytes = Buffer.from(imageBase64, "base64").byteLength;
  if (!imageBytes) return NextResponse.json({ error: "Gambar kosong atau tidak valid." }, { status: 400 });
  if (imageBytes > MAX_IMAGE_BYTES) return NextResponse.json({ error: "Ukuran foto maksimal 8 MB." }, { status: 413 });

  const limited = await aiRateLimit(request, "scan-receipt", parsedMode.data);
  if (limited) return limited;

  let context: AiContext;
  try {
    context = await requireAiContext(parsedMode.data, true);
  } catch (error) {
    return aiErrorResponse(error, "Workspace belum dapat dimuat. Coba lagi.");
  }
  const ingredients = context.state.inventory ?? [];
  if (!ingredients.length) return NextResponse.json({ error: "Tambahkan bahan baku sebelum memindai nota pembelian." }, { status: 422 });
  const inventoryMap = new Map(ingredients.map((item) => [item.id, item]));
  // Gemini only for authenticated cloud requests; local/demo mode always uses the mock OCR fallback.
  const googleSetup = context.allowGemini ? getGoogleModel() : null;

  if (!googleSetup) {
    if (context.mode === "cloud") return NextResponse.json({ error: "Pemindaian nota cloud membutuhkan GOOGLE_GENERATIVE_AI_API_KEY. Pembelian manual tetap tersedia." }, { status: 503 });
    const sampleItem = inventoryMap.get("milk") ?? ingredients[0];
    const quantity = ["g", "ml"].includes(sampleItem.unit.toLowerCase()) ? 1000 : 1;
    const newCost = Math.max(1, Math.round((sampleItem.cost || 10) * 1.08 * 100) / 100);
    const total = Math.round(newCost * quantity);
    const diffPercent = sampleItem.cost > 0 ? Math.round(((newCost - sampleItem.cost) / sampleItem.cost) * 100) : 100;
    return NextResponse.json({
      supplierName: "Supplier Simulasi Demo",
      receiptDate: context.today,
      lines: [{
        rawName: `${sampleItem.name} — data simulasi`,
        matchedCode: sampleItem.id,
        name: sampleItem.name,
        quantity,
        unit: sampleItem.unit,
        total,
        unitCost: newCost,
        oldCost: sampleItem.cost,
        priceHike: { oldPrice: sampleItem.cost, newPrice: newCost, diffPercent },
      }],
      total,
      source: "mock-ocr",
      notice: "Simulasi OCR demo lokal, bukan hasil pembacaan foto. OCR sungguhan tersedia di mode cloud setelah masuk.",
    });
  }

  try {
    const result = await generateText({
      model: googleSetup.model,
      output: Output.object({ schema: receiptSchema }),
      instructions: `Kamu adalah asisten pembelian untuk ${context.state.business.name}.
Baca foto struk, faktur, atau nota belanja. Ekstrak supplier, tanggal, setiap baris barang, kuantitas, satuan, harga satuan, dan total.

${catalogContext(context.state)}

Cocokkan baris belanja hanya dengan ID bahan baku yang tersedia pada katalog di atas.
Jangan membuat ID baru. Gunakan null jika barang bukan bahan baku workspace atau tidak yakin.
Pertahankan angka seperti pada nota dan jangan mengarang baris yang tidak terlihat.`,
      messages: [{
        role: "user",
        content: [
          { type: "file", data: imageBase64, mediaType: mimeType },
          { type: "text", text: `Baca nota ini dan petakan ke bahan baku resmi ${context.state.business.name}.` },
        ],
      }],
    });

    const parsed = result.output;
    const processedLines: Array<Record<string, unknown>> = [];
    const skippedLines: string[] = [];
    for (const line of parsed.lines) {
      const item = line.matchedInventoryCode ? inventoryMap.get(line.matchedInventoryCode) : undefined;
      if (!item) continue;
      const normalized = normalizeQuantityAndUnit(item, line.quantity, line.unit);
      if (!normalized) {
        skippedLines.push(line.rawName);
        continue;
      }
      const costPerBaseUnit = line.totalPrice / normalized.quantity;
      const diff = costPerBaseUnit - item.cost;
      const diffPercent = item.cost > 0 ? Math.round((diff / item.cost) * 100) : costPerBaseUnit > 0 ? 100 : 0;
      processedLines.push({
        rawName: line.rawName,
        matchedCode: item.id,
        name: item.name,
        quantity: normalized.quantity,
        unit: normalized.unit,
        total: Math.round(line.totalPrice),
        unitCost: Math.round(costPerBaseUnit * 100) / 100,
        oldCost: item.cost,
        priceHike: diffPercent > 3 ? { oldPrice: item.cost, newPrice: Math.round(costPerBaseUnit * 100) / 100, diffPercent } : undefined,
      });
    }

    await logAiTelemetry({
      businessId: context.businessId,
      feature: "scan-receipt",
      model: googleSetup.modelId,
      input: { imageMime: mimeType, imageBytes },
      output: { linesFound: processedLines.length, total: parsed.totalReceipt },
      latencyMs: Date.now() - start,
      ok: true,
    });
    return NextResponse.json({
      supplierName: parsed.supplierName || "Supplier",
      receiptDate: validReceiptDate(parsed.receiptDate),
      lines: processedLines,
      skippedLines,
      total: Math.round(parsed.totalReceipt),
      source: "gemini",
      model: googleSetup.modelId,
      ...(skippedLines.length ? { notice: `${skippedLines.length} baris dilewati karena satuan tidak dapat dikonversi dengan aman.` } : {}),
    });
  } catch (error) {
    await logAiTelemetry({
      businessId: context.businessId,
      feature: "scan-receipt",
      model: googleSetup.modelId,
      input: { imageMime: mimeType, imageBytes },
      output: { error: error instanceof Error ? error.message : String(error) },
      latencyMs: Date.now() - start,
      ok: false,
    });
    return NextResponse.json({ error: "Gagal memproses gambar nota. Pastikan gambar cukup terang dan terbaca, lalu coba lagi." }, { status: 502 });
  }
}
