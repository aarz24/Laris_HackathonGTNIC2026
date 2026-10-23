import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isCloudConfigured } from "@/lib/env";
import { ResetPasswordForm } from "@/components/password-forms";

export const metadata: Metadata = { title: "Kata sandi baru · Laris" };

export default function ResetPasswordPage() {
  if (!isCloudConfigured) redirect("/login");
  return <ResetPasswordForm />;
}
