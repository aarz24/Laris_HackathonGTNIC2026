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
import * as voice from "./voice-order.ts";
import { createVoiceRecording, voiceAudioPayload, type VoiceRecording } from "./voice-recorder.ts";
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
  messages?: { role: string; content: { type: string; text?: string }[] }[];
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
  demoAi?: boolean;
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
    "@/lib/ai-request": requests, "@/lib/ai-fallbacks": fallbacks, "@/lib/laris-data": data, "@/lib/voice-order": voice,
    "@/lib/env": { serverEnv: () => ({ demoVoiceAi: options.demoAi ?? false }) },
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

function proposalFor(text: string, catalog: voice.VoiceCatalog): voice.VoiceOrderProposal {
  const result = voice.parseVoiceOrder(text, catalog);
  return { lines: result.review.lines.map(line => ({ sourceId: line.id, raw: line.raw, quantity: line.quantity, productId: line.productId ?? null, ...(line.note ? { note: line.note } : {}) })), payment: { method: result.review.payment.method, raw: [...result.review.payment.raw] } };
}

test("parse-order: local and unavailable-provider paths share original transcript review evidence", async () => {
  const state = { ...tenantState(), products: data.products };
  const text = "2 es kopi susu 1 Americano 1 butter crossan bayar kiri";
  for (const local of [true, false]) {
    const route = routeHarness("parse-order", { state, local, modelAvailable: false });
    const response = await route.POST(requestFor("parse-order", undefined, { text, mode: local ? "local" : "cloud" }));
    const body = await response.json();
    assert.equal(response.status, 200); assert.equal(route.calls.length, 0);
    assert.equal(body.source, local ? "local-parser" : "fallback-parser");
    const result = voice.validateVoiceOrderResponse(body, data.products);
    assert.deepEqual(result.items, [{ productId: "kopi-susu", quantity: 2 }, { productId: "americano", quantity: 1 }]);
    assert.deepEqual(result.unknown, ["1 butter crossan", "bayar kiri"]);
    assert.equal(result.review.payment.method, null);
    assert.equal(voice.createVoiceOrderDraft(result.review, data.products).paymentAccepted, false);
  }
});

test("parse-order: valid text proposals overlay stable source IDs without combining carts", async () => {
  const state = tenantState();
  const text = "2 nasi tenant 1 nasi tenat 1 pizza bayar kiri";
  const proposal = proposalFor(text, state.products!);
  proposal.lines[1].productId = "tenant-meal";
  proposal.payment.method = "QRIS";
  const route = routeHarness("parse-order", { state, provider: async () => ({ output: proposal }) });
  const response = await route.POST(requestFor("parse-order", undefined, { text }));
  const body = await response.json();
  assert.equal(response.status, 200); assert.equal(body.source, "gemini");
  assert.deepEqual(body.items, [{ productId: "tenant-meal", quantity: 2 }]);
  assert.deepEqual(body.unknown, ["1 nasi tenat", "1 pizza", "bayar kiri"]);
  assert.equal(body.review.lines[1].quantity, 1); assert.notEqual(body.review.lines[1].status, "exact");
  assert.equal(body.review.payment.method, null);
  const prompt = route.calls[0].messages?.[0].content.find(part => part.type === "text")?.text ?? "";
  for (const line of proposal.lines) { assert.ok(prompt.includes(line.sourceId)); assert.ok(prompt.includes(line.raw)); }
  assert.equal(route.calls.length, 1);
  voice.validateVoiceOrderResponse(body, state.products!);
});

