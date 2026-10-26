import test from "node:test";
import assert from "node:assert/strict";
import type { BusinessState, CartItem, Sale } from "./laris-data";

// Native Node requires a .ts URL. A dynamic URL avoids requiring a project-wide
// allowImportingTsExtensions change, while the type query preserves type checking.
const {
  DEMO_DATE, products, inventory, createInitialState, currency, getStock,
  getCartTotal, completeSale, recordPurchase, parseOrder, exportSalesCsv, timestamp,
  deleteProduct, deleteInventoryItem, deleteCustomer, deleteExpense, updateCustomer,
}: typeof import("./laris-data") = await import(new URL("./laris-data.ts", import.meta.url).href);

const seed = createInitialState();

function emptyState(): BusinessState {
  return {
    version: 1, sales: [], stockMovements: [], expenses: [], customers: [], purchases: [],
    business: { name: "Kopi Senja", owner: "Raka", outlet: "Bandung, Dago" }, dayTarget: 3500000,
  };
}

function freezeDeep<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

const oneCoffee: CartItem[] = [{ productId: "kopi-susu", quantity: 1 }];
const cashInput = { items: oneCoffee, payment: "Tunai" as const, cashReceived: 50000 };

test("timestamp preserves the active date at the UTC day boundary", (context) => {
  context.mock.method(Date, "now", () => Date.parse("2026-10-18T17:30:00.000Z"));
  assert.equal(timestamp("2026-10-18"), "2026-10-18T00:30:00.000+07:00");
});

// Small RFC 4180 reader verifies complete cell values, including multiline data.
function readCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') { cell += '"'; index++; }
      else quoted = !quoted;
    } else if (!quoted && character === ",") {
      row.push(cell); cell = "";
    } else if (!quoted && character === "\r" && text[index + 1] === "\n") {
      row.push(cell); rows.push(row); row = []; cell = ""; index++;
    } else cell += character;
  }
  assert.equal(quoted, false, "CSV quotes must be balanced");
  row.push(cell); rows.push(row);
  return rows;
}

test("catalog has the exact nine IDs, image paths, eight ingredients and base-unit costs", () => {
  assert.deepEqual(products.map((product) => product.id), ["kopi-susu", "americano", "matcha", "croissant", "pain-chocolat", "cinnamon", "cappuccino", "chocolate", "tea"]);
  assert.equal(products[0].price, 25000);
  assert.equal(products[3].price, 22000);
  assert.equal(inventory.length, 8);
  assert.equal(new Set(inventory.map((item) => item.id)).size, 8);
  const assets = new Set(["kopi-susu", "americano", "matcha", "croissant", "pain-chocolat", "cinnamon"].map((id) => `/images/${id}.webp`));
  for (const product of products) {
    assert.ok(assets.has(product.image));
    assert.ok(["Kopi", "Non-kopi", "Pastry"].includes(product.category));
    assert.ok(product.price > product.cost && product.cost > 0 && product.sold > 0);
    assert.ok(product.recipe.length > 0);
    const recipeCost = product.recipe.reduce((sum, ingredient) => {
      const item = inventory.find((entry) => entry.id === ingredient.itemId);
      assert.ok(item);
      assert.ok(ingredient.quantity > 0);
      return sum + item.cost * ingredient.quantity;
    }, 0);
    assert.equal(product.cost, recipeCost);
  }
  assert.deepEqual(products[0].recipe, [{ itemId: "beans", quantity: 18 }, { itemId: "milk", quantity: 150 }, { itemId: "syrup", quantity: 20 }, { itemId: "cups", quantity: 1 }]);
  assert.equal(inventory.find((item) => item.id === "milk")?.reorderPoint, 2000);
});

