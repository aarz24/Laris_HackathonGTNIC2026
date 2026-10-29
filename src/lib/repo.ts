import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { jakartaToday } from "@/lib/env";
import { mapSaleItem, type AuditActivity, type BusinessState, type Customer, type Expense, type InventoryItem, type Product, type Purchase, type Sale, type StockMovement, type TeamMember } from "@/lib/laris-data";

export type Role = "owner" | "manager" | "kasir" | "dapur";
export interface Membership { businessId: string; role: Role; userId: string; email: string; displayName: string }
export interface Snapshot { state: BusinessState; businessId: string; role: Role; today: string }

const PAGE = 1000;

export function toJakartaIso(value: string | null | undefined): string {
  const ms = value ? Date.parse(value) : NaN;
  if (Number.isNaN(ms)) return "";
  return `${new Date(ms + 7 * 3600_000).toISOString().slice(0, 19)}+07:00`;
}

const paymentLabel = { tunai: "Tunai", qris: "QRIS", transfer: "Transfer" } as const;

type OrderRow = {
  id: string; created_at: string; customer_name: string; channel: string; subtotal: number; discount: number; tax: number; total: number; cash_received: number;
  order_item: Parameters<typeof mapSaleItem>[0][];
  payment: { method: keyof typeof paymentLabel }[];
};
export const ORDER_SELECT = "id, created_at, customer_name, channel, subtotal, discount, tax, total, cash_received, order_item(product_code, name, unit_price, unit_cost, quantity, note), payment(method)";

