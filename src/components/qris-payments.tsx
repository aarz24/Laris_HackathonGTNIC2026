"use client";

import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown, ChevronUp, Clock3, Grid2X2, LoaderCircle, RefreshCw, ShieldCheck, Upload, X } from "lucide-react";
import {
  cancelQrisAction, confirmQrisAction, getQrisRequestAction, inspectQrisImageAction, loadQrisAction,
  prepareQrisAction, saveQrisAction, setQrisEnabledAction,
} from "@/app/qris-actions";
import type { QrisCheckoutInput, QrisConfig, QrisRequest, QrisRequestSummary } from "@/lib/qris";
import { currency } from "@/lib/laris-data";
import { MAX_UPLOAD_BYTES } from "@/lib/upload-limits";
import styles from "./qris-payments.module.css";

type SaleResult = NonNullable<Extract<Awaited<ReturnType<typeof confirmQrisAction>>, { ok: true }>["data"]["saleResult"]>;
type InspectedImage = Extract<Awaited<ReturnType<typeof inspectQrisImageAction>>, { ok: true }>["data"];
type PaidHandler = (result: SaleResult, request: QrisRequest, matchesCurrentCart?: boolean) => void;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Permintaan belum selesai. Periksa koneksi lalu muat ulang status pembayaran.";
}

function preventOuterSubmit(event: KeyboardEvent<HTMLElement>) {
  if (event.key === "Enter" && event.target instanceof HTMLInputElement && !["button", "submit", "file", "checkbox"].includes(event.target.type)) event.preventDefault();
}

function useActionGate() {
  const alive = useRef(true);
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const run = async (operation: (isCurrent: () => boolean) => Promise<void>) => {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError("");
    try { await operation(() => alive.current); }
    catch (caught) { if (alive.current) setError(errorMessage(caught)); }
    finally { locked.current = false; if (alive.current) setBusy(false); }
  };
  return { busy, error, setError, run };
}

function useQrisData() {
  const [configuration, setConfiguration] = useState<QrisConfig | null>(null);
  const [requests, setRequests] = useState<QrisRequestSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const sequence = useRef(0);
  const reload = useCallback(async () => {
    const revision = ++sequence.current;
    setLoading(true); setError("");
    try {
      const result = await loadQrisAction();
      if (revision !== sequence.current) return;
      if (!result.ok) { setError(result.error); return; }
      setConfiguration(result.data.configuration); setRequests(result.data.requests);
    } catch (caught) {
      if (revision === sequence.current) setError(errorMessage(caught));
    } finally {
      if (revision === sequence.current) setLoading(false);
    }
  }, []);
  useEffect(() => { const revisions = sequence; void reload(); return () => { revisions.current++; }; }, [reload]);
  const update = (request: QrisRequest) => setRequests(current => {
    const rest = current.filter(entry => entry.id !== request.id);
    return request.status === "pending" || request.status === "received_unrecorded" ? [request, ...rest] : rest;
  });
  return { configuration, requests, loading, error, reload, update, setConfiguration };
}

function ErrorNotice({ message }: { message: string }) {
  return message ? <p className={`form-error ${styles.error}`} role="alert">{message}</p> : null;
}

function Loading() {
  return <p className={styles.loading} role="status"><LoaderCircle size={16} className="spin"/> Memuat pembayaran QRIS…</p>;
}

function Merchant({ configuration }: { configuration: QrisConfig }) {
  return <div className={styles.merchant}><strong>{configuration.merchantName}</strong><span>{configuration.merchantCity} · {configuration.providerLabel}</span></div>;
}

function QrImage({ src, merchant }: { src: string; merchant: string }) {
  // The server returns a bounded canonical PNG; do not send merchant codes to a third-party image service.
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={styles.qr} src={src} width={320} height={320} alt={`QRIS merchant ${merchant}`} />;
}

