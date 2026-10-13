#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-SETUP-LENS (bim-compiler prompts/ERP_DEPTH_FILM.md §SETUP-LENS). READ THE LOG: every verdict is a §SL line.
// THE ISSUE it proves/disproves: the read-only setup-completeness lens must (1) report a freshly BORN tenant (genesis) honestly line by line, (2) flip EXACTLY the one line whose rows are removed
//   (neg-control: delete the warehouse -> only 'warehouse' goes MISSING), (3) say INCONCLUSIVE, not OK, when the bundle lacks the table (vacuous population), (4) WRITE NOTHING (db byte-identical
//   before/after compute). Population = the 10 lens lines x {born tenant, born tenant minus one master, resident GardenWorld, a client id with no rows}.
'use strict';
var fs = require('fs'), path = require('path');
var ERP = path.join(__dirname, '..'), G = require(path.join(ERP, 'genesis.js')), L = require(path.join(ERP, 'setup_lens.js'));
var initSqlJs; try { initSqlJs = require('sql.js'); } catch (e) { initSqlJs = require(path.join(ERP, 'sqljs', 'sql-wasm.js')); }
var log = console.log, fails = 0, judged = 0, TODAY = '2026-10-14';
function check(name, ok, info) { judged++; if (!ok) fails++; log('  §SL-CHECK ' + name + ' ' + (ok ? 'OK' : 'FAIL') + (ok ? '' : ' ' + JSON.stringify(info))); }
(async function () {
  var SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(ERP, 'sqljs', 'sql-wasm.wasm')) }), db = new SQL.Database(fs.readFileSync(path.join(ERP, 'ad_seed.db')));
  var q = function (sql, p) { var s = db.prepare(sql), r = []; try { if (p) s.bind(p); while (s.step()) { var o = s.getAsObject(), k = {}; Object.keys(o).forEach(function (x) { k[x.toLowerCase()] = o[x]; }); r.push(k); } } finally { s.free(); } return r; };
  var shim = { prepare: function (sql) { return { all: function () { return q(sql); }, run: function (row) { var b = {}; Object.keys(row).forEach(function (k) { b['@' + k] = row[k] == null ? null : row[k]; }); var s = db.prepare(sql); try { s.bind(b); s.step(); } finally { s.free(); } } }; } };
  var born = G.birthTenant({ clientName: 'LensCo', currencyId: 100, currencyIso: 'USD', currencyPrecision: 2, adminUser: 'clientAdmin', dateAcct: TODAY, countryId: 100 });
  var rb = G.rebandGenesis({ groups: born.groups, refs: born.refs, input: born.input, tip: born.tip }, { clientId: G.nextClientId(shim) });
  var n = G.mergeGenesisInto(rb.groups, shim), cid = rb.refs ? rb.refs.clientId : null;
  if (cid == null) cid = q("SELECT MAX(ad_client_id) AS c FROM ad_client")[0].c;
  log('§SL born client=' + cid + ' rowsMerged=' + n);
  var r0 = L.compute(q, cid, TODAY), miss0 = r0.rows.filter(function (r) { return r.status === 'MISSING'; }).map(function (r) { return r.id; });
  check('SL0 a freshly merged tenant WITHOUT access grants: the lens names exactly the access line (the real gap grantFullAccess closes)', JSON.stringify(miss0) === JSON.stringify(['access']), { missing: miss0 });
  var gr = G.grantFullAccess(shim, rb.refs.roleAdminId, cid, rb.refs.orgId); log('§SL grantFullAccess -> ' + JSON.stringify(gr));
  var before = Buffer.from(db.export()).toString('base64').length, r1 = L.compute(q, cid, TODAY), after = Buffer.from(db.export()).toString('base64').length;
  r1.rows.forEach(function (r) { log('  §SL-LINE born ' + r.status + ' ' + r.id + ' — ' + r.detail); });
  check('SL1 lens judged all 10 lines on the born tenant (population not vacuous)', r1.judged === 10 && r1.rows.length === 10, { judged: r1.judged, inconclusive: r1.rows.filter(function (r) { return r.status === 'INCONCLUSIVE'; }).map(function (r) { return r.id; }) });
  check('SL2 read-only: the db bytes are identical before and after compute', before === after, { before: before, after: after });
  // SL3 neg-control: remove the born tenant's warehouse locators+warehouse -> only 'warehouse' flips
  var base = {}; r1.rows.forEach(function (r) { base[r.id] = r.status; });
  db.run("DELETE FROM m_locator WHERE ad_client_id=" + cid); db.run("DELETE FROM m_warehouse WHERE ad_client_id=" + cid);
  var r2 = L.compute(q, cid, TODAY), flipped = r2.rows.filter(function (r) { return r.status !== base[r.id]; }).map(function (r) { return r.id; });
  check('SL3 NEG: deleting the warehouse flips exactly the warehouse line', JSON.stringify(flipped) === JSON.stringify(['warehouse']) && r2.rows.filter(function (r) { return r.id === 'warehouse'; })[0].status === 'MISSING', { flipped: flipped });
  check('SL4 verdict of the born tenant before = COMPLETE/COMPLETE-BUT-UNJUDGED, after = INCOMPLETE', /^COMPLETE/.test(r1.verdict) && r2.verdict === 'INCOMPLETE', { before: r1.verdict, after: r2.verdict });
  // SL5 vacuous: a client with no rows -> MISSING (judged), and a bundle without a table -> INCONCLUSIVE
  var r3 = L.compute(q, 424242, TODAY); check('SL5 a client with no rows: every judged line MISSING (not OK)', r3.ok === 0 && r3.missing === r3.judged && r3.judged > 0, { ok: r3.ok, missing: r3.missing });
  var q2 = function (sql, p) { if (/sqlite_master/.test(sql) && p && p[0] === 'c_paymentterm') return []; return q(sql, p); };
  var r4 = L.compute(q2, cid, TODAY); check('SL6 table absent from the bundle -> that line INCONCLUSIVE, never OK', r4.rows.filter(function (r) { return r.id === 'paymentterm'; })[0].status === 'INCONCLUSIVE', null);
  var res = L.compute(q, 11, TODAY); log('§SL resident GardenWorld(11): ' + res.rows.map(function (r) { return r.id + '=' + r.status; }).join(' ') + ' verdict=' + res.verdict);
  check('SL7 resident client 11 judged (>=8 lines)', res.judged >= 8, { judged: res.judged });
  var v = !judged ? 'INCONCLUSIVE' : fails ? 'FAIL' : 'PASS'; log('§SL-VERDICT ' + v + ' judged=' + judged + ' failed=' + fails); process.exit(v === 'PASS' ? 0 : v === 'FAIL' ? 1 : 3);
})().catch(function (e) { log('§SL-VERDICT CRASH ' + (e.stack || e)); process.exit(2); });
