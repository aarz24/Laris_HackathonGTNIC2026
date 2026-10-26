import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { serverEnv, supabaseUrl } from "@/lib/env";

export function createAdminClient() {
  const key = serverEnv().serviceRoleKey;
  if (!key) throw new Error("Fitur server belum dikonfigurasi sepenuhnya (Service Role Key kosong).");
  return createSupabaseClient(supabaseUrl, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
