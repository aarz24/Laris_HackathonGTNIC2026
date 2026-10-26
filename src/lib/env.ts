// Central env access. NEXT_PUBLIC_* must be read with literal `process.env.X`
// so Next.js can inline them into the browser bundle.

export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
export const supabaseKey = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();

/** Cloud mode = Supabase configured. Otherwise the app runs the local (browser storage) demo. */
export const isCloudConfigured = Boolean(supabaseUrl && supabaseKey);

export type AppMode = "cloud" | "local";

/** Server-only values. Never import these from client components. */
export function serverEnv() {
  return {
    demoEmail: process.env.LARIS_DEMO_EMAIL?.trim() || "",
    demoPassword: process.env.LARIS_DEMO_PASSWORD || "",
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || "",
    appUrl: process.env.NEXT_PUBLIC_APP_URL?.trim() || "",
    googleKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() || "",
    modelFast: process.env.LARIS_AI_MODEL_FAST?.trim() || "gemini-2.5-flash",
    modelSmart: process.env.LARIS_AI_MODEL_SMART?.trim() || "gemini-2.5-flash",
  };
}

/**
 * The one-click judge/demo login needs credentials, and in production it must also be
 * opted into explicitly (e.g. for the hackathon judging deployment) via LARIS_ALLOW_DEMO_LOGIN=true.
 */
export function isDemoLoginEnabled(): boolean {
  const { demoEmail, demoPassword } = serverEnv();
  if (!demoEmail || !demoPassword) return false;
  return process.env.NODE_ENV !== "production" || process.env.LARIS_ALLOW_DEMO_LOGIN?.trim() === "true";
}

/** Today's date in Asia/Jakarta as YYYY-MM-DD (the business day used by cloud mode). */
export function jakartaToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
