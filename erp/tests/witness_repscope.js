#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-REPSCOPE (bim-compiler prompts/FINANCIALS_GROUNDING.md §REPSCOPE-SPEC). READ THE LOG after every run: every verdict is a §REPSCOPE line.
// THE ISSUE it proves/disproves: the Reports-menu Trial Balance and the financial statements (report_overlay.js) read Fact_Acct / C_ElementValue / C_Period / PA_* of EVERY client, so a tenant's user sees other
//   tenants' accounts and amounts (legacy: TrialBalance.java:400,454 `WHERE AD_Client_ID=getAD_Client_ID()`; dictionary rows under MRole.addAccessSQL). One DB holds GardenWorld (11), seed client 13, a BORN tenant
//   (genesis) and a MIGRATED tenant (Odoo fixture). For each tenant X the REAL report_overlay.js browser code (vm-loaded, window.APP.clientId=X) renders its Trial Balance; expected values are independent SQL over X's
//   own rows. R1 account set, R2 totals (cents), R3 names/chart size, R4 another tenant's facts moved -> X unchanged, R5 GardenWorld == its own seed sum (46 574.97), R6 statement for GW unmoved by a
//   foreign fact on a GW account + a tenant with no PA_Report gets none, R7 opts.factRows seam. MUTANT: REPSCOPE_MUT=unscoped (clientPred returns '') must FAIL R1/R2/R4. REPSCOPE_SRC=<file> runs another source
//   (RED run = origin/main's report_overlay.js). INCONCLUSIVE when fewer than 3 tenants hold facts. Command: node erp/tests/witness_repscope.js 2>&1 | tee /tmp/count_logs/mig_repscope.log
'use strict';
process.env.WS_ID_LAW = process.env.WS_ID_LAW || 'synthetic';
var fs = require('fs'), path = require('path'), url = require('url'), vm = require('vm');
if (!global.window) global.window = {};
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
var ERP = process.env.ERP_DIR || path.join(__dirname, '..'), FIXD = path.join(__dirname, 'fixtures', 'odoo_export_2026-11-10');
var _log = console.log, SHIPPED = []; console.log = function () { var l = Array.prototype.join.call(arguments, ' '); if (/^§(MIG-|E1-STOCK|ODOO-FORM run|IMPORT_|PROC-)/.test(l)) SHIPPED.push(l); };
function say(s) { _log(s); }
var ALL = { judged: 0, failed: 0 };
function J(x) { return JSON.stringify(x); }
function check(key, rule, ok, info) { ALL.judged++; if (!ok) ALL.failed++; say('  §REPSCOPE-CHECK key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' rule="' + rule + '"' + (ok ? '' : ' got=' + String(J(info)).slice(0, 1500))); }
var cents = function (v) { return Math.round(Number(v || 0) * 100); }, money = function (c) { return (c / 100).toFixed(2); };
// golden GardenWorld numbers: SUM(amtacctdr/cr) of the seed's client-11 Fact_Acct = 46 574.97 (FINANCIALS_GROUNDING.md RESULT trail, sqlite3 -readonly erp/ad_seed.db) - the figure GW's own TB showed before any other tenant existed.
var GOLD = { tbDr: 4657497, tbCr: 4657497 };

(async function main() {
  var K = require(path.join(ERP, 'ws_kernel.js')), k = await K.load(), db = k.db, ML = k.ML, AP = require(path.join(ERP, 'ad_process.js'));
  (fs.readFileSync(path.join(ERP, 'idempiere.html'), 'utf8').match(/<script src="(model_[a-z_]+\.js)/g) || []).forEach(function (m) { try { require(path.join(ERP, m.replace('<script src="', ''))); } catch (e) {} });
  ['ImportInventory.js', 'ImportGLJournal.js', 'ImportInvoice.js', 'InOutGenerate.js', 'InvoiceGenerate.js'].forEach(function (f) { try { require(path.join(ERP, 'processes', f)); } catch (e) { say('§PAYSAVE-LOAD ' + f + ' not loadable: ' + e.message); } });
  var G = require(path.join(ERP, 'genesis.js')), PR = require(path.join(ERP, 'plugin_registry.js')), AF = require(path.join(ERP, 'ad_form_generic.js')), XLSX = require(path.join(ERP, 'xlsx.mini.min.js'));
  function q(sql, p) { return k.q(sql, p || []); }
  var shim = { prepare: function (sql) { return { all: function () { return q(sql); },
    run: function (row) { var b = {}; Object.keys(row || {}).forEach(function (x) { b['@' + x] = row[x] == null ? null : row[x]; }); var s = db.prepare(sql); try { s.bind(b); s.step(); } finally { s.free(); } } }; } };
  function birth(name) {
    var born = G.birthTenant({ clientName: name, currencyId: 100, currencyIso: 'USD', currencyPrecision: 2, adminUser: name.replace(/\W/g, '') + 'Admin', dateAcct: '2026-11-10', countryId: 100 });
    var rb = G.rebandGenesis({ groups: born.groups, refs: born.refs, input: born.input, tip: born.tip }, { clientId: G.nextClientId(shim) });
    G.mergeGenesisInto(rb.groups, shim, { now: '2026-11-10 09:00:00', user: 100, initialDefaults: ML.initialDefaultsOf });
    var R = rb.refs; return { clientId: R.clientId, orgId: R.orgId, userId: R.userId || 100, roleId: R.roleAdminId, actor: 'witness:migration-recover' };
  }
  var hostDb = { query: function (sql, p) { return q(sql, p); }, run: function (sql, p) { db.run(sql, p || []); } };
  var host = { engineVersion: '1.0.0', db: hostDb, ops: { append: function () { return 1; } }, process: AP, docAction: ML, form: AF,
    import: function (u) { return import(url.pathToFileURL(path.resolve(path.join(ERP, 'plugins'), u)).href); } };
  var reg = PR.create(host);
  await reg.installBundle(await import(url.pathToFileURL(path.join(ERP, 'plugins', 'ninja_migrate.mjs')).href)); await reg.startBundle('org.idempiere.ninja.migrate');
  await reg.installBundle(await import(url.pathToFileURL(path.join(ERP, 'plugins', 'odoo_migrate.mjs')).href)); await reg.startBundle('org.kernel.odoo.migrate');
  var CLS = 'org.kernel.odoo.MigrateFromOdoo', D = AF.get(CLS);
  var wbuf = fs.readFileSync(path.join(FIXD, 'odoo_migration.xlsx')), man = JSON.parse(fs.readFileSync(path.join(FIXD, 'manifest.json'), 'utf8')), EXP = JSON.parse(fs.readFileSync(path.join(FIXD, 'odoo_export.json'), 'utf8'));
  function files(exp) { return { Files: [{ name: 'odoo_export.json', size: 1, data: exp || EXP }] }; }   // the CURRENT flow: odoo_export.json alone (the whole book from the engine, stock cost included); the older workbook path carries no cost
  var CUT = EXP.manifest.cutover, ANS = { Units: 'Each', Days: 'Day', Hours: 'Hour' };
  function session(S, loginDate) {
    var withT = function (fn) { return fn(k.q, Object.assign(k.env(S), { date: loginDate + ' 00:00:00' })); };
    return { S: S, rows: function (params, cur) { return AF.read(withT, function (trx) { return D.rows(trx, params, cur); }); },
      execute: function (params, cur) { var r = AF.execute(withT, CLS, params, cur); if (r.ok && r.ops && r.ops.length) k.commit(S, r.ops, { ws: 'open_balances' }); return r; },
      after: function (params, cur) { var r = AF.executeAfter(withT, CLS, params, cur); if (r.ok && r.ops && r.ops.length) k.commit(S, r.ops, { ws: 'open_balances' }); return r; } };
  }
  function answer(rs) { return rs.map(function (r) { var o = { key: r.key, selected: r.selected }; if (r.erpunit !== undefined) { var u = r.item.replace(/^Unit: /, ''); o.erpunit = ANS[u] != null ? ANS[u] : r.erpunit; } return o; }); }

  function full(S, exp) { var ses = S._ses, f = files(exp), cur = answer(ses.rows(f, null)), r = ses.execute(f, cur), a = r.ok ? ses.after(f, cur) : { ok: false, msg: 'stage 1 refused: ' + r.msg }; return { r: r, a: a, rows: ses.rows(f, cur) }; }
  function mk(name) { var T = birth(name); T._ses = session(T, '2026-11-11'); return T; }

  // ── tenants: GW 11, seed 13, BORN, MIGRATED ───────────────────────────────────────────────────────
  var BORN = birth('Born Co'), MIGT = mk('Trade Co'), FM = full(MIGT);
  say('§REPSCOPE-SETUP migrated stage1=' + FM.r.ok + ' stage2=' + FM.a.ok + ' ' + String(FM.a.msg).slice(0, 100));
  // BORN has no postings of its own yet: give it two balanced journal facts on ITS OWN chart (witness fixture rows, distinct amounts)
  var bacc = q('SELECT c_elementvalue_id AS id FROM c_elementvalue WHERE ad_client_id=? AND issummary=? ORDER BY c_elementvalue_id', [BORN.clientId, 'N']).slice(0, 2).map(function (r) { return r.id; });
  var bas = q('SELECT c_acctschema_id AS id FROM c_acctschema WHERE ad_client_id=?', [BORN.clientId])[0];
  var fid = q('SELECT MAX(fact_acct_id) AS m FROM fact_acct')[0].m || 0;
  function addFact(cl, acc, dr, cr, sch, per) { fid++; db.run('INSERT INTO fact_acct(fact_acct_id,ad_client_id,ad_org_id,c_acctschema_id,account_id,c_period_id,ad_table_id,record_id,line_id,postingtype,amtsourcedr,amtsourcecr,amtacctdr,amtacctcr,qty) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [fid, cl, 0, sch, acc, per, 318, 900000 + fid, 0, 'A', dr, cr, dr, cr, 0]); return fid; }
  if (bacc.length === 2 && bas) { addFact(BORN.clientId, bacc[0], 1234.56, 0, bas.id, null); addFact(BORN.clientId, bacc[1], 0, 1234.56, bas.id, null); }
  var TEN = { GW: 11, SEED13: 13, BORN: BORN.clientId, MIG: MIGT.clientId };
  var withFacts = Object.keys(TEN).filter(function (t) { return q('SELECT count(*) AS n FROM fact_acct WHERE ad_client_id=?', [TEN[t]])[0].n > 0; });
  say('§REPSCOPE-TENANTS ' + J(TEN) + ' withFacts=' + withFacts.join(','));

  // ── the real report_overlay.js, vm-loaded with a DOM stub ────────────────────────────────────────────
  function loadOverlay(srcText) {
    var logs = [];
    function el() { var e = { style: {}, className: '', innerHTML: '', textContent: '', children: [], dataset: {}, appendChild: function (c) { e.children.push(c); return c; }, addEventListener: function () {}, removeEventListener: function () {}, setAttribute: function () {}, getAttribute: function () { return null; },
      querySelectorAll: function () { return []; }, querySelector: function () { return null; }, classList: { add: function () {}, remove: function () {}, toggle: function () {}, contains: function () { return false; } } }; return e; }
    var ctx = { console: { log: function () { logs.push(Array.prototype.join.call(arguments, ' ')); }, warn: function () { logs.push('WARN ' + Array.prototype.join.call(arguments, ' ')); }, error: function () {} },
      document: { createElement: el, body: el(), head: el(), addEventListener: function () {}, getElementById: function () { return null; }, querySelectorAll: function () { return []; } },
      withBundle: function (cb) { cb(db); }, setTimeout: setTimeout, clearTimeout: clearTimeout, Math: Math, Number: Number, String: String, Object: Object, Array: Array, JSON: JSON, isFinite: isFinite, parseInt: parseInt, parseFloat: parseFloat, Set: Set, Map: Map, Date: Date, RegExp: RegExp, Error: Error };
    var BDm = require(path.join(ERP, 'bigdecimal.js')); ctx.BigDecimal = BDm.BigDecimal || BDm; ctx.window = ctx; ctx.addEventListener = function () {}; ctx.APP = {};
    vm.createContext(ctx); vm.runInContext(srcText, ctx, { filename: 'report_overlay.js' });
    return { ctx: ctx, logs: logs, R: ctx.__report };
  }
  var SRCF = process.env.REPSCOPE_SRC || path.join(ERP, 'report_overlay.js'), SRC = fs.readFileSync(SRCF, 'utf8'), MUTN = process.env.REPSCOPE_MUT || '';
  if (MUTN === 'unscoped') { var before = SRC; SRC = SRC.replace(/(function clientPred\(db, table, alias\) \{)/, '$1 return \'\';'); if (SRC === before) { say('§REPSCOPE-VERDICT INCONCLUSIVE judged=0 failed=0 (mutant did not apply)'); process.exit(2); } }
  var OV = loadOverlay(SRC);
  say('§REPSCOPE-CONFIG src=' + SRCF + ' mutant=' + (MUTN || 'none') + ' hasScopeSeam=' + /function clientPred/.test(SRC));
  function tbFor(cid) {   // the real Trial Balance panel for session client cid
    OV.ctx.APP.clientId = cid; OV.logs.length = 0; OV.R.trialBalance();
    var html = OV.R.panel().innerHTML, rows = [], m, re = /<tr><td>([^<]*)<\/td><td>([^<]*)<\/td><td class=rpr>([^<]*)<\/td><td class=rpr>([^<]*)<\/td><\/tr>/g;
    while ((m = re.exec(html))) rows.push({ value: m[1], name: m[2], dr: cents(m[3]), cr: cents(m[4]) });
    var g = /Σ Dr \/ Σ Cr<\/span><span>([\d.,-]+) \/ ([\d.,-]+)</.exec(html), lg = OV.logs.filter(function (l) { return /^§REPSCOPE tb/.test(l); })[0] || '';
    return { rows: rows, totDr: g ? cents(g[1]) : null, totCr: g ? cents(g[2]) : null, accounts: (/accounts=(\d+)/.exec(lg) || [])[1] != null ? Number(/ accounts=(\d+)/.exec(lg)[1]) : null, log: lg };
  }
  function expected(cid) {   // independent SQL over X's own rows
    var r = q('SELECT ev.value AS v, ev.name AS nm, SUM(f.amtacctdr) AS dr, SUM(f.amtacctcr) AS cr FROM fact_acct f JOIN c_elementvalue ev ON ev.c_elementvalue_id=f.account_id WHERE f.ad_client_id=? GROUP BY ev.c_elementvalue_id ORDER BY ev.value', [cid]);
    return { accts: r.map(function (x) { return x.v; }).sort(), names: r.map(function (x) { return x.v + '|' + x.nm; }).sort(), dr: cents(q('SELECT SUM(amtacctdr) AS s FROM fact_acct WHERE ad_client_id=?', [cid])[0].s), cr: cents(q('SELECT SUM(amtacctcr) AS s FROM fact_acct WHERE ad_client_id=?', [cid])[0].s),
      chart: q('SELECT count(*) AS n FROM c_elementvalue WHERE ad_client_id IN (0,?)', [cid])[0].n };
  }
  if (withFacts.length < 3) { say('§REPSCOPE-VERDICT INCONCLUSIVE judged=0 failed=0 (fewer than 3 tenants hold Fact_Acct: ' + withFacts.join(',') + ')'); process.exit(2); }
  var PRE = {};
  withFacts.forEach(function (t) {
    var c = TEN[t], E = expected(c), T = tbFor(c); PRE[t] = T;
    say('§REPSCOPE-TB tenant=' + t + '(' + c + ') shownAccts=' + T.rows.length + ' expAccts=' + E.accts.length + ' shownDr=' + money(T.totDr) + ' expDr=' + money(E.dr) + ' shownCr=' + money(T.totCr) + ' expCr=' + money(E.cr) + ' chart=' + T.accounts + '/' + E.chart);
    check(t + '.R1', 'TB account set == accounts of ' + t + ' fact rows (independent SQL)', J(T.rows.map(function (r) { return r.value; }).sort()) === J(E.accts), { shown: T.rows.map(function (r) { return r.value; }).sort().slice(0, 12), exp: E.accts.slice(0, 12) });
    check(t + '.R2', 'TB total Dr and Cr (cents) == SUM of ' + t + ' fact rows', T.totDr === E.dr && T.totCr === E.cr, { shown: [T.totDr, T.totCr], exp: [E.dr, E.cr] });
    check(t + '.R3', 'TB account names are ' + t + "'s chart rows; accounts map holds only client 0/" + c + ' rows', J(T.rows.map(function (r) { return r.value + '|' + r.name; }).sort()) === J(E.names) && T.accounts === E.chart, { chart: [T.accounts, E.chart] });
  });
  // R4: tenant B's books move (a big foreign row) -> A's TB byte-equal
  var A = 'BORN', Bt = 'GW';
  var accB = q('SELECT account_id AS a, c_acctschema_id AS s, c_period_id AS p FROM fact_acct WHERE ad_client_id=? ORDER BY amtacctdr DESC LIMIT 1', [TEN.GW])[0];
  var big = addFact(TEN.MIG, accB.a, 987654.32, 0, accB.s, accB.p);   // a MIGRATED-tenant row on a GardenWorld account id
  var after = {}; withFacts.forEach(function (t) { after[t] = tbFor(TEN[t]); });
  withFacts.forEach(function (t) { if (t === 'MIG') return; check(t + '.R4', 'another tenant (MIG) posting a 987654.32 Dr row does not move ' + t + "'s Trial Balance", J(after[t].rows) === J(PRE[t].rows) && after[t].totDr === PRE[t].totDr && after[t].totCr === PRE[t].totCr, { pre: [PRE[t].totDr, PRE[t].totCr], post: [after[t].totDr, after[t].totCr] }); });
  // R5: GardenWorld's own TB == golden measured before the fix
  var gw = after.GW;
  say('§REPSCOPE-GOLDEN gw tbDr=' + gw.totDr + ' tbCr=' + gw.totCr + ' accts=' + gw.rows.length);
  check('GW.R5', 'GardenWorld TB unchanged vs before the fix (golden = GW own seed sum, cents)', gw.totDr === GOLD.tbDr && gw.totCr === GOLD.tbCr, { got: [gw.totDr, gw.totCr], gold: [GOLD.tbDr, GOLD.tbCr] });
  // R6: statements — GW's PA_Report folds; the foreign row is on a GW account id so an unscoped statement moves
  OV.ctx.APP.clientId = TEN.GW;
  var reps = q('SELECT pa_report_id AS id FROM pa_report WHERE ad_client_id=? ORDER BY pa_report_id', [TEN.GW]);
  function stmtCells(cid, rid) { OV.ctx.APP.clientId = cid; var o = OV.R.fold(rid, {}); return o ? J(o.lines.map(function (l) { return l.cells; })) : null; }
  db.run('DELETE FROM fact_acct WHERE fact_acct_id=?', [big]);
  var base = reps.map(function (r) { return stmtCells(TEN.GW, r.id); });
  var bigAgain = addFact(TEN.MIG, accB.a, 987654.32, 0, accB.s, accB.p);
  var moved = reps.map(function (r) { return stmtCells(TEN.GW, r.id); });
  check('GW.R6a', 'every GardenWorld PA_Report (' + reps.length + ') folds to the same cells with/without another tenant\'s fact on a GW account', reps.length > 0 && base.every(function (b, i) { return b != null && b === moved[i]; }), { reps: reps.length, diffAt: base.map(function (b, i) { return b === moved[i] ? null : i; }).filter(function (x) { return x != null; }) });
  var picker = OV.R.fold(reps[0].id, {});   // GW still folds (non-vacuous)
  check('GW.R6b', 'GardenWorld statement is non-vacuous (>0 lines, cells folded)', !!picker && picker.lines.length > 0 && picker.lines.some(function (l) { return l.cells.some(function (c) { return c != null && Number(c) !== 0; }); }), { lines: picker && picker.lines.length });
  OV.ctx.APP.clientId = TEN.BORN;
  var bornFold = OV.R.fold(reps[0].id, {});
  check('BORN.R6c', "a tenant that does not own the PA_Report cannot fold GardenWorld's statement (legacy: PA_Report is client data)", bornFold == null, { got: bornFold && bornFold.title });
  // R7: opts.factRows seam — mixed-client rows, tenant 11 keeps only its own
  var seamRows = [{ account_id: accB.a, amtacctdr: 5, amtacctcr: 0, c_period_id: accB.p, c_acctschema_id: accB.s, postingtype: 'A', ad_client_id: 11 }, { account_id: accB.a, amtacctdr: 777, amtacctcr: 0, c_period_id: accB.p, c_acctschema_id: accB.s, postingtype: 'A', ad_client_id: 13 }];
  OV.ctx.APP.clientId = TEN.GW; OV.logs.length = 0; OV.R.fold(reps[0].id, { factRows: seamRows });
  var sl = OV.logs.filter(function (l) { return /^§REPSCOPE seam/.test(l); })[0] || '';
  check('GW.R7', 'opts.factRows seam: of 2 mixed-client rows only the session client\'s survives', /kept=1 dropped=1/.test(sl), { log: sl });
  db.run('DELETE FROM fact_acct WHERE fact_acct_id=?', [bigAgain]);
  say('§REPSCOPE-VERDICT ' + (!ALL.judged ? 'INCONCLUSIVE' : ALL.failed ? 'FAIL' : 'PASS') + ' judged=' + ALL.judged + ' failed=' + ALL.failed + ' mutant=' + (MUTN || 'none') + ' tenants=' + withFacts.join(','));
  process.exit(ALL.failed || !ALL.judged ? 1 : 0);
})().catch(function (e) { say('§REPSCOPE-VERDICT FAIL judged=' + ALL.judged + ' failed=' + (ALL.failed + 1) + ' threw ' + (e && e.stack || e)); process.exit(1); });
