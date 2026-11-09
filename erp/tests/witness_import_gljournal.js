#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-IMPORT-GLJOURNAL (bim-compiler prompts/MIGRATE_INSTALL_TENANT.md §ENGINE-SPEC E3a; TWIN CARDINAL RULE: the twin does what legacy iDempiere does). READ THE LOG after every run: every verdict is a §IGLJ line, the exit code is not the evidence.
// Legacy: org.adempiere.base.process/src/org/compiere/process/ImportGLJournal.java = AD_Process 220 (erp/processes/ImportGLJournal.js cites the Java lines); the Complete step is MJournal / MJournalBatch.completeIt (erp/model_journal.js, new:
//   the twin had no GL Journal DocAction, measured) and the books are Doc_GLJournal (model_post.js). LEGACY HAS NO DocAction PARAMETER: the import only creates Drafted documents; Complete is a separate user action, so NODA is the normal case.
// SPEC (claims written before the code; each check below names the issue it proves):
//   TABLE   I_GLJournal (AD_Table 599, 70 AD_Column rows) is in the seed without a physical table; AdImportTables.ensure(db) creates it, columns == dictionary, and ensure() still reports 3 older tables.
//   P0      AD_Process 220 resolves to the ported class; X of N: every AD_Process_Para name is read by prepare() (:73-86); the page loads the port AND the new DocAction file (idempiere.html + sw.js).
//   BAL     a balanced 2-line journal (Salaries Dr 1000 / Withholding Cr 1000, BatchDocumentNo set) -> ONE batch, ONE journal, TWO lines; rows Y with the three ids; line amounts and totals (journal and batch) copied; the answer logs 0 errors / 1 / 1 / 2.
//   NODA    the import leaves batch and journal Drafted with no Fact_Acct (legacy never completes).
//   CO      Complete (DocAction CO) of the batch: batch, journal CO; Fact_Acct rows: DR == CR (independent SQL oracle), per account == the imported rows (the posted books follow the import).
//   GROUP   rows sharing BatchDocumentNo+JournalDocumentNo -> one journal; another JournalDocumentNo -> a second journal in the SAME batch; another BatchDocumentNo -> a second batch; another DateAcct day -> a second journal (:714-722).
//   DIM     a line with a BPartnerValue (no combination given) -> MAccount.get CREATES the valid combination carrying the partner; a second line with the same dimensions REUSES it; a given C_ValidCombination_ID is used as is (:774-799).
//   FX      a EUR journal: CurrencyRate from C_Conversion_Rate (:301-312), AmtAcct = ROUND(AmtSource x rate, 2) (:555-566), Complete posts the accounted amounts balanced.
//   ERR     legacy I_ErrorMsg text per failing row (IsImportOnlyNoErrors=N), a good row of the same run is still imported: Invalid Account (:409), Invalid Category (:218), Invalid DocType (:201), Invalid Period (:333), Invalid BPartner (:425),
//           Invalid Currency (:241), Invalid PostingType (:361), Invalid Product (:442), No Rate (:313); WARN=Zero Source Balance (:546) is appended and the row still imports.
//   UNBAL   an unbalanced imported journal is NOT refused by the import (legacy imports it) but (UseSuspenseBalancing=N) its Complete is refused with "@UnbalancedJornal@" (MJournal.prepareIt) - status IN, no Fact_Acct.
//   REFUSE  default IsImportOnlyNoErrors=Y: one bad row refuses the whole run with "@Errors@=1", the good row is NOT imported (:621-625); the unpersisted marks are printed as PROC-UNPORTED (named twin seam).
//   VALONLY IsValidateOnly=Y with no errors answers "@Errors@=0" and imports nothing (:626-629).
//   RERUN   a second run makes nothing new (the Y rows are not read again, :649).
//   DELOLD  DeleteOldImported=Y removes the imported rows (:108-115) and nothing else.
// Every check names the issue it proves; INCONCLUSIVE when nothing was judged. Command: node erp/tests/witness_import_gljournal.js 2>&1 | tee /tmp/count_logs/import_gljournal.log   (IMPORT_MUTANTS=1 for the mutant sweep)
'use strict';
var fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
if (!global.window) global.window = {};
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
var ERP = process.env.IGLJ_ERP || path.join(__dirname, '..'), SQLJS_DIR = process.env.SQLJS_DIR || '/home/red1/bim-ootb/tests/node_modules/sql.js', MUTANT = process.env.IGLJ_MUTANT || '';
if (!process.env.SQLJS) process.env.SQLJS = SQLJS_DIR;
var initSqlJs = require(SQLJS_DIR), _log = console.log, SEEN = [];
console.log = function () { SEEN.push(Array.prototype.join.call(arguments, ' ')); };
function say(s) { _log(s); }
var CASES = {}, ALL = { judged: 0, failed: 0 };
function check(cs, key, rule, ok, info) { var c = CASES[cs] = CASES[cs] || { judged: 0, failed: 0 }; c.judged++; ALL.judged++; if (!ok) { c.failed++; ALL.failed++; } say('  §IGLJ-CHECK case=' + cs + ' key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' rule="' + rule + '"' + (ok ? '' : ' got=' + JSON.stringify(info))); }
function verdict(cs) { var c = CASES[cs] || { judged: 0, failed: 0 }; say('§IGLJ-' + cs + ' verdict=' + (!c.judged ? 'INCONCLUSIVE' : c.failed ? 'FAIL' : 'PASS') + ' judged=' + c.judged + ' failed=' + c.failed + (MUTANT ? ' mutant=' + MUTANT : '')); }
function guard(cs, key, rule, fn) { try { fn(); } catch (e) { check(cs, key, rule, false, 'threw: ' + (e && (e.stack || e.message) || String(e))); } }
var J = JSON.stringify;
(async function main() {
  var SQL = await initSqlJs({ locateFile: function (f) { return path.join(SQLJS_DIR, 'dist', f); } });
  var db = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(ERP, 'ad_seed.db'))));
  fs.readFileSync(path.join(ERP, 'patches/ad_seed.db.sql'), 'utf8').split(/;\s*\n/).forEach(function (st) { st = st.replace(/^\s*--[^\n]*\n?/gm, '').trim(); if (!st) return; try { db.run(st); } catch (e) { /* patch statement */ } });
  function q0(sql, params) { var st = db.prepare(sql), out = []; try { if (params && params.length) st.bind(params); while (st.step()) { var o = st.getAsObject(), r = {}; for (var k in o) r[k.toLowerCase()] = o[k]; out.push(r); } } finally { st.free(); } return out; }
  var AIT = require(path.join(ERP, 'ad_import_tables.js')), AR = require(path.join(ERP, 'ad_rule.js'));
  say('§IGLJ-LOAD erp=' + ERP + ' mutant=' + (MUTANT || 'none'));
  // ═══ TABLE ═══
  var dict = q0("SELECT lower(c.columnname) AS c FROM ad_column c WHERE c.ad_table_id=599 AND c.isactive='Y'").map(function (r) { return r.c; }).sort();
  check('TABLE', 'seed-gap', 'the seed has the 70 I_GLJournal dictionary columns but NO physical i_gljournal table', dict.length === 70 && q0("SELECT name FROM sqlite_master WHERE name='i_gljournal'").length === 0, { dict: dict.length });
  var n1 = AIT.ensure(db), n2 = AIT.ensure(db), phys = q0('PRAGMA table_info(i_gljournal)').map(function (r) { return String(r.name).toLowerCase(); }).sort();
  check('TABLE', 'ensure', 'ensure(db) still reports the three older import tables (3 then 0) and creates i_gljournal whose physical columns == the 70 dictionary columns', n1 === 3 && n2 === 0 && J(phys) === J(dict), { n1: n1, n2: n2, phys: phys.length });
  check('TABLE', 'wiring', 'ws_kernel.js boots the import tables (a host that never calls AdImportTables.ensure has no I_GLJournal)', /require\('\.\/ad_import_tables\.js'\)\.ensure\(db\)/.test(fs.readFileSync(path.join(ERP, 'ws_kernel.js'), 'utf8')), {});
  AR.ensure(db);
  var K = require(path.join(ERP, 'ws_kernel.js')), k = K.build(db), ML = k.ML, AP = require(path.join(ERP, 'ad_process.js'));
  require(path.join(ERP, 'model_journal.js'));
  var S = { clientId: 11, orgId: 11, userId: 100, roleId: 102, warehouseId: 103, actor: 'witness:import-gljournal' };
  function one(sql, p) { return k.q(sql, p || [])[0] || null; }
  function commit(fn, meta) { var trx = new ML.Trx(k.q, Object.assign(k.env(S), { date: T1 })), r; try { r = fn(trx, ML) || { ok: true }; } catch (ex) { r = { ok: false, error: 'model threw: ' + (ex && ex.message) }; trx.say('§MODEL-ERR ' + (ex && ex.stack || ex)); } var ok = r.ok !== false, ops = ok ? trx.groupOps() : [], ids = []; if (ok && ops.length) ids = k.commit(S, ops, meta); return Object.assign({}, r, { ok: ok, ops: ops, ids: ids, log: trx.log }); }
  function declare(rows) { return commit(function (trx) { for (var i = 0; i < rows.length; i++) { var sv = ML.save(trx, 'i_gljournal', null, ML.newPO(trx, 'i_gljournal', rows[i])); if (!sv.ok) return { ok: false, error: sv.error }; } return { ok: true }; }); }
  var SHIPPED = [];
  function run(params, tag) { var r = commit(function (trx) { var r0 = AP.runInTrx(trx, 220, { params: params || {} }); return { ok: r0.ok, r: r0, error: r0.summary }; }, { ws: 'import_gljournal', tag: tag }); (r.log || []).forEach(function (l) { if (/^§(IMPORT_GLJOURNAL|PROC-)/.test(l)) SHIPPED.push(l); });
    var logs = (r.r && r.r.logs) || [], num = function (m) { return (logs.filter(function (x) { return x.msg === m; })[0] || {}).number; };
    return { res: r, summary: r.r && r.r.summary, errors: num('@Errors@'), batches: num('@GL_JournalBatch_ID@: @Inserted@'), journals: num('@GL_Journal_ID@: @Inserted@'), lines: num('@GL_JournalLine_ID@: @Inserted@'), logs: logs, log: r.log || [] }; }
  function doc(table, id, action) { return commit(function (trx) { var r0 = ML.processIt(trx, table, id, action); return { ok: r0.ok, r: r0, status: r0.status, error: r0.msg }; }, { ws: 'gl_doc', tag: table + id + action }); }
  function purge(tag) { return commit(function (trx) { trx.find('i_gljournal', {}).filter(function (r) { return String(r.description).indexOf(tag) === 0 && r.i_isimported !== 'Y'; }).forEach(function (r) { trx.del('i_gljournal', r); }); return { ok: true }; }); }   // the rows an error case leaves N would refuse every later default run (legacy does the same: the user fixes or deletes them)
  var irow = function (tag) { return k.q('SELECT * FROM i_gljournal WHERE description=? ORDER BY i_gljournal_id', [tag]); };
  var facts = function (jid) { return k.q('SELECT account_id, SUM(amtacctdr) AS dr, SUM(amtacctcr) AS cr, COUNT(*) AS n FROM fact_acct WHERE ad_table_id=224 AND record_id=? GROUP BY account_id ORDER BY account_id', [jid]); };
  var A1 = '60130', A2 = '22250', EV1 = 451, EV2 = 608, T1 = '2006-11-15 00:00:00', T2 = '2006-11-16 00:00:00';
  var row = function (tag, extra) { return Object.assign({ i_isimported: 'N', ad_orgdoc_id: 11, doctypename: 'GL Journal', categoryname: 'Manual', description: tag, dateacct: T1, accountvalue: A1, amtsourcedr: 0, amtsourcecr: 0, ad_org_id: 11 }, extra || {}); };
  var BASE = { AD_Client_ID: 11, AD_Org_ID: 11 }, NOERR = Object.assign({ IsImportOnlyNoErrors: 'N' }, BASE);
  say('§IGLJ-FIXTURE dr=' + J(one('SELECT c_elementvalue_id AS id, value, postactual, isdoccontrolled FROM c_elementvalue WHERE c_elementvalue_id=?', [EV1])) + ' cr=' + J(one('SELECT c_elementvalue_id AS id, value, postactual, isdoccontrolled FROM c_elementvalue WHERE c_elementvalue_id=?', [EV2])) + ' period=' + J(one("SELECT c_period_id, name FROM c_period WHERE ad_client_id=11 AND date('2006-11-15') BETWEEN date(startdate) AND date(enddate)")));

  // ═══ P0 ═══
  check('P0', 'registered', 'AD_Process 220 resolves to org.compiere.process.ImportGLJournal (registered by erp/processes/ImportGLJournal.js)', !!AP.JAVA['org.compiere.process.ImportGLJournal'] && one('SELECT classname FROM ad_process WHERE ad_process_id=220').classname === 'org.compiere.process.ImportGLJournal', {});
  guard('P0', 'x-of-n', 'X of N: every AD_Process_Para name of 220 is read by the port\'s prepare()', function () {
    var names = k.q("SELECT columnname AS c FROM ad_process_para WHERE ad_process_id=220 AND isactive='Y'").map(function (r) { return r.c; }), src = fs.readFileSync(path.join(ERP, 'processes/ImportGLJournal.js'), 'utf8');
    var used = names.filter(function (n) { return src.indexOf("name === '" + n + "'") >= 0; });
    check('P0', 'x-of-n', 'dictionary parameters ' + J(names) + ' X=' + used.length + ' of N=' + names.length, names.length === 7 && used.length === 7, { names: names, used: used }); });
  var html = fs.readFileSync(path.join(ERP, 'idempiere.html'), 'utf8'), sw = fs.readFileSync(path.join(ERP, 'sw.js'), 'utf8');
  check('P0', 'html-sw', 'idempiere.html loads and sw.js precaches processes/ImportGLJournal.js AND model_journal.js (the GL Journal DocAction)', /processes\/ImportGLJournal\.js/.test(html) && /processes\/ImportGLJournal\.js/.test(sw) && /model_journal\.js/.test(html) && /model_journal\.js/.test(sw), {});
  check('P0', 'docaction', 'model_journal.js registers a DocAction class for gl_journal AND gl_journalbatch (before it: "no DocAction class registered for gl_journal", measured)', !!ML.docActionFor('gl_journal') && !!ML.docActionFor('gl_journalbatch'), {});
  verdict('TABLE'); verdict('P0');

  // ═══ BAL / NODA / CO ═══
  var BALJ = null;
  guard('BAL', 'balanced', 'a balanced 2-line journal imports as ONE batch, ONE journal, TWO lines; rows Y with ids; lines copy account/amounts; totals 1000/1000', function () {
    var d = declare([row('IGLJ-A', { batchdocumentno: 'IGLJ-B-A', journaldocumentno: 'IGLJ-J-A', line: 10, amtsourcedr: 1000 }), row('IGLJ-A', { batchdocumentno: 'IGLJ-B-A', journaldocumentno: 'IGLJ-J-A', line: 20, accountvalue: A2, amtsourcecr: 1000 })]);
    var r = run(BASE, 'A'), rs = irow('IGLJ-A'), r1 = rs[0] || {}, r2 = rs[1] || {};
    var jr = r1.gl_journal_id ? one('SELECT * FROM gl_journal WHERE gl_journal_id=?', [r1.gl_journal_id]) : null, br = r1.gl_journalbatch_id ? one('SELECT * FROM gl_journalbatch WHERE gl_journalbatch_id=?', [r1.gl_journalbatch_id]) : null;
    var ls = jr ? k.q('SELECT l.*, vc.account_id AS acc FROM gl_journalline l JOIN c_validcombination vc ON vc.c_validcombination_id=l.c_validcombination_id WHERE l.gl_journal_id=? ORDER BY l.line', [jr.gl_journal_id]) : [];
    BALJ = jr; if (process.env.IGLJ_DEBUG) say('DEBUG batch=' + J(br) + ' journal=' + J(jr));
    check('BAL', 'declare', 'fixture: the two rows were declared and the run was accepted', d.ok && r.res.ok, { declare: d.error, summary: r.summary });
    check('BAL', 'row-state', 'both rows I_IsImported=Y, Processed=Y with the SAME batch and journal and DIFFERENT line ids; the answer logs 0 errors / 1 batch / 1 journal / 2 lines (:839-843)',
      r1.i_isimported === 'Y' && r2.i_isimported === 'Y' && r1.processed === 'Y' && !!r1.gl_journalbatch_id && r1.gl_journalbatch_id === r2.gl_journalbatch_id && r1.gl_journal_id === r2.gl_journal_id && !!r1.gl_journalline_id && r1.gl_journalline_id !== r2.gl_journalline_id
      && Number(r.errors) === 0 && Number(r.batches) === 1 && Number(r.journals) === 1 && Number(r.lines) === 2, { r1: [r1.i_isimported, r1.gl_journalbatch_id, r1.gl_journal_id, r1.gl_journalline_id], r2: [r2.i_isimported, r2.gl_journalline_id], ans: [r.errors, r.batches, r.journals, r.lines], msg: r1.i_errormsg });
    check('BAL', 'header', 'the journal is Drafted, Actual, schema 101, doctype 115, category 108, batch-linked, with the legacy numbers and the period Nov-06 (206, open for GLJ); the batch description is "*Import-<timestamp>" (:691-697)',
      !!jr && jr.docstatus === 'DR' && jr.postingtype === 'A' && Number(jr.c_acctschema_id) === 101 && Number(jr.c_doctype_id) === 115 && Number(jr.gl_category_id) === 108 && Number(jr.c_period_id) === 206 && Number(jr.gl_journalbatch_id) === Number(r1.gl_journalbatch_id)
      && !!br && /^\*Import-\d{4}-\d{2}-\d{2} /.test(br.description) && br.documentno === 'IGLJ-B-A' && jr.documentno === 'IGLJ-J-A', { jr: jr && [jr.docstatus, jr.c_period_id, jr.documentno, jr.gl_category_id], br: br && [br.description, br.documentno] });
    check('BAL', 'lines', 'line 10 is Salaries (' + EV1 + ') Dr 1000 / line 20 Withholding (' + EV2 + ') Cr 1000, AmtAcct = AmtSource at rate 1, copied from the rows',
      ls.length === 2 && Number(ls[0].acc) === EV1 && Number(ls[0].amtsourcedr) === 1000 && Number(ls[0].amtacctdr) === 1000 && Number(ls[0].amtacctcr) === 0 && Number(ls[1].acc) === EV2 && Number(ls[1].amtsourcecr) === 1000 && Number(ls[1].amtacctcr) === 1000 && Number(ls[1].amtacctdr) === 0, { ls: ls.map(function (l) { return [l.line, l.acc, l.amtsourcedr, l.amtsourcecr, l.amtacctdr, l.amtacctcr]; }) });
    check('BAL', 'totals', 'journal and batch TotalDr/TotalCr = 1000/1000 (MJournalLine.afterSave updateJournalTotal)', !!jr && Number(jr.totaldr) === 1000 && Number(jr.totalcr) === 1000 && !!br && Number(br.totaldr) === 1000 && Number(br.totalcr) === 1000, { jr: jr && [jr.totaldr, jr.totalcr], br: br && [br.totaldr, br.totalcr] });
  }); verdict('BAL');
  guard('NODA', 'draft', 'the import leaves the batch and the journal Drafted with NO Fact_Acct (legacy ImportGLJournal never completes; there is no DocAction parameter)', function () {
    check('NODA', 'draft', 'journal DR, batch DR, Fact_Acct rows = 0', !!BALJ && BALJ.docstatus === 'DR' && one('SELECT docstatus FROM gl_journalbatch WHERE gl_journalbatch_id=?', [BALJ.gl_journalbatch_id]).docstatus === 'DR' && facts(BALJ.gl_journal_id).length === 0, { facts: BALJ && facts(BALJ.gl_journal_id).length }); }); verdict('NODA');
  guard('CO', 'complete', 'Complete (DocAction CO) of the imported batch completes batch and journal and the books follow: Fact_Acct DR == CR, per account == the imported rows', function () {
    var d = doc('gl_journalbatch', BALJ.gl_journalbatch_id, 'CO'), jr = one('SELECT * FROM gl_journal WHERE gl_journal_id=?', [BALJ.gl_journal_id]), br = one('SELECT * FROM gl_journalbatch WHERE gl_journalbatch_id=?', [BALJ.gl_journalbatch_id]), f = facts(BALJ.gl_journal_id);
    var tdr = f.reduce(function (a, x) { return a + Number(x.dr); }, 0), tcr = f.reduce(function (a, x) { return a + Number(x.cr); }, 0), byAcc = {}; f.forEach(function (x) { byAcc[x.account_id] = x; });
    check('CO', 'status', 'the batch answered ok, batch CO / processed Y, journal CO / processed Y / posted Y (the document engine posts after CO)', d.ok && br.docstatus === 'CO' && br.processed === 'Y' && jr.docstatus === 'CO' && jr.processed === 'Y' && jr.posted === 'Y', { ok: d.ok, msg: d.error, br: br && [br.docstatus, br.processed], jr: jr && [jr.docstatus, jr.processed, jr.posted] });
    check('CO', 'fact-balanced', 'Fact_Acct of the journal: DR total == CR total == 1000 over 2 rows (independent SQL oracle on fact_acct, ad_table_id 224)', f.length === 2 && tdr === 1000 && tcr === 1000, { f: f, tdr: tdr, tcr: tcr });
    check('CO', 'fact-per-account', 'per account: Salaries ' + EV1 + ' DR 1000 / CR 0 and Withholding ' + EV2 + ' DR 0 / CR 1000 == the imported rows', !!byAcc[EV1] && Number(byAcc[EV1].dr) === 1000 && Number(byAcc[EV1].cr) === 0 && !!byAcc[EV2] && Number(byAcc[EV2].cr) === 1000 && Number(byAcc[EV2].dr) === 0, { byAcc: byAcc });
    var d2 = doc('gl_journalbatch', BALJ.gl_journalbatch_id, 'CO'), f2 = facts(BALJ.gl_journal_id);
    check('CO', 'no-double-post', 'completing the batch again does not post twice (Fact_Acct still 2 rows)', f2.length === 2 && Number(f2[0].n) + Number(f2[1].n) === 2, { f2: f2, again: d2.error }); }); verdict('CO');

  // ═══ GROUP ═══
  guard('GROUP', 'break', 'journal/batch breaks: same Batch+Journal no -> one journal; other Journal no -> second journal in the SAME batch; other Batch no -> second batch', function () {
    var rows = [row('IGLJ-G', { batchdocumentno: 'IGLJ-B-G1', journaldocumentno: 'IGLJ-J-G1', line: 10, amtsourcedr: 10 }), row('IGLJ-G', { batchdocumentno: 'IGLJ-B-G1', journaldocumentno: 'IGLJ-J-G1', line: 20, accountvalue: A2, amtsourcecr: 10 }),
      row('IGLJ-G', { batchdocumentno: 'IGLJ-B-G1', journaldocumentno: 'IGLJ-J-G2', line: 10, amtsourcedr: 20 }), row('IGLJ-G', { batchdocumentno: 'IGLJ-B-G1', journaldocumentno: 'IGLJ-J-G2', line: 20, accountvalue: A2, amtsourcecr: 20 }),
      row('IGLJ-G', { batchdocumentno: 'IGLJ-B-G2', journaldocumentno: 'IGLJ-J-G3', line: 10, amtsourcedr: 30 }), row('IGLJ-G', { batchdocumentno: 'IGLJ-B-G2', journaldocumentno: 'IGLJ-J-G3', line: 20, accountvalue: A2, amtsourcecr: 30 })];
    declare(rows); var r = run(BASE, 'G'), rs = irow('IGLJ-G'), by = function (jn) { return rs.filter(function (x) { return x.journaldocumentno === jn; }); };
    if (process.env.IGLJ_DEBUG) say('DEBUG group ' + J(rs.map(function (x) { return [x.line, x.dateacct, x.i_isimported, x.i_errormsg]; })));
    var bat = {}; rs.forEach(function (x) { bat[x.batchdocumentno] = bat[x.batchdocumentno] || {}; bat[x.batchdocumentno][x.gl_journalbatch_id] = 1; });
    var jids = {}; rs.forEach(function (x) { jids[x.gl_journal_id] = 1; });
    check('GROUP', 'counts', 'answer: 2 batches / 3 journals (G1, G2 in batch 1; G3 in batch 2) / 6 lines; 0 errors', Number(r.batches) === 2 && Number(r.journals) === 3 && Number(r.lines) === 6 && Number(r.errors) === 0, { ans: [r.batches, r.journals, r.lines, r.errors], sum: r.summary });
    check('GROUP', 'same-journal', 'the two rows of IGLJ-J-G1 share ONE journal id and IGLJ-J-G2 has ANOTHER, both in the SAME batch id', by('IGLJ-J-G1').length === 2 && by('IGLJ-J-G1')[0].gl_journal_id === by('IGLJ-J-G1')[1].gl_journal_id && by('IGLJ-J-G1')[0].gl_journal_id !== by('IGLJ-J-G2')[0].gl_journal_id && by('IGLJ-J-G1')[0].gl_journalbatch_id === by('IGLJ-J-G2')[0].gl_journalbatch_id, {});
    check('GROUP', 'two-batches', 'BatchDocumentNo G1 and G2 map to two DIFFERENT batches, each ONE id', Object.keys(bat['IGLJ-B-G1'] || {}).length === 1 && Object.keys(bat['IGLJ-B-G2'] || {}).length === 1 && Object.keys(bat['IGLJ-B-G1'])[0] !== Object.keys(bat['IGLJ-B-G2'])[0], { bat: bat });
    check('GROUP', 'three-journals', 'six rows -> exactly 3 distinct journal ids (one per Journal no)', Object.keys(jids).length === 3, { n: Object.keys(jids).length }); }); verdict('GROUP');
  guard('DUPNO', 'unique', 'the SAME Journal no with another DateAcct day opens a second journal (:714-722), which the database refuses (unique index gl_journal_docno): first journal imported, the rest stays N, SEVERE logged, nothing thrown', function () {
    declare([row('IGLJ-DN', { batchdocumentno: 'IGLJ-B-DN', journaldocumentno: 'IGLJ-J-DN', line: 10, amtsourcedr: 4 }), row('IGLJ-DN', { batchdocumentno: 'IGLJ-B-DN', journaldocumentno: 'IGLJ-J-DN', line: 20, accountvalue: A2, amtsourcecr: 4 }),
      row('IGLJ-DN', { batchdocumentno: 'IGLJ-B-DN', journaldocumentno: 'IGLJ-J-DN', line: 30, dateacct: T2, amtsourcedr: 4 })]);
    var r = run(BASE, 'DN'), rs = irow('IGLJ-DN');
    check('DUPNO', 'unique', 'rows 10/20 Y in one journal, row 30 (DateAcct ' + T2.slice(0, 10) + ') stays N with no journal; the answer logs 1 journal / 2 lines; the log names the refusal', rs[0].i_isimported === 'Y' && rs[1].i_isimported === 'Y' && rs[2].i_isimported === 'N' && !rs[2].gl_journal_id && Number(r.journals) === 1 && Number(r.lines) === 2 && r.log.some(function (l) { return /SEVERE.*gl_journal_docno/.test(l); }), { rows: rs.map(function (x) { return [x.line, x.i_isimported]; }), ans: [r.journals, r.lines] });
    purge('IGLJ-DN'); }); verdict('DUPNO');


  // ═══ DIM ═══
  guard('DIM', 'combination', 'a BPartnerValue with no combination creates the valid combination carrying the partner; the same dimensions REUSE it; a given C_ValidCombination_ID is used as is', function () {
    var bp = one("SELECT c_bpartner_id AS id, value FROM c_bpartner WHERE ad_client_id=11 AND issummary='N' AND isactive='Y' ORDER BY c_bpartner_id"), nvc0 = one('SELECT COUNT(*) AS n FROM c_validcombination').n;
    declare([row('IGLJ-D', { batchdocumentno: 'IGLJ-B-D', journaldocumentno: 'IGLJ-J-D', line: 10, amtsourcedr: 5, bpartnervalue: bp.value }), row('IGLJ-D', { batchdocumentno: 'IGLJ-B-D', journaldocumentno: 'IGLJ-J-D', line: 20, amtsourcedr: 6, bpartnervalue: bp.value }),
      row('IGLJ-D', { batchdocumentno: 'IGLJ-B-D', journaldocumentno: 'IGLJ-J-D', line: 30, accountvalue: null, c_validcombination_id: 298, amtsourcecr: 11 })]);
    var r = run(BASE, 'D'), rs = irow('IGLJ-D'), nvc1 = one('SELECT COUNT(*) AS n FROM c_validcombination').n, vc = rs[0] && rs[0].c_validcombination_id ? one('SELECT * FROM c_validcombination WHERE c_validcombination_id=?', [rs[0].c_validcombination_id]) : null;
    var l3 = rs[2] && rs[2].gl_journalline_id ? one('SELECT c_validcombination_id FROM gl_journalline WHERE gl_journalline_id=?', [rs[2].gl_journalline_id]) : null;
    check('DIM', 'created-once', 'two lines with account ' + A1 + ' + partner ' + bp.value + ' -> exactly ONE new valid combination (' + nvc0 + ' -> ' + nvc1 + '), carrying account ' + EV1 + ' and partner ' + bp.id + ', used by BOTH lines',
      Number(r.lines) === 3 && nvc1 === nvc0 + 1 && !!vc && Number(vc.account_id) === EV1 && Number(vc.c_bpartner_id) === Number(bp.id) && rs[0].c_validcombination_id === rs[1].c_validcombination_id, { ans: [r.lines, r.errors], nvc: [nvc0, nvc1], vc: vc && [vc.account_id, vc.c_bpartner_id], ids: rs.map(function (x) { return x.c_validcombination_id; }), msg: rs.map(function (x) { return x.i_errormsg; }) });
    check('DIM', 'given', 'the row with C_ValidCombination_ID=298 and no AccountValue keeps 298 on its journal line (no account lookup, no new combination)', !!l3 && Number(l3.c_validcombination_id) === 298 && nvc1 === nvc0 + 1, { l3: l3 }); }); verdict('DIM');

  // ═══ ERR ═══
  guard('ERR', 'errors', 'each failing row gets legacy\'s text and ends N; a good row of the same run is imported; WARN=Zero Source Balance is appended and the row still imports', function () {
    declare([row('IGLJ-E-acct', { accountvalue: 'NO-SUCH-ACCT', amtsourcedr: 1 }), row('IGLJ-E-cat', { categoryname: 'No Such Category', amtsourcedr: 1 }), row('IGLJ-E-dt', { doctypename: 'No Such DocType', amtsourcedr: 1 }),
      row('IGLJ-E-per', { dateacct: '2040-01-15 00:00:00', amtsourcedr: 1 }), row('IGLJ-E-bp', { bpartnervalue: 'NO-SUCH-BP', amtsourcedr: 1 }), row('IGLJ-E-cur', { iso_code: 'ZZZ', amtsourcedr: 1 }),
      row('IGLJ-E-pt', { postingtype: 'X', amtsourcedr: 1 }), row('IGLJ-E-prod', { productvalue: 'NO-SUCH-PRODUCT', amtsourcedr: 1 }), row('IGLJ-E-rate', { iso_code: 'JPY', amtsourcedr: 1 }),
      row('IGLJ-E-good', { batchdocumentno: 'IGLJ-B-E', journaldocumentno: 'IGLJ-J-E', line: 10, amtsourcedr: 7 }), row('IGLJ-E-good', { batchdocumentno: 'IGLJ-B-E', journaldocumentno: 'IGLJ-J-E', line: 20, accountvalue: A2, amtsourcecr: 7 }),
      row('IGLJ-E-zero', { batchdocumentno: 'IGLJ-B-E', journaldocumentno: 'IGLJ-J-E', line: 30 })]);
    var r = run(NOERR, 'E'), t = function (tag) { return irow(tag)[0] || {}; };
    var want = { 'IGLJ-E-acct': 'ERR=Invalid Account,', 'IGLJ-E-cat': 'ERR=Invalid Category,', 'IGLJ-E-dt': 'ERR=Invalid DocType,', 'IGLJ-E-per': 'ERR=Invalid Period,', 'IGLJ-E-bp': 'ERR=Invalid BPartner,', 'IGLJ-E-cur': 'ERR=Invalid Currency,', 'IGLJ-E-pt': 'ERR=Invalid PostingType,', 'IGLJ-E-prod': 'ERR=Invalid Product,', 'IGLJ-E-rate': 'ERR=No Rate,' };
    Object.keys(want).forEach(function (tag) { var x = t(tag); check('ERR', tag, tag + ' ends N with I_ErrorMsg containing "' + want[tag] + '" and no journal', x.i_isimported === 'N' && String(x.i_errormsg).indexOf(want[tag]) >= 0 && !x.gl_journal_id, [x.i_isimported, x.i_errormsg, x.gl_journal_id]); });
    var g = irow('IGLJ-E-good'), z = t('IGLJ-E-zero'); if (process.env.IGLJ_DEBUG) say('DEBUG err ' + J(k.q("SELECT description, i_isimported, i_errormsg FROM i_gljournal WHERE description LIKE 'IGLJ-E-%'")));
    check('ERR', 'good', 'the good pair of the same run is imported (rows Y, one shared journal) and the answer reports 9 errors / 1 batch / 1 journal / 4 lines (the zero row imports too)', g.length === 2 && g.every(function (x) { return x.i_isimported === 'Y' && x.gl_journal_id; }) && g[0].gl_journal_id === g[1].gl_journal_id && Number(r.errors) === 9 && Number(r.batches) === 1 && Number(r.journals) === 1 && Number(r.lines) === 3, { g: g.map(function (x) { return [x.i_isimported, x.i_errormsg]; }), ans: [r.errors, r.batches, r.journals, r.lines], sum: r.summary });
    check('ERR', 'zero-warn', 'the 0/0 row gets "WARN=Zero Source Balance," in I_ErrorMsg (a warning, not an error) and is still imported (:546-553)', z.i_isimported === 'Y' && String(z.i_errormsg).indexOf('WARN=Zero Source Balance,') >= 0, [z.i_isimported, z.i_errormsg]); purge('IGLJ-E-'); }); verdict('ERR');

  // ═══ FX ═══
  guard('FX', 'rate', 'a EUR journal takes the rate from C_Conversion_Rate (MAX(MultiplyRate) of the EUR->USD rows, :301-312) and books AmtAcct = ROUND(AmtSource x rate, 2); Complete posts the ACCOUNTED amounts balanced', function () {
    var rate = Number(one("SELECT MAX(multiplyrate) AS m FROM c_conversion_rate WHERE c_currency_id=102 AND c_currency_id_to=100 AND ad_client_id=11 AND date(?) BETWEEN date(validfrom) AND date(validto)", [T1]).m), want = Math.round(100 * rate * 100) / 100;
    declare([row('IGLJ-F', { batchdocumentno: 'IGLJ-B-F', journaldocumentno: 'IGLJ-J-F', line: 10, iso_code: 'EUR', amtsourcedr: 100 }), row('IGLJ-F', { batchdocumentno: 'IGLJ-B-F', journaldocumentno: 'IGLJ-J-F', line: 20, iso_code: 'EUR', accountvalue: A2, amtsourcecr: 100 })]);
    var r = run(BASE, 'F'), rs = irow('IGLJ-F'), jid = rs[0] && rs[0].gl_journal_id, ls = jid ? k.q('SELECT * FROM gl_journalline WHERE gl_journal_id=? ORDER BY line', [jid]) : [];
    check('FX', 'rate-and-acct', 'rows carry CurrencyRate=' + rate + ' and AmtAcct=' + want + '; the lines book Source 100 EUR = Acct ' + want + ' USD', rs.length === 2 && rs.every(function (x) { return x.i_isimported === 'Y' && Number(x.currencyrate) === rate; }) && Number(rs[0].amtacctdr) === want && Number(rs[1].amtacctcr) === want
      && ls.length === 2 && Number(ls[0].amtsourcedr) === 100 && Number(ls[0].amtacctdr) === want && Number(ls[1].amtsourcecr) === 100 && Number(ls[1].amtacctcr) === want, { rate: rate, want: want, rows: rs.map(function (x) { return [x.i_isimported, x.currencyrate, x.amtacctdr, x.amtacctcr, x.i_errormsg]; }), ls: ls.map(function (l) { return [l.amtsourcedr, l.amtacctdr, l.amtsourcecr, l.amtacctcr, l.currencyrate]; }), ans: [r.errors, r.lines] });
    var d = doc('gl_journal', jid, 'CO'), f = facts(jid), tdr = f.reduce(function (a, x) { return a + Number(x.dr); }, 0), tcr = f.reduce(function (a, x) { return a + Number(x.cr); }, 0);
    var act = Number(one("SELECT multiplyrate AS m FROM c_conversion_rate WHERE c_currency_id=102 AND c_currency_id_to=100 AND ad_client_id=11 AND isactive='Y' AND date(?) BETWEEN date(validfrom) AND date(validto) ORDER BY validfrom DESC", [T1]).m), wantFact = Math.round(100 * act * 100) / 100;
    say('§IGLJ-NOTE FX legacy pair, both ports faithful to their Java: the IMPORT takes MAX(MultiplyRate) over ALL rate rows incl. inactive (:301-312, rate ' + rate + ' -> AmtAcct ' + want + '); the POSTING (Doc_GLJournal -> FactLine.convert -> MConversionRate.getRate) uses ACTIVE rows only (rate ' + act + ' -> ' + wantFact + ')');
    check('FX', 'fact', 'Complete ok; Fact_Acct is balanced DR == CR == ' + wantFact + ' = the 100 EUR source at the ACTIVE rate ' + act + ' (independent SQL oracle on c_conversion_rate), as the existing Doc_GLJournal posts it', d.ok && f.length === 2 && Math.abs(tdr - wantFact) < 1e-9 && Math.abs(tcr - wantFact) < 1e-9, { ok: d.ok, msg: d.error, f: f }); }); verdict('FX');

  // ═══ UNBAL ═══
  guard('UNBAL', 'prepare', 'an unbalanced journal (one Dr line) is imported by legacy; with UseSuspenseBalancing=N its Complete is refused with "@UnbalancedJornal@" - status IN, no Fact_Acct', function () {
    declare([row('IGLJ-U', { batchdocumentno: 'IGLJ-B-U', journaldocumentno: 'IGLJ-J-U', line: 10, amtsourcedr: 500 })]); var r = run(BASE, 'U'), ir = irow('IGLJ-U')[0] || {};
    var sus = one('SELECT usesuspensebalancing AS u FROM c_acctschema_gl WHERE c_acctschema_id=101').u;
    db.run("UPDATE c_acctschema_gl SET usesuspensebalancing='N' WHERE c_acctschema_id=101");                  // the tenant fixture: no suspense balancing (with it MJournal.prepareIt lets an unbalanced journal through, :549-557)
    var d = doc('gl_journal', ir.gl_journal_id, 'CO'), jr = one('SELECT docstatus FROM gl_journal WHERE gl_journal_id=?', [ir.gl_journal_id]);
    db.run("UPDATE c_acctschema_gl SET usesuspensebalancing='" + sus + "' WHERE c_acctschema_id=101");
    check('UNBAL', 'imported', 'the unbalanced row IS imported (the import checks no balance, :577-614 only reports it): Y with a journal', ir.i_isimported === 'Y' && !!ir.gl_journal_id, { ir: [ir.i_isimported, ir.i_errormsg], sum: r.summary });
    check('UNBAL', 'refused', 'Complete is refused: not ok, message @UnbalancedJornal@, the engine answers status IN (a refused run commits nothing, so the stored row stays DR), Fact_Acct 0', !d.ok && /@UnbalancedJornal@/.test(String(d.error)) && d.status === 'IN' && jr.docstatus === 'DR' && facts(ir.gl_journal_id).length === 0, { ok: d.ok, msg: d.error, st: d.status, db: jr && jr.docstatus, facts: facts(ir.gl_journal_id).length }); }); verdict('UNBAL');

  // ═══ REFUSE / VALONLY ═══
  guard('REFUSE', 'errors', 'default IsImportOnlyNoErrors=Y: one bad row refuses the WHOLE run with "@Errors@=1"; the good row is not imported; the unpersisted marks are a printed PROC-UNPORTED', function () {
    declare([row('IGLJ-R-bad', { accountvalue: 'NO-SUCH-ACCT', amtsourcedr: 1 }), row('IGLJ-R-good', { batchdocumentno: 'IGLJ-B-R', journaldocumentno: 'IGLJ-J-R', line: 10, amtsourcedr: 3 }), row('IGLJ-R-good', { batchdocumentno: 'IGLJ-B-R', journaldocumentno: 'IGLJ-J-R', line: 20, accountvalue: A2, amtsourcecr: 3 })]);
    var b0 = one('SELECT COUNT(*) AS n FROM gl_journalbatch').n, r = run(BASE, 'R'), g = irow('IGLJ-R-good');
    check('REFUSE', 'refused', 'the run fails, the summary says Errors=1 (the message @Errors@=1 translated), the good rows stay N, no batch is created', !r.res.ok && /Errors=1/.test(String(r.summary)) && g.every(function (x) { return x.i_isimported === 'N'; }) && one('SELECT COUNT(*) AS n FROM gl_journalbatch').n === b0, { ok: r.res.ok, sum: r.summary, g: g.map(function (x) { return x.i_isimported; }) });
    check('REFUSE', 'named-seam', 'the commitEx-before-refusal divergence is NAMED in the log (PROC-UNPORTED ImportGLJournal commitEx)', r.log.some(function (l) { return /PROC-UNPORTED ImportGLJournal commitEx/.test(l); }), r.log.filter(function (l) { return /PROC-/.test(l); }).slice(0, 3));
    purge('IGLJ-R-bad'); run(BASE, 'R2'); }); verdict('REFUSE');
  guard('VALONLY', 'validate', 'IsValidateOnly=Y with no errors answers "@Errors@=0" and imports nothing', function () {
    declare([row('IGLJ-V', { batchdocumentno: 'IGLJ-B-V', journaldocumentno: 'IGLJ-J-V', line: 10, amtsourcedr: 2 }), row('IGLJ-V', { batchdocumentno: 'IGLJ-B-V', journaldocumentno: 'IGLJ-J-V', line: 20, accountvalue: A2, amtsourcecr: 2 })]);
    var b0 = one('SELECT COUNT(*) AS n FROM gl_journalbatch').n, r = run(Object.assign({ IsValidateOnly: 'Y' }, BASE), 'V'), v = irow('IGLJ-V');
    check('VALONLY', 'validate', 'summary Errors=0 (@Errors@=0 translated), rows still N, no batch created', r.res.ok && /Errors=0/.test(String(r.summary)) && v.every(function (x) { return x.i_isimported === 'N'; }) && one('SELECT COUNT(*) AS n FROM gl_journalbatch').n === b0, { ok: r.res.ok, sum: r.summary, v: v.map(function (x) { return x.i_isimported; }) });
    run(BASE, 'V2'); }); verdict('VALONLY');

  // ═══ RERUN / DELOLD ═══
  guard('RERUN', 'nothing-new', 'a second run makes nothing new', function () {
    var b0 = one('SELECT COUNT(*) AS n FROM gl_journalbatch').n, j0 = one('SELECT COUNT(*) AS n FROM gl_journal').n, l0 = one('SELECT COUNT(*) AS n FROM gl_journalline').n, r = run(BASE, 'RR');
    check('RERUN', 'nothing-new', 'batches, journals and lines unchanged; the answer logs 0 batches / 0 journals / 0 lines (the Y rows are not read again)', one('SELECT COUNT(*) AS n FROM gl_journalbatch').n === b0 && one('SELECT COUNT(*) AS n FROM gl_journal').n === j0 && one('SELECT COUNT(*) AS n FROM gl_journalline').n === l0 && Number(r.batches) === 0 && Number(r.journals) === 0 && Number(r.lines) === 0, { ans: [r.batches, r.journals, r.lines], sum: r.summary }); }); verdict('RERUN');
  guard('DELOLD', 'delete', 'DeleteOldImported=Y removes the imported rows (Y) and keeps the rest (the still-N rows)', function () {
    var y0 = one("SELECT COUNT(*) AS n FROM i_gljournal WHERE i_isimported='Y'").n, n0 = one("SELECT COUNT(*) AS n FROM i_gljournal WHERE i_isimported<>'Y'").n, r = run(Object.assign({ DeleteOldImported: 'Y', IsImportOnlyNoErrors: 'N' }, BASE), 'DEL');
    var y1 = one("SELECT COUNT(*) AS n FROM i_gljournal WHERE i_isimported='Y'").n, n1 = one("SELECT COUNT(*) AS n FROM i_gljournal WHERE i_isimported<>'Y'").n;
    check('DELOLD', 'delete', 'Y rows ' + y0 + ' -> 0 and the other rows kept (' + n0 + ' -> ' + n1 + ')', y0 > 0 && y1 === 0 && n1 === n0, { y: [y0, y1], n: [n0, n1], sum: r.summary }); }); verdict('DELOLD');

  var unk = SEEN.filter(function (l) { return /PROC-UNKNOWN-PARA ImportGLJournal/.test(l); });
  check('P0', 'no-unknown-para', 'no run printed §PROC-UNKNOWN-PARA', unk.length === 0, unk); verdict('P0');
  SHIPPED.filter(function (l) { return /SEVERE|PROC-SQL|PROC-UNPORTED/.test(l); }).slice(0, 14).forEach(function (l) { say('  ' + l.slice(0, 230)); });
  var all = !ALL.judged ? 'INCONCLUSIVE' : ALL.failed ? 'FAIL' : 'PASS', failedCases = Object.keys(CASES).filter(function (c) { return CASES[c].failed; });
  say('§IGLJ-RESULT verdict=' + all + ' judged=' + ALL.judged + ' failed=' + ALL.failed + ' failedCases=' + J(failedCases) + (MUTANT ? ' mutant=' + MUTANT : ''));
  var exitCode = all === 'PASS' ? 0 : 1;

  // ═══ mutants (IMPORT_MUTANTS=1, parent run only) ═══
  if (process.env.IMPORT_MUTANTS && !MUTANT) {
    var MUTS = []; try { MUTS = require('./witness_import_gljournal_mutants.js'); } catch (e) { say('§IGLJ-MUTANT-ERR no mutant table: ' + e.message); }
    var killed = 0, applied = 0, notApplied = [], crashed = [], survived = [], jobs = [];
    MUTS.forEach(function (m) {
      if (process.env.IGLJ_ONLY && !new RegExp(process.env.IGLJ_ONLY).test(m.name)) return;
      var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'igljmut_'));
      fs.readdirSync(ERP).forEach(function (f) { try { fs.symlinkSync(path.join(ERP, f), path.join(dir, f)); } catch (e) {} });
      fs.readdirSync(ERP).forEach(function (f) { var src = path.join(ERP, f), st = fs.statSync(src); if ((st.isFile() && /\.js$/.test(f)) || (st.isDirectory() && (f === 'callouts' || f === 'processes'))) { try { fs.unlinkSync(path.join(dir, f)); } catch (e) {} fs.cpSync(src, path.join(dir, f), { recursive: true }); } });
      var ok = true;
      m.edits.forEach(function (ed) {
        var src = fs.readFileSync(path.join(dir, ed.file), 'utf8'), want = ed.count || 1, have = src.split(ed.from).length - 1;
        if (have !== want) { ok = false; say('§IGLJ-MUTANT-EDIT ' + m.name + ' ' + ed.file + ' found ' + have + ' time(s), expected ' + want); return; }
        fs.writeFileSync(path.join(dir, ed.file), src.split(ed.from).join(ed.to));
      });
      if (!ok) { notApplied.push(m.name); say('§IGLJ-MUTANT ' + m.name + ' NOT-APPLIED (source text not found exactly as counted: the mutant proves nothing)'); try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} return; }
      applied++; jobs.push({ m: m, dir: dir });
    });
    await new Promise(function (resolve) {
      var next = 0, running = 0, POOL = Number(process.env.IGLJ_JOBS || 6);
      function pump() {
        while (running < POOL && next < jobs.length) (function (job) {
          running++;
          var child = cp.spawn(process.execPath, [__filename], { env: Object.assign({}, process.env, { IGLJ_ERP: job.dir, IGLJ_MUTANT: job.m.name, IMPORT_MUTANTS: '' }) }), out = '', timer = setTimeout(function () { child.kill('SIGKILL'); }, 600000);
          child.stdout.on('data', function (d) { out += d; }); child.stderr.on('data', function (d) { out += d; });
          child.on('close', function (code) {
            clearTimeout(timer); running--;
            var m = job.m, rl = out.split('\n').filter(function (l) { return /^§IGLJ-RESULT /.test(l); })[0], failedLines = out.split('\n').filter(function (l) { return /§IGLJ-CHECK .* FAIL /.test(l); });
            var hit = (m.kills || []).filter(function (kk) { return failedLines.some(function (l) { return l.indexOf('case=' + kk.split('.')[0] + ' key=' + kk.split('.')[1] + ' ') >= 0; }); });
            if (!rl) { crashed.push(m.name); say('§IGLJ-MUTANT ' + m.name + ' CRASHED (no verdict line; a crash is NOT a kill) exit=' + code + ' ' + out.split('\n').filter(function (l) { return /Error|error/.test(l); })[0]); }
            else if (/verdict=FAIL/.test(rl) && hit.length) { killed++; say('§IGLJ-MUTANT ' + m.name + ' KILLED by ' + hit.join(' | ') + ' :: ' + m.what); }
            else { survived.push(m.name); say('§IGLJ-MUTANT ' + m.name + ' SURVIVED verdict=' + (rl.match(/verdict=\w+/) || [''])[0] + ' expected to fail ' + (m.kills || []).join(' | ') + ' failedChecks=' + failedLines.length); }
            try { fs.rmSync(job.dir, { recursive: true, force: true }); } catch (e) {}
            if (next >= jobs.length && running === 0) resolve(); else pump();
          });
        })(jobs[next++]);
        if (!jobs.length) resolve();
      }
      pump();
    });
    var nSel = jobs.length + notApplied.length, mv = !MUTS.length ? 'INCONCLUSIVE' : (killed === nSel && !notApplied.length && !crashed.length && !survived.length) ? 'PASS' : 'FAIL';
    say('§IGLJ-MUTANTS verdict=' + mv + ' total=' + nSel + ' applied=' + applied + ' killed=' + killed + ' notApplied=' + J(notApplied) + ' crashed=' + J(crashed) + ' survived=' + J(survived));
    if (mv !== 'PASS') exitCode = 1;
  }
  process.exit(exitCode);
})().catch(function (e) { _log('§IGLJ-RESULT verdict=FAIL harness: ' + (e && e.stack)); process.exit(2); });
