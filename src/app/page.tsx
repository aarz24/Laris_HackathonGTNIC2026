import { redirect } from "next/navigation";
import LarisApp from "@/components/laris-app";
import { isCloudConfigured } from "@/lib/env";
import { loadSnapshot } from "@/lib/repo";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (!isCloudConfigured) redirect("/login");
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirect("/login");
  const email = typeof claims.claims.email === "string" ? claims.claims.email : "";
  const snapshot = await loadSnapshot(supabase);
  if (!snapshot) redirect("/onboarding");
  return <LarisApp mode="cloud" initialState={snapshot.state} today={snapshot.today} workspaceId={snapshot.businessId} user={{ id: claims.claims.sub, email, role: snapshot.role }} />;
}
