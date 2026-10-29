import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { z } from "zod";
import { generateText } from "ai";
import { APICallError } from "@ai-sdk/provider";
import { MockLanguageModelV4 } from "ai/test";
import * as requests from "./ai-request.ts";
import * as fallbacks from "./ai-fallbacks.ts";
import * as data from "./laris-data.ts";
import { resetDemoSession } from "./laris-guide.ts";
import type { AiContext } from "./ai";

const { createDeadline, waitForSignal, generationOptions, createRequestSlot, fetchAiJson } = requests;
const features = ["parse-order", "ask", "scan-receipt"] as const;
type Feature = typeof features[number];

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function tenantState(): data.BusinessState {
  return {
    version: 1, business: { name: "Tenant Kitchen", owner: "Tenant Owner", outlet: "Private outlet" }, dayTarget: 100000,
    customers: [], expenses: [], purchases: [], stockMovements: [],
    inventory: [{ id: "tenant-rice", name: "Beras tenant", unit: "g", cost: 12, openingStock: 500, reorderPoint: 1000, supplier: "Tenant Supplier" }],
    products: [
      { id: "tenant-meal", name: "Nasi Tenant", category: "Makanan", price: 99000, cost: 50000, sold: 0, image: "", recipe: [], active: true },
      { id: "inactive-meal", name: "Menu Nonaktif", category: "Makanan", price: 1000, cost: 500, sold: 0, image: "", recipe: [], active: false },
    ],
    sales: [{ id: "tenant-sale", items: [{ productId: "tenant-meal", name: "Nama Arsip Tenant", quantity: 2, unitPrice: 12000 }], subtotal: 24000, discount: 0, tax: 0, total: 24000, cashReceived: 24000, payment: "QRIS", customerName: "Pelanggan", channel: "Kasir", status: "Lunas", createdAt: "2026-01-01T10:00:00+07:00" }],
  };
}

// Execute the real route bodies offline. Only framework/provider/auth imports are substituted;
// unexpected imports fail closed. No Next server, env file, network, or database is needed.
const compiled = new Map<string, string>();
function loadIsolated<T>(relativePath: string, dependencies: Record<string, unknown>): T {
  let javascript = compiled.get(relativePath);
  if (!javascript) {
    const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
    const result = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
    javascript = result.outputText;
    compiled.set(relativePath, javascript);
  }
  const exports = {};
  const vmModule = { exports };
  runInNewContext(javascript, {
    exports, module: vmModule, Buffer, File, Request, Response, AbortController, DOMException, Error, Date, console,
    require: (name: string) => {
      if (!Object.hasOwn(dependencies, name)) throw new Error(`Unexpected offline import: ${name}`);
      return dependencies[name];
    },
  }, { filename: relativePath });
  return vmModule.exports as T;
}

function serverModule(overrides: Record<string, unknown> = {}) {
  return loadIsolated<typeof import("./ai")>("./ai.ts", {
    "server-only": {},
    "next/server": { NextResponse: Response },
    "@ai-sdk/google": { createGoogleGenerativeAI: () => { throw new Error("Paid provider forbidden in offline tests"); } },
    "@/lib/env": { isCloudConfigured: true, jakartaToday: () => "2026-10-29", serverEnv: () => ({}) },
    "@/lib/laris-data": data,
    "@/lib/ai-request": requests,
    "@/lib/repo": {},
    "@/lib/supabase/server": { createClient: () => { throw new Error("Database access forbidden in offline tests"); } },
    ...overrides,
  });
}

interface GenerationCall {
  maxRetries: number;
  timeout: { totalMs: number };
  abortSignal: AbortSignal;
  stopWhen?: number;
  output?: unknown;
  instructions: string;
  tools?: Record<string, { execute: (input: { days: number }) => Promise<Record<string, unknown>> }>;
}

function routeHarness(feature: Feature, options: {
  state?: data.BusinessState;
  loadContext?: () => Promise<AiContext>;
  contextStatus?: number;
  limited?: Response;
  rateLimit?: () => Promise<Response | null>;
  provider?: (call: GenerationCall) => Promise<unknown>;
  modelAvailable?: boolean;
  local?: boolean;
} = {}) {
  const server = serverModule();
  const state = options.state ?? tenantState();
  const context: AiContext = { mode: options.local ? "local" : "cloud", allowGemini: !options.local, businessId: options.local ? null : "tenant-business", today: "2026-10-29", state };
  const calls: GenerationCall[] = [];
  let contextCalls = 0;
  const route = loadIsolated<{ POST: (request: Request) => Promise<Response> }>(`../app/api/ai/${feature}/route.ts`, {
    "next/server": { NextResponse: Response }, zod: { z },
    ai: {
      generateText: (call: GenerationCall) => { calls.push(call); return options.provider ? options.provider(call) : Promise.reject(new Error("Offline provider failure")); },
      Output: { object: (value: unknown) => value }, tool: (value: unknown) => value, isStepCount: (count: number) => count,
    },
    "@/lib/ai": {
      ...server,
      getGoogleModel: () => options.modelAvailable === false ? null : { model: "offline-model", modelId: "offline-model" },
      requireAiContext: async () => {
        contextCalls++;
        if (options.contextStatus) throw new server.AiRequestError("Auth or context unavailable", options.contextStatus);
        return options.loadContext ? options.loadContext() : context;
      },
    },
    "@/lib/ai-request": requests, "@/lib/ai-fallbacks": fallbacks, "@/lib/laris-data": data,
    "@/lib/rate-limit": { aiRateLimit: async () => options.rateLimit ? options.rateLimit() : options.limited ?? null },
  });
  return { ...route, calls, contextCalls: () => contextCalls, server, context };
}

