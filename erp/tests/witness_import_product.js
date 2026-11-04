#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-IMPORT-PRODUCT (bim-compiler prompts/POS_PLUGIN_LOCAL_FIRST.md §30; CARDINAL RULE: the twin does what legacy iDempiere does). READ THE LOG after every run: every verdict is a §IPROD line,
//   the exit code is not the evidence. A mutant that CRASHES is NOT a kill. INCONCLUSIVE when nothing was judged. Mutants: IPROD_MUTANTS=1 (copies of the tree, each edit proven applied exactly once).
// SPEC (written before the code; legacy file:line in processes/ImportProduct.js). Legacy: org.adempiere.base.process/src/org/compiere/process/ImportProduct.java (694 lines) = AD_Process 196 Import_Product.
//   TABLE  I_Product (AD_Table 532, 58 AD_Column rows) is in the seed WITHOUT a physical table; erp/ad_import_tables.js ensure(db) makes it at boot (outside the team base hash); wired in idempiere.html + sw.js.
//   P0     AD_Process 196 resolves to the ported class; its three parameters (AD_Client_ID, DeleteOldImported, M_PriceList_Version_ID) are exactly what prepare() :65-84 reads (X of N).
//   UPD    27 I_Product rows (Value + ImageURL) for existing GardenWorld products: each matches its product BY VALUE (:182), the product is UPDATED in place (:509-550: same M_Product_ID, Updated moves, no new product),
//          the row ends I_IsImported=Y with M_Product_ID; answer logs Errors 0 / Updated 27 / Inserted 0. LEGACY FACT (§30.4): the UPDATE does not set ImageURL - M_Product.ImageURL is what it was before (the INSERT path is the only one that sets it).
//   ERR    a Value that matches no product and has no Name -> the insert is refused: the row stays I_IsImported=N with I_ErrorMsg "Insert Product failed" (:495-507), no product is created; a good row in the same run is still imported.
//   RERUN  a plain re-run reads no Y row (:443): Updated 0, Inserted 0, no new product.
//   INS    an unknown Value WITH Name -> a NEW product is inserted (default category/UOM/tax category) and carries the row's ImageURL (MProduct.java:329).
// Command: node erp/tests/witness_import_product.js            (add IPROD_MUTANTS=1 for the mutant sweep)
'use strict';
var fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
if (!global.window) global.window = {};
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
var ERP = process.env.IPROD_ERP || path.join(__dirname, '..');
var MUTANT = process.env.IPROD_MUTANT || '';
var SQLJS_DIR = process.env.SQLJS_DIR || '/home/red1/bim-ootb/tests/node_modules/sql.js';
if (!process.env.SQLJS) process.env.SQLJS = SQLJS_DIR;
var initSqlJs = require(SQLJS_DIR);
var _log = console.log, SEEN = [];
console.log = function () { var s = Array.prototype.join.call(arguments, ' '); SEEN.push(s); };
function say(s) { _log(s); }
var CASES = {}, ALL = { judged: 0, failed: 0 };
function check(cs, key, rule, ok, info) {
  var c = CASES[cs] = CASES[cs] || { judged: 0, failed: 0 };
  c.judged++; ALL.judged++; if (!ok) { c.failed++; ALL.failed++; }
  say('  §IPROD-CHECK case=' + cs + ' key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' rule="' + rule + '"' + (ok ? '' : ' got=' + JSON.stringify(info)));
}
function verdict(cs) { var c = CASES[cs] || { judged: 0, failed: 0 }; var v = !c.judged ? 'INCONCLUSIVE' : c.failed ? 'FAIL' : 'PASS'; say('§IPROD-' + cs + ' verdict=' + v + ' judged=' + c.judged + ' failed=' + c.failed + (MUTANT ? ' mutant=' + MUTANT : '')); return v; }
function J(x) { return JSON.stringify(x); }
function guard(cs, key, rule, fn) { try { fn(); } catch (e) { check(cs, key, rule, false, 'threw: ' + (e && (e.message || e.stack) || String(e))); } }
function reqERP(f) { return require(path.join(ERP, f)); }
function read(f) { try { return fs.readFileSync(path.join(ERP, f), 'utf8'); } catch (e) { return ''; } }

(async function main() {
  var SQL = await initSqlJs({ locateFile: function (f) { return path.join(SQLJS_DIR, 'dist', f); } });
  var db = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(ERP, 'ad_seed.db'))));
  fs.readFileSync(path.join(ERP, 'patches/ad_seed.db.sql'), 'utf8').split(/;\s*\n/).forEach(function (st) { st = st.replace(/^\s*--[^\n]*\n?/gm, '').trim(); if (!st) return; try { db.run(st); } catch (e) {} });
  function q0(sql, params) { var st = db.prepare(sql), out = []; try { if (params && params.length) st.bind(params); while (st.step()) { var o = st.getAsObject(), r = {}; for (var k in o) r[k.toLowerCase()] = o[k]; out.push(r); } } finally { st.free(); } return out; }
  var AIT = reqERP('ad_import_tables.js');
  var LIST = JSON.parse(fs.readFileSync(path.join(ERP, 'product_icons', 'product_icons.json'), 'utf8')).products;
  say('§IPROD-LOAD erp=' + ERP + ' mutant=' + (MUTANT || 'none') + ' rows=' + LIST.length);

  // ═══ TABLE ═══
  var dict = q0("SELECT lower(c.columnname) AS c FROM ad_column c JOIN ad_table t ON t.ad_table_id=c.ad_table_id WHERE lower(t.tablename)='i_product' AND c.isactive='Y'").map(function (r) { return r.c; }).sort();
  check('TABLE', 'seed-gap', 'the seed has the 58 I_Product dictionary columns but NO physical i_product table (the gap this closes)', dict.length === 58 && q0("SELECT name FROM sqlite_master WHERE name='i_product'").length === 0, { dict: dict.length });
  guard('TABLE', 'ensure', 'ensure(db) creates i_product (among the import tables) and every dictionary column is physical; the second call creates nothing', function () {
    var n1 = AIT.ensure(db), n2 = AIT.ensure(db), phys = q0('PRAGMA table_info(i_product)').map(function (r) { return String(r.name).toLowerCase(); });
    var missing = dict.filter(function (c) { return phys.indexOf(c) < 0; });
    check('TABLE', 'ensure', 'i_product is created by ensure(db) (n>=1, then 0) with every one of the 58 dictionary columns', n1 >= 1 && n2 === 0 && !missing.length && phys.length >= 58, { n1: n1, n2: n2, missing: missing, phys: phys.length });
  });
  check('TABLE', 'wiring', 'idempiere.html loads processes/ImportProduct.js and sw.js precaches it', /<script src="processes\/ImportProduct\.js\?v=\d+"/.test(read('idempiere.html')) && /'processes\/ImportProduct\.js'/.test(read('sw.js')), {});
  var AR = null; try { AR = reqERP('ad_rule.js'); AR.ensure(db); } catch (e) {}
  var K = reqERP('ws_kernel.js'), k = K.build(db), ML = k.ML, AP = reqERP('ad_process.js');
  var S = { clientId: 11, orgId: 11, userId: 100, roleId: 102, warehouseId: 103, actor: 'witness:import-product' };
  function one(sql, p) { return k.q(sql, p || [])[0] || null; }
  function commit(fn, meta) {
    var trx = new ML.Trx(k.q, Object.assign(k.env(S), MUTANT ? { noPost: true } : {})), r;
    try { r = fn(trx, ML) || { ok: true }; } catch (ex) { r = { ok: false, error: 'model threw: ' + (ex && ex.message) }; trx.say('§MODEL-ERR ' + (ex && ex.stack || ex)); }
    var ok = r.ok !== false, ops = ok ? trx.groupOps() : [], ids = []; if (ok && ops.length) ids = k.commit(S, ops, meta);
    return Object.assign({}, r, { ok: ok, ops: ops, ids: ids, log: trx.log });
  }
  function saveAll(rows) { return function (trx) { for (var i = 0; i < rows.length; i++) { var sv = ML.save(trx, 'i_product', null, ML.newPO(trx, 'i_product', rows[i])); if (!sv.ok) return { ok: false, error: 'i_product #' + i + ': ' + sv.error }; } return { ok: true }; }; }
  var ALLLOG = [];
  function run(params, tag) {
    var r = commit(function (trx) { var r0 = AP.runInTrx(trx, 196, { params: params || {} }); return { ok: r0.ok, r: r0, error: r0.summary }; }, { ws: 'import_product', tag: tag || '' });
    (r.log || []).forEach(function (l) { ALLLOG.push(l); });
    var logs = (r.r && r.r.logs) || [], get = function (m) { return (logs.filter(function (x) { return x.msg === m; })[0] || {}).number; };
    return { res: r, summary: r.r && r.r.summary, errors: get('@Errors@'), inserted: get('@M_Product_ID@: @Inserted@'), updated: get('@M_Product_ID@: @Updated@') };
  }
  var D = new Date().toISOString().slice(0, 19).replace('T', ' ');

  // ═══ P0 ═══
  check('P0', 'registered', 'AD_Process 196 resolves to the ported class org.compiere.process.ImportProduct', typeof AP.runInTrx === 'function' && !!AP.JAVA['org.compiere.process.ImportProduct'] && (one('SELECT classname AS c FROM ad_process WHERE ad_process_id=196') || {}).c === 'org.compiere.process.ImportProduct', {});
  guard('P0', 'params-x-of-n', 'X of N: every AD_Process_Para name of process 196 is one prepare() reads, and no other', function () {
    var names = k.q("SELECT columnname AS c FROM ad_process_para WHERE ad_process_id=196 AND isactive='Y' ORDER BY seqno").map(function (r) { return r.c; });
    var src = read('processes/ImportProduct.js'), used = (src.match(/name === '([A-Za-z_]+)'/g) || []).map(function (s) { return /'([^']+)'/.exec(s)[1]; });
    var X = names.filter(function (n) { return used.indexOf(n) >= 0; }).length;
    check('P0', 'params-x-of-n', 'parameters ' + J(names) + ' all read (X=' + X + ' of N=' + names.length + '); port reads ' + J(used), names.length === 3 && X === 3 && used.length === 3, { names: names, used: used });
  });

  // ═══ UPD ═══
  var before = {}; LIST.forEach(function (p) { before[p.value] = one('SELECT * FROM m_product WHERE value=? AND ad_client_id=11', [p.value]); });
  var nProd0 = one('SELECT count(*) AS n FROM m_product').n, noImg0 = LIST.filter(function (p) { return before[p.value] && !before[p.value].imageurl; }).length;
  check('UPD', 'population', 'all 27 list Values exist as products of client 11 (the population the update is judged on is not empty)', LIST.length === 27 && LIST.every(function (p) { return !!before[p.value]; }), { missing: LIST.filter(function (p) { return !before[p.value]; }).map(function (p) { return p.value; }) });
  guard('UPD', 'import', 'Import Product (AD_Client_ID 11) on 27 rows: Errors 0, Updated 27, Inserted 0, each row Y with the product found BY VALUE, no new product, ImageURL NOT written (legacy update SET list)', function () {
    var d = commit(saveAll(LIST.map(function (p) { return { ad_client_id: 11, ad_org_id: 0, i_isimported: 'N', value: p.value, imageurl: p.url }; })));
    var r = run({ AD_Client_ID: 11 }, 'upd');
    var rows = k.q('SELECT * FROM i_product ORDER BY i_product_id'), after = {}; LIST.forEach(function (p) { after[p.value] = one('SELECT * FROM m_product WHERE value=? AND ad_client_id=11', [p.value]); });
    var allY = rows.length === 27 && rows.every(function (x) { return x.i_isimported === 'Y' && String(x.m_product_id) === String(before[x.value].m_product_id) && !String(x.i_errormsg || '').replace(/\s/g, ''); });
    var imgSame = LIST.every(function (p) { return String(after[p.value].imageurl || '') === String(before[p.value].imageurl || ''); });
    var restSame = LIST.every(function (p) { var bad = ['name', 'm_product_category_id', 'c_uom_id', 'upc'].filter(function (c) { return String(after[p.value][c]) !== String(before[p.value][c]); }); if (bad.length) say('  §IPROD-DIFF ' + p.value + ' ' + bad.map(function (c) { return c + ':' + before[p.value][c] + '->' + after[p.value][c]; }).join(' ')); return after[p.value].producttype === 'I' && ['name', 'm_product_category_id', 'c_uom_id', 'upc'].every(function (c) { return String(after[p.value][c]) === String(before[p.value][c]); }); });
    var moved = LIST.filter(function (p) { return String(after[p.value].updated) !== String(before[p.value].updated); }).length;
    say('  §IPROD-UPD errors=' + r.errors + ' updated=' + r.updated + ' inserted=' + r.inserted + ' rowsY=' + rows.filter(function (x) { return x.i_isimported === 'Y'; }).length + ' imageurl_unchanged=' + imgSame + ' updated_moved=' + moved + ' summary=' + J(r.summary));
    check('UPD', 'counts', 'the answer logs are Errors 0 / Updated 27 / Inserted 0 and the run is ok', d.ok && r.res.ok && Number(r.errors) === 0 && Number(r.updated) === 27 && Number(r.inserted) === 0, { d: d.error, ok: r.res.ok, e: r.errors, u: r.updated, i: r.inserted, s: r.summary });
    check('UPD', 'by-value', 'every row is I_IsImported=Y, M_Product_ID = the product that has that Value, no error text', allY, { rows: rows.slice(0, 3).map(function (x) { return [x.value, x.i_isimported, x.m_product_id, x.i_errormsg]; }) });
    check('UPD', 'in-place', 'no product was created (count unchanged) and the other master fields are unchanged; ProductType is I on all 27 (LEGACY QUIRK read from source: the Reset statement :127-143 COALESCEs a null ProductType to I BEFORE the copy-from-product step, so a sparse row turns Doc/Service S into I)', one('SELECT count(*) AS n FROM m_product').n === nProd0 && restSame, { n0: nProd0, n1: one('SELECT count(*) AS n FROM m_product').n });
    check('UPD', 'imageurl-not-written', 'LEGACY FACT: the update does not set M_Product.ImageURL (ImportProduct.java:509-550 SET list); all 27 are as before (' + noImg0 + ' had none)', imgSame && noImg0 >= 25, { imgSame: imgSame, noImg0: noImg0 });
    check('UPD', 'updated-moves', 'Updated moves on the 27 products (the raw UPDATE ran)', moved === 27, { moved: moved });
  });

  // ═══ RERUN ═══
  guard('RERUN', 'nothing-new', 'a plain re-run reads no Y row: Updated 0, Inserted 0, no new product', function () {
    var n0 = one('SELECT count(*) AS n FROM m_product').n, r = run({ AD_Client_ID: 11 }, 'rerun');
    check('RERUN', 'nothing-new', 'Updated 0 / Inserted 0 / Errors 0, product count unchanged', r.res.ok && Number(r.updated) === 0 && Number(r.inserted) === 0 && Number(r.errors) === 0 && one('SELECT count(*) AS n FROM m_product').n === n0, { u: r.updated, i: r.inserted, e: r.errors });
  });

  // ═══ ERR ═══
  guard('ERR', 'unknown-value', 'an unknown Value with no Name stays I_IsImported=N with I_ErrorMsg "Insert Product failed", no product is made; a good row in the SAME run (Rake-Metal) is imported', function () {
    var n0 = one('SELECT count(*) AS n FROM m_product').n;
    var d = commit(saveAll([{ ad_client_id: 11, ad_org_id: 0, i_isimported: 'N', value: 'ICON-NO-SUCH', imageurl: 'https://x.invalid/a.svg' }, { ad_client_id: 11, ad_org_id: 0, i_isimported: 'N', value: 'Rake-Metal', imageurl: 'https://x.invalid/b.svg' }]));
    var r = run({ AD_Client_ID: 11, DeleteOldImported: 'Y' }, 'err'), bad = one("SELECT * FROM i_product WHERE value='ICON-NO-SUCH'"), good = one("SELECT * FROM i_product WHERE value='Rake-Metal' AND i_isimported='Y'");
    say('  §IPROD-ERR bad=' + J(bad && [bad.i_isimported, bad.i_errormsg]) + ' good=' + J(good && [good.i_isimported]) + ' errors=' + r.errors + ' updated=' + r.updated);
    check('ERR', 'unknown-value', 'bad row: N + error text "Insert Product failed", no such product, count unchanged; Errors 1, Updated 1', d.ok && !!bad && bad.i_isimported === 'N' && /Insert Product failed/.test(String(bad.i_errormsg)) && !one("SELECT 1 AS x FROM m_product WHERE value='ICON-NO-SUCH'") && one('SELECT count(*) AS n FROM m_product').n === n0 && Number(r.errors) === 1 && Number(r.updated) === 1 && !!good, { bad: bad && [bad.i_isimported, bad.i_errormsg], n: one('SELECT count(*) AS n FROM m_product').n, n0: n0, e: r.errors, u: r.updated, s: r.summary });
  });

  // ═══ INS ═══
  guard('INS', 'insert-with-imageurl', 'an unknown Value WITH Name is INSERTED (default category/UOM/tax category) and carries the row\'s ImageURL - the one path that sets it (MProduct.java:329)', function () {
    var n0 = one('SELECT count(*) AS n FROM m_product').n, URL = 'https://x.invalid/new.svg';
    var d = commit(saveAll([{ ad_client_id: 11, ad_org_id: 0, i_isimported: 'N', value: 'ICON-NEW', name: 'Icon New', imageurl: URL }]));
    var r = run({ AD_Client_ID: 11 }, 'ins'), p = one("SELECT * FROM m_product WHERE value='ICON-NEW'"), row = one("SELECT * FROM i_product WHERE value='ICON-NEW'");
    say('  §IPROD-INS product=' + J(p && [p.m_product_id, p.name, p.imageurl, p.m_product_category_id, p.c_uom_id, p.c_taxcategory_id]) + ' row=' + J(row && [row.i_isimported, row.m_product_id]) + ' inserted=' + r.inserted + ' summary=' + J(r.summary));
    check('INS', 'insert-with-imageurl', 'Inserted 1; the product exists with ImageURL = the row\'s URL and a category, UOM and tax category; the row is Y pointing at it; count +1', d.ok && Number(r.inserted) === 1 && !!p && p.imageurl === URL && !!p.m_product_category_id && !!p.c_uom_id && !!p.c_taxcategory_id && row.i_isimported === 'Y' && String(row.m_product_id) === String(p.m_product_id) && one('SELECT count(*) AS n FROM m_product').n === n0 + 1, { p: p && [p.imageurl, p.m_product_category_id, p.c_uom_id, p.c_taxcategory_id], row: row && [row.i_isimported, row.m_product_id], i: r.inserted, s: r.summary });
  });
  check('P0', 'no-unknown-para', 'no run printed §PROC-UNKNOWN-PARA ImportProduct', ALLLOG.length > 0 && !ALLLOG.some(function (l) { return /^§PROC-UNKNOWN-PARA ImportProduct/.test(l); }), {});
  var kinds = {}; ALLLOG.forEach(function (l) { var kk = l.split(' ')[0]; if (/^§(IMPORT_PRODUCT|PROC-)/.test(kk)) kinds[kk] = (kinds[kk] || 0) + 1; });
  say('§IPROD-SHIPPED-LOG kinds=' + J(kinds)); ALLLOG.filter(function (l) { return /^§(IMPORT_PRODUCT |PROC-PARAM|PROC-SQL-ERROR|IMPORT_PRODUCT_EXC)/.test(l); }).slice(0, 8).forEach(function (l) { say('  ' + l.slice(0, 260)); });
  var vs = ['TABLE', 'P0', 'UPD', 'RERUN', 'ERR', 'INS'].map(verdict), failedCases = Object.keys(CASES).filter(function (c) { return CASES[c].failed; });
  var all = !ALL.judged ? 'INCONCLUSIVE' : ALL.failed ? 'FAIL' : 'PASS';
  say('§IPROD-RESULT verdict=' + all + ' judged=' + ALL.judged + ' failed=' + ALL.failed + ' failedCases=' + J(failedCases) + (MUTANT ? ' mutant=' + MUTANT : ''));
  var exitCode = all === 'PASS' ? 0 : 1;

  if (process.env.IPROD_MUTANTS && !MUTANT) {
    var MUTS = []; try { MUTS = require('./witness_import_product_mutants.js'); } catch (e) { say('§IPROD-MUTANT-ERR ' + e.message); }
    var killed = 0, applied = 0, notApplied = [], crashed = [], survived = [], jobs = [];
    MUTS.forEach(function (m) {
      var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'iprodmut_'));
      fs.readdirSync(ERP).forEach(function (f) { try { fs.symlinkSync(path.join(ERP, f), path.join(dir, f)); } catch (e) {} });
      fs.readdirSync(ERP).forEach(function (f) { var src = path.join(ERP, f), st = fs.statSync(src);
        if ((st.isFile() && /\.(js|html|json)$/.test(f)) || (st.isDirectory() && (f === 'callouts' || f === 'processes' || f === 'product_icons'))) { try { fs.unlinkSync(path.join(dir, f)); } catch (e) {} fs.cpSync(src, path.join(dir, f), { recursive: true }); } });
      var ok = true;
      m.edits.forEach(function (ed) { var src = fs.readFileSync(path.join(dir, ed.file), 'utf8'), want = ed.count || 1, have = src.split(ed.from).length - 1;
        if (have !== want) { ok = false; say('§IPROD-MUTANT-EDIT ' + m.name + ' ' + ed.file + ' found ' + have + ' time(s), expected ' + want); return; } fs.writeFileSync(path.join(dir, ed.file), src.split(ed.from).join(ed.to)); });
      if (!ok) { notApplied.push(m.name); say('§IPROD-MUTANT ' + m.name + ' NOT-APPLIED'); try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} return; }
      applied++; jobs.push({ m: m, dir: dir });
    });
    for (var ji = 0; ji < jobs.length; ji++) {
      var job = jobs[ji], out = await new Promise(function (resolve) { var ch = cp.spawn(process.execPath, [__filename], { env: Object.assign({}, process.env, { IPROD_ERP: job.dir, IPROD_MUTANT: job.m.name, IPROD_MUTANTS: '' }) }), o = ''; ch.stdout.on('data', function (d) { o += d; }); ch.stderr.on('data', function (d) { o += d; }); ch.on('close', function () { resolve(o); }); });
      var m = job.m, rl = out.split('\n').filter(function (l) { return /^§IPROD-RESULT /.test(l); })[0], fl = out.split('\n').filter(function (l) { return /§IPROD-CHECK .* FAIL /.test(l); });
      var named = (m.kills || []).filter(function (kk) { return fl.some(function (l) { return l.indexOf('case=' + kk.split('.')[0] + ' key=' + kk.split('.')[1] + ' ') >= 0; }); });
      if (!rl) { crashed.push(m.name); say('§IPROD-MUTANT ' + m.name + ' CRASHED (a crash is NOT a kill)'); }
      else if (/verdict=FAIL/.test(rl) && named.length) { killed++; say('§IPROD-MUTANT ' + m.name + ' applied=1 KILLED by ' + named.join(' | ') + ' :: ' + m.what); }
      else { survived.push(m.name); say('§IPROD-MUTANT ' + m.name + ' SURVIVED expected ' + (m.kills || []).join(' | ')); }
      try { fs.rmSync(job.dir, { recursive: true, force: true }); } catch (e) {}
    }
    var nSel = jobs.length + notApplied.length, mv = !MUTS.length ? 'INCONCLUSIVE' : (killed === nSel && !notApplied.length && !crashed.length && !survived.length) ? 'PASS' : 'FAIL';
    say('§IPROD-MUTANTS verdict=' + mv + ' total=' + nSel + ' applied=' + applied + ' killed=' + killed + ' notApplied=' + J(notApplied) + ' crashed=' + J(crashed) + ' survived=' + J(survived));
    if (mv !== 'PASS') exitCode = 1;
  }
  process.exit(exitCode);
})().catch(function (e) { say('§IPROD-RESULT verdict=FAIL harness: ' + (e && e.stack)); process.exit(2); });
