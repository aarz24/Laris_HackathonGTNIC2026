/**
 * Indonesian Voice-to-Cart Order Parsing Benchmark
 * PRD Requirement: 50 realistic Indonesian ordering utterances (slang, numbers, edge cases).
 * Target: 90%+ parsing accuracy.
 *
 * Run:
 *   npm run eval:voice
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseOrder, type CartItem, type Sale } from "../src/lib/laris-data.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface TestCase {
  id: number;
  category: string;
  text: string;
  expected: {
    items: CartItem[];
    payment: Sale["payment"];
    unknown: string[];
  };
}

function itemsMatch(actual: CartItem[], expected: CartItem[]): boolean {
  if (actual.length !== expected.length) return false;
  const sortedActual = [...actual].sort((a, b) => a.productId.localeCompare(b.productId));
  const sortedExpected = [...expected].sort((a, b) => a.productId.localeCompare(b.productId));

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
  const setA = new Set(actual.map((s) => s.toLowerCase().trim()));
  const setE = new Set(expected.map((s) => s.toLowerCase().trim()));
  for (const item of setE) {
    if (!setA.has(item)) return false;
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

  console.log(`Loaded ${testCases.length} evaluation test cases from evals/voice.jsonl\n`);

  const categoryStats: Record<string, { total: number; passed: number }> = {};
  let totalPassed = 0;
  let itemsPassed = 0;
  let paymentPassed = 0;
  let unknownPassed = 0;

  const failures: { id: number; text: string; expected: TestCase["expected"]; actual: ReturnType<typeof parseOrder>; reason: string }[] = [];

  for (const tc of testCases) {
    if (!categoryStats[tc.category]) {
      categoryStats[tc.category] = { total: 0, passed: 0 };
    }
    categoryStats[tc.category].total++;

    const actual = parseOrder(tc.text);
    const iOk = itemsMatch(actual.items, tc.expected.items);
    const pOk = actual.payment === tc.expected.payment;
    const uOk = unknownsMatch(actual.unknown, tc.expected.unknown);

    if (iOk) itemsPassed++;
    if (pOk) paymentPassed++;
    if (uOk) unknownPassed++;

    const exactMatch = iOk && pOk && uOk;
    if (exactMatch) {
      totalPassed++;
      categoryStats[tc.category].passed++;
    } else {
      const reasons: string[] = [];
      if (!iOk) reasons.push("items mismatch");
      if (!pOk) reasons.push(`payment mismatch (${actual.payment} vs ${tc.expected.payment})`);
      if (!uOk) reasons.push(`unknown mismatch (${JSON.stringify(actual.unknown)} vs ${JSON.stringify(tc.expected.unknown)})`);

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
  if (passRate >= 90) {
    console.log(`>>> BENCHMARK PASSED: ${passRate.toFixed(1)}% >= 90.0% PRD target <<<\n`);
    process.exit(0);
  } else {
    console.error(`>>> BENCHMARK FAILED: ${passRate.toFixed(1)}% < 90.0% PRD target <<<\n`);
    process.exit(1);
  }
}

runEvaluation().catch((err) => {
  console.error("Evaluation error:", err);
  process.exit(1);
});