function requestFor(feature: Feature, signal?: AbortSignal, extra: Record<string, unknown> = {}) {
  const body = feature === "ask" ? { question: "Berapa laba hari ini?" }
    : feature === "parse-order" ? { text: "dua nasi tenant, satu menu nonaktif, satu kopi susu, bayar qris" }
    : { image: "eA==", mimeType: "image/png" };
  return new Request(`http://offline.invalid/api/ai/${feature}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "cloud", ...body, ...extra }), signal });
}

function assertNoInventedReceipt(body: Record<string, unknown>) {
  for (const key of ["lines", "supplierName", "receiptDate", "total", "totalReceipt", "source"]) assert.equal(key in body, false, key);
}

test("AI budgets are nested, and cancelled requests cannot start generation", () => {
  assert.deepEqual([requests.AI_GENERATION_MS, requests.AI_ROUTE_MS, requests.AI_CLIENT_MS, requests.AI_TELEMETRY_MS], [15000, 18000, 20000, 1000]);
  const controller = new AbortController();
  assert.deepEqual(generationOptions(controller.signal), { maxRetries: 0, timeout: { totalMs: 15000 }, abortSignal: controller.signal });
  controller.abort();
  assert.throws(() => generationOptions(controller.signal), { name: "AbortError" });
});

test("installed SDK does not retry retryable failures with the shared options", async () => {
  let calls = 0;
  const model = new MockLanguageModelV4({ doGenerate: async () => {
    calls++;
    throw new APICallError({ message: "Offline retryable failure", url: "http://offline.invalid", requestBodyValues: {}, statusCode: 503, isRetryable: true });
  } });
  await assert.rejects(generateText({ model, prompt: "Offline", ...generationOptions(new AbortController().signal) }));
  assert.equal(calls, 1);
});

test("installed SDK timeout aborts an offline abort-aware provider", async () => {
  const outer = createDeadline(5000);
  let signal: AbortSignal | undefined;
  const model = new MockLanguageModelV4({ doGenerate: async options => {
    signal = options.abortSignal;
    assert.ok(signal);
    return waitForSignal(signal, () => new Promise<never>(() => {}));
  } });
  try {
    await assert.rejects(generateText({ model, prompt: "Offline", ...generationOptions(outer.signal), timeout: { totalMs: 20 } }), { name: "TimeoutError" });
    assert.equal(signal?.aborted, true);
    assert.equal(outer.signal.aborted, false);
    assert.equal(model.doGenerateCalls.length, 1);
  } finally { outer.dispose(); }
});

for (const feature of features) {
  test(`${feature}: provider failure preserves authenticated tenant scope and bounded options`, async () => {
    const route = routeHarness(feature);
    const response = await route.POST(requestFor(feature));
    const body = await response.json();
    assert.equal(route.calls.length, 1);
    const call = route.calls[0];
    assert.equal(call.maxRetries, 0);
    assert.equal(call.timeout.totalMs, 15000);
    assert.equal(call.abortSignal instanceof AbortSignal, true);
    assert.match(call.instructions, /Tenant Kitchen/);
    if (feature === "ask") {
      assert.equal(response.status, 200);
      assert.equal(call.stopWhen, 4);
      assert.equal(body.source, "local-rules");
      assert.match(body.answer, /seluruh transaksi tercatat, bukan khusus hari ini/);
      assert.match(body.answer, /HPP historis tidak tersedia/);
      assert.match(body.answer, /24\.000/);
      assert.doesNotMatch(body.answer, /Kopi Senja|99\.000|50\.000/);
    } else if (feature === "parse-order") {
      assert.equal(response.status, 200);
      assert.ok(call.output);
      assert.equal(body.source, "fallback-parser");
      assert.deepEqual(body.items.map((item: data.CartItem) => item.productId), ["tenant-meal"]);
      assert.equal(body.items[0].quantity, 2);
      assert.ok(body.unknown.length);
    } else {
      assert.equal(response.status, 502);
      assert.ok(call.output);
      assertNoInventedReceipt(body);
      assert.match(body.error, /manual/);
    }
    assert.equal(body.reason, "provider-error");
    if (feature !== "scan-receipt") assert.match(body.notice, /bukan hasil model AI/);
  });

  test(`${feature}: route deadline aborts a hung provider and returns an honest result`, async t => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const started = deferred<void>();
    let providerSignal: AbortSignal | undefined;
    const route = routeHarness(feature, { provider: call => {
      providerSignal = call.abortSignal; started.resolve();
      return waitForSignal(call.abortSignal, () => new Promise<never>(() => {}));
    } });
    const pending = route.POST(requestFor(feature));
    await started.promise;
    t.mock.timers.tick(18000);
    const response = await pending;
    const body = await response.json();
    assert.equal(providerSignal?.aborted, true);
    assert.equal(route.calls.length, 1);
    assert.equal(body.reason, "timeout");
    if (feature === "scan-receipt") {
      assert.equal(response.status, 504); assert.equal(body.code, "AI_TIMEOUT"); assertNoInventedReceipt(body);
    } else { assert.equal(response.status, 200); assert.match(body.notice, /Batas waktu/); }
  });

  test(`${feature}: pre-aborted requests never load context or call the provider`, async () => {
    const controller = new AbortController(); controller.abort();
    const route = routeHarness(feature);
    const response = await route.POST(requestFor(feature, controller.signal));
    assert.equal(response.status, 499);
    assert.equal(route.contextCalls(), 0); assert.equal(route.calls.length, 0);
  });

  test(`${feature}: slow context cannot trigger a late billable generation`, async t => {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const started = deferred<void>();
    const context = deferred<AiContext>();
    const route = routeHarness(feature, { loadContext: () => { started.resolve(); return context.promise; } });
    const pending = route.POST(requestFor(feature));
    await started.promise;
    t.mock.timers.tick(18000);
    const response = await pending;
    assert.equal(response.status, 504);
    assert.equal((await response.json()).code, "AI_TIMEOUT");
    context.resolve(route.context);
    await Promise.resolve();
    assert.equal(route.calls.length, 0);
  });

  test(`${feature}: client disconnect aborts work without fake success`, async () => {
    const started = deferred<void>();
    const controller = new AbortController();
    const route = routeHarness(feature, { provider: call => { started.resolve(); return waitForSignal(call.abortSignal, () => new Promise<never>(() => {})); } });
    const pending = route.POST(requestFor(feature, controller.signal));
    await started.promise;
    controller.abort();
    const response = await pending;
    assert.equal(response.status, 499);
    const body = await response.json();
    assert.equal(body.code, "AI_CANCELLED");
    assert.equal(body.source, undefined);
  });

  test(`${feature}: 401, 403, context failures, and 429 stay outside fallback handling`, async () => {
    for (const status of [401, 403, 500]) {
      const guarded = routeHarness(feature, { contextStatus: status });
      const response = await guarded.POST(requestFor(feature));
      assert.equal(response.status, status);
      assert.equal((await response.json()).source, undefined);
      assert.equal(guarded.calls.length, 0);
    }
    const route = routeHarness(feature, { limited: Response.json({ error: "Rate limited" }, { status: 429, headers: { "Retry-After": "60" } }) });
    const response = await route.POST(requestFor(feature));
    assert.equal(response.status, 429); assert.equal(response.headers.get("Retry-After"), "60");
    assert.equal(route.contextCalls(), 0); assert.equal(route.calls.length, 0);
  });
}

test("request body and rate-limit waits are included in the route deadline", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const route = routeHarness("ask");
  const request = requestFor("ask");
  t.mock.method(request, "json", () => new Promise<never>(() => {}));
  const pending = route.POST(request);
  t.mock.timers.tick(18000);
  const response = await pending;
  assert.equal(response.status, 504);
  assert.equal(route.contextCalls(), 0); assert.equal(route.calls.length, 0);
  const started = deferred<void>();
  const limitedRoute = routeHarness("ask", { rateLimit: () => { started.resolve(); return new Promise<never>(() => {}); } });
  const waitingForLimit = limitedRoute.POST(requestFor("ask"));
  await started.promise;
  t.mock.timers.tick(18000);
  assert.equal((await waitingForLimit).status, 504);
  assert.equal(limitedRoute.contextCalls(), 0); assert.equal(limitedRoute.calls.length, 0);
});

test("actual context authentication and membership errors keep 401 and 403", async () => {
  for (const authenticated of [false, true]) {
    const server = serverModule({
      "@/lib/supabase/server": { createClient: async () => ({ auth: { getClaims: async () => ({ data: { claims: { sub: authenticated ? "tenant-user" : undefined } } }) } }) },
      "@/lib/repo": { currentMembership: async () => null },
    });
    await assert.rejects(server.requireAiContext("cloud"), error => {
      assert.equal(server.aiErrorResponse(error, "Failure").status, authenticated ? 403 : 401);
      return true;
    });
  }
});

test("ask rules preserve immutable sale costs and identify missing historical HPP", () => {
  const state = tenantState();
  assert.match(fallbacks.localAnswer("laba hari ini", state), /laba dan margin tidak dapat dihitung/);
  state.sales[0].items = [{ ...state.sales[0].items[0], unitCost: 2000 }];
  const answer = fallbacks.localAnswer("laba hari ini", state);
  assert.match(answer, /20\.000/);
  state.products = [];
  assert.equal(fallbacks.localAnswer("laba hari ini", state), answer);
  assert.match(fallbacks.localAnswer("menu terlaris", state), /Nama Arsip Tenant/);
});

test("ask model tools retain unknown historical HPP rather than current catalog estimates", async () => {
  const state = tenantState();
  state.sales[0].createdAt = "2026-10-29T10:00:00+07:00";
  const route = routeHarness("ask", { state });
  await route.POST(requestFor("ask"));
  const profit = await route.calls[0].tools!.getProfitSummary.execute({ days: 1 });
  assert.equal(profit.revenue, 24000);
  assert.equal(profit.cogs, null); assert.equal(profit.grossProfit, null);
  assert.equal(profit.costBasis, "unavailable"); assert.equal(profit.missingCostLines, 1);
});

test("audio-only provider timeout asks for typed input without a transcript", async () => {
  const route = routeHarness("parse-order", { provider: async () => { throw new DOMException("Offline timeout", "TimeoutError"); } });
  const response = await route.POST(requestFor("parse-order", undefined, { text: "", audio: "eA==" }));
  const body = await response.json();
  assert.equal(response.status, 504); assert.equal(body.code, "AI_TIMEOUT");
  assert.match(body.error, /Ketik pesanan/);
  for (const key of ["items", "text", "transcript", "source"]) assert.equal(key in body, false);
});

test("cloud OCR without a model never returns demo content; local demo stays labeled", async () => {
  const cloud = routeHarness("scan-receipt", { modelAvailable: false });
  const failed = await cloud.POST(requestFor("scan-receipt"));
  assert.equal(failed.status, 503); assertNoInventedReceipt(await failed.json());
  assert.equal(cloud.calls.length, 0);
  const local = routeHarness("scan-receipt", { local: true });
  const response = await local.POST(requestFor("scan-receipt", undefined, { mode: "local" }));
  const body = await response.json();
  assert.equal(body.source, "mock-ocr"); assert.match(body.notice, /bukan hasil pembacaan foto/);
  assert.equal(local.calls.length, 0);
});

test("OCR success omits absent supplier/date rather than inventing them", async () => {
  const route = routeHarness("scan-receipt", { provider: async () => ({ output: { lines: [], totalReceipt: 15000 } }) });
  const response = await route.POST(requestFor("scan-receipt"));
  const body = await response.json();
  assert.equal(response.status, 200); assert.equal(body.supplierName, undefined); assert.equal(body.receiptDate, undefined);
  assert.deepEqual(body.lines, []);
});

test("telemetry reuses authenticated identity/client and aborts a hanging insert at one second", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let signal: AbortSignal | undefined;
  let row: Record<string, unknown> | undefined;
  const client = { from: (table: string) => {
    assert.equal(table, "ai_event");
    return { insert: (value: Record<string, unknown>) => {
      row = value;
      return { abortSignal: (value: AbortSignal) => { signal = value; return new Promise<never>(() => {}); } };
    } };
  } };
  const server = serverModule();
  const context = { mode: "cloud", allowGemini: true, businessId: "tenant-business", today: "2026-10-29", state: tenantState(), telemetry: { client, userId: "tenant-user" } } as unknown as AiContext;
  const pending = server.logAiTelemetry({ context, signal: new AbortController().signal, feature: "ask", model: "offline", input: {}, output: {}, latencyMs: 5, ok: true });
  assert.equal(row?.business_id, "tenant-business"); assert.equal(row?.user_id, "tenant-user");
  t.mock.timers.tick(1000);
  await pending;
  assert.equal(signal?.aborted, true);
});

test("telemetry does not start after parent cancellation and never replaces results on failure", async () => {
  const controller = new AbortController(); controller.abort();
  let calls = 0;
  await requests.boundedTelemetry(async () => { calls++; }, controller.signal);
  assert.equal(calls, 0);
  await requests.boundedTelemetry(async () => { throw new Error("Offline insert failure"); });
});

test("client deadline includes body reading and releases pending state", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const slot = createRequestSlot();
  const request = slot.begin();
  const reading = deferred<void>();
  const fetcher: typeof fetch = async (_url, init) => {
    assert.equal(init?.signal, request.signal);
    return { ok: true, json: () => { reading.resolve(); return new Promise<never>(() => {}); } } as unknown as Response;
  };
  let pending = true;
  const result = fetchAiJson("/offline", {}, request.signal, fetcher).finally(() => { if (request.finish()) pending = false; });
  const rejected = assert.rejects(result, { name: "TimeoutError" });
  await reading.promise;
  t.mock.timers.tick(20000);
  await rejected;
  assert.equal(request.signal.aborted, true); assert.equal(pending, false);
});

test("replacement, close, and unmount invalidate late results and old finally blocks", async () => {
  const slot = createRequestSlot();
  const old = slot.begin();
  const body = deferred<unknown>();
  const reading = deferred<void>();
  const fetcher: typeof fetch = async () => ({ ok: true, json: () => { reading.resolve(); return body.promise; } }) as unknown as Response;
  const oldResult = fetchAiJson("/offline", {}, old.signal, fetcher);
  const rejected = assert.rejects(oldResult, { name: "AbortError" });
  await reading.promise;
  const next = slot.begin();
  await rejected;
  body.resolve({ answer: "stale answer" });
  await Promise.resolve();
  assert.equal(old.canCommit(), false); assert.equal(old.finish(), false); assert.equal(next.canCommit(), true);
  slot.cancel();
  assert.equal(next.signal.aborted, true); assert.equal(next.isCurrent(), false); assert.equal(next.finish(), false);
});

test("completed or cancelled client requests clean up timers", t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const parent = new AbortController();
  const remove = t.mock.method(parent.signal, "removeEventListener");
  const deadline = createDeadline(20, parent.signal);
  deadline.dispose();
  t.mock.timers.tick(20);
  assert.equal(deadline.signal.aborted, false); assert.equal(remove.mock.callCount(), 1);
  const slot = createRequestSlot();
  const request = slot.begin();
  assert.equal(request.finish(), true);
  t.mock.timers.tick(20000);
  assert.equal(request.signal.aborted, false);
});

test("client preserves auth and rate-limit errors, even with non-JSON response bodies", async () => {
  for (const status of [401, 403, 429]) {
    const request = createDeadline(1000);
    try {
      const fetcher: typeof fetch = async () => new Response("Not JSON", { status });
      await assert.rejects(fetchAiJson("/offline", {}, request.signal, fetcher), error => error instanceof requests.AiHttpError && error.status === status);
    } finally { request.dispose(); }
  }
});

// Source-coupled integration, NOT rendered React: execute the actual handlers and lifecycle
// effect with real request slots/fetchAiJson, but simulate dependency comparison and commit.
// No DOM/test renderer is installed. This does not cover React scheduling, focus, or layout.
function componentLifecycleHarness(reproduceOldCleanup = false) {
  const source = readFileSync(new URL("../components/laris-app.tsx", import.meta.url), "utf8");
  const tree = ts.createSourceFile("laris-app.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const component = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "LarisApp");
  assert.ok(component && ts.isFunctionDeclaration(component) && component.body);
  const statements = component.body.statements;
  const declaration = (name: string) => {
    const node = statements.find(statement =>
      (ts.isFunctionDeclaration(statement) && statement.name?.text === name) ||
      (ts.isVariableStatement(statement) && statement.declarationList.declarations.some(item => item.name.getText(tree) === name)));
    assert.ok(node, `Missing component declaration: ${name}`);
    return node.getText(tree);
  };
  const effects = statements.filter(node => ts.isExpressionStatement(node) && ts.isCallExpression(node.expression)
    && node.expression.expression.getText(tree) === "useEffect" && node.getText(tree).includes("aiRequests.cancel()"));
  assert.equal(effects.length, 1, "Select the actual request lifecycle effect, not a replacement helper");
  let effectSource = effects[0].getText(tree);
  if (reproduceOldCleanup) {
    assert.match(effectSource, /scanRequests, mode/);
    effectSource = effectSource.replace("scanRequests, mode", "scanRequests, modal, mode");
  }
  const overviewClicks: ts.Expression[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(tree) === "button"
      && node.children.some(child => ts.isJsxText(child) && child.text.trim() === "Cari peluang lainnya")) {
      const attribute = node.openingElement.attributes.properties.find(item => ts.isJsxAttribute(item) && item.name.getText(tree) === "onClick");
      assert.ok(attribute && ts.isJsxAttribute(attribute) && attribute.initializer && ts.isJsxExpression(attribute.initializer));
      assert.ok(attribute.initializer.expression);
      overviewClicks.push(attribute.initializer.expression);
    }
    ts.forEachChild(node, visit);
  };
  visit(component);
  assert.equal(overviewClicks.length, 1, "Use the real Overview shortcut callback");
  const snippets = ["cancelAiRequests", "open", "close", "askAssistant", "resetDemo"].map(declaration).join("\n");
  type Message = { role: string; text: string };
  const values: { modal: string | null; messages: Message[]; pendingAi: boolean; pendingScan: boolean; recording: boolean; error: string; [key: string]: unknown } = {
    modal: null, messages: [], pendingAi: false, pendingScan: false, recording: false, error: "", state: tenantState(), demoRevision: 0,
  };
  const setters = Object.fromEntries([...new Set(`${snippets}\n${effectSource}`.match(/\bset[A-Z]\w*(?=\()/g))].map(name => {
    const key = name[3].toLowerCase() + name.slice(4);
    return [name, (value: unknown) => { values[key] = typeof value === "function" ? value(values[key]) : value; }];
  }));
  type Effect = { setup: () => void | (() => void); deps: readonly unknown[] };
  type Snapshot = { mode: "cloud" | "local"; workspaceId: string; user: { id: string }; canRecordOperations: boolean };
  type Handlers = { open: (modal: string) => void; close: () => void; askAssistant: (question: string) => Promise<void>; overview: () => void; resetDemo: () => void };
  const scheduled: Effect[] = [];
  let previous: Effect | undefined;
  let cleanup: void | (() => void);
  let cleanupCount = 0;
  const aiRequests = createRequestSlot(), scanRequests = createRequestSlot();
  const speech: { current: { stop: () => void } | null } = { current: null };
  const tasks: Promise<void>[] = [];
  const calls: { signal: AbortSignal; body: ReturnType<typeof deferred<Record<string, unknown>>> }[] = [];
  const removedKeys: string[] = [];
  const fetcher: typeof fetch = async (_url, init) => {
    assert.ok(init?.signal);
    const body = deferred<Record<string, unknown>>();
    calls.push({ signal: init.signal, body });
    return { ok: true, json: () => body.promise } as unknown as Response;
  };
  const javascript = ts.transpileModule(`(snapshot => {
    const { modal, mode, workspaceId, user, canRecordOperations, messages, confirmRequest } = snapshot;
    ${snippets}
    ${effectSource}
    const originalAsk = askAssistant;
    askAssistant = question => track(originalAsk(question));
    return { open, close, askAssistant, resetDemo, overview: ${overviewClicks[0].getText(tree)} };
  })`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const createHandlers = runInNewContext(javascript, {
    ...setters, aiRequests, scanRequests, speech, Error,
    useCallback: <T>(callback: T) => callback,
    useEffect: (setup: Effect["setup"], deps: Effect["deps"]) => { scheduled.push({ setup, deps }); },
    fetchAiJson: (url: string, init: RequestInit, signal: AbortSignal) => fetchAiJson(url, init, signal, fetcher),
    aiFailureReason: requests.aiFailureReason,
    track: (task: Promise<void>) => { tasks.push(task); return task; },
    resetDemoSession, createInitialState: data.createInitialState, activeToday: data.DEMO_DATE, demoProducts: data.products,
    checkoutAttempt: { current: null }, purchaseAttempt: { current: null },
    window: { localStorage: { removeItem: (key: string) => removedKeys.push(key) } },
    go: (view: string) => { values.view = view; }, notify: (text: string) => { values.toast = text; },
  }) as (snapshot: Snapshot & Record<string, unknown>) => Handlers;
  let props: Snapshot = { mode: "cloud", workspaceId: "workspace-a", user: { id: "user-a" }, canRecordOperations: true };
  let handlers: Handlers;
  const commit = (changes: Partial<Snapshot> = {}) => {
    props = { ...props, ...changes };
    scheduled.length = 0;
    handlers = createHandlers({ ...values, ...props });
    assert.equal(scheduled.length, 1);
    const next = scheduled[0];
    if (!previous || previous.deps.length !== next.deps.length || next.deps.some((value, index) => !Object.is(value, previous?.deps[index]))) {
      if (cleanup) { cleanupCount++; cleanup(); }
      cleanup = next.setup();
    }
    previous = next;
  };
  const unmount = () => { if (cleanup) { cleanupCount++; cleanup(); } cleanup = undefined; previous = undefined; };
  const settle = async () => { await Promise.all(tasks); };
  commit();
  return {
    values, calls, aiRequests, scanRequests, speech, removedKeys, commit, unmount, settle,
    get handlers() { return handlers; }, get cleanupCount() { return cleanupCount; },
    dispose: () => { unmount(); aiRequests.cancel(); scanRequests.cancel(); return settle(); },
  };
}

test("Overview deferred answer survives event-before-modal-commit ordering (source integration, not rendered)", async t => {
  const app = componentLifecycleHarness(); t.after(() => app.dispose());
  app.handlers.overview();
  assert.equal(app.values.modal, "assistant");
  assert.equal(app.calls.length, 1);
  assert.equal(app.values.messages.length, 1);
  assert.equal(app.values.messages[0].text, "Menu apa yang paling laris hari ini?");
  assert.equal(app.values.pendingAi, true);
  app.commit(); // The request is already waiting when old effect cleanup would run.
  assert.equal(app.cleanupCount, 0);
  assert.equal(app.calls[0].signal.aborted, false);
  assert.equal(app.values.pendingAi, true);
  assert.equal(app.values.messages.length, 1);
  app.calls[0].body.resolve({ answer: "Deferred tenant answer", source: "offline-test" });
  await app.settle();
  assert.equal(app.values.messages.length, 2);
  assert.equal(app.values.messages[1].text, "offline-test\nDeferred tenant answer");
  assert.equal(app.values.pendingAi, false);
  assert.equal(app.values.error, "");
});

test("source integration negative control reproduces the old modal cleanup defect", async t => {
  const app = componentLifecycleHarness(true); t.after(() => app.dispose());
  app.handlers.overview();
  assert.equal(app.calls[0].signal.aborted, false);
  app.commit();
  assert.equal(app.cleanupCount, 1);
  assert.equal(app.calls[0].signal.aborted, true);
  app.calls[0].body.resolve({ answer: "Must not appear" });
  await app.settle();
  assert.equal(app.values.messages.length, 1);
  assert.equal(app.values.pendingAi, false);
});

test("close/reopen before commit rejects late answers and errors without clearing the new pending request", async t => {
  for (const failure of [false, true]) {
    const app = componentLifecycleHarness(); t.after(() => app.dispose());
    app.handlers.overview(); app.commit();
    const oldTask = app.handlers.askAssistant("Old request");
    const oldCall = app.calls[1];
    app.handlers.close();
    assert.equal(oldCall.signal.aborted, true);
    assert.equal(app.values.pendingAi, false);
    app.handlers.overview(); // Reopen in the same event, before the next commit.
    const nextCall = app.calls[2];
    app.commit();
    await oldTask;
    assert.equal(nextCall.signal.aborted, false);
    assert.equal(app.values.pendingAi, true);
    if (failure) oldCall.body.reject(new Error("Late old failure"));
    else oldCall.body.resolve({ answer: "Late old answer" });
    nextCall.body.resolve({ answer: "Current answer" });
    await app.settle();
    assert.equal(app.values.messages.filter(message => message.role === "assistant").length, 1);
    assert.equal(app.values.messages.at(-1)?.text, "AI\nCurrent answer");
    assert.equal(app.values.error, "");
    assert.equal(app.values.pendingAi, false);
  }
});

test("same-modal request replacement keeps ownership through the next commit", async t => {
  const app = componentLifecycleHarness(); t.after(() => app.dispose());
  app.handlers.open("assistant"); app.commit();
  const old = app.handlers.askAssistant("First");
  const next = app.handlers.askAssistant("Second");
  assert.equal(app.calls[0].signal.aborted, true);
  app.commit(); await old;
  assert.equal(app.values.pendingAi, true);
  app.calls[0].body.resolve({ answer: "Obsolete" });
  app.calls[1].body.resolve({ answer: "Replacement" });
  await next;
  assert.equal(app.values.messages.filter(message => message.role === "assistant").length, 1);
  assert.equal(app.values.messages.at(-1)?.text, "AI\nReplacement");
  assert.equal(app.values.pendingAi, false);
});

test("every modal destination cancels both outgoing slots and speech synchronously, preserving role rejection", t => {
  const app = componentLifecycleHarness(); t.after(() => app.dispose());
  const source = readFileSync(new URL("../components/laris-app.tsx", import.meta.url), "utf8");
  const modalType = source.match(/type ModalName = ([^;]+);/);
  assert.ok(modalType);
  const destinations = [...modalType[1].matchAll(/"([^"]+)"/g)].map(match => match[1]);
  assert.ok(destinations.length);
  for (const destination of destinations) {
    const old = app.aiRequests.begin(), scan = app.scanRequests.begin();
    let stopped = false;
    app.speech.current = { stop: () => { stopped = true; assert.equal(app.speech.current, null); } };
    app.values.pendingAi = true; app.values.pendingScan = true; app.values.recording = true;
    app.handlers.open(destination);
    assert.equal(old.signal.aborted, true, destination); assert.equal(scan.signal.aborted, true, destination);
    assert.equal(stopped, true); assert.equal(app.values.recording, false);
    assert.equal(app.values.pendingAi, false); assert.equal(app.values.pendingScan, false);
    const next = app.aiRequests.begin(); app.values.pendingAi = true;
    app.commit();
    assert.equal(next.canCommit(), true, destination); assert.equal(app.values.pendingAi, true, destination);
  }
  app.commit({ canRecordOperations: false });
  const current = app.aiRequests.begin(), modal = app.values.modal;
  app.handlers.open("voice");
  assert.equal(app.values.modal, modal); assert.equal(current.canCommit(), true);
});

for (const boundary of ["account", "workspace", "mode", "unmount"] as const) {
  test(`${boundary} cleanup invalidates a deferred assistant answer and scan request`, async t => {
    const app = componentLifecycleHarness(); t.after(() => app.dispose());
    app.handlers.overview(); app.commit();
    const scan = app.scanRequests.begin();
    let stopped = false;
    app.speech.current = { stop: () => { stopped = true; assert.equal(app.speech.current, null); } };
    if (boundary === "unmount") app.unmount();
    else app.commit(boundary === "account" ? { user: { id: "user-b" } } : boundary === "workspace" ? { workspaceId: "workspace-b" } : { mode: "local" });
    assert.equal(app.calls[0].signal.aborted, true); assert.equal(scan.signal.aborted, true); assert.equal(stopped, true);
    app.calls[0].body.resolve({ answer: "Obsolete identity answer" });
    await app.settle();
    assert.equal(app.values.messages.length, 1); assert.equal(app.values.error, "");
    if (boundary !== "unmount") assert.equal(app.values.pendingAi, false);
  });
}

test("actual confirmed demo reset cancels both slots before clearing the conversation", async t => {
  const app = componentLifecycleHarness(); t.after(() => app.dispose());
  app.commit({ mode: "local" });
  app.handlers.open("assistant");
  app.values.confirmRequest = { kind: "demo-reset" };
  app.values.messages = [{ role: "user", text: "Previous session" }];
  app.commit();
  const request = app.aiRequests.begin(), scan = app.scanRequests.begin();
  const body = deferred<Record<string, unknown>>();
  const pending = fetchAiJson("/offline", {}, request.signal, async () => ({ ok: true, json: () => body.promise }) as unknown as Response);
  const rejected = assert.rejects(pending, { name: "AbortError" });
  let stopped = false;
  app.speech.current = { stop: () => { stopped = true; assert.equal(app.values.messages.length, 1); } };
  app.values.pendingAi = true; app.values.pendingScan = true;
  app.handlers.resetDemo();
  assert.equal(request.signal.aborted, true); assert.equal(scan.signal.aborted, true); assert.equal(stopped, true);
  assert.equal(app.values.modal, null); assert.equal(app.values.messages.length, 0);
  assert.equal(app.values.pendingAi, false); assert.equal(app.values.pendingScan, false);
  assert.equal(app.removedKeys.length, 2);
  body.resolve({ answer: "Previous session answer" }); await rejected;
  assert.equal(request.canCommit(), false); assert.equal(request.finish(), false);
});

test("component wiring guards results, cancels lifecycle requests, and leaves manual OCR fields usable", () => {
  const source = readFileSync(new URL("../components/laris-app.tsx", import.meta.url), "utf8");
  for (const name of ["askAssistant", "handleVoiceParse", "handleReceiptScan"]) {
    const start = source.indexOf(`async function ${name}(`);
    const end = source.indexOf("\n  }", start);
    const handler = source.slice(start, end);
    assert.match(handler, /fetchAiJson/);
    assert.match(handler, /if \(!request\.canCommit\(\)\) return/);
    assert.match(handler, /if \(!request\.isCurrent\(\)\) return/);
    assert.match(handler, /if \(request\.finish\(\)\) setPending/);
    assert.doesNotMatch(handler.slice(handler.indexOf("} catch")), /respondLocally|setParsed\(parseOrder|setPhotoName|setPurchaseItem|recordPurchase/);
  }
  assert.match(source, /const close = useCallback\(\(\) => \{ cancelAiRequests\(\)/);
  assert.match(source, /return \(\) => \{\s*aiRequests\.cancel\(\); scanRequests\.cancel\(\)/);
  assert.match(source, /\[aiRequests, scanRequests, mode, workspaceId, user\?\.id\]/);
  assert.equal([...source.matchAll(/\bsetModal\(/g)].length, 2, "Only synchronous open/close may set the modal");
  assert.match(source, /const open = useCallback\([\s\S]*?cancelAiRequests\(\);\s*setError\(""\); setSidebarOpen\(false\); setModal\(next\)/);
  assert.match(source, /\[canRecordOperations, cancelAiRequests, notify\]/);
  assert.match(source, /if \(searchShortcut\) \{ setSearchQuery\(""\); open\("search"\); \}/);
  assert.match(source, /event\.key === "\?"[^\n]+open\("guide"\)/);
  assert.match(source, /\[close, open\]/);
  const checkout = source.slice(source.indexOf("async function checkout("), source.indexOf("function downloadCsv("));
  assert.equal([...checkout.matchAll(/open\("receipt"\)/g)].length, 2, "Both checkout paths use synchronous cancellation");
  assert.match(source, /cancelPending: cancelAiRequests/);
  assert.match(source, /if \(speech\.current !== recognition\) return/);
  assert.match(source, /voiceNotice &&/);
  assert.match(source, /data\.source.*data\.notice/);
  for (const name of ["quantity", "total"]) {
    const field = source.match(new RegExp(`<input name="${name}"[^>]+>`));
    assert.ok(field); assert.doesNotMatch(field[0], /disabled/);
  }
});
