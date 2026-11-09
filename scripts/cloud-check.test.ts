import test from "node:test";
import assert from "node:assert/strict";
import { inspectEnvironment, secretLocations, type Environment } from "./cloud-check-lib.ts";

const token = (role: string, ref = "fixture") => [Buffer.from('{}').toString('base64url'), Buffer.from(JSON.stringify({ role, ref })).toString('base64url'), 'fixture-signature'].join('.');
const configured = (): Environment => ({
  NEXT_PUBLIC_APP_URL: "https://laris.example", NEXT_PUBLIC_SUPABASE_URL: "https://fixture.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: token("anon"), SUPABASE_SERVICE_ROLE_KEY: token("service_role"),
});

test("production preflight rejects local/malformed origins and privileged public keys without echoing values", () => {
  assert.equal(inspectEnvironment(configured(), true).some(check => check.status === "fail"), false);
  for (const url of ["http://localhost:3000", "https://127.0.0.1", "https://user:secret@laris.example", "https://laris.example/path", "https://laris.example?secret=example", "javascript:example"]) {
    const checks = inspectEnvironment({ ...configured(), NEXT_PUBLIC_APP_URL: url }, true);
    assert.equal(checks.find(check => check.id === "NEXT_PUBLIC_APP_URL")?.status, "fail");
    assert.equal(JSON.stringify(checks).includes(url), false);
  }
  for (const publicKey of [token("service_role"), ["sb", "secret", "fixture-value"].join('_'), "not-a-key"]) {
    const checks = inspectEnvironment({ ...configured(), NEXT_PUBLIC_SUPABASE_ANON_KEY: publicKey }, true);
    assert.equal(checks.find(check => check.id === "public-key")?.status, "fail");
    assert.equal(JSON.stringify(checks).includes(publicKey), false);
  }
});

test("preflight detects project mismatch, typo flags, missing judge credentials and public aliases of secrets", () => {
  const mismatch = inspectEnvironment({ ...configured(), NEXT_PUBLIC_SUPABASE_ANON_KEY: token("anon", "wrong-project") }, true);
  assert.equal(mismatch.find(check => check.id === "public-key-project")?.status, "fail");
  const env = { ...configured(), LARIS_ALLOW_DEMO_LOGIN: "true", LARIS_DEMO_VOICE_AI: "yes" };
  const checks = inspectEnvironment(env, true);
  assert.equal(checks.find(check => check.id === "judge-login")?.status, "fail");
  assert.equal(checks.find(check => check.id === "LARIS_DEMO_VOICE_AI")?.status, "fail");
  const leaked = inspectEnvironment({ ...configured(), GOOGLE_GENERATIVE_AI_API_KEY: "synthetic-provider-secret", NEXT_PUBLIC_UNRELATED: "synthetic-provider-secret" }, true);
  assert.equal(leaked.find(check => check.id === "public-secret")?.status, "fail");
  assert.equal(JSON.stringify(leaked).includes("synthetic-provider-secret"), false);
});

test("secret audit reports only locations for configured and recognizable secrets", () => {
  const secret = "synthetic-secret-for-test";
  const google = ["AI", "za", "x".repeat(35)].join('');
  const privateHeader = ["-----BEGIN", "PRIVATE KEY-----"].join(' ');
  const text = ["safe", secret, google, privateHeader].join('\n');
  const locations = secretLocations(text, { GOOGLE_GENERATIVE_AI_API_KEY: secret });
  assert.deepEqual(locations, [
    { line: 2, kind: "configured-GOOGLE_GENERATIVE_AI_API_KEY" },
    { line: 3, kind: "google-api-key" },
    { line: 4, kind: "private-key" },
  ]);
  assert.equal(JSON.stringify(locations).includes(secret), false);
  assert.equal(JSON.stringify(locations).includes(google), false);
  assert.deepEqual(secretLocations("NEXT_PUBLIC_SUPABASE_ANON_KEY=\nSUPABASE_SERVICE_ROLE_KEY=", {}), []);
});
