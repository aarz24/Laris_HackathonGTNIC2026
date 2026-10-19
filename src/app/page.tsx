import { redirect } from "next/navigation";
import LarisApp from "@/components/laris-app";
import { isCloudConfigured } from "@/lib/env";
import { loadSnapshot } from "@/lib/repo";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (!isCloudConfigured) return <LarisApp mode="local" />;

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirect("/login");
  const email = typeof claims.claims.email === "string" ? claims.claims.email : "";

  let snapshot: Awaited<ReturnType<typeof loadSnapshot>>;
  try {
    snapshot = await loadSnapshot(supabase);
  } catch (error) {
    // PRD §8 graceful degradation: if the database is unreachable, keep the demo usable locally.
    console.error("[laris] snapshot failed, falling back to local mode:", error);
    return <LarisApp mode="local" notice="Server sedang tidak terjangkau. Laris berjalan dalam mode demo lokal; data disimpan di browser ini." />;
  }
  if (!snapshot) redirect("/login?error=no-business");

  return <LarisApp mode="cloud" initialState={snapshot.state} today={snapshot.today} user={{ email, role: snapshot.role }} />;
}