test("seed is deterministic, fresh, serializable, and covers 90 days ending on demo date", () => {
  assert.equal(DEMO_DATE, "2026-10-18");
  assert.deepEqual(createInitialState(), seed);
  assert.deepEqual(JSON.parse(JSON.stringify(seed)), seed);
  const dates = new Map<string, number>();
  for (const sale of seed.sales) {
    const date = sale.createdAt.slice(0, 10);
    dates.set(date, (dates.get(date) ?? 0) + 1);
    assert.ok(Number.isFinite(Date.parse(sale.createdAt)));
    assert.deepEqual(getCartTotal(sale.items, sale.discount, sale.tax > 0), {
      subtotal: sale.subtotal, discount: sale.discount, tax: sale.tax, total: sale.total,
    });
    assert.equal(sale.status, "Lunas");
    assert.ok(sale.cashReceived >= sale.total);
  }
  assert.equal(dates.size, 90);
  assert.equal([...dates.keys()][0], "2026-07-21");
  assert.equal([...dates.keys()].at(-1), DEMO_DATE);
  assert.equal(dates.get(DEMO_DATE), 86);
  for (const [date, count] of dates) if (date !== DEMO_DATE) assert.ok(count >= 15 && count <= 30);
  assert.equal(new Set(seed.sales.map((sale) => sale.id)).size, seed.sales.length);
  assert.deepEqual(seed.business, {
    name: "Kopi Senja", owner: "Raka", outlet: "Bandung, Dago", taxRate: 10,
    receiptFooter: "Terima kasih sudah jadi bagian cerita kami.\nSampai jumpa di cangkir berikutnya.",
  });
  assert.equal(seed.dayTarget, 3500000);
  assert.equal(seed.version, 1);
  assert.ok(seed.expenses.length >= 90);
  assert.ok(seed.expenses.every((expense) => expense.amount > 0 && Number.isFinite(Date.parse(expense.createdAt))));
  const independent = createInitialState();
  independent.sales[0].items[0].quantity = 999;
  independent.customers[0].name = "Changed";
  independent.business.name = "Changed";
  assert.notDeepEqual(independent.sales[0], seed.sales[0]);
  assert.notEqual(independent.customers[0].name, seed.customers[0].name);
  assert.equal(seed.business.name, "Kopi Senja");
});

test("seed customer visits, spending and points reconcile to sale history", () => {
  assert.equal(seed.customers.length, 12);
  for (const customer of seed.customers) {
    const sales = seed.sales.filter((sale) => sale.customerName === customer.name);
    assert.ok(sales.length > 0);
    assert.equal(customer.visits, sales.length);
    assert.equal(customer.totalSpent, sales.reduce((sum, sale) => sum + sale.total, 0));
    assert.equal(customer.points, sales.reduce((sum, sale) => sum + Math.floor(sale.total / 1000), 0));
    assert.equal(customer.lastVisit, sales.at(-1)?.createdAt);
    assert.match(customer.phone, /^\+?\d{8,15}$/);
  }
  assert.ok(seed.customers.some((customer) => customer.segment === "Hilang"));
  assert.ok(seed.customers.some((customer) => customer.segment === "Berisiko"));
});

test("seed opening stock is the remaining snapshot, not deducted historical sales", () => {
  assert.equal(seed.stockMovements.length, 0);
  assert.equal(getStock(seed, "milk"), 1200);
  for (const item of inventory) assert.equal(getStock(seed, item.id), item.openingStock);
  assert.throws(() => getStock(seed, "missing"), /Bahan tidak dikenal/);
});

test("currency uses Indonesian whole rupiah formatting", () => {
  assert.equal(currency(25000).replace(/\s/g, ""), "Rp25.000");
  assert.equal(currency(1234.6).replace(/\s/g, ""), "Rp1.235");
  assert.equal(currency(0).replace(/\s/g, ""), "Rp0");
});

test("cart sums rupiah, rounds discount, taxes after discount and permits an empty display", () => {
  assert.deepEqual(getCartTotal([{ productId: "kopi-susu", quantity: 2 }, { productId: "croissant", quantity: 1 }], 2500.4, true), {
    subtotal: 72000, discount: 2500, tax: 6950, total: 76450,
  });
  assert.deepEqual(getCartTotal(oneCoffee), { subtotal: 25000, discount: 0, tax: 0, total: 25000 });
  assert.deepEqual(getCartTotal(oneCoffee, 25000, true), { subtotal: 25000, discount: 25000, tax: 0, total: 0 });
  assert.deepEqual(getCartTotal([], 0, true), { subtotal: 0, discount: 0, tax: 0, total: 0 });
});

test("custom restaurant catalogs drive totals, sales and stock without demo products", () => {
  const state: BusinessState = {
    ...emptyState(),
    inventory: [{ id: "nasi", name: "Nasi matang", unit: "porsi", openingStock: 20, reorderPoint: 5, cost: 4000, supplier: "Dapur sendiri" }],
    products: [{ id: "nasi-ayam", name: "Nasi Ayam Sambal Matah", category: "Makanan", price: 32000, cost: 8000, sold: 0, image: "", recipe: [{ itemId: "nasi", quantity: 1 }] }],
  };
  const items = [{ productId: "nasi-ayam", quantity: 2 }];
  assert.deepEqual(getCartTotal(items, 0, false, state.products), { subtotal: 64000, discount: 0, tax: 0, total: 64000 });
  const result = completeSale(freezeDeep(state), { items, payment: "QRIS", cashReceived: 0 });
  assert.equal(result.sale.total, 64000);
  assert.equal(getStock(result.state, "nasi"), 18);
  assert.throws(() => getCartTotal(oneCoffee, 0, false, state.products), /Menu tidak dikenal/);
  assert.throws(() => recordPurchase(state, { itemId: "milk", quantity: 1, total: 1000 }), /Bahan tidak dikenal/);
});

