#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-ACCT-PROCESSOR (bim-compiler prompts/TEAMWORK_FRAMEWORK.md §40.1 owner: "End of day the books are posted for reporting." + §41 row F1; CARDINAL RULE: the twin does what legacy iDempiere does).
//   READ THE LOG after every run: every verdict is a §ACCTP line, the exit code is not the evidence. A mutant that CRASHES is NOT a kill: it must print its own FAIL verdict. INCONCLUSIVE when nothing was judged.
// SPEC (the claims, written before the code; legacy file:line in the code comments of the pieces). Legacy: org.adempiere.base.process/src/org/adempiere/process/ClientAcctProcessor.java (AD_Process 53187 "Tenant Accounting Processor"),
//   org.adempiere.base/src/org/compiere/process/DocumentEngine.java:349 + org/compiere/model/MClient.java:1049-1087 (the CLIENT_ACCOUNTING switch). Legacy source only (the idempiere postgres is down): every expectation is derived from the Java text, the seed or an
//   independent SQL oracle, never from the code under test.
//   SWITCH   MEASURED, not assumed: legacy posts at Complete only when CLIENT_ACCOUNTING = 'I' (DocumentEngine.java:349, MClient.isClientAccountingImmediate). The GardenWorld database carries AD_SysConfig 50034 CLIENT_ACCOUNTING = 'I' at System level
//            (migration-historic/353a-354a/postgresql/572_FR2857807.sql:3; build/erp/ad_full.db; twin seed patch patches/ad_seed.db.sql:41) - so legacy posts IMMEDIATELY for client 11. The Java default 'Q' applies only when NO row exists; AD_Client.IsPostImmediate is a stored
//            flag nothing in the Java reads. The twin switch (model_layer.js clientAccounting) reads, in order: trx.env.clientAccounting (override), the ad_sysconfig row (client 11 over System, org 0, active), Q when the table has no row, I when there is no table.
//            => default 'I': completing a document posts it (Posted Y, balanced Fact_Acct) exactly as before; 'Q' (env, a System row, a client row, or a deleted row): the document is Complete/Processed with Posted N and NO Fact_Acct, and says so (§MODEL-POST-QUEUED);
//            'D': nothing posts at Complete either, and the processor refuses with "Tenant Accounting is not enabled" (MClient.isClientAccounting false -> AdempiereUserError ClientAccountingNotEnabled).
//   PORT     AD_Process 53187 -> org.adempiere.process.ClientAcctProcessor registered (erp/processes/ClientAcctProcessor.js, wired in idempiere.html + sw.js); its two AD_Process_Para (C_AcctSchema_ID, AD_Table_ID) are exactly what prepare() reads; no §PROC-UNKNOWN-PARA.
//   RUN      queue ONE invoice X1 (a copy of 109 dated 2026-10-02) and ONE payment under 'Q'; post an identical invoice X2 under 'I' (the immediate path) as the comparison. Run 53187 with AD_Table_ID = C_Invoice (318): X1 -> Posted Y; the payment stays N (table filter);
//            the answer is "C_Invoice=<n>" where n = the invoices the SQL oracle says were due (Processed Y, Posted N or d, active, client 11 - the seed holds 8 unposted completed invoices besides X1); X1's Fact_Acct is balanced (SUM AmtAcctDr = SUM AmtAcctCr) and is
//            the SAME multiset of (account, AmtAcctDr, AmtAcctCr) as X2's immediate facts. Run 53187 for all tables: the payment is posted; a document the twin cannot post (named: no Doc class ported / allocation legs) is counted "(Errors=n)" and the others still post
//            (each document in its own transaction). The documents are posted in ProcessedOn order (NULL/0 first). A document completed less than 2 s ago (ProcessedOn > now-2s) is NOT touched. A re-run posts nothing new: Fact_Acct count unchanged, the only documents
//            counted are the ones that failed before (they stay Posted N, retried each night as legacy retries them). Posted-Y documents keep their facts untouched.
//   UNPORTED named: MCost.create(MClient) -> MCost.getCurrentCost (prints §ACCTP-UNPORTED-DEP when products with unprocessed cost details exist); tables of the dictionary with no physical table here (PP_Cost_Collector, DD_Order, A_* assets) are skipped as legacy skips a failing SELECT (SEVERE log).
// Every check names the issue it proves; INCONCLUSIVE when nothing was judged. Mutants (ACCTP_MUTANTS=1, table witness_acct_processor_mutants.js): each rewrites the shipped source in a mirror of COPIES, proves the rewrite APPLIED, and the named check must go FAIL in a child run
//   that prints its verdict (a crash = "not killed").
// Command: node erp/tests/witness_acct_processor.js            (add ACCTP_MUTANTS=1 for the mutant sweep)
'use strict';
var fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process'), crypto = require('crypto');
if (!global.window) global.window = {};
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
var ERP = process.env.ACCTP_ERP || path.join(__dirname, '..');
var MUTANT = process.env.ACCTP_MUTANT || '';
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
  say('  §ACCTP-CHECK case=' + cs + ' key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' rule="' + rule + '"' + (ok ? '' : ' got=' + JSON.stringify(info)));
}
function verdict(cs) { var c = CASES[cs] || { judged: 0, failed: 0 }; var v = !c.judged ? 'INCONCLUSIVE' : c.failed ? 'FAIL' : 'PASS'; say('§ACCTP-' + cs + ' verdict=' + v + ' judged=' + c.judged + ' failed=' + c.failed + (MUTANT ? ' mutant=' + MUTANT : '')); return v; }
function J(x) { return JSON.stringify(x); }
function guard(cs, key, rule, fn) { try { fn(); } catch (e) { check(cs, key, rule, false, 'threw: ' + (e && (e.message || e.stack) || String(e))); } }
function sha256(b) { return crypto.createHash('sha256').update(b).digest('hex'); }
var BASE_PIN = 'a3eef3f59d775cc2adfc320b82c8ec5c8045721d74490c5dfaa421cbf595b8ab';       // team base of origin/main (same pin as W-IMPORT-PAYMENT) · MOVED ON PURPOSE 2026-10-31: user Search Keys patch (TEAMWORK §48.11d, bim-ootb #2463); was d35e8a75…
function baseOracle() {
  var buf = fs.readFileSync(path.join(ERP, 'ad_seed.db')), man = 'seed ' + sha256(buf) + ' ' + buf.length + '\n';
  ['ad_seed.db.sql', 'mfg.sql'].forEach(function (nm, i) { var f = path.join(ERP, 'patches', nm); man += '--patch ' + i + (fs.existsSync(f) ? '\n' + fs.readFileSync(f, 'utf8') : ' MISSING') + '\n'; });
  return sha256(Buffer.from(man, 'utf8'));
}
function reqERP(f) { return require(path.join(ERP, f)); }
function read(f) { try { return fs.readFileSync(path.join(ERP, f), 'utf8'); } catch (e) { return ''; } }
function r2(x) { return Math.round(Number(x) * 100) / 100; }

