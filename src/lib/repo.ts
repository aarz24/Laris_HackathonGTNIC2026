import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { jakartaToday } from "@/lib/env";
import { inventory, products, type BusinessState, type Customer, type Expense, type Purchase, type Sale, type StockMovement } from "@/lib/laris-data";

// Maps Postgres rows onto the existing BusinessState "snapshot contract" so the UI keeps working unchanged.
// The UI catalog is still the static Kopi Senja menu; rows referencing unknown codes are skipped rather than crashing it.

export type Role = "owner" | "manager" | "kasir" | "dapur";
export interface Membership { businessId: string; role: Role }
export interface Snapshot { state: BusinessState; businessId: string; role: Role; today: string }

const productCodes = new Set(products.map((p) => p.id));
const inventoryByCode = new Map(inventory.map((i) => [i.id, i]));
const PAGE = 1000;

/** ISO timestamp rendered in Asia/Jakarta (+07:00) so `createdAt.slice(0, 10)` is the local business day. */
export function toJakartaIso(value: string | null | undefined): string {
  const ms = value ? Date.parse(value) : NaN;
  if (Number.isNaN(ms)) return "";
  return `${new Date(ms + 7 * 3600_000).toISOString().slice(0, 19)}+07:00`;
}

const paymentLabel = { tunai: "Tunai", qris: "QRIS", transfer: "Transfer" } as const;

type OrderRow = {
  id: string; created_at: string; customer_name: string; channel: string; subtotal: number; discount: number; tax: number; total: number; cash_received: number;
  order_item: { product_code: string; quantity: number; note: string | null }[];
  payment: { method: keyof typeof paymentLabel }[];
};
export const ORDER_SELECT = "id, created_at, customer_name, channel, subtotal, discount, tax, total, cash_received, order_item(product_code, quantity, note), payment(method)";

export function mapSale(row: OrderRow): Sale {
  return {
    id: row.id,
    items: row.order_item.filter((i) => productCodes.has(i.product_code)).map((i) => ({ productId: i.product_code, quantity: i.quantity, ...(i.note ? { note: i.note } : {}) })),
    subtotal: Number(row.subtotal), discount: Number(row.discount), tax: Number(row.tax), total: Number(row.total), cashReceived: Number(row.cash_received),
    payment: paymentLabel[row.payment[0]?.method ?? "tunai"] ?? "Tunai",
    customerName: row.customer_name,
    channel: row.channel === "kasir" ? "Kasir" : "Etalase",
    createdAt: toJakartaIso(row.created_at),
    status: "Lunas",
  };
}

type CustomerRow = { id: string; name: string; phone: string; visits: number; total_spent: number; last_visit_at: string | null; created_at: string; rfm_segment: Customer["segment"]; points_balance: number };
export const CUSTOMER_SELECT = "id, name, phone, visits, total_spent, last_visit_at, created_at, rfm_segment, points_balance";
export function mapCustomer(row: CustomerRow): Customer {
  return {
    id: row.id, name: row.name, phone: row.phone, visits: row.visits, totalSpent: Number(row.total_spent),
    lastVisit: toJakartaIso(row.last_visit_at ?? row.created_at), segment: row.rfm_segment, points: row.points_balance,
  };
}

type ExpenseRow = { id: string; description: string; category: string; amount: number; spent_at: string };
export const EXPENSE_SELECT = "id, description, category, amount, spent_at";
export function mapExpense(row: ExpenseRow): Expense {
  return { id: row.id, description: row.description, category: row.category, amount: Number(row.amount), createdAt: toJakartaIso(row.spent_at) };
}

type MovementRow = { id: string; type: string; qty_delta: number | string; ref_id: string | null; created_at: string; inventory_item: { code: string } | null };
export const MOVEMENT_SELECT = "id, type, qty_delta, ref_id, created_at, inventory_item(code)";
export function mapMovement(row: MovementRow): StockMovement | null {
  const code = row.inventory_item?.code;
  if (!code || !inventoryByCode.has(code)) return null;
  const type = row.type === "sale" || row.type === "purchase" ? row.type : "adjustment";
  return { id: row.id, itemId: code, quantity: Number(row.qty_delta), type, reference: row.ref_id ?? "", createdAt: toJakartaIso(row.created_at) };
}