test("sale aggregates shared recipes and duplicate lines into one atomic movement per ingredient", () => {
  const state = freezeDeep(emptyState());
  const items: CartItem[] = [
    { productId: "kopi-susu", quantity: 2, note: "less sugar" },
    { productId: "kopi-susu", quantity: 1 }, { productId: "cappuccino", quantity: 3 },
    { productId: "matcha", quantity: 1 }, { productId: "croissant", quantity: 2 },
    { productId: "pain-chocolat", quantity: 1 },
  ];
  freezeDeep(items);
  const before = JSON.stringify(state);
  const result = completeSale(state, { items, payment: "QRIS", cashReceived: 0, channel: "Etalase", discount: 1000, taxEnabled: true });
  assert.equal(JSON.stringify(state), before);
  assert.notEqual(result.state, state);
  assert.equal(result.state.sales.length, 1);
  assert.strictEqual(result.state.sales[0], result.sale);
  assert.equal(result.sale.channel, "Etalase");
  assert.equal(result.sale.status, "Lunas");
  assert.match(result.sale.createdAt, new RegExp(`^${DEMO_DATE}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}\\+07:00$`));
  assert.equal(result.sale.cashReceived, result.sale.total);
  assert.equal(result.state.stockMovements.length, 6);
  for (const [id, used] of [["milk", 1080], ["beans", 108], ["syrup", 70], ["cups", 7], ["matcha-powder", 4], ["pastry", 3]] as const) {
    assert.equal(getStock(result.state, id), getStock(state, id) - used);
    const movements = result.state.stockMovements.filter((movement) => movement.itemId === id);
    assert.equal(movements.length, 1);
    assert.equal(movements[0].quantity, -used);
    assert.equal(movements[0].type, "sale");
    assert.equal(movements[0].reference, result.sale.id);
    assert.equal(movements[0].createdAt, result.sale.createdAt);
  }
  assert.equal(result.sale.items[0].note, "less sugar");
  assert.notEqual(result.sale.items[0], items[0]);
});

test("sale copies input items and survives JSON persistence", () => {
  const items: CartItem[] = [{ productId: "kopi-susu", quantity: 1, note: "tanpa gula" }];
  const result = completeSale(emptyState(), { ...cashInput, items });
  items[0].quantity = 100;
  items[0].note = "changed";
  items.push({ productId: "tea", quantity: 5 });
  assert.deepEqual(result.sale.items, [{ productId: "kopi-susu", quantity: 1, note: "tanpa gula" }]);
  const persisted: BusinessState = JSON.parse(JSON.stringify(result.state));
  assert.equal(getStock(persisted, "milk"), 1050);
  const next = completeSale(freezeDeep(persisted), cashInput);
  assert.equal(getStock(next.state, "milk"), 900);
  assert.equal(next.state.sales.length, 2);
  assert.notEqual(next.sale.id, result.sale.id);
  assert.equal(new Set(next.state.stockMovements.map((entry) => entry.id)).size, 8);
});

test("shared stock shortage rejects the entire cart even when each line could pass alone", () => {
  const state = freezeDeep(emptyState());
  const snapshot = JSON.stringify(state);
  assert.throws(() => completeSale(state, {
    payment: "QRIS", cashReceived: 0, customerPhone: "081234567890", customerName: "Nadia",
    items: [{ productId: "kopi-susu", quantity: 5 }, { productId: "cappuccino", quantity: 4 }],
  }), /Stok Susu segar tidak cukup.*1350/);
  assert.equal(JSON.stringify(state), snapshot);
  assert.equal(state.customers.length, 0);
});

test("duplicate pastry lines share one stock bucket and cannot oversell", () => {
  const state = freezeDeep(emptyState());
  assert.throws(() => completeSale(state, { payment: "Transfer", cashReceived: 0, items: [
    { productId: "croissant", quantity: 22 }, { productId: "pain-chocolat", quantity: 21 },
  ] }), /Stok Pastry aneka rasa tidak cukup/);
  assert.equal(getStock(state, "pastry"), 42);
});

test("exact remaining stock can be sold; a purchase then replenishes the same ledger", () => {
  const result = completeSale(emptyState(), { ...cashInput, payment: "QRIS", items: [{ productId: "kopi-susu", quantity: 8 }] });
  assert.equal(getStock(result.state, "milk"), 0);
  assert.throws(() => completeSale(result.state, cashInput), /Stok Susu segar tidak cukup/);
  const restocked = recordPurchase(result.state, { itemId: "milk", quantity: 300, total: 6600 });
  const sold = completeSale(restocked, cashInput);
  assert.equal(getStock(sold.state, "milk"), 150);
  assert.equal(getStock(result.state, "milk"), 0);
});