(async function main() {
  var SQL = await initSqlJs({ locateFile: function (f) { return path.join(SQLJS_DIR, 'dist', f); } });
  var db = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(ERP, 'ad_seed.db'))));
  var pOk = 0, pFail = 0;
  fs.readFileSync(path.join(ERP, 'patches/ad_seed.db.sql'), 'utf8').split(/;\s*\n/).forEach(function (st) { st = st.replace(/^\s*--[^\n]*\n?/gm, '').trim(); if (!st) return; try { db.run(st); pOk++; } catch (e) { pFail++; } });
  try { reqERP('ad_rule.js').ensure(db); reqERP('ad_import_tables.js').ensure(db); } catch (e) { /* overlays absent on an old base: the checks that need them say so */ }
  var K = reqERP('ws_kernel.js'), k = K.build(db), ML = k.ML, AP = reqERP('ad_process.js'), INV = reqERP('model_invoice.js');
  say('§ACCTP-LOAD erp=' + ERP + ' mutant=' + (MUTANT || 'none') + ' seedPatch ok=' + pOk + ' failed=' + pFail);
  var S = { clientId: 11, orgId: 11, userId: 100, roleId: 102, warehouseId: 103, actor: 'witness:acct-processor' };
  function one(sql, p) { return k.q(sql, p || [])[0] || null; }
  var ALLLOG = [];
  function commit(fn, meta, envx) {
    var trx = new ML.Trx(k.q, Object.assign(k.env(S), envx || {})), r;
    try { r = fn(trx, ML) || { ok: true }; } catch (ex) { r = { ok: false, error: 'model threw: ' + (ex && ex.message) }; trx.say('§MODEL-ERR ' + (ex && ex.stack || ex)); }
    var ok = r.ok !== false, ops = ok ? trx.groupOps() : [], ids = []; if (ok && ops.length) ids = k.commit(S, ops, meta);
    (trx.log || []).forEach(function (l) { ALLLOG.push(l); });
    return Object.assign({}, r, { ok: ok, ops: ops, ids: ids, log: trx.log, trx: trx });
  }
  function runAcct(params, envx) {
    var res = commit(function (trx) { var r0 = AP.runInTrx(trx, 53187, { params: params || {} }); return { ok: r0.ok, r: r0, error: r0.summary }; }, { ws: 'acct_processor' }, envx);
    var logs = (res.r && res.r.logs) || [];
    return { ok: res.r ? res.r.ok === true && res.ok : false, summary: res.r && res.r.summary, answer: logs.length ? logs[logs.length - 1].msg : '', log: res.log || [], posts: (res.log || []).filter(function (l) { return /^§ACCTP post /.test(l); }) };
  }
  var nFacts = function () { return one('SELECT COUNT(*) AS n FROM fact_acct').n; };
  var facts = function (tid, id) { return k.q('SELECT * FROM fact_acct WHERE ad_table_id=? AND record_id=?', [tid, id]); };
  var sig = function (rows) { return rows.map(function (f) { return [Number(f.account_id), r2(f.amtacctdr), r2(f.amtacctcr), r2(f.amtsourcedr), r2(f.amtsourcecr), f.c_tax_id == null ? null : Number(f.c_tax_id)]; }).map(J).sort(); };
  var dictTid = function (name) { return one("SELECT ad_table_id AS i FROM ad_table WHERE lower(tablename)=?", [name]).i; };
  var TID_INV = dictTid('c_invoice'), TID_PAY = dictTid('c_payment');
  var d10 = function (s) { return String(s).slice(0, 10); };
  function completeCopy(envx) {                                       // a copy of invoice 109 dated 2026-10-02, completed ONCE; returns its id
    var out = {};
    var c = commit(function (trx) { var s = INV.MInvoice_copyFrom(trx, trx.get('c_invoice', 109), '2026-10-02 00:00:00', '2026-10-02 00:00:00', 116, true, false, false, null); var r0 = ML.processIt(trx, 'c_invoice', s.c_invoice_id, 'CO'); out.r = r0; return { ok: r0.ok, error: r0.msg }; }, { ws: 'complete' }, envx);
    out.id = one('SELECT MAX(c_invoice_id) AS m FROM c_invoice').m; out.c = c; out.row = one('SELECT * FROM c_invoice WHERE c_invoice_id=?', [out.id]); return out;
  }

  // ═══ PORT ══════════════════════════════════════════════════════════════════════════════════════════════
  var pw = k.q("SELECT columnname AS c FROM ad_process_para WHERE ad_process_id=53187 AND isactive='Y' ORDER BY seqno").map(function (r) { return r.c; }), psrc = read('processes/ClientAcctProcessor.js');
  check('PORT', 'registered', 'AD_Process 53187 -> org.adempiere.process.ClientAcctProcessor is a registered port (erp/processes/ClientAcctProcessor.js)', !!AP.JAVA['org.adempiere.process.ClientAcctProcessor'] && one('SELECT classname FROM ad_process WHERE ad_process_id=53187').classname === 'org.adempiere.process.ClientAcctProcessor', { reg: !!AP.JAVA['org.adempiere.process.ClientAcctProcessor'] });
  check('PORT', 'params-x-of-n', 'X of N: the dictionary parameters ' + J(pw) + ' are exactly the two prepare() reads (:70-85)', J(pw.slice().sort()) === J(['AD_Table_ID', 'C_AcctSchema_ID']) && pw.every(function (n) { return psrc.indexOf("name === '" + n + "'") >= 0; }), { pw: pw });
  var hSrc = read('idempiere.html'), swSrc = read('sw.js');
  check('PORT', 'wiring', 'the page loads processes/ClientAcctProcessor.js and sw.js precaches it', /<script src="processes\/ClientAcctProcessor\.js\?v=\d+"/.test(hSrc) && /'processes\/ClientAcctProcessor\.js'/.test(swSrc), { html: /ClientAcctProcessor/.test(hSrc), sw: /ClientAcctProcessor/.test(swSrc) });
  check('PORT', 'base-hash', 'the team BASE hash is byte-identical to origin/main (no hashed file touched)', baseOracle() === BASE_PIN, { got: baseOracle(), pin: BASE_PIN });

  // ═══ SWITCH ═══════════════════════════════════════════════════════════════════════════════════════════
  var cfg = one("SELECT * FROM ad_sysconfig WHERE name='CLIENT_ACCOUNTING'");
  check('SWITCH', 'measured', 'MEASURED: the seed carries AD_SysConfig 50034 CLIENT_ACCOUNTING = I at System level (legacy posts immediately for GardenWorld); AD_Client 11 IsPostImmediate is N and is NOT the switch (nothing in the Java reads it)',
    !!cfg && Number(cfg.ad_sysconfig_id) === 50034 && cfg.value === 'I' && Number(cfg.ad_client_id) === 0 && one('SELECT ispostimmediate AS p FROM ad_client WHERE ad_client_id=11').p === 'N', cfg);
  var X2 = null;
  guard('SWITCH', 'immediate-default', 'default (sysconfig I): Complete posts at once - Posted Y, balanced non-empty Fact_Acct, no queue line (the twin behaves as before this switch)', function () {
    X2 = completeCopy(); var f = facts(TID_INV, X2.id), dr = r2(f.reduce(function (a, x) { return a + Number(x.amtacctdr); }, 0)), cr = r2(f.reduce(function (a, x) { return a + Number(x.amtacctcr); }, 0));
    check('SWITCH', 'immediate-default', 'X2 Complete, Posted Y, facts > 0 and DR = CR, no §MODEL-POST-QUEUED', X2.c.ok && X2.row.docstatus === 'CO' && X2.row.processed === 'Y' && X2.row.posted === 'Y' && f.length > 0 && dr === cr && dr > 0 && !X2.c.log.some(function (l) { return /MODEL-POST-QUEUED/.test(l); }), { st: X2.row.docstatus, posted: X2.row.posted, n: f.length, dr: dr, cr: cr });
  });
  var X1 = null;
  guard('SWITCH', 'queued-env', 'env CLIENT_ACCOUNTING=Q: Complete leaves Posted N and writes NO Fact_Acct, and says so (§MODEL-POST-QUEUED); the document is otherwise Complete/Processed', function () {
    var f0 = nFacts(); X1 = completeCopy({ clientAccounting: 'Q' });
    check('SWITCH', 'queued-env', 'X1 DocStatus CO, Processed Y, Posted N, 0 facts, total Fact_Acct unchanged, queue line printed with source env.clientAccounting', X1.c.ok && X1.row.docstatus === 'CO' && X1.row.processed === 'Y' && X1.row.posted === 'N' && facts(TID_INV, X1.id).length === 0 && nFacts() === f0 && X1.c.log.some(function (l) { return /^§MODEL-POST-QUEUED table=c_invoice .*CLIENT_ACCOUNTING=Q \(env\.clientAccounting\)/.test(l); }), { st: X1.row.docstatus, posted: X1.row.posted, dF: nFacts() - f0, q: X1.c.log.filter(function (l) { return /QUEUED/.test(l); }) });
  });
  var QC = null;
  guard('SWITCH', 'queued-sysconfig', 'the ad_sysconfig rows decide when no override is given: a client-11 row Q beats the System I (queued); deleting both leaves a table with no row = the Java default Q (queued); restoring the System row I posts again', function () {
    var f0 = nFacts(); db.run("INSERT INTO ad_sysconfig (ad_sysconfig_id,ad_client_id,ad_org_id,isactive,name,value) VALUES (990011,11,0,'Y','CLIENT_ACCOUNTING','Q')");
    var a = completeCopy(); db.run('DELETE FROM ad_sysconfig WHERE ad_sysconfig_id=990011');
    var sys = one('SELECT * FROM ad_sysconfig WHERE ad_sysconfig_id=50034'); db.run('DELETE FROM ad_sysconfig WHERE ad_sysconfig_id=50034');
    var b = completeCopy(); var cfgNow = ML.clientAccounting(new ML.Trx(k.q, k.env(S)));
    db.run("INSERT INTO ad_sysconfig (ad_sysconfig_id,ad_client_id,ad_org_id,isactive,name,value) VALUES (50034,0,0,'Y','CLIENT_ACCOUNTING','I')");
    var c = completeCopy(); QC = { a: a, b: b };
    check('SWITCH', 'queued-sysconfig', 'client-row Q -> Posted N; no row at all -> Posted N and the source says "Java default Q"; System row I restored -> Posted Y',
      a.row.posted === 'N' && b.row.posted === 'N' && /Java default Q/.test(cfgNow.source) && cfgNow.mode === 'Q' && c.row.posted === 'Y' && a.c.log.some(function (l) { return /CLIENT_ACCOUNTING=Q \(ad_sysconfig\)/.test(l); }, 0), { a: a.row.posted, b: b.row.posted, bs: cfgNow, c: c.row.posted, al: a.c.log.filter(function (l) { return /QUEUED/.test(l); }) });
  });
  guard('SWITCH', 'disabled', "CLIENT_ACCOUNTING=D: nothing posts at Complete and the processor REFUSES (MClient.isClientAccounting false): \"Tenant Accounting is not enabled\", nothing posted", function () {
    var f0 = nFacts(), d = completeCopy({ clientAccounting: 'D' }), r = runAcct({}, { clientAccounting: 'D' });
    check('SWITCH', 'disabled', 'D: the completed document stays Posted N with no facts; the process fails with the ClientAccountingNotEnabled text; no fact added', d.row.posted === 'N' && facts(TID_INV, d.id).length === 0 && r.ok === false && /Accounting is not enabled/.test(String(r.summary)) && nFacts() === f0, { posted: d.row.posted, ok: r.ok, summary: r.summary });
    commit(function (trx) { var rw = trx.get('c_invoice', d.id); ML.saveEx(trx, 'c_invoice', rw, { isactive: 'N' }); return { ok: true }; });     // the D fixture must not ride the later runs
  });

  // ═══ RUN ═══════════════════════════════════════════════════════════════════════════════════════════════
  var PAY1 = null, due318 = null;
  guard('RUN', 'queue-fixture', 'fixture: X1 (invoice) and PAY1 (a receipt) are queued under Q: Complete/Processed, Posted N, no facts', function () {
    var sp = one("SELECT * FROM c_payment WHERE docstatus='CO' ORDER BY c_payment_id LIMIT 1");
    var c = commit(function (trx) {
      var f = { c_doctype_id: sp.c_doctype_id, c_bpartner_id: sp.c_bpartner_id, c_bankaccount_id: sp.c_bankaccount_id, c_currency_id: sp.c_currency_id, payamt: 50, isreceipt: sp.isreceipt, tendertype: sp.tendertype, trxtype: sp.trxtype, datetrx: '2026-10-02 00:00:00', dateacct: '2026-10-02 00:00:00', docstatus: 'DR', docaction: 'CO' };
      var sv = ML.save(trx, 'c_payment', null, ML.newPO(trx, 'c_payment', f)); if (!sv.ok) return { ok: false, error: sv.error };
      var r0 = ML.processIt(trx, 'c_payment', sv.row.c_payment_id, 'CO'); return { ok: r0.ok, error: r0.msg };
    }, { ws: 'pay' }, { clientAccounting: 'Q' });
    PAY1 = one('SELECT * FROM c_payment ORDER BY c_payment_id DESC LIMIT 1');
    check('RUN', 'queue-fixture', 'PAY1 Complete + Processed + Posted N + 0 facts; X1 still queued', c.ok && PAY1.docstatus === 'CO' && PAY1.processed === 'Y' && PAY1.posted === 'N' && facts(TID_PAY, PAY1.c_payment_id).length === 0 && !!X1 && one('SELECT posted FROM c_invoice WHERE c_invoice_id=?', [X1.id]).posted === 'N', { c: c.error, pay: PAY1 && [PAY1.docstatus, PAY1.processed, PAY1.posted] });
  });
  guard('RUN', 'table-run', 'Run 53187 with AD_Table_ID = C_Invoice: X1 is posted, the payment is NOT (table filter), the answer lists C_Invoice=<oracle count>, X1 facts are balanced and EQUAL to X2\'s immediate facts', function () {
    due318 = one("SELECT COUNT(*) AS n FROM c_invoice WHERE ad_client_id=11 AND processed='Y' AND posted IN ('N','d') AND isactive='Y'").n;
    var payFactsBefore = facts(TID_PAY, PAY1.c_payment_id).length, f0 = nFacts(), seedPosted = one("SELECT c_invoice_id AS i FROM c_invoice WHERE posted='Y' AND c_invoice_id <> ? ORDER BY c_invoice_id LIMIT 1", [X2.id]).i, sp0 = facts(TID_INV, seedPosted).length;
    var r = runAcct({ AD_Table_ID: TID_INV }), x1 = one('SELECT * FROM c_invoice WHERE c_invoice_id=?', [X1.id]), fx1 = facts(TID_INV, X1.id), fx2 = facts(TID_INV, X2.id);
    var dr = r2(fx1.reduce(function (a, x) { return a + Number(x.amtacctdr); }, 0)), cr = r2(fx1.reduce(function (a, x) { return a + Number(x.amtacctcr); }, 0));
    check('RUN', 'x1-posted', 'process ok; X1 Posted Y with facts; the payment still Posted N with no facts (table filter); the answer begins "C_Invoice=' + due318 + '" (independent oracle count of due invoices incl. X1)', r.ok === true && x1.posted === 'Y' && fx1.length > 0 && one('SELECT posted FROM c_payment WHERE c_payment_id=?', [PAY1.c_payment_id]).posted === 'N' && facts(TID_PAY, PAY1.c_payment_id).length === payFactsBefore && new RegExp('^C_Invoice=' + due318 + '(\\(Errors=\\d+\\))? - $').test(String(r.answer)) && due318 >= 9, { ok: r.ok, x1: x1.posted, n: fx1.length, answer: r.answer, due318: due318, summary: r.summary });
    check('RUN', 'balanced-and-equal', 'X1 facts balanced (SUM Dr ' + dr + ' = SUM Cr ' + cr + ') and the multiset of (account, AmtAcctDr, AmtAcctCr, source Dr/Cr, tax) EQUALS the immediate facts of X2 (same document, posted at Complete)', fx1.length > 0 && dr === cr && J(sig(fx1)) === J(sig(fx2)), { n1: fx1.length, n2: fx2.length, dr: dr, cr: cr, only1: sig(fx1).filter(function (s) { return sig(fx2).indexOf(s) < 0; }).slice(0, 3), only2: sig(fx2).filter(function (s) { return sig(fx1).indexOf(s) < 0; }).slice(0, 3) });
    check('RUN', 'posted-untouched', 'an invoice that was already Posted Y (seed #' + seedPosted + ') keeps its facts byte-for-byte count (no repost: DocManager.postDocument(force=false, repost=false))', facts(TID_INV, seedPosted).length === sp0 && sp0 > 0, { before: sp0, after: facts(TID_INV, seedPosted).length });
    var pos = r.posts.map(function (l) { return Number(/processedOn=(\d+)/.exec(l)[1]); });
    check('RUN', 'processedon-order', 'documents are posted in ProcessedOn order: 0 (NULL) first, then ascending (' + pos.length + ' posts)', pos.length >= due318 && pos.every(function (v, i) { return i === 0 || pos[i - 1] <= v; }) && pos[0] === 0 && pos.some(function (v) { return v > 0; }), { pos: pos.slice(0, 12) });
    check('RUN', 'log', 'the shipped §ACCTP line names the mode and the per-table summary', r.log.some(function (l) { return /^§ACCTP CLIENT_ACCOUNTING=I source=ad_sysconfig/.test(l); }) && r.log.some(function (l) { return /^§ACCTP summary C_Invoice=\d+/.test(l); }), r.log.filter(function (l) { return /^§ACCTP (CLIENT|summary)/.test(l); }));
  });
  var errTables = null;
  guard('RUN', 'all-tables', 'Run 53187 for every table: PAY1 is posted (balanced facts); a document the twin cannot post is counted (Errors=n), the SQL-less tables are skipped as legacy skips a failing SELECT, and the OTHER documents still post (each in its own transaction)', function () {
    var unposted0 = k.q("SELECT 1 FROM c_payment WHERE processed='Y' AND posted IN ('N','d')").length;
    var r = runAcct({}), pay = one('SELECT * FROM c_payment WHERE c_payment_id=?', [PAY1.c_payment_id]), fp = facts(TID_PAY, PAY1.c_payment_id);
    var dr = r2(fp.reduce(function (a, x) { return a + Number(x.amtacctdr); }, 0)), cr = r2(fp.reduce(function (a, x) { return a + Number(x.amtacctcr); }, 0)), ans = String(r.answer);
    errTables = (ans.match(/([A-Za-z_]+)=\d+\(Errors=\d+\)/g) || []).map(function (s) { return s.split('=')[0]; });
    check('RUN', 'all-run', 'process ok; PAY1 Posted Y, facts balanced (Dr = Cr > 0); "C_Payment=' + unposted0 + '" in the answer; at least one table reports (Errors=n) (the named unported GL Journal / Allocation / Bank Statement) AND documents after it were still posted (M_MatchPO / M_MatchInv / M_InOut counted)',
      r.ok === true && pay.posted === 'Y' && fp.length > 0 && dr === cr && new RegExp('C_Payment=' + unposted0).test(ans) && errTables.length >= 1 && /M_InOut=\d+/.test(ans) && /M_MatchInv=\d+/.test(ans), { ok: r.ok, answer: ans.slice(0, 400), unposted0: unposted0, errTables: errTables, payPosted: pay.posted });
    check('RUN', 'skips-named', 'tables of the dictionary with no physical table here are skipped with ONE §ACCTP-SQL-ERROR line each per run (not silently): PP_Cost_Collector, DD_Order, A_Asset_Reval ...', ['PP_Cost_Collector', 'DD_Order', 'A_Asset_Reval'].every(function (t) { return r.log.filter(function (l) { return l.indexOf('§ACCTP-SQL-ERROR ' + t + ':') === 0; }).length === 1; }), r.log.filter(function (l) { return /SQL-ERROR/.test(l); }).map(function (l) { return l.slice(0, 60); }));
  });
  guard('RUN', 'rerun', 'a re-run posts NOTHING new: Fact_Acct count unchanged; the only documents counted are the ones that failed before (they stay Posted N and are retried, as legacy retries them); every table that is counted shows exactly its Errors', function () {
    var f0 = nFacts(), r = runAcct({}), ans = String(r.answer), parts = ans.split(' - ').filter(Boolean), allErr = parts.every(function (p) { var m = /^([A-Za-z_]+)=(\d+)\(Errors=(\d+)\)$/.exec(p); return m && m[2] === m[3]; });
    check('RUN', 'rerun', 'ok; no new fact; every counted table is all-errors (' + parts.length + ' tables); the earlier error tables are exactly the counted ones', r.ok === true && nFacts() === f0 && allErr && J(parts.map(function (p) { return p.split('=')[0]; }).sort()) === J(errTables.slice().sort()), { ok: r.ok, dF: nFacts() - f0, answer: ans.slice(0, 300), errTables: errTables });
  });
  guard('RUN', 'two-second-guard', 'a document completed less than 2 s before the run (ProcessedOn > now - 2 s) is NOT posted; the same document IS posted by a run 5 s later (go back 2 seconds to be safe, :131-134)', function () {
    var fresh = completeCopy({ clientAccounting: 'Q' }), base = 1760000000000;
    commit(function (trx) { ML.saveEx(trx, 'c_invoice', trx.get('c_invoice', fresh.id), { processedon: base }); return { ok: true }; });
    var early = runAcct({ AD_Table_ID: TID_INV }, { nowMillis: base + 1000 }), mid = one('SELECT posted FROM c_invoice WHERE c_invoice_id=?', [fresh.id]).posted, late = runAcct({ AD_Table_ID: TID_INV }, { nowMillis: base + 5000 }), end = one('SELECT posted FROM c_invoice WHERE c_invoice_id=?', [fresh.id]).posted;
    check('RUN', 'two-second-guard', 'run at ProcessedOn+1 s leaves it Posted N; run at +5 s posts it', early.ok && mid === 'N' && late.ok && end === 'Y' && !early.posts.some(function (l) { return l.indexOf('id=' + fresh.id + ' ') >= 0; }), { mid: mid, end: end, earlyPosts: early.posts.length, latePosts: late.posts.length });
  });

  // ═══ shipped log + verdicts ═══════════════════════════════════════════════════════════════════════════
  check('PORT', 'no-unknown-para', 'no run printed §PROC-UNKNOWN-PARA', ALLLOG.length > 0 && !ALLLOG.some(function (l) { return /^§PROC-UNKNOWN-PARA ClientAcctProcessor/.test(l); }), ALLLOG.filter(function (l) { return /UNKNOWN-PARA/.test(l); }).slice(0, 3));
  var kinds = {}; ALLLOG.forEach(function (l) { var m = /^(§[A-Z_-]+)/.exec(l); if (m && /ACCTP|POST-QUEUED/.test(m[1])) kinds[m[1]] = (kinds[m[1]] || 0) + 1; });
  say('§ACCTP-SHIPPED-LOG lines by kind ' + J(kinds));
  ['PORT', 'SWITCH', 'RUN'].map(verdict);
  var failedCases = Object.keys(CASES).filter(function (c) { return CASES[c].failed; });
  var all = !ALL.judged ? 'INCONCLUSIVE' : ALL.failed ? 'FAIL' : 'PASS';
  say('§ACCTP-RESULT verdict=' + all + ' judged=' + ALL.judged + ' failed=' + ALL.failed + ' failedCases=' + J(failedCases) + (MUTANT ? ' mutant=' + MUTANT : ''));
  var exitCode = all === 'PASS' ? 0 : 1;

  // ═══ mutants (ACCTP_MUTANTS=1, parent run only) ═══════════════════════════════════════════════════════
  if (process.env.ACCTP_MUTANTS && !MUTANT) {
    var MUTS = [];
    try { MUTS = require('./witness_acct_processor_mutants.js'); } catch (e) { say('§ACCTP-MUTANT-ERR no mutant table: ' + e.message); }
    var killed = 0, applied = 0, notApplied = [], crashed = [], survived = [], jobs = [];
    MUTS.forEach(function (m) {
      if (process.env.ACCTP_ONLY && !new RegExp(process.env.ACCTP_ONLY).test(m.name)) return;
      var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'acctpmut_'));
      fs.readdirSync(ERP).forEach(function (f) { try { fs.symlinkSync(path.join(ERP, f), path.join(dir, f)); } catch (e) {} });
      // every .js/.html module (and callouts/, processes/) is COPIED, never symlinked (node resolves a symlink to its real path); .db files and patches/ stay symlinks (read-only data)
      fs.readdirSync(ERP).forEach(function (f) { var src = path.join(ERP, f), st = fs.statSync(src);
        if ((st.isFile() && /\.(js|html)$/.test(f)) || (st.isDirectory() && (f === 'callouts' || f === 'processes'))) { try { fs.unlinkSync(path.join(dir, f)); } catch (e) {} fs.cpSync(src, path.join(dir, f), { recursive: true }); } });
      var ok = true, bySrc = {};                                                       // all edits of ONE file apply to a SINGLE read (the fixed harness pattern)
      m.edits.forEach(function (ed) { (bySrc[ed.file] = bySrc[ed.file] || []).push(ed); });
      Object.keys(bySrc).forEach(function (file) {
        var src = fs.readFileSync(path.join(dir, file), 'utf8');
        bySrc[file].forEach(function (ed) {
          var want = ed.count || 1, have = src.split(ed.from).length - 1;
          if (have !== want) { ok = false; say('§ACCTP-MUTANT-EDIT ' + m.name + ' ' + ed.file + ' found ' + have + ' time(s), expected ' + want); return; }
          src = src.split(ed.from).join(ed.to);
        });
        fs.writeFileSync(path.join(dir, file), src);
      });
      if (!ok) { notApplied.push(m.name); say('§ACCTP-MUTANT ' + m.name + ' NOT-APPLIED (source text not found exactly as counted: the mutant proves nothing)'); try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} return; }
      applied++; jobs.push({ m: m, dir: dir });
    });
    await new Promise(function (resolve) {
      var next = 0, running = 0, POOL = Number(process.env.ACCTP_JOBS || 4);
      function pump() {
        while (running < POOL && next < jobs.length) (function (job) {
          running++;
          var child = cp.spawn(process.execPath, ['--no-experimental-fetch', __filename], { env: Object.assign({}, process.env, { ACCTP_ERP: job.dir, ACCTP_MUTANT: job.m.name, ACCTP_MUTANTS: '' }) }), out = '', timer = setTimeout(function () { child.kill('SIGKILL'); }, 600000);
          child.stdout.on('data', function (d) { out += d; }); child.stderr.on('data', function (d) { out += d; });
          child.on('close', function (code) {
            clearTimeout(timer); running--;
            var m = job.m, rl = out.split('\n').filter(function (l) { return /^§ACCTP-RESULT /.test(l); })[0], failedLines = out.split('\n').filter(function (l) { return /§ACCTP-CHECK .* FAIL /.test(l); });
            var hit = (m.kills || []).filter(function (kk) { return failedLines.some(function (l) { return l.indexOf('case=' + kk.split('.')[0] + ' key=' + kk.split('.')[1] + ' ') >= 0; }); });
            if (!rl) { crashed.push(m.name); say('§ACCTP-MUTANT ' + m.name + ' CRASHED (no verdict line; a crash is NOT a kill) exit=' + code + ' ' + out.split('\n').filter(function (l) { return /Error|error/.test(l); })[0]); }
            else if (/verdict=FAIL/.test(rl) && hit.length) { killed++; say('§ACCTP-MUTANT ' + m.name + ' KILLED by ' + hit.join(' | ') + ' :: ' + m.what); }
            else { survived.push(m.name); say('§ACCTP-MUTANT ' + m.name + ' SURVIVED verdict=' + (rl.match(/verdict=\w+/) || [''])[0] + ' expected to fail ' + (m.kills || []).join(' | ') + ' failedChecks=' + failedLines.length); }
            try { fs.rmSync(job.dir, { recursive: true, force: true }); } catch (e) {}
            if (next >= jobs.length && running === 0) resolve(); else pump();
          });
        })(jobs[next++]);
        if (!jobs.length) resolve();
      }
      pump();
    });
    var nSel = jobs.length + notApplied.length, mv = !MUTS.length ? 'INCONCLUSIVE' : (killed === nSel && !notApplied.length && !crashed.length && !survived.length) ? 'PASS' : 'FAIL';
    say('§ACCTP-MUTANTS verdict=' + mv + ' total=' + nSel + ' applied=' + applied + ' killed=' + killed + ' notApplied=' + J(notApplied) + ' crashed=' + J(crashed) + ' survived=' + J(survived));
    if (mv !== 'PASS') exitCode = 1;
  }
  process.exit(exitCode);
})().catch(function (e) { say('§ACCTP-RESULT verdict=FAIL harness: ' + (e && e.stack)); process.exit(2); });
