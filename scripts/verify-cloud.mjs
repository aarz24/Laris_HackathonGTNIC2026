// Explicit, bounded cloud integration test. Default execution prints its plan only.
// Never import seed.ts or rls.test.ts: their identity helpers can reset passwords.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const projectRef = 'fkzlldlewkdvbovcndso';
const slugs = ['laris-qa-20261105', 'laris-qa-iso-20261105'];
const privateFile = '.env.cloud-qa.json';
const output = 'docs/hackathon/cloud-verification-evidence';
const plan = {
  projectRef, slugs, newFictionalAccounts: 5, financialRecords: 6,
  existingDataChanges: 0, invitations: 0, emails: 0, passwordResets: 0,
  behavior: 'Stop on any existing manifest or workspace collision; preserve fixtures for inspection.',
  execute: `node scripts/verify-cloud.mjs --execute --approve-project=${projectRef} --approve-slugs=${slugs.join(',')}`,
};
const args = new Set(process.argv.slice(2));
if (!args.has('--execute')) { console.log(JSON.stringify(plan, null, 2)); process.exit(0); }
assert.ok(args.has(`--approve-project=${projectRef}`), 'Explicit project designation required');
assert.ok(args.has(`--approve-slugs=${slugs.join(',')}`), 'Explicit fictional workspace designation required');
try { await access(privateFile); throw Error('Private fixture manifest already exists. Inspect and resume deliberately; no automatic reprovision/reset.'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const require = createRequire(import.meta.url);
require('@next/env').loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
assert.equal(new URL(url).hostname, `${projectRef}.supabase.co`, 'Wrong Supabase project');
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
assert.ok(publicKey && process.env.SUPABASE_SERVICE_ROLE_KEY, 'Required environment configuration missing');
const options = { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(20000) }) } };
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, options);
const clients = new Map();
const evidence = { date: new Date().toISOString(), projectRef, slugs, status: 'running', checks: [], accountsCreated: 0, workspacesCreated: 0, financialRecordsCreated: 0, emailsSent: 0, passwordResets: 0 };
const runId = randomBytes(6).toString('hex');
const manifest = { schemaVersion: 1, projectRef, slugs, runId, status: 'provisioning', phase: 'collision check', users: [], workspaces: { a: { slug: slugs[0] }, b: { slug: slugs[1] } }, recordIds: { sales: [], purchases: [] } };
let manifestCreated = false;
function check(name, details = {}) { evidence.checks.push({ name, pass: true, ...details }); console.log(`PASS ${name}`); }
function dataOf(result, label) { if (result.error) { const error = Error(`${label} failed`); error.code = result.error.code || result.error.status || 'unknown'; throw error; } return result.data; }
async function save() { await writeFile(privateFile, JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 }); }
async function phase(name) { manifest.phase = name; if (manifestCreated) await save(); }
async function login(user) {
  const client = createClient(url, publicKey, options);
  const result = await client.auth.signInWithPassword({ email: user.email, password: user.password });
  const data = dataOf(result, 'fictional account login');
  assert.equal(data.user.id, user.userId);
  clients.set(user.key, client);
  return client;
}
async function rows(client, table, businessId, columns = '*') {
  return dataOf(await client.from(table).select(columns).eq('business_id', businessId).order(table === 'membership' ? 'user_id' : 'id'), `${table} fixture read`);
}
const ledgerTables = ['sales_order', 'order_item', 'payment', 'stock_movement', 'purchase', 'purchase_line', 'inventory_item', 'product', 'product_variant', 'recipe_line', 'customer', 'expense', 'membership'];
async function snapshot(businessId) { const entries = await Promise.all(ledgerTables.map(async table => [table, await rows(admin, table, businessId)])); return Object.fromEntries(entries); }
async function denied(name, call, businessId, allowedCodes = ['42501']) {
  const before = await snapshot(businessId);
  const result = await call();
  assert.ok(result.error, 'Expected database rejection');
  assert.ok(allowedCodes.includes(result.error.code), `Unexpected rejection code ${result.error.code}`);
  assert.deepEqual(await snapshot(businessId), before, 'Rejected operation changed fixture records');
  check(name, { rejectionCode: result.error.code, persistedState: 'unchanged' });
}
const recipe = [{ code: 'qa-coffee', quantity: 20 }, { code: 'qa-milk', quantity: 100 }];
const fixture = {
  p_owner_name: 'Fictional QA Owner', p_outlet_name: 'QA only', p_kind: 'coffee', p_day_target: 1000000,
  p_inventory: [
    { code: 'qa-coffee', name: 'QA Coffee', unit: 'g', cost: 100, reorder_point: 100, opening_stock: 1000 },
    { code: 'qa-milk', name: 'QA Milk', unit: 'ml', cost: 20, reorder_point: 200, opening_stock: 2000 },
  ],
  p_products: [{ code: 'qa-kopi', name: 'QA Kopi', category: 'Kopi', price: 25000, image: '/images/kopi-susu.webp', recipe }],
};
const sale = businessId => ({ p_business_id: businessId, p_items: [{ code: 'qa-kopi', quantity: 1 }], p_payment: 'tunai', p_cash_received: 50000, p_tax_enabled: false, p_idempotency_key: `qa-${runId}-sale` });
const purchase = businessId => ({ p_business_id: businessId, p_lines: [{ code: 'qa-coffee', quantity: 100, total: 15000 }], p_source: 'manual', p_idempotency_key: `qa-${runId}-purchase` });
const product = businessId => ({ p_business_id: businessId, p_code: 'qa-kopi', p_name: 'QA Kopi', p_category: 'Kopi', p_price: 30000, p_image_url: '/images/kopi-susu.webp', p_active: true, p_recipe: [{ code: 'qa-coffee', quantity: 25 }, { code: 'qa-milk', quantity: 100 }] });
function stock(snapshotValue, code) { const id = snapshotValue.inventory_item.find(item => item.code === code).id; return snapshotValue.stock_movement.filter(line => line.inventory_item_id === id).reduce((sum, line) => sum + Number(line.qty_delta), 0); }
try {
  const existing = dataOf(await admin.from('business').select('id').in('slug', slugs), 'workspace collision check');
  assert.equal(existing.length, 0, 'A designated workspace already exists; stopped without changes');
  await mkdir(output, { recursive: true });
  await writeFile(privateFile, JSON.stringify(manifest, null, 2), { flag: 'wx', mode: 0o600 }); manifestCreated = true;
  await phase('create new fictional accounts');
  for (const [workspace, role] of [['a','owner'],['a','manager'],['a','kasir'],['a','dapur'],['b','owner']]) {
    const key = `${workspace}-${role}`;
    const user = { key, workspace, role, email: `${key}-${runId}@laris-qa.invalid`, password: randomBytes(24).toString('base64url') + '!aA4', userId: null };
    manifest.users.push(user); await save();
    const result = await admin.auth.admin.createUser({ email: user.email, password: user.password, email_confirm: true, user_metadata: { full_name: `Fictional QA ${workspace.toUpperCase()} ${role}` } });
    user.userId = dataOf(result, 'fictional user creation').user.id;
    evidence.accountsCreated++; await save();
    await login(user);
  }
  check('five fresh fictional accounts authenticate');
  await phase('create isolated workspaces through authenticated RPC');
  for (const key of ['a','b']) {
    const target = manifest.workspaces[key];
    target.businessId = dataOf(await clients.get(`${key}-owner`).rpc('create_workspace', { ...fixture, p_name: `Laris QA ${key.toUpperCase()} 20261105`, p_slug: target.slug }), 'create fixture workspace');
    evidence.workspacesCreated++; await save();
  }
  const a = manifest.workspaces.a.businessId, b = manifest.workspaces.b.businessId;
  const owner = clients.get('a-owner'), manager = clients.get('a-manager'), kasir = clients.get('a-kasir'), dapur = clients.get('a-dapur');
  for (const user of manifest.users.filter(user => user.workspace === 'a' && user.role !== 'owner')) {
    const member = dataOf(await owner.rpc('add_team_member_by_email', { p_business_id: a, p_email: user.email, p_role: user.role }), 'attach existing fictional account');
    assert.equal(member.userId, user.userId); assert.equal(member.role, user.role);
  }
  check('two workspaces and four roles provisioned through app RPCs');
  await phase('tenant reads and role denials');
  for (const user of manifest.users) {
    const client = clients.get(user.key), own = user.workspace === 'a' ? a : b, other = user.workspace === 'a' ? b : a;
    const membership = await rows(client, 'membership', own, 'user_id,role');
    assert.equal(membership.find(row => row.user_id === user.userId)?.role, user.role);
    for (const table of ledgerTables) assert.equal((await rows(client, table, other, table === 'membership' ? 'user_id' : 'id')).length, 0, 'Cross-tenant read exposed fixture data');
    assert.equal(dataOf(await client.from('business').select('id').eq('id', other), 'cross-tenant business read').length, 0);
    check(`${user.key}: membership correct; other workspace hidden`);
  }
  await denied('owner cannot sell into second tenant', () => owner.rpc('complete_sale', sale(b)), b);
  await denied('owner cannot purchase into second tenant', () => owner.rpc('record_purchase', purchase(b)), b);
  await denied('dapur cannot checkout', () => dapur.rpc('complete_sale', sale(a)), a);
  await denied('dapur cannot record purchases', () => dapur.rpc('record_purchase', purchase(a)), a);
  await denied('kasir cannot change menu', () => kasir.rpc('save_product', product(a)), a);
  await denied('dapur cannot change menu', () => dapur.rpc('save_product', product(a)), a);
  await denied('manager cannot change team roles', () => manager.rpc('update_team_member_role', { p_business_id: a, p_user_id: manifest.users.find(user => user.key === 'a-kasir').userId, p_new_role: 'manager' }), a);
  const initial = await snapshot(a);
  const outlet = dataOf(await owner.from('outlet').select('id').eq('business_id', a).single(), 'fixture outlet');
  await denied('direct stock ledger insert denied even to owner', () => owner.from('stock_movement').insert({ business_id: a, outlet_id: outlet.id, inventory_item_id: initial.inventory_item[0].id, type: 'adjustment', qty_delta: 1 }), a);
  await denied('direct sale ledger insert denied even to owner', () => owner.from('sales_order').insert({ business_id: a, outlet_id: outlet.id, subtotal: 1, total: 1 }), a);
  await denied('insufficient stock rolls back entire sale', () => owner.rpc('complete_sale', { ...sale(a), p_items: [{ code: 'qa-kopi', quantity: 999 }], p_cash_received: 999999999 }), a, ['22023','P0001']);
  await denied('invalid purchase rolls back header and lines', () => owner.rpc('record_purchase', { ...purchase(a), p_lines: [{ code: 'qa-coffee', quantity: 0, total: 15000 }] }), a, ['22023']);
  await phase('three successful sales; retry each with same key');
  for (const role of ['owner','manager','kasir']) {
    const client = clients.get(`a-${role}`), payload = { ...sale(a), p_idempotency_key: `qa-${runId}-sale-${role}` };
    const id = dataOf(await client.rpc('complete_sale', payload), `${role} sale`);
    manifest.recordIds.sales.push(id); evidence.financialRecordsCreated++; await save();
    const beforeRetry = await snapshot(a);
    const repeated = await Promise.all([client.rpc('complete_sale', payload), client.rpc('complete_sale', payload)]);
    for (const result of repeated) assert.equal(dataOf(result, 'sale retry'), id);
    assert.deepEqual(await snapshot(a), beforeRetry);
    check(`${role}: checkout and concurrent retries commit once`);
  }
  const sold = await snapshot(a);
  assert.equal(sold.sales_order.length, 3); assert.equal(sold.payment.length, 3); assert.equal(sold.order_item.length, 3);
  assert.equal(stock(sold, 'qa-coffee'), 940); assert.equal(stock(sold, 'qa-milk'), 1700);
  for (const line of sold.order_item) { assert.equal(Number(line.unit_price), 25000); assert.equal(Number(line.unit_cost), 4000); }
  assert.equal(sold.sales_order.reduce((sum, row) => sum + Number(row.total), 0), 75000);
  check('sales persist correct price/HPP, payment total and ingredient consumption', { revenue: 75000, historicalCost: 12000 });
  await phase('three purchases; weighted average and idempotency');
  for (const role of ['owner','manager','kasir']) {
    const client = clients.get(`a-${role}`), payload = { ...purchase(a), p_idempotency_key: `qa-${runId}-purchase-${role}` };
    const before = await snapshot(a), beforeItem = before.inventory_item.find(item => item.code === 'qa-coffee');
    const expectedCost = Math.round((stock(before, 'qa-coffee') * Number(beforeItem.avg_cost_per_unit) + 15000) / (stock(before, 'qa-coffee') + 100) * 10000) / 10000;
    const id = dataOf(await client.rpc('record_purchase', payload), `${role} purchase`);
    manifest.recordIds.purchases.push(id); evidence.financialRecordsCreated++; await save();
    const after = await snapshot(a);
    assert.equal(stock(after, 'qa-coffee'), stock(before, 'qa-coffee') + 100);
    assert.equal(Number(after.inventory_item.find(item => item.code === 'qa-coffee').avg_cost_per_unit), expectedCost);
    const repeated = await Promise.all([client.rpc('record_purchase', payload), client.rpc('record_purchase', payload)]);
    for (const result of repeated) assert.equal(dataOf(result, 'purchase retry'), id);
    assert.deepEqual(await snapshot(a), after);
    check(`${role}: purchase updates stock/cost once across concurrent retries`);
  }
  await phase('catalog edits and historical integrity');
  for (const client of [owner, manager]) assert.equal(dataOf(await client.rpc('save_product', product(a)), 'authorized catalog edit'), 'qa-kopi');
  const edited = await snapshot(a);
  assert.deepEqual(edited.order_item, sold.order_item); assert.deepEqual(edited.sales_order, sold.sales_order);
  assert.equal(Number(edited.product_variant[0].price), 30000);
  assert.equal(edited.purchase.length, 3); assert.equal(stock(edited, 'qa-coffee'), 1240); assert.equal(stock(edited, 'qa-milk'), 1700);
  check('owner/manager catalog edits and purchases preserve historical sale price/HPP');
  await phase('fresh sessions reload persisted records');
  for (const user of manifest.users.filter(user => user.workspace === 'a')) {
    await clients.get(user.key).auth.signOut({ scope: 'local' });
    const fresh = await login(user);
    for (const table of ['sales_order','order_item','payment','stock_movement','purchase','purchase_line','inventory_item','product_variant']) assert.deepEqual(await rows(fresh, table, a), edited[table]);
    check(`${user.role}: fresh authenticated session reads persisted cloud records`);
  }
  const isolated = await snapshot(b);
  assert.equal(isolated.sales_order.length, 0); assert.equal(isolated.purchase.length, 0);
  assert.equal(stock(isolated, 'qa-coffee'), 1000); assert.equal(stock(isolated, 'qa-milk'), 2000);
  check('second tenant fixture unchanged after all operations');
  manifest.status = 'api-passed'; evidence.status = 'passed';
} catch (error) {
  manifest.status = 'stopped'; evidence.status = 'failed'; evidence.failedPhase = manifest.phase;
  evidence.errorKind = error.code || error.name || 'Error';
  // Do not print arbitrary provider responses, account emails, passwords or tokens.
  console.error(`STOPPED during ${manifest.phase}; code ${evidence.errorKind}; inspect private fixture manifest before any retry.`);
  process.exitCode = 1;
} finally {
  for (const client of clients.values()) await client.auth.signOut({ scope: 'local' }).catch(() => {});
  if (manifestCreated) await save();
  await mkdir(output, { recursive: true });
  await writeFile(`${output}/api-results.json`, JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify({ status: evidence.status, checksPassed: evidence.checks.length, accountsCreated: evidence.accountsCreated, workspacesCreated: evidence.workspacesCreated, financialRecordsCreated: evidence.financialRecordsCreated, evidence: `${output}/api-results.json`, privateCredentials: privateFile }));
}
