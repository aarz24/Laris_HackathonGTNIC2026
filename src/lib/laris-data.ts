export const DEMO_DATE = "2026-10-18";

export interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  cost: number;
  sold: number;
  image: string;
  recipe: { itemId: string; quantity: number }[];
}

export interface InventoryItem {
  id: string;
  name: string;
  unit: string;
  openingStock: number;
  reorderPoint: number;
  cost: number;
  supplier: string;
}

export interface StockMovement {
  id: string;
  itemId: string;
  quantity: number;
  type: "sale" | "purchase" | "adjustment";
  reference: string;
  createdAt: string;
}

export interface CartItem {
  productId: string;
  quantity: number;
  note?: string;
}

export interface Sale {
  id: string;
  items: CartItem[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  payment: "Tunai" | "QRIS" | "Transfer";
  cashReceived: number;
  customerName: string;
  channel: "Kasir" | "Etalase";
  createdAt: string;
  status: "Lunas";
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  visits: number;
  totalSpent: number;
  lastVisit: string;
  segment: "Juara" | "Setia" | "Potensial" | "Berisiko" | "Hilang";
  points: number;
}

export interface Expense {
  id: string;
  description: string;
  category: string;
  amount: number;
  createdAt: string;
}

export interface Purchase {
  id: string;
  itemId: string;
  quantity: number;
  total: number;
  createdAt: string;
}

export interface BusinessState {
  version: 1;
  sales: Sale[];
  stockMovements: StockMovement[];
  expenses: Expense[];
  customers: Customer[];
  purchases: Purchase[];
  business: { name: string; owner: string; outlet: string };
  dayTarget: number;
}

export const inventory: InventoryItem[] = [
  { id: "beans", name: "Biji kopi house blend", unit: "g", openingStock: 3800, reorderPoint: 1000, cost: 180, supplier: "Dago Coffee Roastery" },
  { id: "milk", name: "Susu segar", unit: "ml", openingStock: 1200, reorderPoint: 2000, cost: 22, supplier: "Susu Lembang" },
  { id: "syrup", name: "Sirup gula aren", unit: "ml", openingStock: 2800, reorderPoint: 1000, cost: 65, supplier: "Aren Nusantara" },
  { id: "cups", name: "Gelas & tutup", unit: "pcs", openingStock: 240, reorderPoint: 80, cost: 1200, supplier: "Bandung Kemasan" },
  { id: "pastry", name: "Pastry aneka rasa", unit: "pcs", openingStock: 42, reorderPoint: 12, cost: 10000, supplier: "Roti Pagi Bakery" },
  { id: "matcha-powder", name: "Bubuk matcha", unit: "g", openingStock: 480, reorderPoint: 100, cost: 600, supplier: "Daun Hijau Tea" },
  { id: "cocoa-powder", name: "Bubuk cokelat", unit: "g", openingStock: 850, reorderPoint: 200, cost: 180, supplier: "Kakao Nusantara" },
  { id: "tea", name: "Teh melati", unit: "kantong", openingStock: 95, reorderPoint: 25, cost: 1500, supplier: "Daun Hijau Tea" },
];

export const products: Product[] = [
  { id: "kopi-susu", name: "Es Kopi Susu", category: "Kopi", price: 25000, cost: 9040, sold: 842, image: "/images/kopi-susu.webp", recipe: [{ itemId: "beans", quantity: 18 }, { itemId: "milk", quantity: 150 }, { itemId: "syrup", quantity: 20 }, { itemId: "cups", quantity: 1 }] },
  { id: "americano", name: "Americano", category: "Kopi", price: 22000, cost: 4440, sold: 315, image: "/images/americano.webp", recipe: [{ itemId: "beans", quantity: 18 }, { itemId: "cups", quantity: 1 }] },
  { id: "matcha", name: "Matcha Latte", category: "Non-kopi", price: 28000, cost: 8210, sold: 286, image: "/images/matcha.webp", recipe: [{ itemId: "matcha-powder", quantity: 4 }, { itemId: "milk", quantity: 180 }, { itemId: "syrup", quantity: 10 }, { itemId: "cups", quantity: 1 }] },
  { id: "croissant", name: "Butter Croissant", category: "Pastry", price: 22000, cost: 10000, sold: 374, image: "/images/croissant.webp", recipe: [{ itemId: "pastry", quantity: 1 }] },
  { id: "pain-chocolat", name: "Pain au Chocolat", category: "Pastry", price: 26000, cost: 10000, sold: 198, image: "/images/pain-chocolat.webp", recipe: [{ itemId: "pastry", quantity: 1 }] },
  { id: "cinnamon", name: "Cinnamon Roll", category: "Pastry", price: 24000, cost: 10000, sold: 167, image: "/images/cinnamon.webp", recipe: [{ itemId: "pastry", quantity: 1 }] },
  { id: "cappuccino", name: "Cappuccino", category: "Kopi", price: 28000, cost: 7740, sold: 231, image: "/images/kopi-susu.webp", recipe: [{ itemId: "beans", quantity: 18 }, { itemId: "milk", quantity: 150 }, { itemId: "cups", quantity: 1 }] },
  { id: "chocolate", name: "Iced Chocolate", category: "Non-kopi", price: 27000, cost: 9660, sold: 154, image: "/images/matcha.webp", recipe: [{ itemId: "cocoa-powder", quantity: 25 }, { itemId: "milk", quantity: 180 }, { itemId: "cups", quantity: 1 }] },
  { id: "tea", name: "Es Teh Melati", category: "Non-kopi", price: 18000, cost: 3675, sold: 142, image: "/images/americano.webp", recipe: [{ itemId: "tea", quantity: 1 }, { itemId: "syrup", quantity: 15 }, { itemId: "cups", quantity: 1 }] },
];

const rupiah = new Intl.NumberFormat("id-ID", {
  style: "currency", currency: "IDR", maximumFractionDigits: 0,
});

export function currency(amount: number): string {
  return rupiah.format(amount);
}

function findProduct(id: string): Product {
  const product = products.find((entry) => entry.id === id);
  if (!product) throw new Error(`Menu tidak dikenal: ${String(id)}.`);
  return product;
}

function findInventory(id: string): InventoryItem {
  const item = inventory.find((entry) => entry.id === id);
  if (!item) throw new Error(`Bahan tidak dikenal: ${String(id)}.`);
  return item;
}

function assertAmount(value: number, label: string, positive = false): void {
  if (!Number.isFinite(value) || value < 0 || (positive && value === 0) || value > Number.MAX_SAFE_INTEGER) {
    throw new Error(`${label} harus berupa angka ${positive ? "positif" : "non-negatif"} yang valid.`);
  }
}

function validateCart(items: CartItem[]): void {
  if (!Array.isArray(items) || items.length === 0) throw new Error("Keranjang tidak boleh kosong.");
  for (const item of items) {
    if (!item || !Number.isSafeInteger(item.quantity) || item.quantity <= 0) {
      throw new Error("Jumlah menu harus berupa bilangan bulat positif yang aman.");
    }
    findProduct(item.productId);
    if (item.note !== undefined && typeof item.note !== "string") throw new Error("Catatan menu harus berupa teks.");
  }
}

export function getStock(state: BusinessState, itemId: string): number {
  const item = findInventory(itemId);
  return state.stockMovements.reduce((stock, movement) =>
    movement.itemId === itemId ? stock + movement.quantity : stock, item.openingStock);
}

export function getCartTotal(items: CartItem[], discount = 0, taxEnabled = false): {
  subtotal: number; discount: number; tax: number; total: number;
} {
  // An empty cart is useful in the register; completeSale rejects it separately.
  if (!Array.isArray(items)) throw new Error("Keranjang tidak valid.");
  if (items.length) validateCart(items);
  const subtotal = items.reduce((sum, item) => sum + findProduct(item.productId).price * item.quantity, 0);
  assertAmount(subtotal, "Subtotal");
  assertAmount(discount, "Diskon");
  if (discount > subtotal) throw new Error("Diskon tidak boleh melebihi subtotal.");
  const roundedDiscount = Math.round(discount);
  // Demo restaurant tax (PBJT): 10% after discount, rounded to whole rupiah.
  const tax = taxEnabled ? Math.round((subtotal - roundedDiscount) * 0.1) : 0;
  const total = subtotal - roundedDiscount + tax;
  assertAmount(total, "Total");
  return { subtotal, discount: roundedDiscount, tax, total };
}

function timestamp(): string {
  return `${DEMO_DATE}T${new Date().toISOString().slice(11)}`;
}

function nextId(prefix: string, entries: { id: string }[]): string {
  let sequence = entries.length + 1;
  const ids = new Set(entries.map((entry) => entry.id));
  while (ids.has(`${prefix}-${sequence}`)) sequence++;
  return `${prefix}-${sequence}`;
}

function segmentFor(customer: Customer, endDate = DEMO_DATE): Customer["segment"] {
  const elapsed = (Date.parse(`${endDate}T23:59:59Z`) - Date.parse(customer.lastVisit)) / 86400000;
  if (elapsed > 60) return "Hilang";
  if (elapsed > 30) return "Berisiko";
  return customer.visits >= 20 ? "Juara" : customer.visits >= 8 ? "Setia" : "Potensial";
}

export function completeSale(state: BusinessState, input: {
  items: CartItem[];
  payment: Sale["payment"];
  cashReceived: number;
  customerName?: string;
  customerPhone?: string;
  discount?: number;
  taxEnabled?: boolean;
  channel?: Sale["channel"];
  idempotencyKey?: string;
}): { state: BusinessState; sale: Sale } {
  // Encoding the key in the sale ID keeps retries durable through JSON persistence
  // without adding fields to the public state or sale contracts.
  let id: string;
  if (input.idempotencyKey !== undefined) {
    if (typeof input.idempotencyKey !== "string" || !input.idempotencyKey.trim()) {
      throw new Error("Kunci transaksi tidak boleh kosong.");
    }
    id = `sale-key-${encodeURIComponent(input.idempotencyKey)}`;
    const existing = state.sales.find((sale) => sale.id === id);
    if (existing) return { state, sale: existing };
  } else {
    id = nextId(`sale-${DEMO_DATE}`, state.sales);
  }

  validateCart(input.items);
  const totals = getCartTotal(input.items, input.discount, input.taxEnabled);
  if (!["Tunai", "QRIS", "Transfer"].includes(input.payment)) throw new Error("Metode pembayaran tidak valid.");
  const channel = input.channel ?? "Kasir";
  if (channel !== "Kasir" && channel !== "Etalase") throw new Error("Kanal penjualan tidak valid.");
  assertAmount(input.cashReceived, "Uang diterima");
  const cashReceived = Math.round(input.cashReceived);
  if (input.payment === "Tunai" && cashReceived < totals.total) {
    throw new Error(`Uang tunai tidak cukup. Total pembayaran ${currency(totals.total)}.`);
  }
  if (input.customerName !== undefined && typeof input.customerName !== "string") {
    throw new Error("Nama pelanggan harus berupa teks.");
  }
  let phone: string | undefined;
  if (input.customerPhone !== undefined) {
    if (typeof input.customerPhone !== "string" || !/^\+?\d{8,15}$/.test(input.customerPhone.trim())) {
      throw new Error("Nomor telepon harus terdiri dari 8–15 digit, boleh diawali +.");
    }
    phone = input.customerPhone.trim();
  }

  const needed = new Map<string, number>();
  for (const item of input.items) {
    for (const ingredient of findProduct(item.productId).recipe) {
      const quantity = (needed.get(ingredient.itemId) ?? 0) + ingredient.quantity * item.quantity;
      assertAmount(quantity, "Kebutuhan bahan", true);
      needed.set(ingredient.itemId, quantity);
    }
  }
  // Validate the entire aggregated recipe before constructing any ledger entries.
  for (const [itemId, quantity] of needed) {
    if (getStock(state, itemId) < quantity) {
      const item = findInventory(itemId);
      throw new Error(`Stok ${item.name} tidak cukup. Tersedia ${getStock(state, itemId)} ${item.unit}, dibutuhkan ${quantity} ${item.unit}.`);
    }
  }

  const existingCustomer = phone ? state.customers.find((customer) => customer.phone.replace(/^\+/, "") === phone!.replace(/^\+/, "")) : undefined;
  const customerName = input.customerName?.trim() || existingCustomer?.name || (phone ? "Pelanggan baru" : "Pelanggan umum");
  const createdAt = timestamp();
  const sale: Sale = {
    id, items: input.items.map((item) => ({ ...item })), ...totals,
    payment: input.payment, cashReceived: input.payment === "Tunai" ? cashReceived : totals.total,
    customerName, channel, createdAt, status: "Lunas",
  };
  let customers = state.customers;
  if (phone) {
    const customer: Customer = {
      id: existingCustomer?.id ?? nextId("customer", state.customers), name: customerName, phone,
      visits: (existingCustomer?.visits ?? 0) + 1,
      totalSpent: (existingCustomer?.totalSpent ?? 0) + sale.total,
      lastVisit: createdAt, segment: "Potensial",
      points: (existingCustomer?.points ?? 0) + Math.floor(sale.total / 1000),
    };
    customer.segment = segmentFor(customer);
    customers = existingCustomer ? state.customers.map((entry) => entry.id === customer.id ? customer : entry) : [...state.customers, customer];
  }
  const movements: StockMovement[] = [...needed].map(([itemId, quantity]) => ({
    id: `movement-${id}-${itemId}`, itemId, quantity: -quantity, type: "sale", reference: id, createdAt,
  }));
  return {
    sale,
    state: { ...state, sales: [...state.sales, sale], stockMovements: [...state.stockMovements, ...movements], customers },
  };
}

export function recordPurchase(state: BusinessState, input: { itemId: string; quantity: number; total: number }): BusinessState {
  findInventory(input.itemId);
  assertAmount(input.quantity, "Jumlah pembelian", true);
  assertAmount(input.total, "Total pembelian", true);
  assertAmount(getStock(state, input.itemId) + input.quantity, "Stok setelah pembelian");
  const purchase: Purchase = {
    id: nextId(`purchase-${DEMO_DATE}`, state.purchases), itemId: input.itemId,
    quantity: input.quantity, total: Math.round(input.total), createdAt: timestamp(),
  };
  const movement: StockMovement = {
    id: `movement-${purchase.id}`, itemId: input.itemId, quantity: input.quantity,
    type: "purchase", reference: purchase.id, createdAt: purchase.createdAt,
  };
  return { ...state, purchases: [...state.purchases, purchase], stockMovements: [...state.stockMovements, movement] };
}

/** Deterministic 90-day "Kopi Senja" history ending on `endDate` (the seed script anchors it to the real date). */
export function createInitialState(endDate: string = DEMO_DATE): BusinessState {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate) || Number.isNaN(Date.parse(`${endDate}T00:00:00Z`))) throw new Error("Tanggal akhir tidak valid.");
  let randomState = 20261018;
  const random = () => {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    return randomState / 4294967296;
  };
  const names = ["Nadia Putri", "Fajar Pratama", "Alya Maharani", "Dimas Saputra", "Sinta Rahma", "Rizky Aditya", "Intan Permata", "Bagas Wicaksono", "Citra Lestari", "Arman Hidayat", "Kirana Dewi", "Galih Ramadhan"];
  const customers: Customer[] = names.map((name, index) => ({
    id: `customer-${index + 1}`, name, phone: `08120000${String(index + 1).padStart(4, "0")}`,
    visits: 0, totalSpent: 0, lastVisit: "", segment: "Potensial", points: 0,
  }));
  const sales: Sale[] = [];
  const expenses: Expense[] = [];
  const weightedMenu = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 5, 6, 7, 8];
  const end = Date.parse(`${endDate}T00:00:00Z`);
  for (let day = 0; day < 90; day++) {
    const date = new Date(end - (89 - day) * 86400000).toISOString().slice(0, 10);
    const count = day === 89 ? 86 : 15 + Math.floor(random() * 16);
    for (let index = 0; index < count; index++) {
      const product = products[weightedMenu[Math.floor(random() * weightedMenu.length)]];
      const items: CartItem[] = [{ productId: product.id, quantity: random() < 0.16 ? 2 : 1 }];
      if (random() < 0.36) {
        const accompaniment = product.category === "Pastry" ? products[0] : products[3 + Math.floor(random() * 3)];
        items.push({ productId: accompaniment.id, quantity: 1 });
      }
      const subtotal = getCartTotal(items).subtotal;
      const totals = getCartTotal(items, random() < 0.12 ? Math.round(subtotal * 0.1) : 0);
      const minute = 8 * 60 + Math.floor((index / count) * 12 * 60);
      const createdAt = `${date}T${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}:00+07:00`;
      const eligible = customers.filter((_, customerIndex) => customerIndex < 8 || (customerIndex === 8 && day < 49) || (customerIndex === 9 && day < 21) || (customerIndex === 10 && day > 86) || (customerIndex === 11 && day === 89));
      const customer = random() < 0.4 ? eligible[Math.floor(random() * eligible.length)] : undefined;
      const paymentRoll = random();
      const payment: Sale["payment"] = paymentRoll < 0.66 ? "QRIS" : paymentRoll < 0.92 ? "Tunai" : "Transfer";
      const sale: Sale = {
        id: `sale-${date}-${String(index + 1).padStart(3, "0")}`, items, ...totals, payment,
        cashReceived: payment === "Tunai" ? Math.ceil(totals.total / 50000) * 50000 : totals.total,
        customerName: customer?.name ?? "Pelanggan umum", channel: random() < 0.18 ? "Etalase" : "Kasir", createdAt, status: "Lunas",
      };
      sales.push(sale);
      if (customer) {
        customer.visits++;
        customer.totalSpent += sale.total;
        customer.points += Math.floor(sale.total / 1000);
        customer.lastVisit = createdAt;
      }
    }
    const addExpense = (description: string, category: string, amount: number) => expenses.push({
      id: `expense-${expenses.length + 1}`, description, category, amount, createdAt: `${date}T07:00:00+07:00`,
    });
    addExpense("Belanja bahan segar & kebutuhan harian", "Bahan baku", 95000 + Math.floor(random() * 15) * 10000);
    if (date.endsWith("-01")) {
      addExpense("Sewa kedai Dago", "Sewa", 3500000);
      addExpense("Gaji dua barista", "Gaji", 4800000);
      addExpense("Listrik, air & internet", "Utilitas", 850000);
    }
    if (day % 7 === 0) addExpense("Kebersihan & perlengkapan kedai", "Operasional", 125000);
  }
  for (const customer of customers) customer.segment = segmentFor(customer, endDate);
  return {
    version: 1, sales, expenses, customers, purchases: [],
    // openingStock is the demo's remaining stock, not stock before historical sales.
    // Only new demo mutations append movements; history is deliberately not deducted.
    stockMovements: [], business: { name: "Kopi Senja", owner: "Raka", outlet: "Bandung, Dago" }, dayTarget: 3500000,
  };
}