test("insufficient cash rejects without ledger, sale or customer mutation", () => {
  const state = freezeDeep(emptyState());
  assert.throws(() => completeSale(state, { ...cashInput, cashReceived: 24999, customerPhone: "081234567890" }), /Uang tunai tidak cukup/);
  assert.deepEqual(state, emptyState());
  assert.equal(completeSale(state, { ...cashInput, cashReceived: 25000 }).sale.cashReceived, 25000);
  assert.equal(completeSale(state, { ...cashInput, cashReceived: 50000.4 }).sale.cashReceived, 50000);
});

for (const quantity of [0, -1, 0.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, "2" as unknown as number]) {
  test(`unsafe cart quantity ${String(quantity)} is rejected`, () => {
    const state = freezeDeep(emptyState());
    const items = [{ productId: "kopi-susu", quantity }];
    assert.throws(() => getCartTotal(items), /Jumlah menu/);
    assert.throws(() => completeSale(state, { ...cashInput, items }), /Jumlah menu/);
    assert.deepEqual(state, emptyState());
  });
}

test("unknown menu, empty cart and overflowing totals are rejected", () => {
  assert.throws(() => completeSale(emptyState(), { ...cashInput, items: [] }), /Keranjang tidak boleh kosong/);
  assert.throws(() => getCartTotal([{ productId: "pizza", quantity: 1 }]), /Menu tidak dikenal/);
  assert.throws(() => completeSale(emptyState(), { ...cashInput, items: [{ productId: "pizza", quantity: 1 }] }), /Menu tidak dikenal/);
  assert.throws(() => getCartTotal([{ productId: "kopi-susu", quantity: Number.MAX_SAFE_INTEGER }]), /Subtotal/);
});

for (const discount of [-1, NaN, Infinity, 25001, 25000.1]) {
  test(`invalid discount ${String(discount)} is rejected atomically`, () => {
    const state = freezeDeep(emptyState());
    assert.throws(() => getCartTotal(oneCoffee, discount), /Diskon/);
    assert.throws(() => completeSale(state, { ...cashInput, discount }), /Diskon/);
    assert.deepEqual(state, emptyState());
  });
}

test("invalid payment, channel and cash are rejected", () => {
  assert.throws(() => completeSale(emptyState(), { ...cashInput, payment: "Bitcoin" as Sale["payment"] }), /Metode pembayaran/);
  assert.throws(() => completeSale(emptyState(), { ...cashInput, channel: "unknown" as Sale["channel"] }), /Kanal penjualan/);
  for (const cashReceived of [-1, NaN, Infinity]) {
    assert.throws(() => completeSale(emptyState(), { ...cashInput, cashReceived }), /Uang diterima/);
  }
});

test("idempotency retries return the same state and sale even after persistence", () => {
  const result = completeSale(emptyState(), { ...cashInput, idempotencyKey: "checkout / #1", customerPhone: "081234567890" });
  const retry = completeSale(result.state, { ...cashInput, idempotencyKey: "checkout / #1" });
  assert.strictEqual(retry.state, result.state);
  assert.strictEqual(retry.sale, result.sale);
  const persisted: BusinessState = freezeDeep(JSON.parse(JSON.stringify(result.state)));
  const persistedRetry = completeSale(persisted, { ...cashInput, items: [], idempotencyKey: "checkout / #1" });
  assert.strictEqual(persistedRetry.state, persisted);
  assert.strictEqual(persistedRetry.sale, persisted.sales[0]);
  assert.equal(persistedRetry.state.customers[0].visits, 1);
  assert.equal(getStock(persistedRetry.state, "milk"), 1050);
  const different = completeSale(persisted, { ...cashInput, idempotencyKey: "checkout %2F #1" });
  assert.notEqual(different.sale.id, result.sale.id);
  assert.equal(different.state.sales.length, 2);
  assert.throws(() => completeSale(persisted, { ...cashInput, idempotencyKey: " " }), /Kunci transaksi/);
});

test("purchase appends an immutable purchase and linked positive movement, preserving decimals", () => {
  const state = freezeDeep(emptyState());
  const result = recordPurchase(state, { itemId: "milk", quantity: 1000.5, total: 22011.6 });
  assert.equal(result.purchases.length, 1);
  assert.equal(result.purchases[0].total, 22012);
  assert.equal(getStock(result, "milk"), 2200.5);
  assert.equal(result.stockMovements[0].quantity, 1000.5);
  assert.equal(result.stockMovements[0].type, "purchase");
  assert.equal(result.stockMovements[0].reference, result.purchases[0].id);
  assert.equal(result.stockMovements[0].createdAt.slice(0, 10), DEMO_DATE);
  assert.deepEqual(state, emptyState());
  const persisted: BusinessState = JSON.parse(JSON.stringify(result));
  const second = recordPurchase(persisted, { itemId: "milk", quantity: 250, total: 5500 });
  assert.equal(getStock(second, "milk"), 2450.5);
  assert.notEqual(second.purchases[0].id, second.purchases[1].id);
  assert.strictEqual(second.sales, persisted.sales);
});

