import { NextResponse, type NextRequest } from "next/server";
import { generateText, isStepCount, tool } from "ai";
import { z } from "zod";
import { CATALOG_CONTEXT, getGoogleModel, logAiTelemetry } from "@/lib/ai";
import { createInitialState, inventory, products } from "@/lib/laris-data";
import { loadSnapshot } from "@/lib/repo";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const start = Date.now();
  let question = "";
  let history: { role: "user" | "assistant"; text: string }[] = [];

  try {
    const body = await request.json();
    question = typeof body.question === "string" ? body.question.trim() : "";
    if (Array.isArray(body.history)) {
      history = body.history.filter((m: { role: string; text: string }) => (m.role === "user" || m.role === "assistant") && typeof m.text === "string");
    }
  } catch {
    return NextResponse.json({ error: "Permintaan tidak valid." }, { status: 400 });
  }

  if (!question) {
    return NextResponse.json({ error: "Pertanyaan tidak boleh kosong." }, { status: 400 });
  }

  // Load active data state: either from Supabase user session or demo initial state
  let state = createInitialState();
  let businessName = state.business.name;
  let ownerName = state.business.owner;

  try {
    const supabase = await createClient();
    const snapshot = await loadSnapshot(supabase);
    if (snapshot) {
      state = snapshot.state;
      businessName = state.business.name;
      ownerName = state.business.owner;
    }
  } catch {
    // Keep demo state if unauthenticated or offline
  }

  const googleSetup = getGoogleModel();

  // Deterministic fallback if no Gemini key configured
  if (!googleSetup) {
    const q = question.toLowerCase();
    let answer = `Halo ${ownerName}! Saya adalah asisten cerdas Laris. Kamu bisa bertanya tentang omzet, stok bahan menipis, produk terlaris, atau keuntungan usaha ${businessName}.`;

    const totalRevenue = state.sales.reduce((acc, s) => acc + s.total, 0);
    const lowStockItems = inventory.filter((item) => {
      const currentStock = state.stockMovements
        .filter((m) => m.itemId === item.id)
        .reduce((sum, m) => sum + m.quantity, item.openingStock);
      return currentStock <= item.reorderPoint;
    });

    if (/stok|bahan|habis|menipis|susu|kopi/.test(q)) {
      answer = `Ada ${lowStockItems.length} bahan yang perlu segera diperhatikan untuk ${businessName}: ${lowStockItems.map((i) => i.name).join(", ")}. Prioritaskan belanja sebelum kedai ramai.`;
    } else if (/omzet|penjualan|laku|untung|margin|laba/.test(q)) {
      answer = `Total penjualan tercatat di sistem saat ini adalah Rp${totalRevenue.toLocaleString("id-ID")} dari ${state.sales.length} transaksi. Rata-rata margin kotor terjaga di sekitar 62%.`;
    } else if (/laris|favorit|menu|paling/.test(q)) {
      answer = `Menu paling laris adalah Es Kopi Susu dengan porsi terbanyak, disusul Butter Croissant. Rekomendasi: tawarkan paket combo kopi + pastry untuk meningkatkan nilai rata-rata transaksi.`;
    }

    return NextResponse.json({
      answer,
      source: "local-rules",
    });
  }

  try {
    // Typed tools giving real analytical data from the business ledger
    const tools = {
      getRevenueSummary: tool({
        description: "Menghitung omzet penjualan, total transaksi, dan rata-rata belanja dalam rentang hari terakhir",
        inputSchema: z.object({
          days: z.number().int().min(1).max(90).default(7).describe("Rentang hari ke belakang (misal 1 untuk hari ini, 7 untuk seminggu, 30 untuk sebulan)"),
        }),
        execute: async ({ days }) => {
          const sorted = [...state.sales].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
          const latestDate = sorted[0]?.createdAt.slice(0, 10) || "2026-10-18";
          const cutoff = new Date(new Date(latestDate).getTime() - (days - 1) * 86400000).toISOString().slice(0, 10);
          const filtered = sorted.filter((s) => s.createdAt.slice(0, 10) >= cutoff);
          const total = filtered.reduce((acc, s) => acc + s.total, 0);
          return {
            periodDays: days,
            totalRevenue: total,
            totalRevenueFormatted: `Rp${total.toLocaleString("id-ID")}`,
            transactionCount: filtered.length,
            averageOrderValue: filtered.length ? Math.round(total / filtered.length) : 0,
          };
        },
      }),

      getTopSellingProducts: tool({
        description: "Melihat daftar produk menu yang paling banyak terjual dan nilai kontribusinya",
        inputSchema: z.object({
          limit: z.number().int().min(1).max(10).default(5),
        }),
        execute: async ({ limit }) => {
          const counts = new Map<string, { quantity: number; revenue: number }>();
          for (const sale of state.sales) {
            for (const item of sale.items) {
              const prev = counts.get(item.productId) || { quantity: 0, revenue: 0 };
              const p = products.find((prod) => prod.id === item.productId);
              counts.set(item.productId, {
                quantity: prev.quantity + item.quantity,
                revenue: prev.revenue + item.quantity * (p?.price || 0),
              });
            }
          }
          const sorted = Array.from(counts.entries())
            .map(([id, stats]) => ({
              productId: id,
              name: products.find((p) => p.id === id)?.name || id,
              quantitySold: stats.quantity,
              revenue: stats.revenue,
              revenueFormatted: `Rp${stats.revenue.toLocaleString("id-ID")}`,
            }))
            .sort((a, b) => b.quantitySold - a.quantitySold)
            .slice(0, limit);
          return sorted;
        },
      }),

      getLowStockAlerts: tool({
        description: "Memeriksa stok bahan baku yang berada di bawah atau mendekati batas aman (reorder point)",
        inputSchema: z.object({}),
        execute: async () => {
          const results = inventory.map((item) => {
            const currentStock = state.stockMovements
              .filter((m) => m.itemId === item.id)
              .reduce((sum, m) => sum + m.quantity, item.openingStock);
            return {
              id: item.id,
              name: item.name,
              currentStock,
              reorderPoint: item.reorderPoint,
              unit: item.unit,
              isLow: currentStock <= item.reorderPoint,
              supplier: item.supplier,
            };
          });
          return results.filter((i) => i.isLow);
        },
      }),

      getCustomerSegmentsSummary: tool({
        description: "Melihat rincian segmentasi pelanggan RFM (Juara, Setia, Potensial, Berisiko, Hilang)",
        inputSchema: z.object({}),
        execute: async () => {
          const segs: Record<string, number> = { Juara: 0, Setia: 0, Potensial: 0, Berisiko: 0, Hilang: 0 };
          for (const c of state.customers) {
            segs[c.segment] = (segs[c.segment] || 0) + 1;
          }
          return {
            totalCustomers: state.customers.length,
            segments: segs,
          };
        },
      }),

      getExpensesBreakdown: tool({
        description: "Melihat pengeluaran operasional usaha berdasarkan kategori",
        inputSchema: z.object({}),
        execute: async () => {
          const byCategory: Record<string, number> = {};
          let total = 0;
          for (const exp of state.expenses) {
            byCategory[exp.category] = (byCategory[exp.category] || 0) + exp.amount;
            total += exp.amount;
          }
          return {
            totalExpenses: total,
            totalExpensesFormatted: `Rp${total.toLocaleString("id-ID")}`,
            categories: byCategory,
          };
        },
      }),
    };

    const messages = [
      ...history.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.text,
      })),
      {
        role: "user" as const,
        content: question,
      },
    ];

    const result = await generateText({
      model: googleSetup.model,
      tools,
      stopWhen: isStepCount(4),
      instructions: `Kamu adalah 'Tanya Laris' — asisten bisnis AI yang ramah, ringkas, dan solutif untuk ${ownerName}, pemilik ${businessName}.
Bahasa: Bahasa Indonesia yang hangat, profesional namun santai (seperti partner bisnis terpercaya).
Hindari jargon rumit. Bila menyebutkan nominal uang, gunakan format Rupiah yang mudah dibaca (misal: Rp25.000 atau 3,5 juta).

${CATALOG_CONTEXT}

Gunakan alat bantu (tools) yang disediakan untuk melihat data riil penjualan, stok, pelanggan, dan pengeluaran.
Jangan menebak angka jika ada alat bantunya. Berikan rekomendasi praktis yang bisa langsung dilakukan pemilik kedai hari ini.`,
      messages,
    });

    const latencyMs = Date.now() - start;
    await logAiTelemetry({
      feature: "ask",
      model: googleSetup.modelId,
      input: { questionLength: question.length },
      output: { answerLength: result.text.length },
      latencyMs,
      ok: true,
    });

    return NextResponse.json({
      answer: result.text,
      source: "gemini",
      model: googleSetup.modelId,
    });
  } catch (error) {
    const latencyMs = Date.now() - start;
    await logAiTelemetry({
      feature: "ask",
      model: googleSetup.modelId,
      input: { questionLength: question.length },
      output: { error: error instanceof Error ? error.message : String(error) },
      latencyMs,
      ok: false,
    });

    return NextResponse.json({
      answer: "Mohon maaf, asisten AI sedang mengalami lonjakan trafik. Silakan tanyakan hal lain atau periksa menu laporan langsung di tab Keuangan dan Stok.",
      source: "error-fallback",
    });
  }
}
