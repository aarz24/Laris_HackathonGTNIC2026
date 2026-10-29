"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ArrowRight, Gavel, LoaderCircle, LockKeyhole, Mail, ShieldCheck, Sparkles } from "lucide-react";
import { CafeIllustration, LarisMark } from "@/components/laris-visuals";
import { judgeSignInAction, signInAction, type LoginState } from "./actions";
import styles from "./login.module.css";

export default function LoginForm({ initialError, cloudConfigured, demoAvailable }: { initialError?: string; cloudConfigured: boolean; demoAvailable: boolean }) {
  const [state, signIn, signingIn] = useActionState<LoginState, FormData>(signInAction, { error: initialError });
  const [judgeState, judgeSignIn, judgePending] = useActionState<LoginState>(judgeSignInAction, {});
  const error = judgeState.error || state.error;
  const busy = signingIn || judgePending;

  return (
    <main className={styles.page} id="main-content">
      <section className={styles.brand} aria-label="Tentang Laris">
        <div className={styles.brandTop}><LarisMark /><span>Laris</span></div>
        <div className={styles.brandCopy}>
          <span className={styles.pill}><Sparkles size={13} />Partner tumbuh UMKM</span>
          <h2>Teman di balik<br />ramainya kedai.</h2>
          <p>Dari pesanan pertama sampai laporan harian. Kasir, bahan, dan pelanggan tercatat dalam satu tempat.</p>
        </div>
        <div className={styles.illustration} aria-hidden="true"><CafeIllustration /></div>
        <ul className={styles.trust}>
          <li><ShieldCheck size={15} />Workspace cloud terpisah per usaha</li>
          <li><LockKeyhole size={15} />Akses akun sesuai peran tim</li>
        </ul>
      </section>

      <section className={styles.panel}>
        <div className={styles.card}>
          <span className={styles.entryEyebrow}>DEMO INTERAKTIF · TANPA AKUN</span>
          <h1>Coba dulu. Kenali Laris.</h1>
          <p className={styles.lead}>Kedai contoh Kopi Senja sudah siap. Coba kasir, lihat stok berubah, lalu buka laporannya.</p>
          <Link className={`${styles.submit} ${styles.demoPrimary}`} href="/demo" aria-describedby="demo-entry-note">Coba demo Kopi Senja<ArrowRight size={18} /></Link>
          <p id="demo-entry-note" className={styles.demoNote}>Data contoh hanya di browser ini, tidak dipindahkan ke akun. Ada tur singkat yang bisa diulang dan pilihan mulai ulang demo.</p>
          <div className={styles.divider}><span>untuk usaha sendiri</span></div>

          {!cloudConfigured ? (
            <>
              <h2 className={styles.accountHeading}>Akun usaha</h2>
              <p className={styles.notice} role="status">Login dan penyimpanan cloud belum tersedia di lingkungan ini. Demo lokal tetap bisa dicoba tanpa akun.</p>
              <p className={styles.signup}><Link href="/register">Lihat pendaftaran akun</Link></p>
            </>
          ) : (
            <>
              <h2 className={styles.accountHeading}>Masuk ke akun usaha</h2>
              <p className={styles.accountNote}>Lanjutkan ke workspace cloud milikmu.</p>
              <form action={signIn} noValidate>
                <label className={styles.field}>
                  <span>Email</span>
                  <div className={styles.inputWrap}><Mail size={16} /><input id="login-email" name="email" type="email" autoComplete="email" required defaultValue={state.email} placeholder="nama@usaha.id" /></div>
                </label>
                <label className={styles.field}>
                  <span>Kata sandi</span>
                  <div className={styles.inputWrap}><LockKeyhole size={16} /><input id="login-password" name="password" type="password" autoComplete="current-password" required minLength={6} placeholder="••••••••" /></div>
                </label>
                <div className={styles.formMeta}><Link href="/forgot-password">Lupa kata sandi?</Link></div>
                {error && <p className={styles.error} role="alert">{error}</p>}
                <button id="login-submit" className={`${styles.submit} ${styles.accountSubmit}`} disabled={busy}>
                  {signingIn ? <LoaderCircle size={16} className={styles.spin} /> : null}Masuk ke akun
                </button>
              </form>
              <p className={styles.signup}>Belum punya akun? <Link href="/register">Daftar dan buat workspace</Link></p>
              {demoAvailable && (
                <form action={judgeSignIn} className={styles.judgeSection}>
                  <button id="judge-login" className={styles.judge} disabled={busy} aria-describedby="judge-entry-note">
                    <span className={styles.judgeIcon}>{judgePending ? <LoaderCircle size={18} className={styles.spin} /> : <Gavel size={18} />}</span>
                    <span className={styles.judgeText}><strong>Masuk sebagai Juri</strong><small>Opsional · akun CLOUD bersama</small></span>
                    <ArrowRight size={17} />
                  </button>
                  <p id="judge-entry-note" className={styles.footnote}>Berbeda dari demo lokal: perubahan tersimpan di workspace cloud bersama untuk penilaian. Gunakan data fiktif.</p>
                </form>
              )}
            </>
          )}
        </div>
      </section>
    </main>
  );
}