test("custom purchases update moving-average cost and every dependent recipe HPP", () => {
  const state: BusinessState = {
    ...emptyState(),
    inventory: [{ id: "tepung", name: "Tepung protein tinggi", unit: "g", openingStock: 1000, reorderPoint: 200, cost: 20, supplier: "Supplier Roti" }],
    products: [
      { id: "roti-tawar", name: "Roti Tawar", category: "Roti", price: 25000, cost: 10000, sold: 0, image: "", recipe: [{ itemId: "tepung", quantity: 500 }] },
      { id: "bolu", name: "Bolu Pandan", category: "Kue", price: 30000, cost: 6000, sold: 0, image: "", recipe: [{ itemId: "tepung", quantity: 300 }] },
    ],
  };
  const result = recordPurchase(freezeDeep(state), { itemId: "tepung", quantity: 1000, total: 40000 });
  assert.equal(getStock(result, "tepung"), 2000);
  assert.equal(result.inventory?.[0].cost, 30);
  assert.deepEqual(result.products?.map((product) => product.cost), [15000, 9000]);
  assert.equal(state.inventory?.[0].cost, 20);
  assert.deepEqual(state.products?.map((product) => product.cost), [10000, 6000]);
});

test("invalid purchases cannot change either ledger", () => {
  const state = freezeDeep(emptyState());
  for (const value of [0, -1, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => recordPurchase(state, { itemId: "milk", quantity: value, total: 1000 }), /Jumlah pembelian/);
    assert.throws(() => recordPurchase(state, { itemId: "milk", quantity: 10, total: value }), /Total pembelian/);
  }
  assert.throws(() => recordPurchase(state, { itemId: "missing", quantity: 1, total: 1 }), /Bahan tidak dikenal/);
  assert.deepEqual(state, emptyState());
});

test("getStock applies signed adjustments and ignores other ingredients", () => {
  const state = emptyState();
  state.stockMovements = [
    { id: "m1", itemId: "milk", quantity: 100, type: "adjustment", reference: "count", createdAt: DEMO_DATE },
    { id: "m2", itemId: "milk", quantity: -50, type: "adjustment", reference: "waste", createdAt: DEMO_DATE },
    { id: "m3", itemId: "cups", quantity: -10, type: "sale", reference: "sale", createdAt: DEMO_DATE },
  ];
  assert.equal(getStock(state, "milk"), 1250);
  assert.equal(getStock(state, "cups"), 230);
});

test("a customer is created only with a valid phone; matching phone updates loyalty immutably", () => {
  const namedOnly = completeSale(emptyState(), { ...cashInput, customerName: "Nadia" });
  assert.equal(namedOnly.state.customers.length, 0);
  assert.equal(namedOnly.sale.customerName, "Nadia");
  const first = completeSale(emptyState(), { ...cashInput, customerName: " Nadia ", customerPhone: "+6281234567890" });
  assert.equal(first.state.customers.length, 1);
  assert.equal(first.state.customers[0].visits, 1);
  assert.equal(first.state.customers[0].totalSpent, 25000);
  assert.equal(first.state.customers[0].points, 25);
  assert.equal(first.state.customers[0].segment, "Potensial");
  const second = completeSale(freezeDeep(first.state), { ...cashInput, customerPhone: "6281234567890", discount: 1000, taxEnabled: true });
  assert.equal(second.state.customers.length, 1);
  assert.equal(second.sale.customerName, "Nadia");
  assert.equal(second.state.customers[0].id, first.state.customers[0].id);
  assert.equal(second.state.customers[0].visits, 2);
  assert.equal(second.state.customers[0].totalSpent, 51400);
  assert.equal(second.state.customers[0].points, 51);
  assert.equal(second.state.customers[0].lastVisit, second.sale.createdAt);
  assert.equal(first.state.customers[0].visits, 1);
  const third = completeSale(second.state, { ...cashInput, customerName: "Nadia", customerPhone: "081234567891" });
  assert.equal(third.state.customers.length, 2, "names must not merge distinct phone numbers");
});

for (const phone of ["", "1234567", "1234567890123456", "++628123456789", "0812-345-678", "0812 345 678", "abcdefgh", "1e12345678", "+1234567"]) {
  test(`invalid phone ${JSON.stringify(phone)} rejects the entire sale`, () => {
    const state = freezeDeep(emptyState());
    assert.throws(() => completeSale(state, { ...cashInput, customerPhone: phone }), /Nomor telepon/);
    assert.deepEqual(state, emptyState());
  });
}

test("phone boundaries accept 8–15 digits with an optional plus", () => {
  for (const phone of ["12345678", "+12345678", "123456789012345", "+123456789012345"]) {
    const { state, sale } = completeSale(emptyState(), { ...cashInput, customerPhone: phone });
    assert.equal(state.customers[0].phone, phone);
    assert.equal(sale.customerName, "Pelanggan baru");
  }
});