test("parse-order: AI-only correction and conflicting quantities cannot enter exact items", async () => {
  const state = tenantState();
  const text = "2 nasi tenant 1 mystery bayar qris";
  const proposal = proposalFor(text, state.products!);
  proposal.lines[0].quantity = 77;
  proposal.lines[1].productId = "tenant-meal";
  const route = routeHarness("parse-order", { state, provider: async () => ({ output: proposal }) });
  const response = await route.POST(requestFor("parse-order", undefined, { text }));
  const body = await response.json();
  assert.equal(body.source, "gemini"); assert.deepEqual(body.items, []);
  assert.equal(body.review.lines[0].quantity, 2); assert.equal(body.review.lines[0].issue, "quantity");
  assert.equal(body.review.lines[1].candidates[0].method, "ai");
  const result = voice.validateVoiceOrderResponse(body, state.products!);
  const draft = voice.createVoiceOrderDraft(result.review, state.products!);
  assert.ok(draft.rows.every(row => !row.accepted));
  assert.equal(voice.validateVoiceOrderDraft(result.review, draft, state.products!).ok, false);
});

test("parse-order: malformed model references and payloads fall back to unchanged source evidence", async () => {
  const state = tenantState();
  const text = "2 nasi tenant 1 pizza bayar qris";
  const mutations: ((proposal: voice.VoiceOrderProposal) => void)[] = [
    proposal => { proposal.lines.pop(); }, proposal => { proposal.lines.push({ ...proposal.lines[0] }); },
    proposal => { proposal.lines[1].sourceId = proposal.lines[0].sourceId; }, proposal => { proposal.lines[1].sourceId = "wrong-source"; },
    proposal => { proposal.lines[0].productId = "outside-workspace"; }, proposal => { proposal.lines[0].productId = "inactive-meal"; },
    proposal => { proposal.lines[0].raw = "model rewrote source"; }, proposal => { proposal.lines[0].quantity = 1000; },
    proposal => { proposal.lines[0].quantity = -1; }, proposal => { proposal.payment.raw = ["bayar tunai"]; },
  ];
  for (const mutate of mutations) {
    const proposal = proposalFor(text, state.products!); mutate(proposal);
    const route = routeHarness("parse-order", { state, provider: async () => ({ output: proposal }) });
    const response = await route.POST(requestFor("parse-order", undefined, { text }));
    const body = await response.json();
    assert.equal(response.status, 200); assert.equal(body.source, "fallback-parser"); assert.equal(body.reason, "provider-error");
    assert.deepEqual(voice.validateVoiceOrderResponse(body, state.products!), voice.parseVoiceOrder(text, state.products!));
    assert.equal(route.calls.length, 1);
  }
  for (const output of [null, {}, { items: [], payment: "QRIS", unknown: [] }]) {
    const route = routeHarness("parse-order", { provider: async () => ({ output }) });
    const response = await route.POST(requestFor("parse-order", undefined, { text }));
    assert.equal((await response.json()).source, "fallback-parser");
  }
});

test("parse-order: audio-only results require every proposed item and payment to be accepted", async () => {
  const state = tenantState();
  const output: voice.VoiceOrderProposal = { lines: [
    { sourceId: "heard-1", raw: "dua nasi tenant", productId: "tenant-meal", quantity: 2 },
    { sourceId: "heard-2", raw: "satu pizza", productId: null, quantity: 1 },
  ], payment: { method: "QRIS", raw: ["bayar qris"] } };
  const route = routeHarness("parse-order", { state, provider: async () => ({ output }) });
  const response = await route.POST(requestFor("parse-order", undefined, { text: "", audio: "eA==", mimeType: "audio/webm" }));
  const body = await response.json();
  assert.equal(response.status, 200); assert.equal(body.source, "gemini"); assert.deepEqual(body.items, []);
  const result = voice.validateVoiceOrderResponse(body, state.products!);
  assert.deepEqual(result.unknown, ["dua nasi tenant", "satu pizza", "bayar qris"]);
  assert.deepEqual(result.review.lines.map(line => line.id), ["heard-1", "heard-2"]);
  assert.equal(result.review.payment.method, null);
  const draft = voice.createVoiceOrderDraft(result.review, state.products!);
  assert.equal(draft.paymentAccepted, false); assert.ok(draft.rows.every(row => !row.accepted));
  const bad = routeHarness("parse-order", { provider: async () => ({ output: { ...output, lines: [output.lines[0], output.lines[0]] } }) });
  const failure = await bad.POST(requestFor("parse-order", undefined, { text: "", audio: "eA==" }));
  assert.equal(failure.status, 502); assert.equal((await failure.json()).code, "AI_AUDIO_REQUIRES_TEXT");
});