export function QrisSettings({ canManage }: { canManage: boolean }) {
  const data = useQrisData();
  const gate = useActionGate();
  const [preview, setPreview] = useState<InspectedImage | null>(null);
  const [providerLabel, setProviderLabel] = useState("");
  const [ownershipConfirmed, setOwnershipConfirmed] = useState(false);
  const [notice, setNotice] = useState("");
  const inputId = useId();

  const inspect = (file: File) => gate.run(async current => {
    setNotice(""); setPreview(null); setOwnershipConfirmed(false);
    if (!canManage) throw new Error("Hanya owner yang dapat mengatur QRIS toko.");
    if (!file.size || file.size > MAX_UPLOAD_BYTES) throw new Error("Gunakan gambar QRIS maksimal 3 MB.");
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw new Error("Gunakan gambar PNG, JPG, atau WebP.");
    const form = new FormData(); form.set("file", file);
    const result = await inspectQrisImageAction(form);
    if (!current()) return;
    if (!result.ok) throw new Error(result.error);
    setPreview(result.data);
  });

  const save = () => gate.run(async current => {
    if (!preview || !ownershipConfirmed || !canManage) return;
    const result = await saveQrisAction({ validationToken: preview.validationToken, providerLabel: providerLabel.trim(), ownershipConfirmed: true });
    if (!current()) return;
    if (!result.ok) throw new Error(result.error);
    data.setConfiguration(result.data); setPreview(null); setOwnershipConfirmed(false);
    setNotice("QRIS tersimpan. Kasir dapat menampilkannya untuk pembayaran baru.");
  });

  const toggle = () => gate.run(async current => {
    if (!data.configuration || !canManage) return;
    const result = await setQrisEnabledAction({ id: data.configuration.id, enabled: !data.configuration.enabled });
    if (!current()) return;
    if (!result.ok) throw new Error(result.error);
    data.setConfiguration(result.data);
    setNotice(result.data.enabled ? "QRIS diaktifkan untuk pembayaran baru." : "QRIS dinonaktifkan untuk pembayaran baru. Permintaan tersimpan tetap dapat diperiksa.");
  });

  return <section className={styles.panel} aria-labelledby={`${inputId}-title`} onKeyDown={preventOuterSubmit}>
    <div className={styles.heading}><Grid2X2 size={21}/><div><h3 id={`${inputId}-title`}>QRIS toko</h3><p>Terima pembayaran melalui QRIS merchant milik usaha ini.</p></div></div>
    {data.loading && <Loading/>}
    <ErrorNotice message={data.error || gate.error}/>
    {data.error && <button type="button" className="button secondary small" disabled={data.loading || gate.busy} onClick={() => void data.reload()}><RefreshCw size={15}/>Muat ulang QRIS</button>}
    {!data.loading && data.configuration && <div className={styles.config}>
      <Merchant configuration={data.configuration}/>
      <span className={`${styles.badge} ${!data.configuration.enabled ? styles.mutedBadge : ""}`}>{data.configuration.enabled ? "Aktif untuk pembayaran baru" : "Tidak aktif"}</span>
      <details><summary>Lihat QRIS yang tersimpan</summary><QrImage src={data.configuration.imageDataUrl} merchant={data.configuration.merchantName}/></details>
      {canManage && <button type="button" className="button secondary small" disabled={gate.busy || data.loading} onClick={() => void toggle()}>{gate.busy ? <LoaderCircle size={15} className="spin"/> : <ShieldCheck size={15}/>} {data.configuration.enabled ? "Nonaktifkan QRIS" : "Aktifkan QRIS"}</button>}
    </div>}
    {!canManage ? <p className={styles.hint}>Hanya owner yang dapat mengunggah atau mengganti QRIS usaha.</p> : <>
      <label className={styles.upload} htmlFor={inputId}><Upload size={20}/><strong>{gate.busy ? "Memeriksa QRIS…" : data.configuration ? "Pilih QRIS pengganti" : "Unggah QRIS merchant"}</strong><span>PNG, JPG, atau WebP · maksimal 3 MB. Gunakan QRIS statis dari aplikasi merchant atau bank.</span><input id={inputId} type="file" accept="image/png,image/jpeg,image/webp" disabled={gate.busy || data.loading} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void inspect(file); }}/></label>
      {preview && <div className={styles.preview}>
        <strong>Periksa penerima sebelum menyimpan</strong>
        <QrImage src={preview.imageDataUrl} merchant={preview.merchantName}/>
        <div className={styles.merchant}><strong>{preview.merchantName}</strong><span>{preview.merchantCity}</span></div>
        <label className="field"><span>Bank atau penyedia QRIS</span><input value={providerLabel} maxLength={80} disabled={gate.busy} placeholder="Contoh: BCA atau GoPay Merchant" onChange={event => setProviderLabel(event.target.value)}/></label>
        <label className={styles.check}><input type="checkbox" checked={ownershipConfirmed} disabled={gate.busy} onChange={event => setOwnershipConfirmed(event.target.checked)}/><span>Saya memastikan QRIS ini aktif, milik usaha ini, dan nama penerima sesuai di aplikasi pembayaran.</span></label>
        <p className={styles.hint}>Nama dibaca dari kode QR. Laris tidak memverifikasi kepemilikan rekening atau status aktivasi dengan bank. Penggantian berlaku untuk permintaan baru.</p>
        <div className={styles.actions}><button type="button" className="button primary" disabled={gate.busy || !ownershipConfirmed || !providerLabel.trim()} onClick={() => void save()}>{gate.busy ? <LoaderCircle size={16} className="spin"/> : <Check size={16}/>}Simpan QRIS toko</button><button type="button" className="button secondary" disabled={gate.busy} onClick={() => { setPreview(null); setOwnershipConfirmed(false); }}>Batal mengganti</button></div>
      </div>}
    </>}
    <div className="notice amber"><ShieldCheck size={19}/><p>Pembayaran masuk melalui penyedia QRIS toko. Kasir wajib memeriksa transaksi masuk di aplikasi merchant sebelum mencatat pembayaran di Laris. Konfirmasi belum otomatis.</p></div>
    {notice && <p className={styles.success} role="status">{notice}</p>}
  </section>;
}

