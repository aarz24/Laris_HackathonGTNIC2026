"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { appOrigin } from "@/lib/app-url";
import { isCloudConfigured, serverEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error?: string; email?: string; notice?: string };

const credentials = z.object({
  email: z.string().trim().toLowerCase().email("Format email belum benar."),
  password: z.string().min(6, "Kata sandi minimal 6 karakter.").max(200),
});
const password = z.string().min(8, "Kata sandi minimal 8 karakter.").max(72, "Kata sandi maksimal 72 karakter.");
const registration = z.object({
  name: z.string().trim().min(2, "Nama minimal 2 karakter.").max(80),
  email: z.string().trim().toLowerCase().email("Format email belum benar."),
  password,
  confirmPassword: z.string(),
}).refine((value) => value.password === value.confirmPassword, { message: "Konfirmasi kata sandi tidak sama.", path: ["confirmPassword"] });
const passwordReset = z.object({ password, confirmPassword: z.string() }).refine((value) => value.password === value.confirmPassword, {
  message: "Konfirmasi kata sandi tidak sama.", path: ["confirmPassword"],
});

function authMessage(message: string): string {
  if (/invalid login credentials/i.test(message)) return "Email atau kata sandi salah.";
  if (/email not confirmed/i.test(message)) return "Email belum dikonfirmasi. Cek kotak masukmu.";
  if (/rate limit|too many/i.test(message)) return "Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.";
  if (/weak|password/i.test(message) && !/invalid login/i.test(message)) return "Kata sandi belum memenuhi syarat keamanan.";
  if (/fetch failed|network/i.test(message)) return "Tidak bisa terhubung ke server. Periksa koneksi internet.";
  return message;
}

export async function signInAction(_prev: LoginState, form: FormData): Promise<LoginState> {
  if (!isCloudConfigured) return { error: "Supabase belum dikonfigurasi." };
  const parsed = credentials.safeParse({ email: form.get("email"), password: form.get("password") });
  const email = String(form.get("email") ?? "");
  if (!parsed.success) return { error: parsed.error.issues[0]?.message, email };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: authMessage(error.message), email };
  redirect("/");
}

export async function signUpAction(_prev: LoginState, form: FormData): Promise<LoginState> {
  if (!isCloudConfigured) return { error: "Supabase belum dikonfigurasi." };
  const parsed = registration.safeParse({
    name: form.get("name"), email: form.get("email"), password: form.get("password"), confirmPassword: form.get("confirmPassword"),
  });
  const email = String(form.get("email") ?? "");
  if (!parsed.success) return { error: parsed.error.issues[0]?.message, email };
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.name },
      emailRedirectTo: `${await appOrigin()}/auth/callback?next=/onboarding`,
    },
  });
  if (error) return { error: authMessage(error.message), email };
  if (data.session) redirect("/onboarding");
  return { email, notice: "Akun dibuat. Buka tautan konfirmasi di emailmu untuk melanjutkan ke pengaturan usaha." };
}

export async function judgeSignInAction(): Promise<LoginState> {
  if (!isCloudConfigured) return { error: "Supabase belum dikonfigurasi." };
  const { demoEmail, demoPassword } = serverEnv();
  if (!demoEmail || !demoPassword) return { error: "Akun demo belum dikonfigurasi." };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: demoEmail, password: demoPassword });
  if (error) return { error: `${authMessage(error.message)} Pastikan data demo sudah di-seed.` };
  redirect("/");
}

export async function requestPasswordResetAction(_prev: LoginState, form: FormData): Promise<LoginState> {
  if (!isCloudConfigured) return { error: "Supabase belum dikonfigurasi." };
  const parsed = credentials.pick({ email: true }).safeParse({ email: form.get("email") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${await appOrigin()}/auth/callback?next=/reset-password`,
  });
  if (error && /rate limit|too many|fetch failed|network/i.test(error.message)) return { error: authMessage(error.message) };
  return { email: parsed.data.email, notice: "Jika email terdaftar, tautan pemulihan akan dikirim. Periksa kotak masuk dan folder spam." };
}

export async function updatePasswordAction(_prev: LoginState, form: FormData): Promise<LoginState> {
  if (!isCloudConfigured) return { error: "Supabase belum dikonfigurasi." };
  const parsed = passwordReset.safeParse({ password: form.get("password"), confirmPassword: form.get("confirmPassword") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return { error: "Tautan pemulihan sudah kedaluwarsa. Minta tautan baru." };
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: authMessage(error.message) };
  redirect("/");
}

export async function signOutAction(): Promise<void> {
  if (isCloudConfigured) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/login");
}
