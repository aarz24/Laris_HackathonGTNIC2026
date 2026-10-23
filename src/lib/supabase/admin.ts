import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { serverEnv, supabaseUrl } from "@/lib/env";

export function createAdminClient() {
  const key = serverEnv().serviceRoleKey;
  if (!key) throw new Error("Undangan email belum dikonfigurasi. Minta anggota mendaftar lebih dulu, lalu tambahkan emailnya kembali.");
  return createSupabaseClient(supabaseUrl, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
