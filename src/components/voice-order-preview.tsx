"use client";

import { Banknote, Check, CheckCheck, CircleAlert, Grid2X2, Landmark, RotateCcw, Sparkles, Trash2 } from "lucide-react";
import { currency, type CartItem, type Product } from "@/lib/laris-data";
import { acceptVoiceSuggestions } from "@/lib/voice-order";
import type {
  VoiceCandidate,
  VoiceDraftProblem,
  VoiceDraftRow,
  VoiceDraftValidation,
  VoiceOrderDraft,
  VoiceOrderLine,
  VoiceOrderReview,
  VoicePaymentMethod,
  VoicePaymentReview,
} from "@/lib/voice-order";
import styles from "./voice-order-preview.module.css";

interface VoiceOrderPreviewProps {
  review: VoiceOrderReview;
  draft: VoiceOrderDraft;
  products: readonly Product[];
  existingCart: readonly CartItem[];
  draftValidation: VoiceDraftValidation;
  mergeValidation: VoiceDraftValidation;
  unavailableProductIds: ReadonlySet<string>;
  confirmDisabled: boolean;
  disabledReason: string;
  onDraftChange: (draft: VoiceOrderDraft) => void;
  onApplyProductNote: (productId: string, note: string) => void;
  onConfirm: () => void;
}

const statusCopy: Record<VoiceOrderLine["status"], string> = {
  exact: "Cocok persis",
  suggested: "Saran terdekat",
  ambiguous: "Beberapa menu mirip",
  unknown: "Belum dikenali",
  invalid: "Perlu diperbaiki",
};

const issueCopy: Partial<Record<NonNullable<VoiceOrderLine["issue"]>, string>> = {
  quantity: "Jumlah yang terdengar belum valid.",
  boundary: "Batas antar-menu belum jelas.",
  modifier: "Catatan menu belum dapat dipastikan.",
  unavailable: "Menu ini sedang tidak tersedia.",
  unmatched: "Ucapan ini belum cocok dengan katalog.",
};

const problemCopy: Record<VoiceDraftProblem["code"], string> = {
  "row-id": "Bukti pesanan berubah. Baca ulang pesanan sebelum melanjutkan.",
  unresolved: "Masih ada baris yang belum dikonfirmasi.",
  quantity: "Jumlah harus berupa angka bulat dari 1 sampai 999.",
  unavailable: "Menu yang dipilih sudah tidak aktif atau tidak tersedia.",
  note: "Catatan menu maksimal 200 karakter.",
  "note-conflict": "Menu yang sama memiliki catatan berbeda.",
  aggregate: "Jumlah gabungan menu yang sama melebihi 999.",
  payment: "Pilih metode pembayaran terlebih dahulu.",
  empty: "Sisakan setidaknya satu menu untuk dimasukkan.",
};

const paymentMethods: readonly VoicePaymentMethod[] = ["Tunai", "QRIS", "Transfer"];

function paymentIcon(method: VoicePaymentMethod) {
  if (method === "Tunai") return <Banknote size={18}/>;
  if (method === "QRIS") return <Grid2X2 size={18}/>;
  return <Landmark size={18}/>;
}

function productName(products: readonly Product[], productId: string | null | undefined) {
  if (!productId) return "Belum dipilih";
  return products.find(product => product.id === productId)?.name ?? productId;
}

function candidateCaption(candidate: VoiceCandidate) {
  if (candidate.method === "ai") return "Usulan AI · wajib dikonfirmasi";
  if (candidate.method === "phonetic") return "Bunyi paling dekat";
  return `${Math.round(candidate.score * 100)}% mirip`;
}

function paymentStateCopy(payment: VoicePaymentReview) {
  if (payment.status === "unspecified") return "Metode tidak disebutkan · Tunai dipakai sebagai default";
  if (payment.status === "explicit") return "Metode terdengar jelas";
  if (payment.status === "conflicting") return "Metode pembayaran saling bertentangan";
  return "Metode pembayaran belum jelas";
}

function validationIssues(validation: VoiceDraftValidation): VoiceDraftProblem[] {
  return validation.ok ? [] : validation.issues;
}

