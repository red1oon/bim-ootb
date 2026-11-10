#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-PLUGIN-ROLE-ACCESS (bim-compiler prompts/MIGRATE_INSTALL_TENANT.md §PLUGIN-ROLE-ACCESS-SPEC; AD-LAYER LAW: one generic engine, X of N). READ THE LOG after
//   every run: every verdict is a §PRA line, the exit code is not the evidence. INCONCLUSIVE when nothing was judged.
// THE ISSUE it proves/disproves (owner, on the live page: the migrate tools were reachable only as System Administrator / GardenWorld Admin): each migrate bundle carried a HAND
//   role list for its AD_Form_Access / AD_Process_Access rows, so the admin of a tenant the user created never saw "Migrate from …". Legacy gives a packed-in Form / Process to
//   every ACTIVE role with IsManual='N' whose level admits it: PackInHandler.updateRoleAccess (PackInHandler.java:522-536) → MRole.updateAccessRecords(false).
// SPEC (claims written before the code; each check names the issue it proves):
//   X-OF-N   denominator from the bundles' own manifest.dictionary (every ad_form / ad_process row of the 4 migrate bundles) × every active role with IsManual='N' in AD_Role:
//            where the role's UserLevel admits the record's AccessLevel an access row exists after Start. ORACLE = the level rule read from MRole.java (updateAccessRecords
//            :529-560), written out HERE, not taken from the port: 'S  ' → 4,7,6 · ' C ' → 7,6,3,2 · ' CO' → 7,6,3,2,1 · other (Org) → 3,1,7.
//   NEGATIVE a MANUAL role has no row; a role whose level does not admit the record has none — except role 0, the login role's own row (MForm / MProcess afterSave).
//   BORN     a tenant born by the ported Initial Client Setup BEFORE the start: its Admin role has the rows. A tenant born AFTER the start: has them too, at the latest after
//            the next start of the bundle (each page load starts the bundles again) — which of the two is printed.
//   STOP     Stop of the bundles removes every access row of their records (back to zero); Start again adds them back with no duplicate (role, record) pair.
//   FALSIFY  a host with the pass switched off (host.roleAccess === false) leaves the born tenant's Admin WITHOUT a row — so X-OF-N can fail.
// Command: node erp/tests/witness_plugin_role_access.js 2>&1 | tee /tmp/count_logs/plugin_role_access.log
'use strict';
var path = require('path'), url = require('url');
if (!global.window) global.window = {};
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
var ERP = path.join(__dirname, '..'), _log = console.log, SHIPPED = []; console.log = function () { var l = Array.prototype.join.call(arguments, ' '); if (/^§PLUGIN-ROLE-ACCESS/.test(l)) SHIPPED.push(l); };
function say(s) { _log(s); }
var CASES = {}, ALL = { judged: 0, failed: 0 }, J = JSON.stringify;
function check(cs, key, rule, ok, info) { var c = CASES[cs] = CASES[cs] || { judged: 0, failed: 0 }; c.judged++; ALL.judged++; if (!ok) { c.failed++; ALL.failed++; }
  say('  §PRA-CHECK case=' + cs + ' key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' rule="' + rule + '"' + (ok ? '' : ' got=' + String(J(info)).slice(0, 1500))); }
function verdict(cs) { var c = CASES[cs] || { judged: 0, failed: 0 }, v = !c.judged ? 'INCONCLUSIVE' : c.failed ? 'FAIL' : 'PASS'; say('§PRA-' + cs + ' verdict=' + v + ' judged=' + c.judged + ' failed=' + c.failed); return v; }
var ADMIT = function (lv) { return lv === 'S  ' ? ['4', '7', '6'] : lv === ' C ' ? ['7', '6', '3', '2'] : lv === ' CO' ? ['7', '6', '3', '2', '1'] : ['3', '1', '7']; };   // MRole.java updateAccessRecords :529-560
var BUNDLES = [['ninja_migrate.mjs', 'org.idempiere.ninja.migrate'], ['odoo_migrate.mjs', 'org.kernel.odoo.migrate'], ['bc_migrate.mjs', 'org.kernel.bc.migrate'], ['sap_migrate.mjs', 'org.kernel.sap.migrate']];
var ACC = { ad_form: ['ad_form_access', 'ad_form_id'], ad_process: ['ad_process_access', 'ad_process_id'] };

(async function main() {
  var K = require(path.join(ERP, 'ws_kernel.js')), k = await K.load(), db = k.db, ML = k.ML, AP = require(path.join(ERP, 'ad_process.js')), AF = require(path.join(ERP, 'ad_form_generic.js'));
  var G = require(path.join(ERP, 'genesis.js')), PR = require(path.join(ERP, 'plugin_registry.js'));
  function q(sql, p) { return k.q(sql, p || []); }
  var shim = { prepare: function (sql) { return { all: function () { return q(sql); }, run: function (row) { var b = {}; Object.keys(row || {}).forEach(function (x) { b['@' + x] = row[x] == null ? null : row[x]; }); var s = db.prepare(sql); try { s.bind(b); s.step(); } finally { s.free(); } } }; } };
  function birth(name) { var born = G.birthTenant({ clientName: name, currencyId: 100, currencyIso: 'USD', currencyPrecision: 2, adminUser: name.replace(/\W/g, '') + 'Admin', dateAcct: '2026-11-10', countryId: 100 });
    var rb = G.rebandGenesis({ groups: born.groups, refs: born.refs, input: born.input, tip: born.tip }, { clientId: G.nextClientId(shim) });
    G.mergeGenesisInto(rb.groups, shim, { now: '2026-11-10 09:00:00', user: 100, initialDefaults: ML.initialDefaultsOf }); return rb.refs; }
  function mkHost(extra) { return Object.assign({ engineVersion: '1.0.0', db: { query: function (sql, p) { return q(sql, p); }, run: function (sql, p) { db.run(sql, p || []); } }, ops: { append: function () { return 1; } }, process: AP, docAction: ML, form: AF,
    import: function (u) { return import(url.pathToFileURL(path.resolve(path.join(ERP, 'plugins'), u)).href); } }, extra || {}); }
  // the records the bundles bring (denominator from their own dictionary)
  var MODS = []; for (var i = 0; i < BUNDLES.length; i++) MODS.push(await import(url.pathToFileURL(path.join(ERP, 'plugins', BUNDLES[i][0])).href));
  var RECS = []; MODS.forEach(function (m) { (m.manifest.dictionary || []).forEach(function (d) { var a = ACC[String(d.table).toLowerCase()]; if (a) d.rows.forEach(function (r) { RECS.push({ bundle: m.manifest.id, table: d.table, acc: a[0], col: a[1], id: r[a[1]], level: String(r.accesslevel) }); }); }); });
  function rowsOf(rec) { return q('SELECT ad_role_id AS r FROM ' + rec.acc + ' WHERE ' + rec.col + '=?', [rec.id]).map(function (x) { return Number(x.r); }); }
  function total() { return RECS.reduce(function (n, rec) { return n + rowsOf(rec).length; }, 0); }
  async function startAll(reg, again) { if (!again) for (var i = 0; i < BUNDLES.length; i++) { await reg.installBundle(MODS[i]); } for (var j = 0; j < BUNDLES.length; j++) await reg.startBundle(BUNDLES[j][1]); }
  async function stopAll(reg) { for (var j = BUNDLES.length - 1; j >= 0; j--) await reg.stopBundle(BUNDLES[j][1]); }

  var A = birth('Before Co'), T0 = total();
  say('§PRA-RECORDS ' + J(RECS.map(function (r) { return r.bundle + ' ' + r.table + ' ' + r.id + ' level=' + r.level; })) + ' access_rows_before_any_start=' + T0 + ' tenant_before=' + A.clientId + ' adminRole=' + A.roleAdminId);
  check('X-OF-N', 'denominator', 'the 4 migrate bundles bring 4 records that need role access (3 forms + 1 process) and none has an access row before any start', RECS.length === 4 && T0 === 0, { n: RECS.length, T0: T0 });

  // ═══ FALSIFY first (pass off): the born tenant's Admin has nothing ═══
  var regOff = PR.create(mkHost({ roleAccess: false })); await startAll(regOff);
  var offAdmin = RECS.filter(function (rec) { return rowsOf(rec).indexOf(Number(A.roleAdminId)) >= 0; }).length, offTotal = total();
  await stopAll(regOff);
  check('FALSIFY', 'pass-off', 'with the pass switched off only the bundles\' own login-role rows exist (4, role 0) and the born tenant\'s Admin has access to 0 of the 4 records — the X-of-N claim can fail', offAdmin === 0 && offTotal === 4 && total() === 0, { offAdmin: offAdmin, offTotal: offTotal, after: total() });
  verdict('FALSIFY');

  // ═══ START (pass on) ═══
  var reg = PR.create(mkHost()), mark = SHIPPED.length; await startAll(reg);
  SHIPPED.slice(mark).forEach(function (l) { say('  shipped> ' + l.slice(0, 260)); });
  var roles = q("SELECT ad_role_id AS id, name, userlevel AS lv, ismanual AS m, isactive AS a, ad_client_id AS c FROM ad_role ORDER BY ad_role_id");
  var N = 0, X = 0, miss = [], extra = [], manual = 0;
  RECS.forEach(function (rec) { var have = rowsOf(rec);
    roles.forEach(function (r) { var should = r.m === 'N' && r.a === 'Y' && ADMIT(r.lv).indexOf(rec.level) >= 0, has = have.indexOf(Number(r.id)) >= 0;
      if (should) { N++; if (has) X++; else miss.push(rec.id + '/' + r.id + ' ' + r.name); }
      else if (has && Number(r.id) !== 0) extra.push(rec.id + '/' + r.id + ' ' + r.name + ' lv=' + J(r.lv) + ' manual=' + r.m);
      if (r.m === 'Y' && !has) manual++; }); });
  say('§PRA-X-OF-N X=' + X + ' N=' + N + ' roles=' + roles.length + ' (non-manual active=' + roles.filter(function (r) { return r.m === 'N' && r.a === 'Y'; }).length + ') records=' + RECS.length + ' missing=' + miss.length + ' unexpected=' + extra.length);
  check('X-OF-N', 'all', 'X of N: every (record, active non-manual role whose UserLevel admits the record\'s AccessLevel) pair has its access row — X=' + X + ' of N=' + N, N > 0 && X === N, miss.slice(0, 8));
  check('NEGATIVE', 'none-else', 'no MANUAL role and no role whose level does not admit the record has a row (role 0 keeps the login-role row of each record); manual role × record pairs without a row: ' + manual, extra.length === 0 && manual > 0 && RECS.every(function (rec) { return rowsOf(rec).indexOf(0) >= 0; }), extra.slice(0, 8));
  var aHas = RECS.filter(function (rec) { return rowsOf(rec).indexOf(Number(A.roleAdminId)) >= 0; }).length;
  check('BORN', 'before-start', 'the Admin role of the tenant born BEFORE the start has access to all 4 records', aHas === 4, aHas);
  var dup = RECS.reduce(function (n, rec) { return n + q('SELECT count(*) AS n FROM (SELECT ad_role_id FROM ' + rec.acc + ' WHERE ' + rec.col + '=? GROUP BY ad_role_id HAVING count(*)>1)', [rec.id])[0].n; }, 0);
  var T1 = total(), B = birth('After Co'), bNow = RECS.filter(function (rec) { return rowsOf(rec).indexOf(Number(B.roleAdminId)) >= 0; }).length;
  await stopAll(reg); var T2 = total();
  check('STOP', 'removed', 'Stop of the 4 bundles removes every access row of their records (' + T1 + ' → 0)', T1 > 4 && T2 === 0, { T1: T1, T2: T2 });
  await startAll(reg, true);
  var bAfter = RECS.filter(function (rec) { return rowsOf(rec).indexOf(Number(B.roleAdminId)) >= 0; }).length, T3 = total();
  var dup2 = RECS.reduce(function (n, rec) { return n + q('SELECT count(*) AS n FROM (SELECT ad_role_id FROM ' + rec.acc + ' WHERE ' + rec.col + '=? GROUP BY ad_role_id HAVING count(*)>1)', [rec.id])[0].n; }, 0);
  say('§PRA-BORN after-start tenant=' + B.clientId + ' adminRole=' + B.roleAdminId + ' records_at_birth=' + bNow + '/4 records_after_next_start=' + bAfter + '/4' + (bNow < 4 ? ' (named: a tenant born while the bundles run gets its rows at the next start of the bundle — every page load)' : ''));
  check('BORN', 'after-start', 'the Admin role of a tenant born AFTER the start has access to all 4 records at the latest after the next start of the bundles', bAfter === 4, { atBirth: bNow, afterNextStart: bAfter });
  check('STOP', 'restart', 'Start again brings the rows back (now also the new tenant\'s roles: ' + T3 + ' ≥ ' + T1 + ') with no duplicate (role, record) pair, before or after', T3 >= T1 && dup === 0 && dup2 === 0, { T1: T1, T3: T3, dup: dup, dup2: dup2 });
  verdict('X-OF-N'); verdict('NEGATIVE'); verdict('BORN'); verdict('STOP');
  var v = ['FALSIFY', 'X-OF-N', 'NEGATIVE', 'BORN', 'STOP'].map(function (c) { var x = CASES[c] || {}; return !x.judged ? 'INCONCLUSIVE' : x.failed ? 'FAIL' : 'PASS'; });
  var all = v.indexOf('FAIL') >= 0 ? 'FAIL' : v.indexOf('INCONCLUSIVE') >= 0 ? 'INCONCLUSIVE' : 'PASS';
  say('§PRA-VERDICT ' + all + ' judged=' + ALL.judged + ' failed=' + ALL.failed + ' cases=' + J(v));
  process.exit(all === 'PASS' ? 0 : all === 'INCONCLUSIVE' ? 3 : 1);
})().catch(function (e) { say('§PRA-VERDICT FAIL threw ' + (e && e.stack || e)); process.exit(1); });
