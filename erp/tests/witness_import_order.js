#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-IMPORT-ORDER (bim-compiler prompts/TEAM_REPLICATION_PLUGIN_STUDY.md §13.1-§13.3, prompts/TEAMWORK_FRAMEWORK.md §38.8 = W-UPS-PROCESSOR P2-P5; CARDINAL RULE: the twin does what legacy iDempiere does).
//   READ THE LOG after every run: every verdict is a §IMPORT line, the exit code is not the evidence. A mutant that CRASHES is NOT a kill: it must print its own FAIL verdict.
// SPEC (the claims, written before the code; legacy file:line in the code comments of the pieces):
//   B1  TABLE   I_Order (AD_Table 591, 68 AD_Column rows) is in the shipped seed WITHOUT its physical table. erp/ad_import_tables.js ensure(db) creates it as an idempotent BOOT OVERLAY (precedent: ad_rule.js ensure),
//               its physical columns == the 68 dictionary columns, and the team BASE hash (seed + patches/ad_seed.db.sql + patches/mfg.sql) is byte-identical to origin/main's (no hashed file touched).
//   B0  UNIQUE  legacy's unique indexes (ad_ddl_unique = pg_indexes, 449) are refused by the DB at INSERT/UPDATE with "ERROR: duplicate key value violates unique constraint <index> / Detail: Key (cols)=(vals) already exists."
//               ModelLayer.save (the path every ported process uses) refuses a duplicate INSERT and a duplicate UPDATE (of an indexed column) with that text; NULL columns never collide; a duplicate against a row written
//               earlier in the SAME transaction is refused too; ONE implementation (ML.uniqueError) - ws_adinterface.js keeps no private copy.
//   B2  ImportOrder.java (809 lines) ported verbatim to erp/processes/ImportOrder.js and run through ad_process.js runInTrx(trx, 206, {params}). W-UPS-PROCESSOR arms (TEAMWORK_FRAMEWORK §38.8):
//        P2 DECLARE+IMPORT   3 I_Order rows, ONE DocumentNo key, no BP -> ONE C_Order (DocumentNo = key, BP = AD_ClientInfo.C_BPartnerCashTrx_ID 112, doctype by DocTypeName, price list / warehouse / payment term
//                            defaulted by the process), 3 lines, DocStatus CO, ONE processIt, the 3 rows I_IsImported='Y' with C_Order_ID / C_OrderLine_ID.
//        P3 RESEND           the same 3 rows declared AGAIN as new rows: no second COMPLETED order, no second Complete, first order unchanged, the collision on c_order_documentno named in the log; a plain re-run with no new rows imports nothing.
//        P4 COLLISION        same key, DIFFERENT content: refused the same way, logged as a collision, never overwrites.
//        P5 TWO STATIONS     two keys with the same date+number but a different station part -> two orders, DocumentNo = each key.
//        TRX                 the whole run is ONE op group of the caller's transaction (declare + import in one inTrx = ONE journal entry).
//        DEFAULTS            DocAction not given -> the AD_Process_Para default (PR); a row with no DocTypeName in a client with no default SOO doctype -> legacy's "ERR=No DocType".
//        UNPORTED            the legacy branch that creates a BPartner / Location / User from names is NAMED (§PROC-UNPORTED) and the row gets an I_ErrorMsg - never a silent skip.
//   NOTE (decided by reading MOrder.java:1202): a NEW MOrder is inserted with C_DocType_ID=0 and takes its DocType on prepareIt, so legacy's unique index (DocumentNo, C_DocType_ID, C_BPartner_ID) refuses a re-sent
//        ticket when the order is SAVED after processIt, not at the first insert. P3/P4 therefore judge "no second COMPLETED order", and print the number of header rows left for the key as EVIDENCE.
// Every check names the issue it proves; INCONCLUSIVE when nothing was judged. Mutants (IMPORT_MUTANTS=1): each rewrites the shipped source in a mirror of COPIES, proves the rewrite APPLIED exactly once, and the named check
//   must go FAIL in a child run that prints its verdict (a crash = "not killed").
// Command: node erp/tests/witness_import_order.js            (add IMPORT_MUTANTS=1 for the mutant sweep)
'use strict';
var fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process'), crypto = require('crypto');
if (!global.window) global.window = {};
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
var ERP = process.env.IMPORT_ERP || path.join(__dirname, '..');
var MUTANT = process.env.IMPORT_MUTANT || '';
var SQLJS_DIR = process.env.SQLJS_DIR || '/home/red1/bim-ootb/tests/node_modules/sql.js';
if (!process.env.SQLJS) process.env.SQLJS = SQLJS_DIR;                                      // ws_kernel.js reads it
var initSqlJs = require(SQLJS_DIR);
var _log = console.log, SEEN = [];
console.log = function () { var s = Array.prototype.join.call(arguments, ' '); SEEN.push(s); };     // the shipped § lines are evidence: captured, then re-printed selectively
function say(s) { _log(s); }
var CASES = {}, ALL = { judged: 0, failed: 0 };
function check(cs, key, rule, ok, info) {
  var c = CASES[cs] = CASES[cs] || { judged: 0, failed: 0 };
  c.judged++; ALL.judged++; if (!ok) { c.failed++; ALL.failed++; }
  say('  §IMPORT-CHECK case=' + cs + ' key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' rule="' + rule + '"' + (ok ? '' : ' got=' + JSON.stringify(info)));
}
function verdict(cs) { var c = CASES[cs] || { judged: 0, failed: 0 }; var v = !c.judged ? 'INCONCLUSIVE' : c.failed ? 'FAIL' : 'PASS'; say('§IMPORT-' + cs + ' verdict=' + v + ' judged=' + c.judged + ' failed=' + c.failed + (MUTANT ? ' mutant=' + MUTANT : '')); return v; }
function J(x) { return JSON.stringify(x); }
function guard(cs, key, rule, fn) { try { fn(); } catch (e) { check(cs, key, rule, false, 'threw: ' + (e && (e.message || e.stack) || String(e))); } }
function sha256(b) { return crypto.createHash('sha256').update(b).digest('hex'); }
// the team base as erp/team_sync.js hashBase computes it (an independent oracle in node): the seed file, then the two self-heal patch texts idempiere.html applies
var BASE_PIN = 'd35e8a75a3be06295e3a695381998c2bed38027071c27a5adcbd3b81f5ffaa52';       // measured on origin/main c12e2d6b (before this change); a later INTENDED base change must move this pin on purpose
function baseOracle() {
  var buf = fs.readFileSync(path.join(ERP, 'ad_seed.db')), man = 'seed ' + sha256(buf) + ' ' + buf.length + '\n';
  ['ad_seed.db.sql', 'mfg.sql'].forEach(function (nm, i) { var f = path.join(ERP, 'patches', nm); man += '--patch ' + i + (fs.existsSync(f) ? '\n' + fs.readFileSync(f, 'utf8') : ' MISSING') + '\n'; });
  return sha256(Buffer.from(man, 'utf8'));
}
function reqERP(f) { return require(path.join(ERP, f)); }
function tryReq(f) { try { return { m: reqERP(f) }; } catch (e) { return { m: null, err: e.message }; } }
function read(f) { try { return fs.readFileSync(path.join(ERP, f), 'utf8'); } catch (e) { return ''; } }

(async function main() {
  var SQL = await initSqlJs({ locateFile: function (f) { return path.join(SQLJS_DIR, 'dist', f); } });
  var db = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(ERP, 'ad_seed.db'))));
  var pOk = 0, pFail = 0;                                                    // the self-heal patch, statement by statement (idempiere.html FS-15 loader)
  fs.readFileSync(path.join(ERP, 'patches/ad_seed.db.sql'), 'utf8').split(/;\s*\n/).forEach(function (st) { st = st.replace(/^\s*--[^\n]*\n?/gm, '').trim(); if (!st) return; try { db.run(st); pOk++; } catch (e) { pFail++; } });
  function q0(sql, params) {
    var st = db.prepare(sql), out = [];
    try { if (params && params.length) st.bind(params.map(function (v) { return v === undefined ? null : v; })); while (st.step()) { var o = st.getAsObject(), r = {}; for (var k in o) r[k.toLowerCase()] = o[k]; out.push(r); } }
    finally { st.free(); }
    return out;
  }
  var AR = tryReq('ad_rule.js'), AIT = tryReq('ad_import_tables.js');
  say('§IMPORT-LOAD erp=' + ERP + ' mutant=' + (MUTANT || 'none') + ' seedPatch ok=' + pOk + ' failed=' + pFail + ' adImportTables=' + (AIT.m ? 'loaded ensure:' + typeof AIT.m.ensure : 'ABSENT (' + AIT.err + ')'));

  // ═══ TABLE (B1) ═══════════════════════════════════════════════════════════════════════════════════════
  var dict = q0("SELECT lower(c.columnname) AS c FROM ad_column c JOIN ad_table t ON t.ad_table_id=c.ad_table_id WHERE lower(t.tablename)='i_order' AND c.isactive='Y'").map(function (r) { return r.c; }).sort();
  var before = q0("SELECT name FROM sqlite_master WHERE type='table' AND name='i_order'").length;
  check('TABLE', 'seed-gap', 'the shipped seed + patch has the 68 I_Order dictionary columns but NO physical i_order table (the gap B1 closes)', dict.length === 68 && before === 0, { dict: dict.length, physical: before });
  guard('TABLE', 'ensure', 'AdImportTables.ensure(db) creates i_order once (returns 1), the second call creates nothing (0), and the physical columns equal the 68 dictionary columns', function () {
    if (!AIT.m || typeof AIT.m.ensure !== 'function') { check('TABLE', 'ensure', 'ad_import_tables.js exports ensure(db)', false, AIT.err || 'no ensure'); return; }
    var n1 = AIT.m.ensure(db), n2 = AIT.m.ensure(db);
    var phys = q0("PRAGMA table_info(i_order)").map(function (r) { return String(r.name).toLowerCase(); }).sort();
    check('TABLE', 'ensure', 'ensure(db) creates i_order once (1), then nothing (0); physical columns == the 68 dictionary columns', n1 === Object.keys(AIT.m.DDL).length && n2 === 0 && J(phys) === J(dict), { n1: n1, n2: n2, phys: phys.length, onlyPhys: phys.filter(function (c) { return dict.indexOf(c) < 0; }), onlyDict: dict.filter(function (c) { return phys.indexOf(c) < 0; }) });
  });
  var h = baseOracle();
  check('TABLE', 'base-hash', 'the team BASE hash (seed + the two hashed patch files) is byte-identical to origin/main: B1 touched no hashed file (a teams-wide base-mismatch otherwise)', h === BASE_PIN, { got: h, pin: BASE_PIN });
  var kSrc = read('ws_kernel.js'), sSrc = read('ws_server.js'), hSrc = read('idempiere.html'), swSrc = read('sw.js');
  check('TABLE', 'wiring', 'the overlay is booted where AdRule.ensure is: ws_kernel.js, ws_server.js, idempiere.html (script tag + ensure line), listed in sw.js', /require\('\.\/ad_import_tables\.js'\)\.ensure\(db\)/.test(kSrc) && /require\('\.\/ad_import_tables\.js'\)\.ensure\(db\)/.test(sSrc) &&
    /<script src="ad_import_tables\.js\?v=\d+"/.test(hSrc) && /AdImportTables\.ensure\(db\)/.test(hSrc) && /'ad_import_tables\.js'/.test(swSrc), { kernel: /ad_import_tables/.test(kSrc), server: /ad_import_tables/.test(sSrc), html: /ad_import_tables/.test(hSrc), sw: /ad_import_tables/.test(swSrc) });
  if (AR.m) AR.m.ensure(db);
  var K = reqERP('ws_kernel.js'), k = K.build(db), ML = k.ML, AP = reqERP('ad_process.js');
  var S = { clientId: 11, orgId: 11, userId: 100, roleId: 102, warehouseId: 103, actor: 'witness:import-order' };
  function one(sql, p) { return k.q(sql, p || [])[0] || null; }
  function trxNew() { return new ML.Trx(k.q, k.env(S)); }
  // = ws_kernel inTrx (run fn in ONE Trx; on ok apply + journal its op group, on failure apply nothing). Mutant CHILD runs switch automatic accounting off (env.noPost): the posting of a Completed POS order costs ~8 s of
  //   unindexed AD_Column scans that none of the claims here depend on; the parent run (the evidence) posts like the shipped host.
  function commit(fn, meta) {
    var trx = new ML.Trx(k.q, Object.assign(k.env(S), MUTANT ? { noPost: true } : {})), r;
    try { r = fn(trx, ML) || { ok: true }; } catch (ex) { r = { ok: false, error: 'model threw: ' + (ex && ex.message) }; trx.say('§MODEL-ERR ' + (ex && ex.stack || ex)); }
    var ok = r.ok !== false, ops = ok ? trx.groupOps() : [], ids = []; if (ok && ops.length) ids = k.commit(S, ops, meta);
    return Object.assign({}, r, { ok: ok, ops: ops, ids: ids, log: trx.log, trx: trx });
  }
  function saveAll(rows) { return function (trx) { for (var i = 0; i < rows.length; i++) { var sv = ML.save(trx, rows[i].t, null, ML.newPO(trx, rows[i].t, rows[i].f));     // new X_<Table>(ctx,0,trx): PO.setStandardDefaults stamps client / org
       if (!sv.ok) return { ok: false, error: rows[i].t + ' #' + i + ': ' + sv.error }; } return { ok: true }; }; }

  // ═══ UNIQUE (B0) ═══════════════════════════════════════════════════════════════════════════════════════
  var uqTxt = function (idx, cols, vals) { return 'ERROR: duplicate key value violates unique constraint "' + idx + '"\n  Detail: Key (' + cols.join(', ') + ')=(' + vals.join(', ') + ') already exists.'; };
  var ordF = function (docno, extra) { return Object.assign({ documentno: docno, c_doctype_id: 135, c_doctypetarget_id: 135, c_bpartner_id: 112, c_bpartner_location_id: 108, m_warehouse_id: 103, m_pricelist_id: 101, c_currency_id: 100, c_paymentterm_id: 105, issotrx: 'Y',
                                                          dateordered: '2026-10-27 00:00:00', dateacct: '2026-10-27 00:00:00' }, extra || {}); };
  guard('UNIQUE', 'shared-fn', 'ModelLayer exposes ONE shared uniqueError(trx, table, row, selfId); ws_adinterface.js keeps no private copy and reads no ad_ddl_unique; model_layer.js is the only erp module that reads the index list', function () {
    var wsSrc = read('ws_adinterface.js'), readers = fs.readdirSync(ERP).filter(function (f) { return /\.js$/.test(f) && /FROM ad_ddl_unique/i.test(read(f)); });
    check('UNIQUE', 'shared-fn', 'ML.uniqueError is a function; ws_adinterface.js has no "function uniqueError" and no ad_ddl_unique read; the only reader of ad_ddl_unique among erp/*.js is model_layer.js',
      typeof ML.uniqueError === 'function' && !/function uniqueError/.test(wsSrc) && !/ad_ddl_unique/.test(wsSrc) && J(readers) === J(['model_layer.js']), { fn: typeof ML.uniqueError, wsHasFn: /function uniqueError/.test(wsSrc), wsReads: /ad_ddl_unique/.test(wsSrc), readers: readers });
  });
  guard('UNIQUE', 'order-insert', 'c_order: a duplicate INSERT of a stored (DocumentNo, C_DocType_ID, C_BPartner_ID) is refused by ML.save with the legacy text; the same row with a new DocumentNo passes', function () {
    var seedO = one("SELECT documentno, c_doctype_id, c_bpartner_id FROM c_order WHERE documentno='80000' AND c_doctype_id=135 AND c_bpartner_id=112");
    var t1 = trxNew(), r1 = ML.save(t1, 'c_order', null, ordF('80000')), t2 = trxNew(), r2 = ML.save(t2, 'c_order', null, ordF('80000-UQ'));
    check('UNIQUE', 'order-insert', 'duplicate c_order insert refused with the PG text naming c_order_documentno and Key (documentno, c_doctype_id, c_bpartner_id)=(80000, 135, 112); the non-duplicate passes',
      !!seedO && r1.ok === false && r1.error === uqTxt('c_order_documentno', ['documentno', 'c_doctype_id', 'c_bpartner_id'], ['80000', 135, 112]) && r2.ok === true, { seed: seedO, dup: r1, nonDup: r2.ok ? 'ok' : r2.error });
  });
  guard('UNIQUE', 'order-update', 'c_order: an UPDATE of an indexed column into another row\'s key is refused; an UPDATE of a non-indexed column and a move to a free key pass', function () {
    var c = commit(saveAll([{ t: 'c_order', f: ordF('UQ-A', { c_doctype_id: 0 }) }, { t: 'c_order', f: ordF('UQ-B', { c_doctype_id: 0 }) }]));
    var b = one("SELECT * FROM c_order WHERE documentno='UQ-B'"), a = one("SELECT * FROM c_order WHERE documentno='UQ-A'");
    if (!c.ok || !a || !b) { check('UNIQUE', 'order-update', 'two fixture orders UQ-A / UQ-B exist', false, { commit: c.error, a: !!a, b: !!b }); return; }
    var t1 = trxNew(), r1 = ML.save(t1, 'c_order', t1.get('c_order', b.c_order_id), { documentno: 'UQ-A' });
    var t2 = trxNew(), r2 = ML.save(t2, 'c_order', t2.get('c_order', b.c_order_id), { description: 'not an indexed column' });
    var t3 = trxNew(), r3 = ML.save(t3, 'c_order', t3.get('c_order', b.c_order_id), { documentno: 'UQ-FREE' });
    check('UNIQUE', 'order-update', 'duplicate UPDATE refused with the legacy text (Key (documentno, c_doctype_id, c_bpartner_id)=(UQ-A, 0, 112)); description change passes; move to a free DocumentNo passes',
      r1.ok === false && r1.error === uqTxt('c_order_documentno', ['documentno', 'c_doctype_id', 'c_bpartner_id'], ['UQ-A', 0, 112]) && r2.ok === true && r3.ok === true, { dup: r1.ok ? 'ok' : r1.error, desc: r2.ok ? 'ok' : r2.error, free: r3.ok ? 'ok' : r3.error });
  });
  guard('UNIQUE', 'other-table', 'a second table (c_uom, index c_uom_name = ad_client_id,name): duplicate insert and duplicate update refused, a new name passes', function () {
    var u = one("SELECT name FROM c_uom WHERE ad_client_id=11 LIMIT 1"), uf = function (n) { return { name: n, x12de355: 'ZZ', uomsymbol: 'zz', stdprecision: 2, costingprecision: 6, isdefault: 'N', uomtype: 'OT' }; };
    var t1 = trxNew(), r1 = ML.save(t1, 'c_uom', null, uf(u.name)), t2 = trxNew(), r2 = ML.save(t2, 'c_uom', null, uf('UQ Unit Free'));
    var ok = commit(saveAll([{ t: 'c_uom', f: uf('UQ Unit One') }, { t: 'c_uom', f: uf('UQ Unit Two') }])), two = one("SELECT * FROM c_uom WHERE name='UQ Unit Two'");
    var t3 = trxNew(), r3 = ML.save(t3, 'c_uom', t3.get('c_uom', two.c_uom_id), { name: 'UQ Unit One' });
    check('UNIQUE', 'other-table', 'c_uom: insert of a stored name refused with Key (ad_client_id, name)=(11, ' + u.name + '); a new name passes; renaming Two to One refused',
      r1.ok === false && r1.error === uqTxt('c_uom_name', ['ad_client_id', 'name'], [11, u.name]) && r2.ok === true && ok.ok && r3.ok === false && r3.error === uqTxt('c_uom_name', ['ad_client_id', 'name'], [11, 'UQ Unit One']), { ins: r1.ok ? 'ok' : r1.error, free: r2.ok ? 'ok' : r2.error, upd: r3.ok ? 'ok' : r3.error });
  });
  guard('UNIQUE', 'same-trx', 'a duplicate against a row written EARLIER IN THE SAME transaction is refused (the DB sees its own uncommitted rows)', function () {
    var t = trxNew(), f = { name: 'UQ Same Trx', x12de355: 'ZZ', uomsymbol: 'zz', stdprecision: 2, costingprecision: 6, isdefault: 'N', uomtype: 'OT' };
    var a = ML.save(t, 'c_uom', null, f), b = ML.save(t, 'c_uom', null, f);
    check('UNIQUE', 'same-trx', 'first insert passes, the identical second insert in the same Trx is refused', a.ok === true && b.ok === false && /c_uom_name/.test(b.error || ''), { a: a.ok, b: b.ok ? 'ok' : b.error });
  });
  guard('UNIQUE', 'null-never-collides', 'NULL index columns never collide (PG semantics): m_product_resource (s_resource_id) - the seed holds many products with a NULL s_resource_id and another may be added', function () {
    var n = one("SELECT count(*) AS n FROM m_product WHERE s_resource_id IS NULL").n, t = trxNew();
    var e = ML.uniqueError ? ML.uniqueError(t, 'm_product', { ad_client_id: 11, value: 'UQ-NULL-' + n, s_resource_id: null, s_expensetype_id: null }, null) : 'no ML.uniqueError';
    check('UNIQUE', 'null-never-collides', 'a product row whose nullable unique columns are NULL has no uniqueError although ' + n + ' stored rows are NULL there', n > 1 && e === null, { n: n, e: e });
  });
  guard('UNIQUE', 'x-of-n', 'X of N: every legacy unique index (ad_ddl_unique) whose table has a stored row to copy refuses an exact copy of that row, with its own index name in the text', function () {
    if (typeof ML.uniqueError !== 'function') { check('UNIQUE', 'x-of-n', 'ML.uniqueError exists', false, 'absent'); return; }
    var idx = k.q('SELECT indexname, tablename, columns FROM ad_ddl_unique'), N = 0, X = 0, noTable = 0, noRow = 0, bad = [], t = trxNew();
    idx.forEach(function (ix) {
      var cols = ix.columns.split(',');
      if (!one("SELECT 1 AS x FROM sqlite_master WHERE type='table' AND name=?", [ix.tablename])) { noTable++; return; }
      var row = one('SELECT * FROM ' + ix.tablename + ' WHERE ' + cols.map(function (c) { return c + ' IS NOT NULL'; }).join(' AND ') + ' LIMIT 1');
      if (!row) { noRow++; return; }
      N++; var e = ML.uniqueError(t, ix.tablename, row, null);
      if (e && e.indexOf('"' + ix.indexname + '"') >= 0 || (e && /duplicate key value violates unique constraint/.test(e))) X++; else bad.push(ix.indexname);
    });
    check('UNIQUE', 'x-of-n', 'copies of stored rows are refused: X of N (N = indexes whose table exists and holds a row with all index columns non-null; skipped: no table ' + noTable + ', no row ' + noRow + ')', N > 100 && X === N, { N: N, X: X, noTable: noTable, noRow: noRow, bad: bad.slice(0, 8) });
    say('  §IMPORT-EVIDENCE unique-sweep indexes=' + idx.length + ' judged(N)=' + N + ' refused(X)=' + X + ' skippedNoTable=' + noTable + ' skippedNoRow=' + noRow);
  });

  // ── WS: the WebServices path keeps refusing, now through the SHARED check (no pilot needed: the seed's own CreateBPartner type + two fixture types granted to role 102) ──
  await (async function () {
    var FX = "INSERT INTO ws_webservicetypeaccess (ad_client_id,ad_org_id,ad_role_id,created,createdby,isactive,isreadwrite,updated,updatedby,ws_webservicetype_id,ws_webservicetypeaccess_uu) VALUES (11,0,102,'2026-10-27 00:00:00',100,'Y','Y','2026-10-27 00:00:00',100,50001,'ws-fx-1');\nINSERT INTO ws_webservicetypeaccess (ad_client_id,ad_org_id,ad_role_id,created,createdby,isactive,isreadwrite,updated,updatedby,ws_webservicetype_id,ws_webservicetypeaccess_uu) VALUES (11,0,102,'2026-10-27 00:00:00',100,'Y','Y','2026-10-27 00:00:00',100,200009,'ws-fx-2');\nINSERT INTO ws_webservicetype (ad_client_id,ad_org_id,ad_table_id,created,createdby,description,help,isactive,name,updated,updatedby,value,ws_webservice_id,ws_webservicemethod_id,ws_webservicetype_id,ws_webservicetype_uu,insertparameters) SELECT ad_client_id,ad_org_id,ad_table_id,created,createdby,description,help,isactive,'UQ update BP',updated,updatedby,'UQUpdateBP',ws_webservice_id,ws_webservicemethod_id,990001,'ws-fx-type',insertparameters FROM ws_webservicetype WHERE ws_webservicetype_id=200009;\nINSERT INTO ws_webservicetypeaccess (ad_client_id,ad_org_id,ad_role_id,created,createdby,isactive,isreadwrite,updated,updatedby,ws_webservicetype_id,ws_webservicetypeaccess_uu) VALUES (11,0,102,'2026-10-27 00:00:00',100,'Y','Y','2026-10-27 00:00:00',100,990001,'ws-fx-3');\nINSERT INTO ws_webservicefieldinput (ad_client_id,ad_column_id,ad_org_id,created,createdby,isactive,updated,updatedby,ws_webservicefieldinput_id,ws_webservicetype_id,ad_reference_id,columnname,identifierlogic,isidentifier,isnullidentifier,ws_webservicefieldinput_uu,ad_reference_value_id) SELECT ad_client_id,ad_column_id,ad_org_id,created,createdby,isactive,updated,updatedby,ws_webservicefieldinput_id+990000,990001,ad_reference_id,columnname,identifierlogic,isidentifier,isnullidentifier,'ws-fx-in-'||ws_webservicefieldinput_id,ad_reference_value_id FROM ws_webservicefieldinput WHERE ws_webservicetype_id=50001 AND ad_column_id IN (SELECT ad_column_id FROM ad_column WHERE columnname IN ('Value','Name'));\nINSERT INTO ws_webservice_para (ad_client_id,ad_org_id,constantvalue,created,createdby,isactive,parametername,parametertype,updated,updatedby,ws_webservice_para_id,ws_webservicetype_id,ws_webservice_para_uu) SELECT ad_client_id,ad_org_id,constantvalue,created,createdby,isactive,parametername,parametertype,updated,updatedby,ws_webservice_para_id+990000,990001,'ws-fx-p-'||ws_webservice_para_id FROM ws_webservice_para WHERE ws_webservicetype_id=200009;\n";
    try {
      var WSS = reqERP('ws_server.js'), C = require(path.join(ERP, 'tests', 'ws_diff_common.js')), fxf = path.join(os.tmpdir(), 'impord_ws_fx_' + process.pid + '.sql'); fs.writeFileSync(fxf, FX);
      var server = await WSS.start(0, [fxf], {}), B = 'http://localhost:' + server.address().port, KK = server.kernel, out = {};
      var mk = function (val, name) { return C.crud({ type: 'CreateBPartner', table: 'C_BPartner', action: 'Create', fields: [['Value', val], ['Name', name], ['C_BP_Group_ID', '104']] }); };
      var ex = KK.one("SELECT value FROM c_bpartner WHERE ad_client_id=11 LIMIT 1").value;
      out.createDup = C.norm(await C.post(B, 'create_data', mk(ex, 'dup of ' + ex)));
      out.createNew = C.norm(await C.post(B, 'create_data', mk('WSUQ-NEW', 'fresh')));
      out.createAgain = C.norm(await C.post(B, 'create_data', mk('WSUQ-NEW', 'fresh again')));
      var id = (KK.one("SELECT c_bpartner_id AS id FROM c_bpartner WHERE value='WSUQ-NEW'") || {}).id, up = function (f) { return C.crud({ type: 'UQUpdateBP', table: 'C_BPartner', id: id, action: 'Update', fields: f }); };
      out.updateDup = C.norm(await C.post(B, 'update_data', up([['Value', ex]])));
      out.updateName = C.norm(await C.post(B, 'update_data', up([['Name', 'renamed']])));
      out.rows = KK.one("SELECT count(*) AS n FROM c_bpartner WHERE value='WSUQ-NEW'").n; server.close(); try { fs.unlinkSync(fxf); } catch (e) {}
      var uqErr = function (x) { return x && x.err && /Cannot save record in C_BPartner: ERROR: duplicate key value violates unique constraint "c_bpartner_value"/.test(x.err); };
      check('UNIQUE', 'ws-path', 'the WebServices path (real ws_server over the seed): create_data of a stored BPartner Value and of a repeated new Value, and update_data of Value into a stored one, are refused with the legacy text (c_bpartner_value); a new Value and a Name-only update pass; one row for the new Value',
        uqErr(out.createDup) && out.createNew.ok === true && uqErr(out.createAgain) && uqErr(out.updateDup) && out.updateName.ok === true && out.rows === 1, out);
    } catch (e) { check('UNIQUE', 'ws-path', 'the WebServices probe runs', false, 'threw: ' + (e && (e.stack || e.message))); }
  })();

  // ═══ the Import Orders arms ════════════════════════════════════════════════════════════════════════════
  var PD = 'POS Order', PRODS = [123, 130, 134], QTYS = [2, 1, 3];            // POS Order = C_DocType 135 (DocBaseType SOO); products that have a price in the Standard list (101)
  var DOCTYPE = one("SELECT c_doctype_id AS d FROM c_doctype WHERE name=? AND docbasetype='SOO' AND ad_client_id=11", [PD]).d;
  function irow(key, p, qty, extra) { return { t: 'i_order', f: Object.assign({ i_isimported: 'N', issotrx: 'Y', documentno: key, doctypename: PD, m_product_id: p, qtyordered: qty, c_uom_id: 100, dateordered: '2026-10-27 00:00:00' }, extra || {}) }; }
  function ticket(key, prods, qtys, extra) { return prods.map(function (p, i) { return irow(key, p, qtys[i], extra); }); }
  var SHIPPED = [], piCount = 0, origPI = ML.processIt;
  var piOther = 0;
  ML.processIt = function (trx, table) { if (String(table).toLowerCase() === 'c_order') piCount++; else piOther++; return origPI.apply(this, arguments); };   // count the C_Order processIt calls (one DocumentEngine run per order; a POS order's own shipment / invoice run theirs)
  function runImport(params, tag) {
    var c0 = piCount, jl0 = k.journal.length;
    var r = commit(function (trx) { var r0 = AP.runInTrx(trx, 206, { params: params || {} }); return { ok: r0.ok, r: r0, error: r0.summary }; }, { ws: 'import_order', tag: tag || '' });
    (r.log || []).forEach(function (l) { if (/^§(IMPORT_ORDER|PROC-UNPORTED|PROC-PARAM|PROC-SQL)/.test(l)) SHIPPED.push(l); });
    return { res: r, pi: piCount - c0, journal: k.journal.length - jl0, log: (r.log || []).slice(), summary: r.r && r.r.summary };
  }
  function ordersFor(key) { return k.q('SELECT * FROM c_order WHERE documentno=? ORDER BY c_order_id', [key]); }
  function linesOf(id) { return k.q('SELECT * FROM c_orderline WHERE c_order_id=? ORDER BY line, c_orderline_id', [id]); }
  function irowsOf(key) { return k.q('SELECT * FROM i_order WHERE documentno=? ORDER BY i_order_id', [key]); }
  var impAvailable = typeof AP.runInTrx === 'function' && !!AP.JAVA['org.compiere.process.ImportOrder'];
  check('P2', 'port-registered', 'AD_Process 206 Import_Order resolves to a ported class (org.compiere.process.ImportOrder registered by erp/processes/ImportOrder.js)', impAvailable && one('SELECT classname FROM ad_process WHERE ad_process_id=206').classname === 'org.compiere.process.ImportOrder', { registered: !!AP.JAVA['org.compiere.process.ImportOrder'] });
  var oracle = {
    pl: one("SELECT MAX(m_pricelist_id) AS v FROM m_pricelist WHERE isdefault='Y' AND issopricelist='Y' AND ad_client_id=11").v,
    wh: one("SELECT MAX(m_warehouse_id) AS v FROM m_warehouse WHERE ad_client_id=11 AND ad_org_id=11").v,
    pt: one("SELECT MAX(c_paymentterm_id) AS v FROM c_paymentterm WHERE isdefault='Y' AND ad_client_id=11").v,
    bp: one('SELECT c_bpartnercashtrx_id AS v FROM ad_clientinfo WHERE ad_client_id=11').v
  };
  say('  §IMPORT-ORACLE (independent SQL on the seed) defaultSOPriceList=' + oracle.pl + ' warehouseOfOrg11=' + oracle.wh + ' defaultPaymentTerm=' + oracle.pt + ' cashBP=' + oracle.bp + ' POSOrderDocType=' + DOCTYPE);

  // ── P2 ──
  var K2 = 'POS1/2026-10-27/0001', first = null;
  guard('P2', 'declare', 'a station declares a 3-line ticket as I_Order rows through the ERP write path (ML.save in one transaction -> one op group)', function () {
    var d = commit(saveAll(ticket(K2, PRODS, QTYS)));
    check('P2', 'declare', '3 I_Order rows exist with the ticket key, I_IsImported=N, no C_Order yet', d.ok && irowsOf(K2).length === 3 && irowsOf(K2).every(function (r) { return r.i_isimported === 'N' && r.c_order_id == null; }) && ordersFor(K2).length === 0, { ok: d.ok, err: d.error, rows: irowsOf(K2).length });
  });
  guard('P2', 'import', 'Import Orders (DocAction CO) over the 3 rows -> ONE C_Order, DocumentNo = key, cash BP, defaults from the process, 3 lines, Complete, ONE processIt, rows marked imported', function () {
    var r = runImport({ DocAction: 'CO' }, 'P2'), os_ = ordersFor(K2), o = os_[0] || {}, ls = o.c_order_id ? linesOf(o.c_order_id) : [], rows = irowsOf(K2);
    first = { order: Object.assign({}, o), lines: ls.map(function (l) { return Object.assign({}, l); }), rows: rows.map(function (x) { return Object.assign({}, x); }) };
    check('P2', 'run', 'the process ran (ok) and answered "#1/3" (1 order, 3 lines inserted - ImportOrder.java:802-805)', r.res.ok === true && r.summary === '#1/3', { ok: r.res.ok, err: r.res.error, summary: r.summary });
    check('P2', 'one-order', 'exactly ONE c_order carries the ticket key', os_.length === 1, os_.length);
    check('P2', 'docno', 'the order\'s DocumentNo is the imported key (order.setDocumentNo(imp.getDocumentNo()), :692) - not a minted sequence number', o.documentno === K2, o.documentno);
    check('P2', 'cash-bp', 'no BP on the rows -> C_BPartner_ID = AD_ClientInfo.C_BPartnerCashTrx_ID (:322-327), bill-to and ship-to taken from that BP', Number(o.c_bpartner_id) === Number(oracle.bp) && o.c_bpartner_location_id != null && o.bill_location_id != null && Number(o.bill_bpartner_id) === Number(oracle.bp), { bp: o.c_bpartner_id, loc: o.c_bpartner_location_id, bill: o.bill_location_id });
    check('P2', 'defaults', 'doc type target = POS Order by DocTypeName (:139-144); price list = default SO list; warehouse = MAX(warehouse of the org); payment term = default - each equal to the independent SQL oracle',
      Number(o.c_doctypetarget_id) === Number(DOCTYPE) && Number(o.m_pricelist_id) === Number(oracle.pl) && Number(o.m_warehouse_id) === Number(oracle.wh) && Number(o.c_paymentterm_id) === Number(oracle.pt), { dt: o.c_doctypetarget_id, pl: o.m_pricelist_id, wh: o.m_warehouse_id, pt: o.c_paymentterm_id, oracle: oracle });
    check('P2', 'lines', '3 order lines, line numbers 10/20/30 (:683,:743), products and quantities of the 3 rows in I_Order_ID order', ls.length === 3 && ls.every(function (l, i) { return Number(l.line) === (i + 1) * 10 && Number(l.m_product_id) === PRODS[i] && Number(l.qtyordered) === QTYS[i]; }), ls.map(function (l) { return [l.line, l.m_product_id, l.qtyordered]; }));
    check('P2', 'complete', 'DocStatus CO and Processed Y (DocAction=CO given as the process parameter)', o.docstatus === 'CO' && o.processed === 'Y', { st: o.docstatus, pr: o.processed, msg: (r.log || []).filter(function (l) { return /MODEL-DOC|processIt|Process Failed/i.test(l); }).slice(0, 3) });
    check('P2', 'processIt-once', 'DocumentEngine ran ONCE for the order (one processIt call for the 3 lines, :668-676/:773-781)', r.pi === 1, r.pi);
    check('P2', 'rows-imported', 'the 3 I_Order rows: I_IsImported=Y, Processed=Y, C_Order_ID = the order, C_OrderLine_ID = their own line (:757-767)', rows.length === 3 && rows.every(function (x, i) { return x.i_isimported === 'Y' && x.processed === 'Y' && Number(x.c_order_id) === Number(o.c_order_id) && ls[i] && Number(x.c_orderline_id) === Number(ls[i].c_orderline_id); }), rows.map(function (x) { return [x.i_isimported, x.processed, x.c_order_id, x.c_orderline_id]; }));
    check('P2', 'one-group', 'the whole import is ONE op group of the caller\'s transaction: ONE journal entry holding c_order + c_orderline + i_order writes', r.journal === 1 && ['c_order', 'c_orderline', 'i_order'].every(function (t) { return r.res.ops.some(function (op) { return op.table === t; }); }), { journal: r.journal, tables: r.res.ops.map(function (o2) { return o2.table; }).filter(function (v, i, a) { return a.indexOf(v) === i; }) });
    check('P2', 'log', 'the shipped § log names the run (§IMPORT_ORDER summary with the counts)', (r.log || []).some(function (l) { return /^§IMPORT_ORDER .*orders=1 lines=3/.test(l); }), (r.log || []).filter(function (l) { return /IMPORT_ORDER|PROC-/.test(l); }).slice(0, 6));
  });

  // ── P3 ──
  guard('P3', 'resend', 'the same 3 rows declared AGAIN as new rows: no second COMPLETED order, no second Complete, first order unchanged, collision on c_order_documentno logged', function () {
    var again = runImport({ DocAction: 'CO' }, 'P3-rerun'), snap = ordersFor(K2).length;
    check('P3', 're-run-empty', 'a plain re-run with no new rows imports nothing ("#0/0"): the rows of P2 are I_IsImported=Y and are not read again (:640)', again.summary === '#0/0' && again.pi === 0 && snap === 1, { summary: again.summary, pi: again.pi, orders: snap });
    var d = commit(saveAll(ticket(K2, PRODS, QTYS))), r = runImport({ DocAction: 'CO' }, 'P3-resend');
    var os_ = ordersFor(K2), done = os_.filter(function (x) { return x.docstatus === 'CO'; }), o1 = one('SELECT * FROM c_order WHERE c_order_id=?', [first.order.c_order_id]), l1 = linesOf(first.order.c_order_id);
    var same_ = first.order && o1 && ['docstatus', 'grandtotal', 'totallines', 'c_doctype_id', 'documentno', 'c_bpartner_id', 'updated'].every(function (c) { return String(o1[c]) === String(first.order[c]); }) && J(l1.map(function (l) { return [l.c_orderline_id, l.m_product_id, l.qtyordered, l.linenetamt]; })) === J(first.lines.map(function (l) { return [l.c_orderline_id, l.m_product_id, l.qtyordered, l.linenetamt]; }));
    check('P3', 'declared', 'the resend\'s 3 new I_Order rows were accepted as declarations (a station can always declare)', d.ok && irowsOf(K2).filter(function (x) { return x.i_isimported === 'N' || x.c_order_id != first.order.c_order_id; }).length === 3, { ok: d.ok, err: d.error });
    check('P3', 'no-second-complete', 'still exactly ONE order with the key is Complete (no second Complete); the resend did not produce a Completed order', done.length === 1 && Number(done[0].c_order_id) === Number(first.order.c_order_id), { orders: os_.map(function (x) { return [x.c_order_id, x.docstatus, x.c_doctype_id]; }) });
    check('P3', 'first-unchanged', 'the first order and its 3 lines are unchanged (status, totals, doc type, Updated stamp, line ids/products/quantities/amounts)', same_ === true, { same: same_ });
    check('P3', 'collision-logged', 'the refusal is logged as a collision naming the legacy index c_order_documentno and the key (§IMPORT_ORDER_COLLISION)', (r.log || []).some(function (l) { return /^§IMPORT_ORDER_COLLISION /.test(l) && l.indexOf('c_order_documentno') >= 0 && l.indexOf(K2) >= 0; }), (r.log || []).filter(function (l) { return /IMPORT_ORDER|PROC-/.test(l); }).slice(0, 6));
    say('  §IMPORT-EVIDENCE P3 headers-with-key=' + os_.length + ' statuses=' + J(os_.map(function (x) { return x.docstatus + '/dt' + x.c_doctype_id; })) + ' processIt-calls=' + r.pi + ' (a new MOrder is saved with C_DocType_ID=0, MOrder.java:1202; the index refuses it when the DocType is set on prepareIt)');
  });

  // ── P4 ──
  guard('P4', 'collision', 'the same key with DIFFERENT content (other products and quantities) is refused the same way, logged as a collision, and never overwrites the stored order', function () {
    var KC = 'POS1/2026-10-27/0002', c0 = commit(saveAll(ticket(KC, [123, 130], [1, 1])));
    var r1 = runImport({ DocAction: 'CO' }, 'P4-first'), o1 = ordersFor(KC)[0], l1 = o1 ? linesOf(o1.c_order_id).map(function (l) { return [l.m_product_id, l.qtyordered, l.linenetamt]; }) : null;
    var d = commit(saveAll(ticket(KC, [134, 137], [7, 9]))), r2 = runImport({ DocAction: 'CO' }, 'P4-different');
    var os_ = ordersFor(KC), done = os_.filter(function (x) { return x.docstatus === 'CO'; }), o1b = one('SELECT * FROM c_order WHERE c_order_id=?', [o1 && o1.c_order_id]), l1b = o1 ? linesOf(o1.c_order_id).map(function (l) { return [l.m_product_id, l.qtyordered, l.linenetamt]; }) : null;
    check('P4', 'first-ok', 'the original ticket (2 lines) imported and Completed once', c0.ok && r1.res.ok && !!o1 && o1.docstatus === 'CO' && l1.length === 2, { c0: c0.error, r1: r1.summary, st: o1 && o1.docstatus });
    check('P4', 'no-second-complete', 'the different-content resend produced no second Completed order for the key', d.ok && done.length === 1 && Number(done[0].c_order_id) === Number(o1.c_order_id), { orders: os_.map(function (x) { return [x.c_order_id, x.docstatus]; }) });
    check('P4', 'never-overwrites', 'the stored order keeps its original lines (products 123/130, qty 1/1) and totals - the new content (134/137, 7/9) is nowhere on it', J(l1b) === J(l1) && String(o1b.grandtotal) === String(o1.grandtotal), { before: l1, after: l1b });
    check('P4', 'collision-logged', 'logged as a collision naming c_order_documentno and the key', (r2.log || []).some(function (l) { return /^§IMPORT_ORDER_COLLISION /.test(l) && l.indexOf('c_order_documentno') >= 0 && l.indexOf(KC) >= 0; }), (r2.log || []).filter(function (l) { return /IMPORT_ORDER|PROC-/.test(l); }).slice(0, 6));
  });

  // ── P5 ──
  guard('P5', 'two-stations', 'two tickets with the same date and number but a different station part of the key, same BP: TWO orders, each DocumentNo = its own key, no clash', function () {
    var KA = 'POS7/2026-10-27/0042', KB = 'POS8/2026-10-27/0042';
    var d = commit(saveAll(ticket(KA, [123, 130], [1, 2]).concat(ticket(KB, [134], [1])))), r = runImport({ DocAction: 'CO' }, 'P5');
    var a = ordersFor(KA), b = ordersFor(KB);
    check('P5', 'two-orders', 'KA has ONE order (2 lines) and KB has ONE order (1 line); the run answered "#2/3"', d.ok && a.length === 1 && b.length === 1 && linesOf(a[0].c_order_id).length === 2 && linesOf(b[0].c_order_id).length === 1 && r.summary === '#2/3', { d: d.error, a: a.length, b: b.length, summary: r.summary });
    check('P5', 'docno', 'each order\'s DocumentNo is its station key (no minted numbers, no clash although date+number are equal)', a[0] && b[0] && a[0].documentno === KA && b[0].documentno === KB, { a: a[0] && a[0].documentno, b: b[0] && b[0].documentno });
    check('P5', 'both-complete', 'both are Complete, processIt ran once per order (2)', a[0].docstatus === 'CO' && b[0].docstatus === 'CO' && r.pi === 2, { a: a[0].docstatus, b: b[0].docstatus, pi: r.pi });
  });

  // ── TRX ──
  guard('TRX', 'one-group', 'declare + import inside ONE caller transaction (runInTrx on a Trx that already holds the pending I_Order inserts): the process reads its own transaction\'s rows and ALL writes are ONE op group / ONE journal entry', function () {
    var KT = 'POS9/2026-10-27/0100', j0 = k.journal.length;
    var r = commit(function (trx) {
      var s = saveAll(ticket(KT, [123, 130], [1, 1]))(trx); if (!s.ok) return s;
      var r0 = AP.runInTrx(trx, 206, { params: { DocAction: 'CO' } }); return { ok: r0.ok, error: r0.summary, r: r0 };
    });
    var o = ordersFor(KT)[0];
    check('TRX', 'one-group', 'ONE journal entry for declare+import; the group holds the i_order CREATE (already carrying I_IsImported=Y, the process\'s update folded into the transaction\'s own insert), c_order CREATE and c_orderline CREATE; the order is Complete with 2 lines',
      r.ok && k.journal.length - j0 === 1 && !!o && o.docstatus === 'CO' && linesOf(o.c_order_id).length === 2 && r.ops.some(function (op) { return op.table === 'i_order' && op.op_type === 'CRUD_CREATE'; }) && r.ops.some(function (op) { return op.table === 'i_order' && op.op_type === 'CRUD_CREATE' && op.fields && op.fields.i_isimported === 'Y' && op.fields.processed === 'Y'; }) && r.ops.some(function (op) { return op.table === 'c_order'; }),
      { ok: r.ok, err: r.error, journal: k.journal.length - j0, st: o && o.docstatus });
    var trs = irowsOf(KT), lids = o ? linesOf(o.c_order_id).map(function (l) { return String(l.c_orderline_id); }) : [];
    check('TRX', 'links-resolve', 'the two I_Order rows created in that same transaction end I_IsImported=Y with C_Order_ID = the order and C_OrderLine_ID = one of its own lines (links to ops created later in the group are resolved at commit)',
      trs.length === 2 && !!o && trs.every(function (x) { return x.i_isimported === 'Y' && String(x.c_order_id) === String(o.c_order_id) && lids.indexOf(String(x.c_orderline_id)) >= 0; }), trs.map(function (x) { return [x.i_isimported, x.c_order_id, x.c_orderline_id]; }));
  });

  // ── DEFAULTS ──
  guard('DEFAULTS', 'docaction-default', 'DocAction not given: the AD_Process_Para default of process 206 (PR) is used - the order is Prepared (IP), not Completed', function () {
    var KD = 'POS1/2026-10-27/0200', def = one("SELECT defaultvalue AS d FROM ad_process_para WHERE ad_process_id=206 AND columnname='DocAction'").d;
    var d = commit(saveAll(ticket(KD, [130], [1]))), r = runImport({}, 'DEFAULTS'), o = ordersFor(KD)[0];
    check('DEFAULTS', 'docaction-default', 'AD_Process_Para default is "' + def + '"; with no DocAction parameter the order ends DocStatus IP and one processIt ran', d.ok && def === 'PR' && !!o && o.docstatus === 'IP' && r.pi === 1, { def: def, st: o && o.docstatus, pi: r.pi, summary: r.summary, err: r.res.error });
  });
  guard('DEFAULTS', 'no-doctype', 'a row with IsSOTrx=Y and no DocTypeName / C_DocType_ID: this client has NO default SOO doc type, so legacy answers "ERR=No DocType" (:178-185) - the row stays unimported, no order', function () {
    var KN = 'POS1/2026-10-27/0300', d = commit(saveAll([irow(KN, 130, 1, { doctypename: null })])), r = runImport({ DocAction: 'CO' }, 'NODT'), row = irowsOf(KN)[0];
    check('DEFAULTS', 'no-doctype', 'I_ErrorMsg contains "ERR=No DocType, "; no order for the key; the row ends I_IsImported=N (:797-800 resets the error flag so the next run re-reads it)', d.ok && !!row && /ERR=No DocType, /.test(row.i_errormsg || '') && ordersFor(KN).length === 0 && row.i_isimported === 'N', { row: row && [row.i_isimported, row.i_errormsg], orders: ordersFor(KN).length });
  });

  guard('DEFAULTS', 'given-params', 'parameters that ARE sent are used as sent (AD_Client_ID, AD_Org_ID, DeleteOldImported=Y, DocAction): the imported (Y) I_Order rows are deleted (:99-106), no §PROC-PARAM default is printed for the four', function () {
    var y0 = one("SELECT count(*) AS n FROM i_order WHERE i_isimported='Y' AND ad_client_id=11").n, n0 = one("SELECT count(*) AS n FROM i_order WHERE i_isimported<>'Y'").n;
    var r = runImport({ AD_Client_ID: 11, AD_Org_ID: 11, DeleteOldImported: 'Y', DocAction: 'PR' }, 'PARAMS'), y1 = one("SELECT count(*) AS n FROM i_order WHERE i_isimported='Y' AND ad_client_id=11").n;
    check('DEFAULTS', 'given-params', 'before: ' + y0 + ' imported rows; after the run with DeleteOldImported=Y: 0; the not-imported rows (' + n0 + ') stay; no default notice for the sent parameters', y0 > 0 && y1 === 0 && one("SELECT count(*) AS n FROM i_order WHERE i_isimported<>'Y'").n === n0 && !(r.log || []).some(function (l) { return /^§PROC-PARAM ImportOrder /.test(l); }), { y0: y0, y1: y1, log: (r.log || []).filter(function (l) { return /PROC-PARAM/.test(l); }) });
  });

  // ── UNPORTED ──
  guard('UNPORTED', 'new-bpartner', 'a row naming a BPartner that does not exist: legacy creates it (:512-535); the twin names the branch (§PROC-UNPORTED) and writes an I_ErrorMsg on the row - no order, no silent skip, no invented partner', function () {
    var KU = 'POS1/2026-10-27/0400', bp0 = one('SELECT count(*) AS n FROM c_bpartner').n;
    var d = commit(saveAll([irow(KU, 130, 1, { bpartnervalue: 'UNPORTED-BP-1', name: 'Unported Partner', countrycode: 'US' })])), r = runImport({ DocAction: 'CO' }, 'UNPORTED'), row = irowsOf(KU)[0];
    check('UNPORTED', 'new-bpartner', 'the row carries an I_ErrorMsg naming the unported branch AND legacy\'s "ERR=No BPartner, "; the log has §PROC-UNPORTED ImportOrder; no order; no c_bpartner added',
      d.ok && !!row && /ERR=Not ported: /.test(row.i_errormsg || '') && /ERR=No BPartner, /.test(row.i_errormsg || '') && (r.log || []).some(function (l) { return /^§PROC-UNPORTED ImportOrder /.test(l); }) && ordersFor(KU).length === 0 && one('SELECT count(*) AS n FROM c_bpartner').n === bp0, { row: row && [row.i_isimported, row.i_errormsg], log: (r.log || []).filter(function (l) { return /UNPORTED/.test(l); }).slice(0, 3) });
  });
  guard('UNPORTED', 'invalid-product', 'a row with an unknown ProductValue: legacy marks it "ERR=Invalid Product, " (:443-450) and imports nothing', function () {
    var KP = 'POS1/2026-10-27/0500', d = commit(saveAll([irow(KP, null, 1, { productvalue: 'NO-SUCH-PRODUCT' })])), r = runImport({ DocAction: 'CO' }, 'BADPROD'), row = irowsOf(KP)[0];
    check('UNPORTED', 'invalid-product', 'I_ErrorMsg contains "ERR=Invalid Product, "; no order', d.ok && !!row && /ERR=Invalid Product, /.test(row.i_errormsg || '') && ordersFor(KP).length === 0, { row: row && [row.i_isimported, row.i_errormsg] });
  });

  ML.processIt = origPI;
  // ═══ shipped log + verdicts ═══════════════════════════════════════════════════════════════════════════
  var kinds = {}; SHIPPED.forEach(function (l) { var kk = l.split(' ')[0]; kinds[kk] = (kinds[kk] || 0) + 1; });
  say('§IMPORT-SHIPPED-LOG process lines=' + SHIPPED.length + ' kinds=' + J(kinds));
  ['§PROC-PARAM', '§IMPORT_ORDER ', '§IMPORT_ORDER_COLLISION', '§IMPORT_ORDER_EXCEPTION', '§IMPORT_ORDER_WARN', '§PROC-UNPORTED'].forEach(function (kk) { var l = SHIPPED.filter(function (x) { return x.indexOf(kk) === 0; })[0]; if (l) say('  ' + l.slice(0, 300)); });
  var vs = ['TABLE', 'UNIQUE', 'P2', 'P3', 'P4', 'P5', 'TRX', 'DEFAULTS', 'UNPORTED'].map(verdict);
  var failedCases = Object.keys(CASES).filter(function (c) { return CASES[c].failed; });
  var all = !ALL.judged ? 'INCONCLUSIVE' : ALL.failed ? 'FAIL' : 'PASS';
  say('§IMPORT-RESULT verdict=' + all + ' judged=' + ALL.judged + ' failed=' + ALL.failed + ' failedCases=' + J(failedCases) + (MUTANT ? ' mutant=' + MUTANT : ''));
  var exitCode = all === 'PASS' ? 0 : 1;

  // ═══ mutants (IMPORT_MUTANTS=1, parent run only) ═════════════════════════════════════════════════════
  if (process.env.IMPORT_MUTANTS && !MUTANT) {
    var MUTS = [];
    try { MUTS = require('./witness_import_order_mutants.js'); } catch (e) { say('§IMPORT-MUTANT-ERR no mutant table: ' + e.message); }
    var killed = 0, applied = 0, notApplied = [], crashed = [], survived = [], jobs = [];
    MUTS.forEach(function (m) {
      if (process.env.IMPORT_ONLY && !new RegExp(process.env.IMPORT_ONLY).test(m.name)) return;     // debugging aid: run a subset of the table
      var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'impmut_'));
      fs.readdirSync(ERP).forEach(function (f) { try { fs.symlinkSync(path.join(ERP, f), path.join(dir, f)); } catch (e) {} });
      // every .js module (and callouts/, processes/) is COPIED, never symlinked: node resolves a symlink to its real path, so a symlinked neighbour would require the ORIGINAL model_layer / ad_process and the mutant
      //   would bind to the witness's own instance only. The big .db files and patches/ stay symlinks (read-only data).
      fs.readdirSync(ERP).forEach(function (f) { var src = path.join(ERP, f), st = fs.statSync(src);
        if ((st.isFile() && /\.js$/.test(f)) || (st.isDirectory() && (f === 'callouts' || f === 'processes'))) { try { fs.unlinkSync(path.join(dir, f)); } catch (e) {} fs.cpSync(src, path.join(dir, f), { recursive: true }); } });
      var ok = true;
      m.edits.forEach(function (ed) {
        var src = fs.readFileSync(path.join(ERP, ed.file), 'utf8'), want = ed.count || 1, have = src.split(ed.from).length - 1;
        if (have !== want) { ok = false; say('§IMPORT-MUTANT-EDIT ' + m.name + ' ' + ed.file + ' found ' + have + ' time(s), expected ' + want); return; }
        fs.writeFileSync(path.join(dir, ed.file), src.split(ed.from).join(ed.to));
      });
      if (!ok) { notApplied.push(m.name); say('§IMPORT-MUTANT ' + m.name + ' NOT-APPLIED (source text not found exactly as counted: the mutant proves nothing)'); try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} return; }
      applied++; jobs.push({ m: m, dir: dir });
    });
    // the children run CONCURRENTLY (IMPORT_JOBS, default 6): one full witness run is ~60-90 s of single-threaded SQL
    await new Promise(function (resolve) {
      var next = 0, running = 0, POOL = Number(process.env.IMPORT_JOBS || 6);
      function pump() {
        while (running < POOL && next < jobs.length) (function (job) {
          running++;
          var child = cp.spawn(process.execPath, [__filename], { env: Object.assign({}, process.env, { IMPORT_ERP: job.dir, IMPORT_MUTANT: job.m.name, IMPORT_MUTANTS: '' }) }), out = '', timer = setTimeout(function () { child.kill('SIGKILL'); }, 600000);
          child.stdout.on('data', function (d) { out += d; }); child.stderr.on('data', function (d) { out += d; });
          child.on('close', function (code) {
            clearTimeout(timer); running--;
            var m = job.m, rl = out.split('\n').filter(function (l) { return /^§IMPORT-RESULT /.test(l); })[0], failedLines = out.split('\n').filter(function (l) { return /§IMPORT-CHECK .* FAIL /.test(l); });
            var named = (m.kills || []).some(function (kk) { return failedLines.some(function (l) { return l.indexOf('case=' + kk.split('.')[0] + ' key=' + kk.split('.')[1] + ' ') >= 0; }); });
            if (!rl) { crashed.push(m.name); say('§IMPORT-MUTANT ' + m.name + ' CRASHED (no verdict line; a crash is NOT a kill) exit=' + code + ' ' + out.split('\n').filter(function (l) { return /Error|error/.test(l); })[0]); }
            else if (/verdict=FAIL/.test(rl) && named) { killed++; say('§IMPORT-MUTANT ' + m.name + ' KILLED by ' + m.kills.filter(function (kk) { return failedLines.some(function (l) { return l.indexOf('case=' + kk.split('.')[0] + ' key=' + kk.split('.')[1] + ' ') >= 0; }); }).join(' | ') + ' :: ' + m.what); }
            else { survived.push(m.name); say('§IMPORT-MUTANT ' + m.name + ' SURVIVED verdict=' + (rl.match(/verdict=\w+/) || [''])[0] + ' expected to fail ' + (m.kills || []).join(' | ') + ' failedChecks=' + failedLines.length); }
            try { fs.rmSync(job.dir, { recursive: true, force: true }); } catch (e) {}
            if (next >= jobs.length && running === 0) resolve(); else pump();
          });
        })(jobs[next++]);
        if (!jobs.length) resolve();
      }
      pump();
    });
    var nSel = jobs.length + notApplied.length, mv = !MUTS.length ? 'INCONCLUSIVE' : (killed === nSel && !notApplied.length && !crashed.length && !survived.length) ? 'PASS' : 'FAIL';
    say('§IMPORT-MUTANTS verdict=' + mv + ' total=' + nSel + ' applied=' + applied + ' killed=' + killed + ' notApplied=' + J(notApplied) + ' crashed=' + J(crashed) + ' survived=' + J(survived));
    if (mv !== 'PASS') exitCode = 1;
  }
  process.exit(exitCode);
})().catch(function (e) { say('§IMPORT-RESULT verdict=FAIL harness: ' + (e && e.stack)); process.exit(2); });