const numberWords: Record<string, number> = {
  satu: 1, dua: 2, tiga: 3, empat: 4, lima: 5, enam: 6, tujuh: 7, delapan: 8, sembilan: 9, sepuluh: 10,
};
const menuAliases: Record<string, string> = {
  "es kopi susu gula aren": "kopi-susu", "es kopi susu": "kopi-susu", "kopi susu": "kopi-susu", "es kopsu": "kopi-susu", kopsu: "kopi-susu",
  "butter croissant": "croissant", croissant: "croissant", "matcha latte": "matcha", "es matcha": "matcha", matcha: "matcha",
  "es americano": "americano", americano: "americano", "es amer": "americano", amer: "americano",
  "pain au chocolat": "pain-chocolat", "pain chocolat": "pain-chocolat", "pain-chocolat": "pain-chocolat", "roti cokelat": "pain-chocolat", "cokelat pastry": "pain-chocolat",
  "cinnamon roll": "cinnamon", cinnamon: "cinnamon", "roti kayu manis": "cinnamon", cappuccino: "cappuccino", kapucino: "cappuccino",
  "iced chocolate": "chocolate", "es cokelat": "chocolate", "es coklat": "chocolate", chocolate: "chocolate", cokelat: "chocolate", coklat: "chocolate",
  "es teh melati": "tea", "teh melati": "tea", "iced tea": "tea", "es teh manis": "tea", "teh manis": "tea", "es teh": "tea", tea: "tea", teh: "tea",
};
const aliasPattern = Object.keys(menuAliases).sort((a, b) => b.length - a.length).join("|");
const quantityPattern = `(?:\\d+|${Object.keys(numberWords).join("|")})`;
const notePattern = "(?:less sugar|kurang gula|gula sedikit|sedikit gula|tanpa gula|less ice|sedikit es|tanpa es)";
const orderPattern = new RegExp(`^(?:(${quantityPattern})\\s+(?:(?:gelas|cup|pcs|buah)\\s+)?)?(${aliasPattern})(?:\\s+(${quantityPattern}))?((?:\\s+${notePattern})*)$`);