test("returning inactive customers become active again without changing the old record", () => {
  const state = emptyState();
  state.customers = [{ id: "customer-1", name: "Nadia", phone: "081234567890", visits: 19, totalSpent: 475000, points: 475, lastVisit: "2026-07-21T10:00:00+07:00", segment: "Hilang" }];
  freezeDeep(state);
  const result = completeSale(state, { ...cashInput, customerPhone: "081234567890", customerName: "Nadia Putri" });
  assert.equal(result.state.customers[0].segment, "Juara");
  assert.equal(result.state.customers[0].name, "Nadia Putri");
  assert.equal(state.customers[0].segment, "Hilang");
});

test("Indonesian demo order recognizes aliases, number words, notes and QRIS", () => {
  assert.deepEqual(parseOrder("Tolong pesan dua es kopsu less sugar dan satu croissant. Bayar QRIS"), {
    items: [{ productId: "kopi-susu", quantity: 2, note: "less sugar" }, { productId: "croissant", quantity: 1 }], payment: "QRIS", unknown: [],
  });
  assert.deepEqual(parseOrder("2 es kopi susu kurang gula, 1 matcha latte; bayar dengan transfer"), {
    items: [{ productId: "kopi-susu", quantity: 2, note: "less sugar" }, { productId: "matcha", quantity: 1 }], payment: "Transfer", unknown: [],
  });
  assert.deepEqual(parseOrder("Saya mau pesan satu cup americano, croissant 2 pakai tunai"), {
    items: [{ productId: "americano", quantity: 1 }, { productId: "croissant", quantity: 2 }], payment: "Tunai", unknown: [],
  });
});

test("Indonesian number words one through ten map to positive quantities", () => {
  const words = ["satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan", "sepuluh"];
  for (const [index, word] of words.entries()) {
    const result = parseOrder(`${word} es kopi susu`);
    assert.deepEqual(result.items, [{ productId: "kopi-susu", quantity: index + 1 }]);
    assert.deepEqual(result.unknown, []);
  }
});

test("parser supports all nine menu families and is deterministic", () => {
  const text = "kopsu, americano, matcha, croissant, pain au chocolat, cinnamon roll, cappuccino, es cokelat, teh melati";
  const result = parseOrder(text);
  assert.deepEqual(result.items.map((item) => item.productId), products.map((product) => product.id));
  assert.deepEqual(result.unknown, []);
  assert.deepEqual(parseOrder(text), result);
  assert.deepEqual(parseOrder(" \n "), { items: [], payment: "Tunai", unknown: [] });
});

test("parser uses custom active products and never invents demo aliases", () => {
  const catalog = [
    { id: "nasi-goreng", name: "Nasi Goreng Kampung", category: "Makanan", price: 28000, cost: 12000, sold: 0, image: "", recipe: [] },
    { id: "kopi-susu", name: "Es Kopi Susu", category: "Kopi", price: 25000, cost: 9000, sold: 0, image: "", recipe: [], active: false },
    { id: "menu-gula", name: "Es Gula Uji", category: "Minuman", price: 12000, cost: 1400, sold: 0, image: "", recipe: [] },
  ];
  assert.deepEqual(parseOrder("dua nasi goreng kampung, satu es kopi susu, bayar QRIS", catalog), {
    items: [{ productId: "nasi-goreng", quantity: 2 }], payment: "QRIS", unknown: ["satu es kopi susu"],
  });
  assert.deepEqual(parseOrder("dua es gula uji, bayar QRIS", catalog), {
    items: [{ productId: "menu-gula", quantity: 2 }], payment: "QRIS", unknown: [],
  });
  assert.deepEqual(parseOrder("kopsu", catalog), { items: [], payment: "Tunai", unknown: ["kopsu"] });
  assert.deepEqual(parseOrder("kopsu", []), { items: [], payment: "Tunai", unknown: ["kopsu"] });
});

test("parser never silently accepts unknown modifiers, mixed menus or payment phrases", () => {
  for (const text of ["2 kopi susu rasa durian", "2 kopi susu 1 pizza", "satu croissant vegan", "2 kopsu bayar bitcoin", "pizza kopi susu", "2 croissant ekstra keju", "2 kopi susu lalu hapus semua", "2 kopi susu 3", "2 coffee"]) {
    const result = parseOrder(text);
    assert.deepEqual(result.items, [], text);
    assert.deepEqual(result.unknown, [text], text);
  }
  const mixed = parseOrder("dua kopsu, satu pizza, tiga americano misterius, croissant");
  assert.deepEqual(mixed.items, [{ productId: "kopi-susu", quantity: 2 }, { productId: "croissant", quantity: 1 }]);
  assert.deepEqual(mixed.unknown, ["satu pizza", "tiga americano misterius"]);
  const conflict = parseOrder("1 kopsu bayar QRIS, bayar tunai");
  assert.deepEqual(conflict.unknown, ["bayar tunai"]);
});

