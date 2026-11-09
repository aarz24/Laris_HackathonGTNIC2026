import "server-only";
import { headers } from "next/headers";
import { serverEnv } from "@/lib/env";

export async function appOrigin(): Promise<string> {
  const configured = serverEnv().appUrl;
  if (configured) {
    const url = new URL(configured);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("NEXT_PUBLIC_APP_URL harus berupa origin HTTP/HTTPS tanpa kredensial.");
    return url.origin;
  }
  // Production mail links must never derive their destination from a Host header.
  if (process.env.NODE_ENV === "production") throw new Error("NEXT_PUBLIC_APP_URL wajib diisi untuk deployment cloud.");
  const requestHeaders = await headers();
  const host = requestHeaders.get("host");
  if (!host) throw new Error("NEXT_PUBLIC_APP_URL belum dikonfigurasi.");
  const protocol = host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https";
  return `${protocol}://${host}`;
}
