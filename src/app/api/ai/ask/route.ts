import { NextResponse, type NextRequest } from "next/server";
import { generateText, isStepCount, tool } from "ai";
import { z } from "zod";
import { aiErrorResponse, catalogContext, getGoogleModel, logAiTelemetry, requireAiContext, type AiContext } from "@/lib/ai";
import { currency, getStock, type BusinessState, type Sale } from "@/lib/laris-data";
import { aiRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  mode: z.enum(["local", "cloud"]),
  question: z.string().trim().min(1).max(2000),
  history: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    text: z.string().trim().min(1).max(2000),
  })).max(12).optional().default([]),
});

function salesInPeriod(sales: Sale[], today: string, days: number) {
  const end = new Date(`${today}T00:00:00Z`);
  const cutoff = new Date(end.getTime() - (days - 1) * 86400000).toISOString().slice(0, 10);
  return sales.filter((sale) => {
    const date = sale.createdAt.slice(0, 10);
    return date >= cutoff && date <= today;
  });
}

function estimatedCosts(sales: Sale[], state: BusinessState) {
  const catalog = state.products ?? [];
  return sales.reduce((total, sale) => total + sale.items.reduce((cost, item) => {
    const product = catalog.find((entry) => entry.id === item.productId);
    return cost + (product?.cost ?? 0) * item.quantity;
  }, 0), 0);
}

function productRanking(state: BusinessState) {
  const counts = new Map<string, number>();
  for (const sale of state.sales) for (const item of sale.items) counts.set(item.productId, (counts.get(item.productId) ?? 0) + item.quantity);
  const catalog = state.products ?? [];
  return Array.from(counts.entries()).map(([id, quantity]) => ({
    productId: id,
    name: catalog.find((product) => product.id === id)?.name ?? id,
    quantitySold: quantity,
  })).sort((a, b) => b.quantitySold - a.quantitySold);
}

function localAnswer(question: string, state: BusinessState): string {
  const q = question.toLowerCase();
  const ingredients = state.inventory ?? [];
  const ownerName = state.business.owner || "Pemilik";

  if (/terlaris|paling laris|favorit|menu.*(?:paling|terbanyak)|produk.*(?:paling|terbanyak)/.test(q)) {
    const ranking = productRanking(state);
    if (!ranking.length) return "Belum ada penjualan yang bisa dibandingkan. Catat transaksi pertama untuk melihat produk terlaris.";
    const [first, second] = ranking;
    return `${first.name} adalah produk terlaris dengan ${first.quantitySold} item terjual.${second ? ` Berikutnya ${second.name} dengan ${second.quantitySold} item.` : ""} Gunakan laporan penjualan untuk memilih periode sebelum mengambil keputusan promo.`;
  }

  if (/stok|bahan|habis|menipis|belanja|restock/.test(q)) {
    if (!ingredients.length) return "Belum ada bahan baku di workspace. Tambahkan bahan dan batas minimum stok agar rekomendasi belanja bisa dihitung.";
    const lowStock = ingredients.filter((item) => getStock(state, item.id) <= item.reorderPoint);
    if (!lowStock.length) return `Semua ${ingredients.length} bahan masih di atas batas minimum. Belum ada yang perlu dibeli berdasarkan aturan stok saat ini.`;
    return `Ada ${lowStock.length} bahan yang perlu diperhatikan: ${lowStock.map((item) => `${item.name} tersisa ${getStock(state, item.id).toLocaleString("id-ID")} ${item.unit}`).join(", ")}. Prioritaskan pembelian bahan tersebut.`;
  }

  if (/omzet|penjualan|laku|untung|margin|laba|pendapatan/.test(q)) {
    if (!state.sales.length) return `Belum ada transaksi tercatat di ${state.business.name}. Omzet dan laba akan muncul setelah transaksi pertama disimpan.`;
    const revenue = state.sales.reduce((total, sale) => total + sale.total, 0);
    const costs = estimatedCosts(state.sales, state);
    const gross = revenue - costs;
    const margin = revenue ? (gross / revenue) * 100 : 0;
    return `Dari ${state.sales.length} transaksi tercatat, omzet ${currency(revenue)} dengan estimasi HPP ${currency(costs)} berdasarkan resep saat ini. Laba kotor ${currency(gross)} (${margin.toFixed(1)}%), sebelum biaya operasional.`;
  }

  return `Halo ${ownerName}! Saya bisa membantu membaca omzet, produk terlaris, stok yang menipis, pelanggan, dan estimasi laba dari data ${state.business.name}. Tanyakan salah satu topik tersebut.`;
}