function RequestPanel({ request: initialRequest, busyOutside = false, onChange, onPaid, onClose }: { request: QrisRequest; busyOutside?: boolean; onChange: (request: QrisRequest) => void; onPaid: PaidHandler; onClose?: () => void }) {
  const gate = useActionGate();
  const [request, setRequest] = useState(initialRequest);
  const [stale, setStale] = useState(true);
  const [checking, setChecking] = useState(true);
  const [readError, setReadError] = useState("");
  const live = useRef(true);
  const revision = useRef(0);
  const readInFlight = useRef<number | null>(null);
  const mutationInFlight = useRef(false);
  const deliveredPaid = useRef(false);
  const status = useRef(request.status);
  const callbacks = useRef({ onChange, onPaid });
  callbacks.current = { onChange, onPaid };
  status.current = request.status;
  const [reference, setReference] = useState(request.paymentReference ?? "");
  const [confirmed, setConfirmed] = useState(false);
  const [noPaymentReceived, setNoPaymentReceived] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const titleId = useId();
  const busy = gate.busy || busyOutside || checking;
  const recovery = request.status === "received_unrecorded";
  const pending = request.status === "pending";
  const setActionError = gate.setError;

  const acceptResult = useCallback((result: { request: QrisRequest; saleResult?: SaleResult }) => {
    setRequest(result.request); setStale(false); setReadError("");
    callbacks.current.onChange(result.request);
    if (result.request.status === "paid" && result.saleResult && !deliveredPaid.current) {
      deliveredPaid.current = true;
      callbacks.current.onPaid(result.saleResult, result.request);
    }
  }, []);

  const refresh = useCallback(async () => {
    if (readInFlight.current !== null || mutationInFlight.current || !live.current) return;
    const currentRevision = ++revision.current;
    readInFlight.current = currentRevision;
    setChecking(true);
    try {
      const result = await getQrisRequestAction({ id: initialRequest.id });
      if (!live.current || currentRevision !== revision.current) return;
      if (!result.ok) throw new Error(result.error);
      setActionError(""); acceptResult(result.data);
    } catch (caught) {
      if (live.current && currentRevision === revision.current) {
        setStale(true); setReadError(errorMessage(caught));
      }
    } finally {
      if (readInFlight.current === currentRevision) readInFlight.current = null;
      if (live.current && currentRevision === revision.current) setChecking(false);
    }
  }, [acceptResult, initialRequest.id, setActionError]);

  useEffect(() => {
    const revisions = revision;
    live.current = true;
    const whenVisible = () => {
      if (document.visibilityState === "visible" && ["pending", "received_unrecorded"].includes(status.current)) void refresh();
    };
    const visibilityChanged = () => {
      if (document.visibilityState === "visible" && ["pending", "received_unrecorded"].includes(status.current)) { setStale(true); void refresh(); }
    };
    void refresh();
    const interval = window.setInterval(whenVisible, 15_000);
    document.addEventListener("visibilitychange", visibilityChanged);
    return () => { live.current = false; revisions.current++; readInFlight.current = null; window.clearInterval(interval); document.removeEventListener("visibilitychange", visibilityChanged); };
  }, [refresh]);

  useEffect(() => {
    const rank = { pending: 0, received_unrecorded: 1, paid: 2, cancelled: 2 };
    if (initialRequest.status !== request.status && rank[initialRequest.status] > rank[request.status]) {
      revision.current++; readInFlight.current = null;
      setRequest(initialRequest); setStale(true); void refresh();
    }
  }, [initialRequest, request.status, refresh]);

  const confirm = () => gate.run(async current => {
    if (stale || checking || (!recovery && (!confirmed || reference.trim().length < 6))) return;
    mutationInFlight.current = true; revision.current++;
    try {
      const result = await confirmQrisAction({ id: request.id, reference: request.paymentReference || reference.trim(), confirmed: true });
      if (!current()) return;
      if (!result.ok) throw new Error(result.error);
      acceptResult(result.data);
    } catch (caught) {
      if (current()) setStale(true);
      throw caught;
    } finally { mutationInFlight.current = false; }
  });

  const cancel = () => gate.run(async current => {
    if (stale || checking || !pending || !noPaymentReceived) return;
    mutationInFlight.current = true; revision.current++;
    try {
      const result = await cancelQrisAction({ id: request.id, noPaymentReceived: true });
      if (!current()) return;
      if (!result.ok) throw new Error(result.error);
      acceptResult({ request: result.data }); setCancelOpen(false); setNoPaymentReceived(false);
    } catch (caught) {
      if (current()) setStale(true);
      throw caught;
    } finally { mutationInFlight.current = false; }
  });

  return <section className={styles.request} aria-labelledby={titleId} aria-busy={busy} onKeyDown={preventOuterSubmit}>
    <div className={styles.requestHeading}><div><span className={styles.eyebrow}>Permintaan {request.id.slice(0, 8)}</span><h4 id={titleId}>{recovery ? "Pembayaran diterima, pencatatan tertunda" : request.status === "paid" ? "Pembayaran tercatat" : request.status === "cancelled" ? "Permintaan dibatalkan" : "Menunggu pengecekan kasir"}</h4></div>{onClose && <button type="button" className="icon-button" aria-label="Tutup rincian pembayaran QRIS" disabled={busy} onClick={onClose}><X size={17}/></button>}</div>
    <Merchant configuration={request.configuration}/>
    <div className={styles.amount}><span>Total yang harus diterima</span><strong>{currency(request.total)}</strong></div>
    <details className={styles.orderDetails}><summary>Lihat {request.items.length} baris pesanan · {request.customerName || "Pelanggan umum"}</summary><ul>{request.items.map((item, index) => <li key={`${item.productId}-${index}`}><span>{item.quantity}× {item.name}{item.note && <small>{item.note}</small>}</span><strong>{currency(item.unitPrice * item.quantity)}</strong></li>)}</ul><div><span>Subtotal</span><span>{currency(request.subtotal)}</span></div><div><span>Diskon</span><span>{currency(request.discount)}</span></div><div><span>Pajak</span><span>{currency(request.tax)}</span></div></details>
    <div className={styles.actions}><button type="button" className="button secondary small" disabled={busy} onClick={() => void refresh()}>{checking ? <LoaderCircle size={15} className="spin"/> : <RefreshCw size={15}/>}Muat ulang status permintaan</button><span className={styles.hint}>{checking ? "Memeriksa status tersimpan…" : "Status diperiksa berkala saat layar ini terbuka."}</span></div>
    {stale && <div className="notice amber" role="status"><Clock3 size={18}/><p>QR dan tombol konfirmasi disembunyikan sampai status terbaru berhasil dimuat. Jika pelanggan sudah membayar, periksa aplikasi merchant dan jangan meminta pembayaran ulang.</p></div>}
    {pending && !stale && <>
      <QrImage src={request.configuration.imageDataUrl} merchant={request.configuration.merchantName}/>
      <p className={styles.instruction}>Pelanggan memindai QRIS, memastikan nama merchant, lalu memasukkan <strong>{currency(request.total)}</strong> di aplikasi pembayaran.</p>
      <p className={styles.hint}>Jumlah dan QRIS pada permintaan ini sudah disimpan. Perubahan keranjang atau pengaturan tidak mengubah permintaan ini. Menutup layar tidak membatalkan pembayaran.</p>
      <div className="notice amber"><ShieldCheck size={18}/><p><strong>Konfirmasi manual oleh kasir.</strong> Periksa transaksi masuk di aplikasi merchant, termasuk nominal dan nomor referensinya.</p></div>
      <label className="field"><span>Nomor referensi pembayaran</span><input aria-describedby={`${titleId}-reference-hint`} value={reference} maxLength={100} minLength={6} disabled={busy} autoComplete="off" spellCheck={false} onChange={event => { setReference(event.target.value); setConfirmed(false); }} placeholder="Salin referensi transaksi dari aplikasi merchant"/></label>
      <p id={`${titleId}-reference-hint`} className={styles.hint}>Gunakan referensi unik yang tampil pada transaksi masuk. Minimal 6 karakter.</p>
      <label className={styles.check}><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)}/><span>Saya sudah memeriksa pembayaran masuk sebesar <strong>{currency(request.total)}</strong> untuk pesanan ini di aplikasi merchant.</span></label>
    </>}
    {recovery && <div className="notice amber" role="status"><Clock3 size={19}/><p><strong>Jangan minta pelanggan membayar lagi.</strong> Penerimaan sudah dikonfirmasi dengan referensi <strong>{request.paymentReference}</strong>. {request.recordingError || "Periksa stok bahan sebelum melanjutkan pencatatan."}</p></div>}
    <ErrorNotice message={gate.error || readError}/>
    {(pending || recovery) && !stale && <button type="button" className="button primary full-width" disabled={busy || (pending && (!confirmed || reference.trim().length < 6))} onClick={() => void confirm()}>{gate.busy ? <LoaderCircle size={17} className="spin"/> : <Check size={17}/>} {recovery ? "Coba catat pembayaran yang diterima" : "Pembayaran sudah diterima"}</button>}
    {pending && !stale && <div className={styles.cancel}>
      <button type="button" className="text-button" disabled={busy} aria-expanded={cancelOpen} onClick={() => setCancelOpen(current => !current)}>Batalkan permintaan {cancelOpen ? <ChevronUp size={15}/> : <ChevronDown size={15}/>}</button>
      {cancelOpen && <><p className={styles.hint}>Lakukan hanya setelah memastikan tidak ada pembayaran masuk. Pembatalan ini tidak mengembalikan dana atau menonaktifkan QRIS toko.</p><label className={styles.check}><input type="checkbox" checked={noPaymentReceived} disabled={busy} onChange={event => setNoPaymentReceived(event.target.checked)}/><span>Saya memastikan pembayaran untuk permintaan ini belum diterima.</span></label><button type="button" className="button destructive small" disabled={busy || !noPaymentReceived} onClick={() => void cancel()}>Batalkan permintaan tanpa pembayaran</button></>}
    </div>}
    {request.status === "paid" && <p className={styles.success} role="status">Penjualan, stok, dan catatan pembayaran tersimpan. Referensi: {request.paymentReference}.</p>}
    {request.status === "cancelled" && <p className={styles.hint} role="status">Permintaan dibatalkan oleh kasir. Tidak ada penjualan yang dicatat dari permintaan ini.</p>}
  </section>;
}

