import type { CartItem, Product, Sale } from "./laris-data.ts";

export type VoicePaymentMethod = Sale["payment"];
export type VoiceCatalogProduct = Pick<Product, "id" | "name" | "active"> & { readonly aliases?: readonly string[] };
export type VoiceCatalog = readonly VoiceCatalogProduct[];
export type VoiceLineStatus = "exact" | "suggested" | "ambiguous" | "unknown" | "invalid";
export type VoiceIssue = "quantity" | "boundary" | "modifier" | "unavailable" | "unmatched";
export interface VoiceCandidate {
  readonly productId: string;
  readonly score: number;
  readonly method: "spelling" | "phonetic" | "ai";
}
export interface VoiceOrderLine {
  readonly id: string;
  readonly raw: string;
  readonly quantity: number | null;
  readonly note?: string;
  readonly productId?: string;
  readonly status: VoiceLineStatus;
  readonly issue?: VoiceIssue;
  readonly candidates: readonly VoiceCandidate[];
}
export interface VoicePaymentReview {
  readonly status: "explicit" | "unspecified" | "unclear" | "conflicting";
  readonly method: VoicePaymentMethod | null;
  readonly raw: readonly string[];
  readonly suggestedMethods?: readonly VoicePaymentMethod[];
}
export interface VoiceOrderReview {
  readonly version: 1;
  readonly lines: readonly VoiceOrderLine[];
  readonly payment: VoicePaymentReview;
}
export interface VoiceOrderResult {
  items: CartItem[];
  /** Compatibility only: use review.payment, never this field, to authorize insertion. */
  payment: VoicePaymentMethod;
  unknown: string[];
  review: VoiceOrderReview;
}
export interface VoiceDraftRow {
  id: string;
  productId: string | null;
  quantity: number | null;
  note: string;
  accepted: boolean;
  removed: boolean;
}
export interface VoiceOrderDraft {
  rows: VoiceDraftRow[];
  payment: VoicePaymentMethod | null;
  paymentAccepted: boolean;
}
export interface VoiceDraftProblem {
  code: "row-id" | "unresolved" | "quantity" | "unavailable" | "note" | "note-conflict" | "aggregate" | "payment" | "empty";
  rowId?: string;
  productId?: string;
  existingNote?: string;
}
export type VoiceDraftValidation = { ok: true; items: CartItem[]; payment: VoicePaymentMethod } | { ok: false; issues: VoiceDraftProblem[] };
export interface VoiceOrderProposal {
  lines: { sourceId: string; raw: string; quantity: number | null; productId: string | null; note?: string }[];
  payment: { method: VoicePaymentMethod | null; raw: string[] };
}
export const VOICE_LIMITS = Object.freeze({ text: 2000, lines: 50, quantity: 999, note: 200, candidates: 3, candidateFloor: 0.75, strongScore: 0.90, strongMargin: 0.12 });
export class VoiceOrderError extends Error {
  readonly code: "text-limit" | "line-limit" | "invalid-response" | "invalid-proposal";
  constructor(code: VoiceOrderError["code"], message: string) { super(message); this.name = "VoiceOrderError"; this.code = code; }
}

