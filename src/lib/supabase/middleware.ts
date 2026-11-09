import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isCloudConfigured, supabaseKey, supabaseUrl } from "@/lib/env";

/** Refreshes the Supabase session cookie on every request and gates the app behind /login. */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  if (!isCloudConfigured) return response;
  // The browser-only demo must remain usable when cloud auth is unavailable.
  if (request.nextUrl.pathname === "/demo") return response;

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers ?? {}).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // Do not run code between createServerClient and getClaims (session refresh happens here).
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);
  const path = request.nextUrl.pathname;
  const redirectWithSession = (url: URL) => {
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach(cookie => redirect.cookies.set(cookie));
    // Supabase SSR supplies cache headers with refreshed auth cookies. Preserve
    // them on redirects too, so shared caches cannot store another user's session.
    for (const name of ["cache-control", "expires", "pragma"]) {
      const value = response.headers.get(name);
      if (value) redirect.headers.set(name, value);
    }
    return redirect;
  };

  if (!signedIn && (path === "/" || path === "/onboarding")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return redirectWithSession(url);
  }
  if (signedIn && (path === "/login" || path === "/register" || path === "/forgot-password")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return redirectWithSession(url);
  }
  return response;
}
