// Shared helpers for Node scripts (seed, RLS test). Run with Node ≥ 22.18 (native TS type stripping).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const DEMO_SLUG = "kopi-senja";
export const TENANT_B_SLUG = "warung-bu-sri";
export const TENANT_B_EMAIL = "tenant-b@laris.demo";

export function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Env ${name} belum diisi (lihat .env.example).`);
  return value;
}

export function supabaseUrl(): string {
  return requireEnv("NEXT_PUBLIC_SUPABASE_URL");
}

export function publicKey(): string {
  const key = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  if (!key) throw new Error("Env NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY belum diisi.");
  return key;
}

const noSession = { auth: { persistSession: false, autoRefreshToken: false } } as const;

/** Service-role client: bypasses RLS. Scripts only — never ship to the browser. */
export function adminClient(): SupabaseClient {
  return createClient(supabaseUrl(), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), noSession);
}

/** Anonymous client that will sign in as a user (RLS applies). */
export function userClient(): SupabaseClient {
  return createClient(supabaseUrl(), publicKey(), noSession);
}

export function jakartaDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Create the auth user if missing, otherwise reset its password. Returns the user id. */
export async function ensureUser(db: SupabaseClient, email: string, password: string, metadata: Record<string, unknown> = {}): Promise<string> {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers: ${error.message}`);
    const found = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (found) {
      const { error: updateError } = await db.auth.admin.updateUserById(found.id, { password, email_confirm: true, user_metadata: metadata });
      if (updateError) throw new Error(`updateUser ${email}: ${updateError.message}`);
      return found.id;
    }
    if (data.users.length < 200) break;
  }
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: metadata });
  if (error || !data.user) throw new Error(`createUser ${email}: ${error?.message ?? "unknown"}`);
  return data.user.id;
}
