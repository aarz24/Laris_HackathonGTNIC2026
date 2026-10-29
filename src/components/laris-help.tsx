"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, BookOpen, Check, ChevronLeft, ChevronRight, CircleHelp, MapPin, Play, Search, ShieldCheck, X } from "lucide-react";
import { findGuideFeatures, type GuideFeature, type View } from "@/lib/laris-guide";
import styles from "./laris-help.module.css";

export function WelcomeGuide({ storageKey, mode, onStart, onHelp }: { storageKey: string; mode: "local" | "cloud"; onStart: () => void; onHelp: () => void }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    try { setVisible(localStorage.getItem(storageKey) !== "seen"); }
    catch { setVisible(true); }
  }, [storageKey]);

  function dismiss() {
    setVisible(false);
    try { localStorage.setItem(storageKey, "seen"); } catch { /* The optional welcome can still be dismissed for this session. */ }
  }

  if (!visible) return null;
  return <section className={styles.welcome} aria-labelledby="welcome-guide-title">
    <span className={styles.welcomeIcon}><BookOpen size={23}/></span>
    <div className={styles.welcomeCopy}>
      <span className={styles.eyebrow}>BARU DI LARIS?</span>
      <h2 id="welcome-guide-title">{mode === "local" ? "Coba satu pesanan, kenali alurnya." : "Kenalan sebentar, lebih lancar bekerja."}</h2>
      <p>{mode === "local" ? "Tur 6 langkah: kasir, stok, pelanggan, hingga laporan. Hanya melihat, tanpa checkout. Ulangi kapan saja lewat Bantuan." : "Kenali fitur sesuai peranmu, tanpa mengubah data. Owner mulai dari bahan dan menu. Bisa dilewati dan diulang lewat Bantuan."}</p>
      <div className={styles.actions}>
        <button className="button primary" onClick={() => { dismiss(); onStart(); }}><Play size={15}/>Mulai tur singkat</button>
        <button className="button secondary" onClick={() => { dismiss(); onHelp(); }}><Search size={15}/>Cari fitur dulu</button>
      </div>
    </div>
    <button className="icon-button" aria-label="Lewati pengenalan" title="Nanti saja; buka lagi lewat Bantuan" onClick={dismiss}><X size={18}/></button>
  </section>;
}