export function VoiceOrderPreview({
  review,
  draft,
  products,
  existingCart,
  draftValidation,
  mergeValidation,
  unavailableProductIds,
  confirmDisabled,
  disabledReason,
  onDraftChange,
  onApplyProductNote,
  onConfirm,
}: VoiceOrderPreviewProps) {
  const activeProducts = products.filter(product => product.active !== false);
  const mergeIssues = validationIssues(mergeValidation);
  const draftIssues = validationIssues(draftValidation);
  const updateRow = (id: string, patch: Partial<VoiceDraftRow>) => {
    onDraftChange({ ...draft, rows: draft.rows.map(row => row.id === id ? { ...row, ...patch } : row) });
  };
  const acceptProduct = (row: VoiceDraftRow, productId: string) => {
    updateRow(row.id, { productId, accepted: true });
  };
  const updatePayment = (method: VoicePaymentMethod) => {
    onDraftChange({ ...draft, payment: method, paymentAccepted: true });
  };

  return <section className={styles.preview} aria-labelledby="voice-review-title">
    <div className={styles.intro}>
      <div>
        <span className={styles.eyebrow}>TINJAUAN PESANAN</span>
        <h3 id="voice-review-title">Pastikan tiap ucapan sudah tepat.</h3>
        <p>Menu, jumlah, dan catatan sudah diisi. Periksa hasilnya; bagian yang belum jelas tetap bisa diperbaiki.</p>
      </div>
      <span className={styles.counter}>{review.lines.length} frasa</span>
    </div>

    {draft.rows.some(row => !row.removed && !row.accepted && review.lines.some(line => line.id === row.id && line.status === "suggested" && !line.issue)) && <button type="button" className="button secondary full-width" onClick={() => onDraftChange(acceptVoiceSuggestions(review, draft))}><CheckCheck size={17}/>Terima saran yang jelas</button>}

    <div className={styles.timeline}>
      {review.lines.map((line, index) => {
        const row = draft.rows.find(item => item.id === line.id);
        if (!row) return <article className={`${styles.row} ${styles.problemRow}`} key={line.id}>
          <span className={styles.step}>{index + 1}</span>
          <div><q>{line.raw}</q><p role="alert">Baris tidak dapat diedit. Baca ulang pesanan.</p></div>
        </article>;
        const selected = products.find(product => product.id === row.productId);
        const inactiveSelection = Boolean(row.productId) && !activeProducts.some(product => product.id === row.productId);
        const stockUnavailable = !!row.productId && unavailableProductIds.has(row.productId);
        const rowIssues = draftIssues.filter(issue => issue.rowId === row.id);
        const hasSuggestedSelection = line.status === "suggested" && line.candidates[0]?.productId === row.productId;
        const quantityValid = Number.isInteger(row.quantity) && (row.quantity ?? 0) >= 1 && (row.quantity ?? 0) <= 999;

        if (row.removed) return <article className={`${styles.row} ${styles.removedRow}`} key={line.id}>
          <span className={styles.step}>{index + 1}</span>
          <div className={styles.removedCopy}>
            <div><span className={styles.status}>Dihapus dari pesanan</span><q>{line.raw}</q></div>
            <button type="button" className="button secondary small" onClick={() => updateRow(row.id, { removed: false })}><RotateCcw size={14}/>Pulihkan baris</button>
          </div>
        </article>;

        return <article className={`${styles.row} ${row.accepted ? styles.acceptedRow : styles.unresolvedRow}`} key={line.id}>
          <span className={styles.step}>{index + 1}</span>
          <div className={styles.rowBody}>
            <div className={styles.evidence}>
              <div>
                <span className={`${styles.status} ${line.status === "exact" ? styles.exact : ""}`}>{statusCopy[line.status]}</span>
                <q>{line.raw}</q>
              </div>
              {row.accepted ? <span className={styles.accepted}><Check size={13}/>Diterima</span> : <span className={styles.needsAction}><CircleAlert size={13}/>Butuh tindakan</span>}
            </div>

            {line.issue && <p className={styles.explanation}><CircleAlert size={14}/>{issueCopy[line.issue]}</p>}

            {line.candidates.length > 0 && <div className={styles.candidates} aria-label={`Pilihan untuk ${line.raw}`}>
              {line.candidates.map(candidate => {
                const unavailable = unavailableProductIds.has(candidate.productId) || products.find(product => product.id === candidate.productId)?.active === false;
                return <button
                  type="button"
                  key={candidate.productId}
                  aria-pressed={row.accepted && row.productId === candidate.productId}
                  disabled={unavailable}
                  onClick={() => acceptProduct(row, candidate.productId)}
                >
                  <span><strong>{productName(products, candidate.productId)}</strong><small>{candidateCaption(candidate)}{unavailable ? " · stok tidak cukup" : ""}</small></span>
                  {row.accepted && row.productId === candidate.productId && <Check size={15}/>} 
                </button>;
              })}
              {hasSuggestedSelection && !row.accepted && <button type="button" className={styles.suggestionAction} disabled={stockUnavailable} onClick={() => acceptProduct(row, row.productId!)}><Sparkles size={14}/>Gunakan saran</button>}
            </div>}

            <div className={styles.editorGrid}>
              <label className={styles.menuField}>
                <span>Menu katalog</span>
                <select
                  value={row.productId ?? ""}
                  onChange={event => updateRow(row.id, { productId: event.target.value || null, accepted: false })}
                >
                  <option value="">Pilih dari katalog...</option>
                  {inactiveSelection && <option value={row.productId!} disabled>{productName(products, row.productId)} · tidak tersedia</option>}
                  {activeProducts.map(product => <option key={product.id} value={product.id} disabled={unavailableProductIds.has(product.id)}>{product.name}{unavailableProductIds.has(product.id) ? " · stok tidak cukup" : ""}</option>)}
                </select>
              </label>
              <button type="button" className="button secondary small" disabled={!row.productId || stockUnavailable || inactiveSelection} onClick={() => acceptProduct(row, row.productId!)}><Check size={14}/>Pilih menu</button>
              <label>
                <span>Jumlah</span>
                <input type="number" inputMode="numeric" min="1" max="999" step="1" value={row.quantity ?? ""} onChange={event => updateRow(row.id, { quantity: event.target.value === "" ? null : Number(event.target.value) })}/>
              </label>
              <label className={styles.noteField}>
                <span>Catatan</span>
                <input maxLength={200} value={row.note} placeholder="Opsional, mis. tanpa es" onChange={event => updateRow(row.id, { note: event.target.value })}/>
              </label>
            </div>

            <div className={styles.rowFooter}>
              <span>{selected ? <><strong>{currency(selected.price)}</strong> / menu{quantityValid ? ` · ${currency(selected.price * row.quantity!)}` : ""}</> : "Harga tampil setelah menu dipilih"}</span>
              <button type="button" className={styles.removeButton} onClick={() => updateRow(row.id, { removed: true })}><Trash2 size={14}/>Hapus baris</button>
            </div>

            {(stockUnavailable || rowIssues.length > 0) && <div className={styles.rowAlert} role="alert">
              <CircleAlert size={15}/>
              <span>{stockUnavailable ? "Stok bahan untuk jumlah ini belum cukup." : problemCopy[rowIssues[0].code]}</span>
            </div>}
          </div>
        </article>;
      })}
    </div>

    <fieldset className={`${styles.payment} ${draft.paymentAccepted ? styles.paymentAccepted : styles.paymentUnresolved}`}>
      <legend>Metode pembayaran</legend>
      <div className={styles.paymentHeading}>
        <div>
          <strong>{paymentStateCopy(review.payment)}</strong>
          {review.payment.raw.length > 0 ? <p>Ucapan: “{review.payment.raw.join(" · ")}”</p> : <p>Tidak ada metode pembayaran dalam ucapan.</p>}
        </div>
        {draft.paymentAccepted && <span><Check size={13}/>Diterima</span>}
      </div>
      <div className={styles.paymentOptions}>
        {paymentMethods.map(method => <button
          type="button"
          key={method}
          aria-pressed={draft.paymentAccepted && draft.payment === method}
          className={review.payment.suggestedMethods?.includes(method) && !draft.paymentAccepted ? styles.paymentSuggestion : ""}
          onClick={() => updatePayment(method)}
        >
          {paymentIcon(method)}<span>{method}{review.payment.suggestedMethods?.includes(method) && !draft.paymentAccepted && <small>Saran dari ucapan</small>}</span>{draft.paymentAccepted && draft.payment === method && <Check size={14}/>}
        </button>)}
      </div>
    </fieldset>

    {mergeIssues.filter(issue => issue.code === "note-conflict").map((issue, index) => <div className={styles.conflict} key={`${issue.productId}-${index}`}>
      <CircleAlert size={17}/>
      <div>
        <strong>Catatan {productName(products, issue.productId)} berbeda.</strong>
        <p>Samakan catatan sebelum menggabungkan dengan {existingCart.some(item => item.productId === issue.productId) ? "keranjang" : "baris lain"}. Catatan yang sudah ada: “{issue.existingNote || "tanpa catatan"}”.</p>
        {issue.productId && <button type="button" onClick={() => onApplyProductNote(issue.productId!, issue.existingNote ?? "")}>Gunakan catatan yang sudah ada</button>}
      </div>
    </div>)}

    <div className={styles.confirmArea}>
      {confirmDisabled && <p className={styles.blocker} role="status"><CircleAlert size={15}/>{disabledReason || problemCopy[mergeIssues[0]?.code ?? "unresolved"]}</p>}
      <button type="button" className="button primary full-width" disabled={confirmDisabled} onClick={onConfirm}><Check size={17}/>Konfirmasi ke keranjang</button>
      <small>Harga, katalog, stok, izin, jumlah, catatan, dan pembayaran diperiksa lagi saat dikonfirmasi.</small>
    </div>
  </section>;
}
