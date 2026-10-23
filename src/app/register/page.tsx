import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isCloudConfigured } from "@/lib/env";
import RegisterForm from "./register-form";

export const metadata: Metadata = { title: "Daftar · Laris" };

export default function RegisterPage() {
  if (!isCloudConfigured) redirect("/login");
  return <RegisterForm />;
}