export function HelpCenter({ view, mode, onOpen, onTour }: {
  view: View;
  mode: "local" | "cloud";
  onOpen: (feature: GuideFeature) => void;
  onTour: (features?: GuideFeature[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [currentPageOnly, setCurrentPageOnly] = useState(false);
  const results = findGuideFeatures(query).filter(feature => !currentPageOnly || feature.view === view);

  return <div className={styles.help}>
    <div className={styles.tourIntro}>
      <span className={styles.welcomeIcon}><Play size={21}/></span>
      <div><h3>{mode === "local" ? "Dari pesanan ke laporan, dalam 6 langkah" : "Belajar sambil melihat langsung"}</h3><p>{mode === "local" ? "Lihat kasir, pembayaran, dampak stok dan pelanggan, lalu laporan. Tidak perlu checkout untuk menyelesaikan tur." : "Tur mengikuti peranmu. Owner mulai dari bahan dan menu sebelum penjualan serta laporan."} Tidak ada data yang diubah selama tur.</p></div>
      <button className="button primary" onClick={() => onTour()}><Play size={14}/>Mulai / ulangi tur</button>
    </div>
    <label className={`search-input ${styles.search}`}>
      <Search size={18}/><input autoFocus aria-label="Cari panduan fitur" value={query} onChange={event => setQuery(event.target.value)} placeholder="Coba: cetak struk, stok opname, undang tim..."/>
      {query && <button className="icon-button" aria-label="Hapus pencarian panduan" onClick={() => setQuery("")}><X size={16}/></button>}
    </label>
    <div className={styles.filters}>
      <div className={styles.actions}>
        <button className={currentPageOnly ? "button secondary small" : "button primary small"} aria-pressed={!currentPageOnly} onClick={() => setCurrentPageOnly(false)}>Semua fitur</button>
        <button className={currentPageOnly ? "button primary small" : "button secondary small"} aria-pressed={currentPageOnly} onClick={() => setCurrentPageOnly(true)}>Halaman ini</button>
      </div>
      <span role="status">{results.length} panduan</span>
    </div>
    <div className={styles.articles}>
      {results.map(feature => <details key={feature.id} className={styles.article}>
        <summary><span className={styles.articleIcon}><BookOpen size={18}/></span><span><strong>{feature.title}</strong><small>{feature.location}</small></span><ChevronRight size={17} className={styles.chevron}/></summary>
        <div className={styles.articleBody}>
          <p>{feature.description}</p>
          {feature.access && <p className={styles.access}><ShieldCheck size={14}/>{feature.access}</p>}
          <ol>{feature.steps.map(step => <li key={step}>{step}</li>)}</ol>
          {feature.note && <p className={styles.note}>{feature.note}</p>}
          <div className={styles.actions}>
            <button className="button primary small" onClick={() => onOpen(feature)}>Buka fitur<ArrowRight size={15}/></button>
            <button className="button secondary small" onClick={() => onTour([feature])}><MapPin size={15}/>Tunjukkan letaknya</button>
          </div>
        </div>
      </details>)}
      {!results.length && <div className={styles.noResults}><Search size={25}/><h3>Belum ketemu?</h3><p>Coba kata singkat seperti “pajak”, “struk”, atau “bahan”.</p><button className="button secondary" onClick={() => { setQuery(""); setCurrentPageOnly(false); }}>Lihat semua panduan</button></div>}
    </div>
    <p className={styles.footer}><CircleHelp size={15}/>Buka lagi lewat Bantuan di kanan atas. Pintasan: ? untuk panduan, Ctrl/⌘ K untuk pencarian.</p>
    <p className={styles.storageNote}>{mode === "local" ? "Demo: data fiktif hanya di browser ini, tidak dipindahkan ke akun. Mulai ulang demo di bagian atas mengembalikan data contoh dan pengenalan." : "Cloud: data operasional tersimpan di workspace Supabase sesuai akses tim."} Preferensi pengenalan disimpan di browser ini, bukan disinkronkan antarperangkat.</p>
  </div>;
}

export function GuidedTour({ features, onNavigate, onClose }: {
  features: GuideFeature[];
  onNavigate: (view: View) => void;
  onClose: (completed: boolean) => void;
}) {
  const [index, setIndex] = useState(0);
  const [highlight, setHighlight] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const feature = features[index];

  useEffect(() => {
    const dialog = dialogRef.current!;
    const previousFocus = document.activeElement as HTMLElement | null;
    dialog.showModal();
    return () => { dialog.close(); if (previousFocus?.isConnected && !previousFocus.closest("[inert]")) previousFocus.focus({ preventScroll: true }); };
  }, []);

  useEffect(() => {
    onNavigate(feature.view);
    let frame = 0;
    let positioning = 0;
    const measure = () => {
      const target = document.querySelector<HTMLElement>(`[data-tour="${feature.target}"]`);
      if (!target || !panelRef.current) { setHighlight(null); return; }
      const rect = target.getBoundingClientRect();
      const panel = panelRef.current.getBoundingClientRect();
      const left = Math.max(8, rect.left - 5);
      const top = Math.max(8, rect.top - 5);
      const overlapsPanel = rect.right > panel.left && rect.left < panel.right;
      const bottom = Math.min(window.innerHeight - 8, rect.bottom + 5, overlapsPanel && rect.top < panel.top ? panel.top - 12 : window.innerHeight - 8);
      const width = Math.min(window.innerWidth - 8, rect.right + 5) - left;
      setHighlight(width > 0 && bottom > top ? { top, left, width, height: bottom - top } : null);
    };
    frame = requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement>(`[data-tour="${feature.target}"]`);
      if (target && getComputedStyle(target).position !== "fixed") {
        const headerHeight = document.querySelector(".workspace-header")?.getBoundingClientRect().height ?? 68;
        window.scrollTo({ top: Math.max(0, window.scrollY + target.getBoundingClientRect().top - headerHeight - 16), behavior: "instant" });
      }
      if (panelRef.current) panelRef.current.scrollTop = 0;
      headingRef.current?.focus({ preventScroll: true });
      positioning = requestAnimationFrame(measure);
    });
    const observer = new ResizeObserver(measure);
    if (panelRef.current) observer.observe(panelRef.current);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(positioning);
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [feature, onNavigate]);

  return <dialog ref={dialogRef} className={styles.tour} aria-labelledby="tour-title" aria-describedby="tour-description" onCancel={event => { event.preventDefault(); onClose(false); }}>
    {highlight && <div className={styles.spotlight} style={highlight} aria-hidden="true"/>}
    <div className={`${styles.tourPanel} ${feature.target === "assistant" ? styles.tourPanelTop : ""}`} ref={panelRef}>
      <div className={styles.tourHeading}><span className={styles.eyebrow}>{features.length === 1 ? "LOKASI FITUR" : `TUR LARIS · ${index + 1} DARI ${features.length}`}</span><button className="icon-button" aria-label="Tutup tur" onClick={() => onClose(false)}><X size={18}/></button></div>
      <div className={styles.progress} role="progressbar" aria-label="Kemajuan tur" aria-valuemin={0} aria-valuemax={features.length} aria-valuenow={index + 1}><span style={{ width: `${(index + 1) / features.length * 100}%` }}/></div>
      <div key={feature.id} className={styles.tourCopy}>
        <p className={styles.location}><MapPin size={14}/>{feature.location}</p>
        <h2 id="tour-title" ref={headingRef} tabIndex={-1}>{feature.title}</h2>
        <p id="tour-description">{feature.description}</p>
        <p className={styles.instruction}>{feature.steps[0]}</p>
        {feature.access && <p className={styles.access}><ShieldCheck size={14}/>{feature.access}</p>}
      </div>
      <p className={styles.safety}>Tur hanya menunjukkan fitur, tidak mengubah data atau keranjang. Tekan Esc untuk keluar.</p>
      <div className={styles.tourActions}>
        <button className="button secondary" disabled={index === 0} onClick={() => setIndex(current => current - 1)}><ChevronLeft size={16}/>Kembali</button>
        <button className="button primary" onClick={() => index === features.length - 1 ? onClose(true) : setIndex(current => current + 1)}>{index === features.length - 1 ? <><Check size={16}/>Selesai</> : <>Berikutnya<ArrowRight size={16}/></>}</button>
      </div>
      <button className={styles.skip} onClick={() => onClose(false)}>Lewati tur · kembali bekerja</button>
    </div>
  </dialog>;
}
