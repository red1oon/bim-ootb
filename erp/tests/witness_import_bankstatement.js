#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-IMPORT-BANKSTATEMENT (bim-compiler prompts/MIGRATE_INSTALL_TENANT.md §E3D-SPEC lane IB; TWIN CARDINAL RULE: the twin does what legacy iDempiere does). READ THE LOG after every run: every verdict is a §IBS line, the exit code is not evidence.
// Legacy: org.adempiere.base.process/src/org/compiere/process/ImportBankStatement.java = AD_Process 221 (erp/processes/ImportBankStatement.js cites the Java lines). LEGACY HAS NO DocAction PARAMETER (AD_Process_Para of 221 = AD_Client_ID, AD_Org_ID,
//   C_BankAccount_ID, DeleteOldImported): the import creates DRAFTED statements; Complete is a separate user action (lane BS), not judged here.
// SPEC (claims written before the code; each check names the issue it proves; expected values come from the cited Java rule or an independent SQL oracle on the tables, never from the port's output):
//   TABLE   I_BankStatement (AD_Table 600, 60 AD_Column rows) is in the seed without a physical table; AdImportTables.ensure(db) creates it, columns == dictionary; ensure() still reports the 3 older tables (3 then 0) and still ensures i_payment / i_gljournal / i_invoice / i_inventory.
//   P0      AD_Process 221 resolves to the ported class; X of N: every AD_Process_Para name is read by prepare() (:66-73); the page and the service worker load the file.
//   BASIC   3 rows (one account, one name, one date) -> ONE C_BankStatement (Drafted, IsManual=N, Beginning = the account's CurrentBalance, Difference = sum StmtAmt, Ending = Beginning + Difference) with 3 lines numbered 10/20/30 (:457, :506);
//           every value legacy copies is copied (:464-495); rows Y with the statement + line ids, Processed Y; the answer logs 0 errors / 1 statement / 3 lines (:532-535). NODA: no Fact_Acct, the statement stays DR.
//   GROUP   :385-431 the if/else-if chain: a different ACCOUNT -> new statement; BOTH names set and different -> new; BOTH names set and EQUAL but dates differ -> still ONE statement (the chain stops at the name branch); names NULL: a different
//           EftStatementReference -> new; names and references NULL: a different StatementDate -> new; all equal -> same statement.
//   CHARGE  :472-475 a row carrying C_Charge_ID -> the line carries the charge and ChargeAmt/TrxAmt/StmtAmt as the SQL phase leaves them (Opening-balance shape: StmtAmt=X, ChargeAmt=X, TrxAmt NULL -> TrxAmt 0 (:229-235), line Charge X, header Ending = Beginning + X);
//           :479-482 a row with C_Payment_ID (+ C_BPartner_ID / C_Invoice_ID) -> the line is linked to the payment and takes its BP and invoice (MBankStatementLine.beforeSave); legacy does NOT resolve ChargeName: a row with only ChargeName and ChargeAmt<>0 is
//           refused by the line save ("Err=Error saving C_BankStatementLine -> ...", FillMandatory C_Charge_ID), never imported.
//   BANK    :130-173 account found by AccountNo + RoutingNo (or SwiftCode); a WRONG routing still resolves through the second statement (without routing); no AccountNo + the C_BankAccount_ID parameter resolves; ISO_Code -> currency, none -> the account's currency.
//   ERR     legacy's exact I_ErrorMsg per failing row (Reset leaves ' ' first): Invalid Org :120, Invalid Bank Account :175, Invalid Currency :201 (not appended to a row already E), Invalid Amount :237, Payment<->Invoice :255, Payment<->BPartner :270,
//           Invoice<->BPartner :285, Invoice.BPartner<->Payment.BPartner :300, Duplicate[...] :315-363 (12 concatenated EFT fields; a NULL field = no duplicate); the good rows of the SAME run are still imported (no refusal in this Java).
//   RERUN   a second run makes nothing new (the Y rows are not read again, :367).  DELOLD  DeleteOldImported=Y removes the Y rows (:96-103) and nothing else.  MUTANTS (IMPORT_MUTANTS=1) every mutant killed or the survivors listed.
// INCONCLUSIVE when nothing was judged. Command: node erp/tests/witness_import_bankstatement.js 2>&1 | tee /tmp/count_logs/ib_main.log   (IMPORT_MUTANTS=1 for the mutant sweep)
'use strict';
var fs = require('fs'), path = require('path'), os = require('os');
if (!global.window) global.window = {};
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
var ERP = process.env.IBS_ERP || path.join(__dirname, '..'), SQLJS_DIR = process.env.SQLJS_DIR || '/home/red1/bim-ootb/tests/node_modules/sql.js', MUTANT = process.env.IBS_MUTANT || '';
if (!process.env.SQLJS) process.env.SQLJS = SQLJS_DIR;
var initSqlJs = require(SQLJS_DIR), _log = console.log, SEEN = [];
console.log = function () { SEEN.push(Array.prototype.join.call(arguments, ' ')); };
function say(s) { _log(s); }
var CASES = {}, ALL = { judged: 0, failed: 0 }, J = JSON.stringify;
function check(cs, key, rule, ok, info) { var c = CASES[cs] = CASES[cs] || { judged: 0, failed: 0 }; c.judged++; ALL.judged++; if (!ok) { c.failed++; ALL.failed++; } say('  §IBS-CHECK case=' + cs + ' key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' rule="' + rule + '"' + (ok ? '' : ' got=' + J(info))); }
function verdict(cs) { var c = CASES[cs] || { judged: 0, failed: 0 }; say('§IBS-' + cs + ' verdict=' + (!c.judged ? 'INCONCLUSIVE' : c.failed ? 'FAIL' : 'PASS') + ' judged=' + c.judged + ' failed=' + c.failed + (MUTANT ? ' mutant=' + MUTANT : '')); }
function guard(cs, key, rule, fn) { try { fn(); } catch (e) { check(cs, key, rule, false, 'threw: ' + (e && (e.stack || e.message) || String(e))); } }
(async function main() {
  var SQL = await initSqlJs({ locateFile: function (f) { return path.join(SQLJS_DIR, 'dist', f); } });
  var db = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(ERP, 'ad_seed.db'))));
  fs.readFileSync(path.join(ERP, 'patches/ad_seed.db.sql'), 'utf8').split(/;\s*\n/).forEach(function (st) { st = st.replace(/^\s*--[^\n]*\n?/gm, '').trim(); if (!st) return; try { db.run(st); } catch (e) { /* patch statement */ } });
  function q0(sql, params) { var st = db.prepare(sql), out = []; try { if (params && params.length) st.bind(params); while (st.step()) { var o = st.getAsObject(), r = {}; for (var k in o) r[k.toLowerCase()] = o[k]; out.push(r); } } finally { st.free(); } return out; }
  var AIT = require(path.join(ERP, 'ad_import_tables.js')), AR = require(path.join(ERP, 'ad_rule.js'));
  say('§IBS-LOAD erp=' + ERP + ' mutant=' + (MUTANT || 'none'));
  // ═══ TABLE ═══
  var dict = q0("SELECT lower(c.columnname) AS c FROM ad_column c WHERE c.ad_table_id=600 AND c.isactive='Y'").map(function (r) { return r.c; }).sort();
  check('TABLE', 'seed-gap', 'the seed has the 60 I_BankStatement dictionary columns but NO physical i_bankstatement table', dict.length === 60 && q0("SELECT name FROM sqlite_master WHERE name='i_bankstatement'").length === 0, { dict: dict.length });
  var n1 = AIT.ensure(db), n2 = AIT.ensure(db), phys = q0('PRAGMA table_info(i_bankstatement)').map(function (r) { return String(r.name).toLowerCase(); }).sort();
  check('TABLE', 'ensure', 'ensure(db) still reports the three older import tables (3 then 0) and creates i_bankstatement whose physical columns == the 60 dictionary columns', n1 === 3 && n2 === 0 && J(phys) === J(dict), { n1: n1, n2: n2, phys: phys.length });
  var older = ['i_payment', 'i_gljournal', 'i_invoice', 'i_inventory', 'i_order', 'i_product'].filter(function (t) { return q0("SELECT name FROM sqlite_master WHERE name='" + t + "'").length === 1; });
  check('TABLE', 'earlier-kept', 'every earlier import table is still ensured (i_payment, i_gljournal, i_invoice, i_inventory, i_order, i_product)', older.length === 6, { older: older });
  check('TABLE', 'wiring', 'ws_kernel.js boots the import tables (a host that never calls AdImportTables.ensure has no I_BankStatement)', /require\('\.\/ad_import_tables\.js'\)\.ensure\(db\)/.test(fs.readFileSync(path.join(ERP, 'ws_kernel.js'), 'utf8')), {});
  AR.ensure(db);
  var K = require(path.join(ERP, 'ws_kernel.js')), k = K.build(db), ML = k.ML, AP = require(path.join(ERP, 'ad_process.js'));
  var S = { clientId: 11, orgId: 11, userId: 100, roleId: 102, warehouseId: 103, actor: 'witness:import-bankstatement' };
  var T1 = '2006-11-15 00:00:00', STD = '2006-11-13 00:00:00';
  function one(sql, p) { return k.q(sql, p || [])[0] || null; }
  function commit(fn, meta) { var trx = new ML.Trx(k.q, Object.assign(k.env(S), { date: T1 })), r; try { r = fn(trx, ML) || { ok: true }; } catch (ex) { r = { ok: false, error: 'model threw: ' + (ex && ex.message) }; trx.say('§MODEL-ERR ' + (ex && ex.stack || ex)); } var ok = r.ok !== false, ops = ok ? trx.groupOps() : [], ids = []; if (ok && ops.length) ids = k.commit(S, ops, meta); return Object.assign({}, r, { ok: ok, ops: ops, ids: ids, log: trx.log }); }
  function declare(rows) { return commit(function (trx) { for (var i = 0; i < rows.length; i++) { var sv = ML.save(trx, 'i_bankstatement', null, ML.newPO(trx, 'i_bankstatement', rows[i])); if (!sv.ok) return { ok: false, error: sv.error }; } return { ok: true }; }); }
  var SHIPPED = [];
  function run(params, tag) { var r = commit(function (trx) { var r0 = AP.runInTrx(trx, 221, { params: params || {} }); return { ok: r0.ok, r: r0, error: r0.summary }; }, { ws: 'import_bankstatement', tag: tag }); (r.log || []).forEach(function (l) { if (/^§(IMPORT_BANKSTATEMENT|PROC-)/.test(l)) SHIPPED.push(l); });
    var logs = (r.r && r.r.logs) || [], num = function (m) { return (logs.filter(function (x) { return x.msg === m; })[0] || {}).number; };
    return { res: r, summary: r.r && r.r.summary, errors: num('@Errors@'), stmts: num('@C_BankStatement_ID@: @Inserted@'), lines: num('@C_BankStatementLine_ID@: @Inserted@'), logs: logs, log: r.log || [] }; }
  function purge() { return commit(function (trx) { trx.find('i_bankstatement', {}).filter(function (r) { return r.i_isimported !== 'Y'; }).forEach(function (r) { trx.del('i_bankstatement', r); }); return { ok: true }; }); }   // error rows stay N and would be retried by every later run (legacy: the user fixes or deletes them)
  var irow = function (tag) { return k.q('SELECT * FROM i_bankstatement WHERE memo=? ORDER BY i_bankstatement_id', [tag]); };
  var stmtOf = function (id) { return one('SELECT * FROM c_bankstatement WHERE c_bankstatement_id=?', [id]); };
  var linesOf = function (id) { return k.q('SELECT * FROM c_bankstatementline WHERE c_bankstatement_id=? ORDER BY line', [id]); };
  var BASE = { AD_Client_ID: 11, AD_Org_ID: 11 }, ACC = '1234', BA = 100;
  var row = function (tag, extra) { return Object.assign({ i_isimported: 'N', ad_org_id: 11, memo: tag, bankaccountno: ACC, name: 'IBS-' + tag, statementdate: T1, statementlinedate: '2006-11-14 00:00:00', stmtamt: 100 }, extra || {}); };
  var acc100 = one('SELECT * FROM c_bankaccount WHERE c_bankaccount_id=?', [BA]);
  say('§IBS-FIXTURE account=' + J([acc100.c_bankaccount_id, acc100.accountno, acc100.currentbalance, acc100.c_currency_id]) + ' bank=' + J(one('SELECT c_bank_id, name, isownbank, routingno, swiftcode FROM c_bank WHERE c_bank_id=?', [acc100.c_bank_id])) + ' accounts=' + k.q("SELECT COUNT(*) AS n FROM c_bankaccount WHERE ad_client_id=11")[0].n);

  // ═══ P0 ═══
  check('P0', 'registered', 'AD_Process 221 resolves to org.compiere.process.ImportBankStatement (registered by erp/processes/ImportBankStatement.js)', !!AP.JAVA['org.compiere.process.ImportBankStatement'] && one('SELECT classname FROM ad_process WHERE ad_process_id=221').classname === 'org.compiere.process.ImportBankStatement', {});
  guard('P0', 'x-of-n', 'X of N: every AD_Process_Para name of 221 is read by the port\'s prepare()', function () {
    var names = k.q("SELECT columnname AS c FROM ad_process_para WHERE ad_process_id=221 AND isactive='Y'").map(function (r) { return r.c; }), src = fs.readFileSync(path.join(ERP, 'processes/ImportBankStatement.js'), 'utf8');
    var used = names.filter(function (n) { return src.indexOf("name === '" + n + "'") >= 0; });
    check('P0', 'x-of-n', 'dictionary parameters ' + J(names) + ' X=' + used.length + ' of N=' + names.length, names.length === 4 && used.length === 4, { names: names, used: used }); });
  var html = fs.readFileSync(path.join(ERP, 'idempiere.html'), 'utf8'), sw = fs.readFileSync(path.join(ERP, 'sw.js'), 'utf8');
  check('P0', 'html-sw', 'idempiere.html loads and sw.js precaches processes/ImportBankStatement.js', /processes\/ImportBankStatement\.js/.test(html) && /processes\/ImportBankStatement\.js/.test(sw), {});
  verdict('TABLE'); verdict('P0');

  // ═══ BASIC / NODA ═══
  var BASICSTMT = null;
  guard('BASIC', 'three-lines', 'one account/name/date, 3 rows -> ONE statement, 3 lines 10/20/30, every copied value, header balances, rows Y, answer logs 0/1/3', function () {
    var common = { description: 'stmt description', eftstatementreference: 'REF-1', eftstatementdate: '2006-11-13 00:00:00' };
    var d = declare([row('B1', Object.assign({ statementdate: STD, line: 5, stmtamt: 100, referenceno: 'R-1', linedescription: 'first', efttrxid: 'T1', efttrxtype: 'CR', eftcheckno: 'C1', eftreference: 'ER1', eftmemo: 'M1', eftpayee: 'P1', eftpayeeaccount: 'PA1', eftstatementlinedate: '2006-11-12 00:00:00', eftvalutadate: '2006-11-12 00:00:00', eftcurrency: 'USD', eftamt: 100, valutadate: '2006-11-16 00:00:00' }, common)),
      row('B1', Object.assign({ statementdate: STD, line: 1, stmtamt: -40, referenceno: 'R-2', linedescription: 'second', interestamt: 0 }, common)), row('B1', Object.assign({ statementdate: STD, line: 9, stmtamt: 25.5, interestamt: 0.5 }, common))]);
    var r = run(BASE, 'B1'), rs = irow('B1'), sid = rs[0] && rs[0].c_bankstatement_id, st = sid ? stmtOf(sid) : null, ls = sid ? linesOf(sid) : [];
    BASICSTMT = st;
    check('BASIC', 'declare', 'fixture: the rows were declared and the run was accepted', d.ok && r.res.ok, { declare: d.error, summary: r.summary });
    check('BASIC', 'row-state', 'all rows I_IsImported=Y, Processed=Y, SAME statement id, DIFFERENT line ids; answer logs 0 errors / 1 statement / 3 lines (:532-535)',
      rs.length === 3 && rs.every(function (x) { return x.i_isimported === 'Y' && x.processed === 'Y' && x.c_bankstatement_id === sid && !!x.c_bankstatementline_id; }) && new Set(rs.map(function (x) { return x.c_bankstatementline_id; })).size === 3 && Number(r.errors) === 0 && Number(r.stmts) === 1 && Number(r.lines) === 3,
      { rs: rs.map(function (x) { return [x.i_isimported, x.c_bankstatement_id, x.c_bankstatementline_id, x.i_errormsg]; }), ans: [r.errors, r.stmts, r.lines], msg: r.summary });
    check('BASIC', 'header', 'statement copies Name/StatementDate/Description/EftStatementReference/EftStatementDate, account 100, DateAcct = StatementDate (:445-449), Drafted DR/CO, IsManual=N (MBankStatement(account) -> isManual=false), doc type 146',
      !!st && st.name === 'IBS-B1' && st.statementdate === STD && st.dateacct === STD && st.description === 'stmt description' && st.eftstatementreference === 'REF-1' && st.eftstatementdate === '2006-11-13 00:00:00' && Number(st.c_bankaccount_id) === BA && st.docstatus === 'DR' && st.docaction === 'CO' && st.ismanual === 'N' && Number(st.c_doctype_id) === 146 && Number(st.ad_org_id) === Number(acc100.ad_org_id) && st.processed === 'N' && st.posted === 'N',
      { st: st && [st.name, st.statementdate, st.dateacct, st.description, st.eftstatementreference, st.docstatus, st.docaction, st.ismanual, st.c_doctype_id, st.ad_org_id] });
    var sum = (100 - 40 + 25.5), bal = Number(acc100.currentbalance);
    check('BASIC', 'balances', 'Beginning = the account CurrentBalance (' + bal + '), StatementDifference = SUM(StmtAmt) = ' + sum + ' (SQL oracle), Ending = Beginning + Difference (MBankStatement.beforeSave :264-271, MBankStatementLine.afterSave updateHeader)',
      !!st && Number(st.beginningbalance) === bal && Math.abs(Number(st.statementdifference) - sum) < 1e-9 && Math.abs(Number(st.endingbalance) - (bal + sum)) < 1e-9, { st: st && [st.beginningbalance, st.statementdifference, st.endingbalance] });
    var l0 = ls[0] || {}, l1 = ls[1] || {}, l2 = ls[2] || {};
    check('BASIC', 'line-numbers', 'lines are numbered 10, 20, 30 in the loop order (ORDER BY ... Line: rows with Line 1, 5, 9) - the row Line is not copied (:460-461, :506)', ls.length === 3 && [l0.line, l1.line, l2.line].join() === '10,20,30' && l0.stmtamt === -40 && l1.stmtamt === 100 && l2.stmtamt === 25.5, { ls: ls.map(function (l) { return [l.line, l.stmtamt]; }) });
    check('BASIC', 'line-values', 'line 20 (row Line 5) copies ReferenceNo, Description=LineDescription, StatementLineDate, ValutaDate (own), TrxAmt=StmtAmt-Interest-Charge, ChargeAmt/InterestAmt 0, IsReversal N, currency = the account currency, all Eft* fields (:464-495)',
      l1.referenceno === 'R-1' && l1.description === 'first' && l1.statementlinedate === '2006-11-14 00:00:00' && l1.valutadate === '2006-11-16 00:00:00' && l1.dateacct === '2006-11-14 00:00:00' && l1.trxamt === 100 && l1.chargeamt === 0 && l1.interestamt === 0 && l1.isreversal === 'N' && Number(l1.c_currency_id) === Number(acc100.c_currency_id)
      && l1.efttrxid === 'T1' && l1.efttrxtype === 'CR' && l1.eftcheckno === 'C1' && l1.eftreference === 'ER1' && l1.eftmemo === 'M1' && l1.eftpayee === 'P1' && l1.eftpayeeaccount === 'PA1' && l1.eftstatementlinedate === '2006-11-12 00:00:00' && l1.eftvalutadate === '2006-11-12 00:00:00' && l1.eftcurrency === 'USD' && l1.eftamt === 100,
      { l1: l1 });
    check('BASIC', 'valuta-default', 'a row without ValutaDate gets StatementLineDate (:246-252)', l0.valutadate === '2006-11-14 00:00:00' && l2.valutadate === '2006-11-14 00:00:00', { l0: l0.valutadate, l2: l2.valutadate });
    check('BASIC', 'interest-trx', 'row with InterestAmt 0.5: TrxAmt = 25.5 - 0.5 - 0 = 25 (:229-235), InterestAmt 0.5 on the line', l2.trxamt === 25 && l2.interestamt === 0.5, { l2: [l2.trxamt, l2.interestamt] });
  }); verdict('BASIC');
  guard('NODA', 'draft', 'the import leaves the statement Drafted with NO Fact_Acct (legacy ImportBankStatement never completes; there is no DocAction parameter)', function () {
    check('NODA', 'draft', 'statement DR, Fact_Acct rows (ad_table_id 392) = 0', !!BASICSTMT && BASICSTMT.docstatus === 'DR' && one('SELECT COUNT(*) AS n FROM fact_acct WHERE ad_table_id=392 AND record_id=?', [BASICSTMT.c_bankstatement_id]).n === 0, { st: BASICSTMT && BASICSTMT.docstatus }); }); verdict('NODA');

  // ═══ GROUP ═══
  function stmtsOfTag(tag) { var s = {}; irow(tag).forEach(function (x) { if (x.c_bankstatement_id) s[x.c_bankstatement_id] = 1; }); return Object.keys(s).length; }
  guard('GROUP', 'chain', 'the break chain of :385-431, one run per rule', function () {
    // (a) different names -> 2 statements
    declare([row('GA', { name: 'N-A' }), row('GA', { name: 'N-B' })]); run(BASE, 'GA');
    check('GROUP', 'name-differs', 'two rows, same account, DIFFERENT names -> 2 statements (:401-410)', stmtsOfTag('GA') === 2, { n: stmtsOfTag('GA') });
    check('GROUP', 'line-restart', 'each new statement numbers its lines from 10 again (:457): two statements with one line each, both Line 10', irow('GA').every(function (x) { var ls = linesOf(x.c_bankstatement_id); return ls.length === 1 && Number(ls[0].line) === 10; }), { lines: irow('GA').map(function (x) { return linesOf(x.c_bankstatement_id).map(function (l) { return l.line; }); }) });
    // (b) same name, different dates -> still ONE (the chain stops at the name branch)
    declare([row('GB', { name: 'SAME', statementdate: '2006-11-10 00:00:00', line: 1 }), row('GB', { name: 'SAME', statementdate: '2006-11-11 00:00:00', line: 2 })]); run(BASE, 'GB');
    var gb = irow('GB'), sb = gb[0] && gb[0].c_bankstatement_id && stmtOf(gb[0].c_bankstatement_id);
    check('GROUP', 'name-equal-date-differs', 'BOTH names set and EQUAL but the dates differ -> ONE statement (the else-if chain ends at the name branch, :401-410: the date branch :421 is never reached) carrying the FIRST row\'s date', stmtsOfTag('GB') === 1 && !!sb && sb.statementdate === '2006-11-10 00:00:00', { n: stmtsOfTag('GB'), d: sb && sb.statementdate });
    // (c) names null, different references -> 2
    declare([row('GC', { name: null, eftstatementreference: 'R1' }), row('GC', { name: null, eftstatementreference: 'R2' })]); run(BASE, 'GC');
    check('GROUP', 'reference-differs', 'names NULL, different EftStatementReference -> 2 statements (:411-420)', stmtsOfTag('GC') === 2, { n: stmtsOfTag('GC') });
    // (d) names + refs null, different dates -> 2 ; equal dates -> 1
    declare([row('GD', { name: null, statementdate: '2006-11-10 00:00:00' }), row('GD', { name: null, statementdate: '2006-11-11 00:00:00' })]); run(BASE, 'GD');
    check('GROUP', 'date-differs', 'names and references NULL, different StatementDate -> 2 statements (:421-430)', stmtsOfTag('GD') === 2, { n: stmtsOfTag('GD') });
    declare([row('GE', { name: null }), row('GE', { name: null })]); run(BASE, 'GE');
    check('GROUP', 'all-equal', 'names NULL, same date, no references -> ONE statement', stmtsOfTag('GE') === 1, { n: stmtsOfTag('GE') });
    // (e) other account -> new statement, names equal
    declare([row('GF', { name: 'SAMEF', bankaccountno: '1234' }), row('GF', { name: 'SAMEF', bankaccountno: '5678' })]); run(BASE, 'GF');
    var gf = irow('GF');
    check('GROUP', 'account-differs', 'same name, DIFFERENT bank account (1234 -> 100, 5678 -> 101) -> 2 statements, one per account (:393-400)', stmtsOfTag('GF') === 2 && gf.map(function (x) { return stmtOf(x.c_bankstatement_id).c_bankaccount_id; }).sort().join() === '100,101', { n: stmtsOfTag('GF') });
    // (f) a null name statement keeps the Timestamp name of MBankStatement(account)
    var ge = irow('GE'), sg = ge[0] && stmtOf(ge[0].c_bankstatement_id);
    check('GROUP', 'default-name', 'a row without Name leaves the statement named getStatementDate().toString() of the constructor (MBankStatement.java:125), a Timestamp text', !!sg && /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\.\d+$/.test(sg.name), { name: sg && sg.name });
  }); verdict('GROUP');

  // ═══ CHARGE ═══
  guard('CHARGE', 'opening', 'the opening-balance shape: ONE row, StmtAmt=X, ChargeAmt=X, C_Charge_ID, nothing else', function () {
    var X = 12444.87, bal = Number(one('SELECT currentbalance FROM c_bankaccount WHERE c_bankaccount_id=101').currentbalance);
    var d = declare([{ i_isimported: 'N', ad_org_id: 11, memo: 'CH1', c_bankaccount_id: 101, statementdate: '2006-11-15 00:00:00', statementlinedate: '2006-11-15 00:00:00', stmtamt: X, chargeamt: X, c_charge_id: 100 }]);
    var r = run(BASE, 'CH1'), rs = irow('CH1'), st = rs[0] && rs[0].c_bankstatement_id ? stmtOf(rs[0].c_bankstatement_id) : null, ls = st ? linesOf(st.c_bankstatement_id) : [], l = ls[0] || {};
    check('CHARGE', 'opening-line', 'the row is imported (Y); ONE statement on account 101 with ONE line: Charge 100, ChargeAmt=StmtAmt=' + X + ', TrxAmt 0 (SQL: StmtAmt-Interest-Charge), InterestAmt 0, currency = the account\'s (:193-199), statement date = the row\'s',
      d.ok && rs[0].i_isimported === 'Y' && !!st && ls.length === 1 && Number(l.c_charge_id) === 100 && l.chargeamt === X && l.stmtamt === X && l.trxamt === 0 && l.interestamt === 0 && Number(l.c_currency_id) === Number(one('SELECT c_currency_id FROM c_bankaccount WHERE c_bankaccount_id=101').c_currency_id) && Number(st.c_bankaccount_id) === 101 && st.statementdate === '2006-11-15 00:00:00' && Number(r.stmts) === 1 && Number(r.lines) === 1,
      { err: rs[0] && rs[0].i_errormsg, l: l, st: st && [st.c_bankaccount_id, st.statementdate] });
    check('CHARGE', 'opening-header', 'header Beginning = the account CurrentBalance (' + bal + '), Difference = Ending - Beginning = ' + X, !!st && Number(st.beginningbalance) === bal && Math.abs(Number(st.statementdifference) - X) < 1e-9 && Math.abs(Number(st.endingbalance) - (bal + X)) < 1e-9, { st: st && [st.beginningbalance, st.statementdifference, st.endingbalance] });
  });
  guard('CHARGE', 'payment', 'a row with C_Payment_ID, C_BPartner_ID and C_Invoice_ID: the line is linked to the payment and takes BP and invoice from it', function () {
    var pay = one('SELECT * FROM c_payment WHERE c_payment_id=100');
    declare([row('CH2', { c_payment_id: 100, c_bpartner_id: pay.c_bpartner_id, c_invoice_id: pay.c_invoice_id, stmtamt: 77.77, trxamt: 77.77 })]); var r = run(BASE, 'CH2'), rs = irow('CH2'), ls = rs[0] && rs[0].c_bankstatement_id ? linesOf(rs[0].c_bankstatement_id) : [], l = ls[0] || {};
    check('CHARGE', 'payment', 'line C_Payment_ID 100, C_BPartner_ID ' + pay.c_bpartner_id + ', C_Invoice_ID ' + pay.c_invoice_id + ' (payment 100 SQL oracle; MBankStatementLine.beforeSave :216-223), row Y', rs[0].i_isimported === 'Y' && Number(l.c_payment_id) === 100 && Number(l.c_bpartner_id) === Number(pay.c_bpartner_id) && Number(l.c_invoice_id) === Number(pay.c_invoice_id), { err: rs[0].i_errormsg, l: [l.c_payment_id, l.c_bpartner_id, l.c_invoice_id] });
  });
  guard('CHARGE', 'chargename', 'legacy does NOT resolve ChargeName: ChargeAmt<>0 with only a ChargeName is refused by the line save', function () {
    declare([row('CH3', { chargename: 'Bank Charge', stmtamt: 30, chargeamt: 30 }), row('CH3G', { name: 'IBS-CH3G', stmtamt: 5 })]); var r = run(BASE, 'CH3'); var r3 = irow('CH3')[0], good = irow('CH3G')[0];
    var bad = one("SELECT COUNT(*) AS n FROM c_bankstatementline l JOIN c_bankstatement s ON s.c_bankstatement_id=l.c_bankstatement_id WHERE s.name='IBS-CH3'").n;
    check('CHARGE', 'chargename', 'the ChargeName-only row ends N with "Err=Error saving C_BankStatementLine -> ..." (Java :507-510), no line exists for it; the good row of the same run is imported (:498-506)', r3.i_isimported === 'N' && /^Err=Error saving C_BankStatementLine -> /.test(String(r3.i_errormsg)) && Number(bad) === 0 && good.i_isimported === 'Y', { r3: [r3.i_isimported, r3.i_errormsg], bad: bad, good: good.i_isimported });
    purge(); }); verdict('CHARGE');

  // ═══ BANK ═══
  guard('BANK', 'resolve', 'bank account and currency resolution (:130-209)', function () {
    declare([row('K1', { name: 'K-ROUT', bankaccountno: '1234', routingno: '123456789' }), row('K2', { name: 'K-SWIFT', bankaccountno: '1234', routingno: '12345' }), row('K3', { name: 'K-WRONG', bankaccountno: '1234', routingno: 'nope' }),
      row('K4', { name: 'K-PARAM', bankaccountno: null }), row('K5', { name: 'K-ISO', iso_code: 'EUR' }), row('K6', { name: 'K-NOISO' }), row('K7', { name: 'K-ORG0', ad_org_id: 0 })]);
    var r = run(Object.assign({ C_BankAccount_ID: 101 }, BASE), 'K'), g = function (t) { var x = irow(t)[0]; return { x: x, st: x && x.c_bankstatement_id ? stmtOf(x.c_bankstatement_id) : null, l: x && x.c_bankstatement_id ? linesOf(x.c_bankstatement_id)[0] : null }; };
    var cur = function (t) { var l = g(t).l; return l ? Number(l.c_currency_id) : null; };
    check('BANK', 'routing', 'AccountNo 1234 + RoutingNo (bank 100 routing 123456789) -> account 100; RoutingNo = the bank SwiftCode (12345) -> account 100', g('K1').x.i_isimported === 'Y' && !!g('K1').st && Number(g('K1').st.c_bankaccount_id) === 100 && !!g('K2').st && Number(g('K2').st.c_bankaccount_id) === 100, { k1: g('K1').x.i_errormsg, k2: g('K2').x.i_errormsg });
    check('BANK', 'wrong-routing', 'a WRONG RoutingNo still resolves through the statement without routing (:147-162): imported on account 100', g('K3').x.i_isimported === 'Y' && !!g('K3').st && Number(g('K3').st.c_bankaccount_id) === 100, { k3: g('K3').x.i_errormsg });
    check('BANK', 'parameter', 'no AccountNo -> the C_BankAccount_ID process parameter (101) (:164-173)', g('K4').x.i_isimported === 'Y' && !!g('K4').st && Number(g('K4').st.c_bankaccount_id) === 101, { k4: g('K4').x.i_errormsg });
    check('BANK', 'currency', 'ISO_Code EUR -> C_Currency 102 (SQL oracle on c_currency); no ISO_Code -> the account\'s currency ' + acc100.c_currency_id + ' (:185-199)', cur('K5') === Number(one("SELECT c_currency_id AS i FROM c_currency WHERE iso_code='EUR'").i) && cur('K6') === Number(acc100.c_currency_id), { k5: cur('K5'), k6: cur('K6'), e5: g('K5').x.i_errormsg, e6: g('K6').x.i_errormsg });
    check('BANK', 'org-default', 'a row with AD_Org_ID 0 takes the AD_Org_ID process parameter (11) in the Reset (:105-118) and is imported', g('K7').x.i_isimported === 'Y' && Number(g('K7').x.ad_org_id) === 11, { k7: [g('K7').x.i_isimported, g('K7').x.ad_org_id, g('K7').x.i_errormsg] });
    purge();
  }); verdict('BANK');

  // ═══ ERR ═══
  guard('ERR', 'texts', 'the exact I_ErrorMsg per failing row; the good rows of the same run are still imported', function () {
    var sumOrg = 50007;
    declare([row('E-ok1', { name: 'IBS-E-ok1' }),
      row('E-org', { ad_org_id: sumOrg }), row('E-bank', { bankaccountno: '9999' }), row('E-cur', { iso_code: 'ZZZ' }), row('E-amt', { stmtamt: 100, trxamt: 50, chargeamt: 10, interestamt: 10 }),
      row('E-pi', { c_payment_id: 100, c_invoice_id: 100 }), row('E-pb', { c_payment_id: 100, c_bpartner_id: 118 }), row('E-ib', { c_invoice_id: 109, c_bpartner_id: 112 }), row('E-ipb', { c_payment_id: 100, c_invoice_id: 109 }),
      row('E-both', { bankaccountno: '9999', iso_code: 'ZZZ' }), row('E-ok2', { name: 'IBS-E-ok2', c_payment_id: 100, c_invoice_id: 101, c_bpartner_id: 112 })]);
    var r = run(BASE, 'E'), msg = function (t) { var x = irow(t)[0]; return x ? [x.i_isimported, x.i_errormsg] : null; }, sk = function (t) { return J(msg(t)); };
    check('ERR', 'good-rows', 'the good rows of the same run are imported although other rows failed (no refusal in this Java)', msg('E-ok1')[0] === 'Y' && msg('E-ok2')[0] === 'Y', { ok1: msg('E-ok1'), ok2: msg('E-ok2') });
    check('ERR', 'invalid-org', 'org ' + sumOrg + ' (a summary org, SQL oracle) -> " ERR=Invalid Org, " (the Reset text " " first) (:120-127)', sk('E-org') === J(['N', ' ERR=Invalid Org, ']), { m: msg('E-org') });
    check('ERR', 'invalid-bank', 'AccountNo 9999 -> " ERR=Invalid Bank Account, " (:175-182)', sk('E-bank') === J(['N', ' ERR=Invalid Bank Account, ']), { m: msg('E-bank') });
    check('ERR', 'invalid-currency', 'ISO_Code ZZZ -> " ERR=Invalid Currency," (no space after the comma, :201-209)', sk('E-cur') === J(['N', ' ERR=Invalid Currency,']), { m: msg('E-cur') });
    check('ERR', 'both-bank-and-currency', 'bad account AND bad ISO: only the bank account text - Invalid Currency skips rows already E (:206 I_IsImported<>\'E\')', sk('E-both') === J(['N', ' ERR=Invalid Bank Account, ']), { m: msg('E-both') });
    check('ERR', 'invalid-amount', 'Trx 50 + Charge 10 + Interest 10 <> Stmt 100 -> " Err=Invalid Amount, " (:237-243)', sk('E-amt') === J(['N', ' Err=Invalid Amount, ']), { m: msg('E-amt') });
    check('ERR', 'payment-invoice', 'payment 100 belongs to invoice 101, the row names invoice 100 (same BP 112) -> exactly " Err=Invalid Payment<->Invoice, " (:255-267)', msg('E-pi')[1] === ' Err=Invalid Payment<->Invoice, ' && msg('E-pi')[0] === 'N', { m: msg('E-pi') });
    check('ERR', 'payment-bpartner', 'payment 100 is BP 112, the row names BP 118 -> " Err=Invalid Payment<->BPartner, " (:270-282)', msg('E-pb')[1] === ' Err=Invalid Payment<->BPartner, ' && msg('E-pb')[0] === 'N', { m: msg('E-pb') });
    check('ERR', 'invoice-bpartner', 'invoice 109 is BP 118, the row names BP 112 -> " Err=Invalid Invoice<->BPartner, " (:285-297)', msg('E-ib')[1] === ' Err=Invalid Invoice<->BPartner, ' && msg('E-ib')[0] === 'N', { m: msg('E-ib') });
    check('ERR', 'invoice-payment-bpartner', 'payment 100 (invoice 101, BP 112) with invoice 109 (BP 118): BOTH the Payment<->Invoice text and the Invoice.BPartner<->Payment.BPartner text, in statement order (:255, :300)',
      msg('E-ipb')[1] === ' Err=Invalid Payment<->Invoice, Err=Invalid Invoice.BPartner<->Payment.BPartner, ', { m: msg('E-ipb') });
    check('ERR', 'answer', 'the answer log @Errors@ counts the rows left not-imported: ' + 9, Number(r.errors) === 9 && Number(r.stmts) === 2 && Number(r.lines) === 2, { ans: [r.errors, r.stmts, r.lines] });
    purge();
  });
  guard('ERR', 'duplicate', 'Err=Duplicate[Line_ID=..,EDTTrxID=..]: 12 concatenated EFT fields equal, any NULL = no duplicate', function () {
    var eft = { efttrxid: 'DUP-1', eftamt: 10, eftstatementlinedate: '2006-11-01 00:00:00', eftvalutadate: '2006-11-01 00:00:00', efttrxtype: 'CR', eftcurrency: 'USD', eftreference: 'RF', eftstatementreference: 'SREF', eftcheckno: 'CK', eftmemo: 'MM', eftpayee: 'PY', eftpayeeaccount: 'PAC' };
    declare([row('D1', Object.assign({ name: 'IBS-D1' }, eft))]); run(BASE, 'D1'); var first = irow('D1')[0], line = first.c_bankstatementline_id;
    declare([row('D2', Object.assign({ name: 'IBS-D2' }, eft)), row('D3', Object.assign({ name: 'IBS-D3' }, eft, { eftmemo: null })), row('D4', Object.assign({ name: 'IBS-D4' }, eft, { eftcheckno: 'OTHER' }))]); var r = run(BASE, 'D2');
    var d2 = irow('D2')[0], d3 = irow('D3')[0], d4 = irow('D4')[0];
    check('ERR', 'duplicate', 'the row equal to the imported line (' + line + ') on all 12 fields -> E then N with " Err=Duplicate[Line_ID=' + line + ',EDTTrxID=DUP-1]" (:315-363)', d2.i_isimported === 'N' && d2.i_errormsg === ' Err=Duplicate[Line_ID=' + line + ',EDTTrxID=DUP-1]', { m: [d2.i_isimported, d2.i_errormsg] });
    check('ERR', 'duplicate-null-field', 'a row with one EFT field NULL is not a duplicate (SQL NULL || x = NULL) and is imported; a row differing in one field is imported', d3.i_isimported === 'Y' && d4.i_isimported === 'Y', { d3: [d3.i_isimported, d3.i_errormsg], d4: [d4.i_isimported, d4.i_errormsg] });
    declare([row('D5', Object.assign({ name: 'IBS-D5' }, eft, { efttrxid: 'DUP-2', eftmemo: null }))]); run(BASE, 'D5');
    declare([row('D6', Object.assign({ name: 'IBS-D6' }, eft, { efttrxid: 'DUP-2', eftmemo: null }))]); run(BASE, 'D6');
    var d5 = irow('D5')[0], d6 = irow('D6')[0];
    check('ERR', 'duplicate-null-both', 'an identical row whose EftMemo is NULL on BOTH sides is NOT a duplicate (SQL NULL concatenation is NULL, never equal) and is imported (:315-345)', d5.i_isimported === 'Y' && d6.i_isimported === 'Y', { d5: d5.i_isimported, d6: [d6.i_isimported, d6.i_errormsg] });
    purge();
  }); verdict('ERR');

  // ═══ RERUN / DELOLD ═══
  guard('RERUN', 'nothing-new', 'a second run makes nothing new', function () {
    var s0 = one('SELECT COUNT(*) AS n FROM c_bankstatement').n, l0 = one('SELECT COUNT(*) AS n FROM c_bankstatementline').n, r = run(BASE, 'RERUN');
    check('RERUN', 'nothing-new', 'statements and lines unchanged; the answer logs 0 errors / 0 statements / 0 lines (the Y rows are not read again, :367)', one('SELECT COUNT(*) AS n FROM c_bankstatement').n === s0 && one('SELECT COUNT(*) AS n FROM c_bankstatementline').n === l0 && Number(r.stmts) === 0 && Number(r.lines) === 0 && Number(r.errors) === 0, { ans: [r.errors, r.stmts, r.lines], sum: r.summary }); }); verdict('RERUN');
  guard('DELOLD', 'delete', 'DeleteOldImported=Y removes the imported rows (Y) and keeps the rest', function () {
    declare([row('DEL', { bankaccountno: '9999' })]);
    var y0 = one("SELECT COUNT(*) AS n FROM i_bankstatement WHERE i_isimported='Y'").n, r = run(Object.assign({ DeleteOldImported: 'Y' }, BASE), 'DEL'), y1 = one("SELECT COUNT(*) AS n FROM i_bankstatement WHERE i_isimported='Y'").n, n1 = one("SELECT COUNT(*) AS n FROM i_bankstatement WHERE i_isimported<>'Y'").n;
    check('DELOLD', 'delete', 'Y rows ' + y0 + ' -> 0 and the failing N row kept (' + n1 + ')', y0 > 0 && y1 === 0 && n1 === 1 && one("SELECT COUNT(*) AS n FROM c_bankstatement WHERE name LIKE 'IBS-%'").n > 0, { y: [y0, y1], n1: n1, sum: r.summary });
    purge(); }); verdict('DELOLD');

  check('P0', 'named-seam', 'the unported commitEx() (:364) is NAMED in the shipped log as §PROC-UNPORTED, never silent', SHIPPED.some(function (l) { return /PROC-UNPORTED ImportBankStatement commitEx\(\)/.test(l); }), {});
  var unk = SEEN.filter(function (l) { return /PROC-UNKNOWN-PARA ImportBankStatement/.test(l); });
  check('P0', 'no-unknown-para', 'no run printed §PROC-UNKNOWN-PARA', unk.length === 0, unk); verdict('P0');
  SHIPPED.filter(function (l) { return /SEVERE|PROC-SQL|PROC-UNPORTED/.test(l); }).slice(0, 8).forEach(function (l) { say('  ' + l.slice(0, 230)); });
  var all = !ALL.judged ? 'INCONCLUSIVE' : ALL.failed ? 'FAIL' : 'PASS', failedCases = Object.keys(CASES).filter(function (c) { return CASES[c].failed; });
  say('§IBS-RESULT verdict=' + all + ' judged=' + ALL.judged + ' failed=' + ALL.failed + ' failedCases=' + J(failedCases) + (MUTANT ? ' mutant=' + MUTANT : ''));
  var exitCode = all === 'PASS' ? 0 : 1;

  // ═══ mutants (IMPORT_MUTANTS=1, parent run only) ═══
  if (process.env.IMPORT_MUTANTS && !MUTANT) {
    var cp = require('child_process'), MUTS = []; try { MUTS = require('./witness_import_bankstatement_mutants.js'); } catch (e) { say('§IBS-MUTANT-ERR no mutant table: ' + e.message); }
    var killed = 0, applied = 0, notApplied = [], crashed = [], survived = [], jobs = [];
    MUTS.forEach(function (m) {
      if (process.env.IBS_ONLY && !new RegExp(process.env.IBS_ONLY).test(m.name)) return;
      var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ibsmut_'));
      fs.readdirSync(ERP).forEach(function (f) { try { fs.symlinkSync(path.join(ERP, f), path.join(dir, f)); } catch (e) {} });
      fs.readdirSync(ERP).forEach(function (f) { var src = path.join(ERP, f), st = fs.statSync(src); if ((st.isFile() && /\.js$/.test(f)) || (st.isDirectory() && (f === 'callouts' || f === 'processes'))) { try { fs.unlinkSync(path.join(dir, f)); } catch (e) {} fs.cpSync(src, path.join(dir, f), { recursive: true }); } });
      var ok = true;
      m.edits.forEach(function (ed) {
        var src = fs.readFileSync(path.join(dir, ed.file), 'utf8'), want = ed.count || 1, have = src.split(ed.from).length - 1;
        if (have !== want) { ok = false; say('§IBS-MUTANT-EDIT ' + m.name + ' ' + ed.file + ' found ' + have + ' time(s), expected ' + want); return; }
        fs.writeFileSync(path.join(dir, ed.file), src.split(ed.from).join(ed.to));
      });
      if (!ok) { notApplied.push(m.name); say('§IBS-MUTANT ' + m.name + ' NOT-APPLIED (source text not found exactly as counted: the mutant proves nothing)'); try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} return; }
      applied++; jobs.push({ m: m, dir: dir });
    });
    await new Promise(function (resolve) {
      var next = 0, running = 0, POOL = Number(process.env.IBS_JOBS || 6);
      function pump() {
        while (running < POOL && next < jobs.length) (function (job) {
          running++;
          var child = cp.spawn(process.execPath, [__filename], { env: Object.assign({}, process.env, { IBS_ERP: job.dir, IBS_MUTANT: job.m.name, IMPORT_MUTANTS: '' }) }), out = '', timer = setTimeout(function () { child.kill('SIGKILL'); }, 600000);
          child.stdout.on('data', function (d) { out += d; }); child.stderr.on('data', function (d) { out += d; });
          child.on('close', function (code) {
            clearTimeout(timer); running--;
            var m = job.m, rl = out.split('\n').filter(function (l) { return /^§IBS-RESULT /.test(l); })[0], failedLines = out.split('\n').filter(function (l) { return /§IBS-CHECK .* FAIL /.test(l); });
            var hit = (m.kills || []).filter(function (kk) { return failedLines.some(function (l) { return l.indexOf('case=' + kk.split('.')[0] + ' key=' + kk.split('.')[1] + ' ') >= 0; }); });
            if (!rl) { crashed.push(m.name); say('§IBS-MUTANT ' + m.name + ' CRASHED (no verdict line; a crash is NOT a kill) exit=' + code); }
            else if (/verdict=FAIL/.test(rl) && hit.length) { killed++; say('§IBS-MUTANT ' + m.name + ' KILLED by ' + hit.join(' | ') + ' :: ' + m.what); }
            else { survived.push(m.name); say('§IBS-MUTANT ' + m.name + ' SURVIVED verdict=' + (rl.match(/verdict=\w+/) || [''])[0] + ' expected to fail ' + (m.kills || []).join(' | ') + ' failedChecks=' + failedLines.length); }
            try { fs.rmSync(job.dir, { recursive: true, force: true }); } catch (e) {}
            if (next >= jobs.length && running === 0) resolve(); else pump();
          });
        })(jobs[next++]);
        if (!jobs.length) resolve();
      }
      pump();
    });
    var nSel = jobs.length + notApplied.length, mv = !MUTS.length ? 'INCONCLUSIVE' : (killed === nSel && !notApplied.length && !crashed.length && !survived.length) ? 'PASS' : 'FAIL';
    say('§IBS-MUTANTS verdict=' + mv + ' total=' + nSel + ' applied=' + applied + ' killed=' + killed + ' notApplied=' + J(notApplied) + ' crashed=' + J(crashed) + ' survived=' + J(survived));
    if (mv !== 'PASS') exitCode = 1;
  }
  process.exit(exitCode);
})().catch(function (e) { _log('§IBS-RESULT verdict=FAIL harness: ' + (e && e.stack)); process.exit(2); });