export async function POST(request: NextRequest) {
  const start = Date.now();
  let input: z.infer<typeof requestSchema>;
  try {
    input = requestSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Pertanyaan tidak valid. Gunakan teks 1–2000 karakter dan riwayat percakapan yang sesuai." }, { status: 400 });
  }

  const limited = await aiRateLimit(request, "ask", input.mode);
  if (limited) return limited;

  let context: AiContext;
  try {
    context = await requireAiContext(input.mode);
  } catch (error) {
    return aiErrorResponse(error, "Data workspace belum dapat dimuat. Coba lagi.");
  }
  const { state } = context;
  // Gemini only for authenticated cloud requests; local/demo mode always uses the rule-based answer.
  const googleSetup = context.allowGemini ? getGoogleModel() : null;
  if (!googleSetup) return NextResponse.json({ answer: localAnswer(input.question, state), source: "local-rules" });

  const periodSales = (days: number) => salesInPeriod(state.sales, context.today, days);
  try {
    const tools = {
      getRevenueSummary: tool({
        description: "Menghitung omzet, jumlah transaksi, dan rata-rata transaksi dalam rentang hari terakhir",
        inputSchema: z.object({ days: z.number().int().min(1).max(90).default(7) }),
        execute: async ({ days }) => {
          const sales = periodSales(days);
          const total = sales.reduce((sum, sale) => sum + sale.total, 0);
          return {
            periodDays: days,
            startDate: new Date(new Date(`${context.today}T00:00:00Z`).getTime() - (days - 1) * 86400000).toISOString().slice(0, 10),
            endDate: context.today,
            totalRevenue: total,
            totalRevenueFormatted: currency(total),
            transactionCount: sales.length,
            averageOrderValue: sales.length ? Math.round(total / sales.length) : 0,
          };
        },
      }),
      getProfitSummary: tool({
        description: "Menghitung estimasi laba kotor dari omzet dan HPP resep saat ini, sebelum biaya operasional",
        inputSchema: z.object({ days: z.number().int().min(1).max(90).default(7) }),
        execute: async ({ days }) => {
          const sales = periodSales(days);
          const revenue = sales.reduce((sum, sale) => sum + sale.total, 0);
          const costs = estimatedCosts(sales, state);
          const grossProfit = revenue - costs;
          return {
            periodDays: days,
            revenue,
            estimatedCogs: costs,
            grossProfit,
            grossProfitFormatted: currency(grossProfit),
            marginPercent: revenue ? Math.round((grossProfit / revenue) * 1000) / 10 : 0,
            note: "HPP memakai resep dan biaya bahan saat ini; laba kotor belum dikurangi biaya operasional.",
          };
        },
      }),
      getTopSellingProducts: tool({
        description: "Melihat produk terlaris berdasarkan jumlah item dari seluruh transaksi yang tercatat",
        inputSchema: z.object({ limit: z.number().int().min(1).max(10).default(5) }),
        execute: async ({ limit }) => productRanking(state).slice(0, limit),
      }),
      getLowStockAlerts: tool({
        description: "Memeriksa bahan baku yang berada di bawah atau sama dengan batas minimum stok",
        inputSchema: z.object({}),
        execute: async () => (state.inventory ?? []).map((item) => ({
          id: item.id,
          name: item.name,
          currentStock: getStock(state, item.id),
          reorderPoint: item.reorderPoint,
          unit: item.unit,
          supplier: item.supplier,
        })).filter((item) => item.currentStock <= item.reorderPoint),
      }),
      getCustomerSegmentsSummary: tool({
        description: "Melihat jumlah pelanggan per segmen RFM",
        inputSchema: z.object({}),
        execute: async () => {
          const segments: Record<string, number> = { Juara: 0, Setia: 0, Potensial: 0, Berisiko: 0, Hilang: 0 };
          for (const customer of state.customers) segments[customer.segment] = (segments[customer.segment] ?? 0) + 1;
          return { totalCustomers: state.customers.length, segments };
        },
      }),
      getExpensesBreakdown: tool({
        description: "Melihat pengeluaran operasional berdasarkan kategori dari seluruh catatan workspace",
        inputSchema: z.object({}),
        execute: async () => {
          const categories: Record<string, number> = {};
          let total = 0;
          for (const expense of state.expenses) {
            categories[expense.category] = (categories[expense.category] ?? 0) + expense.amount;
            total += expense.amount;
          }
          return { totalExpenses: total, totalExpensesFormatted: currency(total), categories };
        },
      }),
    };

    const result = await generateText({
      model: googleSetup.model,
      tools,
      stopWhen: isStepCount(4),
      instructions: `Kamu adalah 'Tanya Laris', asisten bisnis untuk ${state.business.owner || "pemilik"} di ${state.business.name}.
Jawab dalam Bahasa Indonesia yang hangat, ringkas, dan profesional. Gunakan format Rupiah yang mudah dibaca.

${catalogContext(state)}

Gunakan tools untuk membaca data workspace. Jangan menebak angka, transaksi, produk, atau stok.
Jika data kosong, katakan dengan jujur dan sarankan langkah berikutnya. Jelaskan bahwa laba kotor adalah estimasi sebelum biaya operasional.
Berikan rekomendasi praktis hanya berdasarkan data yang tersedia.`,
      messages: [
        ...input.history.map((message) => ({ role: message.role, content: message.text })),
        { role: "user" as const, content: input.question },
      ],
    });
    if (!result.text.trim()) throw new Error("Model tidak menghasilkan jawaban.");

    await logAiTelemetry({
      businessId: context.businessId,
      feature: "ask",
      model: googleSetup.modelId,
      input: { questionLength: input.question.length },
      output: { answerLength: result.text.length },
      latencyMs: Date.now() - start,
      ok: true,
    });
    return NextResponse.json({ answer: result.text, source: "gemini", model: googleSetup.modelId });
  } catch (error) {
    await logAiTelemetry({
      businessId: context.businessId,
      feature: "ask",
      model: googleSetup.modelId,
      input: { questionLength: input.question.length },
      output: { error: error instanceof Error ? error.message : String(error) },
      latencyMs: Date.now() - start,
      ok: false,
    });
    return NextResponse.json({ error: "Asisten AI belum dapat menjawab. Coba lagi atau gunakan laporan di workspace." }, { status: 502 });
  }
}
