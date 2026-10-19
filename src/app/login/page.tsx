import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isCloudConfigured } from "@/lib/env";
import LoginForm from "./login-form";

export const metadata: Metadata = {
  title: "Masuk · Laris",
  description: "Masuk ke Laris, partner tumbuh usaha untuk UMKM Indonesia. Juri bisa langsung mencoba dengan satu klik.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (!isCloudConfigured) redirect("/");
  const { error } = await searchParams;
  const initialError = error === "no-business" ? "Akun ini belum terhubung ke usaha mana pun. Hubungi pemilik usaha untuk diundang." : undefined;
  return <LoginForm initialError={initialError} />;
}