test("parse-order: unsupported quantities and inactive exact products remain blocked through Gemini", async () => {
  const state = tenantState();
  const text = "1,5 nasi tenant 1 menu nonaktif bayar kiri";
  const proposal = proposalFor(text, state.products!);
  proposal.lines[0].quantity = 2; proposal.lines[0].productId = "tenant-meal";
  proposal.lines[1].productId = "tenant-meal";
  const route = routeHarness("parse-order", { state, provider: async () => ({ output: proposal }) });
  const body = await (await route.POST(requestFor("parse-order", undefined, { text }))).json();
  assert.equal(body.source, "gemini"); assert.deepEqual(body.items, []);
  assert.equal(body.review.lines[0].quantity, null); assert.equal(body.review.lines[0].issue, "quantity");
  assert.equal(body.review.lines[1].issue, "unavailable"); assert.deepEqual(body.review.lines[1].candidates, []);
});

test("parse-order: limits reject the entire request before any provider invocation", async () => {
  for (const [text, status] of [["x".repeat(2001), 400], [" ".repeat(2001), 400], [Array(51).fill("1 nasi tenant").join(" "), 422]] as const) {
    const route = routeHarness("parse-order");
    const response = await route.POST(requestFor("parse-order", undefined, { text }));
    assert.equal(response.status, status); assert.equal(route.calls.length, 0);
    assert.equal((await response.json()).items, undefined);
  }
});

test("demo voice AI is opt-in, uses the browser demo catalogue, and retains review", async () => {
  const catalog = [{ id: "demo-special", name: "Kopi Spesial", active: true }];
  const output = { lines: [{ sourceId: "line-1", raw: "dua kopi spesial", quantity: 2, productId: "demo-special" }], payment: { method: "QRIS", raw: ["bayar qris"] } };
  const enabled = routeHarness("parse-order", { local: true, demoAi: true, provider: async () => ({ output }) });
  const response = await enabled.POST(requestFor("parse-order", undefined, { mode: "local", text: "dua kopi spesial bayar qris", catalog, interpret: true }));
  const body = await response.json();
  assert.equal(response.status, 200); assert.equal(body.source, "gemini"); assert.equal(enabled.calls.length, 1);
  assert.match(enabled.calls[0].instructions, /demo-special/); assert.doesNotMatch(enabled.calls[0].instructions, /tenant-meal/);
  assert.equal(voice.validateVoiceOrderResponse(body, catalog).items[0].quantity, 2);
  const disabled = routeHarness("parse-order", { local: true });
  const local = await (await disabled.POST(requestFor("parse-order", undefined, { mode: "local", text: "dua kopi spesial", catalog }))).json();
  assert.equal(local.source, "local-parser"); assert.equal(disabled.calls.length, 0);
  const cloud = routeHarness("parse-order", { modelAvailable: false });
  const tenant = await (await cloud.POST(requestFor("parse-order", undefined, { text: "dua nasi tenant", catalog }))).json();
  assert.equal(tenant.items[0].productId, "tenant-meal", "client catalogue never overrides cloud scope");
});

test("demo audio reaches Gemini once and every proposed menu still requires acceptance", async () => {
  const output = { lines: [{ sourceId: "line-1", raw: "dua nasi tenant kurang manis", quantity: 2, productId: "tenant-meal", note: "less sugar" }], payment: { method: "QRIS", raw: ["bayar qris"] } };
  const route = routeHarness("parse-order", { local: true, demoAi: true, provider: async () => ({ output }) });
  const response = await route.POST(requestFor("parse-order", undefined, { mode: "local", text: "", audio: "eA==", mimeType: "audio/webm", interpret: true }));
  const body = await response.json();
  assert.equal(body.source, "gemini"); assert.match(body.transcript, /kurang manis/);
  assert.equal(route.calls.length, 1); assert.equal(route.calls[0].messages?.[0].content[0].type, "file");
  const result = voice.validateVoiceOrderResponse(body, tenantState().products!);
  const draft = voice.createVoiceOrderDraft(result.review, tenantState().products!);
  assert.equal(draft.rows[0].note, "less sugar"); assert.equal(draft.rows[0].accepted, false);
  const accepted = voice.acceptVoiceSuggestions(result.review, draft);
  assert.equal(voice.validateVoiceOrderDraft(result.review, accepted, tenantState().products!).ok, true);
});