function RequestList({ requests, disabled, onSelect }: { requests: QrisRequestSummary[]; disabled: boolean; onSelect: (request: QrisRequestSummary) => void }) {
  if (!requests.length) return null;
  return <ul className={styles.requestList}>{requests.map(request => <li key={request.id}><button type="button" disabled={disabled} onClick={() => onSelect(request)}><span><strong>{request.customerName || "Pelanggan umum"}</strong><small>{request.id.slice(0, 8)} · {request.status === "received_unrecorded" ? "Diterima, perlu pencatatan" : "Menunggu pengecekan"}</small></span><span>{currency(request.total)}<ChevronDown size={16}/></span></button></li>)}</ul>;
}

function inputFingerprint(input: QrisCheckoutInput) {
  return JSON.stringify({ items: input.items, discount: input.discount, taxEnabled: input.taxEnabled, customerName: input.customerName || "", customerPhone: input.customerPhone || "", channel: input.channel });
}

export function QrisCheckout({ input, activeRequest, onRequestChange, onPreparing, onPaid, onNewAttempt }: { input: QrisCheckoutInput; activeRequest: QrisRequest | null; onRequestChange: (request: QrisRequest, newlyPrepared?: boolean) => void; onPreparing: (busy: boolean) => void; onPaid: PaidHandler; onNewAttempt: () => void }) {
  const data = useQrisData();
  const gate = useActionGate();
  const [selected, setSelected] = useState<QrisRequest | null>(activeRequest);
  const prepared = useRef<{ id: string; fingerprint: string; key: string } | null>(null);
  const [showSaved, setShowSaved] = useState(false);
  const [finishedKey, setFinishedKey] = useState<string | null>(null);
  const needsNewAttempt = finishedKey !== null && input.idempotencyKey === finishedKey;
  const activeUnresolved = activeRequest?.status === "pending" || activeRequest?.status === "received_unrecorded";
  const displayed = activeUnresolved ? activeRequest : selected;

  const prepare = () => gate.run(async current => {
    if (!input.idempotencyKey || needsNewAttempt || activeUnresolved) return;
    const fingerprint = inputFingerprint(input);
    onPreparing(true);
    try {
      const result = await prepareQrisAction(input);
      if (result.ok) onRequestChange(result.data, true);
      if (!current()) return;
      if (!result.ok) { void data.reload(); throw new Error(result.error); }
      prepared.current = { id: result.data.id, fingerprint, key: input.idempotencyKey };
      if (result.data.status === "paid" || result.data.status === "cancelled") setFinishedKey(input.idempotencyKey);
      setSelected(result.data); data.update(result.data);
    } finally { onPreparing(false); }
  });

  const updated = (request: QrisRequest) => {
    setSelected(request); data.update(request);
    if (request.id === activeRequest?.id || request.id === prepared.current?.id) onRequestChange(request, false);
    if ((request.status === "paid" || request.status === "cancelled") && prepared.current?.id === request.id) setFinishedKey(prepared.current.key);
  };
  const paid: PaidHandler = (result, request) => onPaid(result, request, prepared.current?.id === request.id && prepared.current.fingerprint === inputFingerprint(input));
  const selectSaved = (summary: QrisRequestSummary) => gate.run(async current => {
    const result = await getQrisRequestAction({ id: summary.id });
    if (!current()) return;
    if (!result.ok) throw new Error(result.error);
    setSelected(result.data.request); data.update(result.data.request);
  });
  const startNew = () => { onNewAttempt(); prepared.current = null; setSelected(null); setShowSaved(false); void data.reload(); };
  const newAttemptButton = <button type="button" className="button secondary full-width" disabled={gate.busy} onClick={startNew}>Mulai permintaan QRIS baru untuk keranjang ini</button>;
  return <section className={styles.checkout} aria-label="Pembayaran QRIS toko" onKeyDown={preventOuterSubmit}>
    {displayed ? <><RequestPanel key={displayed.id} request={displayed} onChange={updated} onPaid={paid} onClose={activeUnresolved && displayed.id === activeRequest?.id ? undefined : () => { setSelected(null); void data.reload(); }}/>{(displayed.status === "paid" || displayed.status === "cancelled") && newAttemptButton}</> : <>
      {data.loading && <Loading/>}
      <ErrorNotice message={data.error || gate.error}/>
      {!data.loading && !data.error && (!data.configuration || !data.configuration.enabled) && <div className="notice amber"><Grid2X2 size={19}/><p>QRIS toko belum aktif. Minta owner mengunggah QRIS merchant melalui Pengaturan, atau pilih pembayaran tunai.</p></div>}
      {needsNewAttempt && <><p className={styles.hint} role="status">Permintaan sebelumnya sudah selesai atau dibatalkan. Buat permintaan baru hanya jika pelanggan memang akan melakukan pembelian baru.</p>{newAttemptButton}</>}
      {!data.loading && data.configuration?.enabled && <><Merchant configuration={data.configuration}/><p className={styles.hint}>Buat permintaan terlebih dahulu agar nominal pesanan tersimpan. Pembayaran dicatat setelah kasir memeriksa transaksi masuk di aplikasi merchant.</p><button type="button" className="button primary full-width" disabled={gate.busy || data.loading || Boolean(data.error) || !input.items.length || !input.idempotencyKey || needsNewAttempt} onClick={() => void prepare()}>{gate.busy ? <LoaderCircle size={17} className="spin"/> : <Grid2X2 size={17}/>}Simpan permintaan & tampilkan QRIS</button></>}
      <div className={styles.actions}><button type="button" className="button secondary small" disabled={gate.busy || data.loading} onClick={() => void data.reload()}><RefreshCw size={15}/>Muat ulang status</button>{data.requests.length > 0 && <button type="button" className="text-button" disabled={gate.busy || data.loading} aria-expanded={showSaved} onClick={() => setShowSaved(value => !value)}>Permintaan tersimpan ({data.requests.length}) {showSaved ? <ChevronUp size={15}/> : <ChevronDown size={15}/>}</button>}</div>
      {showSaved && <RequestList requests={data.requests} disabled={gate.busy || data.loading} onSelect={request => void selectSaved(request)}/>}
      <p className={styles.hint}>Jika koneksi terputus, muat ulang status dan periksa permintaan tersimpan sebelum membuat pesanan lain.</p>
    </>}
  </section>;
}

