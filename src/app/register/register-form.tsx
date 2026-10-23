"use client";

import Link from "next/link";
import { useActionState } from "react";
import { LoaderCircle, LockKeyhole, Mail, ShieldCheck, Sparkles, UserRound } from "lucide-react";
import { CafeIllustration, LarisMark } from "@/components/laris-visuals";
import { signUpAction, type LoginState } from "@/app/login/actions";
import styles from "@/app/login/login.module.css";

export default function RegisterForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(signUpAction, {});
  return (
    <main className={styles.page} id="main-content">
      <section className={styles.brand} aria-label="Tentang Laris">
        <div className={styles.brandTop}><LarisMark /><span>Laris</span></div>
        <div className={styles.brandCopy}><span className={styles.pill}><Sparkles size={13} />Mulai kelola dengan lebih tenang</span><h2>Usahamu punya<br />cara kerja sendiri.<br />Laris menyesuaikan.</h2><p>Buat akun, atur katalog sendiri, dan simpan operasional harian dengan aman di cloud.</p></div>
        <div className={styles.illustration} aria-hidden="true"><CafeIllustration /></div>
        <ul className={styles.trust}><li><ShieldCheck size={15} />Akses berbasis peran</li><li><LockKeyhole size={15} />Data tiap usaha terisolasi</li></ul>
      </section>
      <section className={styles.panel}><div className={styles.card}>
        <h1>Buat akun Laris</h1><p className={styles.lead}>Gratis memulai. Setelah daftar, kamu akan mengatur workspace usahamu.</p>
        <form action={action} noValidate>
          <label className={styles.field}><span>Nama lengkap</span><div className={styles.inputWrap}><UserRound size={16} /><input name="name" autoComplete="name" required minLength={2} maxLength={80} placeholder="Nama pemilik" /></div></label>
          <label className={styles.field}><span>Email</span><div className={styles.inputWrap}><Mail size={16} /><input name="email" type="email" autoComplete="email" required defaultValue={state.email} placeholder="nama@usaha.id" /></div></label>
          <label className={styles.field}><span>Kata sandi</span><div className={styles.inputWrap}><LockKeyhole size={16} /><input name="password" type="password" autoComplete="new-password" required minLength={8} maxLength={72} placeholder="Minimal 8 karakter" /></div></label>
          <label className={styles.field}><span>Ulangi kata sandi</span><div className={styles.inputWrap}><LockKeyhole size={16} /><input name="confirmPassword" type="password" autoComplete="new-password" required minLength={8} maxLength={72} /></div></label>
          {state.error && <p className={styles.error} role="alert">{state.error}</p>}
          {state.notice && <p className={styles.notice} role="status">{state.notice}</p>}
          <button className={styles.submit} disabled={pending}>{pending && <LoaderCircle size={16} className={styles.spin} />}Buat akun</button>
        </form>
        <p className={styles.footnote}>Sudah punya akun? <Link href="/login">Masuk di sini</Link></p>
      </div></section>
    </main>
  );
}
