import { NextResponse, type NextRequest } from "next/server";
import { generateText, Output } from "ai";
import { z } from "zod";
import { aiErrorResponse, catalogContext, getGoogleModel, logAiTelemetry, requireAiContext, type AiContext } from "@/lib/ai";
import { parseOrder } from "@/lib/laris-data";
import { aiRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const MAX_TEXT = 2000;
const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
const MAX_BODY_BYTES = 12 * 1024 * 1024;
const audioMimes = ["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav", "audio/x-wav"] as const;

const requestSchema = z.object({
  mode: z.enum(["local", "cloud"]),
  text: z.string().trim().max(MAX_TEXT).optional().default(""),
  audio: z.string().max(MAX_BODY_BYTES).optional(),
  mimeType: z.enum(audioMimes).optional().default("audio/webm"),
});

const orderSchema = z.object({
  items: z.array(z.object({
    productId: z.string().max(120).describe("ID produk yang cocok persis dari katalog workspace"),
    quantity: z.number().int().min(1).max(999).describe("Jumlah porsi, bilangan bulat positif"),
    note: z.string().max(200).optional().describe("Catatan kustomisasi pesanan"),
  })).max(50),
  payment: z.enum(["Tunai", "QRIS", "Transfer"]).describe("Metode pembayaran, default Tunai"),
  unknown: z.array(z.string().max(200)).max(50).describe("Frasa yang tidak dikenali atau tidak ada di katalog"),
});

export async function POST(request: NextRequest) {
  const start = Date.now();
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) return NextResponse.json({ error: "Ukuran permintaan maksimal 12 MB." }, { status: 413 });

  let input: z.infer<typeof requestSchema>;
  try {
    input = requestSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Permintaan tidak valid. Periksa mode, teks, dan format audio." }, { status: 400 });
  }
  const text = input.text;
  const audioBase64 = input.audio?.replace(/^data:[^;]+;base64,/, "");
  if (!text && !audioBase64) return NextResponse.json({ error: "Teks atau rekaman audio pesanan wajib disertakan." }, { status: 400 });

  if (audioBase64) {
    const audioBytes = Buffer.from(audioBase64, "base64").byteLength;
    if (!audioBytes) return NextResponse.json({ error: "Rekaman audio kosong atau tidak valid." }, { status: 400 });
    if (audioBytes > MAX_AUDIO_BYTES) return NextResponse.json({ error: "Ukuran audio maksimal 8 MB." }, { status: 413 });
  }

  const limited = await aiRateLimit(request, "parse-order", input.mode);
  if (limited) return limited;

  let context: AiContext;
  try {
    context = await requireAiContext(input.mode, true);
  } catch (error) {
    return aiErrorResponse(error, "Workspace belum dapat dimuat. Coba lagi.");
  }

  const catalog = (context.state.products ?? []).filter((product) => product.active !== false);
  if (!catalog.length) return NextResponse.json({ error: "Tambahkan menu aktif sebelum menggunakan pesanan suara." }, { status: 422 });
  const validProductIds = new Set(catalog.map((product) => product.id));
  // Gemini only for authenticated cloud requests; local/demo mode always uses the local parser.
  const googleSetup = context.allowGemini ? getGoogleModel() : null;

  if (!googleSetup) {
    if (!text) {
      const message = context.allowGemini
        ? "Pesanan audio membutuhkan konfigurasi Gemini. Gunakan input teks atau isi GOOGLE_GENERATIVE_AI_API_KEY."
        : "Pesanan suara hanya tersedia di mode cloud setelah masuk. Pada mode lokal, gunakan input teks.";
      return NextResponse.json({ error: message }, { status: 503 });
    }
    const fallback = parseOrder(text, catalog);
    return NextResponse.json({ ...fallback, source: "local-parser" });
  }

  try {
    const contentParts: Array<{ type: "text"; text: string } | { type: "file"; data: string; mediaType: string }> = [];
    if (audioBase64) contentParts.push({ type: "file", data: audioBase64, mediaType: input.mimeType });
    contentParts.push({
      type: "text",
      text: `Analisis pesanan pelanggan berikut dan petakan hanya ke katalog resmi ${context.state.business.name}:\n${text ? `"${text}"` : "(Dengarkan rekaman audio)"}`,
    });

    const result = await generateText({
      model: googleSetup.model,
      output: Output.object({ schema: orderSchema }),
      instructions: `Kamu adalah asisten kasir untuk ${context.state.business.name} di Indonesia.
Ekstrak item pesanan, jumlah, catatan rasa, dan metode pembayaran dari teks atau audio kasir.

${catalogContext(context.state)}

Aturan ketat:
1. 'productId' HARUS salah satu ID menu aktif berikut: ${Array.from(validProductIds).join(", ")}.
2. Menu yang tidak ada atau nonaktif harus masuk array 'unknown', jangan mengarang ID.
3. Normalisasi catatan seperti "kurang manis" -> "less sugar" dan "sedikit es" -> "less ice".
4. Jika jumlah tidak disebutkan, gunakan 1. Pahami bilangan Indonesia, sepasang = 2, dan lusin = 12.
5. Deteksi Tunai, QRIS, atau Transfer. Default Tunai jika tidak disebutkan.`,
      messages: [{ role: "user", content: contentParts }],
    });

    const parsed = result.output;
    const verifiedItems: typeof parsed.items = [];
    const verifiedUnknown = [...parsed.unknown];
    for (const item of parsed.items) {
      if (validProductIds.has(item.productId)) verifiedItems.push(item);
      else verifiedUnknown.push(item.productId);
    }

    await logAiTelemetry({
      businessId: context.businessId,
      feature: "parse-order",
      model: googleSetup.modelId,
      input: { textLength: text.length, hasAudio: Boolean(audioBase64) },
      output: { itemsCount: verifiedItems.length, payment: parsed.payment },
      latencyMs: Date.now() - start,
      ok: true,
    });
    return NextResponse.json({ items: verifiedItems, payment: parsed.payment, unknown: verifiedUnknown, source: "gemini", model: googleSetup.modelId });
  } catch (error) {
    await logAiTelemetry({
      businessId: context.businessId,
      feature: "parse-order",
      model: googleSetup.modelId,
      input: { textLength: text.length, hasAudio: Boolean(audioBase64) },
      output: { error: error instanceof Error ? error.message : String(error) },
      latencyMs: Date.now() - start,
      ok: false,
    });
    if (!text) return NextResponse.json({ error: "Pesanan audio belum dapat diproses. Coba lagi atau gunakan input teks." }, { status: 502 });
    const fallback = parseOrder(text, catalog);
    return NextResponse.json({ ...fallback, source: "fallback-parser", warning: "Model AI sedang sibuk. Menggunakan pengurai lokal dengan katalog workspace." });
  }
}