export function QrisPending({ onPaid, onRequestChange }: { onPaid: PaidHandler; onRequestChange?: (request: QrisRequest) => void }) {
  const data = useQrisData();
  const gate = useActionGate();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<QrisRequest | null>(null);
  const recovered = data.requests.filter(request => request.status === "received_unrecorded").length;
  const updated = (request: QrisRequest) => { setSelected(request); data.update(request); onRequestChange?.(request); };
  const selectSaved = (summary: QrisRequestSummary) => gate.run(async current => {
    const result = await getQrisRequestAction({ id: summary.id });
    if (!current()) return;
    if (!result.ok) throw new Error(result.error);
    setSelected(result.data.request); data.update(result.data.request);
  });
  return <section className={styles.pending} aria-label="Permintaan QRIS tersimpan">
    <div className={styles.pendingHeading}><div><Grid2X2 size={19}/><div><strong>Pembayaran QRIS tersimpan</strong><p>{data.loading ? "Memuat status…" : data.error ? "Status belum tersedia. Buka daftar untuk memeriksa." : recovered ? `${recovered} pembayaran diterima perlu diselesaikan pencatatannya.` : `${data.requests.length} permintaan menunggu pengecekan kasir.`}</p></div></div><button type="button" className="button secondary small" aria-expanded={open} onClick={() => { setOpen(value => !value); if (!open) void data.reload(); }}>{open ? "Tutup daftar" : "Periksa pembayaran"}{open ? <ChevronUp size={15}/> : <ChevronDown size={15}/>}</button></div>
    {open && <div className={styles.pendingBody}>
      <ErrorNotice message={data.error || gate.error}/>
      {data.loading && <Loading/>}
      <button type="button" className="button secondary small" disabled={data.loading} onClick={() => void data.reload()}><RefreshCw size={15}/>Muat ulang status</button>
      {!data.loading && !data.error && !data.requests.length && !selected && <p className={styles.hint}>Tidak ada permintaan QRIS yang belum selesai.</p>}
      {selected ? <RequestPanel key={selected.id} request={selected} busyOutside={data.loading} onChange={updated} onPaid={onPaid} onClose={() => { setSelected(null); void data.reload(); }}/> : <RequestList requests={data.requests} disabled={data.loading || gate.busy} onSelect={request => void selectSaved(request)}/>}
      <p className={styles.hint}>Menutup daftar tidak membatalkan permintaan. Status ini tersimpan untuk dilanjutkan dari perangkat kasir lain.</p>
    </div>}
  </section>;
}
