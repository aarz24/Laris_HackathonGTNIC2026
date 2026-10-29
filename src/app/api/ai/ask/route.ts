import { NextResponse, type NextRequest } from "next/server";
import { generateText, isStepCount, tool } from "ai";
import { z } from "zod";
import { aiErrorResponse, catalogContext, getGoogleModel, logAiTelemetry, requireAiContext, withAiDeadline, type AiContext } from "@/lib/ai";
import { aiFailureReason, generationOptions, waitForSignal } from "@/lib/ai-request";
import { askFallback, localAnswer } from "@/lib/ai-fallbacks";
import { currency, getStock, getSalesFinancials, getProductSales, type BusinessState, type Sale } from "@/lib/laris-data";
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

function productRanking(state: BusinessState) {
  return getProductSales(state.sales, state.products ?? []).map((product) => ({
    productId: product.id,
    name: product.name,
    quantitySold: product.count,
  }));
}

export async function POST(request: NextRequest) {
  return withAiDeadline(request, routeSignal => handleRequest(request, routeSignal));
}

async function handleRequest(request: NextRequest, routeSignal: AbortSignal) {
  const start = Date.now();
  let input: z.infer<typeof requestSchema>;
  try {
    input = requestSchema.parse(await waitForSignal(routeSignal, () => request.json()));
  } catch {
    routeSignal.throwIfAborted();
    return NextResponse.json({ error: "Pertanyaan tidak valid. Gunakan teks 1–2000 karakter dan riwayat percakapan yang sesuai." }, { status: 400 });
  }

  const limited = await waitForSignal(routeSignal, () => aiRateLimit(request, "ask", input.mode));
  if (limited) return limited;

  let context: AiContext;
  try {
    context = await waitForSignal(routeSignal, () => requireAiContext(input.mode));
    routeSignal.throwIfAborted();
  } catch (error) {
    return aiErrorResponse(error, "Data workspace belum dapat dimuat. Coba lagi.", routeSignal);
  }
  const { state } = context;
  // Gemini only for authenticated cloud requests; local/demo mode always uses the rule-based answer.
  const googleSetup = context.allowGemini ? getGoogleModel() : null;
  if (!googleSetup) return NextResponse.json(context.allowGemini
    ? askFallback(input.question, state, "unavailable")
    : { answer: localAnswer(input.question, state), source: "local-rules", notice: "Jawaban aturan lokal, bukan hasil model AI." });

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
        description: "Menghitung laba kotor dari omzet dan HPP saat penjualan, atau menandai HPP historis yang tidak tersedia",
        inputSchema: z.object({ days: z.number().int().min(1).max(90).default(7) }),
        execute: async ({ days }) => {
          const sales = periodSales(days);
          const { revenue, cost, grossProfit, missingCostLines } = getSalesFinancials(sales);
          return {
            periodDays: days,
            revenue,
            cogs: cost,
            costBasis: cost === null ? "unavailable" : "sale-time snapshots",
            missingCostLines,
            grossProfit,
            grossProfitFormatted: grossProfit === null ? "Tidak tersedia" : currency(grossProfit),
            marginPercent: grossProfit === null ? null : revenue ? Math.round((grossProfit / revenue) * 1000) / 10 : 0,
            note: cost === null ? "HPP arsip lama tidak tersedia. Jangan menganggap biaya nol atau menggantinya dengan HPP saat ini; laba dan margin tidak dapat dihitung." : "HPP memakai biaya saat penjualan; laba kotor belum dikurangi biaya operasional.",
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

    const result = await waitForSignal(routeSignal, () => generateText({
      ...generationOptions(routeSignal),
      model: googleSetup.model,
      tools,
      stopWhen: isStepCount(4),
      instructions: `Kamu adalah 'Tanya Laris', asisten bisnis untuk ${state.business.owner || "pemilik"} di ${state.business.name}.
Jawab dalam Bahasa Indonesia yang hangat, ringkas, dan profesional. Gunakan format Rupiah yang mudah dibaca.

${catalogContext(state)}

Gunakan tools untuk membaca data workspace. Jangan menebak angka, transaksi, produk, atau stok.
Jika data kosong, katakan dengan jujur dan sarankan langkah berikutnya. Laba kotor memakai HPP saat penjualan, sebelum biaya operasional. Jika HPP historis tidak tersedia, jangan menebak biaya, laba, atau margin; jelaskan keterbatasan arsip lama.
Berikan rekomendasi praktis hanya berdasarkan data yang tersedia.`,
      messages: [
        ...input.history.map((message) => ({ role: message.role, content: message.text })),
        { role: "user" as const, content: input.question },
      ],
    }));
    if (!result.text.trim()) throw new Error("Model tidak menghasilkan jawaban.");

    await logAiTelemetry({
      context,
      signal: routeSignal,
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
      context,
      signal: routeSignal,
      feature: "ask",
      model: googleSetup.modelId,
      input: { questionLength: input.question.length },
      output: { error: error instanceof Error ? error.message : String(error) },
      latencyMs: Date.now() - start,
      ok: false,
    });
    const reason = aiFailureReason(error, routeSignal);
    if (reason === "cancelled") return aiErrorResponse(error, "Permintaan dibatalkan.", routeSignal);
    return NextResponse.json(askFallback(input.question, context.state, reason));
  }
}
