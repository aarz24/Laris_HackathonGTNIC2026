import { currency, getStock, getSalesFinancials, getProductSales, parseOrder, type BusinessState } from "./laris-data.ts";

export type AiFallbackReason = "timeout" | "provider-error" | "unavailable";
export const AI_RULES_SCOPE = "Cakupan: seluruh transaksi tercatat, bukan khusus hari ini. Stok memakai kondisi saat ini.";

export function localAnswer(question: string, state: BusinessState): string {
  return `${AI_RULES_SCOPE} ${answerFromRecords(question, state)}`;
}

function answerFromRecords(question: string, state: BusinessState): string {
  const q = question.toLowerCase();
  const ingredients = state.inventory ?? [];
  const ownerName = state.business.owner || "Pemilik";

  if (/terlaris|paling laris|favorit|menu.*(?:paling|terbanyak)|produk.*(?:paling|terbanyak)/.test(q)) {
    const ranking = getProductSales(state.sales, state.products ?? []);
    if (!ranking.length) return "Belum ada penjualan yang bisa dibandingkan. Catat transaksi pertama untuk melihat produk terlaris.";
    const [first, second] = ranking;
    return `${first.name} adalah produk terlaris dengan ${first.count} item terjual.${second ? ` Berikutnya ${second.name} dengan ${second.count} item.` : ""} Gunakan laporan penjualan untuk memilih periode sebelum mengambil keputusan promo.`;
  }

  if (/stok|bahan|habis|menipis|belanja|restock/.test(q)) {
    if (!ingredients.length) return "Belum ada bahan baku di workspace. Tambahkan bahan dan batas minimum stok agar rekomendasi belanja bisa dihitung.";
    const lowStock = ingredients.filter((item) => getStock(state, item.id) <= item.reorderPoint);
    if (!lowStock.length) return `Semua ${ingredients.length} bahan masih di atas batas minimum. Belum ada yang perlu dibeli berdasarkan aturan stok saat ini.`;
    return `Ada ${lowStock.length} bahan yang perlu diperhatikan: ${lowStock.map((item) => `${item.name} tersisa ${getStock(state, item.id).toLocaleString("id-ID")} ${item.unit}`).join(", ")}. Prioritaskan pembelian bahan tersebut.`;
  }

  if (/omzet|penjualan|laku|untung|margin|laba|pendapatan/.test(q)) {
    if (!state.sales.length) return `Belum ada transaksi tercatat di ${state.business.name}. Omzet dan laba akan muncul setelah transaksi pertama disimpan.`;
    const { revenue, cost, grossProfit, missingCostLines } = getSalesFinancials(state.sales);
    if (cost === null || grossProfit === null) return `Omzet ${currency(revenue)}. HPP historis tidak tersedia untuk ${missingCostLines} baris arsip lama; laba dan margin tidak dapat dihitung. Biaya katalog saat ini tidak dipakai untuk mengganti biaya historis.`;
    const margin = revenue ? (grossProfit / revenue) * 100 : 0;
    return `Dari ${state.sales.length} transaksi tercatat, omzet ${currency(revenue)} dengan HPP saat penjualan ${currency(cost)}. Laba kotor ${currency(grossProfit)} (${margin.toFixed(1)}%), sebelum biaya operasional.`;
  }

  return `Halo ${ownerName}! Saya bisa membantu membaca omzet, produk terlaris, stok yang menipis, pelanggan, dan estimasi laba dari data ${state.business.name}. Tanyakan salah satu topik tersebut.`;
}

export function askFallback(question: string, state: BusinessState, reason: AiFallbackReason) {
  return {
    answer: localAnswer(question, state), source: "local-rules", reason,
    notice: reason === "timeout" ? "Batas waktu AI tercapai. Jawaban memakai aturan lokal dari data workspace, bukan hasil model AI." : "AI tidak tersedia. Jawaban memakai aturan lokal dari data workspace, bukan hasil model AI.",
  };
}

export function parseOrderFallback(text: string, state: BusinessState, reason: AiFallbackReason) {
  if (!text.trim()) return {
    status: reason === "timeout" ? 504 : reason === "unavailable" ? 503 : 502,
    body: { error: "Audio belum dapat diproses. Ketik pesanan atau masukkan item secara manual; tidak ada transkrip yang dibuat.", code: reason === "timeout" ? "AI_TIMEOUT" : "AI_AUDIO_REQUIRES_TEXT", reason },
  };
  const catalog = (state.products ?? []).filter(product => product.active !== false);
  return {
    status: 200,
    body: {
      ...parseOrder(text, catalog), source: "fallback-parser", reason,
      notice: reason === "timeout" ? "Batas waktu AI tercapai. Pesanan diurai dari teks dengan katalog aktif workspace, bukan hasil model AI. Periksa sebelum konfirmasi." : "AI tidak tersedia. Pesanan diurai dari teks dengan katalog aktif workspace, bukan hasil model AI. Periksa sebelum konfirmasi.",
    },
  };
}

export function receiptFailure(reason: AiFallbackReason) {
  return {
    status: reason === "timeout" ? 504 : reason === "unavailable" ? 503 : 502,
    body: {
      error: reason === "timeout" ? "Batas waktu pemindaian nota tercapai. Isi bahan, jumlah, dan total pembelian secara manual." : "Nota belum dapat dibaca. Isi bahan, jumlah, dan total pembelian secara manual atau coba foto yang lebih jelas.",
      code: reason === "timeout" ? "AI_TIMEOUT" : "AI_OCR_UNAVAILABLE", reason,
    },
  };
}
