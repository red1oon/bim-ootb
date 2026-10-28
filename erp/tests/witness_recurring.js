#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-RECURRING (bim-compiler prompts/TEAMWORK_FRAMEWORK.md §40 owner MF-2 "a gold-shop certificate is RENEWED each period; each renewal is an invoice raised by legacy Recurring" + §41 row F1; CARDINAL RULE: the twin does what legacy iDempiere does).
//   READ THE LOG after every run: every verdict is a §RECUR line, the exit code is not the evidence. A mutant that CRASHES is NOT a kill: it must print its own FAIL verdict. INCONCLUSIVE when nothing was judged.
// SPEC (the claims, written before the code; legacy file:line in the code comments of the pieces). Legacy: org.adempiere.base.process/src/org/compiere/process/Recurring.java (AD_Process 213), .../org/idempiere/process/RecurringRun.java
//   (AD_Process 200074), org.adempiere.base/src/org/compiere/model/MRecurring.java + MRecurringRun.java. Legacy source only: the idempiere postgres is down, so every expected value below is derived from the Java text or from the seed, never from the code under test.
//   TABLE  C_Recurring_Run (AD_Table 573) and C_RecurringGroup (200143) are in the seed dictionary WITHOUT a physical table (C_Recurring 574 has one). erp/ad_import_tables.js ensure(db) creates them as an idempotent BOOT OVERLAY, physical
//          columns == dictionary columns, and the team BASE hash (seed + the two hashed patches) is byte-identical to origin/main (no hashed file touched). The page (idempiere.html) and sw.js load/precache the ports.
//   PORT   AD_Process 213 -> org.compiere.process.Recurring and 200074 -> org.idempiere.process.RecurringRun are registered ports; 213 has no parameters; no run prints §PROC-UNKNOWN-PARA.
//   RUN    A C_Recurring (Type I, invoice 109 = the instalment invoice: BP JoeBlock, term 108, EUR 228.85 = lines 215.90 + tax 12.95, schedule 114.43 + 114.42), RunsMax 3, Monthly x1, DateNextRun 2026-11-01, run by 213 with Record_ID:
//          a NEW invoice = MInvoice.copyFrom(from, DateNextRun, DateNextRun, from.C_DocType_ID, from.isSOTrx, false, trx, false): Drafted/CO, DocumentNo newly allocated, C_DocType_ID 0 / C_DocTypeTarget_ID = the source's C_DocType_ID,
//          DateInvoiced = DateAcct = DateNextRun (NOT the source's 2003-11-01), BP/location/term/currency/price list/sales rep/description/payment rule copied, IsApproved/IsPaid/Posted/Processed N, no order/payment link, the lines copied
//          (product 128, qty 10, price 21.59) and the header totals = the lines (independent SQL oracle). ONE C_Recurring_Run (client, org, C_Recurring_ID, C_Invoice_ID = the new one, DateDoc = the OLD DateNextRun). The recurring then has
//          RunsRemaining = RunsMax - COUNT(runs) - 1 = 2 (recomputed from the runs, NOT from the stored value: stored 99 still gives 2), DateNextRun = 2026-12-01, DateLastRun set. The answer is "@Created@ <DocumentNo>".
//   SEQ    runs 2 and 3 give remaining 1 then 0 and next 2027-01-01 / 2027-02-01; each a different new invoice; three run rows. The 4th run: RunsMax - COUNT(runs) = 0 -> IllegalStateException "No Runs Left": the process FAILS, no invoice,
//          no run row, nothing persisted (the transaction rolls back, so the stored RunsRemaining is untouched).
//   FREQ   setDateNextRun :222-243 (Calendar.add): Daily +n days, Weekly +7n, Monthly +n months with the day clamped to the target month (Jan 31 + 1 = Feb 28; 2028: Feb 29), Quarterly +3n months; time of day kept; Frequency < 1 is fixed to 1 and SAVED.
//   TYPES  P (Payment) copy :158-178 -> a Drafted, unprocessed, unposted, unreconciled payment dated DateNextRun with a fresh DocumentNo, the same BP and amount; O / J / G are NOT ported: the process FAILS naming "not ported", nothing written
//          (legacy's error path, never a silent skip); a RecurringType outside I/O/J/G/P answers "Invalid ... = Z" as a normal result and writes nothing; beforeSave :255-290 refuses a save without RecurringType or without the matching document;
//          new-record defaults :64-70 (M, 1, RunsMax 1, RunsRemaining 0).
//   RR     200074 (Recurring Run): the due recurrings = active, session client, RunsMax > COUNT(runs), group filter, DateNextRun <= Cut_Date, ORDER BY Name, C_Recurring_ID; each is run (executeRun), the Description tags of the new document and its
//          lines are replaced (@DocumentNo@ by the document's own value, @Prm_Comment@ by the parameter, '@@' -> '@'), DocAction (default CO from AD_Process_Para) is run on it (Complete: DocStatus CO, pay schedule created: 2 rows),
//          a buffer log {record = the invoice, tableId 318, msg "Created <DocNo>", date = the DateNextRun used} per document; the answer "@OK@". A second identical run does nothing (every DateNextRun moved past Cut_Date). Parameters not sent take the
//          dictionary default (DocAction CO; Cut_Date @#Date@ = today) and say so (§PROC-PARAM). RRFAIL: a DocAction the engine refuses (a closed period) throws "PO Process Failed" and the WHOLE run is rolled back (no invoice, no run row).
//   UNPORTED  named in the port headers: RecurringType O/J/G copy; journal lines in RecurringRun; useColumnDateFormat in tag replacement; MJournalBatch.
// Every check names the issue it proves; INCONCLUSIVE when nothing was judged. Mutants (RECUR_MUTANTS=1, table witness_recurring_mutants.js): each rewrites the shipped source in a mirror of COPIES, proves the rewrite APPLIED, and the named check must
//   go FAIL in a child run that prints its verdict (a crash = "not killed").
// Command: node erp/tests/witness_recurring.js            (add RECUR_MUTANTS=1 for the mutant sweep)
'use strict';
var fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process'), crypto = require('crypto');
if (!global.window) global.window = {};
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
var ERP = process.env.RECUR_ERP || path.join(__dirname, '..');
var MUTANT = process.env.RECUR_MUTANT || '';
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
  say('  §RECUR-CHECK case=' + cs + ' key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' rule="' + rule + '"' + (ok ? '' : ' got=' + JSON.stringify(info)));
}
function verdict(cs) { var c = CASES[cs] || { judged: 0, failed: 0 }; var v = !c.judged ? 'INCONCLUSIVE' : c.failed ? 'FAIL' : 'PASS'; say('§RECUR-' + cs + ' verdict=' + v + ' judged=' + c.judged + ' failed=' + c.failed + (MUTANT ? ' mutant=' + MUTANT : '')); return v; }
function J(x) { return JSON.stringify(x); }
function guard(cs, key, rule, fn) { try { fn(); } catch (e) { check(cs, key, rule, false, 'threw: ' + (e && (e.message || e.stack) || String(e))); } }
function sha256(b) { return crypto.createHash('sha256').update(b).digest('hex'); }
var BASE_PIN = 'd35e8a75a3be06295e3a695381998c2bed38027071c27a5adcbd3b81f5ffaa52';       // team base of origin/main (same pin as W-IMPORT-PAYMENT)
function baseOracle() {
  var buf = fs.readFileSync(path.join(ERP, 'ad_seed.db')), man = 'seed ' + sha256(buf) + ' ' + buf.length + '\n';
  ['ad_seed.db.sql', 'mfg.sql'].forEach(function (nm, i) { var f = path.join(ERP, 'patches', nm); man += '--patch ' + i + (fs.existsSync(f) ? '\n' + fs.readFileSync(f, 'utf8') : ' MISSING') + '\n'; });
  return sha256(Buffer.from(man, 'utf8'));
}
function reqERP(f) { return require(path.join(ERP, f)); }
function tryReq(f) { try { return { m: reqERP(f) }; } catch (e) { return { m: null, err: e.message }; } }
function read(f) { try { return fs.readFileSync(path.join(ERP, f), 'utf8'); } catch (e) { return ''; } }
function num(x) { return x == null ? null : Number(x); }
function r2(x) { return Math.round(Number(x) * 100) / 100; }

