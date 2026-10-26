import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { isCloudConfigured, type AppMode } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

// Basic per-instance, in-memory fixed-window rate limiting. Good enough for a
// single-instance deployment and warm Vercel serverless instances; strict global
// limits across instances would require a Redis/Upstash backend. No new dependencies.

const WINDOW_MS = 60_000;
const MAX_TRACKED_KEYS = 10_000;

/** Per-minute limit per identity for Gemini-capable (cloud) AI requests. */
export const AI_CLOUD_LIMIT = 20;
/** Per-minute limit per identity for cheap local-mode fallback AI requests. */
export const AI_LOCAL_LIMIT = 30;

interface Bucket {
  count: number;
  resetAt: number;
}

// Plain synchronous Map state: the check-and-increment below has no await between
// the check and the increment, so concurrent requests on the same event loop cannot race.
const buckets = new Map<string, Bucket>();

interface RateLimitVerdict {
  allowed: boolean;
  retryAfterSeconds: number;
}

function consume(key: string, limit: number, now = Date.now()): RateLimitVerdict {
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    if (buckets.size >= MAX_TRACKED_KEYS) {
      // Opportunistic cleanup so attacker-churned identities cannot grow the map unbounded.
      for (const [staleKey, stale] of buckets) if (stale.resetAt <= now) buckets.delete(staleKey);
    }
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  if (bucket.count >= limit) {
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
  }
  bucket.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

/** Stable identity: the authenticated user id when available, else the request IP (first x-forwarded-for value). */
async function identity(request: NextRequest): Promise<string> {
  if (isCloudConfigured) {
    try {
      const supabase = await createClient();
      const { data: claims } = await supabase.auth.getClaims();
      if (claims?.claims?.sub) return claims.claims.sub;
    } catch {
      // Session unreadable — fall back to the client IP.
    }
  }
  const forwarded = request.headers.get("x-forwarded-for") ?? "";
  return forwarded.split(",")[0]?.trim() || "unknown";
}

/**
 * Rate-limits an AI route request before any AI work runs. Returns a 429 response
 * (JSON error + Retry-After) when the caller must stop, or null to continue.
 */
export async function aiRateLimit(
  request: NextRequest,
  feature: "ask" | "parse-order" | "scan-receipt",
  mode: AppMode,
): Promise<NextResponse | null> {
  const who = await identity(request);
  const limit = mode === "cloud" ? AI_CLOUD_LIMIT : AI_LOCAL_LIMIT;
  const verdict = consume(`ai:${feature}:${who}`, limit);
  if (verdict.allowed) return null;
  return NextResponse.json(
    { error: "Terlalu banyak permintaan AI. Tunggu sebentar lalu coba lagi." },
    { status: 429, headers: { "Retry-After": String(verdict.retryAfterSeconds) } },
  );
}
