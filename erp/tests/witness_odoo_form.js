#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-ODOO-FORM (bim-compiler prompts/MIGRATE_INSTALL_TENANT.md §B4-IMPL-SPEC). READ THE LOG after every run: every verdict is a §OF line; the exit code is not
//   the evidence. INCONCLUSIVE when nothing was judged.
// THE ISSUE it proves/disproves (owner: "a pre-migrate summary report first before the OK button ... the user may uncheck any master data that is not dependent upon"): the
//   "Migrate from Odoo" form (plugins/odoo_migrate.mjs + odoo_migrate_form.mjs, on the ONE generic form engine) must show, BEFORE anything is written, what each sheet will
//   import and why anything is refused; keep ticked what another ticked sheet needs; and on Process write exactly what it predicted (W-MIGRATE-SUMMARY), all or nothing.
// The descriptor is driven through AdFormGeneric.read / execute exactly as idempiere.html renderGenericForm calls them; the tenant is born by the ported Initial Client Setup.
// Command: node erp/tests/witness_odoo_form.js
'use strict';
var fs = require('fs'), path = require('path'), url = require('url');
if (!global.window) global.window = {};
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
var ERP = path.join(__dirname, '..'), FIXD = path.join(__dirname, 'fixtures', 'odoo_export_2026-11-09');
var _log = console.log; console.log = function () {};
function say(s) { _log(s); }
var CASES = {}, ALL = { judged: 0, failed: 0 };
function J(x) { return JSON.stringify(x); }
function check(cs, key, rule, ok, info) { var c = CASES[cs] = CASES[cs] || { judged: 0, failed: 0 }; c.judged++; ALL.judged++; if (!ok) { c.failed++; ALL.failed++; }
  say('  §OF-CHECK case=' + cs + ' key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' rule="' + rule + '"' + (ok ? '' : ' got=' + J(info))); }
function guard(cs, key, rule, fn) { try { fn(); } catch (e) { check(cs, key, rule, false, 'threw: ' + (e && (e.stack || e.message))); } }
function verdict(cs) { var c = CASES[cs] || { judged: 0, failed: 0 }, v = !c.judged ? 'INCONCLUSIVE' : c.failed ? 'FAIL' : 'PASS'; say('§OF-' + cs + ' verdict=' + v + ' judged=' + c.judged + ' failed=' + c.failed); return v; }

(async function main() {
  var K = require(path.join(ERP, 'ws_kernel.js')), k = await K.load(), db = k.db, ML = k.ML, AP = require(path.join(ERP, 'ad_process.js'));
  (fs.readFileSync(path.join(ERP, 'idempiere.html'), 'utf8').match(/<script src="(model_[a-z_]+\.js)/g) || []).forEach(function (m) { try { require(path.join(ERP, m.replace('<script src="', ''))); } catch (e) {} });
  var G = require(path.join(ERP, 'genesis.js')), PR = require(path.join(ERP, 'plugin_registry.js')), AF = require(path.join(ERP, 'ad_form_generic.js')), XLSX = require(path.join(ERP, 'xlsx.mini.min.js'));
  function q(sql, p) { return k.q(sql, p || []); }
  var shim = { prepare: function (sql) { return { all: function () { return q(sql); },
    run: function (row) { var b = {}; Object.keys(row || {}).forEach(function (x) { b['@' + x] = row[x] == null ? null : row[x]; }); var s = db.prepare(sql); try { s.bind(b); s.step(); } finally { s.free(); } } }; } };
  var born = G.birthTenant({ clientName: 'Form Co', currencyId: 100, currencyIso: 'USD', currencyPrecision: 2, adminUser: 'formAdmin', dateAcct: '2026-11-09', countryId: 100 });
  var rb = G.rebandGenesis({ groups: born.groups, refs: born.refs, input: born.input, tip: born.tip }, { clientId: G.nextClientId(shim) });
  G.mergeGenesisInto(rb.groups, shim, { now: '2026-11-09 09:00:00', user: 100, initialDefaults: ML.initialDefaultsOf });
  var R = rb.refs, CID = R.clientId, S = { clientId: CID, orgId: R.orgId, userId: R.userId || 100, roleId: R.roleAdminId, actor: 'witness:odoo-form' };
  say('§OF-TENANT client=' + CID);

  // ═══ PLUG: both bundles on the registry with only the generic extension points (process + form + dict) ═══
  var hostDb = { query: function (sql, p) { return q(sql, p); }, run: function (sql, p) { db.run(sql, p || []); } };
  var host = { engineVersion: '1.0.0', db: hostDb, ops: { append: function () { return 1; } }, process: AP, docAction: ML, form: AF,
    import: function (u) { return import(url.pathToFileURL(path.resolve(path.join(ERP, 'plugins'), u)).href); } };
  var reg = PR.create(host), err = null, s1 = null, s2 = null, FM = null;
  try {
    await reg.installBundle(await import(url.pathToFileURL(path.join(ERP, 'plugins', 'ninja_migrate.mjs')).href)); s1 = await reg.startBundle('org.idempiere.ninja.migrate');
    await reg.installBundle(await import(url.pathToFileURL(path.join(ERP, 'plugins', 'odoo_migrate.mjs')).href)); s2 = await reg.startBundle('org.kernel.odoo.migrate');
    FM = await import(url.pathToFileURL(path.join(ERP, 'plugins', 'odoo_migrate_form.mjs')).href);
  } catch (e) { err = e && (e.stack || e.message); }
  check('PLUG', 'starts', 'both bundles start ACTIVE (Ninja loader + the form)', !!s1 && s1.state === 'ACTIVE' && !!s2 && s2.state === 'ACTIVE', { s1: s1, s2: s2, err: err });
  var F = q("SELECT ad_form_id AS id, classname AS c FROM ad_form WHERE ad_form_id=9542001")[0], M = q("SELECT action AS a, ad_form_id AS f FROM ad_menu WHERE ad_menu_id=9542001")[0];
  var acc = q('SELECT count(*) AS n FROM ad_form_access WHERE ad_form_id=9542001')[0].n;
  check('PLUG', 'dictionary', 'AD_Form 9542001 names the class the form engine has; the menu leaf opens it (action X); access rows for roles 0 and 102', !!F && F.c === 'org.kernel.odoo.MigrateFromOdoo' && !!AF.get(F.c) && !!M && M.a === 'X' && M.f === 9542001 && acc === 2, { F: F, M: M, acc: acc });
  var rd = function (f) { try { return fs.readFileSync(path.join(ERP, f), 'utf8'); } catch (e) { return ''; } };
  check('PLUG', 'wiring', 'sw.js precaches both files and plugin_overlay installs the bundle stopped (file names only); the renderer has the generic file / text-cell / locked / current extensions',
    /'plugins\/odoo_migrate\.mjs'/.test(rd('sw.js')) && /'plugins\/odoo_migrate_form\.mjs'/.test(rd('sw.js')) && /INSTALL_ONLY = \[[^\]]*'plugins\/odoo_migrate\.mjs'/.test(rd('plugin_overlay.js')) &&
    /p\.type === 'file'/.test(rd('idempiere.html')) && /data-gform-cell-type/.test(rd('idempiere.html')) && /data-gform-locked/.test(rd('idempiere.html')) && /desc\.rows\(trx, params, current\)/.test(rd('idempiere.html')), {});
  verdict('PLUG');

  var withT = function (fn) { return fn(k.q, k.env(S)); };
  var D = AF.get('org.kernel.odoo.MigrateFromOdoo');
  var wbuf = fs.readFileSync(path.join(FIXD, 'odoo_migration.xlsx')), man = JSON.parse(fs.readFileSync(path.join(FIXD, 'manifest.json'), 'utf8'));
  function files(m) { return { Files: [{ name: 'odoo_migration.xlsx', size: wbuf.length, data: XLSX.read(wbuf) }, { name: 'manifest.json', size: 1, data: m || man }] }; }
  function rows(params, current) { return AF.read(withT, function (trx) { return D.rows(trx, params, current); }); }
  function byItem(rs, it) { return rs.filter(function (r) { return r.item === it; })[0]; }
  function answer(rs, ans) { return rs.map(function (r) { var o = { key: r.key, selected: r.selected }; if (r.erpunit !== undefined) o.erpunit = ans[r.item.replace(/^Unit: /, '')] != null ? ans[r.item.replace(/^Unit: /, '')] : r.erpunit; return o; }); }
  var TABLES = man.sheets.map(function (s) { return s.table; });
  function counts() { var o = {}; TABLES.forEach(function (t) { o[t] = q('SELECT count(*) AS n FROM ' + t.toLowerCase() + ' WHERE ad_client_id=?', [CID])[0].n; }); return o; }

  // ═══ EMPTY + PROBLEMS: nothing picked; a manifest that disagrees ═══
  var r0 = rows({ Files: null }, null);
  check('PICK', 'empty', 'with no files the form says what to pick (no run, no rows of data)', r0.length >= 2 && r0.every(function (r) { return /^⚠/.test(r.item); }), { r0: r0.map(function (r) { return r.item; }) });
  var bad = JSON.parse(JSON.stringify(man)); bad.sheets[4].rows = bad.sheets[4].rows + 1;
  var rBad = rows(files(bad), null);
  check('PICK', 'manifest', 'a manifest whose count differs from the sheet is refused BEFORE any dry run (falsifier: one count edited)', rBad.some(function (r) { return /^⚠ Sheet 05C_BPartner has 7 rows; the manifest says 8/.test(r.item); }), { items: rBad.filter(function (r) { return /^⚠/.test(r.item); }).map(function (r) { return r.item; }) });
  verdict('PICK');

  // ═══ UNITS: the 3 units products use, unanswered ⇒ nothing will import and the form says why ═══
  var r1 = rows(files(), null), units = r1.filter(function (r) { return /^Unit: /.test(r.item); });
  say('§OF-UNITS ' + J(units.map(function (u) { return u.item + '=' + J(u.erpunit) + ' ' + u.infile + ' ' + u.reason; })));
  check('UNITS', 'listed', 'one row per unit a product uses (3: Units, Days, Hours), none suggested (no exact ERP name), each saying to answer', units.length === 3 && units.every(function (u) { return u.erpunit === '' && /answer/.test(u.reason); }), { units: units });
  check('UNITS', 'blocked', 'unanswered units are a problem row and no sheet is predicted to import', r1.some(function (r) { return /^⚠ Answer the unit\(s\)/.test(r.item); }) && r1.filter(function (r) { return r.key > 100 && r.key < 900; }).every(function (r) { return !r.will; }), {});
  verdict('UNITS');

  // ═══ SUMMARY: answered ⇒ the dry run predicts every sheet, refuses nothing; the tenant is untouched by it ═══
  var ANS = { Units: 'Each', Days: 'Day', Hours: 'Hour' }, C0 = counts();
  var r2 = rows(files(), answer(r1, ANS)), sheets = r2.filter(function (r) { return r.key > 100 && r.key < 900; });
  say('§OF-SUMMARY ' + J(sheets.map(function (s) { return s.item + ' odoo=' + s.odoo + ' file=' + s.infile + ' will=' + s.will + ' refused=' + s.refused + (s.locked ? ' LOCKED(' + s.lockedBy + ')' : ''); })));
  var wrong = sheets.filter(function (s) { return s.item !== 'C_UOM' && (s.will !== s.infile || s.refused); });
  check('SUMMARY', 'predict', 'answered, every sheet (but the units, which all map) is predicted to import all its rows and refuse none', !r2.some(function (r) { return /^⚠/.test(r.item); }) && sheets.length === 17 && wrong.length === 0, { wrong: wrong.map(function (s) { return s.item + ' ' + s.will + '/' + s.infile + ' ' + s.reason; }) });
  check('SUMMARY', 'readonly', 'the summary wrote nothing: the tenant counts are the same before and after it (the dry run\'s transaction is thrown away)', J(counts()) === J(C0), { before: C0, after: counts() });
  var lockedCat = byItem(sheets, 'M_Product_Category');
  check('SUMMARY', 'locks', 'a parent a ticked sheet looks up through a mandatory column is locked, naming who needs it (M_Product_Category ← M_Product)', !!lockedCat && lockedCat.locked && /M_Product/.test(lockedCat.lockedBy), { cat: lockedCat });
  verdict('SUMMARY');

  // ═══ SELECT: unticking a locked parent does not stick; unticking a leaf (vendor prices) is allowed ═══
  var cur3 = answer(r2, ANS).map(function (r) { if (r.key === lockedCat.key) r.selected = false; return r; });
  var r3 = rows(files(), cur3), cat3 = byItem(r3, 'M_Product_Category');
  check('SELECT', 'relock', 'an unticked mandatory parent comes back ticked and locked on Refresh', cat3.selected && cat3.locked, { cat3: cat3 });
  var po = byItem(r2, 'M_Product_PO'), cur4 = answer(r2, ANS).map(function (r) { if (r.key === po.key) r.selected = false; return r; });
  var r4 = rows(files(), cur4), po4 = byItem(r4, 'M_Product_PO'), prod4 = byItem(r4, 'M_Product');
  check('SELECT', 'leaf', 'vendor prices (nothing needs them) can be unticked: predicted 0, the rest unchanged', !po4.selected && po4.will === 0 && prod4.will === prod4.infile, { po4: po4, prod4: prod4 });
  verdict('SELECT');

  // ═══ RUN: Process with vendor prices unticked ⇒ the tenant gains exactly the prediction (W-MIGRATE-SUMMARY) ═══
  var predicted = {}; r4.filter(function (r) { return r.key > 100 && r.key < 900; }).forEach(function (s) { predicted[s.item] = s.will; });
  var res = AF.execute(withT, 'org.kernel.odoo.MigrateFromOdoo', files(), cur4);
  say('§OF-RUN ok=' + res.ok + ' ops=' + (res.ops || []).length + ' msg=' + String(res.msg).slice(0, 300));
  if (res.ok && res.ops && res.ops.length) k.commit(S, res.ops, { ws: 'odoo_form' });
  var C1 = counts(), gain = {}; TABLES.forEach(function (t) { gain[t] = C1[t] - C0[t]; });
  var off = TABLES.filter(function (t) { return gain[t] !== predicted[t]; });
  say('§OF-RUN gain ' + J(gain) + ' predicted ' + J(predicted));
  check('RUN', 'ok', 'Process loads (one transaction, ops committed)', res.ok && (res.ops || []).length > 0, { msg: res.msg });
  check('RUN', 'summary==result', 'W-MIGRATE-SUMMARY: for every one of the 17 tables the tenant gained exactly what the summary predicted (vendor prices 0, unticked)', res.ok && off.length === 0, { off: off.map(function (t) { return t + ' gain ' + gain[t] + ' predicted ' + predicted[t]; }) });
  var r5 = rows(files(), cur4), now = {}; r5.filter(function (r) { return r.key > 100 && r.key < 900; }).forEach(function (s) { now[s.item] = s.intenant; });
  check('RUN', 'after', 'after Process the summary\'s "in this tenant now" shows the new counts (the result screen)', TABLES.every(function (t) { return now[t] === C1[t]; }), { now: now, C1: C1 });
  verdict('RUN');

  // ═══ RERUN: the same files again are refused whole; nothing changes ═══
  var res2 = AF.execute(withT, 'org.kernel.odoo.MigrateFromOdoo', files(), cur4);
  if (res2.ok && res2.ops && res2.ops.length) k.commit(S, res2.ops, { ws: 'odoo_form' });
  check('RERUN', 'refused', 'a second Process is refused and the tenant is unchanged', !res2.ok && J(counts()) === J(C1), { ok: res2.ok, msg: String(res2.msg).slice(0, 200) });
  verdict('RERUN');

  var v = ['PLUG', 'PICK', 'UNITS', 'SUMMARY', 'SELECT', 'RUN', 'RERUN'].map(verdict), all = !ALL.judged ? 'INCONCLUSIVE' : ALL.failed ? 'FAIL' : 'PASS';
  say('§OF-VERDICT ' + all + ' judged=' + ALL.judged + ' failed=' + ALL.failed + ' cases=' + J(v));
  process.exit(all === 'PASS' ? 0 : all === 'INCONCLUSIVE' ? 3 : 1);
})().catch(function (e) { say('§OF-VERDICT FAIL threw ' + (e && e.stack || e)); process.exit(1); });