/** Load every page of a query (PostgREST caps responses at 1000 rows). */
async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

export async function currentMembership(supabase: SupabaseClient): Promise<Membership | null> {
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return null;
  const { data, error } = await supabase.from("membership").select("business_id, role, created_at").eq("user_id", userId).order("created_at").limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? { businessId: data.business_id as string, role: data.role as Role } : null;
}

export async function loadSnapshot(supabase: SupabaseClient): Promise<Snapshot | null> {
  const membership = await currentMembership(supabase);
  if (!membership) return null;
  const id = membership.businessId;

  const [business, outlet, sales, movements, customers, expenses, purchases] = await Promise.all([
    supabase.from("business").select("name, owner_name, day_target").eq("id", id).single(),
    supabase.from("outlet").select("name").eq("business_id", id).is("deleted_at", null).order("created_at").limit(1).maybeSingle(),
    fetchAll<OrderRow>((from, to) => supabase.from("sales_order").select(ORDER_SELECT).eq("business_id", id).eq("status", "paid").order("created_at").order("id").range(from, to).returns<OrderRow[]>()),
    fetchAll<MovementRow & { qty_delta: number }>((from, to) => supabase.from("stock_movement").select(MOVEMENT_SELECT).eq("business_id", id).order("created_at").order("id").range(from, to).returns<(MovementRow & { qty_delta: number })[]>()),
    fetchAll<CustomerRow>((from, to) => supabase.from("customer").select(CUSTOMER_SELECT).eq("business_id", id).is("deleted_at", null).order("created_at").order("id").range(from, to).returns<CustomerRow[]>()),
    fetchAll<ExpenseRow>((from, to) => supabase.from("expense").select(EXPENSE_SELECT).eq("business_id", id).order("spent_at").order("id").range(from, to).returns<ExpenseRow[]>()),
    fetchAll<PurchaseRow>((from, to) => supabase.from("purchase_line").select(PURCHASE_SELECT).eq("business_id", id).order("id").range(from, to).returns<PurchaseRow[]>()),
  ]);
  if (business.error) throw new Error(business.error.message);

  // The UI computes stock as static openingStock + movements. Fold DB "opening"/"opname" rows into
  // one synthetic adjustment per item so the result equals SUM(qty_delta) in Postgres.
  const openingDelta = new Map<string, number>();
  const stockMovements: StockMovement[] = [];
  for (const row of movements) {
    if (row.type === "opening") {
      const code = row.inventory_item?.code;
      if (code && inventoryByCode.has(code)) openingDelta.set(code, (openingDelta.get(code) ?? 0) + Number(row.qty_delta));
      continue;
    }
    const mapped = mapMovement(row);
    if (mapped) stockMovements.push(mapped);
  }
  const adjustments: StockMovement[] = [];
  for (const item of inventory) {
    const diff = (openingDelta.get(item.id) ?? 0) - item.openingStock;
    if (diff !== 0) adjustments.push({ id: `opening-${item.id}`, itemId: item.id, quantity: diff, type: "adjustment", reference: "opening", createdAt: "" });
  }

  return {
    businessId: id,
    role: membership.role,
    today: jakartaToday(),
    state: {
      version: 1,
      business: { name: business.data.name, owner: business.data.owner_name || "Pemilik", outlet: outlet.data?.name ?? "Outlet utama" },
      dayTarget: Number(business.data.day_target),
      sales: sales.map(mapSale),
      stockMovements: [...adjustments, ...stockMovements],
      customers: customers.map(mapCustomer),
      expenses: expenses.map(mapExpense),
      purchases: purchases.map(mapPurchase).filter((p): p is Purchase => p !== null),
    },
  };
}

type PurchaseRow = { id: string; quantity: number | string; total: number; purchase: { created_at: string } | null; inventory_item: { code: string } | null };
export const PURCHASE_SELECT = "id, quantity, total, purchase(created_at), inventory_item(code)";
export function mapPurchase(row: PurchaseRow): Purchase | null {
  const code = row.inventory_item?.code;
  if (!code || !inventoryByCode.has(code)) return null;
  return { id: row.id, itemId: code, quantity: Number(row.quantity), total: Number(row.total), createdAt: toJakartaIso(row.purchase?.created_at) };
}
