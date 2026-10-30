/**
 * Indonesian Voice-to-Cart Order Parsing Benchmark
 * PRD Requirement: 50 realistic Indonesian ordering utterances (slang, numbers, edge cases).
 * Target: 90%+ parsing accuracy AND every required safety fixture.
 *
 * Offline run (no environment file or cloud calls):
 *   node --experimental-strip-types scripts/eval-voice.ts
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { products, type CartItem, type Sale } from "../src/lib/laris-data.ts";
import { parseVoiceOrder, validateVoiceOrderResponse, type VoiceCatalog, type VoiceOrderResult, type VoiceOrderLine, type VoicePaymentReview } from "../src/lib/voice-order.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface ReviewExpectation {
  lines: (Pick<VoiceOrderLine, "status" | "quantity"> & Partial<Pick<VoiceOrderLine, "id" | "raw" | "productId" | "note" | "issue">> & { candidateIds?: string[] })[];
  payment: Pick<VoicePaymentReview, "status" | "method"> & Partial<Pick<VoicePaymentReview, "raw" | "suggestedMethods">>;
}
interface TestCase {
  id: number;
  category: string;
  text: string;
  required?: boolean;
  catalog?: VoiceCatalog;
  expected: {
    items: CartItem[];
    payment: Sale["payment"];
    unknown: string[];
    review?: ReviewExpectation;
  };
}

// These fixtures cannot disappear or lose their required flag behind an overall score.
const requiredSafetyIds = Array.from({ length: 27 }, (_, index) => 51 + index);

function itemsMatch(actual: CartItem[], expected: CartItem[]): boolean {
  if (actual.length !== expected.length) return false;
  const key = (item: CartItem) => JSON.stringify([item.productId, item.quantity, item.note ?? ""]);
  const sortedActual = [...actual].sort((a, b) => key(a).localeCompare(key(b)));
  const sortedExpected = [...expected].sort((a, b) => key(a).localeCompare(key(b)));

  for (let i = 0; i < sortedActual.length; i++) {
    const a = sortedActual[i];
    const e = sortedExpected[i];
    if (a.productId !== e.productId) return false;
    if (a.quantity !== e.quantity) return false;
    if ((a.note || "") !== (e.note || "")) return false;
  }
  return true;
}

function unknownsMatch(actual: string[], expected: string[]): boolean {
  if (actual.length !== expected.length) return false;
  const sortedA = actual.map(value => value.toLowerCase().trim()).sort();
  const sortedE = expected.map(value => value.toLowerCase().trim()).sort();
  return sortedA.every((value, index) => value === sortedE[index]);
}

function reviewMatches(actual: VoiceOrderResult["review"], expected?: ReviewExpectation): boolean {
  if (!expected) return true;
  if (actual.version !== 1 || actual.lines.length !== expected.lines.length) return false;
  for (const [index, line] of expected.lines.entries()) {
    const received = actual.lines[index];
    if (received.status !== line.status || received.quantity !== line.quantity) return false;
    for (const key of ["id", "raw", "productId", "note", "issue"] as const) {
      if (Object.hasOwn(line, key) && received[key] !== line[key]) return false;
    }
    if (line.candidateIds && JSON.stringify(received.candidates.map(candidate => candidate.productId)) !== JSON.stringify(line.candidateIds)) return false;
  }
  if (actual.payment.status !== expected.payment.status || actual.payment.method !== expected.payment.method) return false;
  for (const key of ["raw", "suggestedMethods"] as const) {
    if (Object.hasOwn(expected.payment, key) && JSON.stringify(actual.payment[key]) !== JSON.stringify(expected.payment[key])) return false;
  }
  return true;
}

async function runEvaluation() {
  console.log("=".repeat(78));
  console.log("    LARIS POS — INDONESIAN VOICE ORDER PARSER BENCHMARK (PRD §5 / M1)    ");
  console.log("=".repeat(78));

  const jsonlPath = resolve(__dirname, "../evals/voice.jsonl");
  const rawContent = readFileSync(jsonlPath, "utf8");
  const lines = rawContent.split("\n").map((l) => l.trim()).filter(Boolean);

  const testCases: TestCase[] = lines.map((l, idx) => {
    try {
      return JSON.parse(l);
    } catch (e) {
      throw new Error(`Failed to parse line ${idx + 1} of voice.jsonl: ${e}`);
    }
  });

  if (new Set(testCases.map(tc => tc.id)).size !== testCases.length) throw new Error("Duplicate fixture IDs are not allowed");
  for (const id of requiredSafetyIds) {
    const fixture = testCases.find(tc => tc.id === id);
    if (!fixture?.required || !fixture.expected.review) throw new Error(`Required safety fixture #${id} is missing its required flag or review expectations`);
  }
  console.log(`Loaded ${testCases.length} evaluation test cases from evals/voice.jsonl\n`);

  const categoryStats: Record<string, { total: number; passed: number }> = {};
  let totalPassed = 0;
  let itemsPassed = 0;
  let paymentPassed = 0;
  let unknownPassed = 0;
  let requiredPassed = 0;
  const requiredTotal = testCases.filter(tc => tc.required).length;

  const failures: { id: number; text: string; expected: TestCase["expected"]; actual: VoiceOrderResult | { error: string }; reason: string }[] = [];

  for (const tc of testCases) {
    if (!categoryStats[tc.category]) {
      categoryStats[tc.category] = { total: 0, passed: 0 };
    }
    categoryStats[tc.category].total++;

    let actual: VoiceOrderResult;
    try {
      const catalog = tc.catalog ?? products;
      actual = validateVoiceOrderResponse(parseVoiceOrder(tc.text, catalog), catalog);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push({ id: tc.id, text: tc.text, expected: tc.expected, actual: { error: message }, reason: "parser or response validation rejected the fixture" });
      continue;
    }
    const iOk = itemsMatch(actual.items, tc.expected.items);
    const pOk = actual.payment === tc.expected.payment;
    const uOk = unknownsMatch(actual.unknown, tc.expected.unknown);
    const rOk = reviewMatches(actual.review, tc.expected.review);

    if (iOk) itemsPassed++;
    if (pOk) paymentPassed++;
    if (uOk) unknownPassed++;

    const exactMatch = iOk && pOk && uOk && rOk;
    if (exactMatch) {
      totalPassed++;
      if (tc.required) requiredPassed++;
      categoryStats[tc.category].passed++;
    } else {
      const reasons: string[] = [];
      if (!iOk) reasons.push("items mismatch");
      if (!pOk) reasons.push(`payment mismatch (${actual.payment} vs ${tc.expected.payment})`);
      if (!uOk) reasons.push(`unknown mismatch (${JSON.stringify(actual.unknown)} vs ${JSON.stringify(tc.expected.unknown)})`);
      if (!rOk) reasons.push("review evidence mismatch");

      failures.push({
        id: tc.id,
        text: tc.text,
        expected: tc.expected,
        actual,
        reason: reasons.join(", "),
      });
    }
  }

  // Print Category Table
  console.log("┌───────────────────────────┬─────────┬─────────┬──────────────┐");
  console.log("│ Category                  │ Total   │ Passed  │ Accuracy     │");
  console.log("├───────────────────────────┼─────────┼─────────┼──────────────┤");

  for (const [cat, stat] of Object.entries(categoryStats)) {
    const acc = ((stat.passed / stat.total) * 100).toFixed(1) + "%";
    console.log(
      `│ ${cat.padEnd(25)} │ ${String(stat.total).padStart(7)} │ ${String(stat.passed).padStart(7)} │ ${acc.padStart(12)} │`
    );
  }

  console.log("├───────────────────────────┼─────────┼─────────┼──────────────┤");
  const overallAcc = ((totalPassed / testCases.length) * 100).toFixed(1) + "%";
  console.log(
    `│ ${"OVERALL (EXACT MATCH)".padEnd(25)} │ ${String(testCases.length).padStart(7)} │ ${String(totalPassed).padStart(7)} │ ${overallAcc.padStart(12)} │`
  );
  console.log("└───────────────────────────┴─────────┴─────────┴──────────────┘\n");

  console.log("Component Accuracies:");
  console.log(`  - Items extraction:   ${itemsPassed}/${testCases.length} (${((itemsPassed / testCases.length) * 100).toFixed(1)}%)`);
  console.log(`  - Payment detection:  ${paymentPassed}/${testCases.length} (${((paymentPassed / testCases.length) * 100).toFixed(1)}%)`);
  console.log(`  - Unknown rejection:  ${unknownPassed}/${testCases.length} (${((unknownPassed / testCases.length) * 100).toFixed(1)}%)\n`);

  if (failures.length > 0) {
    console.log(`Failures (${failures.length}):`);
    for (const f of failures) {
      console.log(`  [#${f.id}] "${f.text}" -> ${f.reason}`);
      console.log(`     Expected: ${JSON.stringify(f.expected)}`);
      console.log(`     Actual:   ${JSON.stringify(f.actual)}`);
    }
    console.log("");
  }

  const passRate = (totalPassed / testCases.length) * 100;
  console.log(`Required safety fixtures: ${requiredPassed}/${requiredTotal}`);
  if (passRate >= 90 && requiredPassed === requiredTotal) {
    console.log(`>>> BENCHMARK PASSED: ${passRate.toFixed(1)}%; all required safety fixtures passed <<<\n`);
    process.exit(0);
  } else {
    console.error(`>>> BENCHMARK FAILED: ${passRate.toFixed(1)}% overall; ${requiredTotal - requiredPassed} required safety failures <<<\n`);
    process.exit(1);
  }
}

runEvaluation().catch((err) => {
  console.error("Evaluation error:", err);
  process.exit(1);
});
