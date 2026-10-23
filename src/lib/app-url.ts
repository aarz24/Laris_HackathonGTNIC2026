import "server-only";
import { headers } from "next/headers";
import { serverEnv } from "@/lib/env";

export async function appOrigin(): Promise<string> {
  const configured = serverEnv().appUrl;
  if (configured) return new URL(configured).origin;
  const requestHeaders = await headers();
  const host = requestHeaders.get("host");
  if (!host) throw new Error("NEXT_PUBLIC_APP_URL belum dikonfigurasi.");
  const protocol = host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https";
  return `${protocol}://${host}`;
}
