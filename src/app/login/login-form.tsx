"use client";

import { useActionState } from "react";
import { ArrowRight, Gavel, LoaderCircle, LockKeyhole, Mail, ShieldCheck, Sparkles } from "lucide-react";
import { CafeIllustration, LarisMark } from "@/components/laris-visuals";
import { judgeSignInAction, signInAction, type LoginState } from "./actions";
import styles from "./login.module.css";

export default function LoginForm({ initialError }: { initialError?: string }) {
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
          <h2>Catat cukup ngomong.<br />Stok aman.<br />Pelanggan balik lagi.</h2>
          <p>Kasir, stok, dan keuangan dalam satu tempat, dibantu AI yang paham Bahasa Indonesia sehari-hari.</p>
        </div>
        <div className={styles.illustration} aria-hidden="true"><CafeIllustration /></div>
        <ul className={styles.trust}>
          <li><ShieldCheck size={15} />Data tiap usaha terisolasi (RLS)</li>
          <li><LockKeyhole size={15} />Server di Singapura</li>
        </ul>
      </section>

      <section className={styles.panel}>
        <div className={styles.card}>
          <h1>Selamat datang kembali</h1>
          <p className={styles.lead}>Masuk untuk melanjutkan ke dasbor usahamu.</p>

          <form action={judgeSignIn}>
            <button id="judge-login" className={styles.judge} disabled={busy}>
              <span className={styles.judgeIcon}>{judgePending ? <LoaderCircle size={18} className={styles.spin} /> : <Gavel size={18} />}</span>
              <span className={styles.judgeText}><strong>Masuk sebagai Juri</strong><small>Satu klik ke demo Kopi Senja, tanpa daftar</small></span>
              <ArrowRight size={17} />
            </button>
          </form>

          <div className={styles.divider}><span>atau dengan email</span></div>

          <form action={signIn} noValidate>
            <label className={styles.field}>
              <span>Email</span>
              <div className={styles.inputWrap}><Mail size={16} /><input id="login-email" name="email" type="email" autoComplete="email" required defaultValue={state.email} placeholder="nama@usaha.id" /></div>
            </label>
            <label className={styles.field}>
              <span>Kata sandi</span>
              <div className={styles.inputWrap}><LockKeyhole size={16} /><input id="login-password" name="password" type="password" autoComplete="current-password" required minLength={6} placeholder="••••••••" /></div>
            </label>
            {error && <p className={styles.error} role="alert">{error}</p>}
            <button id="login-submit" className={styles.submit} disabled={busy}>
              {signingIn ? <LoaderCircle size={16} className={styles.spin} /> : null}Masuk
            </button>
          </form>
          <p className={styles.footnote}>Dengan masuk, kamu menyetujui pemrosesan data sesuai UU PDP.</p>
        </div>
      </section>
    </main>
  );
}