export function parseOrder(text: string): { items: CartItem[]; payment: Sale["payment"]; unknown: string[] } {
  const items: CartItem[] = [];
  const unknown: string[] = [];
  let payment: Sale["payment"] = "Tunai";
  let paymentSeen = false;
  const normalized = text.toLowerCase().trim().replace(/\.(?=\s|$)/g, ";");
  const clauses = normalized.split(/[,;\n]+|\s+(?:dan|&|\+)\s+/).map((clause) => clause.trim().replace(/\s+/g, " ")).filter(Boolean);
  for (let clause of clauses) {
    const original = clause;
    clause = clause.replace(/^(?:tolong\s+)?(?:(?:saya\s+)?(?:mau\s+)?(?:pesan|beli)|saya mau|mau)\s+|^tolong\s+/, "");
    const paymentMatch = clause.match(/(?:^|\s+)(?:(?:bayar|pembayaran)(?:\s+(?:pakai|dengan))?\s+|(?:pakai|via|dengan)\s+)?(qris|tunai|cash|transfer)$/);
    if (paymentMatch) {
      const selected: Sale["payment"] = paymentMatch[1] === "qris" ? "QRIS" : paymentMatch[1] === "transfer" ? "Transfer" : "Tunai";
      if (paymentSeen && payment !== selected) {
        unknown.push(original);
        continue;
      }
      payment = selected;
      paymentSeen = true;
      clause = clause.slice(0, paymentMatch.index).trim();
      if (!clause) continue;
    }
    const match = clause.match(orderPattern);
    if (!match || (match[1] && match[3])) {
      unknown.push(original);
      continue;
    }
    const quantityToken = match[1] ?? match[3] ?? "1";
    const quantity = numberWords[quantityToken] ?? Number(quantityToken);
    if (!Number.isSafeInteger(quantity) || quantity <= 0) {
      unknown.push(original);
      continue;
    }
    const notes = match[4].trim().replace(/kurang gula|gula sedikit|sedikit gula/g, "less sugar");
    items.push({ productId: menuAliases[match[2]], quantity, ...(notes ? { note: notes } : {}) });
  }
  return { items, payment, unknown };
}

function csvCell(value: string | number): string {
  const text = String(value);
  // Quote every cell, and neutralize formulas even behind whitespace/control marks.
  const safe = /^[\s\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f]*[=+\-@]/u.test(text) || /^[\t\r\n]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function exportSalesCsv(state: BusinessState): string {
  const rows: (string | number)[][] = [["ID", "Tanggal", "Pelanggan", "Menu", "Subtotal", "Diskon", "Pajak", "Total", "Pembayaran", "Uang diterima", "Kanal", "Status"]];
  for (const sale of state.sales) {
    rows.push([
      sale.id, sale.createdAt, sale.customerName,
      sale.items.map((item) => `${item.quantity}× ${findProduct(item.productId).name}${item.note ? ` (${item.note})` : ""}`).join("; "),
      sale.subtotal, sale.discount, sale.tax, sale.total, sale.payment, sale.cashReceived, sale.channel, sale.status,
    ]);
  }
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}
