export type Check = { id: string; status: "pass" | "fail" | "warn" | "not-run"; detail: string };
export type Environment = Record<string, string | undefined>;
export const SERVER_SECRETS = ["SUPABASE_SERVICE_ROLE_KEY", "GOOGLE_GENERATIVE_AI_API_KEY", "LARIS_DEMO_PASSWORD"] as const;

function jwtPayload(value: string): Record<string, unknown> | null {
  try {
    const parts = value.split(".");
    if (parts.length !== 3) return null;
    const parsed: unknown = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch { return null; }
}

export function inspectEnvironment(env: Environment, production: boolean): Check[] {
  const checks: Check[] = [];
  const add = (id: string, status: Check["status"], detail: string) => checks.push({ id, status, detail });
  for (const name of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_APP_URL"]) {
    try {
      const url = new URL(env[name]?.trim() ?? "");
      const loopback = url.hostname === "localhost" || url.hostname === "[::1]" || /^127\./.test(url.hostname);
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== "/") throw Error();
      if (production && (url.protocol !== "https:" || loopback)) throw Error();
      add(name, "pass", "Valid origin; value withheld.");
    } catch { add(name, "fail", production ? "Set a public HTTPS origin without credentials, path, query, or fragment." : "Set an HTTP/HTTPS origin without credentials, path, query, or fragment."); }
  }
  const key = (env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  const publicPayload = jwtPayload(key);
  add("public-key", key.startsWith("sb_publishable_") || publicPayload?.role === "anon" ? "pass" : "fail", "Public Supabase key must be publishable or legacy anon; never service_role/secret. This checks format, not authenticity.");
  const service = env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
  const servicePayload = jwtPayload(service);
  add("server-key", !service ? "warn" : service.startsWith("sb_secret_") || servicePayload?.role === "service_role" ? "pass" : "fail", "Server key is required for menu-image upload and new-member invitations; never expose it publicly.");
  let ref: string | undefined;
  try { ref = new URL(env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname.match(/^([a-z0-9]+)\.supabase\.co$/)?.[1]; } catch { /* reported above */ }
  for (const [name, payload] of [["public-key-project", publicPayload], ["server-key-project", servicePayload]] as const) {
    if (ref && typeof payload?.ref === "string") add(name, payload.ref === ref ? "pass" : "fail", "Legacy key project reference must match the configured Supabase host.");
  }
  for (const flag of ["LARIS_ALLOW_DEMO_LOGIN", "LARIS_DEMO_VOICE_AI"]) {
    const value = env[flag]?.trim();
    add(flag, !value || ["true", "false"].includes(value) ? "pass" : "fail", "Use literal true/false; missing means false.");
  }
  const judge = env.LARIS_ALLOW_DEMO_LOGIN?.trim() === "true";
  if (judge) add("judge-login", env.LARIS_DEMO_EMAIL?.trim() && (env.LARIS_DEMO_PASSWORD?.length ?? 0) >= 8 ? "warn" : "fail", "One-click login needs a dedicated fictional owner account and password; enabling it grants visitors that account's privileges.");
  else add("judge-login", "not-run", "One-click judge login disabled; verify four dedicated role accounts through normal login.");
  add("gemini", env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ? "pass" : "warn", "Presence only. Without Gemini, typed local parsing works; cloud OCR/audio require the provider.");
  if (env.LARIS_DEMO_VOICE_AI?.trim() === "true" && !env.GOOGLE_GENERATIVE_AI_API_KEY?.trim()) add("demo-voice-key", "fail", "Demo voice is enabled without a provider key.");
  for (const [name, value] of Object.entries(env)) {
    if (!name.startsWith("NEXT_PUBLIC_") || !value) continue;
    if (/SERVICE_ROLE|SECRET|PASSWORD|PRIVATE_KEY|GOOGLE_GENERATIVE_AI_API_KEY/.test(name) || value.startsWith("sb_secret_") || jwtPayload(value)?.role === "service_role" || SERVER_SECRETS.some(secret => env[secret] && value.includes(env[secret]!))) {
      add("public-secret", "fail", "A server secret is assigned to a NEXT_PUBLIC variable; remove it and rotate if published. Values withheld.");
    }
  }
  return checks;
}

/** Locations only; never return matched credential text or surrounding lines. */
export function secretLocations(text: string, env: Environment): { line: number; kind: string }[] {
  const findings: { line: number; kind: string }[] = [];
  const patterns: [string, RegExp][] = [
    ["private-key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
    ["google-api-key", /AIza[0-9A-Za-z_-]{35}/],
    ["supabase-secret", /sb_secret_[A-Za-z0-9_-]{20,}/],
    ["github-token", /(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})/],
  ];
  text.split(/\r?\n/).forEach((line, index) => {
    for (const [kind, pattern] of patterns) if (pattern.test(line)) findings.push({ line: index + 1, kind });
    for (const name of SERVER_SECRETS) {
      const value = env[name];
      if (value && value.length >= 8 && line.includes(value)) findings.push({ line: index + 1, kind: `configured-${name}` });
    }
    for (const match of line.matchAll(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)) {
      if (jwtPayload(match[0])?.role === "service_role") findings.push({ line: index + 1, kind: "service-role-jwt" });
    }
  });
  return findings;
}
