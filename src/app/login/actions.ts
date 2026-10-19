"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { isCloudConfigured, serverEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error?: string; email?: string };

const credentials = z.object({
  email: z.string().trim().toLowerCase().email("Format email belum benar."),
  password: z.string().min(6, "Kata sandi minimal 6 karakter.").max(200),
});

function authMessage(message: string): string {
  if (/invalid login credentials/i.test(message)) return "Email atau kata sandi salah.";
  if (/email not confirmed/i.test(message)) return "Email belum dikonfirmasi. Cek kotak masukmu.";
  if (/rate limit|too many/i.test(message)) return "Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.";
  if (/fetch failed|network/i.test(message)) return "Tidak bisa terhubung ke server. Periksa koneksi internet.";
  return message;
}

export async function signInAction(_prev: LoginState, form: FormData): Promise<LoginState> {
  if (!isCloudConfigured) redirect("/");
  const parsed = credentials.safeParse({ email: form.get("email"), password: form.get("password") });
  const email = String(form.get("email") ?? "");
  if (!parsed.success) return { error: parsed.error.issues[0]?.message, email };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: authMessage(error.message), email };
  redirect("/");
}

/** One-click judge login (PRD §13). Credentials stay on the server. */
export async function judgeSignInAction(): Promise<LoginState> {
  if (!isCloudConfigured) redirect("/");
  const { demoEmail, demoPassword } = serverEnv();
  if (!demoEmail || !demoPassword) return { error: "Akun juri belum dikonfigurasi (LARIS_DEMO_EMAIL / LARIS_DEMO_PASSWORD)." };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: demoEmail, password: demoPassword });
  if (error) return { error: `${authMessage(error.message)} Pastikan \`npm run db:seed\` sudah dijalankan.` };
  redirect("/");
}

export async function signOutAction(): Promise<void> {
  if (isCloudConfigured) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/login");
}
