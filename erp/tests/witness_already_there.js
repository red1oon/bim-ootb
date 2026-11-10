#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-ALREADY-THERE (bim-compiler prompts/MIGRATE_INSTALL_TENANT.md §ALREADY-THERE-SPEC + §KEEP-UNIT-SPEC). READ THE LOG after every run: every verdict is a §AT
//   line; the exit code is not the evidence. INCONCLUSIVE when nothing was judged. AT_ERP=<dir> runs the same scenario against another checkout (the BEFORE line).
// THE ISSUES it proves/disproves:
//   ALREADY  A new client already holds some keys (Initial Client Setup makes the payment term "Immediate", the partner / category / price list "Standard", its accounts). A migrated
//            row with such a key is refused by the unique index — rightly — but the all-or-nothing loader then refused the WHOLE migration (falsifier: 315 GardenWorld rows).
//            Claim: that row is shown as "already there" on the summary and skipped; everything else loads; the summary's prediction == what the tenant gains; the tenant still
//            has exactly ONE row with that key (its own). A key repeated INSIDE the file is NOT excused: still refused, nothing loads.
//   KEEP-UNIT A source unit with no ERP equivalent could only be mapped to an existing unit — a product in such a unit blocked the file. Claim: with a code typed in "New unit
//            code" the unit is created with that code and its products use it; a code longer than 4 characters, or one an ERP unit already has, is refused with the reason;
//            with neither an ERP unit nor a code the question stays (nothing loads).
// Source: the recorded Odoo export fixtures/odoo_export_2026-11-09 (workbook + manifest), changed in memory only as each case says.
'use strict';
var fs = require('fs'), path = require('path'), url = require('url');
if (!global.window) global.window = {};
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
var ERP = process.env.AT_ERP || path.join(__dirname, '..'), FIXD = path.join(__dirname, 'fixtures', 'odoo_export_2026-11-09');
var _log = console.log; console.log = function () {};
function say(s) { _log(s); }
var CASES = {}, ALL = { judged: 0, failed: 0 }, J = JSON.stringify;
function check(cs, key, rule, ok, info) { var c = CASES[cs] = CASES[cs] || { judged: 0, failed: 0 }; c.judged++; ALL.judged++; if (!ok) { c.failed++; ALL.failed++; }
  say('  §AT-CHECK case=' + cs + ' key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' rule="' + rule + '"' + (ok ? '' : ' got=' + String(J(info)).slice(0, 1200))); }
function verdict(cs) { var c = CASES[cs] || { judged: 0, failed: 0 }, v = !c.judged ? 'INCONCLUSIVE' : c.failed ? 'FAIL' : 'PASS'; say('§AT-' + cs + ' verdict=' + v + ' judged=' + c.judged + ' failed=' + c.failed); return v; }

(async function main() {
  var K = require(path.join(ERP, 'ws_kernel.js')), k = await K.load(), db = k.db, ML = k.ML, AP = require(path.join(ERP, 'ad_process.js'));
  (fs.readFileSync(path.join(ERP, 'idempiere.html'), 'utf8').match(/<script src="(model_[a-z_]+\.js)/g) || []).forEach(function (m) { try { require(path.join(ERP, m.replace('<script src="', ''))); } catch (e) {} });
  try { require(path.join(ERP, 'processes', 'ImportInventory.js')); } catch (e) {}
  var G = require(path.join(ERP, 'genesis.js')), PR = require(path.join(ERP, 'plugin_registry.js')), AF = require(path.join(ERP, 'ad_form_generic.js')), XLSX = require(path.join(ERP, 'xlsx.mini.min.js'));
  function q(sql, p) { return k.q(sql, p || []); }
  var shim = { prepare: function (sql) { return { all: function () { return q(sql); }, run: function (row) { var b = {}; Object.keys(row || {}).forEach(function (x) { b['@' + x] = row[x] == null ? null : row[x]; }); var s = db.prepare(sql); try { s.bind(b); s.step(); } finally { s.free(); } } }; } };
  function birth(name) { var born = G.birthTenant({ clientName: name, currencyId: 100, currencyIso: 'USD', currencyPrecision: 2, adminUser: name.replace(/\W/g, '') + 'Admin', dateAcct: '2026-11-09', countryId: 100 });
    var rb = G.rebandGenesis({ groups: born.groups, refs: born.refs, input: born.input, tip: born.tip }, { clientId: G.nextClientId(shim) });
    G.mergeGenesisInto(rb.groups, shim, { now: '2026-11-09 09:00:00', user: 100, initialDefaults: ML.initialDefaultsOf }); var R = rb.refs;
    return { clientId: R.clientId, orgId: R.orgId, userId: R.userId || 100, roleId: R.roleAdminId, actor: 'witness:already-there' }; }
  var host = { engineVersion: '1.0.0', db: { query: function (sql, p) { return q(sql, p); }, run: function (sql, p) { db.run(sql, p || []); } }, ops: { append: function () { return 1; } }, process: AP, docAction: ML, form: AF,
    import: function (u) { return import(url.pathToFileURL(path.resolve(path.join(ERP, 'plugins'), u)).href); } };
  var reg = PR.create(host);
  await reg.installBundle(await import(url.pathToFileURL(path.join(ERP, 'plugins', 'ninja_migrate.mjs')).href)); await reg.startBundle('org.idempiere.ninja.migrate');
  await reg.installBundle(await import(url.pathToFileURL(path.join(ERP, 'plugins', 'odoo_migrate.mjs')).href)); await reg.startBundle('org.kernel.odoo.migrate');
  var CLS = 'org.kernel.odoo.MigrateFromOdoo', D = AF.get(CLS);
  var wbuf = fs.readFileSync(path.join(FIXD, 'odoo_migration.xlsx')), man = JSON.parse(fs.readFileSync(path.join(FIXD, 'manifest.json'), 'utf8'));
  // files(edit): the recorded workbook with edit(sheetName → rows AOA) applied in memory; the manifest's row counts follow the edit (it is the export's own count of the same rows)
  function files(edit) { var wb = XLSX.read(wbuf), m = JSON.parse(J(man));
    if (edit) wb.SheetNames.forEach(function (nm) { var rows = XLSX.utils.sheet_to_json(wb.Sheets[nm], { header: 1, raw: false, defval: '' }), r2 = edit(nm, rows); if (r2) { wb.Sheets[nm] = XLSX.utils.aoa_to_sheet(r2); m.sheets.forEach(function (x) { if (x.sheet === nm) x.rows = r2.length - 1; }); } });
    return { Files: [{ name: 'odoo_migration.xlsx', size: wbuf.length, data: wb }, { name: 'manifest.json', size: 1, data: m }] }; }
  function session(S) { var withT = function (fn) { return fn(k.q, k.env(S)); };
    return { rows: function (p, c) { return AF.read(withT, function (trx) { return D.rows(trx, p, c); }); },
      run: function (p, c) { var r = AF.execute(withT, CLS, p, c); if (r.ok && r.ops && r.ops.length) k.commit(S, r.ops, { ws: 'already_there' }); var a = r.ok ? AF.executeAfter(withT, CLS, p, c) : { ok: false, msg: 'stage 1 refused' }; if (a.ok && a.ops && a.ops.length) k.commit(S, a.ops, { ws: 'already_there' }); return { s1: r, s2: a }; } }; }
  function answer(rs, ans, codes) { return rs.map(function (r) { var o = { key: r.key, selected: r.selected }; if (r.erpunit !== undefined) { var u = r.item.replace(/^Unit: /, ''); o.erpunit = ans[u] != null ? ans[u] : r.erpunit; if (codes && codes[u] != null) o.newcode = codes[u]; } return o; }); }
  var TABLES = man.sheets.map(function (s) { return s.table; }), ANS = { Units: 'Each', Days: 'Day', Hours: 'Hour' };
  function counts(C) { var o = {}; TABLES.forEach(function (t) { o[t] = q('SELECT count(*) AS n FROM ' + t.toLowerCase() + ' WHERE ad_client_id=?', [C])[0].n; }); return o; }
  var sheetsOf = function (rs) { return rs.filter(function (r) { return r.key > 100 && r.key < 900; }); }, probs = function (rs) { return rs.filter(function (r) { return /^⚠/.test(r.item); }).map(function (r) { return r.item; }); };

  // ═══ ALREADY ═══
  var T1 = birth('Already Co'), C1 = T1.clientId, s1 = session(T1), own = q('SELECT value, name FROM c_paymentterm WHERE ad_client_id=? ORDER BY c_paymentterm_id', [C1])[0];
  var clash = function (nm, rows) { if (!/C_PaymentTerm$/.test(nm)) return null; var vi = rows[0].indexOf('Value'), ni = rows[0].indexOf('Name'); rows[1][vi] = own.value; rows[1][ni] = own.name; return rows; };
  var r1 = s1.rows(files(clash), null), cur = answer(r1, ANS), r2 = s1.rows(files(clash), cur), pt = sheetsOf(r2).filter(function (x) { return x.item === 'C_PaymentTerm'; })[0] || {}, C0 = counts(C1);
  say('§AT-ALREADY tenant=' + C1 + ' own_term=' + J(own) + ' summary: problems=' + J(probs(r2)) + ' C_PaymentTerm=' + J({ infile: pt.infile, will: pt.will, already: pt.already, refused: pt.refused, reason: pt.reason }) + ' erp=' + ERP);
  check('ALREADY', 'summary', 'a payment term whose key the new client already holds ("' + own.value + '") is shown as 1 "already there", not as a refusal, and every other row of every sheet is predicted to load', probs(r2).length === 0 && pt.already === 1 && pt.will === pt.infile - 1 && !pt.refused && /already in this tenant/.test(pt.reason || '') && sheetsOf(r2).every(function (x) { return x.item === 'C_UOM' || x.item === 'C_PaymentTerm' || (x.will === x.infile && !x.refused); }), { pt: pt, probs: probs(r2) });
  var pred = {}; sheetsOf(r2).forEach(function (x) { pred[x.item] = x.will; });
  var run1 = s1.run(files(clash), cur), Cn = counts(C1), gain = {}; TABLES.forEach(function (t) { gain[t] = Cn[t] - C0[t]; });
  say('§AT-ALREADY run stage1=' + run1.s1.ok + ' stage2=' + run1.s2.ok + ' msg=' + String(run1.s1.msg).slice(0, 160));
  check('ALREADY', 'loads', 'Process loads the rest (stage 1 and stage 2 end without a refusal) — before this change the whole run was refused for that one key', run1.s1.ok && run1.s2.ok, { s1: run1.s1.msg, s2: run1.s2.msg });
  check('ALREADY', 'summary==result', 'for every one of the 17 tables the tenant gained exactly what the summary predicted', run1.s1.ok && TABLES.every(function (t) { return gain[t] === pred[t]; }), TABLES.filter(function (t) { return gain[t] !== pred[t]; }).map(function (t) { return t + ' gain ' + gain[t] + ' predicted ' + pred[t]; }));
  var nOwn = q('SELECT count(*) AS n FROM c_paymentterm WHERE ad_client_id=? AND value=?', [C1, own.value])[0].n;
  check('ALREADY', 'one-row', 'the tenant still has exactly ONE payment term with that key (its own row, untouched)', nOwn === 1, nOwn);
  verdict('ALREADY');
  // a key repeated INSIDE the file (not a row of the tenant): still refused whole
  var T2 = birth('Repeat Co'), C2 = T2.clientId, s2 = session(T2), B0 = counts(C2);
  var repeat = function (nm, rows) { if (!/C_PaymentTerm$/.test(nm)) return null; var vi = rows[0].indexOf('Value'), ni = rows[0].indexOf('Name'); rows[2][vi] = rows[1][vi]; rows[2][ni] = rows[1][ni]; return rows; };   // the term's unique key is its Name (legacy index c_paymentterm_name)
  var q1 = s2.rows(files(repeat), null), qc = answer(q1, ANS), q2 = s2.rows(files(repeat), qc), pt2 = sheetsOf(q2).filter(function (x) { return x.item === 'C_PaymentTerm'; })[0] || {}, run2 = s2.run(files(repeat), qc);
  say('§AT-REPEAT C_PaymentTerm=' + J({ will: pt2.will, already: pt2.already, refused: pt2.refused, reason: String(pt2.reason || '').slice(0, 120) }) + ' stage1=' + run2.s1.ok);
  check('REPEAT', 'still-refused', 'a key that appears twice INSIDE the file is not "already there": the sheet shows a refusal (duplicate key), no row is excused, Process is refused and the tenant is unchanged', !pt2.already && pt2.refused >= 1 && /duplicate key/.test(pt2.reason || '') && !run2.s1.ok && J(counts(C2)) === J(B0), { pt2: pt2, ok: run2.s1.ok });
  verdict('REPEAT');

  // ═══ KEEP-UNIT ═══
  var T3 = birth('Unit Co'), C3 = T3.clientId, s3 = session(T3), u1 = s3.rows(files(), null);
  var unitRow = function (rs, u) { return rs.filter(function (r) { return r.item === 'Unit: ' + u; })[0] || {}; };
  var noAns = s3.rows(files(), answer(u1, { Units: '', Days: 'Day', Hours: 'Hour' })), longC = s3.rows(files(), answer(u1, { Units: '', Days: 'Day', Hours: 'Hour' }, { Units: 'TOOLONG' }));
  var taken = q("SELECT x12de355 AS c FROM c_uom WHERE name='Each' AND ad_client_id IN (0,?)", [C3])[0].c, takenC = s3.rows(files(), answer(u1, { Units: '', Days: 'Day', Hours: 'Hour' }, { Units: taken }));
  check('KEEP-UNIT', 'question-stays', 'with neither an ERP unit nor a code the unit row asks for one of the two and nothing is predicted to load', /or give a code/.test(unitRow(noAns, 'Units').reason || '') && probs(noAns).some(function (t) { return /Answer the unit/.test(t); }) && sheetsOf(noAns).every(function (x) { return !x.will; }), { reason: unitRow(noAns, 'Units').reason, probs: probs(noAns) });
  check('KEEP-UNIT', 'bad-codes', 'a code longer than 4 characters, and a code an ERP unit already has ("' + taken + '"), are each refused on the unit row with the reason', /at most 4/.test(unitRow(longC, 'Units').reason || '') && /already a unit/.test(unitRow(takenC, 'Units').reason || '') && probs(longC).length > 0 && probs(takenC).length > 0, { long: unitRow(longC, 'Units').reason, taken: unitRow(takenC, 'Units').reason });
  var kc = answer(u1, { Units: '', Days: 'Day', Hours: 'Hour' }, { Units: 'ZZ1' }), k2 = s3.rows(files(), kc), uomSheet = sheetsOf(k2).filter(function (x) { return x.item === 'C_UOM'; })[0] || {}, runK = s3.run(files(), kc);
  var made = q("SELECT c_uom_id AS id, name, x12de355 AS c FROM c_uom WHERE ad_client_id=? AND name='Units'", [C3]), inFile = unitRow(u1, 'Units').infile, usedBy = made.length ? q('SELECT count(*) AS n FROM m_product WHERE ad_client_id=? AND c_uom_id=?', [C3, made[0].id])[0].n : 0;
  say('§AT-KEEP-UNIT summary: problems=' + J(probs(k2)) + ' C_UOM will=' + uomSheet.will + ' unit_row=' + J(unitRow(k2, 'Units').reason) + ' run stage1=' + runK.s1.ok + ' stage2=' + runK.s2.ok + ' made=' + J(made) + ' products_using_it=' + usedBy + ' in_file="' + inFile + '"');
  check('KEEP-UNIT', 'kept', 'with the code ZZ1 the summary has no problem, predicts 1 new unit, and Process creates the unit "Units" with that code in this tenant', probs(k2).length === 0 && uomSheet.will === 1 && runK.s1.ok && runK.s2.ok && made.length === 1 && made[0].c === 'ZZ1', { probs: probs(k2), uom: uomSheet, made: made, msg: runK.s1.msg });
  check('KEEP-UNIT', 'products', 'the products the file had in that unit (' + inFile + ') point at the new unit', usedBy > 0 && String(inFile).indexOf(String(usedBy)) === 0, { usedBy: usedBy, inFile: inFile });
  verdict('KEEP-UNIT');

  var v = ['ALREADY', 'REPEAT', 'KEEP-UNIT'].map(function (c) { var x = CASES[c] || {}; return !x.judged ? 'INCONCLUSIVE' : x.failed ? 'FAIL' : 'PASS'; });
  var all = v.indexOf('FAIL') >= 0 ? 'FAIL' : v.indexOf('INCONCLUSIVE') >= 0 ? 'INCONCLUSIVE' : 'PASS';
  say('§AT-VERDICT ' + all + ' judged=' + ALL.judged + ' failed=' + ALL.failed + ' cases=' + J(v));
  process.exit(all === 'PASS' ? 0 : all === 'INCONCLUSIVE' ? 3 : 1);
})().catch(function (e) { say('§AT-VERDICT FAIL threw ' + (e && e.stack || e)); process.exit(1); });
