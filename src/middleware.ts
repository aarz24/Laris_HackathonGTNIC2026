import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Skip static assets and image optimisation; API routes check auth themselves.
  matcher: ["/((?!_next/static|_next/image|api/|favicon.ico|icon.svg|images/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
