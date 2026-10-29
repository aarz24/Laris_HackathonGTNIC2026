"use client";

import { useActionState, useState } from "react";
import { ArrowRight, LoaderCircle, ShieldCheck, Sparkles, Store } from "lucide-react";
import { CafeIllustration, LarisMark } from "@/components/laris-visuals";
import { signOutAction } from "@/app/login/actions";
import loginStyles from "@/app/login/login.module.css";
import { createWorkspaceAction, type OnboardingState } from "./actions";
import styles from "./onboarding.module.css";

export default function OnboardingForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState<OnboardingState, FormData>(createWorkspaceAction, {});
  const [kind, setKind] = useState("coffee");
  return (
    <main className={loginStyles.page} id="main-content">
      <section className={loginStyles.brand} aria-label="Tentang Laris">
        <div className={loginStyles.brandTop}><LarisMark /><span>Laris</span></div>
        <div className={loginStyles.brandCopy}>
          <span className={loginStyles.pill}><Sparkles size={13} />Satu workspace untuk usahamu</span>
          <h2>Bukan demo lagi.<br />Ini ruang usaha<br />milikmu sendiri.</h2>
          <p>Atur profil, pilih titik awal, lalu tambahkan menu dan bahan sesuai cara kerja bisnismu.</p>
        </div>
        <div className={loginStyles.illustration} aria-hidden="true"><CafeIllustration /></div>
        <ul className={loginStyles.trust}><li><ShieldCheck size={15} />Data terpisah per usaha</li><li><Store size={15} />Siap untuk operasional harian</li></ul>
      </section>
      <section className={loginStyles.panel}>
        <div className={`${loginStyles.card} ${styles.card}`}>
          <span className={styles.step}>LANGKAH 1 DARI 1</span>
          <h1>Atur ruang usahamu</h1>
          <p className={loginStyles.lead}>Kamu bisa mengubah semua pengaturan ini nanti.</p>
          <form action={action} className={styles.form}>
            <label className={loginStyles.field}><span>Nama usaha</span><div className={loginStyles.inputWrap}><input name="name" required minLength={2} maxLength={80} placeholder="Contoh: Kopi Pagi" autoFocus /></div></label>
            <div className={styles.twoColumns}>
              <label className={loginStyles.field}><span>Nama pemilik</span><div className={loginStyles.inputWrap}><input name="owner" required minLength={2} maxLength={80} defaultValue={email.split("@")[0]} /></div></label>
              <label className={loginStyles.field}><span>Nama outlet</span><div className={loginStyles.inputWrap}><input name="outlet" required minLength={2} maxLength={80} defaultValue="Outlet utama" /></div></label>
            </div>
            <div className={styles.twoColumns}>
              <label className={loginStyles.field}><span>Jenis usaha</span><select className={styles.select} name="kind" value={kind} onChange={(event) => setKind(event.target.value)}><option value="coffee">Kedai kopi</option><option value="restaurant">Restoran / rumah makan</option><option value="bakery">Bakery</option><option value="bar">Bar / kedai minuman</option><option value="other">F&B lainnya</option></select></label>
              <label className={loginStyles.field}><span>Target harian (Rp)</span><div className={loginStyles.inputWrap}><input name="dayTarget" type="number" min={1000} step={1000} defaultValue={1000000} required /></div></label>
            </div>
            {kind === "coffee" && <label className={styles.choice}><input type="checkbox" name="starter" /><span><strong>Mulai dari katalog + stok awal contoh (opsional)</strong><small>8 bahan dan 9 menu, termasuk jumlah stok awal contoh. Periksa dan sesuaikan stok dengan hitungan fisik sebelum berjualan. Ini bukan pemindahan data demo. Biarkan tidak dicentang untuk mulai dari katalog kosong.</small></span></label>}
            {kind !== "coffee" && <div className={styles.emptyNote}><strong>Mulai dengan katalog kosong.</strong><span>Setelah masuk, tambahkan bahan, menu, dan resep yang sesuai dengan usahamu.</span></div>}
            {state.error && <p className={loginStyles.error} role="alert">{state.error}</p>}
            <button className={loginStyles.submit} disabled={pending}>{pending ? <LoaderCircle size={16} className={loginStyles.spin} /> : <ArrowRight size={16} />}{pending ? "Menyiapkan workspace..." : "Buat workspace"}</button>
          </form>
          <div className={styles.account}><span>Masuk sebagai {email}</span><form action={signOutAction}><button type="submit">Bukan akun ini? Keluar</button></form></div>
        </div>
      </section>
    </main>
  );
}
