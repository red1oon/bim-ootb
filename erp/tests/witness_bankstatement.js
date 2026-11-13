#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-BANKSTATEMENT (bim-compiler prompts/MIGRATE_INSTALL_TENANT.md §E3D-SPEC Lane BS; TWIN CARDINAL RULE: the twin does what legacy iDempiere does). READ THE LOG after every run: every verdict is a §BST line, the exit code is not evidence.
// Legacy: org.adempiere.base/src/org/compiere/model/MBankStatement.java (prepareIt :321-364, completeIt :394-466, voidIt :505-600, closeIt :606-622, reverse* :628-664, reActivateIt :670-723) and MBankStatementLine.java
//   (beforeSave :166-260, afterSave/afterDelete -> updateHeader :262-287). The twin: erp/model_bankstatement.js (new: before it ML.processIt answered "no DocAction class registered for c_bankstatement", measured 2026-11-10)
//   + the posting that already existed (model_post.js Doc_BankStatement). Expected values come from the Java rule named at each check or from an independent SQL oracle over the tables, never from the port's output.
// SPEC (claims written before the code; each check below names the issue it proves):
//   P0       the DocAction class is registered for c_bankstatement; idempiere.html loads and sw.js precaches model_bankstatement.js; ws_kernel.js boots it (a headless host can Complete a statement).
//   CHARGE   the cut-over "opening bank statement": ONE line on a CHARGE (no payment), +1000.00. Complete -> DocStatus CO, Processed Y, Posted Y, Fact_Acct balanced (DR == CR == 1000.00, SQL oracle over fact_acct ad_table_id 392),
//            the bank account's asset account (C_BankAccount_Acct.B_Asset_Acct -> C_ValidCombination.Account_ID) debited 1000.00 and the charge's account (C_Charge_Acct) credited 1000.00; C_BankAccount.CurrentBalance
//            moved by exactly the StatementDifference (completeIt :449-453); IsApproved Y (:414-415), DocAction CL (:464); a second Complete does not post again (engine runs the DocAction Close, facts and balance unchanged).
//   PAYMENT  a line on an existing completed UNreconciled payment: Complete marks the payment IsReconciled=Y (:423-432) and books asset +98.50 / in-transit -98.50 (Doc_BankStatement); a line on an already reconciled payment
//            is refused with "Payment is already Reconciled MPayment[..." and status IN, the balance unmoved (:426-429).
//   PERIOD   the period closed for CMB -> Complete throws "@PeriodClosed@ @Date@=<ts>, @DocBaseType@=Bank Statement" (MPeriod.testPeriodOpen :917-923 via prepareIt :330): through the AutoPeriodControl window AND through C_PeriodControl;
//            the Trx is rolled back = status DR, nothing posted, balance unmoved.
//   PREPARE  no lines -> "@NoLines@" and status IN (:331-336); a stale header StatementDifference is recomputed from the lines (:338-353); DocAction CO after prepare (:361-362).
//   TOTALS   beforeSave :264-271 (BeginningBalance = the bank account's CurrentBalance when 0 and not processed; EndingBalance = Beginning + Difference; C_DocType_ID defaults to the CMB doctype); line add / change / delete / deactivate
//            keeps StatementDifference = SUM(StmtAmt of active lines) and EndingBalance (MBankStatementLine.afterSave/afterDelete -> updateHeader :262-287); line beforeSave: numbering MAX+10 (:210-214), charge required when
//            StmtAmt-TrxAmt-InterestAmt != 0 (:198-202), ParentComplete on a new line of a processed statement (:168-171).
//   VOID     voidIt on a Drafted statement (:505-600): lines zeroed with the legacy description "** Voided (Statement amount=.., Charge amount=..)", payment un-reconciled and detached, header Difference 0 + description "** Voided",
//            status VO, Processed Y, DocAction --, bank balance untouched; on a Completed statement: facts deleted, bank balance restored (:537-545), payment un-reconciled; the refusal "Document Closed: <status>" (:514-521).
//   CLOSE    closeIt: DocAction -- and status CL (:606-622).  REVERSE  reverseCorrectIt / reverseAccrualIt fire the validators and answer false (:628-664): nothing changes.
//   REACT    reActivateIt on a Completed statement (:670-723): facts gone, Posted N, lines Processed N, payment un-reconciled, balance restored, status IP, DocAction CO, Processed N; Complete again posts ONCE.
//   MUTANTS  BST_MUTANTS=1: each mutant breaks ONE ported rule in a mirror dir; every one must make a named check FAIL; survivors are listed.
// Every check names the issue it proves; INCONCLUSIVE when nothing was judged. Command: node erp/tests/witness_bankstatement.js 2>&1 | tee /tmp/count_logs/bs_witness.log   (BST_MUTANTS=1 for the mutant sweep)
'use strict';
var fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
if (!global.window) global.window = {};
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
var ERP = process.env.BST_ERP || path.join(__dirname, '..'), SQLJS_DIR = process.env.SQLJS_DIR || '/home/red1/bim-ootb/tests/node_modules/sql.js', MUTANT = process.env.BST_MUTANT || '';
if (!process.env.SQLJS) process.env.SQLJS = SQLJS_DIR;
var initSqlJs = require(SQLJS_DIR), _log = console.log, SEEN = [];
console.log = function () { SEEN.push(Array.prototype.join.call(arguments, ' ')); };
function say(s) { _log(s); }
var CASES = {}, ALL = { judged: 0, failed: 0 };
function check(cs, key, rule, ok, info) { var c = CASES[cs] = CASES[cs] || { judged: 0, failed: 0 }; c.judged++; ALL.judged++; if (!ok) { c.failed++; ALL.failed++; } say('  §BST-CHECK case=' + cs + ' key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' rule="' + rule + '"' + (ok ? '' : ' got=' + JSON.stringify(info))); }
function verdict(cs) { var c = CASES[cs] || { judged: 0, failed: 0 }; say('§BST-' + cs + ' verdict=' + (!c.judged ? 'INCONCLUSIVE' : c.failed ? 'FAIL' : 'PASS') + ' judged=' + c.judged + ' failed=' + c.failed + (MUTANT ? ' mutant=' + MUTANT : '')); }
function guard(cs, key, rule, fn) { try { fn(); } catch (e) { check(cs, key, rule, false, 'threw: ' + (e && (e.stack || e.message) || String(e))); } }
var J = JSON.stringify, cents = function (v) { return Math.round(Number(v || 0) * 100); };
(async function main() {
  var SQL = await initSqlJs({ locateFile: function (f) { return path.join(SQLJS_DIR, 'dist', f); } });
  var db = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(ERP, 'ad_seed.db'))));
  fs.readFileSync(path.join(ERP, 'patches/ad_seed.db.sql'), 'utf8').split(/;\s*\n/).forEach(function (st) { st = st.replace(/^\s*--[^\n]*\n?/gm, '').trim(); if (!st) return; try { db.run(st); } catch (e) { /* patch statement */ } });
  var AR = require(path.join(ERP, 'ad_rule.js')); AR.ensure(db);
  var K = require(path.join(ERP, 'ws_kernel.js')), k = K.build(db), ML = k.ML;
  say('§BST-LOAD erp=' + ERP + ' mutant=' + (MUTANT || 'none'));
  var S = { clientId: 11, orgId: 11, userId: 100, roleId: 102, warehouseId: 103, actor: 'witness:bankstatement' }, T1 = '2006-11-15 00:00:00', BA = 100;
  function one(sql, p) { return k.q(sql, p || [])[0] || null; }
  function commit(fn, meta) { var trx = new ML.Trx(k.q, Object.assign(k.env(S), { date: T1 })), r; try { r = fn(trx, ML) || { ok: true }; } catch (ex) { r = { ok: false, error: 'model threw: ' + (ex && ex.message) }; trx.say('§MODEL-ERR ' + (ex && ex.stack || ex)); } var ok = r.ok !== false, ops = ok ? trx.groupOps() : [], ids = []; if (ok && ops.length) ids = k.commit(S, ops, meta); return Object.assign({}, r, { ok: ok, ops: ops, ids: ids, log: trx.log }); }
  // a document action: ALWAYS committed unless the model threw (a thrown PeriodClosedException rolls the Trx back; a refused action 'IN' keeps the status it set)
  function doc(table, id, action) { return commit(function (trx) { var r0 = ML.processIt(trx, table, id, action); return { ok: true, r: r0, status: r0.status, accepted: r0.ok, msg: r0.msg }; }, { ws: 'bst_doc', tag: table + id + action }); }
  function cls(method, id) { return commit(function (trx) { var impl = ML.docActionFor('c_bankstatement'), res = impl[method](trx, trx.get('c_bankstatement', id)); return { ok: true, res: res, msg: trx._msg }; }, { ws: 'bst_cls', tag: method + id }); }   // call the DocAction class method directly (what the engine would refuse before reaching it)
  function save(table, row, ch) { var out = null; var r = commit(function (trx) { var sv = ML.save(trx, table, row ? trx.get(table, row) : null, row ? ch : ML.newPO(trx, table, ch)); out = sv; return { ok: sv.ok, error: sv.error }; }, { ws: 'bst_save', tag: table }); var cr = (r.ops || []).filter(function (o) { return o.op_type === 'CRUD_CREATE' && o.table === table; })[0]; return { ok: r.ok, error: r.error, id: cr ? cr.fields[table + '_id'] : (row || null) }; }   // the real key: the applied CREATE op carries it
  function remove(table, id) { return commit(function (trx) { var rm = ML.remove(trx, table, trx.get(table, id)); return { ok: rm.ok, error: rm.error }; }, { ws: 'bst_del', tag: table }); }
  function raw(sql, p) { db.run(sql, p || []); }
  var mkStmt = function (extra) { return save('c_bankstatement', null, Object.assign({ ad_client_id: 11, ad_org_id: 11, c_bankaccount_id: BA, name: 'BST', statementdate: T1, dateacct: T1 }, extra || {})); };
  // C_BankStatementLine.C_Currency_ID is NOT NULL in the legacy database and MBankStatementLine does not fill it: the window's default is the bank account's currency (CAPEX_DASHBOARD.md §5.73)
  var stmtCur = function (stmt) { var r = k.q('SELECT ba.c_currency_id AS c FROM c_bankstatement s JOIN c_bankaccount ba ON ba.c_bankaccount_id=s.c_bankaccount_id WHERE s.c_bankstatement_id=?', [stmt])[0]; return r ? r.c : null; };
  var mkLine = function (stmt, extra) { return save('c_bankstatementline', null, Object.assign({ ad_client_id: 11, ad_org_id: 11, c_bankstatement_id: stmt, statementlinedate: T1, valutadate: T1, dateacct: T1, c_currency_id: stmtCur(stmt) }, extra || {})); };
  var st = function (id) { return one('SELECT * FROM c_bankstatement WHERE c_bankstatement_id=?', [id]); };
  var lns = function (id) { return k.q('SELECT * FROM c_bankstatementline WHERE c_bankstatement_id=? ORDER BY line, c_bankstatementline_id', [id]); };
  var bal = function () { return Number(one('SELECT currentbalance AS b FROM c_bankaccount WHERE c_bankaccount_id=?', [BA]).b); };
  var facts = function (id) { return k.q('SELECT account_id, SUM(amtacctdr) AS dr, SUM(amtacctcr) AS cr, COUNT(*) AS n FROM fact_acct WHERE ad_table_id=392 AND record_id=? AND c_acctschema_id=101 GROUP BY account_id ORDER BY account_id', [id]); };   // the primary schema 101 (client 11 also has schema 200000 in another currency: balanced per schema below)
  var schemaBal = function (id) { return k.q('SELECT c_acctschema_id AS s, SUM(amtacctdr) AS dr, SUM(amtacctcr) AS cr FROM fact_acct WHERE ad_table_id=392 AND record_id=? GROUP BY c_acctschema_id', [id]); };
  var nfacts = function (id) { return Number(one('SELECT COUNT(*) AS n FROM fact_acct WHERE ad_table_id=392 AND record_id=?', [id]).n); };
  var pay = function (id) { return one('SELECT * FROM c_payment WHERE c_payment_id=?', [id]); };
  // independent SQL oracle: account ids from the accounting tables (schema 101)
  var acctOf = function (tbl, col, key, id) { var r = one('SELECT vc.account_id AS a FROM ' + tbl + ' x JOIN c_validcombination vc ON vc.c_validcombination_id=x.' + col + ' WHERE x.' + key + '=? AND x.c_acctschema_id=101', [id]); return r ? Number(r.a) : null; };
  var ASSET = acctOf('c_bankaccount_acct', 'b_asset_acct', 'c_bankaccount_id', BA), TRANSIT = acctOf('c_bankaccount_acct', 'b_intransit_acct', 'c_bankaccount_id', BA), CHARGE = 100, CHACCT = acctOf('c_charge_acct', 'ch_expense_acct', 'c_charge_id', CHARGE);
  say('§BST-FIXTURE bankaccount=' + BA + ' assetAcct=' + ASSET + ' inTransitAcct=' + TRANSIT + ' charge=' + CHARGE + ' chargeAcct=' + CHACCT + ' bal0=' + bal() + ' doctypeCMB=' + J(one("SELECT c_doctype_id AS d FROM c_doctype WHERE ad_client_id=11 AND docbasetype='CMB'")));
  // an unreconciled COMPLETED payment (fixture row cloned from the seed's payment 100, the one the seed's statement 100 reconciles)
  var nextPay = 9100;
  function mkPayment(amt) { var r = Object.assign({}, one('SELECT * FROM c_payment WHERE c_payment_id=100')); r.c_payment_id = nextPay++; r.documentno = 'BSTPAY-' + r.c_payment_id; r.isreconciled = 'N'; r.payamt = amt; r.posted = 'N'; if ('c_payment_uu' in r) r.c_payment_uu = 'bst-' + r.c_payment_id; var ks = Object.keys(r); raw('INSERT INTO c_payment (' + ks.join(',') + ') VALUES (' + ks.map(function () { return '?'; }).join(',') + ')', ks.map(function (x) { return r[x]; })); return r.c_payment_id; }

  // ═══ P0 ═══
  var html = fs.readFileSync(path.join(ERP, 'idempiere.html'), 'utf8'), sw = fs.readFileSync(path.join(ERP, 'sw.js'), 'utf8'), wk = fs.readFileSync(path.join(ERP, 'ws_kernel.js'), 'utf8');
  check('P0', 'registered', 'a DocAction class is registered for c_bankstatement (before it: "no DocAction class registered for c_bankstatement", measured)', !!ML.docActionFor('c_bankstatement'), {});
  check('P0', 'html-sw-kernel', 'idempiere.html loads, sw.js precaches and ws_kernel.js boots model_bankstatement.js', /model_bankstatement\.js/.test(html) && /model_bankstatement\.js/.test(sw) && /'model_bankstatement'/.test(wk), {});
  check('P0', 'acct-oracle', 'fixture: the SQL oracle resolved the bank asset account, the in-transit account and the charge account', ASSET > 0 && TRANSIT > 0 && CHACCT > 0 && ASSET !== TRANSIT, { ASSET: ASSET, TRANSIT: TRANSIT, CHACCT: CHACCT });
  verdict('P0');

  // ═══ PREPARE ═══
  guard('PREPARE', 'nolines', 'a statement with NO lines: Complete is refused "@NoLines@", status IN, no facts, balance unmoved (:331-336)', function () {
    var b0 = bal(), s = mkStmt({ name: 'BST-NOLINES' }).id, d = doc('c_bankstatement', s, 'CO'), x = st(s);
    check('PREPARE', 'nolines', 'Complete of an empty statement answers @NoLines@ with status IN (not CO)', d.accepted === false && d.status === 'IN' && x.docstatus === 'IN' && d.msg === '@NoLines@' && nfacts(s) === 0 && bal() === b0, { status: d.status, msg: d.msg, facts: nfacts(s), bal: [b0, bal()] });
  });
  guard('PREPARE', 'recompute', 'prepareIt recomputes StatementDifference / EndingBalance from the lines (:338-353) and sets DocAction CO (:361-362)', function () {
    var s = mkStmt({ name: 'BST-RECOMP' }).id; mkLine(s, { c_charge_id: CHARGE, stmtamt: 70 }); raw('UPDATE c_bankstatement SET statementdifference=5, endingbalance=5, docaction=? WHERE c_bankstatement_id=?', ['PR', s]);
    var d = doc('c_bankstatement', s, 'PR'), x = st(s);
    check('PREPARE', 'recompute', 'after Prepare the tampered header Difference 5 is the line sum 70.00 and EndingBalance = Beginning + 70; status IP, DocAction CO', d.status === 'IP' && Number(x.statementdifference) === 70 && cents(x.endingbalance) === cents(Number(x.beginningbalance) + 70) && x.docaction === 'CO', { status: d.status, diff: x.statementdifference, end: x.endingbalance, beg: x.beginningbalance, da: x.docaction });
  });
  verdict('PREPARE');

  // ═══ TOTALS ═══
  guard('TOTALS', 'header-line', 'beforeSave / afterSave / afterDelete keep StatementDifference and EndingBalance', function () {
    var b0 = bal(), r = mkStmt({ name: 'BST-TOTALS' }), s = r.id, x = st(s);
    check('TOTALS', 'beginning', 'a new statement (Beginning 0, not processed) takes the bank account CurrentBalance as BeginningBalance and the CMB doctype (:260-269); Ending = Beginning + Difference (:271)', r.ok && cents(x.beginningbalance) === cents(b0) && Number(x.c_doctype_id) === Number(one("SELECT c_doctype_id AS d FROM c_doctype WHERE ad_client_id=11 AND docbasetype='CMB' ORDER BY isdefault DESC, c_doctype_id").d) && cents(x.endingbalance) === cents(b0), { r: r.error, beg: x.beginningbalance, b0: b0, dt: x.c_doctype_id, end: x.endingbalance });
    var refuse = mkLine(s, { stmtamt: 100 });
    check('TOTALS', 'charge-required', 'a line with StmtAmt 100 and no payment/charge is refused (FillMandatory C_Charge_ID, :198-202) and the header is untouched', !refuse.ok && /FillMandatory/.test(refuse.error || '') && cents(st(s).statementdifference) === 0, { ok: refuse.ok, err: refuse.error });
    var a = mkLine(s, { c_charge_id: CHARGE, stmtamt: 100 }), bl = mkLine(s, { c_charge_id: CHARGE, stmtamt: 40 }), ls = lns(s);
    x = st(s);
    check('TOTALS', 'numbering', 'lines get Line 10 and 20 (MAX(Line)+10, :210-214); the charge amount is StmtAmt - TrxAmt - InterestAmt (:192-196)', ls.length === 2 && Number(ls[0].line) === 10 && Number(ls[1].line) === 20 && cents(ls[0].chargeamt) === 10000 && cents(ls[1].chargeamt) === 4000, { lines: ls.map(function (l) { return [l.line, l.chargeamt]; }) });
    check('TOTALS', 'add', 'after two lines (100 + 40): Difference 140.00, Ending = Beginning + 140', cents(x.statementdifference) === 14000 && cents(x.endingbalance) === cents(Number(x.beginningbalance) + 140), { diff: x.statementdifference, end: x.endingbalance });
    save('c_bankstatementline', a.id, { stmtamt: 70 }); x = st(s);
    check('TOTALS', 'change', 'changing line 10 from 100 to 70 -> Difference 110.00 (afterSave -> updateHeader)', cents(x.statementdifference) === 11000 && cents(x.endingbalance) === cents(Number(x.beginningbalance) + 110), { diff: x.statementdifference });
    save('c_bankstatementline', bl.id, { isactive: 'N' }); x = st(s);
    check('TOTALS', 'deactivate', 'deactivating line 20 (40) -> Difference 70.00 (the SUM is over IsActive=Y lines only)', cents(x.statementdifference) === 7000, { diff: x.statementdifference });
    save('c_bankstatementline', bl.id, { isactive: 'Y' }); x = st(s);
    check('TOTALS', 'reactivate', 'reactivating line 20 -> Difference 110.00 again', cents(x.statementdifference) === 11000, { diff: x.statementdifference });
    var rm = remove('c_bankstatementline', bl.id); x = st(s);
    check('TOTALS', 'delete', 'deleting line 20 -> Difference 70.00 (afterDelete -> updateHeader); one line left', rm.ok && cents(x.statementdifference) === 7000 && lns(s).length === 1 && cents(x.endingbalance) === cents(Number(x.beginningbalance) + 70), { rm: rm.error, diff: x.statementdifference, n: lns(s).length });
    var oracle = Number(one("SELECT COALESCE(SUM(stmtamt),0) AS s FROM c_bankstatementline WHERE c_bankstatement_id=? AND isactive='Y'", [s]).s);
    check('TOTALS', 'oracle', 'independent SQL oracle: SUM(StmtAmt of active lines) == the header Difference', cents(oracle) === cents(st(s).statementdifference), { oracle: oracle, hdr: st(s).statementdifference });
    doc('c_bankstatement', s, 'CO');
    var late = mkLine(s, { c_charge_id: CHARGE, stmtamt: 5 });
    check('TOTALS', 'parent-complete', 'a NEW line on a Completed (processed) statement is refused: ParentComplete (:168-171)', !late.ok && /ParentComplete/.test(late.error || ''), { ok: late.ok, err: late.error });
  });
  verdict('TOTALS');

  // ═══ CHARGE ═══
  var CS = null;
  guard('CHARGE', 'complete', 'the opening bank statement: one charge line +1000.00, Complete', function () {
    var b0 = bal(), s = mkStmt({ name: 'BST-OPENING' }).id; mkLine(s, { c_charge_id: CHARGE, stmtamt: 1000, description: 'opening balance' });
    var d = doc('c_bankstatement', s, 'CO'), x = st(s), f = facts(s), tdr = f.reduce(function (a, r) { return a + Number(r.dr); }, 0), tcr = f.reduce(function (a, r) { return a + Number(r.cr); }, 0), by = {}; f.forEach(function (r) { by[r.account_id] = r; });
    CS = s;
    check('CHARGE', 'status', 'Complete answered ok: DocStatus CO, Processed Y, Posted Y (the document engine posts after CO), IsApproved Y, DocAction CL, lines Processed Y', d.accepted && x.docstatus === 'CO' && x.processed === 'Y' && x.posted === 'Y' && x.isapproved === 'Y' && x.docaction === 'CL' && lns(s).every(function (l) { return l.processed === 'Y'; }), { d: d.msg || d.error, st: [x.docstatus, x.processed, x.posted, x.isapproved, x.docaction] });
    check('CHARGE', 'fact-balanced', 'Fact_Acct of the statement: DR total == CR total == 1000.00 (independent SQL oracle on fact_acct, ad_table_id 392)', f.length === 2 && cents(tdr) === 100000 && cents(tcr) === 100000, { f: f });
    check('CHARGE', 'fact-accounts', 'the bank asset account (' + ASSET + ') is DEBITED 1000.00 and the charge account (' + CHACCT + ') CREDITED 1000.00 - the line has no payment, so no in-transit leg', !!by[ASSET] && cents(by[ASSET].dr) === 100000 && cents(by[ASSET].cr) === 0 && !!by[CHACCT] && cents(by[CHACCT].cr) === 100000 && cents(by[CHACCT].dr) === 0 && !by[TRANSIT], { by: by });
    var sb = schemaBal(s);
    check('CHARGE', 'per-schema-balanced', 'every accounting schema the client posts to (' + sb.map(function (r) { return r.s; }).join(',') + ') is balanced on its own (DR == CR per schema)', sb.length >= 1 && sb.every(function (r) { return cents(r.dr) === cents(r.cr) && cents(r.dr) > 0; }), { sb: sb });
    check('CHARGE', 'balance', 'C_BankAccount.CurrentBalance moved by exactly the StatementDifference 1000.00 (completeIt :449-453)', cents(bal()) === cents(b0 + 1000), { b0: b0, b1: bal() });
    check('CHARGE', 'header', 'header: Difference 1000.00, Ending = Beginning + 1000.00', cents(x.statementdifference) === 100000 && cents(x.endingbalance) === cents(Number(x.beginningbalance) + 1000), { diff: x.statementdifference, end: x.endingbalance, beg: x.beginningbalance });
    var b1 = bal(), n1 = nfacts(s), d2 = doc('c_bankstatement', s, 'CO'), x2 = st(s);
    check('CHARGE', 'no-double-post', 'a second Complete does not post again: Fact_Acct rows unchanged (' + n1 + '), CurrentBalance unchanged (the engine runs the document DocAction Close on a Completed statement, DocumentEngine.java:259-261)', nfacts(s) === n1 && bal() === b1 && x2.docstatus === 'CL', { n: [n1, nfacts(s)], bal: [b1, bal()], status: x2.docstatus, again: d2.msg });
  });
  verdict('CHARGE');

  // ═══ PAYMENT ═══
  guard('PAYMENT', 'reconcile', 'a line on an existing completed unreconciled payment (98.50 receipt)', function () {
    var p = mkPayment(98.5), b0 = bal(), s = mkStmt({ name: 'BST-PAY' }).id, ln = mkLine(s, { c_payment_id: p, trxamt: 98.5, stmtamt: 98.5 });
    var l = lns(s)[0] || {};
    check('PAYMENT', 'line', 'the line takes its business partner from the payment (:216-223) and has no charge (Charge = Stmt - Trx - Interest = 0)', ln.ok && Number(l.c_bpartner_id) === Number(pay(p).c_bpartner_id) && cents(l.chargeamt) === 0, { err: ln.error, bp: l.c_bpartner_id, charge: l.chargeamt });
    var d = doc('c_bankstatement', s, 'CO'), x = st(s), f = facts(s), by = {}; f.forEach(function (r) { by[r.account_id] = r; });
    check('PAYMENT', 'complete', 'Complete -> CO, Posted Y, the payment IsReconciled=Y (:423-432), balance +98.50', d.accepted && x.docstatus === 'CO' && x.posted === 'Y' && pay(p).isreconciled === 'Y' && cents(bal()) === cents(b0 + 98.5), { d: d.msg || d.error, st: [x.docstatus, x.posted], rec: pay(p).isreconciled, bal: [b0, bal()] });
    check('PAYMENT', 'facts', 'Doc_BankStatement books bank asset ' + ASSET + ' DR 98.50 and in-transit ' + TRANSIT + ' CR 98.50 (DR == CR)', f.length === 2 && !!by[ASSET] && cents(by[ASSET].dr) === 9850 && !!by[TRANSIT] && cents(by[TRANSIT].cr) === 9850 && cents(f.reduce(function (a, r) { return a + Number(r.dr) - Number(r.cr); }, 0)) === 0, { f: f });
  });
  guard('PAYMENT', 'already-reconciled', 'a line on an already reconciled payment is refused', function () {
    var p = mkPayment(20); raw("UPDATE c_payment SET isreconciled='Y' WHERE c_payment_id=?", [p]);
    var b0 = bal(), s = mkStmt({ name: 'BST-PAYREC' }).id; mkLine(s, { c_payment_id: p, trxamt: 20, stmtamt: 20 });
    var d = doc('c_bankstatement', s, 'CO'), x = st(s);
    check('PAYMENT', 'already-reconciled', 'Complete is refused: "Payment is already Reconciled MPayment[<id>-<no>,Receipt=true,PayAmt=20,..." (:426-429, MPayment.toString :2960), status IN, no facts, balance unmoved', d.accepted === false && x.docstatus === 'IN' && /^Payment is already Reconciled MPayment\[\d+-BSTPAY-\d+,Receipt=true,PayAmt=20/.test(d.msg || '') && nfacts(s) === 0 && bal() === b0, { msg: d.msg, st: x.docstatus, facts: nfacts(s) });
  });
  verdict('PAYMENT');

  // ═══ PERIOD ═══
  guard('PERIOD', 'auto', 'AutoPeriodControl window: a DateAcct beyond the open window (env date 2006-11-15, 100 days ahead) -> Complete throws PeriodClosed', function () {
    var b0 = bal(), s = mkStmt({ name: 'BST-PER1', dateacct: '2007-06-15 00:00:00', statementdate: '2007-06-15 00:00:00' }).id; mkLine(s, { c_charge_id: CHARGE, stmtamt: 11, dateacct: '2007-06-15 00:00:00', statementlinedate: '2007-06-15 00:00:00' });
    var d = doc('c_bankstatement', s, 'CO'), x = st(s);
    check('PERIOD', 'auto', 'refused with "@PeriodClosed@ @Date@=2007-06-15 00:00:00.0, @DocBaseType@=Bank Statement"; Trx rolled back: status DR, Posted N, no facts, balance unmoved', d.ok === false && /@PeriodClosed@ @Date@=2007-06-15 00:00:00\.0, @DocBaseType@=Bank Statement$/.test(d.error || '') && x.docstatus === 'DR' && x.posted === 'N' && nfacts(s) === 0 && bal() === b0, { err: d.error, st: x.docstatus, facts: nfacts(s) });
  });
  guard('PERIOD', 'control', 'C_PeriodControl: AutoPeriodControl off, the period closed for CMB (Jan-01) -> Complete throws PeriodClosed', function () {
    raw("UPDATE c_acctschema SET autoperiodcontrol='N' WHERE ad_client_id=11");
    try {
      var per = one("SELECT pc.periodstatus AS s FROM c_period p JOIN c_periodcontrol pc ON pc.c_period_id=p.c_period_id WHERE pc.docbasetype='CMB' AND date(p.startdate)='2001-01-01' AND p.ad_client_id=11");
      var b0 = bal(), s = mkStmt({ name: 'BST-PER2', dateacct: '2001-01-15 00:00:00', statementdate: '2001-01-15 00:00:00' }).id; mkLine(s, { c_charge_id: CHARGE, stmtamt: 12, dateacct: '2001-01-15 00:00:00', statementlinedate: '2001-01-15 00:00:00' });
      var d = doc('c_bankstatement', s, 'CO'), x = st(s);
      check('PERIOD', 'control', 'fixture: Jan-01 is status ' + (per && per.s) + ' for CMB; Complete refused "@PeriodClosed@ @Date@=2001-01-15 00:00:00.0, @DocBaseType@=Bank Statement", status DR, no facts, balance unmoved', !!per && per.s === 'C' && d.ok === false && /@PeriodClosed@ @Date@=2001-01-15 00:00:00\.0, @DocBaseType@=Bank Statement$/.test(d.error || '') && x.docstatus === 'DR' && nfacts(s) === 0 && bal() === b0, { per: per, err: d.error, st: x.docstatus });
      var open = mkStmt({ name: 'BST-PER3', dateacct: '2006-11-15 00:00:00' }).id; mkLine(open, { c_charge_id: CHARGE, stmtamt: 13 });
      var d2 = doc('c_bankstatement', open, 'CO');
      check('PERIOD', 'open-control', 'control: the same statement in an OPEN period (Nov-06) completes under C_PeriodControl (the gate is the period, not the document)', d2.accepted && st(open).docstatus === 'CO', { d: d2.msg || d2.error });
    } finally { raw("UPDATE c_acctschema SET autoperiodcontrol='Y' WHERE ad_client_id=11"); }
  });
  verdict('PERIOD');

  // ═══ VOID / CLOSE / REVERSE / REACT ═══
  guard('VOID', 'drafted', 'voidIt on a Drafted statement', function () {
    var p = mkPayment(30), b0 = bal(), s = mkStmt({ name: 'BST-VOID1' }).id; mkLine(s, { c_charge_id: CHARGE, stmtamt: 30 }); mkLine(s, { c_payment_id: p, trxamt: 30, stmtamt: 30 });
    var d = doc('c_bankstatement', s, 'VO'), x = st(s), ls = lns(s);
    check('VOID', 'status', 'accepted: status VO, Processed Y, DocAction --, Difference 0, Ending = Beginning; bank balance untouched (never completed); no facts', d.accepted && x.docstatus === 'VO' && x.processed === 'Y' && x.docaction === '--' && cents(x.statementdifference) === 0 && cents(x.endingbalance) === cents(x.beginningbalance) && bal() === b0 && nfacts(s) === 0, { d: d.msg, st: [x.docstatus, x.processed, x.docaction, x.statementdifference] });
    check('VOID', 'lines', 'both lines zeroed (Stmt/Trx/Charge/Interest 0, payment detached :565-585)', ls.length === 2 && ls.every(function (l) { return cents(l.stmtamt) === 0 && cents(l.trxamt) === 0 && cents(l.chargeamt) === 0 && cents(l.interestamt) === 0 && !Number(l.c_payment_id); }), { ls: ls.map(function (l) { return [l.stmtamt, l.trxamt, l.chargeamt, l.c_payment_id]; }) });
    check('VOID', 'description', 'line 10 description "** Voided (Statement amount=30, Charge amount=30)"; line 20 "** Voided (Statement amount=30, Transaction Amount=30)"; header description "** Voided" (:554-562, :589)', (ls[0] || {}).description === '** Voided (Statement amount=30, Charge amount=30)' && (ls[1] || {}).description === '** Voided (Statement amount=30, Transaction Amount=30)' && x.description === '** Voided', { d1: (ls[0] || {}).description, d2: (ls[1] || {}).description, hdr: x.description });
    check('VOID', 'payment', 'the payment stays/becomes IsReconciled=N (:569-574)', pay(p).isreconciled === 'N', { rec: pay(p).isreconciled });
  });
  guard('VOID', 'completed', 'voidIt on a Completed statement undoes everything completeIt did', function () {
    var p = mkPayment(60), b0 = bal(), s = mkStmt({ name: 'BST-VOID2' }).id; mkLine(s, { c_charge_id: CHARGE, stmtamt: 15 }); mkLine(s, { c_payment_id: p, trxamt: 60, stmtamt: 60 });
    doc('c_bankstatement', s, 'CO'); var mid = bal(), midRec = pay(p).isreconciled, midFacts = nfacts(s);
    var d = doc('c_bankstatement', s, 'VO'), x = st(s);
    check('VOID', 'completed-setup', 'setup: Complete moved the balance by +75 (15 + 60), reconciled the payment and posted facts', cents(mid) === cents(b0 + 75) && midRec === 'Y' && midFacts > 0, { b0: b0, mid: mid, rec: midRec, facts: midFacts });
    check('VOID', 'completed', 'void of the Completed statement: VO, facts deleted (MFactAcct.deleteEx :534), balance restored to the start (:537-545), payment un-reconciled, Difference 0', d.accepted && x.docstatus === 'VO' && nfacts(s) === 0 && cents(bal()) === cents(b0) && pay(p).isreconciled === 'N' && cents(x.statementdifference) === 0 && lns(s).every(function (l) { return cents(l.stmtamt) === 0; }), { d: d.msg || d.error, st: x.docstatus, facts: nfacts(s), bal: [b0, bal()], rec: pay(p).isreconciled });
  });
  guard('VOID', 'closed-refusal', 'the class refusal on a closed / voided document', function () {
    var s = mkStmt({ name: 'BST-VOID3' }).id; mkLine(s, { c_charge_id: CHARGE, stmtamt: 9 }); doc('c_bankstatement', s, 'CO'); doc('c_bankstatement', s, 'CL');
    var closed = st(s), b0 = bal(), r = cls('voidIt', s), x = st(s);
    check('VOID', 'closed', 'voidIt on a Closed (CL) statement answers false with "Document Closed: CL" and sets DocAction -- (:514-521); balance unmoved', closed.docstatus === 'CL' && r.res === false && r.msg === 'Document Closed: CL' && x.docaction === '--' && bal() === b0, { closed: closed.docstatus, res: r.res, msg: r.msg, da: x.docaction });
    var e = doc('c_bankstatement', s, 'VO');
    check('VOID', 'engine', 'the engine does not void a Closed statement either (Void is not a valid action for CL; the DocAction is -- so it does nothing, DocumentEngine.processIt :259-296): status stays CL, facts and balance unchanged', st(s).docstatus === 'CL' && nfacts(s) > 0 && bal() === b0, { st: st(s).docstatus, accepted: e.accepted, msg: e.msg });
  });
  verdict('VOID');
  guard('CLOSE', 'close', 'closeIt: a Completed statement -> Close', function () {
    var s = mkStmt({ name: 'BST-CLOSE' }).id; mkLine(s, { c_charge_id: CHARGE, stmtamt: 8 }); doc('c_bankstatement', s, 'CO'); var b1 = bal(), n1 = nfacts(s), d = doc('c_bankstatement', s, 'CL'), x = st(s);
    check('CLOSE', 'close', 'status CL, DocAction --, facts and balance unchanged (closeIt :606-622 only sets the DocAction)', d.accepted && x.docstatus === 'CL' && x.docaction === '--' && nfacts(s) === n1 && bal() === b1, { d: d.msg, st: [x.docstatus, x.docaction] });
  });
  verdict('CLOSE');
  guard('REVERSE', 'reverse', 'reverseCorrectIt / reverseAccrualIt answer false and change nothing (:628-664)', function () {
    var s = mkStmt({ name: 'BST-REV' }).id; mkLine(s, { c_charge_id: CHARGE, stmtamt: 7 }); doc('c_bankstatement', s, 'CO'); var b1 = bal(), n1 = nfacts(s), x1 = st(s);
    var rc = doc('c_bankstatement', s, 'RC'), ra = doc('c_bankstatement', s, 'RA'), x = st(s);
    check('REVERSE', 'reverse', 'RC and RA are not accepted; statement still CO / Processed Y / Posted Y; facts and balance unchanged', rc.accepted === false && ra.accepted === false && x.docstatus === 'CO' && x.processed === x1.processed && x.posted === 'Y' && nfacts(s) === n1 && bal() === b1, { rc: rc.accepted, ra: ra.accepted, st: x.docstatus });
  });
  verdict('REVERSE');
  guard('REACT', 'react', 'reActivateIt on a Completed statement', function () {
    var p = mkPayment(40), b0 = bal(), s = mkStmt({ name: 'BST-REACT' }).id; mkLine(s, { c_charge_id: CHARGE, stmtamt: 25 }); mkLine(s, { c_payment_id: p, trxamt: 40, stmtamt: 40 });
    doc('c_bankstatement', s, 'CO'); var posted1 = nfacts(s);
    var d = doc('c_bankstatement', s, 'RE'), x = st(s);
    check('REACT', 'undo', 'RE: status IP, DocAction CO, Processed N, Posted N, facts deleted (:685-686), lines Processed N (:691), payment un-reconciled (:693-697), balance restored (:710-713)', d.accepted && x.docstatus === 'IP' && x.docaction === 'CO' && x.processed === 'N' && x.posted === 'N' && nfacts(s) === 0 && lns(s).every(function (l) { return l.processed === 'N'; }) && pay(p).isreconciled === 'N' && cents(bal()) === cents(b0), { d: d.msg || d.error, st: [x.docstatus, x.docaction, x.processed, x.posted], facts: nfacts(s), rec: pay(p).isreconciled, bal: [b0, bal()] });
    var d2 = doc('c_bankstatement', s, 'CO'), x2 = st(s);
    check('REACT', 'recomplete', 'Complete again: CO, posts ONCE (same fact count as the first time, ' + posted1 + '), payment reconciled again, balance +65', d2.accepted && x2.docstatus === 'CO' && nfacts(s) === posted1 && posted1 > 0 && pay(p).isreconciled === 'Y' && cents(bal()) === cents(b0 + 65), { d: d2.msg || d2.error, facts: [posted1, nfacts(s)], bal: [b0, bal()] });
  });
  verdict('REACT');

  var all = !ALL.judged ? 'INCONCLUSIVE' : ALL.failed ? 'FAIL' : 'PASS', failedCases = Object.keys(CASES).filter(function (c) { return CASES[c].failed; });
  SEEN.filter(function (l) { return /SEVERE|MODEL-ERR/.test(l); }).slice(0, 6).forEach(function (l) { say('  ' + l.slice(0, 230)); });
  say('§BST-RESULT verdict=' + all + ' judged=' + ALL.judged + ' failed=' + ALL.failed + ' failedCases=' + J(failedCases) + (MUTANT ? ' mutant=' + MUTANT : ''));
  var exitCode = all === 'PASS' ? 0 : 1;

  // ═══ mutants (BST_MUTANTS=1, parent run only) ═══
  if (process.env.BST_MUTANTS && !MUTANT) {
    var MUTS = []; try { MUTS = require('./witness_bankstatement_mutants.js'); } catch (e) { say('§BST-MUTANT-ERR no mutant table: ' + e.message); }
    var killed = 0, applied = 0, notApplied = [], crashed = [], survived = [], jobs = [];
    MUTS.forEach(function (m) {
      if (process.env.BST_ONLY && !new RegExp(process.env.BST_ONLY).test(m.name)) return;
      var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bstmut_'));
      fs.readdirSync(ERP).forEach(function (f) { try { fs.symlinkSync(path.join(ERP, f), path.join(dir, f)); } catch (e) {} });
      fs.readdirSync(ERP).forEach(function (f) { var src = path.join(ERP, f), s2 = fs.statSync(src); if ((s2.isFile() && /\.js$/.test(f)) || (s2.isDirectory() && (f === 'callouts' || f === 'processes'))) { try { fs.unlinkSync(path.join(dir, f)); } catch (e) {} fs.cpSync(src, path.join(dir, f), { recursive: true }); } });
      var ok = true;
      m.edits.forEach(function (ed) {
        var src = fs.readFileSync(path.join(dir, ed.file), 'utf8'), want = ed.count || 1, have = src.split(ed.from).length - 1;
        if (have !== want) { ok = false; say('§BST-MUTANT-EDIT ' + m.name + ' ' + ed.file + ' found ' + have + ' time(s), expected ' + want); return; }
        fs.writeFileSync(path.join(dir, ed.file), src.split(ed.from).join(ed.to));
      });
      if (!ok) { notApplied.push(m.name); say('§BST-MUTANT ' + m.name + ' NOT-APPLIED (source text not found exactly as counted: the mutant proves nothing)'); try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} return; }
      applied++; jobs.push({ m: m, dir: dir });
    });
    await new Promise(function (resolve) {
      var next = 0, running = 0, POOL = Number(process.env.BST_JOBS || 6);
      function pump() {
        while (running < POOL && next < jobs.length) (function (job) {
          running++;
          var child = cp.spawn(process.execPath, [__filename], { env: Object.assign({}, process.env, { BST_ERP: job.dir, BST_MUTANT: job.m.name, BST_MUTANTS: '' }) }), out = '', timer = setTimeout(function () { child.kill('SIGKILL'); }, 600000);
          child.stdout.on('data', function (d) { out += d; }); child.stderr.on('data', function (d) { out += d; });
          child.on('close', function (code) {
            clearTimeout(timer); running--;
            var m = job.m, rl = out.split('\n').filter(function (l) { return /^§BST-RESULT /.test(l); })[0], failedLines = out.split('\n').filter(function (l) { return /§BST-CHECK .* FAIL /.test(l); });
            var hit = (m.kills || []).filter(function (kk) { return failedLines.some(function (l) { return l.indexOf('case=' + kk.split('.')[0] + ' key=' + kk.split('.')[1] + ' ') >= 0; }); });
            if (!rl) { crashed.push(m.name); say('§BST-MUTANT ' + m.name + ' CRASHED (no verdict line; a crash is NOT a kill) exit=' + code + ' ' + out.split('\n').filter(function (l) { return /Error|error/.test(l); })[0]); }
            else if (/verdict=FAIL/.test(rl) && hit.length) { killed++; say('§BST-MUTANT ' + m.name + ' KILLED by ' + hit.join(' | ') + ' :: ' + m.what); }
            else { survived.push(m.name); say('§BST-MUTANT ' + m.name + ' SURVIVED verdict=' + (rl.match(/verdict=\w+/) || [''])[0] + ' expected to fail ' + (m.kills || []).join(' | ') + ' failedChecks=' + failedLines.length); }
            try { fs.rmSync(job.dir, { recursive: true, force: true }); } catch (e) {}
            if (next >= jobs.length && running === 0) resolve(); else pump();
          });
        })(jobs[next++]);
        if (!jobs.length) resolve();
      }
      pump();
    });
    var nSel = jobs.length + notApplied.length, mv = !MUTS.length ? 'INCONCLUSIVE' : (killed === nSel && !notApplied.length && !crashed.length && !survived.length) ? 'PASS' : 'FAIL';
    say('§BST-MUTANTS verdict=' + mv + ' total=' + nSel + ' applied=' + applied + ' killed=' + killed + ' notApplied=' + J(notApplied) + ' crashed=' + J(crashed) + ' survived=' + J(survived));
    if (mv !== 'PASS') exitCode = 1;
  }
  process.exit(exitCode);
})().catch(function (e) { _log('§BST-RESULT verdict=FAIL harness: ' + (e && e.stack)); process.exit(2); });
