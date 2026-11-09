import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const { NextRequest, NextResponse } = require("next/server") as typeof import("next/server");

test("business timestamps match across UTC hosting and visitor timezones, including midnight", () => {
  const helperUrl = new URL("./business-time.ts", import.meta.url).href;
  const script = `import { formatBusinessTime as time, formatBusinessShortDate as date } from ${JSON.stringify(helperUrl)};
    process.stdout.write(JSON.stringify([time("2026-10-18T12:51:00Z"), time("2026-10-18T17:30:00Z"), date("2026-10-18T17:30:00Z"), date("2026-10-18")]));`;
  for (const timezone of ["UTC", "Asia/Jakarta", "America/Los_Angeles"]) {
    const output = execFileSync(process.execPath, ["--no-warnings", "--experimental-strip-types", "--input-type=module", "-e", script], {
      encoding: "utf8", env: { ...process.env, TZ: timezone }, timeout: 10_000, windowsHide: true,
    });
    assert.deepEqual(JSON.parse(output), ["19.51", "00.30", "19 Okt", "18 Okt"], timezone);
  }
});

function isolated<T>(file: string, deps: Record<string, unknown>, production = false): T {
  const source = readFileSync(new URL(file, import.meta.url), "utf8");
  const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const vmModule = { exports: {} };
  runInNewContext(javascript, {
    module: vmModule, exports: vmModule.exports, URL, Error, process: { env: { NODE_ENV: production ? "production" : "development" } },
    require: (name: string) => { if (!(name in deps)) throw Error(`Unexpected import: ${name}`); return deps[name]; },
  });
  return vmModule.exports as T;
}

test("cloud auth redirects preserve refreshed cookies and private cache headers", async () => {
  for (const signedIn of [true, false]) {
    const request = new NextRequest(`https://laris.example/${signedIn ? "login" : ""}`);
    const middleware = isolated<typeof import("./supabase/middleware")>("./supabase/middleware.ts", {
      "next/server": { NextResponse },
      "@/lib/env": { isCloudConfigured: true, supabaseUrl: "https://fixture.supabase.co", supabaseKey: "fixture-public" },
      "@supabase/ssr": { createServerClient: (_url: string, _key: string, options: { cookies: { setAll: (cookies: unknown[], headers: Record<string, string>) => void } }) => ({ auth: {
        getClaims: async () => {
          options.cookies.setAll([{ name: "sb-fixture-auth-token", value: "refreshed-test-session", options: { path: "/", httpOnly: true, secure: true, sameSite: "lax" } }], { "Cache-Control": "private, no-store", Pragma: "no-cache", Expires: "0" });
          return { data: signedIn ? { claims: { sub: "fixture-user" } } : null };
        },
      } }) },
    });
    const response = await middleware.updateSession(request);
    assert.equal(response.status, 307);
    assert.equal(response.headers.get("location"), `https://laris.example/${signedIn ? "" : "login"}`);
    assert.equal(response.cookies.get("sb-fixture-auth-token")?.value, "refreshed-test-session");
    assert.match(response.headers.get("set-cookie") ?? "", /HttpOnly/);
    assert.match(response.headers.get("set-cookie") ?? "", /Secure/);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(response.headers.get("pragma"), "no-cache");
    assert.equal(response.headers.get("expires"), "0");
    assert.equal(request.cookies.get("sb-fixture-auth-token")?.value, "refreshed-test-session");
  }
});

test("browser-only demo stays available without contacting cloud auth", async () => {
  const middleware = isolated<typeof import("./supabase/middleware")>("./supabase/middleware.ts", {
    "next/server": { NextResponse }, "@/lib/env": { isCloudConfigured: true },
    "@supabase/ssr": { createServerClient: () => { throw Error("Cloud unavailable"); } },
  });
  assert.equal((await middleware.updateSession(new NextRequest("https://laris.example/demo"))).status, 200);
});

test("production auth origin requires configuration instead of trusting Host", async () => {
  const originModule = isolated<typeof import("./app-url")>("./app-url.ts", {
    "server-only": {}, "@/lib/env": { serverEnv: () => ({ appUrl: "" }) },
    "next/headers": { headers: () => { throw Error("Host must not be read"); } },
  }, true);
  await assert.rejects(originModule.appOrigin(), /NEXT_PUBLIC_APP_URL wajib/);
});

test("auth origin accepts configured HTTP origins and rejects credentials or non-HTTP protocols", async () => {
  for (const configured of ["https://laris.example/", "http://localhost:3000"]) {
    const originModule = isolated<typeof import("./app-url")>("./app-url.ts", {
      "server-only": {}, "@/lib/env": { serverEnv: () => ({ appUrl: configured }) }, "next/headers": {},
    }, true);
    assert.equal(await originModule.appOrigin(), new URL(configured).origin);
  }
  for (const configured of ["https://user:password@laris.example", "javascript:alert(1)", "not-a-url"]) {
    const originModule = isolated<typeof import("./app-url")>("./app-url.ts", {
      "server-only": {}, "@/lib/env": { serverEnv: () => ({ appUrl: configured }) }, "next/headers": {},
    }, true);
    await assert.rejects(originModule.appOrigin());
  }
  const development = isolated<typeof import("./app-url")>("./app-url.ts", {
    "server-only": {}, "@/lib/env": { serverEnv: () => ({ appUrl: "" }) },
    "next/headers": { headers: async () => new Headers({ host: "localhost:3000" }) },
  });
  assert.equal(await development.appOrigin(), "http://localhost:3000");
});
