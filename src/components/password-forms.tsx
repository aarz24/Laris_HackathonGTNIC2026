"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ArrowLeft, LoaderCircle, LockKeyhole, Mail } from "lucide-react";
import { requestPasswordResetAction, updatePasswordAction, type LoginState } from "@/app/login/actions";
import styles from "@/app/login/login.module.css";

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(requestPasswordResetAction, {});
  return (
    <main className={styles.simplePage} id="main-content">
      <section className={styles.card}>
        <h1>Pulihkan akunmu</h1>
        <p className={styles.lead}>Masukkan email akunmu. Kami akan mengirim tautan untuk membuat kata sandi baru.</p>
        <form action={action} noValidate>
          <label className={styles.field}>
            <span>Email</span>
            <div className={styles.inputWrap}><Mail size={16} /><input name="email" type="email" autoComplete="email" required defaultValue={state.email} placeholder="nama@usaha.id" autoFocus /></div>
          </label>
          {state.error && <p className={styles.error} role="alert">{state.error}</p>}
          {state.notice && <p className={styles.notice} role="status">{state.notice}</p>}
          <button className={styles.submit} disabled={pending || Boolean(state.notice)}>
            {pending && <LoaderCircle size={16} className={styles.spin} />}Kirim tautan pemulihan
          </button>
        </form>
        <p className={styles.footnote}><Link href="/login"><ArrowLeft size={13} />Kembali ke halaman masuk</Link></p>
      </section>
    </main>
  );
}

export function ResetPasswordForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(updatePasswordAction, {});
  return (
    <main className={styles.simplePage} id="main-content">
      <section className={styles.card}>
        <h1>Buat kata sandi baru</h1>
        <p className={styles.lead}>Gunakan minimal 8 karakter. Setelah disimpan, kamu akan langsung masuk ke workspace.</p>
        <form action={action} noValidate>
          <label className={styles.field}>
            <span>Kata sandi baru</span>
            <div className={styles.inputWrap}><LockKeyhole size={16} /><input name="password" type="password" autoComplete="new-password" required minLength={8} maxLength={72} autoFocus /></div>
          </label>
          <label className={styles.field}>
            <span>Ulangi kata sandi baru</span>
            <div className={styles.inputWrap}><LockKeyhole size={16} /><input name="confirmPassword" type="password" autoComplete="new-password" required minLength={8} maxLength={72} /></div>
          </label>
          {state.error && <p className={styles.error} role="alert">{state.error}</p>}
          <button className={styles.submit} disabled={pending}>{pending && <LoaderCircle size={16} className={styles.spin} />}Simpan kata sandi</button>
        </form>
        <p className={styles.footnote}><Link href="/forgot-password">Tautan tidak berfungsi? Minta tautan baru</Link></p>
      </section>
    </main>
  );
}