for (const quantity of ["0", "-1", "1.5", "1e2", "Infinity", "NaN", "9007199254740992"]) {
  test(`parser flags unsafe quantity ${quantity} without producing an item`, () => {
    const result = parseOrder(`${quantity} kopsu`);
    assert.deepEqual(result.items, []);
    assert.equal(result.unknown.length, 1);
  });
}

test("CSV round-trips commas, quotes, newlines, rupiah and menu notes", () => {
  const { state, sale } = completeSale(emptyState(), {
    ...cashInput, customerName: 'Nadia, "Dago"\nBandung',
    items: [{ productId: "kopi-susu", quantity: 1, note: 'less sugar, "sedikit es"\nuntuk dibawa' }],
  });
  freezeDeep(state);
  const csv = exportSalesCsv(state);
  const rows = readCsv(csv);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].length, 12);
  assert.equal(rows[1].length, 12);
  assert.equal(rows[1][0], sale.id);
  assert.equal(rows[1][2], sale.customerName);
  assert.equal(rows[1][3], '1× Es Kopi Susu (less sugar, "sedikit es"\nuntuk dibawa)');
  assert.equal(rows[1][7], "25000");
  assert.ok(csv.includes('""Dago""'));
  assert.ok(csv.includes("\r\n"));
  assert.equal(readCsv(exportSalesCsv(emptyState())).length, 1);
});

test("CSV neutralizes spreadsheet formula injection including leading control characters", () => {
  const { sale } = completeSale(emptyState(), cashInput);
  const values = ['=HYPERLINK("https://example.invalid","click")', "+SUM(1,2)", "-1+2", "@SUM(A1:A9)", "  =1+1", "\t=1+1", "\r=1+1", "\n=1+1", "\u0000=1+1", "\u200b=1+1", "\tNadia"];
  const state = emptyState();
  state.sales = values.map((value, index) => ({ ...sale, id: `=ID${index}`, customerName: value }));
  const rows = readCsv(exportSalesCsv(state));
  for (const [index, value] of values.entries()) {
    assert.equal(rows[index + 1][0], `'=ID${index}`);
    assert.equal(rows[index + 1][2], `'${value}`);
    assert.equal(rows[index + 1][7], "25000");
  }
});

test("full seeded CSV exports one escaped row per sale and remains read-only", () => {
  const before = JSON.stringify(seed);
  const rows = readCsv(exportSalesCsv(seed));
  assert.equal(rows.length, seed.sales.length + 1);
  assert.ok(rows.every((row) => row.length === 12));
  assert.equal(JSON.stringify(seed), before);
});

// ---------------------------------------------------------------------------
// Correction helpers: soft deletes and edits (migration 0007)
// ---------------------------------------------------------------------------

test("deleteProduct removes the product and returns a new state", () => {
  const state = emptyState();
  state.products = [...products];
  const after = deleteProduct(state, "kopi-susu");
  assert.equal(after.products!.length, products.length - 1);
  assert.ok(!after.products!.some((p) => p.id === "kopi-susu"));
  // Original state unchanged (immutability).
  assert.equal(state.products.length, products.length);
});

test("deleteProduct throws for a missing product", () => {
  assert.throws(() => deleteProduct(emptyState(), "nonexistent"), /Menu tidak ditemukan/);
});

test("deleteInventoryItem removes the item and returns a new state", () => {
  const state = emptyState();
  // Use tea since nothing in the default catalog depends solely on it for the first recipe line.
  state.inventory = [...inventory];
  state.products = products.filter((p) => !p.recipe.some((r) => r.itemId === "tea"));
  const before = state.inventory.length;
  const after = deleteInventoryItem(state, "tea");
  assert.equal(after.inventory!.length, before - 1);
  assert.ok(!after.inventory!.some((i) => i.id === "tea"));
});

test("deleteInventoryItem throws when a product depends on it", () => {
  const state = emptyState();
  state.products = [...products];
  state.inventory = [...inventory];
  // beans is used by kopi-susu, americano, cappuccino
  assert.throws(() => deleteInventoryItem(state, "beans"), /masih dipakai resep/);
});

test("deleteInventoryItem throws for a missing item", () => {
  assert.throws(() => deleteInventoryItem(emptyState(), "nonexistent"), /Bahan tidak ditemukan/);
});

