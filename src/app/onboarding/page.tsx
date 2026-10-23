import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isCloudConfigured } from "@/lib/env";
import { currentMembership } from "@/lib/repo";
import { createClient } from "@/lib/supabase/server";
import OnboardingForm from "./onboarding-form";

export const metadata: Metadata = { title: "Atur usaha · Laris" };

export default async function OnboardingPage() {
  if (!isCloudConfigured) redirect("/login");
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirect("/login");
  const email = typeof claims.claims.email === "string" ? claims.claims.email : "";
  if (await currentMembership(supabase)) redirect("/");
  return <OnboardingForm email={email} />;
}