const normalize = (text: string) => text.toLowerCase().trim().replace(/\s+/g, " ");
const isQuantity = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= VOICE_LIMITS.quantity;
const isPayment = (value: unknown): value is VoicePaymentMethod => value === "Tunai" || value === "QRIS" || value === "Transfer";
const paymentTokens: Record<string, VoicePaymentMethod> = { tunai: "Tunai", cash: "Tunai", qris: "QRIS", transfer: "Transfer" };
const spokenPayment = (word: string): VoicePaymentMethod | undefined => Object.hasOwn(paymentTokens, word) ? paymentTokens[word] : undefined;
const builtins: [string, string, string[]][] = [
  ["kopi-susu", "Es Kopi Susu", ["es kopi susu gula aren", "kopi susu", "es kopsu", "kopsu"]],
  ["croissant", "Butter Croissant", ["croissant"]],
  ["matcha", "Matcha Latte", ["es matcha", "matcha"]],
  ["americano", "Americano", ["es americano", "es amer", "amer"]],
  ["pain-chocolat", "Pain au Chocolat", ["pain chocolat", "roti cokelat", "cokelat pastry"]],
  ["cinnamon", "Cinnamon Roll", ["cinnamon", "roti kayu manis"]],
  ["cappuccino", "Cappuccino", ["kapucino"]],
  ["chocolate", "Iced Chocolate", ["es cokelat", "es coklat", "chocolate", "cokelat", "coklat"]],
  ["tea", "Es Teh Melati", ["teh melati", "iced tea", "es teh manis", "teh manis", "es teh", "tea", "teh"]],
];
const noteAliases: Record<string, string> = {
  "less sugar": "less sugar", "kurang gula": "less sugar", "gula sedikit": "less sugar", "sedikit gula": "less sugar", "kurang manis": "less sugar",
  "tanpa gula": "tanpa gula", "less ice": "less ice", "sedikit es": "sedikit es", "tanpa es": "tanpa es",
};
const digits = ["", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan"];
function spellNumber(n: number): string {
  if (n < 10) return digits[n];
  if (n === 10) return "sepuluh";
  if (n === 11) return "sebelas";
  if (n < 20) return `${digits[n - 10]} belas`;
  if (n < 100) return `${digits[Math.floor(n / 10)]} puluh${n % 10 ? ` ${digits[n % 10]}` : ""}`;
  return `${n < 200 ? "seratus" : `${digits[Math.floor(n / 100)]} ratus`}${n % 100 ? ` ${spellNumber(n % 100)}` : ""}`;
}
const quantities = new Map<string, number>();
for (let n = 1; n <= 999; n++) quantities.set(spellNumber(n), n);
for (const [word, value] of Object.entries({ sepasang: 2, selusin: 12, lusin: 12, segelas: 1, secangkir: 1, seporsi: 1, sebuah: 1, sebiji: 1 })) quantities.set(word, value);
for (let n = 1; n <= 83; n++) quantities.set(`${spellNumber(n)} lusin`, n * 12);
const numberWords = new Set([...quantities.keys()].flatMap(word => word.split(" ")).concat(["nol", "kosong", "ribu", "seribu", "juta", "miliar", "setengah", "seperempat", "koma", "minus", "negatif", "belasan", "puluhan", "ratusan"]));
const quantityToken = (word: string) => numberWords.has(word) || /^[+\-−]?(?:\d|[.,]\d)/.test(word) || /^(?:nan|infinity)$/i.test(word);
function readQuantity(words: string): number | null {
  if (/^\d+$/.test(words)) { const n = Number(words); return isQuantity(n) ? n : null; }
  return quantities.get(words) ?? null;
}
function catalogIndex(catalog: VoiceCatalog) {
  const byId = new Map<string, VoiceCatalogProduct>();
  const aliases = new Map<string, Set<string>>();
  for (const product of catalog) {
    if (!product || !boundedString(product.id, 120) || !boundedString(product.name, VOICE_LIMITS.text) || byId.has(product.id) || (product.active !== undefined && typeof product.active !== "boolean") || (product.aliases !== undefined && (!Array.isArray(product.aliases) || product.aliases.some(alias => !boundedString(alias, VOICE_LIMITS.text))))) throw new VoiceOrderError("invalid-response", "Katalog menu tidak valid atau ID ganda.");
    byId.set(product.id, product);
    const builtin = builtins.find(([id, name]) => id === product.id && normalize(name) === normalize(product.name));
    for (const alias of [product.name, product.id, product.id.replace(/-/g, " "), ...(product.aliases ?? []), ...(builtin?.[2] ?? [])]) {
      const key = normalize(alias);
      if (!key) continue;
      const ids = aliases.get(key) ?? new Set<string>();
      ids.add(product.id); aliases.set(key, ids);
    }
  }
  return { byId, aliases, phrases: [...aliases.keys()].map(value => value.split(" ")).sort((a, b) => b.length - a.length) };
}
type CatalogIndex = ReturnType<typeof catalogIndex>;
function protectedTokens(tokens: string[], index: CatalogIndex): Set<number> {
  const protectedAt = new Set<number>();
  for (let i = 0; i < tokens.length; i++) {
    const phrase = index.phrases.find(parts => parts.every((part, offset) => tokens[i + offset] === part));
    if (phrase) { for (let j = i; j < i + phrase.length; j++) protectedAt.add(j); i += phrase.length - 1; }
  }
  return protectedAt;
}
function quantitySpans(tokens: string[], index: CatalogIndex) {
  const protectedAt = protectedTokens(tokens, index);
  const spans: { start: number; end: number; value: number | null }[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (protectedAt.has(i) || !quantityToken(tokens[i])) continue;
    const start = i;
    while (i + 1 < tokens.length && !protectedAt.has(i + 1) && quantityToken(tokens[i + 1])) i++;
    spans.push({ start, end: i + 1, value: readQuantity(tokens.slice(start, i + 1).join(" ")) });
  }
  return spans;
}
function stripNotes(text: string): { menu: string; note?: string } {
  let menu = text;
  const notes: string[] = [];
  for (;;) {
    const found = Object.keys(noteAliases).find(note => menu.endsWith(` ${note}`));
    if (!found) break;
    notes.unshift(noteAliases[found]); menu = menu.slice(0, -found.length).trimEnd();
  }
  return { menu, ...(notes.length ? { note: notes.join(" ") } : {}) };
}
function stripPolite(text: string, index: CatalogIndex): string {
  const normalized = normalize(text);
  const startsWithName = [...index.aliases.keys()].some(alias => normalized === alias || normalized.startsWith(`${alias} `));
  return startsWithName ? text : text.replace(/^(?:(?:tolong|saya|mau|pesan|beli)\s+)+/i, "");
}
// Decimal commas/points and signed/scientific numbers survive until quantity validation.
function clauses(text: string): string[] {
  return text.split(/(?<!\d),(?!\d)|(?<=\d),(?!\d)|(?<!\d),(?=\d)|[;\n]+|\.(?!\d)(?=\s|$)|\s+(?:dan|&|\+)\s+/i).map(value => value.trim()).filter(Boolean);
}
function paymentReview(raw: readonly string[]): VoicePaymentReview {
  if (!raw.length) return { status: "unspecified", method: "Tunai", raw: [] };
  const methods = new Set<VoicePaymentMethod>();
  let unclear = false;
  for (const fragment of raw) {
    if (/(?:\b(?:bayar|pembayaran|pakai|via|dengan|atau|dan)|[&+])\s*$/i.test(fragment)) unclear = true;
    const words = normalize(fragment).replace(/^(?:bayar|pembayaran|pakai|via|dengan)\b\s*/, "").replace(/^(?:pakai|dengan)\b\s*/, "").split(/\s+/);
    let found = false;
    for (const word of words) {
      const method = spokenPayment(word);
      if (method) { methods.add(method); found = true; }
      else if (!/^(?:dan|atau|&|\+|bayar|pembayaran|pakai|via|dengan)$/.test(word)) unclear = true;
    }
    if (!found) unclear = true;
  }
  const values = [...methods];
  if (values.length > 1) return { status: "conflicting", method: null, raw: [...raw], suggestedMethods: values };
  if (unclear) return { status: "unclear", method: null, raw: [...raw], ...(values.length ? { suggestedMethods: values } : {}) };
  return { status: "explicit", method: values[0], raw: [...raw] };
}
function extractPayment(clause: string, index: CatalogIndex): { order: string; fragments: string[] } {
  const matches = [...clause.matchAll(/\S+/g)];
  const tokens = matches.map(match => normalize(match[0]));
  const protectedAt = protectedTokens(tokens, index);
  const marker = tokens.findIndex((word, i) => !protectedAt.has(i) && /^(?:bayar|pembayaran|pakai|via|dengan)$/.test(word));
  if (marker >= 0) {
    const start = matches[marker].index!;
    const tail = clause.slice(start);
    return { order: clause.slice(0, start).trim(), fragments: tail.split(/\s+(?=(?:bayar|pembayaran|pakai|via|dengan)\b)(?!pakai\s|dengan\s)/i).filter(Boolean) };
  }
  let start = tokens.length;
  while (start > 0 && !protectedAt.has(start - 1) && spokenPayment(tokens[start - 1])) start--;
  if (start < tokens.length) return { order: clause.slice(0, matches[start].index).trim(), fragments: [clause.slice(matches[start].index)] };
  return { order: clause, fragments: [] };
}
function splitOrders(raw: string, index: CatalogIndex): { raw: string; boundary?: true }[] {
  const trimmed = stripPolite(raw, index);
  const matches = [...trimmed.matchAll(/\S+/g)];
  const spans = quantitySpans(matches.map(match => normalize(match[0])), index);
  if (!spans.length) return [{ raw }];
  if (spans[0].start !== 0) {
    const withoutNotes = stripNotes(normalize(trimmed)).menu.split(" ");
    if (spans.length === 1 && spans[0].end === withoutNotes.length) return [{ raw }];
    return [{ raw, boundary: true }];
  }
  const result: { raw: string; boundary?: true }[] = [];
  let start = 0;
  const prefixLength = raw.length - trimmed.length;
  for (const span of spans.slice(1)) {
    if (span.end === matches.length) continue;
    const offset = prefixLength + matches[span.start].index!;
    result.push({ raw: raw.slice(start, offset).trim() }); start = offset;
  }
  result.push({ raw: raw.slice(start).trim() });
  return result;
}
// Optimal-string-alignment Damerau–Levenshtein: adjacent transpositions cost one.
function distance(a: string, b: string): number {
  const rows = Array.from({ length: a.length + 1 }, () => Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) rows[i][0] = i;
  for (let j = 0; j <= b.length; j++) rows[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    rows[i][j] = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
  }
  return rows[a.length][b.length];
}
const similarity = (a: string, b: string) => 1 - distance(a, b) / Math.max(a.length, b.length, 1);
const phonetic = (word: string) => word.replace(/ph/g, "f").replace(/ck/g, "k").replace(/c(?=[aou])/g, "k").replace(/q/g, "k").replace(/v/g, "f").replace(/oi/g, "o").replace(/(.)\1+/g, "$1").replace(/nt$/, "n");
function candidatesFor(menu: string, index: CatalogIndex): VoiceCandidate[] {
  const candidates = new Map<string, VoiceCandidate>();
  const words = menu.split(" ");
  for (const [alias, ids] of index.aliases) {
    const target = alias.split(" ");
    if (target.length !== words.length || words.some((word, i) => (Math.min(word.length, target[i].length) <= 3 || /\d/.test(word + target[i])) && word !== target[i])) continue;
    // No ignored/reordered tokens, and no unrelated long token hidden by a long phrase.
    if (words.some((word, i) => similarity(word, target[i]) < 0.6)) continue;
    const spelling = similarity(menu, alias);
    const sound = similarity(words.map(phonetic).join(" "), target.map(phonetic).join(" "));
    const score = Math.max(spelling, spelling >= 0.75 && sound === 1 ? 0.94 : 0);
    if (score < VOICE_LIMITS.candidateFloor) continue;
    for (const id of ids) {
      if (index.byId.get(id)?.active === false) continue;
      const candidate: VoiceCandidate = { productId: id, score: Math.round(score * 10000) / 10000, method: score > spelling ? "phonetic" : "spelling" };
      if ((candidates.get(id)?.score ?? 0) < candidate.score) candidates.set(id, candidate);
    }
  }
  return [...candidates.values()].sort((a, b) => b.score - a.score || a.productId.localeCompare(b.productId)).slice(0, VOICE_LIMITS.candidates);
}
function candidateStatus(candidates: readonly VoiceCandidate[]): "suggested" | "ambiguous" {
  return candidates[0]?.score >= VOICE_LIMITS.strongScore && candidates[0].score - (candidates[1]?.score ?? 0) >= VOICE_LIMITS.strongMargin ? "suggested" : "ambiguous";
}
function parseLine(raw: string, id: string, index: CatalogIndex, boundary = false): VoiceOrderLine {
  const base = { id, raw, candidates: [] as VoiceCandidate[] };
  if (boundary) return { ...base, quantity: null, status: "invalid", issue: "boundary" };
  let menu = normalize(stripPolite(raw, index));
  let note: string | undefined;
  const tokens = menu.split(" ");
  const spans = quantitySpans(tokens, index);
  let quantity: number | null = 1;
  if (spans.some(span => span.value === null)) return { ...base, quantity: null, status: "invalid", issue: "quantity" };
  if (spans.length > 1) return { ...base, quantity: null, status: "invalid", issue: "boundary" };
  if (spans.length) {
    const span = spans[0]; quantity = span.value;
    if (span.start === 0) {
      menu = tokens.slice(span.end).join(" ");
      if (!index.aliases.has(menu)) menu = menu.replace(/^(?:gelas|cup|pcs|buah|porsi|piring|cangkir|biji)\s+/, "");
    } else if (span.end === tokens.length) menu = tokens.slice(0, span.start).join(" ");
    else if (span.end === stripNotes(menu).menu.split(" ").length) {
      note = stripNotes(menu).note;
      menu = tokens.slice(0, span.start).join(" ");
    } else return { ...base, quantity: null, status: "invalid", issue: "boundary" };
  }
  if (!index.aliases.has(menu)) {
    const stripped = stripNotes(menu); menu = stripped.menu;
    if (stripped.note) note = [stripped.note, note].filter(Boolean).join(" ");
  }
  if (note && note.length > VOICE_LIMITS.note) return { ...base, quantity, status: "invalid", issue: "modifier" };
  const common = { ...base, quantity, ...(note ? { note } : {}) };
  const exact = index.aliases.get(menu);
  if (exact) {
    const active = [...exact].filter(id => index.byId.get(id)?.active !== false);
    if (!active.length) return { ...common, status: "unknown", issue: "unavailable" };
    if (exact.size === 1) return { ...common, status: "exact", productId: active[0] };
    return { ...common, status: "ambiguous", candidates: active.slice(0, 3).map(productId => ({ productId, score: 1, method: "spelling" as const })) };
  }
  if ([...index.aliases.keys()].some(alias => menu.startsWith(`${alias} `) || menu.endsWith(` ${alias}`))) return { ...common, status: "unknown", issue: "modifier" };
  const candidates = candidatesFor(menu, index);
  return { ...common, status: candidates.length ? candidateStatus(candidates) : "unknown", ...(candidates.length ? {} : { issue: "unmatched" as const }), candidates };
}
function freezeReview(review: VoiceOrderReview): VoiceOrderReview {
  const lines = review.lines.map(line => Object.freeze({ ...line, candidates: Object.freeze(line.candidates.map(candidate => Object.freeze({ ...candidate }))) }));
  const payment = Object.freeze({ ...review.payment, raw: Object.freeze([...review.payment.raw]), ...(review.payment.suggestedMethods ? { suggestedMethods: Object.freeze([...review.payment.suggestedMethods]) } : {}) });
  return Object.freeze({ version: 1, lines: Object.freeze(lines), payment });
}
/** Projects exact occurrences only. Unknowns retain multiplicity and payment blockers. */
export function projectVoiceOrder(review: VoiceOrderReview): VoiceOrderResult {
  const immutable = freezeReview(review);
  const items: CartItem[] = [];
  const unknown: string[] = [];
  for (const line of immutable.lines) {
    if (line.status === "exact" && line.productId && isQuantity(line.quantity)) items.push({ productId: line.productId, quantity: line.quantity, ...(line.note ? { note: line.note } : {}) });
    else unknown.push(line.raw);
  }
  if (immutable.payment.status === "unclear" || immutable.payment.status === "conflicting") unknown.push(...(immutable.payment.raw.length ? immutable.payment.raw : ["Pembayaran belum dikonfirmasi"]));
  return { items, payment: immutable.payment.method ?? "Tunai", unknown, review: immutable };
}
/** Pass the complete workspace catalogue, including inactive entries. Never truncates. */
export function parseVoiceOrder(text: string, catalog: VoiceCatalog): VoiceOrderResult {
  if (text.length > VOICE_LIMITS.text) throw new VoiceOrderError("text-limit", "Pesanan maksimal 2.000 karakter.");
  const index = catalogIndex(catalog);
  const lines: VoiceOrderLine[] = [];
  const fragments: string[] = [];
  for (const clause of clauses(text)) {
    const extracted = extractPayment(clause, index);
    fragments.push(...extracted.fragments);
    if (!extracted.order) continue;
    for (const part of splitOrders(extracted.order, index)) {
      lines.push(parseLine(part.raw, `line-${lines.length + 1}`, index, part.boundary));
      if (lines.length > VOICE_LIMITS.lines) throw new VoiceOrderError("line-limit", "Pesanan maksimal 50 baris.");
    }
  }
  if (fragments.length > VOICE_LIMITS.lines) throw new VoiceOrderError("line-limit", "Bukti pembayaran maksimal 50 frasa.");
  return projectVoiceOrder({ version: 1, lines, payment: paymentReview(fragments) });
}

function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function boundedString(value: unknown, max: number, empty = false): value is string { return typeof value === "string" && value.length <= max && (empty || !!value.trim()); }
function fail(message = "Hasil pesanan tidak valid. Periksa kembali pesanan."): never { throw new VoiceOrderError("invalid-response", message); }
function stringArray(value: unknown, max: number): value is string[] { return Array.isArray(value) && value.length <= max && value.every(item => boundedString(item, VOICE_LIMITS.text)); }
function activeId(value: unknown, index: CatalogIndex): value is string { return typeof value === "string" && index.byId.has(value) && index.byId.get(value)?.active !== false; }
function validateReview(value: unknown, catalog: VoiceCatalog): VoiceOrderReview {
  const index = catalogIndex(catalog);
  if (!object(value) || value.version !== 1 || !Array.isArray(value.lines) || value.lines.length > VOICE_LIMITS.lines || !object(value.payment)) fail();
  const ids = new Set<string>();
  const lines: VoiceOrderLine[] = value.lines.map((line: unknown) => {
    if (!object(line) || !boundedString(line.id, 120) || ids.has(line.id) || !boundedString(line.raw, VOICE_LIMITS.text)) fail();
    ids.add(line.id);
    if (line.quantity !== null && !isQuantity(line.quantity)) fail();
    if (line.note !== undefined && !boundedString(line.note, VOICE_LIMITS.note, true)) fail();
    if (typeof line.status !== "string" || !["exact", "suggested", "ambiguous", "unknown", "invalid"].includes(line.status)) fail();
    if (line.issue !== undefined && (typeof line.issue !== "string" || !["quantity", "boundary", "modifier", "unavailable", "unmatched"].includes(line.issue))) fail();
    if (!Array.isArray(line.candidates) || line.candidates.length > VOICE_LIMITS.candidates) fail();
    const candidateIds = new Set<string>();
    const candidates: VoiceCandidate[] = line.candidates.map((candidate: unknown) => {
      if (!object(candidate) || !activeId(candidate.productId, index) || candidateIds.has(candidate.productId) || typeof candidate.score !== "number" || !Number.isFinite(candidate.score) || candidate.score < VOICE_LIMITS.candidateFloor || candidate.score > 1 || typeof candidate.method !== "string" || !["spelling", "phonetic", "ai"].includes(candidate.method)) fail();
      candidateIds.add(candidate.productId);
      return { productId: candidate.productId, score: candidate.score, method: candidate.method as VoiceCandidate["method"] };
    });
    if (candidates.some((candidate, i) => i > 0 && candidate.score > candidates[i - 1].score)) fail();
    if (line.status === "exact") {
      if (!activeId(line.productId, index) || !isQuantity(line.quantity) || line.issue !== undefined || candidates.length) fail();
    } else if (line.productId !== undefined) fail();
    if ((line.status === "suggested" || line.status === "ambiguous") && !candidates.length) fail();
    if (line.status === "suggested" && candidateStatus(candidates) !== "suggested") fail();
    if ((line.status === "unknown" || line.status === "invalid") && candidates.length) fail();
    if (line.status === "invalid" && line.issue === undefined) fail();
    return { id: line.id, raw: line.raw, quantity: line.quantity as number | null, status: line.status as VoiceLineStatus, candidates, ...(line.note !== undefined ? { note: line.note as string } : {}), ...(line.productId !== undefined ? { productId: line.productId as string } : {}), ...(line.issue !== undefined ? { issue: line.issue as VoiceIssue } : {}) };
  });
  const payment = value.payment;
  if (typeof payment.status !== "string" || !["explicit", "unspecified", "unclear", "conflicting"].includes(payment.status) || !stringArray(payment.raw, VOICE_LIMITS.lines)) fail();
  if (payment.method !== null && !isPayment(payment.method)) fail();
  if (payment.suggestedMethods !== undefined && (!Array.isArray(payment.suggestedMethods) || payment.suggestedMethods.length > 3 || payment.suggestedMethods.some(method => !isPayment(method)) || new Set(payment.suggestedMethods).size !== payment.suggestedMethods.length)) fail();
  if (payment.status === "unspecified" && (payment.method !== "Tunai" || payment.raw.length || payment.suggestedMethods !== undefined)) fail();
  if (payment.status === "explicit") {
    const evidence = paymentReview(payment.raw);
    if (evidence.status !== "explicit" || evidence.method !== payment.method || payment.suggestedMethods !== undefined) fail();
  }
  if ((payment.status === "unclear" || payment.status === "conflicting") && payment.method !== null) fail();
  if (payment.status === "conflicting" && paymentReview(payment.raw).status !== "conflicting") fail();
  if (lines.reduce((sum, line) => sum + line.raw.length, 0) + payment.raw.reduce((sum, raw) => sum + raw.length, 0) > VOICE_LIMITS.text) fail();
  return freezeReview({ version: 1, lines, payment: { status: payment.status as VoicePaymentReview["status"], method: payment.method as VoicePaymentMethod | null, raw: payment.raw, ...(payment.suggestedMethods !== undefined ? { suggestedMethods: payment.suggestedMethods as VoicePaymentMethod[] } : {}) } });
}
function validateItems(value: unknown, index: CatalogIndex): CartItem[] {
  if (!Array.isArray(value) || value.length > VOICE_LIMITS.lines) fail();
  return value.map((item: unknown) => {
    if (!object(item) || !activeId(item.productId, index) || !isQuantity(item.quantity) || (item.note !== undefined && !boundedString(item.note, VOICE_LIMITS.note, true))) fail();
    return { productId: item.productId, quantity: item.quantity, ...(item.note ? { note: item.note as string } : {}) };
  });
}
/** Validates network input; legacy carts are downgraded to explicit-review suggestions. */
export function validateVoiceOrderResponse(value: unknown, catalog: VoiceCatalog): VoiceOrderResult {
  const index = catalogIndex(catalog);
  if (!object(value) || !isPayment(value.payment) || !stringArray(value.unknown, VOICE_LIMITS.lines * 2)) fail();
  const items = validateItems(value.items, index);
  if (value.review !== undefined) {
    const result = projectVoiceOrder(validateReview(value.review, catalog));
    if (JSON.stringify(items) !== JSON.stringify(result.items) || value.payment !== result.payment || JSON.stringify(value.unknown) !== JSON.stringify(result.unknown)) fail();
    return result;
  }
  if (items.length + value.unknown.length > VOICE_LIMITS.lines) fail();
  const lines: VoiceOrderLine[] = items.map((item, i) => ({ id: `legacy-${i + 1}`, raw: `${item.quantity} ${index.byId.get(item.productId)!.name}`, quantity: item.quantity, ...(item.note ? { note: item.note } : {}), status: "suggested", candidates: [{ productId: item.productId, score: 1, method: "ai" }] }));
  for (const raw of value.unknown) lines.push({ id: `legacy-${lines.length + 1}`, raw, quantity: null, status: "unknown", issue: "unmatched", candidates: [] });
  return projectVoiceOrder(validateReview({ version: 1, lines, payment: { status: "unclear", method: null, raw: [`Pembayaran respons lama: ${value.payment}`], suggestedMethods: [value.payment] } }, catalog));
}
/** Immutable evidence is separate from mutable UI fields; keep removed rows with removed=true. */
export function createVoiceOrderDraft(review: VoiceOrderReview, catalog: VoiceCatalog): VoiceOrderDraft {
  const valid = validateReview(review, catalog);
  return {
    rows: valid.lines.map(line => ({ id: line.id, productId: line.productId ?? (line.status === "suggested" ? line.candidates[0].productId : null), quantity: line.quantity, note: line.note ?? "", accepted: line.status === "exact", removed: false })),
    payment: valid.payment.method, paymentAccepted: valid.payment.status === "explicit" || valid.payment.status === "unspecified",
  };
}
function aggregate(items: readonly CartItem[], index: CatalogIndex): { items: CartItem[]; issues: VoiceDraftProblem[] } {
  const merged = new Map<string, CartItem>();
  const issues: VoiceDraftProblem[] = [];
  for (const item of items) {
    if (!activeId(item.productId, index)) { issues.push({ code: "unavailable", productId: item.productId }); continue; }
    if (!isQuantity(item.quantity)) { issues.push({ code: "quantity", productId: item.productId }); continue; }
    if (item.note !== undefined && !boundedString(item.note, VOICE_LIMITS.note, true)) { issues.push({ code: "note", productId: item.productId }); continue; }
    const note = item.note?.trim() ?? "";
    const previous = merged.get(item.productId);
    if (previous && (previous.note ?? "") !== note) { issues.push({ code: "note-conflict", productId: item.productId, existingNote: previous.note ?? "" }); continue; }
    const quantity = (previous?.quantity ?? 0) + item.quantity;
    if (!isQuantity(quantity)) { issues.push({ code: "aggregate", productId: item.productId }); continue; }
    merged.set(item.productId, { ...item, quantity, ...(note ? { note } : { note: undefined }) });
  }
  return { items: [...merged.values()].map(item => { const copy = { ...item }; if (!copy.note) delete copy.note; return copy; }), issues };
}
/** Rechecks every retained row against the current catalogue, not the parsing-time catalogue. */
export function validateVoiceOrderDraft(review: VoiceOrderReview, draft: VoiceOrderDraft, catalog: VoiceCatalog): VoiceDraftValidation {
  const index = catalogIndex(catalog);
  const issues: VoiceDraftProblem[] = [];
  const evidenceIds = new Set(review.lines.map(line => line.id));
  if (review.version !== 1 || evidenceIds.size !== review.lines.length || review.lines.length > VOICE_LIMITS.lines || !Array.isArray(draft.rows) || draft.rows.length !== review.lines.length) return { ok: false, issues: [{ code: "row-id" }] };
  const seen = new Set<string>();
  const items: CartItem[] = [];
  for (const row of draft.rows) {
    if (!row || !evidenceIds.has(row.id) || seen.has(row.id)) { issues.push({ code: "row-id", rowId: row?.id }); continue; }
    seen.add(row.id);
    if (typeof row.removed !== "boolean" || typeof row.accepted !== "boolean") { issues.push({ code: "unresolved", rowId: row.id }); continue; }
    if (row.removed) continue;
    if (!row.accepted) issues.push({ code: "unresolved", rowId: row.id });
    if (!activeId(row.productId, index)) issues.push({ code: "unavailable", rowId: row.id });
    if (!isQuantity(row.quantity)) issues.push({ code: "quantity", rowId: row.id });
    if (!boundedString(row.note, VOICE_LIMITS.note, true)) issues.push({ code: "note", rowId: row.id });
    if (activeId(row.productId, index) && isQuantity(row.quantity) && boundedString(row.note, VOICE_LIMITS.note, true)) items.push({ productId: row.productId, quantity: row.quantity, ...(row.note.trim() ? { note: row.note.trim() } : {}) });
  }
  if (seen.size !== evidenceIds.size) issues.push({ code: "row-id" });
  if (draft.paymentAccepted !== true || !isPayment(draft.payment)) issues.push({ code: "payment" });
  if (!items.length) issues.push({ code: "empty" });
  const combined = aggregate(items, index); issues.push(...combined.issues);
  return issues.length ? { ok: false, issues } : { ok: true, items: combined.items, payment: draft.payment! };
}
/** Pure atomic merge; failure returns no cart. UI owns the synchronous one-shot consumption guard. */
export function mergeVoiceOrderDraft(review: VoiceOrderReview, draft: VoiceOrderDraft, existingCart: readonly CartItem[], catalog: VoiceCatalog): VoiceDraftValidation {
  const result = validateVoiceOrderDraft(review, draft, catalog);
  if (!result.ok) return result;
  const merged = aggregate([...existingCart, ...result.items], catalogIndex(catalog));
  return merged.issues.length ? { ok: false, issues: merged.issues } : { ok: true, items: merged.items, payment: result.payment };
}

/** Validated source-ID overlay, never a union of model and deterministic carts. */
export function applyVoiceOrderProposal(source: VoiceOrderReview | null, value: unknown, catalog: VoiceCatalog): VoiceOrderResult {
  try {
    const index = catalogIndex(catalog);
    const original = source ? validateReview(source, catalog) : null;
    if (!object(value) || !Array.isArray(value.lines) || value.lines.length > VOICE_LIMITS.lines || !object(value.payment) || !stringArray(value.payment.raw, VOICE_LIMITS.lines) || (value.payment.method !== null && !isPayment(value.payment.method))) fail();
    const refs = new Set<string>();
    const proposals: VoiceOrderProposal["lines"] = value.lines.map((line: unknown) => {
      if (!object(line) || !boundedString(line.sourceId, 120) || refs.has(line.sourceId) || !boundedString(line.raw, VOICE_LIMITS.text) || (line.quantity !== null && !isQuantity(line.quantity)) || (line.productId !== null && !activeId(line.productId, index)) || (line.note !== undefined && !boundedString(line.note, VOICE_LIMITS.note, true))) fail();
      refs.add(line.sourceId);
      return { sourceId: line.sourceId, raw: line.raw, quantity: line.quantity as number | null, productId: line.productId as string | null, ...(line.note !== undefined ? { note: line.note as string } : {}) };
    });
    let lines: VoiceOrderLine[];
    let payment: VoicePaymentReview;
    const proposedMethod = value.payment.method as VoicePaymentMethod | null;
    if (original) {
      if (proposals.length !== original.lines.length || original.lines.some(line => !refs.has(line.id)) || JSON.stringify(value.payment.raw) !== JSON.stringify(original.payment.raw)) fail();
      lines = original.lines.map(line => {
        const proposal = proposals.find(proposal => proposal.sourceId === line.id)!;
        if (proposal.raw !== line.raw) fail();
        if (line.issue === "unavailable" || line.status === "invalid") return line;
        const quantityConflict = proposal.quantity !== line.quantity;
        const noteConflict = (proposal.note ?? "") !== (line.note ?? "");
        const productConflict = proposal.productId !== null && proposal.productId !== line.productId;
        if (line.status === "exact" && !quantityConflict && !noteConflict && !productConflict) return line;
        const candidates = new Map<string, VoiceCandidate>();
        if (line.productId) candidates.set(line.productId, { productId: line.productId, score: 1, method: "spelling" });
        for (const candidate of line.candidates) candidates.set(candidate.productId, { ...candidate });
        if (proposal.productId && !candidates.has(proposal.productId)) candidates.set(proposal.productId, { productId: proposal.productId, score: 1, method: "ai" });
        const choices = [...candidates.values()].sort((a, b) => b.score - a.score || a.productId.localeCompare(b.productId)).slice(0, 3);
        const { productId: _productId, ...evidence } = line;
        void _productId;
        return { ...evidence, status: choices.length ? candidateStatus(choices) : "unknown", candidates: choices, ...(quantityConflict ? { issue: "quantity" as const } : noteConflict ? { issue: "modifier" as const } : {}) };
      });
      payment = original.payment;
      if (payment.status === "unclear" || payment.status === "conflicting") payment = { ...payment, ...(proposedMethod ? { suggestedMethods: [...new Set([...(payment.suggestedMethods ?? []), proposedMethod])] } : {}) };
      else if (payment.status === "explicit" && proposedMethod && proposedMethod !== payment.method) payment = { status: "unclear", method: null, raw: payment.raw, suggestedMethods: [payment.method!, proposedMethod] };
    } else {
      if (!proposals.length) fail();
      lines = proposals.map(line => ({ id: line.sourceId, raw: line.raw, quantity: line.quantity, ...(line.note ? { note: line.note } : {}), status: line.productId ? "suggested" : "unknown", candidates: line.productId ? [{ productId: line.productId, score: 1, method: "ai" }] : [], ...(line.productId ? {} : { issue: "unmatched" as const }) }));
      payment = { status: "unclear", method: null, raw: value.payment.raw, ...(proposedMethod ? { suggestedMethods: [proposedMethod] } : {}) };
    }
    return projectVoiceOrder(validateReview({ version: 1, lines, payment }, catalog));
  } catch (error) {
    throw new VoiceOrderError("invalid-proposal", error instanceof Error ? error.message : "Usulan AI tidak valid.");
  }
}

/** Natural text may be segmented by the model, but every source word must survive review. */
export function interpretVoiceOrder(text: string | null, value: unknown, catalog: VoiceCatalog): VoiceOrderResult {
  const proposed = applyVoiceOrderProposal(null, value, catalog);
  if (text === null) return proposed; // Audio proposals always need explicit acceptance.
  if (text.length > VOICE_LIMITS.text) throw new VoiceOrderError("text-limit", "Pesanan maksimal 2.000 karakter.");
  const source = normalize(text);
  const occupied = new Set<number>();
  const fragments = [...proposed.review.lines.map(line => line.raw), ...proposed.review.payment.raw];
  for (const fragment of fragments) {
    const raw = normalize(fragment);
    let start = source.indexOf(raw);
    while (start >= 0 && [...Array(raw.length).keys()].some(offset => occupied.has(start + offset))) start = source.indexOf(raw, start + 1);
    if (start < 0) throw new VoiceOrderError("invalid-proposal", "Usulan AI mengubah ucapan asli.");
    for (let i = start; i < start + raw.length; i++) occupied.add(i);
  }
  const remainder = [...source].map((char, i) => occupied.has(i) ? " " : char).join("");
  // Connectors may fall between source fragments. Menu words, modifiers and numbers may not disappear.
  if (remainder.replace(/\b(?:dan|sama|lalu|kemudian)\b/g, "").replace(/[\s,;.?!&+]/g, "")) throw new VoiceOrderError("invalid-proposal", "Ada bagian pesanan yang belum ditinjau.");
  const index = catalogIndex(catalog);
  const lines = proposed.review.lines.map(line => {
    const normalized = normalize(line.raw);
    // A connector can belong to either adjacent source fragment. Strip only one
    // for parsing, never a catalogue-name token or the evidence shown for review.
    const fragment = protectedTokens(normalized.split(" "), index).has(0) ? line.raw : normalized.replace(/^(?:dan|sama|lalu|kemudian|&|\+)\s+/, "");
    const whole = parseLine(fragment, line.id, index);
    // Exact catalogue phrases can themselves contain connectors. All other
    // fragments still pass through the multi-order and payment boundary checks.
    const catalogPhrase = whole.status === "exact" || whole.issue === "unavailable" || (whole.status === "ambiguous" && whole.candidates.every(candidate => candidate.score === 1));
    const local = catalogPhrase ? { lines: [whole], payment: { raw: [] } } : parseVoiceOrder(fragment, catalog).review;
    if (local.lines.length !== 1 || local.payment.raw.length) throw new VoiceOrderError("invalid-proposal", "Batas baris pesanan AI belum jelas.");
    const evidence = { ...local.lines[0], raw: line.raw };
    if (evidence.status === "invalid" || evidence.issue === "unavailable") return { ...evidence, id: line.id };
    if (evidence.quantity !== line.quantity) return { ...line, quantity: evidence.quantity, issue: "quantity" as const };
    if (evidence.status === "exact" && evidence.productId === line.candidates[0]?.productId && (evidence.note ?? "") === (line.note ?? "")) return { ...evidence, id: line.id };
    // A known collision is never reduced to a single AI guess.
    if (evidence.status === "ambiguous" && evidence.candidates.length > 1) return { ...evidence, id: line.id, ...(line.note ? { note: line.note } : {}) };
    return line;
  });
  const payment = paymentReview(proposed.review.payment.raw);
  return projectVoiceOrder(validateReview({ version: 1, lines, payment }, catalog));
}

/** One explicit review action accepts single suggestions; unknown/ambiguous rows stay blocked. */
export function acceptVoiceSuggestions(review: VoiceOrderReview, draft: VoiceOrderDraft): VoiceOrderDraft {
  const evidence = paymentReview(review.payment.raw);
  const method = evidence.status === "explicit" && review.payment.suggestedMethods?.includes(evidence.method!) ? evidence.method : null;
  return {
    ...draft,
    rows: draft.rows.map(row => {
      const line = review.lines.find(line => line.id === row.id);
      return !row.removed && !row.accepted && line?.status === "suggested" && !line.issue && line.candidates.length === 1 && row.productId === line.candidates[0].productId && isQuantity(row.quantity)
        ? { ...row, accepted: true } : row;
    }),
    ...(method && !draft.paymentAccepted ? { payment: method, paymentAccepted: true } : {}),
  };
}
