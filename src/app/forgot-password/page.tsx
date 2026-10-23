import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isCloudConfigured } from "@/lib/env";
import { ForgotPasswordForm } from "@/components/password-forms";

export const metadata: Metadata = { title: "Pulihkan akun · Laris" };

export default function ForgotPasswordPage() {
  if (!isCloudConfigured) redirect("/login");
  return <ForgotPasswordForm />;
}
