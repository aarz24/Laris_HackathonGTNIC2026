/** Read-only cloud preparation. No sign-in, email, RPC, database writes or provisioning. */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { readFile, readdir, stat } from "node:fs/promises";
import { resolve, join, relative } from "node:path";
import { createHash } from "node:crypto";
import { inspectEnvironment, secretLocations, type Check } from "./cloud-check-lib.ts";

const args = process.argv.slice(2);
const allowed = new Set(["--production", "--probe", "--json"]);
if (args.some(arg => !allowed.has(arg) && !arg.startsWith("--bundle="))) {
  console.error("Usage: npm run check:cloud -- [--production] [--probe] [--json] [--bundle=PATH_TO_CLIENT_STATIC]");
  process.exit(2);
}
const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env") as typeof import("@next/env");
// Same precedence/expansion as a production Next build, without echoing env contents.
loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const checks: Check[] = inspectEnvironment(process.env, args.includes("--production"));
const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }).split("\0").filter(Boolean);
const findings: { file: string; line: number; kind: string }[] = [];
for (const file of files) {
  if (/(^|\/)\.env(?:\.|$)/.test(file) && !file.endsWith(".env.example")) findings.push({ file, line: 1, kind: "tracked-environment-file" });
  const buffer = await readFile(file);
  if (buffer.includes(0)) continue;
  for (const hit of secretLocations(buffer.toString("utf8"), process.env)) findings.push({ file, ...hit });
}
checks.push({ id: "tracked-secrets", status: findings.length ? "fail" : "pass", detail: `${files.length} tracked working-tree files scanned; ${findings.length} findings. Limited patterns and configured secret values; not a full Git-history audit.` });
const migrations = [];
for (const file of (await readdir("supabase/migrations")).filter(name => name.endsWith(".sql")).sort()) {
  migrations.push({ file, sha256: createHash("sha256").update(await readFile(join("supabase/migrations", file))).digest("hex") });
}
checks.push({ id: "migrations", status: "not-run", detail: `${migrations.length} local SQL migrations inventoried; target application/order and RLS require the read-only SQL checklist plus designated-account verification.` });

const bundleArg = args.find(arg => arg.startsWith("--bundle="));
if (bundleArg) {
  const bundle = resolve(bundleArg.slice("--bundle=".length));
  let scanned = 0;
  const prior = findings.length;
  async function scan(directory: string) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await scan(path);
      else if (entry.isFile()) {
        const buffer = await readFile(path); scanned++;
        if (!buffer.includes(0)) for (const hit of secretLocations(buffer.toString("utf8"), process.env)) findings.push({ file: `client-bundle/${relative(bundle, path)}`, ...hit });
      }
    }
  }
  try {
    if (!(await stat(bundle)).isDirectory()) throw Error();
    await scan(bundle);
    checks.push({ id: "client-bundle", status: findings.length > prior ? "fail" : "pass", detail: `${scanned} client asset files scanned for known secret values and credential patterns.` });
  } catch { checks.push({ id: "client-bundle", status: "fail", detail: "Client bundle directory unreadable; point --bundle at the isolated build's .next/static directory." }); }
} else checks.push({ id: "client-bundle", status: "not-run", detail: "Supply --bundle=PATH_TO_NEXT_STATIC after the cloud-configured production build." });

if (args.includes("--probe")) {
  const origin = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const key = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
  // The public key is sent only to the configured official Supabase origin, never redirects.
  if (!/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(origin) || checks.some(check => ["public-key", "public-key-project", "public-secret"].includes(check.id) && check.status === "fail")) {
    checks.push({ id: "probe", status: "fail", detail: "Probe requires a valid public key and an official HTTPS Supabase project origin; no request sent." });
  } else {
    for (const [id, path] of [["auth-settings", "/auth/v1/settings"], ["rest-schema", "/rest/v1/"], ["anonymous-sales", "/rest/v1/sales_order?select=id&limit=1"]]) {
      try {
        const response = await fetch(new URL(path, origin), { headers: { apikey: key, ...(key.startsWith("eyJ") ? { Authorization: `Bearer ${key}` } : {}), Accept: id === "rest-schema" ? "application/openapi+json" : "application/json" }, redirect: "error", signal: AbortSignal.timeout(8000) });
        if (!response.ok) {
          const denied = id === "anonymous-sales" && [401, 403].includes(response.status);
          const hiddenSchema = id === "rest-schema" && [401, 403].includes(response.status);
          checks.push({ id, status: denied ? "pass" : hiddenSchema ? "warn" : "fail", detail: `HTTP ${response.status}${denied ? "; anonymous access denied" : hiddenSchema ? "; anonymous schema metadata unavailable; use SQL checklist" : "; response body withheld"}.` });
          continue;
        }
        const body = await response.json();
        if (id === "anonymous-sales") checks.push({ id, status: Array.isArray(body) && body.length === 0 ? "pass" : "fail", detail: "Expected empty anonymous result; no row values recorded. Does not prove authenticated tenant/role isolation." });
        else if (id === "auth-settings") checks.push({ id, status: "pass", detail: `Auth reachable; email login enabled=${body.external?.email === true}; email auto-confirm=${body.mailer_autoconfirm === true}. Redirect allowlist/SMTP not verified.` });
        else {
          const expected = ["/business", "/membership", "/sales_order", "/stock_movement", "/rpc/complete_sale", "/rpc/record_purchase", "/rpc/create_workspace"];
          const missing = expected.filter(path => !body.paths?.[path]);
          checks.push({ id, status: missing.length ? "warn" : "pass", detail: missing.length ? `OpenAPI does not expose all expected objects to anon (${missing.join(", ")}); use SQL checklist.` : "Expected core tables/RPCs exposed in API metadata. Definitions, applied versions, policies, and authenticated execution still unverified." });
        }
      } catch { checks.push({ id, status: "fail", detail: "Network/timeout/invalid JSON; no response or credential values printed." }); }
    }
  }
}
const report = { date: new Date().toISOString(), mode: args.includes("--production") ? "production" : "local", cloudMutations: 0, checks, migrations, findings };
if (args.includes("--json")) console.log(JSON.stringify(report, null, 2));
else {
  for (const check of checks) console.log(`${check.status.toUpperCase()} ${check.id}: ${check.detail}`);
  for (const finding of findings) console.log(`REVIEW ${finding.file}:${finding.line} (${finding.kind}; value withheld)`);
  console.log("No sign-ins, emails, RPC calls, database writes, migrations, seeds, or deployments performed.");
}
process.exitCode = checks.some(check => check.status === "fail") ? 1 : 0;
