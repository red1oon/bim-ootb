// ⚠ DO NOT REMOVE — Scope guard
// Scope: §-witness for the LOGIN CLIENT SWITCHER (NEW_CLIENT_MGMT.md P3, W-CLIENT-SWITCHER).
//   PROVES (issue: "list installed tenants → pick → role-scoped login; today only ?shard=&login= selects"):
//     1. SES.listClients folds the login-able tenants from real AD rows; base ad_seed.db = 1 (GardenWorld) →
//        the picker AUTO-SKIPS (single tenant, zero behaviour change).
//     2. After the Odoo shard-in merge, listClients = 3 (System(0)/GardenWorld(11)/Odoo(12)) → picker SURFACES.
//     3. SES.usersForClient scopes the user list to the picked tenant (Odoo(12) = 1 user; GardenWorld(11) = 4).
//     4. ?client=<id|name> resolves to a tenant (by id and by name-substring).
//     5. §FALSIFIER usersForClient(absent client) = 0 (the scope is real, not always-true).
//   §-log first — READ tests/poc_client_switcher.log before any conclusion.
// Run:  node tests/poc_client_switcher.js 2>&1 | tee tests/poc_client_switcher.log   (cwd = bim-ootb/erp)
'use strict';
const fs = require('fs'), path = require('path');
const initSqlJs = require('/home/red1/bim-ootb/node_modules/sql.js');
const ERP = path.join(__dirname, '..');
global.window = global.window || {};
const SES = require(path.join(ERP, 'idmp_session.js'));

// replicate idempiere.html's column-intersect shard-in merge (so the witness exercises the SAME install path).
function mergeShard(base, shard) {
  const baseCols = (t) => { try { const r = base.exec('PRAGMA table_info("' + t + '")'); return r.length ? new Set(r[0].values.map(v => String(v[1]).toLowerCase())) : null; } catch (e) { return null; } };
  const tbls = shard.exec("SELECT name FROM sqlite_master WHERE type='table'");
  let rows = 0;
  if (tbls.length) tbls[0].values.forEach(tv => {
    const t = tv[0], r = shard.exec('SELECT * FROM "' + t + '"'); if (!r.length) return;
    const bc = baseCols(t); if (!bc) return;
    const idx = [], cols = [];
    r[0].columns.forEach((c, i) => { if (bc.has(String(c).toLowerCase())) { idx.push(i); cols.push(c); } });
    if (!cols.length) return;
    const ins = 'INSERT OR IGNORE INTO "' + t + '" (' + cols.map(c => '"' + c + '"').join(',') + ') VALUES (' + cols.map(() => '?').join(',') + ')';
    r[0].values.forEach(vals => { try { base.run(ins, idx.map(i => vals[i])); rows++; } catch (e) {} });
  });
  return rows;
}

let fails = 0;
function ok(cond, msg) { if (!cond) { fails++; console.log('  ✗ FAIL: ' + msg); } else { console.log('  ✓ ' + msg); } }

(async function () {
  const SQL = await initSqlJs();
  console.log('\n══ W-CLIENT-SWITCHER — login tenant picker folds installed clients from real AD rows ══\n');

  // W1 — base seed: single login-able tenant → auto-skip
  const base = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(ERP, 'ad_seed.db'))));
  let tenants = SES.listClients(base);
  console.log('§SWITCHER base tenants=' + tenants.length + ' [' + tenants.map(c => c.name + '(' + c.id + ')').join(',') + ']');
  ok(tenants.length === 1 && tenants[0].id === 11, 'base ad_seed.db has exactly 1 login-able tenant: GardenWorld(11)');
  ok(tenants.length < 2, 'AUTO-SKIP: <2 tenants → step 0 not rendered (single-tenant = unchanged behaviour)');

  // W2 — install the Odoo tenant (shard-in merge) → 3 tenants → picker surfaces
  const shard = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(ERP, '12-odoo.db'))));
  const merged = mergeShard(base, shard);
  console.log('§SWITCHER shard merged rows=' + merged);
  tenants = SES.listClients(base);
  console.log('§SWITCHER post-install tenants=' + tenants.length + ' [' + tenants.map(c => c.name + '(' + c.id + '):' + c.users).join(',') + ']');
  ok(tenants.length === 3, 'after Odoo install → 3 login-able tenants (got ' + tenants.length + ')');
  ok(tenants.some(c => c.id === 12 && /Odoo/.test(c.name)), 'Odoo(12) appears as an installed tenant');
  ok(tenants.length >= 2, 'PICKER SURFACES: ≥2 tenants → step 0 rendered');

  // W3 — usersForClient scopes the user list to the picked tenant
  const odooUsers = SES.usersForClient(base, 12);
  const gwUsers = SES.usersForClient(base, 11);
  console.log('§SWITCHER usersForClient odoo=' + JSON.stringify(odooUsers.map(u => u.name)) + ' garden=' + gwUsers.length);
  ok(odooUsers.length === 1, 'Odoo(12) scopes to exactly 1 user (got ' + odooUsers.length + ': ' + odooUsers.map(u => u.name).join(',') + ')');
  ok(gwUsers.length === 4, 'GardenWorld(11) scopes to its 4 users (got ' + gwUsers.length + ')');
  ok(odooUsers.every(u => u.hasRoles), 'every scoped user is loginable (hasRoles)');

  // W4 — ?client= resolve (by id and by name-substring), mirroring idempiere.html boot
  function resolveClient(param) { return SES.listClients(base).filter(c => String(c.id) === param || (c.name || '').toLowerCase().indexOf(String(param).toLowerCase()) >= 0)[0]; }
  ok(resolveClient('12') && resolveClient('12').id === 12, '?client=12 resolves to Odoo(12)');
  ok(resolveClient('odoo') && resolveClient('odoo').id === 12, '?client=odoo (name) resolves to Odoo(12)');
  ok(resolveClient('garden') && resolveClient('garden').id === 11, '?client=garden resolves to GardenWorld(11)');

  // W5 — §FALSIFIER: scoping is real (an absent client yields no users)
  const ghost = SES.usersForClient(base, 99999);
  console.log('§FALSIFIER usersForClient(99999)=' + ghost.length + ' (must be 0)');
  ok(ghost.length === 0, '§FALSIFIER absent tenant → 0 users (scope is load-bearing, not always-true)');

  console.log('\n' + (fails === 0 ? '🟢 W-CLIENT-SWITCHER PASS' : '🔴 W-CLIENT-SWITCHER FAIL (' + fails + ')') + ' — installed tenants fold from AD; picker surfaces only when ≥2; user list scopes to the pick');
  process.exit(fails === 0 ? 0 : 1);
})().catch(e => { console.error('FATAL: ' + e.message + '\n' + e.stack); process.exit(1); });
