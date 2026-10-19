import { NextResponse, type NextRequest } from "next/server";
import { generateText, Output } from "ai";
import { z } from "zod";
import { CATALOG_CONTEXT, getGoogleModel, logAiTelemetry } from "@/lib/ai";
import { parseOrder, products } from "@/lib/laris-data";

export const dynamic = "force-dynamic";

const orderSchema = z.object({
  items: z.array(
    z.object({
      productId: z.string().describe("ID produk yang cocok persis dari katalog (contoh: kopi-susu, americano, matcha)"),
      quantity: z.number().int().min(1).describe("Jumlah porsi (angka bulat positif)"),
      note: z.string().optional().describe("Catatan kustomisasi seperti less sugar, no ice, dsb"),
    })
  ),
  payment: z.enum(["Tunai", "QRIS", "Transfer"]).describe("Metode pembayaran terdeteksi, default Tunai"),
  unknown: z.array(z.string()).describe("Kata atau frasa pesanan yang tidak dikenali atau tidak ada di katalog"),
});

const validProductIds = new Set(products.map((p) => p.id));

export async function POST(request: NextRequest) {
  const start = Date.now();
  let text = "";
  let audioBase64: string | undefined;
  let audioMime: string = "audio/webm";

  try {
    const body = await request.json();
    text = typeof body.text === "string" ? body.text.trim() : "";
    if (typeof body.audio === "string") {
      audioBase64 = body.audio;
      if (typeof body.mimeType === "string") audioMime = body.mimeType;
    }
  } catch {
    return NextResponse.json({ error: "Permintaan tidak valid." }, { status: 400 });
  }

  if (!text && !audioBase64) {
    return NextResponse.json({ error: "Teks atau rekaman audio pesanan wajib disertakan." }, { status: 400 });
  }

  const googleSetup = getGoogleModel();

  // If no Gemini key is provided, use deterministic Indonesian regex parser fallback
  if (!googleSetup) {
    const fallback = parseOrder(text);
    return NextResponse.json({
      items: fallback.items,
      payment: fallback.payment,
      unknown: fallback.unknown,
      source: "local-parser",
    });
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const contentParts: any[] = [];

    if (audioBase64) {
      contentParts.push({
        type: "file",
        data: audioBase64.replace(/^data:[^;]+;base64,/, ""),
        mimeType: audioMime,
      });
    }

    contentParts.push({
      type: "text",
      text: `Analisis pesanan pelanggan kafe berikut dan petakan ke menu katalog resmi Kopi Senja:\n${text ? `"${text}"` : "(Dengarkan rekaman audio)"}`,
    });

    const result = await generateText({
      model: googleSetup.model,
      output: Output.object({ schema: orderSchema }),
      instructions: `Kamu adalah asisten kasir pintar untuk kedai Kopi Senja di Bandung, Indonesia.
Tugasmu adalah mendengarkan/membaca pesanan suara kasir dan mengekstrak item pesanan, jumlah, catatan rasa, dan metode pembayaran.

${CATALOG_CONTEXT}

Aturan Ketat:
1. 'productId' HARUS salah satu dari kode menu katalog resmi yang valid: ${Array.from(validProductIds).join(", ")}.
2. Jika ada menu yang tidak dijual (misal "nasi goreng", "bakso", "burger"), masukkan namanya ke dalam array 'unknown'.
3. Normalisasi catatan pesanan (contoh: "kurang manis" -> "less sugar", "sedikit es" -> "less ice").
4. Bila jumlah tidak disebutkan, anggap 1. Pahami kata bilangan Indonesia (satu, dua, tiga, sepasang = 2, lusin = 12).
5. Deteksi metode pembayaran (Tunai, QRIS, atau Transfer). Default: Tunai jika tidak disebutkan.`,
      messages: [
        {
          role: "user",
          content: contentParts,
        },
      ],
    });

    const parsed = result.output;
    // Sanitasi: pastikan productId benar-benar terdaftar
    const verifiedItems: typeof parsed.items = [];
    const verifiedUnknown = [...parsed.unknown];

    for (const item of parsed.items) {
      if (validProductIds.has(item.productId)) {
        verifiedItems.push(item);
      } else {
        verifiedUnknown.push(item.productId);
      }
    }

    const latencyMs = Date.now() - start;
    await logAiTelemetry({
      feature: "parse-order",
      model: googleSetup.modelId,
      input: { textLength: text.length, hasAudio: Boolean(audioBase64) },
      output: { itemsCount: verifiedItems.length, payment: parsed.payment },
      latencyMs,
      ok: true,
    });

    return NextResponse.json({
      items: verifiedItems,
      payment: parsed.payment,
      unknown: verifiedUnknown,
      source: "gemini",
      model: googleSetup.modelId,
    });
  } catch (error) {
    // Graceful degradation: fall back to regex parser
    const fallback = parseOrder(text);
    const latencyMs = Date.now() - start;

    await logAiTelemetry({
      feature: "parse-order",
      model: googleSetup.modelId,
      input: { textLength: text.length, hasAudio: Boolean(audioBase64) },
      output: { fallback: true, error: error instanceof Error ? error.message : String(error) },
      latencyMs,
      ok: false,
    });

    return NextResponse.json({
      items: fallback.items,
      payment: fallback.payment,
      unknown: fallback.unknown,
      source: "fallback-parser",
      warning: "Model AI sedang sibuk. Menggunakan pengurai lokal.",
    });
  }
}
