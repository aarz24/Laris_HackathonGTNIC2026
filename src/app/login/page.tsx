import type { Metadata } from "next";
import { isCloudConfigured, serverEnv } from "@/lib/env";
import LoginForm from "./login-form";

export const metadata: Metadata = {
  title: "Masuk · Laris",
  description: "Masuk ke Laris untuk mengelola kasir, stok, pelanggan, dan keuangan usaha F&B.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const { demoEmail, demoPassword } = serverEnv();
  const initialError = error === "no-business" ? "Akun ini belum terhubung ke usaha mana pun. Hubungi pemilik usaha untuk diundang." : undefined;
  return <LoginForm initialError={initialError} cloudConfigured={isCloudConfigured} demoAvailable={Boolean(demoEmail && demoPassword)} />;
}