test("demo voice has per-IP and shared instance limits without loading a user session", async () => {
  const limiter = () => loadIsolated<typeof import("./rate-limit")>("./rate-limit.ts", {
    "server-only": {}, "next/server": { NextResponse: Response },
    "@/lib/env": { isCloudConfigured: true, serverEnv: () => ({ demoVoiceAi: true }) },
    "@/lib/supabase/server": { createClient: () => { throw new Error("Demo must not load a cloud session"); } },
  });
  const ipRequest = (ip: string) => new Request("http://offline.invalid/api/ai/parse-order", { headers: { "x-forwarded-for": ip } }) as Parameters<ReturnType<typeof limiter>["aiRateLimit"]>[0];
  const perIp = limiter();
  for (let i = 0; i < 10; i++) assert.equal(await perIp.aiRateLimit(ipRequest("one"), "parse-order", "local"), null);
  const blocked = await perIp.aiRateLimit(ipRequest("one"), "parse-order", "local");
  assert.equal(blocked?.status, 429); assert.ok(Number(blocked?.headers.get("Retry-After")) > 0);
  const shared = limiter();
  for (let i = 0; i < 30; i++) assert.equal(await shared.aiRateLimit(ipRequest(`visitor-${i}`), "parse-order", "local"), null);
  assert.equal((await shared.aiRateLimit(ipRequest("visitor-31"), "parse-order", "local"))?.status, 429);
});