(async function main() {
  var SQL = await initSqlJs({ locateFile: function (f) { return path.join(SQLJS_DIR, 'dist', f); } });
  var db = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(ERP, 'ad_seed.db'))));
  var pOk = 0, pFail = 0;
  fs.readFileSync(path.join(ERP, 'patches/ad_seed.db.sql'), 'utf8').split(/;\s*\n/).forEach(function (st) { st = st.replace(/^\s*--[^\n]*\n?/gm, '').trim(); if (!st) return; try { db.run(st); pOk++; } catch (e) { pFail++; } });
  function q0(sql, params) {
    var st = db.prepare(sql), out = [];
    try { if (params && params.length) st.bind(params.map(function (v) { return v === undefined ? null : v; })); while (st.step()) { var o = st.getAsObject(), r = {}; for (var k in o) r[k.toLowerCase()] = o[k]; out.push(r); } }
    finally { st.free(); }
    return out;
  }
  var AR = tryReq('ad_rule.js'), AIT = tryReq('ad_import_tables.js');
  say('§RECUR-LOAD erp=' + ERP + ' mutant=' + (MUTANT || 'none') + ' seedPatch ok=' + pOk + ' failed=' + pFail + ' adImportTables=' + (AIT.m ? 'loaded ensureRecurring:' + typeof AIT.m.ensureRecurring : 'ABSENT (' + AIT.err + ')'));

  // ═══ TABLE ═══════════════════════════════════════════════════════════════════════════════════════════
  function dictCols(t) { return q0("SELECT lower(c.columnname) AS c FROM ad_column c JOIN ad_table t ON t.ad_table_id=c.ad_table_id WHERE lower(t.tablename)=? AND c.isactive='Y'", [t]).map(function (r) { return r.c; }).sort(); }
  function physCols(t) { return q0('PRAGMA table_info(' + t + ')').map(function (r) { return String(r.name).toLowerCase(); }).sort(); }
  function tableExists(t) { return q0("SELECT name FROM sqlite_master WHERE type='table' AND name=?", [t]).length; }
  var dRun = dictCols('c_recurring_run'), dGrp = dictCols('c_recurringgroup');
  check('TABLE', 'seed-gap', 'MEASURED gap: the seed has the dictionary columns of C_Recurring_Run (' + dRun.length + ') and C_RecurringGroup (' + dGrp.length + ') but NO physical table for either, while C_Recurring has one',
    dRun.length > 0 && dGrp.length > 0 && !tableExists('c_recurring_run') && !tableExists('c_recurringgroup') && tableExists('c_recurring') === 1, { dRun: dRun.length, dGrp: dGrp.length, run: tableExists('c_recurring_run'), grp: tableExists('c_recurringgroup'), rec: tableExists('c_recurring') });
  guard('TABLE', 'ensure', 'AdImportTables.ensure(db) creates the two Recurring tables (via ensureRecurring), a second ensureRecurring creates nothing (0), and the physical columns equal the dictionary columns of both', function () {
    if (!AIT.m || typeof AIT.m.ensure !== 'function' || typeof AIT.m.ensureRecurring !== 'function') { check('TABLE', 'ensure', 'ad_import_tables.js exports ensure + ensureRecurring', false, AIT.err || 'no ensureRecurring'); return; }
    AIT.m.ensure(db); var n2 = AIT.m.ensureRecurring(db);
    var pr = physCols('c_recurring_run'), pg = physCols('c_recurringgroup');
    check('TABLE', 'ensure', 'both tables exist after ensure(db); ensureRecurring again = 0; physical columns == dictionary columns', tableExists('c_recurring_run') === 1 && tableExists('c_recurringgroup') === 1 && n2 === 0 && J(pr) === J(dRun) && J(pg) === J(dGrp),
      { n2: n2, onlyPhysRun: pr.filter(function (c) { return dRun.indexOf(c) < 0; }), onlyDictRun: dRun.filter(function (c) { return pr.indexOf(c) < 0; }), onlyPhysGrp: pg.filter(function (c) { return dGrp.indexOf(c) < 0; }), onlyDictGrp: dGrp.filter(function (c) { return pg.indexOf(c) < 0; }) });
  });
  check('TABLE', 'base-hash', 'the team BASE hash (seed + the two hashed patch files) is byte-identical to origin/main: no hashed file touched', baseOracle() === BASE_PIN, { got: baseOracle(), pin: BASE_PIN });
  var hSrc = read('idempiere.html'), swSrc = read('sw.js');
  check('TABLE', 'wiring', 'the page loads processes/Recurring.js and processes/RecurringRun.js (Recurring first: RecurringRun uses its executeRun) and sw.js precaches both',
    /<script src="processes\/Recurring\.js\?v=\d+"/.test(hSrc) && /<script src="processes\/RecurringRun\.js\?v=\d+"/.test(hSrc) && hSrc.indexOf('processes/Recurring.js') < hSrc.indexOf('processes/RecurringRun.js') && /'processes\/Recurring\.js'/.test(swSrc) && /'processes\/RecurringRun\.js'/.test(swSrc), { html: /Recurring/.test(hSrc), sw: /Recurring/.test(swSrc) });

  if (AR.m) AR.m.ensure(db);
  var K = reqERP('ws_kernel.js'), k = K.build(db), ML = k.ML, AP = reqERP('ad_process.js');
  var S = { clientId: 11, orgId: 11, userId: 100, roleId: 102, warehouseId: 103, actor: 'witness:recurring' };
  function one(sql, p) { return k.q(sql, p || [])[0] || null; }
  function commit(fn, meta) {
    var trx = new ML.Trx(k.q, Object.assign(k.env(S), MUTANT ? { noPost: true } : {})), r;
    try { r = fn(trx, ML) || { ok: true }; } catch (ex) { r = { ok: false, error: 'model threw: ' + (ex && ex.message) }; trx.say('§MODEL-ERR ' + (ex && ex.stack || ex)); }
    var ok = r.ok !== false, ops = ok ? trx.groupOps() : [], ids = []; if (ok && ops.length) ids = k.commit(S, ops, meta);
    return Object.assign({}, r, { ok: ok, ops: ops, ids: ids, log: trx.log, trx: trx });
  }
  var ALLLOG = [];
  // save one row through the ERP write path (the model's beforeSave runs); returns {ok, error, id}
  function saveRow(table, f) { var out = {}; var c = commit(function (trx) { var sv = ML.save(trx, table, null, ML.newPO(trx, table, f)); out.sv = sv; return { ok: sv.ok, error: sv.error }; }); (c.log || []).forEach(function (l) { ALLLOG.push(l); });
    var idc = table + '_id', id = null; try { id = c.ok ? one('SELECT MAX(' + idc + ') AS m FROM ' + table).m : null; } catch (e) { c.error = (c.error || '') + ' / ' + e.message; c.ok = false; } return { ok: c.ok, error: c.error, id: id }; }
  function mkRec(f) { return saveRow('c_recurring', Object.assign({ name: 'R', recurringtype: 'I', c_invoice_id: 109, frequencytype: 'M', frequency: 1, runsmax: 3, runsremaining: 0, datenextrun: '2026-11-01 00:00:00' }, f || {})); }
  function run(proc, params, recordId) {
    var res = commit(function (trx) { var r0 = AP.runInTrx(trx, proc, { recordId: recordId || 0, tableId: proc === 213 ? 574 : 0, params: params || {} }); return { ok: r0.ok, r: r0, error: r0.summary }; }, { ws: 'recurring', proc: proc });
    (res.log || []).forEach(function (l) { ALLLOG.push(l); });
    return { ok: res.r ? res.r.ok === true && res.ok : false, summary: res.r && res.r.summary, logs: (res.r && res.r.logs) || [], log: res.log || [], ops: res.ops };
  }
  var rec = function (id) { return one('SELECT * FROM c_recurring WHERE c_recurring_id=?', [id]); };
  var runs = function (id) { return k.q('SELECT * FROM c_recurring_run WHERE c_recurring_id=? ORDER BY c_recurring_run_id', [id]); };
  var inv = function (id) { return one('SELECT * FROM c_invoice WHERE c_invoice_id=?', [id]); };
  var nInv = function () { return one('SELECT COUNT(*) AS n FROM c_invoice').n; };
  var nRuns = function () { return one('SELECT COUNT(*) AS n FROM c_recurring_run').n; };
  var d10 = function (s) { return String(s).slice(0, 10); };
  var SRC = one('SELECT * FROM c_invoice WHERE c_invoice_id=109'), SRCL = k.q('SELECT * FROM c_invoiceline WHERE c_invoice_id=109 ORDER BY line');
  say('§RECUR-FIXTURE source invoice109=' + J(SRC && [SRC.documentno, SRC.c_bpartner_id, SRC.c_paymentterm_id, SRC.grandtotal, SRC.totallines, SRC.c_doctype_id, SRC.issotrx, SRC.dateinvoiced]) + ' lines=' + J(SRCL.map(function (l) { return [l.m_product_id, l.qtyinvoiced, l.priceactual, l.linenetamt]; })));

  // ═══ PORT ═════════════════════════════════════════════════════════════════════════════════════════════
  check('PORT', 'registered', 'AD_Process 213 -> org.compiere.process.Recurring and 200074 -> org.idempiere.process.RecurringRun are registered ports (erp/processes/Recurring.js, RecurringRun.js)',
    !!AP.JAVA['org.compiere.process.Recurring'] && !!AP.JAVA['org.idempiere.process.RecurringRun'] && one('SELECT classname FROM ad_process WHERE ad_process_id=213').classname === 'org.compiere.process.Recurring' && one('SELECT classname FROM ad_process WHERE ad_process_id=200074').classname === 'org.idempiere.process.RecurringRun',
    { rec: !!AP.JAVA['org.compiere.process.Recurring'], rr: !!AP.JAVA['org.idempiere.process.RecurringRun'] });
  var p213 = k.q("SELECT columnname AS c FROM ad_process_para WHERE ad_process_id=213 AND isactive='Y'"), p2 = k.q("SELECT columnname AS c FROM ad_process_para WHERE ad_process_id=200074 AND isactive='Y' ORDER BY seqno").map(function (r) { return r.c; });
  check('PORT', 'params-x-of-n', 'X of N: process 213 declares 0 parameters (legacy prepare() reads none); process 200074 declares exactly ' + J(['C_RecurringGroup_ID', 'DocAction', 'Prm_Comment', 'Cut_Date']) + ' - all read by RecurringRun.prepare() (:63-83: C_RecurringGroup_ID, Cut_Date, DocAction, Prm_*)',
    p213.length === 0 && J(p2.slice().sort()) === J(['C_RecurringGroup_ID', 'Cut_Date', 'DocAction', 'Prm_Comment']) && ['C_RecurringGroup_ID', 'Cut_Date', 'DocAction', "'Prm_'"].every(function (n) { return read('processes/RecurringRun.js').indexOf(n.indexOf("'") === 0 ? n : "'" + n + "'") >= 0 || read('processes/RecurringRun.js').indexOf(n.replace(/'/g, '"')) >= 0; }), { p213: p213.length, p2: p2 });

  // ═══ TYPES (defaults + beforeSave; before the runs) ═════════════════════════════════════════════════════
  guard('TYPES', 'defaults', 'MRecurring.setInitialDefaults :64-70: a new C_Recurring starts FrequencyType M, Frequency 1, RunsMax 1, RunsRemaining 0, DateNextRun = today', function () {
    var c = commit(function (trx) { var po = ML.newPO(trx, 'c_recurring', {}); return { ok: true, po: po, today: trx.env.date }; }), po = c.po || {};
    check('TYPES', 'defaults', 'defaults as the Java constructor sets them', po.frequencytype === 'M' && Number(po.frequency) === 1 && Number(po.runsmax) === 1 && Number(po.runsremaining) === 0 && po.datenextrun === c.today, po);
  });
  guard('TYPES', 'mandatory', 'MRecurring.beforeSave :255-290: no RecurringType, or a Type I without C_Invoice_ID, is refused with FillMandatory (nothing saved)', function () {
    var n0 = one('SELECT COUNT(*) AS n FROM c_recurring').n, a = saveRow('c_recurring', { name: 'bad1', recurringtype: null }), b = saveRow('c_recurring', { name: 'bad2', recurringtype: 'I', c_invoice_id: null }), c = saveRow('c_recurring', { name: 'bad3', recurringtype: 'O', c_order_id: null });
    check('TYPES', 'mandatory', 'three refusals naming the missing element, no row written', !a.ok && !b.ok && !c.ok && /FillMandatory/.test(a.error + b.error + c.error) && /Invoice/.test(b.error) && /Order/.test(c.error) && one('SELECT COUNT(*) AS n FROM c_recurring').n === n0, { a: a.error, b: b.error, c: c.error });
  });

  // ═══ RUN ═══════════════════════════════════════════════════════════════════════════════════════════════
  var R1 = null, RUN1 = null, NEW1 = null;
  guard('RUN', 'run-1', 'Recurring (213) on a Type I recurring of invoice 109 raises ONE new invoice + ONE run row and advances the recurring', function () {
    R1 = mkRec({ name: 'Renewal 109', runsmax: 3, runsremaining: 99, datenextrun: '2026-11-01 00:00:00' });
    var nI = nInv(), nR = nRuns(); RUN1 = run(213, {}, R1.id);
    var rn = runs(R1.id), rc = rec(R1.id), ni = rn[0] ? inv(rn[0].c_invoice_id) : null; NEW1 = ni;
    check('RUN', 'ran', 'fixture saved, the process ran ok, answers "Created <DocumentNo of the new invoice>"', R1.ok && RUN1.ok === true && !!ni && String(RUN1.summary) === 'Created ' + ni.documentno, { r1: R1.error, ok: RUN1.ok, summary: RUN1.summary, docno: ni && ni.documentno });
    check('RUN', 'one-invoice-one-run', 'exactly ONE new invoice and ONE new C_Recurring_Run row; the run points at the new invoice with DateDoc = the OLD DateNextRun (MRecurringRun ctor :43-52), client/org of the recurring',
      nInv() === nI + 1 && nRuns() === nR + 1 && rn.length === 1 && !!ni && num(rn[0].ad_client_id) === 11 && num(rn[0].ad_org_id) === num(rc.ad_org_id) && num(rn[0].c_recurring_id) === R1.id && d10(rn[0].datedoc) === '2026-11-01' && rn[0].c_payment_id == null && rn[0].c_order_id == null, { dI: nInv() - nI, dR: nRuns() - nR, run: rn[0] });
    if (!ni) return;
    check('RUN', 'copy-header', 'the new invoice is a copy of 109: BP ' + SRC.c_bpartner_id + ', location, term ' + SRC.c_paymentterm_id + ', currency, price list, sales rep, payment rule, description "' + SRC.description + '"; IsSOTrx ' + SRC.issotrx + '; C_DocType_ID 0 and C_DocTypeTarget_ID = the source C_DocType_ID ' + SRC.c_doctype_id + ' (copyFrom(from.getC_DocType_ID()))',
      ['c_bpartner_id', 'c_bpartner_location_id', 'c_paymentterm_id', 'c_currency_id', 'm_pricelist_id', 'salesrep_id', 'paymentrule', 'description', 'issotrx'].every(function (c) { return String(ni[c]) === String(SRC[c]); }) && num(ni.c_doctype_id) === 0 && num(ni.c_doctypetarget_id) === num(SRC.c_doctype_id), { ni: ['c_bpartner_id', 'c_paymentterm_id', 'description', 'c_doctype_id', 'c_doctypetarget_id'].map(function (c) { return ni[c]; }), src: ['c_bpartner_id', 'c_paymentterm_id', 'description', 'c_doctype_id'].map(function (c) { return SRC[c]; }) });
    check('RUN', 'dates', 'DateInvoiced = DateAcct = the recurring DateNextRun 2026-11-01 (copyFrom(from, dateDoc, dateDoc ...)), NOT the source 2003-11-01', d10(ni.dateinvoiced) === '2026-11-01' && d10(ni.dateacct) === '2026-11-01', { di: ni.dateinvoiced, da: ni.dateacct });
    check('RUN', 'draft', 'DocStatus DR / DocAction CO, a NEW DocumentNo (not 100000), IsApproved/IsPaid/IsPrinted/Posted/Processed N, no order / payment / cash line / reference invoice link', ni.docstatus === 'DR' && ni.docaction === 'CO' && !!ni.documentno && ni.documentno !== SRC.documentno && ['isapproved', 'ispaid', 'isprinted', 'posted', 'processed'].every(function (c) { return ni[c] === 'N'; }) && ni.c_order_id == null && ni.c_payment_id == null && ni.c_cashline_id == null && ni.ref_invoice_id == null, { st: ni.docstatus, docno: ni.documentno, flags: ['isapproved', 'ispaid', 'posted', 'processed'].map(function (c) { return ni[c]; }) });
    var nl = k.q('SELECT * FROM c_invoiceline WHERE c_invoice_id=? ORDER BY line', [ni.c_invoice_id]), sumNet = r2(nl.reduce(function (a, l) { return a + Number(l.linenetamt); }, 0)), tax = r2(k.q('SELECT COALESCE(SUM(taxamt),0) AS t FROM c_invoicetax WHERE c_invoice_id=?', [ni.c_invoice_id])[0].t);
    check('RUN', 'copy-lines', 'the lines are copied (same count/product/qty/price as 109\'s ' + SRCL.length + ' line); header TotalLines = the lines (independent SUM oracle) = 215.90 and GrandTotal = lines + tax (oracle) = 228.85',
      nl.length === SRCL.length && nl.every(function (l, i) { return num(l.m_product_id) === num(SRCL[i].m_product_id) && Number(l.qtyinvoiced) === Number(SRCL[i].qtyinvoiced) && Number(l.priceactual) === Number(SRCL[i].priceactual); }) && r2(ni.totallines) === sumNet && sumNet === 215.9 && r2(ni.grandtotal) === r2(sumNet + tax) && r2(ni.grandtotal) === 228.85, { n: nl.length, sumNet: sumNet, tax: tax, tl: ni.totallines, gt: ni.grandtotal });
    check('RUN', 'recurring-advanced', 'RunsRemaining = RunsMax(3) - COUNT(runs) - 1 = 2 although the stored value was 99 (calculateRuns recomputes from the runs); DateNextRun 2026-11-01 -> 2026-12-01; DateLastRun set',
      Number(rc.runsremaining) === 2 && d10(rc.datenextrun) === '2026-12-01' && !!rc.datelastrun, { rr: rc.runsremaining, next: rc.datenextrun, last: rc.datelastrun });
    check('RUN', 'log', 'the shipped §RECUR line names the run (executeRun type=I created=c_invoice remaining=2 next=2026-12-01)', RUN1.log.some(function (l) { return /^§RECUR executeRun c_recurring=\d+ type=I created=c_invoice:\S+ dateDoc=2026-11-01 00:00:00 remaining=2 next=2026-12-01 00:00:00/.test(l); }), RUN1.log.filter(function (l) { return /RECUR/.test(l); }));
  });

  // ═══ SEQ ═══════════════════════════════════════════════════════════════════════════════════════════════
  guard('SEQ', 'runs-2-3-and-no-left', 'runs 2 and 3 give remaining 1 / 0 and next 2027-01-01 / 2027-02-01, three DIFFERENT invoices, three run rows; the 4th run FAILS "No Runs Left" and persists nothing', function () {
    if (!R1 || !R1.ok) { check('SEQ', 'runs-2-3-and-no-left', 'fixture exists', false, 'RUN fixture missing'); return; }
    var a = run(213, {}, R1.id), ra = rec(R1.id), b = run(213, {}, R1.id), rb = rec(R1.id), rn = runs(R1.id), ids = rn.map(function (x) { return x.c_invoice_id; });
    check('SEQ', 'advance', 'after run 2: remaining 1, next 2027-01-01; after run 3: remaining 0, next 2027-02-01; three distinct invoices dated 2026-11-01 / 2026-12-01 / 2027-01-01',
      a.ok && b.ok && Number(ra.runsremaining) === 1 && d10(ra.datenextrun) === '2027-01-01' && Number(rb.runsremaining) === 0 && d10(rb.datenextrun) === '2027-02-01' && rn.length === 3 && new Set(ids).size === 3 && J(rn.map(function (x) { return d10(inv(x.c_invoice_id).dateinvoiced); })) === J(['2026-11-01', '2026-12-01', '2027-01-01']), { a: a.summary, b: b.summary, rem: [ra.runsremaining, rb.runsremaining], next: [ra.datenextrun, rb.datenextrun], dates: rn.map(function (x) { return inv(x.c_invoice_id) && inv(x.c_invoice_id).dateinvoiced; }) });
    var i0 = nInv(), r0 = nRuns(), j0 = rec(R1.id), c = run(213, {}, R1.id), j1 = rec(R1.id);
    check('SEQ', 'no-runs-left', 'the 4th run: process FAILS with "No Runs Left", no new invoice, no new run row, the recurring row is unchanged (the transaction rolled back)', c.ok === false && /No Runs Left/.test(String(c.summary)) && nInv() === i0 && nRuns() === r0 && J([j0.runsremaining, j0.datenextrun, j0.datelastrun]) === J([j1.runsremaining, j1.datenextrun, j1.datelastrun]), { ok: c.ok, summary: c.summary, dI: nInv() - i0, dR: nRuns() - r0 });
  });
  guard('SEQ', 'stored-remaining-untouched', 'MEASURED rule: with RunsMax 1 and one run row already present, the stored RunsRemaining (7) is NOT what decides - COUNT(runs) does: the run fails "No Runs Left" and 7 stays', function () {
    var rr = mkRec({ name: 'Exhausted', runsmax: 1, runsremaining: 7 }); saveRow('c_recurring_run', { c_recurring_id: rr.id, c_invoice_id: 109, datedoc: '2026-10-01 00:00:00' });
    var i0 = nInv(), n0 = nRuns(), c = run(213, {}, rr.id);
    check('SEQ', 'stored-remaining-untouched', 'fails No Runs Left; stored RunsRemaining still 7; no invoice/run row', c.ok === false && /No Runs Left/.test(String(c.summary)) && Number(rec(rr.id).runsremaining) === 7 && nInv() === i0 && nRuns() === n0, { ok: c.ok, summary: c.summary, rr: rec(rr.id).runsremaining });
  });

  // ═══ FREQ ══════════════════════════════════════════════════════════════════════════════════════════════
  guard('FREQ', 'calendar', 'Calendar.add per FrequencyType (hand-computed expectations)', function () {
    var cases = [['D', 5, '2026-11-01 00:00:00', '2026-11-06 00:00:00'], ['W', 2, '2026-11-01 00:00:00', '2026-11-15 00:00:00'], ['M', 1, '2027-01-31 00:00:00', '2027-02-28 00:00:00'], ['M', 1, '2028-01-31 00:00:00', '2028-02-29 00:00:00'],
      ['M', 13, '2026-11-30 00:00:00', '2027-12-30 00:00:00'], ['Q', 1, '2026-11-30 00:00:00', '2027-02-28 00:00:00'], ['M', 1, '2026-11-01 13:45:10', '2026-12-01 13:45:10'], ['D', 40, '2026-12-25 00:00:00', '2027-02-03 00:00:00']];
    var bad = [];
    cases.forEach(function (c) { var rr = mkRec({ name: 'F-' + c[0] + c[1], frequencytype: c[0], frequency: c[1], runsmax: 2, datenextrun: c[2] }); var res = run(213, {}, rr.id); var got = rec(rr.id).datenextrun; if (!res.ok || String(got).slice(0, 19) !== c[3]) bad.push([c, got, res.summary]); });
    check('FREQ', 'calendar', cases.length + ' (type, n, date) -> next date cases incl. month-end clamp Jan 31 -> Feb 28 / Feb 29 (2028), +13 months, quarterly, time of day kept, 40 days across a year end', !bad.length, bad);
  });
  guard('FREQ', 'frequency-lt-1', 'Frequency 0 is fixed to 1 and SAVED (setDateNextRun :222-226)', function () {
    var rr = mkRec({ name: 'F-zero', frequency: 0, runsmax: 2, datenextrun: '2026-11-01 00:00:00' }), res = run(213, {}, rr.id), x = rec(rr.id);
    check('FREQ', 'frequency-lt-1', 'next = +1 month, stored Frequency = 1', res.ok && d10(x.datenextrun) === '2026-12-01' && Number(x.frequency) === 1, { ok: res.ok, next: x.datenextrun, f: x.frequency });
  });

  // ═══ TYPES (runs) ══════════════════════════════════════════════════════════════════════════════════════
  guard('TYPES', 'payment', 'Type P copies a payment: Drafted/CO, unprocessed, unposted, unreconciled, dated DateNextRun, fresh DocumentNo, same BP and PayAmt', function () {
    var sp = one("SELECT * FROM c_payment WHERE docstatus='CO' ORDER BY c_payment_id LIMIT 1");
    if (!sp) { check('TYPES', 'payment', 'a Complete payment exists in the seed to copy', false, 'none'); return; }
    var rr = mkRec({ name: 'Pay-rec', recurringtype: 'P', c_invoice_id: null, c_payment_id: sp.c_payment_id, runsmax: 2, datenextrun: '2026-11-05 00:00:00' }), n0 = one('SELECT COUNT(*) AS n FROM c_payment').n, res = run(213, {}, rr.id), rn = runs(rr.id), np = rn[0] && rn[0].c_payment_id ? one('SELECT * FROM c_payment WHERE c_payment_id=?', [rn[0].c_payment_id]) : null;
    check('TYPES', 'payment', 'one new payment, run row carries C_Payment_ID, state as legacy :158-178', res.ok && !!np && one('SELECT COUNT(*) AS n FROM c_payment').n === n0 + 1 && np.docstatus === 'DR' && np.docaction === 'CO' && np.processed === 'N' && np.posted === 'N' && np.isreconciled === 'N' && d10(np.datetrx) === '2026-11-05' && d10(np.dateacct) === '2026-11-05' && !!np.documentno && np.documentno !== sp.documentno && num(np.c_bpartner_id) === num(sp.c_bpartner_id) && Number(np.payamt) === Number(sp.payamt) && String(res.summary) === 'Created ' + np.documentno,
      { ok: res.ok, summary: res.summary, np: np && [np.docstatus, np.docaction, np.processed, np.posted, np.isreconciled, np.datetrx, np.documentno, np.payamt], src: [sp.documentno, sp.payamt] });
  });
  guard('TYPES', 'unported', 'Types O / J / G are not ported: the process FAILS naming "not ported", nothing written (legacy\'s error path)', function () {
    var bad = [];
    [['O', { c_order_id: 100 }], ['J', { c_project_id: 100 }], ['G', { gl_journalbatch_id: 100 }]].forEach(function (t) {
      var rr = mkRec(Object.assign({ name: 'U-' + t[0], recurringtype: t[0], c_invoice_id: null, runsmax: 2 }, t[1])); if (!rr.ok) { bad.push([t[0], 'fixture ' + rr.error]); return; }
      var i0 = nInv(), n0 = nRuns(), res = run(213, {}, rr.id);
      if (res.ok !== false || !/not ported/.test(String(res.summary)) || nRuns() !== n0 || nInv() !== i0 || runs(rr.id).length) bad.push([t[0], res.ok, res.summary]);
    });
    check('TYPES', 'unported', 'O, J and G each fail with "not ported - named" and write no run row / invoice', !bad.length, bad);
  });
  guard('TYPES', 'invalid-type', 'a RecurringType outside I/O/J/G/P answers "Invalid ... = Z" as a normal result (:176-177) and writes no run row', function () {
    var rr = mkRec({ name: 'Z-rec', recurringtype: 'Z', c_invoice_id: null, runsmax: 2 }), i0 = nInv(), n0 = nRuns(), res = run(213, {}, rr.id);
    check('TYPES', 'invalid-type', 'ok, summary "Invalid ... = Z", nothing written', rr.ok && res.ok === true && /^Invalid .*= Z$/.test(String(res.summary)) && nInv() === i0 && nRuns() === n0, { rr: rr.error, ok: res.ok, summary: res.summary });
  });
  guard('TYPES', 'no-row', 'a Record_ID naming no C_Recurring row: legacy builds an empty MRecurring and toString() throws NullPointerException - the process fails, nothing written', function () {
    var n0 = nRuns(), res = run(213, {}, 99999999);
    check('TYPES', 'no-row', 'process fails with a NullPointerException message, no run row', res.ok === false && /NullPointerException/.test(String(res.summary)) && nRuns() === n0, { ok: res.ok, summary: res.summary });
  });

  // ═══ RR  (200074) ══════════════════════════════════════════════════════════════════════════════════════
  var G1 = saveRow('c_recurringgroup', { name: 'Group 1', value: 'G1' }), G2 = saveRow('c_recurringgroup', { name: 'Group 2', value: 'G2' }), G3 = saveRow('c_recurringgroup', { name: 'Group 3', value: 'G3' });
  var SRC2 = null;
  guard('RR', 'fixture', 'fixture: a draft source invoice (a copy of 109) whose Description / line Description carry tags, six recurrings in two groups', function () {
    var INV = reqERP('model_invoice.js');
    var c = commit(function (trx) {
      var s2 = INV.MInvoice_copyFrom(trx, trx.get('c_invoice', 109), '2026-10-01 00:00:00', '2026-10-01 00:00:00', 116, true, false, false, null);
      ML.saveEx(trx, 'c_invoice', trx.get('c_invoice', s2.c_invoice_id), { description: 'Renewal @Prm_Comment@ #@DocumentNo@', c_doctype_id: 116 });   // a recurring source carries C_DocType_ID (legacy copies from.getC_DocType_ID(); a Drafted copy has 0 until prepare)
      trx.find('c_invoiceline', { c_invoice_id: s2.c_invoice_id }).forEach(function (l) { ML.saveEx(trx, 'c_invoiceline', l, { description: 'Line @Prm_Comment@ a@@b' }); });
      return { ok: true };
    });
    SRC2 = one('SELECT MAX(c_invoice_id) AS m FROM c_invoice').m;
    check('RR', 'fixture', 'source draft invoice saved with tagged descriptions', c.ok && !!SRC2 && /@Prm_Comment@/.test(inv(SRC2).description) && G1.ok && G2.ok && G3.ok, { c: c.error, g: [G1.error, G2.error, G3.error] });
  });
  var A, B, Cc, D, E, F, H;
  guard('RR', 'run', 'Recurring Run (200074) group G1, Cut_Date 2026-11-30, DocAction CO, Prm_Comment "Oct renewal": due = A (11-01), B (11-15) in Name order; excluded = C (other group), D (due 2027), E (inactive), F (exhausted), H (other client)', function () {
    var base = { recurringtype: 'I', c_invoice_id: SRC2, frequencytype: 'M', frequency: 1, runsmax: 3, runsremaining: 0 };
    A = mkRec(Object.assign({}, base, { name: 'A rent', c_recurringgroup_id: G1.id, datenextrun: '2026-11-01 00:00:00' }));
    B = mkRec(Object.assign({}, base, { name: 'B rent', c_recurringgroup_id: G1.id, datenextrun: '2026-11-15 00:00:00' }));
    Cc = mkRec(Object.assign({}, base, { name: 'C other group', c_recurringgroup_id: G2.id, datenextrun: '2026-11-01 00:00:00' }));
    D = mkRec(Object.assign({}, base, { name: 'D later', c_recurringgroup_id: G1.id, datenextrun: '2027-01-01 00:00:00' }));
    E = mkRec(Object.assign({}, base, { name: 'E inactive', c_recurringgroup_id: G1.id, datenextrun: '2026-11-01 00:00:00', isactive: 'N' }));
    F = mkRec(Object.assign({}, base, { name: 'F exhausted', c_recurringgroup_id: G1.id, datenextrun: '2026-11-01 00:00:00', runsmax: 1 })); saveRow('c_recurring_run', { c_recurring_id: F.id, c_invoice_id: 109, datedoc: '2026-10-01 00:00:00' });
    H = mkRec(Object.assign({}, base, { name: 'H other client', c_recurringgroup_id: G1.id, datenextrun: '2026-11-01 00:00:00', ad_client_id: 12 }));
    var i0 = nInv(), n0 = nRuns(), res = run(200074, { C_RecurringGroup_ID: G1.id, Cut_Date: '2026-11-30', DocAction: 'CO', Prm_Comment: 'Oct renewal' }), ra = runs(A.id), rb = runs(B.id), ia = ra[0] && inv(ra[0].c_invoice_id), ib = rb[0] && inv(rb[0].c_invoice_id);
    check('RR', 'selection', 'process ok "OK"; exactly A and B ran (2 new invoices, 2 run rows); C, D, E, F, H untouched (no run rows beyond F\'s one)', res.ok === true && /^OK$/.test(String(res.summary)) && nInv() === i0 + 2 && nRuns() === n0 + 2 && ra.length === 1 && rb.length === 1 && runs(Cc.id).length === 0 && runs(D.id).length === 0 && runs(E.id).length === 0 && runs(F.id).length === 1 && runs(H.id).length === 0,
      { ok: res.ok, summary: res.summary, dI: nInv() - i0, dR: nRuns() - n0, A: ra.length, B: rb.length, C: runs(Cc.id).length, D: runs(D.id).length, E: runs(E.id).length, F: runs(F.id).length, H: runs(H.id).length, fix: [A.error, B.error, Cc.error, D.error, E.error, F.error, H.error] });
    if (!ia || !ib) return;
    check('RR', 'order-by-name', 'ORDER BY Name: A\'s invoice is created before B\'s (lower id), DateInvoiced = each DateNextRun (2026-11-01 / 2026-11-15)', Number(ia.c_invoice_id) < Number(ib.c_invoice_id) && d10(ia.dateinvoiced) === '2026-11-01' && d10(ib.dateinvoiced) === '2026-11-15', { ia: [ia.c_invoice_id, ia.dateinvoiced], ib: [ib.c_invoice_id, ib.dateinvoiced] });
    check('RR', 'docaction-complete', 'DocAction CO ran on both: DocStatus CO, Processed Y, and the payment term\'s pay schedule was created at prepare (2 C_InvoicePaySchedule rows each: 114.43 + 114.42)',
      ia.docstatus === 'CO' && ib.docstatus === 'CO' && ia.processed === 'Y' && [ia, ib].every(function (x) { var ps = k.q('SELECT dueamt FROM c_invoicepayschedule WHERE c_invoice_id=? ORDER BY duedate', [x.c_invoice_id]).map(function (r) { return Number(r.dueamt); }); return J(ps) === J([114.43, 114.42]); }), { a: [ia.docstatus, ia.processed], b: [ib.docstatus] });
    var la = k.q('SELECT description FROM c_invoiceline WHERE c_invoice_id=?', [ia.c_invoice_id]);
    check('RR', 'tags', 'Description tags replaced on header and lines: "Renewal Oct renewal #<its own DocumentNo>" (@DocumentNo@ from the po, @Prm_Comment@ from the parameter) and "Line Oct renewal a@b" (the @@ escape -> @)',
      ia.description === 'Renewal Oct renewal #' + ia.documentno && ib.description === 'Renewal Oct renewal #' + ib.documentno && la.length === 1 && la[0].description === 'Line Oct renewal a@b', { h: ia.description, l: la.map(function (x) { return x.description; }), docno: ia.documentno });
    var bl = res.logs.filter(function (x) { return x.tableId; });
    check('RR', 'buffer-logs', 'one buffer log per document: record = the Trx handle of the invoice just created (the same temp-id convention as InvoiceGenerate addBufferLog; the host resolves it at commit), tableId 318, msg "Created <DocNo>", date = the DateNextRun used (A 2026-11-01, B 2026-11-15)',
      bl.length === 2 && bl.every(function (x) { return String(x.recordId) === String(x.id) && /^#new:/.test(String(x.id)); }) && bl.every(function (x) { return num(x.tableId) === 318; }) && bl[0].msg === 'Created ' + ia.documentno && bl[1].msg === 'Created ' + ib.documentno && d10(bl[0].date) === '2026-11-01' && d10(bl[1].date) === '2026-11-15', { bl: bl });
    check('RR', 'recurring-state', 'A and B advanced one month (12-01 / 12-15) with RunsRemaining 2; D (never due) unchanged', d10(rec(A.id).datenextrun) === '2026-12-01' && d10(rec(B.id).datenextrun) === '2026-12-15' && Number(rec(A.id).runsremaining) === 2 && Number(rec(B.id).runsremaining) === 2 && d10(rec(D.id).datenextrun) === '2027-01-01', { a: rec(A.id).datenextrun, b: rec(B.id).datenextrun, d: rec(D.id).datenextrun });
    var res2 = run(200074, { C_RecurringGroup_ID: G1.id, Cut_Date: '2026-11-30', DocAction: 'CO', Prm_Comment: 'Oct renewal' });
    check('RR', 'idempotent', 'the SAME run again does nothing (A and B are now due 12-01 / 12-15 > Cut_Date): no new invoice, no run row', res2.ok === true && nInv() === i0 + 2 && nRuns() === n0 + 2, { ok: res2.ok, dI: nInv() - i0, dR: nRuns() - n0 });
  });
  guard('RR', 'defaults', 'parameters NOT sent take the dictionary default: DocAction CO (so the invoice is completed) and Cut_Date @#Date@ = today (so a recurring due in the future is NOT run); both said in a §PROC-PARAM line', function () {
    var past = mkRec({ name: 'P past', c_recurringgroup_id: G3.id, c_invoice_id: SRC2, datenextrun: '2026-10-01 00:00:00', runsmax: 2 }), fut = mkRec({ name: 'Q future', c_recurringgroup_id: G3.id, c_invoice_id: SRC2, datenextrun: '2030-01-01 00:00:00', runsmax: 2 });
    var res = run(200074, { C_RecurringGroup_ID: G3.id }), rp = runs(past.id), ip = rp[0] && inv(rp[0].c_invoice_id);
    check('RR', 'defaults', 'past one ran and is Complete (default DocAction CO); future one did not (default Cut_Date today); §PROC-PARAM printed for DocAction and Cut_Date', res.ok === true && rp.length === 1 && !!ip && ip.docstatus === 'CO' && runs(fut.id).length === 0 && res.log.some(function (l) { return /^§PROC-PARAM RecurringRun DocAction=CO/.test(l); }) && res.log.some(function (l) { return /^§PROC-PARAM RecurringRun Cut_Date=/.test(l); }),
      { ok: res.ok, summary: res.summary, past: rp.length, st: ip && ip.docstatus, fut: runs(fut.id).length, param: res.log.filter(function (l) { return /PROC-PARAM/.test(l); }) });
  });
  guard('RRFAIL', 'rollback', 'a DocAction the engine refuses (an invoice dated 2027-06-01: beyond the 100 open-future days of the auto period control, so Period Closed) throws "PO Process Failed" and the WHOLE run is rolled back: no invoice, no run row, even for the recurring that ran first', function () {
    var G4 = saveRow('c_recurringgroup', { name: 'Group 4', value: 'G4' });
    var ok1 = mkRec({ name: 'W ok', c_recurringgroup_id: G4.id, c_invoice_id: SRC2, datenextrun: '2026-10-02 00:00:00', runsmax: 2 }), closed = mkRec({ name: 'X closed period', c_recurringgroup_id: G4.id, c_invoice_id: SRC2, datenextrun: '2027-06-01 00:00:00', runsmax: 2 });
    var i0 = nInv(), n0 = nRuns(), res = run(200074, { C_RecurringGroup_ID: G4.id, Cut_Date: '2027-12-31', DocAction: 'CO' });
    check('RRFAIL', 'rollback', 'process fails naming "PO Process Failed"; invoice count and run-row count unchanged; neither recurring advanced', res.ok === false && /PO Process Failed/.test(String(res.summary)) && nInv() === i0 && nRuns() === n0 && d10(rec(ok1.id).datenextrun) === '2026-10-02' && d10(rec(closed.id).datenextrun) === '2027-06-01', { ok: res.ok, summary: res.summary, dI: nInv() - i0, dR: nRuns() - n0, n1: rec(ok1.id).datenextrun });
  });

  // ═══ shipped log + verdicts ═══════════════════════════════════════════════════════════════════════════
  check('PORT', 'no-unknown-para', 'no run printed §PROC-UNKNOWN-PARA (every parameter sent is one prepare() reads)', ALLLOG.length > 0 && !ALLLOG.some(function (l) { return /^§PROC-UNKNOWN-PARA (Recurring|RecurringRun)/.test(l); }), ALLLOG.filter(function (l) { return /UNKNOWN-PARA/.test(l); }).slice(0, 3));
  var kinds = {}; ALLLOG.forEach(function (l) { var m = /^(§[A-Z_-]+)/.exec(l); if (m && /RECUR|PROC-PARAM|PROC-INFO/.test(m[1])) kinds[m[1]] = (kinds[m[1]] || 0) + 1; });
  say('§RECUR-SHIPPED-LOG lines by kind ' + J(kinds));
  var vs = ['TABLE', 'PORT', 'TYPES', 'RUN', 'SEQ', 'FREQ', 'RR', 'RRFAIL'].map(verdict);
  var failedCases = Object.keys(CASES).filter(function (c) { return CASES[c].failed; });
  var all = !ALL.judged ? 'INCONCLUSIVE' : ALL.failed ? 'FAIL' : 'PASS';
  say('§RECUR-RESULT verdict=' + all + ' judged=' + ALL.judged + ' failed=' + ALL.failed + ' failedCases=' + J(failedCases) + (MUTANT ? ' mutant=' + MUTANT : ''));
  var exitCode = all === 'PASS' ? 0 : 1;

  // ═══ mutants (RECUR_MUTANTS=1, parent run only) ═══════════════════════════════════════════════════════
  if (process.env.RECUR_MUTANTS && !MUTANT) {
    var MUTS = [];
    try { MUTS = require('./witness_recurring_mutants.js'); } catch (e) { say('§RECUR-MUTANT-ERR no mutant table: ' + e.message); }
    var killed = 0, applied = 0, notApplied = [], crashed = [], survived = [], jobs = [];
    MUTS.forEach(function (m) {
      if (process.env.RECUR_ONLY && !new RegExp(process.env.RECUR_ONLY).test(m.name)) return;
      var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'recurmut_'));
      fs.readdirSync(ERP).forEach(function (f) { try { fs.symlinkSync(path.join(ERP, f), path.join(dir, f)); } catch (e) {} });
      // every .js/.html module (and callouts/, processes/) is COPIED, never symlinked (node resolves a symlink to its real path: a symlinked neighbour would bind to the witness's own instance); .db files and patches/ stay symlinks (read-only data)
      fs.readdirSync(ERP).forEach(function (f) { var src = path.join(ERP, f), st = fs.statSync(src);
        if ((st.isFile() && /\.(js|html)$/.test(f)) || (st.isDirectory() && (f === 'callouts' || f === 'processes'))) { try { fs.unlinkSync(path.join(dir, f)); } catch (e) {} fs.cpSync(src, path.join(dir, f), { recursive: true }); } });
      var ok = true, bySrc = {};                                                       // all edits of ONE file apply to a SINGLE read (the fixed harness pattern: a later edit must not re-read the file and drop an earlier one)
      m.edits.forEach(function (ed) { (bySrc[ed.file] = bySrc[ed.file] || []).push(ed); });
      Object.keys(bySrc).forEach(function (file) {
        var src = fs.readFileSync(path.join(dir, file), 'utf8');
        bySrc[file].forEach(function (ed) {
          var want = ed.count || 1, have = src.split(ed.from).length - 1;
          if (have !== want) { ok = false; say('§RECUR-MUTANT-EDIT ' + m.name + ' ' + ed.file + ' found ' + have + ' time(s), expected ' + want); return; }
          src = src.split(ed.from).join(ed.to);
        });
        fs.writeFileSync(path.join(dir, file), src);
      });
      if (!ok) { notApplied.push(m.name); say('§RECUR-MUTANT ' + m.name + ' NOT-APPLIED (source text not found exactly as counted: the mutant proves nothing)'); try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} return; }
      applied++; jobs.push({ m: m, dir: dir });
    });
    await new Promise(function (resolve) {
      var next = 0, running = 0, POOL = Number(process.env.RECUR_JOBS || 4);
      function pump() {
        while (running < POOL && next < jobs.length) (function (job) {
          running++;
          var child = cp.spawn(process.execPath, ['--no-experimental-fetch', __filename], { env: Object.assign({}, process.env, { RECUR_ERP: job.dir, RECUR_MUTANT: job.m.name, RECUR_MUTANTS: '' }) }), out = '', timer = setTimeout(function () { child.kill('SIGKILL'); }, 600000);
          child.stdout.on('data', function (d) { out += d; }); child.stderr.on('data', function (d) { out += d; });
          child.on('close', function (code) {
            clearTimeout(timer); running--;
            var m = job.m, rl = out.split('\n').filter(function (l) { return /^§RECUR-RESULT /.test(l); })[0], failedLines = out.split('\n').filter(function (l) { return /§RECUR-CHECK .* FAIL /.test(l); });
            var hit = (m.kills || []).filter(function (kk) { return failedLines.some(function (l) { return l.indexOf('case=' + kk.split('.')[0] + ' key=' + kk.split('.')[1] + ' ') >= 0; }); });
            if (!rl) { crashed.push(m.name); say('§RECUR-MUTANT ' + m.name + ' CRASHED (no verdict line; a crash is NOT a kill) exit=' + code + ' ' + out.split('\n').filter(function (l) { return /Error|error/.test(l); })[0]); }
            else if (/verdict=FAIL/.test(rl) && hit.length) { killed++; say('§RECUR-MUTANT ' + m.name + ' KILLED by ' + hit.join(' | ') + ' :: ' + m.what); }
            else { survived.push(m.name); say('§RECUR-MUTANT ' + m.name + ' SURVIVED verdict=' + (rl.match(/verdict=\w+/) || [''])[0] + ' expected to fail ' + (m.kills || []).join(' | ') + ' failedChecks=' + failedLines.length); }
            try { fs.rmSync(job.dir, { recursive: true, force: true }); } catch (e) {}
            if (next >= jobs.length && running === 0) resolve(); else pump();
          });
        })(jobs[next++]);
        if (!jobs.length) resolve();
      }
      pump();
    });
    var nSel = jobs.length + notApplied.length, mv = !MUTS.length ? 'INCONCLUSIVE' : (killed === nSel && !notApplied.length && !crashed.length && !survived.length) ? 'PASS' : 'FAIL';
    say('§RECUR-MUTANTS verdict=' + mv + ' total=' + nSel + ' applied=' + applied + ' killed=' + killed + ' notApplied=' + J(notApplied) + ' crashed=' + J(crashed) + ' survived=' + J(survived));
    if (mv !== 'PASS') exitCode = 1;
  }
  process.exit(exitCode);
})().catch(function (e) { say('§RECUR-RESULT verdict=FAIL harness: ' + (e && e.stack)); process.exit(2); });
