import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { serverEnv } from "@/lib/env";
import { products, inventory } from "@/lib/laris-data";
import { createClient } from "@/lib/supabase/server";

export function getGoogleModel(preferredModel?: string) {
  const env = serverEnv();
  if (!env.googleKey) return null;
  const google = createGoogleGenerativeAI({
    apiKey: env.googleKey,
  });
  const modelId = preferredModel || env.modelFast || "gemini-2.5-flash";
  return { model: google(modelId), modelId };
}

export const CATALOG_CONTEXT = `
Katalog Menu Kopi Senja (Produk & Kode):
${products.map((p) => `- "${p.id}" : ${p.name} (${p.category}) - Rp${p.price.toLocaleString("id-ID")}`).join("\n")}

Daftar Bahan Baku (Inventory & Kode):
${inventory.map((i) => `- "${i.id}" : ${i.name} (satuan: ${i.unit}, biaya standar: Rp${i.cost}/${i.unit})`).join("\n")}

Kamus Slang & Istilah UMKM / Kafe Indonesia:
- "kopsu" / "es kopsu" = kopi-susu (Es Kopi Susu)
- "less sugar" / "kurang manis" / "sedikit gula" = catatan "less sugar"
- "normal sugar" / "manis biasa" = tanpa catatan khusus
- "no sugar" / "tanpa gula" / "pahit" = catatan "no sugar"
- "less ice" / "sedikit es" = catatan "less ice"
- "no ice" / "tanpa es" / "hangat" / "panas" = catatan "hot" atau "no ice"
- "ceban" = 10.000, "goceng" = 5.000, "gocap" = 50.000, "cepek" = 100.000
- Metode bayar: "qris" -> QRIS, "tunai" / "cash" -> Tunai, "transfer" / "tf" -> Transfer
`;

export async function logAiTelemetry(params: {
  feature: "parse-order" | "scan-receipt" | "ask";
  model: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  latencyMs: number;
  ok: boolean;
}) {
  try {
    const supabase = await createClient();
    const { data: claims } = await supabase.auth.getClaims();
    const userId = claims?.claims?.sub;
    if (!userId) return;

    const { data: membership } = await supabase
      .from("membership")
      .select("business_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();

    await supabase.from("ai_event").insert({
      business_id: membership?.business_id ?? null,
      user_id: userId,
      feature: params.feature,
      model: params.model,
      input: params.input,
      output: params.output,
      latency_ms: params.latencyMs,
      ok: params.ok,
    });
  } catch {
    // Telemetry must never crash primary user requests
  }
}