test("deleteCustomer removes by id", () => {
  const state = emptyState();
  state.customers = [
    { id: "c1", name: "A", phone: "081200000001", visits: 1, totalSpent: 10000, lastVisit: "", segment: "Potensial", points: 10 },
    { id: "c2", name: "B", phone: "081200000002", visits: 2, totalSpent: 20000, lastVisit: "", segment: "Setia", points: 20 },
  ];
  const after = deleteCustomer(state, "c1");
  assert.equal(after.customers.length, 1);
  assert.equal(after.customers[0].id, "c2");
  // Original unchanged.
  assert.equal(state.customers.length, 2);
});

test("deleteCustomer throws for a missing customer", () => {
  assert.throws(() => deleteCustomer(emptyState(), "nonexistent"), /Pelanggan tidak ditemukan/);
});

test("deleteExpense removes by id", () => {
  const state = emptyState();
  state.expenses = [
    { id: "e1", description: "Bahan", category: "Bahan baku", amount: 100000, createdAt: "2026-10-18T07:00:00+07:00" },
    { id: "e2", description: "Sewa", category: "Sewa", amount: 3500000, createdAt: "2026-10-18T07:00:00+07:00" },
  ];
  const after = deleteExpense(state, "e1");
  assert.equal(after.expenses.length, 1);
  assert.equal(after.expenses[0].id, "e2");
});

test("deleteExpense throws for a missing expense", () => {
  assert.throws(() => deleteExpense(emptyState(), "nonexistent"), /Pengeluaran tidak ditemukan/);
});

test("updateCustomer edits name and phone immutably", () => {
  const state = emptyState();
  state.customers = [
    { id: "c1", name: "Old Name", phone: "081200000001", visits: 5, totalSpent: 50000, lastVisit: "", segment: "Setia", points: 50 },
    { id: "c2", name: "Other", phone: "081200000009", visits: 1, totalSpent: 10000, lastVisit: "", segment: "Potensial", points: 10 },
  ];
  const after = updateCustomer(state, { customerId: "c1", name: "  New Name  ", phone: "081299990001" });
  assert.equal(after.customers[0].name, "New Name");
  assert.equal(after.customers[0].phone, "081299990001");
  // Other fields preserved.
  assert.equal(after.customers[0].visits, 5);
  // Second customer unchanged.
  assert.equal(after.customers[1].name, "Other");
  // Original state unchanged.
  assert.equal(state.customers[0].name, "Old Name");
});

test("updateCustomer rejects empty name", () => {
  const state = emptyState();
  state.customers = [{ id: "c1", name: "A", phone: "081200000001", visits: 0, totalSpent: 0, lastVisit: "", segment: "Potensial", points: 0 }];
  assert.throws(() => updateCustomer(state, { customerId: "c1", name: "  ", phone: "081200000001" }), /Isi nama/);
});

test("updateCustomer rejects invalid phone", () => {
  const state = emptyState();
  state.customers = [{ id: "c1", name: "A", phone: "081200000001", visits: 0, totalSpent: 0, lastVisit: "", segment: "Potensial", points: 0 }];
  assert.throws(() => updateCustomer(state, { customerId: "c1", name: "A", phone: "123" }), /telepon/);
});

test("updateCustomer rejects duplicate phone across customers", () => {
  const state = emptyState();
  state.customers = [
    { id: "c1", name: "A", phone: "081200000001", visits: 0, totalSpent: 0, lastVisit: "", segment: "Potensial", points: 0 },
    { id: "c2", name: "B", phone: "081200000002", visits: 0, totalSpent: 0, lastVisit: "", segment: "Potensial", points: 0 },
  ];
  assert.throws(() => updateCustomer(state, { customerId: "c1", name: "A", phone: "081200000002" }), /sudah terdaftar/);
});

test("updateCustomer throws for a missing customer", () => {
  assert.throws(() => updateCustomer(emptyState(), { customerId: "nope", name: "X", phone: "081200000001" }), /Pelanggan tidak ditemukan/);
});

// ---------------------------------------------------------------------------
// Configurable tax rate (migration 0008)
// ---------------------------------------------------------------------------

test("getCartTotal applies a custom tax rate", () => {
  // 11% PPN instead of default 10% PBJT
  const result = getCartTotal(oneCoffee, 0, true, products, 11);
  assert.equal(result.subtotal, 25000);
  assert.equal(result.tax, Math.round(25000 * 11 / 100));
  assert.equal(result.total, 25000 + result.tax);
});

test("getCartTotal with zero tax rate effectively disables tax", () => {
  const result = getCartTotal(oneCoffee, 0, true, products, 0);
  assert.equal(result.tax, 0);
  assert.equal(result.total, 25000);
});

test("completeSale uses the business taxRate from state", () => {
  const state = emptyState();
  state.business.taxRate = 15;
  const { sale } = completeSale(state, { items: oneCoffee, payment: "Tunai", cashReceived: 50000, taxEnabled: true });
  assert.equal(sale.tax, Math.round(25000 * 15 / 100));
  assert.equal(sale.total, 25000 + sale.tax);
});
