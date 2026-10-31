#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-IMPORT-PAYMENT (bim-compiler prompts/TEAMWORK_FRAMEWORK.md §40 (a) + §41 row B; prompts/POS_PLUGIN_LOCAL_FIRST.md §5/§9; CARDINAL RULE: the twin does what legacy iDempiere does).
//   READ THE LOG after every run: every verdict is a §IPAY line, the exit code is not the evidence. A mutant that CRASHES is NOT a kill: it must print its own FAIL verdict. INCONCLUSIVE when nothing was judged.
// SPEC (the claims, written before the code; legacy file:line in the code comments of the pieces). Legacy: org.adempiere.base.process/src/org/compiere/process/ImportPayment.java (572 lines) = AD_Process 343 Import_Payment.
//   B1  TABLE     I_Payment (AD_Table 597, AccessLevel 2, 74 AD_Column rows) is in the shipped seed WITHOUT its physical table. erp/ad_import_tables.js ensure(db) creates it as an idempotent BOOT OVERLAY next to I_Order (precedent:
//                 W-IMPORT-ORDER B1), its physical columns == the 74 dictionary columns, and the team BASE hash (seed + patches/ad_seed.db.sql + patches/mfg.sql) is byte-identical to origin/main (no hashed file touched).
//   P0  PORT      AD_Process 343 resolves to a ported class org.compiere.process.ImportPayment (erp/processes/ImportPayment.js, wired in idempiere.html + sw.js); the four AD_Process_Para names (AD_Org_ID, C_BankAccount_ID,
//                 DocAction, DeleteOldImported) are exactly the four prepare() :66-73 reads (X of N), and no run prints §PROC-UNKNOWN-PARA.
//   P2  SLIP      ONE I_Payment row (a slip: InvoiceDocumentNo, DocTypeName, ISO_Code, PayAmt, no BP, no bank) -> ONE C_Payment: BP resolved from the invoice (:289-296), invoice from DocumentNo (:270-277), bank account = the process
//                 parameter (:171-180), currency from ISO_Code (:192-199), DocType by name among ARR/APP (:387-393), TrxType S / TenderType K defaults (:369-384), DateAcct = DateTrx (:498), CheckNo/AccountNo digits only
//                 (MPayment.setCheckNo/setAccountNo -> MPaymentValidate.checkNumeric), DocumentNo copied; DocAction CO -> Complete, ONE processIt, the receipt is ALLOCATED to the invoice (MPayment.allocateIt), the row is
//                 I_IsImported=Y / Processed=Y / C_Payment_ID=the payment (:536-540); the whole run is ONE op group of the caller's transaction; the answer logs are "@Errors@" 0 and "@C_Payment_ID@: @Inserted@" 1 (:566-568).
//   P3  RESEND    (a) a plain re-run imports nothing: the Y row is not read again (:451). (b) MEASURED legacy behaviour, not an invented rule: legacy has NO duplicate guard for a slip re-declared as a NEW I_Payment row - no unique
//                 index on C_Payment/I_Payment documentno exists in pg_indexes (ad_ddl_unique holds 449 of them, none for these tables) and neither ImportPayment nor MPayment.beforeSave looks for one - so the re-sent slip becomes
//                 a SECOND C_Payment. The twin must do the same (CARDINAL RULE); "same slip twice = one payment" is therefore NOT a property of Import Payment: it is the I_IsImported flag (same row) and, across devices, Team's
//                 once-only envelope. Printed as §IPAY-EVIDENCE for the lead.
//   P4  INSTALMENTS  Invoice 109 (DocNo 100000, BP JoeBlock, EUR 228.85, payment term 108 "50% Immediate - 50% in 30 days": C_InvoicePaySchedule 114.43 + 114.42): slip 1 = 114.43 (BP from the invoice), slip 2 = 114.42 (BP by
//                 BPartnerValue, :280-287) -> after slip 1 the invoice is NOT paid and its open amount, computed by an independent SQL oracle over C_AllocationLine, is 114.42 (= the second schedule row); after slip 2 it is paid, open 0.
//   P5  ERRORS    each failing row gets legacy's I_ErrorMsg text and ends I_IsImported='N' (the closing reset :561-565 turns E into N, the message stays), no C_Payment is created for it, and a good row in the SAME run is still
//                 imported: Invalid Org (:125-129), Invalid Bank Account (:182-186), No Currency (:209-213), No BPartner (:298-302), Invalid DocTypeName + No DocType (:394-407), No DocType (a row with no DocTypeName: ImportPayment has
//                 NO default doc type step, unlike ImportOrder), No Activity (:419-423), No Charge (:439-443), Payment<->Invoice / Invoice<->BPartner / Invoice.BPartner<->Payment.BPartner (:309-366).
//                 An InvoiceDocumentNo that matches no invoice is NOT an error in legacy (:270-277 sets NULL): with a BPartner the receipt is created without invoice.
//   P6  DOCACTION DocAction is a process parameter (:72-73), NOT given -> legacy m_docAction is null (:52) -> payments are saved and never processed (AD_Process_Para 343/DocAction has no DefaultValue: measured, so no default notice);
//                 an action the engine refuses -> legacy throws IllegalStateException (:547) AFTER the payment and the row were saved (:534-540), the catch (:556) ends the loop: the first row stays Y with a Drafted payment,
//                 the second row is not read (twin decision (b): the unit [setDocAction + processIt + saveEx] runs behind a savepoint, as ImportOrder).
//   P7  BANK      C_BankAccount_ID missing or unknown -> the process fails with "@NotFound@ @C_BankAccount_ID@ - <id>" and touches no row (:88-90); the bank account's org replaces the parameter org when it is not 0 (:91-92);
//                 the bank is looked up by BankAccountNo (+ RoutingNo) of OWN banks (:135-169); the operator-precedence quirk of :145 (`AND b.RoutingNo=i.RoutingNo OR b.SwiftCode=i.RoutingNo`) is ported as written (the subselect returns
//                 many rows -> PostgreSQL fails the statement -> -1 -> the next statement still resolves the account).
//   DEL DeleteOldImported=Y deletes the Y rows of the client (:102-108) and nothing else.
//   UNPORTED  nothing in ImportPayment.java is skipped: the arms above judge every branch the dictionary can reach. Named twin decisions (stated in the port header): parameters that were not sent reach the process as NULL
//                 (AD_Org_ID -> 0 where Java throws NullPointerException; C_BankAccount_ID -> 0 -> the NotFound error); the processIt unit runs behind a savepoint; MBankAccount.get cache not modelled (log only).
// Every check names the issue it proves; INCONCLUSIVE when nothing was judged. Mutants (IPAY_MUTANTS=1): each rewrites the shipped source in a mirror of COPIES, proves the rewrite APPLIED exactly once, and the named check must
//   go FAIL in a child run that prints its verdict (a crash = "not killed").
// Command: node erp/tests/witness_import_payment.js            (add IPAY_MUTANTS=1 for the mutant sweep)
'use strict';
var fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process'), crypto = require('crypto');
if (!global.window) global.window = {};
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
var ERP = process.env.IPAY_ERP || path.join(__dirname, '..');
var MUTANT = process.env.IPAY_MUTANT || '';
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
  say('  §IPAY-CHECK case=' + cs + ' key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' rule="' + rule + '"' + (ok ? '' : ' got=' + JSON.stringify(info)));
}
function verdict(cs) { var c = CASES[cs] || { judged: 0, failed: 0 }; var v = !c.judged ? 'INCONCLUSIVE' : c.failed ? 'FAIL' : 'PASS'; say('§IPAY-' + cs + ' verdict=' + v + ' judged=' + c.judged + ' failed=' + c.failed + (MUTANT ? ' mutant=' + MUTANT : '')); return v; }
function J(x) { return JSON.stringify(x); }
function guard(cs, key, rule, fn) { try { fn(); } catch (e) { check(cs, key, rule, false, 'threw: ' + (e && (e.message || e.stack) || String(e))); } }
function sha256(b) { return crypto.createHash('sha256').update(b).digest('hex'); }
var BASE_PIN = 'a3eef3f59d775cc2adfc320b82c8ec5c8045721d74490c5dfaa421cbf595b8ab';       // team base of origin/main 9d092972 (same pin as W-IMPORT-ORDER); a later INTENDED base change must move this pin on purpose · MOVED ON PURPOSE 2026-10-31: user Search Keys patch (TEAMWORK §48.11d, owner "Patch it"); was d35e8a75…
function baseOracle() {
  var buf = fs.readFileSync(path.join(ERP, 'ad_seed.db')), man = 'seed ' + sha256(buf) + ' ' + buf.length + '\n';
  ['ad_seed.db.sql', 'mfg.sql'].forEach(function (nm, i) { var f = path.join(ERP, 'patches', nm); man += '--patch ' + i + (fs.existsSync(f) ? '\n' + fs.readFileSync(f, 'utf8') : ' MISSING') + '\n'; });
  return sha256(Buffer.from(man, 'utf8'));
}
function reqERP(f) { return require(path.join(ERP, f)); }
function tryReq(f) { try { return { m: reqERP(f) }; } catch (e) { return { m: null, err: e.message }; } }
function read(f) { try { return fs.readFileSync(path.join(ERP, f), 'utf8'); } catch (e) { return ''; } }
function num(x) { return x == null ? null : Number(x); }

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
  say('§IPAY-LOAD erp=' + ERP + ' mutant=' + (MUTANT || 'none') + ' seedPatch ok=' + pOk + ' failed=' + pFail + ' adImportTables=' + (AIT.m ? 'loaded ensure:' + typeof AIT.m.ensure : 'ABSENT (' + AIT.err + ')'));

  // ═══ TABLE (B1) ═══════════════════════════════════════════════════════════════════════════════════════
  var dict = q0("SELECT lower(c.columnname) AS c FROM ad_column c JOIN ad_table t ON t.ad_table_id=c.ad_table_id WHERE lower(t.tablename)='i_payment' AND c.isactive='Y'").map(function (r) { return r.c; }).sort();
  var before = q0("SELECT name FROM sqlite_master WHERE type='table' AND name='i_payment'").length;
  check('TABLE', 'seed-gap', 'the shipped seed + patch has the 74 I_Payment dictionary columns but NO physical i_payment table (the gap B1 closes)', dict.length === 74 && before === 0, { dict: dict.length, physical: before });
  guard('TABLE', 'ensure', 'AdImportTables.ensure(db) creates i_order AND i_payment once (returns 2), the second call creates nothing (0), and the physical i_payment columns equal the 74 dictionary columns', function () {
    if (!AIT.m || typeof AIT.m.ensure !== 'function') { check('TABLE', 'ensure', 'ad_import_tables.js exports ensure(db)', false, AIT.err || 'no ensure'); return; }
    var n1 = AIT.m.ensure(db), n2 = AIT.m.ensure(db);
    var phys = q0("PRAGMA table_info(i_payment)").map(function (r) { return String(r.name).toLowerCase(); }).sort();
    check('TABLE', 'ensure', 'ensure(db) creates the two import tables once (2), then nothing (0); physical i_payment columns == the 74 dictionary columns', n1 === 2 && n2 === 0 && J(phys) === J(dict), { n1: n1, n2: n2, phys: phys.length, onlyPhys: phys.filter(function (c) { return dict.indexOf(c) < 0; }), onlyDict: dict.filter(function (c) { return phys.indexOf(c) < 0; }) });
  });
  var h = baseOracle();
  check('TABLE', 'base-hash', 'the team BASE hash (seed + the two hashed patch files) is byte-identical to origin/main: B1 touched no hashed file (a teams-wide base-mismatch otherwise)', h === BASE_PIN, { got: h, pin: BASE_PIN });
  var hSrc = read('idempiere.html'), swSrc = read('sw.js');
  check('TABLE', 'wiring', 'the port is booted where ImportOrder is: idempiere.html loads processes/ImportPayment.js, sw.js precaches it', /<script src="processes\/ImportPayment\.js\?v=\d+"/.test(hSrc) && /'processes\/ImportPayment\.js'/.test(swSrc), { html: /ImportPayment/.test(hSrc), sw: /ImportPayment/.test(swSrc) });
  if (AR.m) AR.m.ensure(db);
  var K = reqERP('ws_kernel.js'), k = K.build(db), ML = k.ML, AP = reqERP('ad_process.js');
  var S = { clientId: 11, orgId: 11, userId: 100, roleId: 102, warehouseId: 103, actor: 'witness:import-payment' };
  function one(sql, p) { return k.q(sql, p || [])[0] || null; }
  function trxNew() { return new ML.Trx(k.q, k.env(S)); }
  function commit(fn, meta) {                                                // = ws_kernel inTrx: ONE Trx; on ok apply + journal its op group. Mutant children switch automatic accounting off (noPost): posting costs seconds and no claim here depends on it.
    var trx = new ML.Trx(k.q, Object.assign(k.env(S), MUTANT ? { noPost: true } : {})), r;
    try { r = fn(trx, ML) || { ok: true }; } catch (ex) { r = { ok: false, error: 'model threw: ' + (ex && ex.message) }; trx.say('§MODEL-ERR ' + (ex && ex.stack || ex)); }
    var ok = r.ok !== false, ops = ok ? trx.groupOps() : [], ids = []; if (ok && ops.length) ids = k.commit(S, ops, meta);
    return Object.assign({}, r, { ok: ok, ops: ops, ids: ids, log: trx.log, trx: trx });
  }
  function saveAll(rows) { return function (trx) { for (var i = 0; i < rows.length; i++) { var sv = ML.save(trx, rows[i].t, null, ML.newPO(trx, rows[i].t, rows[i].f));
       if (!sv.ok) return { ok: false, error: rows[i].t + ' #' + i + ': ' + sv.error }; } return { ok: true }; }; }

  // ═══ fixtures (all from the seed, GardenWorld client 11) ═══════════════════════════════════════════════
  var INV3 = one("SELECT * FROM c_invoice WHERE c_invoice_id=103"), INV9 = one("SELECT * FROM c_invoice WHERE c_invoice_id=109");
  var SCH9 = k.q('SELECT dueamt FROM c_invoicepayschedule WHERE c_invoice_id=109 ORDER BY duedate').map(function (r) { return Number(r.dueamt); });
  var ARR = one("SELECT c_doctype_id AS d FROM c_doctype WHERE name='AR Receipt' AND docbasetype='ARR' AND ad_client_id=11");
  var BPV = one("SELECT value FROM c_bpartner WHERE c_bpartner_id=118");
  say('§IPAY-FIXTURE invoice103=' + J(INV3 && [INV3.documentno, INV3.c_bpartner_id, INV3.grandtotal, INV3.c_currency_id, INV3.ispaid, INV3.docstatus]) + ' invoice109=' + J(INV9 && [INV9.documentno, INV9.c_bpartner_id, INV9.grandtotal, INV9.c_currency_id, INV9.ispaid, INV9.c_paymentterm_id]) + ' schedule109=' + J(SCH9) + ' ARR=' + J(ARR) + ' bp118=' + J(BPV));
  // independent oracle: the open amount of an invoice = grandtotal - the allocated (amount + discount + writeoff) over allocation lines of COMPLETED headers (C_Invoice_v / invoiceOpen, derived, never copied)
  function openOracle(invId) {
    var inv = one('SELECT grandtotal FROM c_invoice WHERE c_invoice_id=?', [invId]);
    var a = one("SELECT COALESCE(SUM(l.amount + l.discountamt + l.writeoffamt),0) AS s FROM c_allocationline l JOIN c_allocationhdr h ON h.c_allocationhdr_id=l.c_allocationhdr_id WHERE l.c_invoice_id=? AND h.docstatus IN ('CO','CL')", [invId]);
    return Math.round((Number(inv.grandtotal) - Number(a.s)) * 100) / 100;
  }
  var D1 = '2026-10-28 00:00:00', D0 = '2026-10-20 00:00:00';
  function slip(docno, extra) { return { t: 'i_payment', f: Object.assign({ i_isimported: 'N', documentno: docno, doctypename: 'AR Receipt', iso_code: 'USD', payamt: 1, datetrx: D1 }, extra || {}) }; }
  var piPay = 0, piOther = 0, origPI = ML.processIt;
  ML.processIt = function (trx, table) { if (String(table).toLowerCase() === 'c_payment') piPay++; else piOther++; return origPI.apply(this, arguments); };
  var SHIPPED = [], ALLLOG = [];
  function runPay(params, tag) {
    var c0 = piPay, jl0 = k.journal.length;
    var r = commit(function (trx) { var r0 = AP.runInTrx(trx, 343, { params: params || {} }); return { ok: r0.ok, r: r0, error: r0.summary }; }, { ws: 'import_payment', tag: tag || '' });
    (r.log || []).forEach(function (l) { ALLLOG.push(l); if (/^§(IMPORT_PAYMENT|PROC-UNPORTED|PROC-PARAM|PROC-SQL|PROC-UNKNOWN)/.test(l)) SHIPPED.push(l); });
    var logs = (r.r && r.r.logs) || [];
    return { res: r, pi: piPay - c0, journal: k.journal.length - jl0, log: (r.log || []).slice(), summary: r.r && r.r.summary, logs: logs,
             errors: (logs.filter(function (x) { return x.msg === '@Errors@'; })[0] || {}).number, inserted: (logs.filter(function (x) { return x.msg === '@C_Payment_ID@: @Inserted@'; })[0] || {}).number };
  }
  function pays(docno) { return k.q('SELECT * FROM c_payment WHERE documentno=? ORDER BY c_payment_id', [docno]); }
  function irows(docno) { return k.q('SELECT * FROM i_payment WHERE documentno=? ORDER BY i_payment_id', [docno]); }
  function alloc(payId) { return k.q('SELECT l.*, h.docstatus AS hdr_status FROM c_allocationline l JOIN c_allocationhdr h ON h.c_allocationhdr_id=l.c_allocationhdr_id WHERE l.c_payment_id=? ORDER BY l.c_allocationline_id', [payId]); }
  var BASEPARAMS = { C_BankAccount_ID: 100, AD_Org_ID: 11 };
  function P(extra) { return Object.assign({}, BASEPARAMS, extra || {}); }

  // ═══ P0 PORT ═════════════════════════════════════════════════════════════════════════════════════════
  var avail = typeof AP.runInTrx === 'function' && !!AP.JAVA['org.compiere.process.ImportPayment'];
  check('P0', 'registered', 'AD_Process 343 Import_Payment resolves to a ported class (org.compiere.process.ImportPayment registered by erp/processes/ImportPayment.js)', avail && one('SELECT classname FROM ad_process WHERE ad_process_id=343').classname === 'org.compiere.process.ImportPayment', { registered: !!AP.JAVA['org.compiere.process.ImportPayment'] });
  guard('P0', 'params-x-of-n', 'X of N: every AD_Process_Para name of process 343 is one the port\'s prepare() reads (legacy :66-73), and the port reads no other', function () {
    var names = k.q("SELECT columnname AS c FROM ad_process_para WHERE ad_process_id=343 AND isactive='Y' ORDER BY seqno").map(function (r) { return r.c; });
    var src = read('processes/ImportPayment.js'), used = (src.match(/name === '([A-Za-z_]+)'/g) || []).map(function (s) { return /'([^']+)'/.exec(s)[1]; });
    var X = names.filter(function (n) { return used.indexOf(n) >= 0; }).length;
    check('P0', 'params-x-of-n', 'dictionary parameters ' + J(names) + ' all read by the port (X=' + X + ' of N=' + names.length + '), port reads ' + J(used), names.length === 4 && X === 4 && used.length === 4, { names: names, used: used });
  });
  var dfltDA = one("SELECT defaultvalue AS d FROM ad_process_para WHERE ad_process_id=343 AND columnname='DocAction'");
  check('P0', 'docaction-no-default', 'MEASURED: AD_Process_Para 343/DocAction has no DefaultValue, so legacy "not sent" = null = no processing (the twin must not invent a PR/CO default as ImportOrder\'s 206 has)', !!dfltDA && (dfltDA.d == null || dfltDA.d === ''), dfltDA);
  // pre-run measurements
  var nPay0 = one('SELECT count(*) AS n FROM c_payment').n;

  // ═══ P7a BANK PARAMETER (before any row is touched) ═════════════════════════════════════════════════════
  guard('P7', 'no-bank', 'C_BankAccount_ID missing or unknown: the process FAILS with "@NotFound@ @C_BankAccount_ID@ - <id>" (:88-90) and touches no row: the declared row keeps I_IsImported=N and its (empty) I_ErrorMsg, no payment', function () {
    var KN = 'IPAY-NOBANK', d = commit(saveAll([slip(KN, { invoicedocumentno: '200002', payamt: 5 })]));
    var r0 = runPay({}, 'nobank'), r1 = runPay({ C_BankAccount_ID: 999999 }, 'badbank'), row = irows(KN)[0];
    check('P7', 'no-bank', 'both runs report an error naming @NotFound@ @C_BankAccount_ID@ - 0 / - 999999; the row is unchanged (N, no error text, no ids filled), no payment',
      d.ok && !r0.res.ok && /(@NotFound@|Not found).*(@C_BankAccount_ID@|Bank Account) - 0$/.test(String(r0.summary)) && !r1.res.ok && /(@NotFound@|Not found).*(@C_BankAccount_ID@|Bank Account) - 999999$/.test(String(r1.summary)) && !!row && row.i_isimported === 'N' && (row.i_errormsg == null || String(row.i_errormsg).trim() === '') && row.c_bankaccount_id == null && pays(KN).length === 0,
      { d: d.error, s0: r0.summary, s1: r1.summary, row: row && [row.i_isimported, row.i_errormsg, row.c_bankaccount_id] });
    commit(function (trx) { var rw = trx.find('i_payment', { documentno: KN })[0]; if (rw) trx.del('i_payment', rw); return { ok: true }; });     // the fixture row must not ride later runs
  });

  // ═══ P2 SLIP -> RECEIPT ═════════════════════════════════════════════════════════════════════════════════
  var KA = 'IPAY-A1', firstPay = null;
  guard('P2', 'declare', 'a slip is declared as ONE I_Payment row through the ERP write path (ML.save, one op group): invoice DocumentNo only, no BP, no bank account', function () {
    var d = commit(saveAll([slip(KA, { invoicedocumentno: '200002', payamt: 161.12, dateacct: D0, checkno: 'CH-12 34', accountno: 'AC 9-9', a_name: 'Pat Borrower', description: 'slip A1', r_pnref: 'PN-1' })]));
    var pre0 = irows(KA)[0] || {};
    db.run("UPDATE i_payment SET tendertype=NULL, trxtype=NULL WHERE documentno=?", [KA]);                       // fixture: legacy's :369-384 UPDATEs only act on NULL, so make certain the slip carries NULL (committed row set directly)
    var pre1 = irows(KA)[0] || {};
    check('P2', 'null-tender', 'fixture proof: the declared slip row carries TenderType NULL / TrxType NULL (before the explicit reset: ' + J(pre0.tendertype) + ' / ' + J(pre0.trxtype) + '), so P2.defaults really exercises legacy :369-384', pre1.tendertype == null && pre1.trxtype == null, { pre0: [pre0.tendertype, pre0.trxtype], pre1: [pre1.tendertype, pre1.trxtype] });
    check('P2', 'declare', 'one I_Payment row exists, I_IsImported=N, no C_Payment yet; the invoice (DocNo 200002, BP C&W) is Complete and unpaid', d.ok && irows(KA).length === 1 && irows(KA)[0].i_isimported === 'N' && pays(KA).length === 0 && !!INV3 && INV3.docstatus === 'CO' && INV3.ispaid === 'N', { ok: d.ok, err: d.error, inv: INV3 && [INV3.docstatus, INV3.ispaid] });
  });
  guard('P2', 'import', 'Import Payment (C_BankAccount_ID 100, DocAction CO) -> ONE C_Payment with every legacy-resolved field, Complete, allocated to the invoice; row marked imported', function () {
    var r = runPay(P({ DocAction: 'CO' }), 'P2'), ps = pays(KA), p = ps[0] || {}, row = irows(KA)[0] || {}, al = p.c_payment_id ? alloc(p.c_payment_id) : [], inv = one('SELECT * FROM c_invoice WHERE c_invoice_id=103');
    firstPay = Object.assign({}, p); function row0() { return row; }
    check('P2', 'run', 'the process ran ok (no error)', r.res.ok === true, { ok: r.res.ok, err: r.res.error || r.summary });
    check('P2', 'one-payment', 'exactly ONE c_payment carries the slip DocumentNo (payment.setDocumentNo(imp.getDocumentNo()), :474)', ps.length === 1, ps.length);
    check('P2', 'resolved', 'BP 117 from the invoice (:289-296), invoice 103 from InvoiceDocumentNo 200002 (:270-277), bank 100 = the process parameter (:171-180), currency 100 from ISO_Code USD (:192-199), doc type = AR Receipt among ARR/APP (:387-393)',
      num(p.c_bpartner_id) === 117 && num(p.c_invoice_id) === 103 && num(p.c_bankaccount_id) === 100 && num(p.c_currency_id) === 100 && !!ARR && num(p.c_doctype_id) === num(ARR.d), { bp: p.c_bpartner_id, inv: p.c_invoice_id, bank: p.c_bankaccount_id, cur: p.c_currency_id, dt: p.c_doctype_id, arr: ARR });
    check('P2', 'defaults', 'TrxType S and TenderType K defaults (:369-384; payment AND the I_Payment row, which the UPDATE wrote), IsReceipt Y (from the ARR doc type), PayAmt 161.12', p.trxtype === 'S' && p.tendertype === 'K' && row0().tendertype === 'K' && row0().trxtype === 'S' && p.isreceipt === 'Y' && Number(p.payamt) === 161.12, { trx: p.trxtype, tender: p.tendertype, rcpt: p.isreceipt, amt: p.payamt });
    check('P2', 'dates', 'DateTrx = the row\'s DateTrx and DateAcct = imp.getDateTrx() (:498-499) - NOT the row\'s own DateAcct (' + D0 + ')', String(p.datetrx).slice(0, 10) === '2026-10-28' && String(p.dateacct).slice(0, 10) === '2026-10-28', { dt: p.datetrx, da: p.dateacct });
    check('P2', 'copied', 'CheckNo "CH-12 34" -> "1234" and AccountNo "AC 9-9" -> "99" (MPayment.setCheckNo/setAccountNo = MPaymentValidate.checkNumeric: digits only), A_Name, R_PnRef, Description copied (:513-530)', p.checkno === '1234' && p.accountno === '99' && p.a_name === 'Pat Borrower' && p.r_pnref === 'PN-1' && p.description === 'slip A1', { ck: p.checkno, ac: p.accountno, an: p.a_name, pn: p.r_pnref, ds: p.description });
    check('P2', 'complete', 'DocAction CO given -> DocStatus CO, Processed Y', p.docstatus === 'CO' && p.processed === 'Y', { st: p.docstatus, pr: p.processed, msg: (r.log || []).filter(function (l) { return /MODEL-DOC|processIt|Process Failed/i.test(l); }).slice(0, 3) });
    check('P2', 'processIt-once', 'DocumentEngine ran ONCE for the payment (:545)', r.pi === 1, r.pi);
    check('P2', 'allocated', 'the receipt is ALLOCATED to invoice 103: one allocation line (payment, invoice, amount 161.12) under a Complete allocation header; payment IsAllocated=Y; invoice IsPaid=Y; the open amount by independent SQL oracle = 0',
      al.length === 1 && num(al[0].c_invoice_id) === 103 && Number(al[0].amount) === 161.12 && al[0].hdr_status === 'CO' && p.isallocated === 'Y' && inv.ispaid === 'Y' && openOracle(103) === 0, { al: al.map(function (x) { return [x.c_invoice_id, x.amount, x.hdr_status]; }), isalloc: p.isallocated, paid: inv.ispaid, open: openOracle(103) });
    check('P2', 'row-imported', 'the I_Payment row: I_IsImported=Y, Processed=Y, C_Payment_ID = the payment (:536-539), and the resolved ids written back by the SQL phase (bank 100, currency 100, BP 117, invoice 103, doc type) with I_ErrorMsg blank',
      row.i_isimported === 'Y' && row.processed === 'Y' && num(row.c_payment_id) === num(p.c_payment_id) && num(row.c_bankaccount_id) === 100 && num(row.c_currency_id) === 100 && num(row.c_bpartner_id) === 117 && num(row.c_invoice_id) === 103 && !!ARR && num(row.c_doctype_id) === num(ARR.d) && String(row.i_errormsg || '').trim() === '', { row: [row.i_isimported, row.processed, row.c_payment_id, row.c_bankaccount_id, row.c_currency_id, row.c_bpartner_id, row.c_invoice_id, row.c_doctype_id, row.i_errormsg] });
    check('P2', 'one-group', 'the whole import is ONE op group of the caller\'s transaction: ONE journal entry holding c_payment + c_allocationhdr + i_payment writes', r.journal === 1 && ['c_payment', 'c_allocationhdr', 'i_payment'].every(function (t) { return r.res.ops.some(function (op) { return op.table === t; }); }), { journal: r.journal, tables: r.res.ops.map(function (o2) { return o2.table; }).filter(function (t, i, a) { return a.indexOf(t) === i; }) });
    check('P2', 'answer-logs', 'the process answers "@Errors@" = 0 and "@C_Payment_ID@: @Inserted@" = 1 (:566-568)', String(r.errors) === '0' && String(r.inserted) === '1', { errors: r.errors, inserted: r.inserted });
    check('P2', 'log', 'the shipped § log names the run (§IMPORT_PAYMENT summary with the counts)', (r.log || []).some(function (l) { return /^§IMPORT_PAYMENT .*payments=1 errors=0/.test(l); }), (r.log || []).filter(function (l) { return /IMPORT_PAYMENT|PROC-/.test(l); }).slice(0, 6));
  });

  // ═══ P3 RESEND ════════════════════════════════════════════════════════════════════════════════════════
  guard('P3', 'rerun', 'a plain re-run with no new rows imports nothing: the Y row is not read again (:451), no processIt, payment count unchanged', function () {
    var n0 = one('SELECT count(*) AS n FROM c_payment').n, r = runPay(P({ DocAction: 'CO' }), 'P3-rerun');
    check('P3', 'rerun', 'second run: 0 inserted, 0 processIt, payments unchanged, the row stays Y', r.res.ok && String(r.inserted) === '0' && r.pi === 0 && one('SELECT count(*) AS n FROM c_payment').n === n0 && irows(KA)[0].i_isimported === 'Y' && pays(KA).length === 1, { ins: r.inserted, pi: r.pi, n0: n0, row: irows(KA)[0].i_isimported });
  });
  guard('P3', 'resend', 'MEASURED legacy behaviour: the same slip re-declared as a NEW row is NOT deduplicated by Import Payment - no unique index on c_payment/i_payment documentno in pg_indexes (ad_ddl_unique), no guard in ImportPayment/MPayment - so it becomes a SECOND payment (the first is untouched)', function () {
    var idx = k.q("SELECT indexname FROM ad_ddl_unique WHERE tablename IN ('c_payment','i_payment') ORDER BY 1").map(function (r) { return r.indexname; });
    var d = commit(saveAll([slip(KA, { invoicedocumentno: '200002', payamt: 161.12, dateacct: D0, checkno: 'CH-12 34', accountno: 'AC 9-9', a_name: 'Pat Borrower', description: 'slip A1', r_pnref: 'PN-1' })]));
    var r = runPay(P({}), 'P3-resend'), ps = pays(KA), p1 = one('SELECT * FROM c_payment WHERE c_payment_id=?', [firstPay.c_payment_id]);
    var unchanged = p1 && ['docstatus', 'payamt', 'isallocated', 'c_invoice_id', 'c_bpartner_id', 'updated'].every(function (c) { return String(p1[c]) === String(firstPay[c]); });
    check('P3', 'no-legacy-index', 'the legacy unique-index list (pg_indexes mirror) holds NO index on c_payment or i_payment (so none can refuse a re-sent slip); the one-row property is I_IsImported', idx.length === 0, idx);
    check('P3', 'resend-second-payment', 'the re-declared slip is imported as a second C_Payment (Drafted - no DocAction sent) - twin == legacy; the first payment is unchanged (status, amount, allocation flag, Updated stamp)', d.ok && r.res.ok && ps.length === 2 && String(r.inserted) === '1' && unchanged === true && ps.filter(function (x) { return x.docstatus === 'CO'; }).length === 1, { d: d.error, n: ps.length, ins: r.inserted, unchanged: unchanged, st: ps.map(function (x) { return x.docstatus; }) });
    say('  §IPAY-EVIDENCE P3 headers-with-key=' + ps.length + ' statuses=' + J(ps.map(function (x) { return x.docstatus; })) + ' (Import Payment has no duplicate guard of its own; dedup of a re-sent slip is the caller\'s: I_IsImported on the same row, Team\'s once-only envelope across devices)');
  });

  // ═══ P4 INSTALMENTS (Micro Finance: invoice on payment term 108, two slips, open balance derived) ══════════════
  guard('P4', 'instalments', 'invoice 109 on term 108 (schedule ' + J(SCH9) + '): slip 1 = the first instalment -> invoice still open by the second instalment (oracle); slip 2 (BP by Value) -> paid, open 0', function () {
    var ok0 = !!INV9 && INV9.docstatus === 'CO' && INV9.ispaid === 'N' && Number(INV9.c_paymentterm_id) === 108 && SCH9.length === 2 && openOracle(109) === Number(INV9.grandtotal);
    check('P4', 'fixture', 'invoice 109 is Complete, unpaid, on term 108 with two pay-schedule rows, nothing allocated yet (open = grandtotal ' + (INV9 && INV9.grandtotal) + ')', ok0, { inv: INV9 && [INV9.docstatus, INV9.ispaid, INV9.c_paymentterm_id], sch: SCH9, open: INV9 && openOracle(109) });
    var K1 = 'IPAY-B1', K2 = 'IPAY-B2';
    var d1 = commit(saveAll([slip(K1, { iso_code: 'EUR', invoicedocumentno: INV9 && INV9.documentno, payamt: SCH9[0] })])), r1 = runPay(P({ DocAction: 'CO' }), 'P4-1'), p1 = pays(K1)[0] || {}, i1 = one('SELECT * FROM c_invoice WHERE c_invoice_id=109');
    check('P4', 'slip1', 'slip 1 (EUR ' + SCH9[0] + ', BP from the invoice) -> ONE Complete payment allocated 114.43 to invoice 109; invoice NOT paid; derived open = ' + SCH9[1] + ' = the second schedule row',
      d1.ok && r1.res.ok && num(p1.c_bpartner_id) === 118 && num(p1.c_currency_id) === 102 && p1.docstatus === 'CO' && alloc(p1.c_payment_id).length === 1 && Number(alloc(p1.c_payment_id)[0].amount) === SCH9[0] && i1.ispaid === 'N' && openOracle(109) === SCH9[1],
      { d1: d1.error, ok: r1.res.ok, err: r1.res.error || r1.summary, bp: p1.c_bpartner_id, cur: p1.c_currency_id, st: p1.docstatus, al: p1.c_payment_id && alloc(p1.c_payment_id).map(function (x) { return [x.amount, x.hdr_status]; }), paid: i1.ispaid, open: openOracle(109) });
    var d2 = commit(saveAll([slip(K2, { iso_code: 'EUR', invoicedocumentno: INV9 && INV9.documentno, bpartnervalue: BPV && BPV.value, payamt: SCH9[1] })])), r2 = runPay(P({ DocAction: 'CO' }), 'P4-2'), p2 = pays(K2)[0] || {}, i2 = one('SELECT * FROM c_invoice WHERE c_invoice_id=109');
    check('P4', 'slip2', 'slip 2 (BP by BPartnerValue "' + (BPV && BPV.value) + '" :280-287, ' + SCH9[1] + ') -> Complete, allocated, invoice 109 IsPaid=Y, derived open 0; two payments in all for the invoice',
      d2.ok && r2.res.ok && num(p2.c_bpartner_id) === 118 && p2.docstatus === 'CO' && i2.ispaid === 'Y' && openOracle(109) === 0 && k.q('SELECT count(*) AS n FROM c_payment WHERE c_invoice_id=109')[0].n === 2,
      { d2: d2.error, ok: r2.res.ok, err: r2.res.error || r2.summary, bp: p2.c_bpartner_id, st: p2.docstatus, paid: i2.ispaid, open: openOracle(109) });
  });

  // ═══ P7b BANK LOOKUPS + ORG ═════════════════════════════════════════════════════════════════════════════
  guard('P7', 'bank-lookup', 'BankAccountNo 5678 resolves the OWN bank account 101 with (:135-152) and without (:154-169) a RoutingNo; the :145 operator-precedence quirk (`... AND b.RoutingNo=i.RoutingNo OR b.SwiftCode=i.RoutingNo`) fails the statement as PostgreSQL does (many rows) and the next statement still resolves it', function () {
    var KR = 'IPAY-R1', KS = 'IPAY-R2', KQ = 'IPAY-R3';
    var d = commit(saveAll([slip(KR, { bankaccountno: '5678', routingno: '123456789', bpartnervalue: 'C&W', payamt: 2 }), slip(KS, { bankaccountno: '5678', bpartnervalue: 'C&W', payamt: 3 }), slip(KQ, { bankaccountno: '5678', routingno: '12345', bpartnervalue: 'C&W', payamt: 4 })]));
    var r = runPay(P({}), 'P7-bank'), a = pays(KR)[0] || {}, b = pays(KS)[0] || {}, c = pays(KQ)[0] || {};
    check('P7', 'bank-lookup', 'all three slips become payments on bank account 101 (5678): with routing 123456789, without routing, and with RoutingNo = a SwiftCode (the quirk: statement 1 fails with many rows, statement 2 resolves)', d.ok && r.res.ok && num(a.c_bankaccount_id) === 101 && num(b.c_bankaccount_id) === 101 && num(c.c_bankaccount_id) === 101, { d: d.error, ok: r.res.ok, err: r.summary, a: a.c_bankaccount_id, b: b.c_bankaccount_id, c: c.c_bankaccount_id });
    check('P7', 'quirk-logged', 'the failed statement of the quirk is logged §PROC-SQL-ERROR (not silent), exactly like DB.executeUpdate\'s -1', (r.log || []).some(function (l) { return /^§PROC-SQL-ERROR .*ImportPayment .*Bank Account/.test(l); }), (r.log || []).filter(function (l) { return /PROC-SQL/.test(l); }).slice(0, 3));
  });
  guard('P7', 'bank-org', 'the bank account\'s org replaces the parameter org when it is not 0 (:91-92): bank 200000 (org 11) with AD_Org_ID parameter 0 and a row with NO org -> the row and the payment are in org 11', function () {
    var KO = 'IPAY-O1', d = commit(saveAll([slip(KO, { bpartnervalue: 'C&W', payamt: 6 })]));
    db.run("UPDATE i_payment SET ad_org_id=NULL WHERE documentno=?", [KO]);                                   // fixture: a declaration that carries no org (the committed row, set directly in the witness's DB)
    var pre = irows(KO)[0], r = runPay({ C_BankAccount_ID: 200000, AD_Org_ID: 0 }, 'P7-org'), row = irows(KO)[0] || {}, p = pays(KO)[0] || {};
    check('P7', 'bank-org', 'the row had no org before the run; after it the row and the payment carry org 11 (the bank\'s), bank 200000', d.ok && !!pre && pre.ad_org_id == null && r.res.ok && num(row.ad_org_id) === 11 && num(p.ad_org_id) === 11 && num(p.c_bankaccount_id) === 200000, { pre: pre && pre.ad_org_id, rowOrg: row.ad_org_id, payOrg: p.ad_org_id, bank: p.c_bankaccount_id, err: r.summary });
  });

  // ═══ P5 ERRORS ═════════════════════════════════════════════════════════════════════════════════════════
  guard('P5', 'errors', 'every failing row gets legacy\'s I_ErrorMsg text and ends I_IsImported=N, no payment; a good row of the same run is still imported (Drafted: no DocAction)', function () {
    var pa = firstPay.c_payment_id, E = {};
    var rows = [
      ['E-ORG0', { ad_org_id: 0, bpartnervalue: 'C&W' }, 'ERR=Invalid Org, '],
      ['E-ORGSUM', { ad_org_id: 50007, bpartnervalue: 'C&W' }, 'ERR=Invalid Org, '],
      ['E-BANK', { bankaccountno: 'NO-SUCH-ACCOUNT', bpartnervalue: 'C&W' }, 'ERR=Invalid Bank Account, '],
      ['E-CUR', { iso_code: 'ZZZ', bpartnervalue: 'C&W' }, 'ERR=No Currency,'],
      ['E-BP', { }, 'ERR=No BPartner,'],
      ['E-BPUNK', { bpartnervalue: 'NO-SUCH-BP' }, 'ERR=No BPartner,'],
      ['E-DTNAME', { doctypename: 'No Such Type', bpartnervalue: 'C&W' }, 'ERR=Invalid DocTypeName, '],
      ['E-DTNONE', { doctypename: null, bpartnervalue: 'C&W' }, 'ERR=No DocType, '],
      ['E-ACT', { activityvalue: 'NO-SUCH-ACTIVITY', bpartnervalue: 'C&W' }, 'ERR=No Activity,'],
      ['E-CHG', { chargename: 'No Such Charge', bpartnervalue: 'C&W' }, 'ERR=No Charge,'],
      ['E-MISMATCH', { c_payment_id: pa, c_invoice_id: 109, c_bpartner_id: 117 }, 'Err=Invalid Payment<->Invoice, ']
    ];
    var good = slip('E-GOOD', { bpartnervalue: 'C&W', payamt: 7 }), unk = slip('E-UNKINV', { invoicedocumentno: 'NO-SUCH-INVOICE', bpartnervalue: 'C&W', payamt: 8 });
    var d = commit(saveAll(rows.map(function (x) { return slip(x[0], x[1]); }).concat([good, unk])));
    var r = runPay(P({}), 'P5');
    rows.forEach(function (x) { E[x[0]] = irows(x[0])[0] || {}; });
    check('P5', 'declared+ran', 'the 13 rows were declared and the run completed without a process error (row errors are data, not a failure)', d.ok && r.res.ok === true, { d: d.error, ok: r.res.ok, err: r.summary });
    rows.forEach(function (x) {
      var row = E[x[0]];
      check('P5', x[0], 'row ' + x[0] + ': I_ErrorMsg contains "' + x[2] + '", I_IsImported=N after the closing reset (:561-565), C_Payment_ID empty, no payment', !!row.i_payment_id && String(row.i_errormsg || '').indexOf(x[2]) >= 0 && row.i_isimported === 'N' && (x[0] === 'E-MISMATCH' ? num(row.c_payment_id) === num(pa) : row.c_payment_id == null) && pays(x[0]).length === 0, { msg: row.i_errormsg, imp: row.i_isimported, pay: pays(x[0]).length });
    });
    check('P5', 'two-msgs', 'an unknown DocTypeName gets BOTH legacy messages (:394-407): "ERR=Invalid DocTypeName, " and "ERR=No DocType, "', /Invalid DocTypeName, .*ERR=No DocType, /.test(String(E['E-DTNAME'].i_errormsg || '')), E['E-DTNAME'].i_errormsg);
    check('P5', 'mismatch-3', 'the preset payment (invoice 103, BP 117) against invoice 109 (BP 118) raises Payment<->Invoice, Invoice<->BPartner and Invoice.BPartner<->Payment.BPartner (:309-366) and no Payment<->BPartner (117=117)',
      ['Err=Invalid Payment<->Invoice, ', 'Err=Invalid Invoice<->BPartner, ', 'Err=Invalid Invoice.BPartner<->Payment.BPartner, '].every(function (t) { return String(E['E-MISMATCH'].i_errormsg || '').indexOf(t) >= 0; }) && String(E['E-MISMATCH'].i_errormsg || '').indexOf('Payment<->BPartner') < 0, E['E-MISMATCH'].i_errormsg);
    var g = irows('E-GOOD')[0] || {}, gp = pays('E-GOOD')[0] || {};
    check('P5', 'good-not-blocked', 'the good row of the same run is imported: I_IsImported=Y, one Drafted payment (BP C&W, bank 100, USD), processIt never called (DocAction not sent)', g.i_isimported === 'Y' && pays('E-GOOD').length === 1 && gp.docstatus === 'DR' && num(gp.c_bpartner_id) === 117 && num(gp.c_bankaccount_id) === 100 && r.pi === 0, { row: g.i_isimported, n: pays('E-GOOD').length, st: gp.docstatus, pi: r.pi });
    var u = irows('E-UNKINV')[0] || {}, up = pays('E-UNKINV')[0] || {};
    check('P5', 'unknown-invoice-not-an-error', 'an InvoiceDocumentNo matching no invoice is NOT an error in legacy (:270-277 sets NULL): with a BPartner the receipt is created WITHOUT invoice', u.i_isimported === 'Y' && pays('E-UNKINV').length === 1 && up.c_invoice_id == null && num(up.c_bpartner_id) === 117, { imp: u.i_isimported, n: pays('E-UNKINV').length, inv: up.c_invoice_id });
    check('P5', 'counts', '"@Errors@" counts the 11 error rows and "@C_Payment_ID@: @Inserted@" the 2 good ones (:566-568)', String(r.errors) === '11' && String(r.inserted) === '2', { errors: r.errors, inserted: r.inserted });
  });

  // ═══ P6 DOCACTION ═══════════════════════════════════════════════════════════════════════════════════════
  guard('P6', 'not-sent', 'DocAction not sent: payments are saved and never processed (legacy m_docAction null :52/:542), no default notice', function () {
    var K6 = 'IPAY-D1', d = commit(saveAll([slip(K6, { invoicedocumentno: INV3 && INV3.documentno, bpartnervalue: 'C&W', payamt: 9 })])), r = runPay(P({}), 'P6-none'), p = pays(K6)[0] || {};
    check('P6', 'not-sent', 'one Drafted payment, 0 processIt, no §PROC-PARAM DocAction notice', d.ok && r.res.ok && pays(K6).length === 1 && p.docstatus === 'DR' && r.pi === 0 && !(r.log || []).some(function (l) { return /^§PROC-PARAM ImportPayment DocAction/.test(l); }), { st: p.docstatus, pi: r.pi, log: (r.log || []).filter(function (l) { return /PROC-PARAM/.test(l); }) });
    check('P6', 'not-allocated', 'with an invoice on the slip but no DocAction the payment is saved but NOT completed and NOT allocated (no allocation line, IsAllocated=N, Processed=N) - legacy :542 gates processIt (lead finding 1)', p.isallocated === 'N' && p.processed !== 'Y' && alloc(p.c_payment_id).length === 0 && num(p.c_invoice_id) === 103, { alloc: p.isallocated, pr: p.processed, n: p.c_payment_id && alloc(p.c_payment_id).length, inv: p.c_invoice_id });
  });
  guard('P6', 'refused-action', 'an action the engine refuses: the payment and the row are saved BEFORE processIt (:534-540), the failure ends the loop (:556): row 1 = Y with a Drafted payment whose DocAction is still CO (the in-memory setDocAction of :544 was never saved), row 2 is not read (N, no payment)', function () {
    var Z1 = 'IPAY-Z1', Z2 = 'IPAY-Z2', d = commit(saveAll([slip(Z1, { bpartnervalue: 'C&W', payamt: 10, checkno: 'Z1' }), slip(Z2, { bpartnervalue: 'C&W', payamt: 11, checkno: 'Z2' })]));
    var r = runPay(P({ DocAction: 'ZZ' }), 'P6-bad'), a = irows(Z1)[0] || {}, b = irows(Z2)[0] || {}, pz = pays(Z1)[0] || {};
    check('P6', 'refused-action', 'row 1: I_IsImported=Y + a payment that stays DR; row 2: still N with no payment; the exception is logged (§IMPORT_PAYMENT_EXCEPTION), the process itself ends ok', d.ok && r.res.ok && a.i_isimported === 'Y' && pays(Z1).length === 1 && pz.docstatus === 'DR' && pz.docaction === 'CO' && b.i_isimported === 'N' && pays(Z2).length === 0 && (r.log || []).some(function (l) { return /^§IMPORT_PAYMENT_EXCEPTION /.test(l); }),
      { d: d.error, ok: r.res.ok, a: a.i_isimported, pa: pays(Z1).length, st: pz.docstatus, b: b.i_isimported, pb: pays(Z2).length, log: (r.log || []).filter(function (l) { return /IMPORT_PAYMENT/.test(l); }).slice(0, 3) });
  });

  // ═══ DEL ════════════════════════════════════════════════════════════════════════════════════════════════
  guard('DEL', 'delete-old-imported', 'DeleteOldImported=Y deletes the imported (Y) rows of the client (:102-108) and nothing else', function () {
    var yIds = k.q("SELECT i_payment_id AS id FROM i_payment WHERE i_isimported='Y' AND ad_client_id=11").map(function (x) { return x.id; }), y0 = yIds.length, n0 = one("SELECT count(*) AS n FROM i_payment WHERE i_isimported<>'Y'").n, p0 = one('SELECT count(*) AS n FROM c_payment').n;
    var r = runPay(P({ DeleteOldImported: 'Y' }), 'DEL'), y1 = yIds.filter(function (id) { return !!one('SELECT 1 AS x FROM i_payment WHERE i_payment_id=?', [id]); }).length, newly = one("SELECT count(*) AS n FROM i_payment WHERE i_isimported='Y' AND ad_client_id=11").n;
    check('DEL', 'delete-old-imported', 'before: ' + y0 + ' imported rows; after: 0 of them remain (a row this very run imported - the held-over Z2 - is the only Y row left: ' + newly + '); the payments (' + p0 + ') are all still there apart from that new one', r.res.ok && y0 > 3 && y1 === 0 && newly === 1 && one('SELECT count(*) AS n FROM c_payment').n === p0 + 1, { y0: y0, y1: y1, newly: newly, n0: n0, err: r.summary });
  });

  ML.processIt = origPI;
  // ═══ shipped log + verdicts ═══════════════════════════════════════════════════════════════════════════
  check('P0', 'no-unknown-para', 'no run printed §PROC-UNKNOWN-PARA ImportPayment (every parameter sent is one prepare() reads)', ALLLOG.length > 0 && !ALLLOG.some(function (l) { return /^§PROC-UNKNOWN-PARA ImportPayment/.test(l); }), ALLLOG.filter(function (l) { return /UNKNOWN-PARA/.test(l); }).slice(0, 3));
  var kinds = {}; SHIPPED.forEach(function (l) { var kk = l.split(' ')[0]; kinds[kk] = (kinds[kk] || 0) + 1; });
  say('§IPAY-SHIPPED-LOG process lines=' + SHIPPED.length + ' kinds=' + J(kinds));
  ['§PROC-PARAM', '§IMPORT_PAYMENT ', '§IMPORT_PAYMENT_EXCEPTION', '§PROC-SQL-ERROR'].forEach(function (kk) { var l = SHIPPED.filter(function (x) { return x.indexOf(kk) === 0; })[0]; if (l) say('  ' + l.slice(0, 300)); });
  var sqlErr = {}; ALLLOG.forEach(function (l) { var m = /^§PROC-SQL-ERROR executeUpdate -> -1: (.*) :: ImportPayment (.*)$/.exec(l); if (m) sqlErr[m[2] + ' <- ' + m[1].slice(0, 60)] = (sqlErr[m[2] + ' <- ' + m[1].slice(0, 60)] || 0) + 1; });
  say('  §IPAY-EVIDENCE failed-statements (PG would fail them the same way) ' + J(sqlErr));
  var vs = ['TABLE', 'P0', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'DEL'].map(verdict);
  var failedCases = Object.keys(CASES).filter(function (c) { return CASES[c].failed; });
  var all = !ALL.judged ? 'INCONCLUSIVE' : ALL.failed ? 'FAIL' : 'PASS';
  say('§IPAY-RESULT verdict=' + all + ' judged=' + ALL.judged + ' failed=' + ALL.failed + ' failedCases=' + J(failedCases) + (MUTANT ? ' mutant=' + MUTANT : ''));
  var exitCode = all === 'PASS' ? 0 : 1;

  // ═══ mutants (IPAY_MUTANTS=1, parent run only) ═══════════════════════════════════════════════════════
  if (process.env.IPAY_MUTANTS && !MUTANT) {
    var MUTS = [];
    try { MUTS = require('./witness_import_payment_mutants.js'); } catch (e) { say('§IPAY-MUTANT-ERR no mutant table: ' + e.message); }
    var killed = 0, applied = 0, notApplied = [], crashed = [], survived = [], jobs = [];
    MUTS.forEach(function (m) {
      if (process.env.IPAY_ONLY && !new RegExp(process.env.IPAY_ONLY).test(m.name)) return;     // debugging aid: run a subset of the table
      var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ipaymut_'));
      fs.readdirSync(ERP).forEach(function (f) { try { fs.symlinkSync(path.join(ERP, f), path.join(dir, f)); } catch (e) {} });
      // every .js module (and callouts/, processes/) is COPIED, never symlinked: node resolves a symlink to its real path, so a symlinked neighbour would bind to the witness's own instance. Big .db files and patches/ stay symlinks (read-only data).
      fs.readdirSync(ERP).forEach(function (f) { var src = path.join(ERP, f), st = fs.statSync(src);
        if ((st.isFile() && /\.(js|html)$/.test(f)) || (st.isDirectory() && (f === 'callouts' || f === 'processes'))) { try { fs.unlinkSync(path.join(dir, f)); } catch (e) {} fs.cpSync(src, path.join(dir, f), { recursive: true }); } });
      var ok = true;
      m.edits.forEach(function (ed) {
        var src = fs.readFileSync(path.join(dir, ed.file), 'utf8'), want = ed.count || 1, have = src.split(ed.from).length - 1;
        if (have !== want) { ok = false; say('§IPAY-MUTANT-EDIT ' + m.name + ' ' + ed.file + ' found ' + have + ' time(s), expected ' + want); return; }
        fs.writeFileSync(path.join(dir, ed.file), src.split(ed.from).join(ed.to));
      });
      if (!ok) { notApplied.push(m.name); say('§IPAY-MUTANT ' + m.name + ' NOT-APPLIED (source text not found exactly as counted: the mutant proves nothing)'); try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} return; }
      applied++; jobs.push({ m: m, dir: dir });
    });
    await new Promise(function (resolve) {
      var next = 0, running = 0, POOL = Number(process.env.IPAY_JOBS || 4);
      function pump() {
        while (running < POOL && next < jobs.length) (function (job) {
          running++;
          var child = cp.spawn(process.execPath, [__filename], { env: Object.assign({}, process.env, { IPAY_ERP: job.dir, IPAY_MUTANT: job.m.name, IPAY_MUTANTS: '' }) }), out = '', timer = setTimeout(function () { child.kill('SIGKILL'); }, 600000);
          child.stdout.on('data', function (d) { out += d; }); child.stderr.on('data', function (d) { out += d; });
          child.on('close', function (code) {
            clearTimeout(timer); running--;
            var m = job.m, rl = out.split('\n').filter(function (l) { return /^§IPAY-RESULT /.test(l); })[0], failedLines = out.split('\n').filter(function (l) { return /§IPAY-CHECK .* FAIL /.test(l); });
            var named = (m.kills || []).some(function (kk) { return failedLines.some(function (l) { return l.indexOf('case=' + kk.split('.')[0] + ' key=' + kk.split('.')[1] + ' ') >= 0; }); });
            if (!rl) { crashed.push(m.name); say('§IPAY-MUTANT ' + m.name + ' CRASHED (no verdict line; a crash is NOT a kill) exit=' + code + ' ' + out.split('\n').filter(function (l) { return /Error|error/.test(l); })[0]); }
            else if (/verdict=FAIL/.test(rl) && named) { killed++; say('§IPAY-MUTANT ' + m.name + ' KILLED by ' + m.kills.filter(function (kk) { return failedLines.some(function (l) { return l.indexOf('case=' + kk.split('.')[0] + ' key=' + kk.split('.')[1] + ' ') >= 0; }); }).join(' | ') + ' :: ' + m.what); }
            else { survived.push(m.name); say('§IPAY-MUTANT ' + m.name + ' SURVIVED verdict=' + (rl.match(/verdict=\w+/) || [''])[0] + ' expected to fail ' + (m.kills || []).join(' | ') + ' failedChecks=' + failedLines.length); }
            try { fs.rmSync(job.dir, { recursive: true, force: true }); } catch (e) {}
            if (next >= jobs.length && running === 0) resolve(); else pump();
          });
        })(jobs[next++]);
        if (!jobs.length) resolve();
      }
      pump();
    });
    var nSel = jobs.length + notApplied.length, mv = !MUTS.length ? 'INCONCLUSIVE' : (killed === nSel && !notApplied.length && !crashed.length && !survived.length) ? 'PASS' : 'FAIL';
    say('§IPAY-MUTANTS verdict=' + mv + ' total=' + nSel + ' applied=' + applied + ' killed=' + killed + ' notApplied=' + J(notApplied) + ' crashed=' + J(crashed) + ' survived=' + J(survived));
    if (mv !== 'PASS') exitCode = 1;
  }
  process.exit(exitCode);
})().catch(function (e) { say('§IPAY-RESULT verdict=FAIL harness: ' + (e && e.stack)); process.exit(2); });