export function mapSale(row: OrderRow): Sale {
  return {
    id: row.id,
    items: row.order_item.map(mapSaleItem),
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
  if (!code) return null;
  const type = row.type === "sale" || row.type === "purchase" ? row.type : "adjustment";
  return { id: row.id, itemId: code, quantity: Number(row.qty_delta), type, reference: row.ref_id ?? "", createdAt: toJakartaIso(row.created_at) };
}

async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

type InventoryRow = {
  code: string; name: string; base_unit: string; avg_cost_per_unit: number | string; reorder_point: number | string;
  supplier: { name: string } | null;
};
type ProductRow = { id: string; code: string; name: string; category: string; image_url: string | null; is_active: boolean; deleted_at: string | null };
type VariantRow = { id: string; product_id: string; price: number; hpp_cached: number; is_default: boolean; is_available: boolean; deleted_at: string | null };
type RecipeRow = { variant_id: string; qty_base_unit: number | string; inventory_item: { code: string } | null };

export async function loadCatalog(supabase: SupabaseClient, businessId: string): Promise<{ products: Product[]; inventory: InventoryItem[] }> {
  const [itemRows, productRows, variantRows, recipeRows] = await Promise.all([
    fetchAll<InventoryRow>((from, to) => supabase.from("inventory_item").select("code, name, base_unit, avg_cost_per_unit, reorder_point, supplier(name)").eq("business_id", businessId).is("deleted_at", null).order("code").range(from, to).returns<InventoryRow[]>()),
    fetchAll<ProductRow>((from, to) => supabase.from("product").select("id, code, name, category, image_url, is_active, deleted_at").eq("business_id", businessId).is("deleted_at", null).order("name").range(from, to).returns<ProductRow[]>()),
    fetchAll<VariantRow>((from, to) => supabase.from("product_variant").select("id, product_id, price, hpp_cached, is_default, is_available, deleted_at").eq("business_id", businessId).eq("is_default", true).is("deleted_at", null).range(from, to).returns<VariantRow[]>()),
    fetchAll<RecipeRow>((from, to) => supabase.from("recipe_line").select("variant_id, qty_base_unit, inventory_item(code)").eq("business_id", businessId).range(from, to).returns<RecipeRow[]>()),
  ]);

  const items: InventoryItem[] = itemRows.map((row) => ({
    id: row.code, name: row.name, unit: row.base_unit, openingStock: 0,
    reorderPoint: Number(row.reorder_point), cost: Number(row.avg_cost_per_unit), supplier: row.supplier?.name ?? "Belum diatur",
  }));
  const variants = new Map(variantRows.map((row) => [row.product_id, row]));
  const recipes = new Map<string, Product["recipe"]>();
  for (const row of recipeRows) {
    const code = row.inventory_item?.code;
    if (!code) continue;
    const recipe = recipes.get(row.variant_id) ?? [];
    recipe.push({ itemId: code, quantity: Number(row.qty_base_unit) });
    recipes.set(row.variant_id, recipe);
  }
  const catalog: Product[] = productRows.map((row) => {
    const variant = variants.get(row.id);
    return {
      id: row.code, name: row.name, category: row.category, price: Number(variant?.price ?? 0), cost: Number(variant?.hpp_cached ?? 0),
      sold: 0, image: row.image_url ?? "", recipe: recipes.get(variant?.id ?? "") ?? [],
      active: row.is_active && !row.deleted_at && Boolean(variant?.is_available && !variant.deleted_at),
    };
  });
  return { products: catalog, inventory: items };
}

export async function currentMembership(supabase: SupabaseClient): Promise<Membership | null> {
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return null;
  const { data, error } = await supabase.from("membership").select("business_id, role, created_at").eq("user_id", userId).order("created_at").limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  const metadata = claims.claims.user_metadata as { full_name?: unknown } | undefined;
  const email = typeof claims.claims.email === "string" ? claims.claims.email : "";
  const displayName = typeof metadata?.full_name === "string" ? metadata.full_name : "";
  return data ? { businessId: data.business_id as string, role: data.role as Role, userId, email, displayName } : null;
}

type TeamRow = { user_id: string; email: string | null; display_name: string | null; role: Role };
type AuditRow = { id: number; action: string; entity: string; created_at: string; actor_id: string | null };

export async function loadSnapshot(supabase: SupabaseClient): Promise<Snapshot | null> {
  const membership = await currentMembership(supabase);
  if (!membership) return null;
  const id = membership.businessId;
  const canReadTeam = membership.role === "owner" || membership.role === "manager";

  const [business, outlet, catalog, sales, movements, customers, expenses, purchases, team] = await Promise.all([
    supabase.from("business").select("name, owner_name, day_target, settings").eq("id", id).single(),
    supabase.from("outlet").select("name").eq("business_id", id).is("deleted_at", null).order("created_at").limit(1).maybeSingle(),
    loadCatalog(supabase, id),
    fetchAll<OrderRow>((from, to) => supabase.from("sales_order").select(ORDER_SELECT).eq("business_id", id).eq("status", "paid").order("created_at").order("id").range(from, to).returns<OrderRow[]>()),
    fetchAll<MovementRow>((from, to) => supabase.from("stock_movement").select(MOVEMENT_SELECT).eq("business_id", id).order("created_at").order("id").range(from, to).returns<MovementRow[]>()),
    fetchAll<CustomerRow>((from, to) => supabase.from("customer").select(CUSTOMER_SELECT).eq("business_id", id).is("deleted_at", null).order("created_at").order("id").range(from, to).returns<CustomerRow[]>()),
    fetchAll<ExpenseRow>((from, to) => supabase.from("expense").select(EXPENSE_SELECT).eq("business_id", id).is("deleted_at", null).order("spent_at").order("id").range(from, to).returns<ExpenseRow[]>()),
    fetchAll<PurchaseRow>((from, to) => supabase.from("purchase_line").select(PURCHASE_SELECT).eq("business_id", id).order("id").range(from, to).returns<PurchaseRow[]>()),
    canReadTeam ? supabase.rpc("list_team_members", { p_business_id: id }).returns<TeamRow[]>() : Promise.resolve({ data: null, error: null }),
  ]);
  if (business.error) throw new Error(business.error.message);
  if (outlet.error) throw new Error(outlet.error.message);
  if (team.error) throw new Error(team.error.message);

  const mappedSales = sales.map(mapSale);
  const sold = new Map<string, number>();
  for (const sale of mappedSales) for (const item of sale.items) sold.set(item.productId, (sold.get(item.productId) ?? 0) + item.quantity);
  const teamRows = canReadTeam ? (team.data ?? []) as unknown as TeamRow[] : [{
    user_id: membership.userId, email: membership.email, display_name: membership.displayName, role: membership.role,
  }];
  const members: TeamMember[] = teamRows.map((row) => ({
    id: row.user_id, name: row.display_name || row.email?.split("@")[0] || "Anggota tim", email: row.email ?? "", role: row.role,
  }));

  let activities: AuditActivity[] = [];
  if (canReadTeam) {
    const { data, error } = await supabase.from("audit_log").select("id, action, entity, created_at, actor_id").eq("business_id", id).order("created_at", { ascending: false }).limit(10).returns<AuditRow[]>();
    if (error) throw new Error(error.message);
    activities = (data ?? []).map((row) => ({
      id: String(row.id), action: row.action, entity: row.entity, createdAt: toJakartaIso(row.created_at),
      actorName: members.find((member) => member.id === row.actor_id)?.name ?? "Sistem",
    }));
  }

  const settings = business.data.settings as { kind?: unknown; taxRate?: unknown; receiptFooter?: unknown } | null;
  return {
    businessId: id,
    role: membership.role,
    today: jakartaToday(),
    state: {
      version: 1,
      business: {
        name: business.data.name, owner: business.data.owner_name || "Pemilik", outlet: outlet.data?.name ?? "Outlet utama",
        ...(typeof settings?.kind === "string" ? { kind: settings.kind } : {}),
        taxRate: typeof settings?.taxRate === "number" ? settings.taxRate : 10,
        receiptFooter: typeof settings?.receiptFooter === "string" ? settings.receiptFooter : "Terima kasih sudah berkunjung.",
      },
      dayTarget: Number(business.data.day_target),
      sales: mappedSales,
      stockMovements: movements.map(mapMovement).filter((movement): movement is StockMovement => movement !== null),
      customers: customers.map(mapCustomer),
      expenses: expenses.map(mapExpense),
      purchases: purchases.map(mapPurchase).filter((purchase): purchase is Purchase => purchase !== null),
      products: catalog.products.map((product) => ({ ...product, sold: sold.get(product.id) ?? 0 })),
      inventory: catalog.inventory,
      members,
      activities,
    },
  };
}

type PurchaseRow = { id: string; quantity: number | string; total: number; purchase: { created_at: string } | null; inventory_item: { code: string } | null };
export const PURCHASE_SELECT = "id, quantity, total, purchase(created_at), inventory_item(code)";
export function mapPurchase(row: PurchaseRow): Purchase | null {
  const code = row.inventory_item?.code;
  if (!code) return null;
  return { id: row.id, itemId: code, quantity: Number(row.quantity), total: Number(row.total), createdAt: toJakartaIso(row.purchase?.created_at) };
}