test("malformed audio and duplicate demo catalogue IDs never invoke Gemini", async () => {
  for (const input of [{ audio: "***", text: "" }, { catalog: [{ id: "same", name: "A" }, { id: "same", name: "B" }] }]) {
    const route = routeHarness("parse-order", { local: true, demoAi: true });
    const response = await route.POST(requestFor("parse-order", undefined, { mode: "local", ...input }));
    assert.equal(response.status, 400); assert.equal(route.calls.length, 0);
  }
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
  const snippets = ["invalidateVoicePreview", "cancelAiRequests", "open", "close", "askAssistant", "resetDemo", "handleVoiceParse", "replaceVoiceText", "startVoice", "stopVoice", "applyVoiceProductNote", "confirmVoiceOrder"].map(declaration).join("\n");
  const stockHelper = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "unavailableCartProducts")!;
  type Message = { role: string; text: string };
  const values: { modal: string | null; messages: Message[]; pendingAi: boolean; pendingScan: boolean; recording: boolean; error: string; [key: string]: unknown } = {
    modal: null, messages: [], pendingAi: false, pendingScan: false, recording: false, error: "", state: tenantState(), demoRevision: 0,
    parsed: null, voiceDraft: null, voiceText: "", voiceNotice: "", voiceConsumed: false, cart: [],
  };
  const setters = Object.fromEntries([...new Set(`${snippets}\n${effectSource}`.match(/\bset[A-Z]\w*(?=\()/g))].map(name => {
    const key = name[3].toLowerCase() + name.slice(4);
    return [name, (value: unknown) => { values[key] = typeof value === "function" ? value(values[key]) : value; }];
  }));
  type Effect = { setup: () => void | (() => void); deps: readonly unknown[] };
  type Snapshot = { mode: "cloud" | "local"; workspaceId: string; user: { id: string }; canRecordOperations: boolean };
  type Handlers = {
    open: (modal: string) => void; close: () => void; askAssistant: (question: string) => Promise<void>; overview: () => void; resetDemo: () => void;
    handleVoiceParse: (text: string) => Promise<void>; replaceVoiceText: (text: string, parse?: boolean) => void;
    startVoice: () => void; stopVoice: () => void; confirmVoiceOrder: () => void; applyVoiceProductNote: (productId: string, note: string) => void;
  };
  const scheduled: Effect[] = [];
  let previous: Effect | undefined;
  let cleanup: void | (() => void);
  let cleanupCount = 0;
  const aiRequests = createRequestSlot(), scanRequests = createRequestSlot();
  const speech: { current: { stop: () => void } | null } = { current: null };
  const voiceRevision = { current: 0 }, voiceConsumedGuard = { current: false }, voicePreview = { current: null };
  const audioRecording: { current: VoiceRecording | null } = { current: null };
  const recognitions: FakeRecognition[] = [];
  class FakeRecognition {
    onresult?: (event: { results: { 0: { 0: { transcript: string } } } }) => void;
    onerror?: () => void;
    onend?: () => void;
    stopped = false;
    constructor() { recognitions.push(this); }
    start() {}
    stop() { this.stopped = true; this.onend?.(); }
    result(transcript: string) { this.onresult?.({ results: { 0: { 0: { transcript } } } }); }
  }
  const tasks: Promise<void>[] = [];
  const calls: { signal: AbortSignal; body: ReturnType<typeof deferred<Record<string, unknown>>> }[] = [];
  const removedKeys: string[] = [];
  const fetcher: typeof fetch = async (_url, init) => {
    assert.ok(init?.signal);
    const input = JSON.parse(init.body as string);
    if (input.mode === "local") return Response.json(voice.parseVoiceOrder(input.text, tenantState().products!));
    const body = deferred<Record<string, unknown>>();
    calls.push({ signal: init.signal, body });
    return { ok: true, json: () => body.promise } as unknown as Response;
  };
  const javascript = ts.transpileModule(`(snapshot => {
    const { modal, mode, workspaceId, user, canRecordOperations, messages, confirmRequest, parsed, voiceDraft, cart, pendingAi, recording, state } = snapshot;
    const { products, inventory } = state;
    ${stockHelper.getText(tree)}
    ${snippets}
    ${effectSource}
    const originalAsk = askAssistant;
    askAssistant = question => track(originalAsk(question));
    const originalParse = handleVoiceParse;
    handleVoiceParse = text => track(originalParse(text));
    return { open, close, askAssistant, resetDemo, handleVoiceParse, replaceVoiceText, startVoice, stopVoice, confirmVoiceOrder, applyVoiceProductNote, overview: ${overviewClicks[0].getText(tree)} };
  })`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const createHandlers = runInNewContext(javascript, {
    ...setters, aiRequests, scanRequests, speech, audioRecording, voiceRevision, voiceConsumedGuard, voicePreview, Error,
    createVoiceRecording, voiceAudioPayload, AiHttpError: requests.AiHttpError,
    ...voice, getStock: data.getStock,
    useCallback: <T>(callback: T) => callback,
    useEffect: (setup: Effect["setup"], deps: Effect["deps"]) => { scheduled.push({ setup, deps }); },
    fetchAiJson: (url: string, init: RequestInit, signal: AbortSignal) => fetchAiJson(url, init, signal, fetcher),
    aiFailureReason: requests.aiFailureReason,
    track: (task: Promise<void>) => { tasks.push(task); return task; },
    resetDemoSession, createInitialState: data.createInitialState, activeToday: data.DEMO_DATE, demoProducts: data.products,
    checkoutAttempt: { current: null }, purchaseAttempt: { current: null },
    window: { localStorage: { removeItem: (key: string) => removedKeys.push(key) }, SpeechRecognition: FakeRecognition },
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
    values, calls, aiRequests, scanRequests, speech, removedKeys, recognitions, commit, unmount, settle,
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
    app.values.parsed = { review: {} }; app.values.voiceDraft = { rows: [] }; app.values.voiceNotice = "Old preview";
    app.handlers.close();
    assert.equal(oldCall.signal.aborted, true);
    assert.equal(app.values.pendingAi, false);
    assert.equal(app.values.parsed, null); assert.equal(app.values.voiceDraft, null); assert.equal(app.values.voiceNotice, "");
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
    app.values.parsed = { review: {} }; app.values.voiceDraft = { rows: [] }; app.values.voiceConsumed = true;
    if (boundary === "unmount") app.unmount();
    else app.commit(boundary === "account" ? { user: { id: "user-b" } } : boundary === "workspace" ? { workspaceId: "workspace-b" } : { mode: "local" });
    assert.equal(app.calls[0].signal.aborted, true); assert.equal(scan.signal.aborted, true); assert.equal(stopped, true);
    app.calls[0].body.resolve({ answer: "Obsolete identity answer" });
    await app.settle();
    assert.equal(app.values.messages.length, 1); assert.equal(app.values.error, "");
    if (boundary !== "unmount") {
      assert.equal(app.values.pendingAi, false); assert.equal(app.values.parsed, null);
      assert.equal(app.values.voiceDraft, null); assert.equal(app.values.voiceConsumed, false);
    }
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

test("voice confirmation consumes a reviewed preview once, even before React commits", async t => {
  const app = componentLifecycleHarness(); t.after(() => app.dispose());
  app.commit({ mode: "local" }); app.commit();
  await app.handlers.handleVoiceParse("2 nasi tenant bayar qris"); app.commit();
  const confirm = app.handlers.confirmVoiceOrder;
  confirm(); confirm();
  assert.equal((app.values.cart as data.CartItem[])[0].quantity, 2);
  assert.equal(app.values.payment, "QRIS");
  assert.equal(app.values.modal, null); assert.equal(app.values.parsed, null);
});

test("voice text edits and new recordings synchronously invalidate old confirmation closures", async t => {
  for (const action of ["text", "recording", "parse", "close"] as const) {
    const app = componentLifecycleHarness(); t.after(() => app.dispose());
    app.commit({ mode: "local" }); app.commit();
    await app.handlers.handleVoiceParse("2 nasi tenant"); app.commit();
    const oldConfirm = app.handlers.confirmVoiceOrder;
    if (action === "text") app.handlers.replaceVoiceText("3 nasi tenant");
    if (action === "recording") app.handlers.startVoice();
    if (action === "parse") await app.handlers.handleVoiceParse("3 nasi tenant");
    if (action === "close") { app.handlers.close(); app.handlers.open("voice"); }
    oldConfirm();
    assert.equal((app.values.cart as data.CartItem[]).length, 0, action);
    if (action === "parse") {
      app.commit(); app.handlers.confirmVoiceOrder();
      assert.equal((app.values.cart as data.CartItem[])[0].quantity, 3);
    }
  }
});

test("voice requests reject late responses after text edits and close/reopen without clearing new work", async t => {
  for (const action of ["text", "close"] as const) {
    const app = componentLifecycleHarness(); t.after(() => app.dispose());
    const old = app.handlers.handleVoiceParse("2 nasi tenant"); app.commit();
    if (action === "text") app.handlers.replaceVoiceText("3 nasi tenant");
    else { app.handlers.close(); app.handlers.open("voice"); }
    const next = app.handlers.handleVoiceParse("3 nasi tenant"); app.commit();
    app.calls[0].body.resolve(voice.parseVoiceOrder("2 nasi tenant", tenantState().products!) as unknown as Record<string, unknown>);
    await old;
    assert.equal(app.values.parsed, null); assert.equal(app.values.pendingAi, true);
    app.calls[1].body.resolve(voice.parseVoiceOrder("3 nasi tenant", tenantState().products!) as unknown as Record<string, unknown>);
    await next; app.commit();
    assert.equal((app.values.voiceDraft as voice.VoiceOrderDraft).rows[0].quantity, 3);
    assert.equal(app.values.pendingAi, false);
  }
});

test("manual voice edits stop recognition first and ignore all late speech callbacks", async t => {
  const app = componentLifecycleHarness(); t.after(() => app.dispose());
  app.handlers.startVoice(); app.commit();
  const recognition = app.recognitions[0];
  app.handlers.replaceVoiceText("typed order");
  assert.equal(recognition.stopped, true); assert.equal(app.values.recording, false);
  recognition.result("late transcript"); recognition.onerror?.(); recognition.onend?.();
  assert.equal(app.values.voiceText, "typed order"); assert.equal(app.values.error, ""); assert.equal(app.calls.length, 0);
  app.handlers.startVoice(); app.commit();
  recognition.onend?.();
  assert.equal(app.values.recording, true, "old onend cannot finish the replacement recording");
});

for (const change of [{ workspaceId: "workspace-b" }, { user: { id: "user-b" } }, { mode: "local" as const }]) {
  test(`voice identity cleanup clears recording, transcript and preview: ${JSON.stringify(change)}`, async t => {
    const app = componentLifecycleHarness(); t.after(() => app.dispose());
    app.handlers.startVoice(); app.commit();
    const recognition = app.recognitions[0];
    recognition.result("2 nasi tenant"); app.commit();
    app.values.voiceNotice = "Previous tenant notice";
    app.commit(change);
    assert.equal(recognition.stopped, true); assert.equal(app.values.recording, false);
    assert.equal(app.values.voiceText, ""); assert.equal(app.values.voiceNotice, "");
    assert.equal(app.values.parsed, null); assert.equal(app.values.voiceDraft, null);
    app.calls[0].body.resolve(voice.parseVoiceOrder("2 nasi tenant", tenantState().products!) as unknown as Record<string, unknown>);
    await app.settle();
    assert.equal(app.values.parsed, null);
  });
}

function recordingHarness() {
  const permission = deferred<MediaStream>();
  let stopped = 0;
  const stream = { getTracks: () => [{ stop: () => { stopped++; } }] } as unknown as MediaStream;
  const recorders: Recorder[] = [];
  class Recorder {
    static isTypeSupported(type: string) { return type === "audio/webm;codecs=opus"; }
    state = "inactive";
    mimeType = "audio/webm;codecs=opus";
    ondataavailable?: (event: { data: Blob }) => void;
    onstop?: () => void;
    onerror?: () => void;
    constructor() { recorders.push(this); }
    start() { this.state = "recording"; }
    stop() { this.state = "inactive"; this.ondataavailable?.({ data: new Blob(["recorded audio"]) }); this.onstop?.(); }
  }
  const audio: Blob[] = [], errors: string[] = [], ticks: number[] = [];
  const recording = createVoiceRecording({ onAudio: blob => audio.push(blob), onError: message => errors.push(message), onTick: seconds => ticks.push(seconds) }, { getUserMedia: () => permission.promise }, Recorder as unknown as typeof MediaRecorder);
  return { permission, stream, recorders, recording, audio, errors, ticks, stopped: () => stopped };
}

test("recording sends complete audio once, preserves MIME and releases the microphone", async () => {
  const h = recordingHarness(); h.permission.resolve(h.stream); await Promise.resolve();
  h.recording.finish(); h.recording.finish();
  assert.equal(h.audio.length, 1); assert.equal(h.stopped(), 1);
  assert.deepEqual(await voiceAudioPayload(h.audio[0]), { audio: Buffer.from("recorded audio").toString("base64"), mimeType: "audio/webm" });
});

test("recording cancellation during permission and during capture never submits audio", async () => {
  for (const beforePermission of [true, false]) {
    const h = recordingHarness();
    if (beforePermission) h.recording.cancel();
    h.permission.resolve(h.stream); await Promise.resolve();
    if (!beforePermission) h.recording.cancel();
    assert.equal(h.audio.length, 0); assert.equal(h.errors.length, 0); assert.ok(h.stopped() > 0);
  }
});

test("recording auto-finishes at thirty seconds and permission failures are actionable", async t => {
  t.mock.timers.enable({ apis: ["setInterval", "Date"] });
  const h = recordingHarness(); h.permission.resolve(h.stream); await Promise.resolve();
  t.mock.timers.tick(30_000);
  assert.equal(h.audio.length, 1); assert.ok(h.stopped() > 0);
  const denied = recordingHarness(); denied.permission.reject(new DOMException("Denied", "NotAllowedError"));
  await Promise.resolve(); await Promise.resolve();
  assert.match(denied.errors[0], /Izinkan mikrofon/); assert.equal(denied.audio.length, 0);
});

test("stopping before permission resolves releases a late stream and reports no recording", async () => {
  const h = recordingHarness(); h.recording.finish();
  h.permission.resolve(h.stream); await Promise.resolve();
  assert.equal(h.audio.length, 0); assert.ok(h.stopped() > 0); assert.match(h.errors[0], /belum dimulai/);
});

test("component wiring guards results, cancels lifecycle requests, and leaves manual OCR fields usable", () => {
  const source = readFileSync(new URL("../components/laris-app.tsx", import.meta.url), "utf8");
  for (const name of ["askAssistant", "handleVoiceParse", "handleReceiptScan"]) {
    const start = source.indexOf(`async function ${name}(`);
    const end = source.indexOf("\n  }", start);
    const handler = source.slice(start, end);
    assert.match(handler, /fetchAiJson/);
    if (name === "handleVoiceParse") {
      assert.match(handler, /if \(!request\.canCommit\(\) \|\| revision !== voiceRevision\.current\) return/);
      assert.match(handler, /if \(!request\.isCurrent\(\) \|\| revision !== voiceRevision\.current\) return/);
    } else {
      assert.match(handler, /if \(!request\.canCommit\(\)\) return/);
      assert.match(handler, /if \(!request\.isCurrent\(\)\) return/);
    }
    assert.match(handler, /if \(request\.finish\(\)\) setPending/);
    assert.doesNotMatch(handler.slice(handler.indexOf("} catch")), /respondLocally|setParsed\(parseOrder|setPhotoName|setPurchaseItem|recordPurchase/);
  }
  assert.match(source, /const close = useCallback\(\(\) => \{ cancelAiRequests\(\); invalidateVoicePreview\(\)/);
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
  assert.match(source, /const recognition = speech\.current; speech\.current = null; recognition\?\.stop\(\)/);
  assert.match(source, /if \(speech\.current !== recognition\) return/);
  assert.match(source, /function replaceVoiceText\([\s\S]*?cancelAiRequests\(\); invalidateVoicePreview\(\)[\s\S]*?setVoiceText\(text\)/);
  assert.match(source, /function startVoice\(\) \{[\s\S]*?cancelAiRequests\(\); invalidateVoicePreview\(\)/);
  assert.match(source, /const result = validateVoiceOrderResponse\(data, products\);\s*voicePreview\.current = result;\s*setParsed\(result\); setVoiceDraft\(createVoiceOrderDraft\(result\.review, products\)\)/);
  assert.match(source, /function confirmVoiceOrder\(\) \{\s*if \(voiceConsumedGuard\.current\) return;\s*voiceConsumedGuard\.current = true/);
  assert.match(source, /validateVoiceOrderDraft\(parsed\.review, voiceDraft, products\)/);
  assert.match(source, /mergeVoiceOrderDraft\(parsed\.review, voiceDraft, cart, products\)/);
  assert.match(source, /unavailableCartProducts\(merged\.items, products, inventory, state\)/);
  assert.match(source, /setCart\(merged\.items\); setPayment\(merged\.payment\)/);
  assert.match(source, /voiceNotice &&/);
  assert.match(source, /data\.source.*data\.notice/);
  const preview = readFileSync(new URL("../components/voice-order-preview.tsx", import.meta.url), "utf8");
  for (const action of ["Pilih menu", "Gunakan saran", "Hapus baris", "Metode pembayaran belum jelas", "Metode tidak disebutkan"]) assert.match(preview, new RegExp(action));
  assert.match(preview, /review\.lines\.map/);
  assert.match(preview, /onClick=\{\(\) => acceptProduct\(row, candidate\.productId\)\}/);
  for (const name of ["quantity", "total"]) {
    const field = source.match(new RegExp(`<input name="${name}"[^>]+>`));
    assert.ok(field); assert.doesNotMatch(field[0], /disabled/);
  }
});
