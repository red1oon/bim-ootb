#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-IMPORT-INVOICE (bim-compiler prompts/MIGRATE_INSTALL_TENANT.md ENGINE-SPEC E3b + B3-SCOUT; CARDINAL RULE: the twin does what legacy iDempiere does).
//   READ THE LOG after every run: every verdict is a §IINV line, the exit code is not the evidence. A mutant that CRASHES is NOT a kill: it must print its own FAIL verdict.
// SPEC (the claims, written before the code; legacy file:line in the code comments of the pieces). Legacy: org.adempiere.base.process/src/org/compiere/process/ImportInvoice.java (815 lines), AD_Process 207 Import_Invoice.
//   TABLE  I_Invoice (AD_Table 598, 65 AD_Column rows) is in the shipped seed WITHOUT its physical table. erp/ad_import_tables.js ensureInvoice(db) (called by ensure) creates it as an idempotent BOOT OVERLAY, its physical
//          columns == the 65 dictionary columns, the team BASE hash is byte-identical (no hashed file touched), and the port is wired (idempiere.html script tag, sw.js precache, kernel + server boot ensure).
//   P0     PORT      AD_Process 207 resolves to a ported class org.compiere.process.ImportInvoice; X of N: every AD_Process_Para (4) is read by prepare() and no other; AD_Process_Para 207/DocAction defaults to PR (MEASURED);
//                    the two Opening Charges of the fixture and their accounts exist.
//   P2     OPEN INVOICES ON AN OPENING CHARGE (the cut-over method, B3-SCOUT): one AR (IsSOTrx=Y) and one AP (IsSOTrx=N) invoice, each declared as ONE I_Invoice row = ONE charge line (no product), only the UNPAID
//          amount, the invoice's own DocumentNo and date. DocAction CO -> ONE C_Invoice per row (DocumentNo copied, BP, ARI/API doc type by DocTypeName, dates), ONE line (charge, qty 1, price = amount, exempt tax),
//          Complete, the I_Invoice row Y with its invoice and line ids, Fact_Acct present + balanced in schema 101 with the charge's own account and the partner's receivable/liability account carrying the amount,
//          and the invoice is OPEN (IsPaid N, no allocation, open amount by an independent allocation oracle = the amount). ONE processIt per invoice, the whole import ONE op group, the shipped §-log names the run.
//   P3     GROUPING / PRICING / TAX: rows of one (BP, location, DocumentNo) become ONE invoice (lines 10/20/30), the same DocumentNo for another BP and another DocumentNo for the same BP do not merge; a product line
//          without a price is priced by line.setPrice() = PriceStd of the header's price list (independent M_ProductPrice oracle); a line without a tax gets one by line.setTax() and the tax is written back to the row;
//          the invoice's tax rows and grand total follow that tax's rate; the 3-line invoice posts balanced.
//   P4     ERR      legacy's exact I_ErrorMsg texts for Invalid Org / Invalid DocTypeName / No DocType / No Currency / Invalid Charge / Invalid Product / Product and Charge / Invalid Tax / Invalid Project / Invalid Activity /
//                   Invalid C_1099Box_Value / Invalid Country + No BPartner: the row ends I_IsImported=N with the text, no invoice, the good row of the same run is imported, the answer counts the errors; every expected text is
//                   a literal of ImportInvoice.java. UNPORTED: a BPartner that does not exist is NAMED (§PROC-UNPORTED + "ERR=Not ported: ..." + legacy's "ERR=No BPartner, "), never a silent skip.
//   P5     DOCACTION  an empty DocAction is NULL and the AD_Process_Para default PR applies (announced §PROC-PARAM); PR prepares the invoice (IP): no Fact_Acct, not posted.
//   P6     RESOLVE  BP from e-mail (+ contact), from contact name, the AD_ClientInfo cash BP when the row says nothing; DocTypeName alone decides doc type and IsSOTrx; the BP location is resolved from the BP.
//   P7     TRX / RESEND  declare + import in ONE caller transaction = ONE journal entry with links resolved; the same invoice re-declared is refused by the unique index and named (§IMPORT_INVOICE_COLLISION), still ONE
//                        completed invoice.
//   P8     RERUN / DEL  a second run makes nothing new; DeleteOldImported=Y deletes the imported rows and leaves the invoices.
//   NAMED twin infrastructure touched (each stated in the code): erp/model_invoice.js MInvoice_beforeSaveNew (MInvoice.beforeSave :1144-1283: currency / price list / payment term for a header saved by a process),
//   erp/model_post.js Doc_Invoice ARI: a charge line posts to C_Charge_Acct.Ch_Expense_Acct (DocLine.getAccount :447-461; before it AR posting of a charge line answered "not ported").
// Every check names the issue it proves; INCONCLUSIVE when nothing was judged. Mutants (IINV_MUTANTS=1): each rewrites the shipped source in a mirror of COPIES, proves the rewrite APPLIED exactly once, and the named
//   check must go FAIL in a child run that prints its verdict (a crash = "not killed").
// Command: node erp/tests/witness_import_invoice.js            (add IINV_MUTANTS=1 for the mutant sweep)
'use strict';
var fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process'), crypto = require('crypto');
if (!global.window) global.window = {};
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
var ERP = process.env.IINV_ERP || path.join(__dirname, '..');
var MUTANT = process.env.IINV_MUTANT || '';
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
  say('  §IINV-CHECK case=' + cs + ' key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' rule="' + rule + '"' + (ok ? '' : ' got=' + JSON.stringify(info)));
}
function verdict(cs) { var c = CASES[cs] || { judged: 0, failed: 0 }; var v = !c.judged ? 'INCONCLUSIVE' : c.failed ? 'FAIL' : 'PASS'; say('§IINV-' + cs + ' verdict=' + v + ' judged=' + c.judged + ' failed=' + c.failed + (MUTANT ? ' mutant=' + MUTANT : '')); return v; }
function J(x) { return JSON.stringify(x); }
function guard(cs, key, rule, fn) { try { fn(); } catch (e) { check(cs, key, rule, false, 'threw: ' + (e && (e.message || e.stack) || String(e))); } }
function sha256(b) { return crypto.createHash('sha256').update(b).digest('hex'); }
var BASE_PIN = '38ae6753148be42930bc1fe305a534e51bea644058f5a4acaef651ab9cbc87cb';       // team base of origin/main 9d092972 (same pin as W-IMPORT-ORDER); a later INTENDED base change must move this pin on purpose · MOVED ON PURPOSE 2026-10-31: user Search Keys patch (TEAMWORK §48.11d, owner "Patch it"); was d35e8a75… // MOVED ON PURPOSE 2026-11-04: seed cost history m_costdetail/m_costhistory rows (W-SEED-COSTHISTORY); was 37134ec7
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
  say('§IINV-LOAD erp=' + ERP + ' mutant=' + (MUTANT || 'none') + ' seedPatch ok=' + pOk + ' failed=' + pFail + ' adImportTables=' + (AIT.m ? 'loaded ensure:' + typeof AIT.m.ensure : 'ABSENT (' + AIT.err + ')'));

  // ═══ TABLE (B1) ═══════════════════════════════════════════════════════════════════════════════════════
  var dict = q0("SELECT lower(c.columnname) AS c FROM ad_column c JOIN ad_table t ON t.ad_table_id=c.ad_table_id WHERE lower(t.tablename)='i_invoice' AND c.isactive='Y'").map(function (r) { return r.c; }).sort();
  var before = q0("SELECT name FROM sqlite_master WHERE type='table' AND name='i_invoice'").length;
  check('TABLE', 'seed-gap', 'the shipped seed + patch has the 65 I_Invoice dictionary columns (AD_Table 598) but NO physical i_invoice table (the gap this change closes)', dict.length === 65 && before === 0, { dict: dict.length, physical: before });
  guard('TABLE', 'ensure', 'AdImportTables.ensureInvoice(db) creates i_invoice once (returns 1), the second call creates nothing (0), and the physical columns equal the 65 dictionary columns', function () {
    if (!AIT.m || typeof AIT.m.ensureInvoice !== 'function') { check('TABLE', 'ensure', 'ad_import_tables.js exports ensureInvoice(db)', false, AIT.err || 'no ensureInvoice'); return; }
    var n1 = AIT.m.ensureInvoice(db), n2 = AIT.m.ensureInvoice(db);
    var phys = q0("PRAGMA table_info(i_invoice)").map(function (r) { return String(r.name).toLowerCase(); }).sort();
    check('TABLE', 'ensure', 'ensureInvoice(db) creates i_invoice once (1), then nothing (0); physical columns == the 65 dictionary columns', n1 === 1 && n2 === 0 && J(phys) === J(dict), { n1: n1, n2: n2, phys: phys.length, onlyPhys: phys.filter(function (c) { return dict.indexOf(c) < 0; }), onlyDict: dict.filter(function (c) { return phys.indexOf(c) < 0; }) });
  });
  var h = baseOracle();
  check('TABLE', 'base-hash', 'the team BASE hash (seed + the two hashed patch files) is byte-identical to origin/main: this change touched no hashed file (a teams-wide base-mismatch otherwise)', h === BASE_PIN, { got: h, pin: BASE_PIN });
  var hSrc = read('idempiere.html'), swSrc = read('sw.js'), aitSrc = read('ad_import_tables.js'), kSrc = read('ws_kernel.js'), sSrc = read('ws_server.js');
  check('TABLE', 'wiring', 'the port is booted where ImportOrder is: idempiere.html loads processes/ImportInvoice.js, sw.js precaches it, ensure() calls ensureInvoice, the kernel and server boot ensure()', /<script src="processes\/ImportInvoice\.js\?v=\d+"/.test(hSrc) && /'processes\/ImportInvoice\.js'/.test(swSrc) && /ensureInvoice\(db\);\s*\n\s*return made;/.test(aitSrc) &&
    /require\('\.\/ad_import_tables\.js'\)\.ensure\(db\)/.test(kSrc) && /require\('\.\/ad_import_tables\.js'\)\.ensure\(db\)/.test(sSrc), { html: /ImportInvoice/.test(hSrc), sw: /ImportInvoice/.test(swSrc), ait: /ensureInvoice\(db\);/.test(aitSrc) });
  if (AR.m) AR.m.ensure(db);
  var K = reqERP('ws_kernel.js'), k = K.build(db), ML = k.ML, AP = reqERP('ad_process.js');
  var S = { clientId: 11, orgId: 11, userId: 100, roleId: 102, warehouseId: 103, actor: 'witness:import-invoice' };
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
  var D1 = '2026-10-28 00:00:00';
  var SHIPPED = [], ALLLOG = [], piInv = 0, piOther = 0, origPI = ML.processIt;
  ML.processIt = function (trx, table) { if (String(table).toLowerCase() === 'c_invoice') piInv++; else piOther++; return origPI.apply(this, arguments); };   // count the C_Invoice processIt calls: ONE DocumentEngine run per invoice (:681-690)
  function runInv(params, tag) {
    var c0 = piInv, jl0 = k.journal.length;
    var r = commit(function (trx) { var r0 = AP.runInTrx(trx, 207, { params: params || {} }); return { ok: r0.ok, r: r0, error: r0.summary }; }, { ws: 'import_invoice', tag: tag || '' });
    (r.log || []).forEach(function (l) { ALLLOG.push(l); if (/^§(IMPORT_INVOICE|PROC-UNPORTED|PROC-PARAM|PROC-SQL|PROC-UNKNOWN)/.test(l)) SHIPPED.push(l); });
    var logs = (r.r && r.r.logs) || [], num = function (m) { var x = logs.filter(function (y) { return y.msg === m; })[0]; return x ? Number(x.number) : null; };
    return { res: r, pi: piInv - c0, journal: k.journal.length - jl0, log: (r.log || []).slice(), summary: r.r && r.r.summary, logs: logs, errors: num('@Errors@'), invoices: num('@C_Invoice_ID@: @Inserted@'), lines: num('@C_InvoiceLine_ID@: @Inserted@') };
  }
  function invs(docno) { return k.q('SELECT * FROM c_invoice WHERE documentno=? ORDER BY c_invoice_id', [docno]); }
  function ilines(id) { return k.q('SELECT * FROM c_invoiceline WHERE c_invoice_id=? ORDER BY line, c_invoiceline_id', [id]); }
  function irows(docno) { return k.q('SELECT * FROM i_invoice WHERE documentno=? ORDER BY i_invoice_id', [docno]); }
  function facts(id) { return k.q('SELECT * FROM fact_acct WHERE ad_table_id=318 AND record_id=? ORDER BY fact_acct_id', [id]); }
  function sum(rows, c) { return Math.round(rows.reduce(function (a, r) { return a + Number(r[c] || 0); }, 0) * 100) / 100; }
  function r2(x) { return Math.round(Number(x) * 100) / 100; }
  var BASEP = { AD_Client_ID: 11, AD_Org_ID: 11 };
  function P(extra) { return Object.assign({}, BASEP, extra || {}); }
  function irow(docno, extra) { return { t: 'i_invoice', f: Object.assign({ i_isimported: 'N', documentno: docno, dateinvoiced: D1, dateacct: D1, qtyordered: 1 }, extra || {}) }; }
  function declare(rows) { return commit(saveAll(rows)); }
  // independent oracle: the open amount of an invoice = grandtotal - allocated (amount + discount + writeoff) over allocation lines of COMPLETED headers (never copied from the invoice's own IsPaid)
  function openOracle(invId) {
    var inv = one('SELECT grandtotal FROM c_invoice WHERE c_invoice_id=?', [invId]);
    var a = one("SELECT COALESCE(SUM(l.amount + l.discountamt + l.writeoffamt),0) AS s FROM c_allocationline l JOIN c_allocationhdr h ON h.c_allocationhdr_id=l.c_allocationhdr_id WHERE l.c_invoice_id=? AND h.docstatus IN ('CO','CL')", [invId]);
    return r2(Number(inv.grandtotal) - Number(a.s));
  }
  // the "Opening Charge" of the cut-over method (B3-SCOUT): a C_Charge per side its C_Charge_Acct rows are created by MCharge.afterSave (schema defaults)
  function mkCharge(name) {
    return commit(function (trx) {
      var sv = ML.save(trx, 'c_charge', null, ML.newPO(trx, 'c_charge', { name: name, chargeamt: 0, issametax: 'N', issamecurrency: 'N', c_taxcategory_id: 107, istaxincluded: 'N' }));
      if (!sv.ok) return { ok: false, error: 'c_charge: ' + sv.error };
      var id = sv.row.c_charge_id;                                                                 // MCharge.afterSave -> insert_Accounting(C_Charge_Acct) is run by the twin's model layer: the accounts come from the schema defaults
      return { ok: true, id: id };
    }, { ws: 'fixture_charge' });
  }
  var cAR = mkCharge('Opening Charge AR'), cAP = mkCharge('Opening Charge AP');
  var CHG = { AR: one("SELECT c_charge_id AS id FROM c_charge WHERE name='Opening Charge AR' AND ad_client_id=11"), AP: one("SELECT c_charge_id AS id FROM c_charge WHERE name='Opening Charge AP' AND ad_client_id=11") };
  var CHGACCT = { AR: CHG.AR && one('SELECT ch_expense_acct AS a FROM c_charge_acct WHERE c_charge_id=? AND c_acctschema_id=101', [CHG.AR.id]), AP: CHG.AP && one('SELECT ch_expense_acct AS a FROM c_charge_acct WHERE c_charge_id=? AND c_acctschema_id=101', [CHG.AP.id]) };
  say('§IINV-FIXTURE openingChargeAR=' + J([cAR.ok, cAR.error, CHG.AR && CHG.AR.id, CHGACCT.AR && CHGACCT.AR.a]) + ' openingChargeAP=' + J([cAP.ok, cAP.error, CHG.AP && CHG.AP.id, CHGACCT.AP && CHGACCT.AP.a]));
  function vcAcct(vc) { var r = one('SELECT account_id AS a FROM c_validcombination WHERE c_validcombination_id=?', [vc]); return r ? Number(r.a) : null; }   // C_ValidCombination -> the C_ElementValue the Fact_Acct row carries
  var BP = { AR: one("SELECT c_bpartner_id AS id, value FROM c_bpartner WHERE c_bpartner_id=117"), AP: one("SELECT c_bpartner_id AS id, value FROM c_bpartner WHERE c_bpartner_id=114") };
  var DT = { ARI: one("SELECT c_doctype_id AS d, name FROM c_doctype WHERE c_doctype_id=116"), API: one("SELECT c_doctype_id AS d, name FROM c_doctype WHERE c_doctype_id=123") };
  var EXEMPT = one("SELECT c_tax_id AS t, rate FROM c_tax WHERE c_tax_id=109");
  say('§IINV-FIXTURE bpAR=' + J(BP.AR) + ' bpAP=' + J(BP.AP) + ' doctypeARI=' + J(DT.ARI) + ' doctypeAPI=' + J(DT.API) + ' exemptTax=' + J(EXEMPT));

  // ═══ P0 PORT ═════════════════════════════════════════════════════════════════════════════════════════
  var avail = typeof AP.runInTrx === 'function' && !!AP.JAVA['org.compiere.process.ImportInvoice'];
  check('P0', 'registered', 'AD_Process 207 Import_Invoice resolves to a ported class (org.compiere.process.ImportInvoice registered by erp/processes/ImportInvoice.js)', avail && one('SELECT classname FROM ad_process WHERE ad_process_id=207').classname === 'org.compiere.process.ImportInvoice', { registered: !!AP.JAVA['org.compiere.process.ImportInvoice'] });
  guard('P0', 'params-x-of-n', 'X of N: every AD_Process_Para name of process 207 is one the port\'s prepare() reads (legacy :66-77), and the port reads no other', function () {
    var names = k.q("SELECT columnname AS c FROM ad_process_para WHERE ad_process_id=207 AND isactive='Y' ORDER BY seqno").map(function (r) { return r.c; });
    var src = read('processes/ImportInvoice.js'), used = (src.match(/name === '([A-Za-z_]+)'/g) || []).map(function (s) { return /'([^']+)'/.exec(s)[1]; });
    var X = names.filter(function (n) { return used.indexOf(n) >= 0; }).length;
    check('P0', 'params-x-of-n', 'dictionary parameters ' + J(names) + ' all read by the port (X=' + X + ' of N=' + names.length + '), port reads ' + J(used), names.length === 4 && X === 4 && used.length === 4, { names: names, used: used });
  });
  var dfltDA = one("SELECT defaultvalue AS d FROM ad_process_para WHERE ad_process_id=207 AND columnname='DocAction'");
  check('P0', 'docaction-default', 'MEASURED: AD_Process_Para 207/DocAction has DefaultValue PR (as 206), so "DocAction not sent" in the twin means Prepare, not Complete and not "no processing"', !!dfltDA && dfltDA.d === 'PR', dfltDA);
  check('P0', 'fixture', 'the two Opening Charges and their accounts exist (the cut-over method\'s open-item line: charge, no product)', cAR.ok === true && cAP.ok === true && !!CHG.AR && !!CHG.AP && !!CHGACCT.AR && !!CHGACCT.AR.a && !!CHGACCT.AP && !!CHGACCT.AP.a, { cAR: cAR.error, cAP: cAP.error, acct: CHGACCT });

  // ═══ P2 OPEN INVOICES ON AN OPENING CHARGE (AR + AP) ══════════════════════════════════════════════════
  // The cut-over method (B3-SCOUT): one line per open invoice, charge (no product), only the UNPAID amount, the invoice's own number and date.
  var KAR = 'IINV-AR-0001', KAP = 'IINV-AP-0001', AMT = 161.12;
  guard('P2', 'declare', 'two open invoices are declared as I_Invoice rows through the ERP write path (ML.save, one op group): AR (customer, IsSOTrx=Y) and AP (vendor, IsSOTrx=N), each ONE charge line with the unpaid amount', function () {
    var d = declare([irow(KAR, { bpartnervalue: BP.AR.value, issotrx: 'Y', doctypename: 'AR Invoice', iso_code: 'USD', chargename: 'Opening Charge AR', priceactual: AMT, c_tax_id: EXEMPT.t, description: 'open AR 2026-09' }),
                     irow(KAP, { bpartnervalue: BP.AP.value, issotrx: 'N', doctypename: 'AP Invoice', iso_code: 'USD', chargename: 'Opening Charge AP', priceactual: AMT, c_tax_id: EXEMPT.t, description: 'open AP 2026-09' })]);
    check('P2', 'declare', 'both I_Invoice rows exist, I_IsImported=N, no C_Invoice yet', d.ok && irows(KAR).length === 1 && irows(KAP).length === 1 && irows(KAR)[0].i_isimported === 'N' && invs(KAR).length === 0 && invs(KAP).length === 0, { ok: d.ok, err: d.error });
  });
  var runA = null;
  guard('P2', 'import', 'Import Invoices (DocAction CO) over both rows', function () {
    runA = runInv(P({ DocAction: 'CO' }), 'P2');
    check('P2', 'run', 'the process ran (ok), answered "" (ImportInvoice.java:813) and logged 2 invoices / 2 lines / 0 errors (addLog :809-812)', runA.res.ok === true && runA.summary === '' && runA.invoices === 2 && runA.lines === 2 && runA.errors === 0, { ok: runA.res.ok, err: runA.res.error, summary: runA.summary, inv: runA.invoices, lines: runA.lines, errors: runA.errors });
  });
  [['AR', KAR, 'Y', 'ARI', 'Opening Charge AR'], ['AP', KAP, 'N', 'API', 'Opening Charge AP']].forEach(function (c) {
    var side = c[0], key = c[1], so = c[2], base = c[3];
    guard('P2', side + '-invoice', side + ': ONE C_Invoice with the DocumentNo of the row, the row\'s BP, IsSOTrx ' + so + ', the ' + base + ' document type (by DocTypeName, :131-151), Complete, ONE charge line', function () {
      var iv = invs(key), i0 = iv[0] || {}, ls = i0.c_invoice_id ? ilines(i0.c_invoice_id) : [], l0 = ls[0] || {}, row = irows(key)[0] || {};
      var dtBase = i0.c_doctype_id ? (one('SELECT docbasetype AS b FROM c_doctype WHERE c_doctype_id=?', [i0.c_doctype_id]) || {}).b : null;
      check('P2', side + '-one-invoice', 'exactly ONE c_invoice carries the DocumentNo ' + key + ' (invoice.setDocumentNo(imp.getDocumentNo()), :702-703) - not a minted sequence number', iv.length === 1 && i0.documentno === key, iv.map(function (x) { return x.documentno; }));
      check('P2', side + '-header', 'BP = the partner of the row (' + BP[side].value + '), IsSOTrx=' + so + ', DocBaseType ' + base + ', dates from the row (:729-732)', Number(i0.c_bpartner_id) === Number(BP[side].id) && i0.issotrx === so && dtBase === base && String(i0.dateinvoiced).slice(0, 10) === D1.slice(0, 10) && String(i0.dateacct).slice(0, 10) === D1.slice(0, 10), { bp: i0.c_bpartner_id, so: i0.issotrx, base: dtBase, di: i0.dateinvoiced, da: i0.dateacct });
      check('P2', side + '-line', 'ONE line: the Opening Charge, NO product, qty 1, price = the unpaid amount ' + AMT + ', line net = ' + AMT + ', tax = the exempt tax the row named (:763-764), UOM defaulted, line 10', ls.length === 1 && Number(l0.c_charge_id) === Number(CHG[side].id) && l0.m_product_id == null && Number(l0.qtyinvoiced) === 1 && r2(l0.priceactual) === AMT && r2(l0.priceentered) === AMT && r2(l0.linenetamt) === AMT && Number(l0.c_tax_id) === Number(EXEMPT.t) && Number(l0.line) === 10 && Number(l0.c_uom_id) > 0, ls);
      check('P2', side + '-complete', 'DocStatus CO, Processed Y (DocAction=CO given as the process parameter), grand total = the unpaid amount (exempt tax: no tax effect)', i0.docstatus === 'CO' && i0.processed === 'Y' && r2(i0.grandtotal) === AMT && r2(i0.totallines) === AMT, { st: i0.docstatus, pr: i0.processed, gt: i0.grandtotal, tl: i0.totallines });
      check('P2', side + '-row-imported', 'the I_Invoice row: I_IsImported=Y, Processed=Y, C_Invoice_ID / C_InvoiceLine_ID = its own invoice and line (:776-778), C_Tax_ID kept', row.i_isimported === 'Y' && row.processed === 'Y' && Number(row.c_invoice_id) === Number(i0.c_invoice_id) && Number(row.c_invoiceline_id) === Number(l0.c_invoiceline_id), { row: [row.i_isimported, row.processed, row.c_invoice_id, row.c_invoiceline_id], inv: i0.c_invoice_id, line: l0.c_invoiceline_id });
      var fa = i0.c_invoice_id ? facts(i0.c_invoice_id).filter(function (f) { return Number(f.c_acctschema_id) === 101; }) : [];
      var bpAcct = side === 'AR' ? one('SELECT c_receivable_acct AS a FROM c_bp_customer_acct WHERE c_bpartner_id=? AND c_acctschema_id=101', [BP.AR.id]) : one('SELECT v_liability_acct AS a FROM c_bp_vendor_acct WHERE c_bpartner_id=? AND c_acctschema_id=101', [BP.AP.id]);
      var chAcctId = vcAcct(CHGACCT[side].a), bpAcctId = bpAcct && vcAcct(bpAcct.a);
      var chargeLines = fa.filter(function (f) { return Number(f.account_id) === chAcctId; }), bpLines = fa.filter(function (f) { return Number(f.account_id) === bpAcctId; });
      check('P2', side + '-fact-acct', 'posting through the twin\'s MInvoice posting (schema 101): Fact_Acct rows exist for the invoice (AD_Table 318), debits = credits = ' + AMT + ' (balanced), Posted=Y; the Opening Charge\'s own account (C_Charge_Acct.Ch_Expense_Acct) carries ' + AMT + ' on the ' + (so === 'Y' ? 'credit' : 'debit') + ' side and the partner\'s ' + (so === 'Y' ? 'receivable' : 'liability') + ' account carries ' + AMT + ' on the ' + (so === 'Y' ? 'debit' : 'credit') + ' side (Doc_Invoice.java:438-500 / DocLine.getAccount :447-461)',
        fa.length >= 2 && sum(fa, 'amtacctdr') === sum(fa, 'amtacctcr') && sum(fa, 'amtacctdr') === AMT && i0.posted === 'Y' && !!chAcctId && !!bpAcctId && sum(chargeLines, so === 'Y' ? 'amtacctcr' : 'amtacctdr') === AMT && sum(bpLines, so === 'Y' ? 'amtacctdr' : 'amtacctcr') === AMT,
        { n: fa.length, dr: sum(fa, 'amtacctdr'), cr: sum(fa, 'amtacctcr'), posted: i0.posted, chargeAcct: chAcctId, bpAcct: bpAcctId, lines: fa.map(function (f) { return [f.account_id, f.amtacctdr, f.amtacctcr]; }) });
      var alloc = k.q('SELECT * FROM c_allocationline WHERE c_invoice_id=?', [i0.c_invoice_id]);
      check('P2', side + '-open', 'the invoice is OPEN, not paid: IsPaid=N, no allocation line, open amount by the independent allocation oracle = ' + AMT + ' (the cut-over leaves the whole unpaid amount receivable/payable)', i0.ispaid === 'N' && alloc.length === 0 && openOracle(i0.c_invoice_id) === AMT, { paid: i0.ispaid, alloc: alloc.length, open: i0.c_invoice_id && openOracle(i0.c_invoice_id) });
    });
  });
  guard('P2', 'processIt-once', 'DocumentEngine ran ONCE per invoice (2 invoices -> 2 processIt calls, :681-690/:783-792)', function () {
    check('P2', 'processIt-once', 'the run made exactly 2 C_Invoice processIt calls', !!runA && runA.pi === 2, runA && runA.pi);
  });
  guard('P2', 'one-group', 'the whole import is ONE op group of the caller\'s transaction: ONE journal entry holding c_invoice + c_invoiceline + i_invoice + fact_acct writes', function () {
    var tbls = {}; ((runA && runA.res.ops) || []).forEach(function (o) { tbls[String(o.table || o.t || '').toLowerCase()] = 1; });
    check('P2', 'one-group', 'journal grew by 1 and the op group touched c_invoice, c_invoiceline, i_invoice, fact_acct', !!runA && runA.journal === 1 && ['c_invoice', 'c_invoiceline', 'i_invoice', 'fact_acct'].every(function (t) { return tbls[t]; }), { journal: runA && runA.journal, tables: Object.keys(tbls) });
  });
  guard('P2', 'log', 'the shipped § log names the run (§IMPORT_INVOICE summary with the counts) and the parameters (§PROC-PARAM only for the ones not sent)', function () {
    check('P2', 'log', '§IMPORT_INVOICE ... invoices=2 lines=2 errors=0 is in the process log', !!runA && runA.log.some(function (l) { return /^§IMPORT_INVOICE client=11 org=11 docAction=CO invoices=2 lines=2 errors=0/.test(l); }), runA && runA.log.filter(function (l) { return /IMPORT_INVOICE|PROC-/.test(l); }));
  });

  // ═══ P3 GROUPING + PRICING + TAX (a product line next to charge lines) ═══════════════════════════════════
  // legacy breaks the invoice on (C_BPartner_ID, C_BPartner_Location_ID, DocumentNo) over rows ordered by BP, location, I_Invoice_ID (:657-659, :678-680)
  var KG1 = 'IINV-GRP-1', KG2 = 'IINV-GRP-2', PRODV = one('SELECT value FROM m_product WHERE m_product_id=123').value, PRODQ = 2;
  var BP2 = one('SELECT c_bpartner_id AS id, value FROM c_bpartner WHERE c_bpartner_id=120');
  function arRow(docno, extra) { return irow(docno, Object.assign({ bpartnervalue: BP.AR.value, issotrx: 'Y', doctypename: 'AR Invoice', iso_code: 'USD', chargename: 'Opening Charge AR', priceactual: 10, c_tax_id: EXEMPT.t }, extra || {})); }
  function apRow(docno, extra) { return irow(docno, Object.assign({ bpartnervalue: BP.AP.value, issotrx: 'N', doctypename: 'AP Invoice', iso_code: 'USD', chargename: 'Opening Charge AP', priceactual: 10, c_tax_id: EXEMPT.t }, extra || {})); }
  var runG = null;
  guard('P3', 'group', 'rows: key GRP-1 x3 (two charge lines 10 + 20, one product line "' + PRODV + '" qty ' + PRODQ + ' priced by the process), key GRP-2 of the same BP, key GRP-1 again for ANOTHER BP', function () {
    var d = declare([arRow(KG1, { priceactual: 10 }), arRow(KG1, { priceactual: 20 }), arRow(KG1, { chargename: null, productvalue: PRODV, qtyordered: PRODQ, priceactual: null, c_tax_id: null }),
                     arRow(KG2, { priceactual: 5 }), arRow(KG1, { bpartnervalue: BP2.value, priceactual: 7 })]);
    runG = runInv(P({ DocAction: 'CO' }), 'P3');
    check('P3', 'run', 'declared 5 rows, the run made 3 invoices / 5 lines / 0 errors', d.ok && runG.res.ok && runG.invoices === 3 && runG.lines === 5 && runG.errors === 0 && runG.pi === 3, { d: d.error, ok: runG.res.ok, inv: runG.invoices, lines: runG.lines, errors: runG.errors, pi: runG.pi, err: runG.res.error, log: runG.log.filter(function (l) { return /EXCEPTION|SQL-ERROR/.test(l); }) });
  });
  guard('P3', 'invoices', 'one header per (BP, location, DocumentNo): GRP-1 of the first BP has 3 lines numbered 10/20/30, GRP-2 has 1, GRP-1 of the other BP has 1 - the same DocumentNo does not merge two partners', function () {
    var a = k.q('SELECT * FROM c_invoice WHERE documentno=? AND c_bpartner_id=? ORDER BY c_invoice_id', [KG1, BP.AR.id]), b = k.q('SELECT * FROM c_invoice WHERE documentno=? AND c_bpartner_id=?', [KG2, BP.AR.id]), c = k.q('SELECT * FROM c_invoice WHERE documentno=? AND c_bpartner_id=?', [KG1, BP2.id]);
    var la = a[0] ? ilines(a[0].c_invoice_id) : [];
    check('P3', 'grouping', 'GRP-1/BP117: ONE invoice with 3 lines, line numbers 10,20,30, in I_Invoice_ID order (charge 10, charge 20, product); GRP-2/BP117: 1 invoice, 1 line; GRP-1/BP120: 1 invoice, 1 line',
      a.length === 1 && la.length === 3 && la.map(function (l) { return Number(l.line); }).join() === '10,20,30' && Number(la[0].priceactual) === 10 && Number(la[1].priceactual) === 20 && la[2].m_product_id != null && b.length === 1 && ilines(b[0].c_invoice_id).length === 1 && c.length === 1 && ilines(c[0].c_invoice_id).length === 1,
      { a: a.length, lines: la.map(function (l) { return [l.line, l.priceactual, l.m_product_id, l.c_charge_id]; }), b: b.length, c: c.length });
    var inv = a[0] || {}, pl = la[2] || {};
    // independent price oracle: PriceStd of the product in the (default SO) price list 101's version valid on the invoice date, straight from M_ProductPrice
    var pp = one('SELECT pp.pricestd AS s, pp.pricelist AS l, pp.pricelimit AS m FROM m_productprice pp JOIN m_pricelist_version v ON v.m_pricelist_version_id=pp.m_pricelist_version_id WHERE v.m_pricelist_id=101 AND pp.m_product_id=123 AND v.validfrom<=? ORDER BY v.validfrom DESC', [D1]);
    check('P3', 'product-price', 'the product line (no PriceActual on the row) is priced by line.setPrice() (:759) = PriceStd of the price list the header carries (101): price ' + (pp && pp.s) + ', list ' + (pp && pp.l) + ', qty ' + PRODQ + ', net = qty x price, UOM = the product\'s',
      !!pp && Number(inv.m_pricelist_id) === 101 && r2(pl.priceactual) === r2(pp.s) && r2(pl.pricelist) === r2(pp.l) && Number(pl.qtyinvoiced) === PRODQ && r2(pl.linenetamt) === r2(PRODQ * Number(pp.s)) && Number(pl.c_uom_id) === Number(one('SELECT c_uom_id AS u FROM m_product WHERE m_product_id=123').u), { pp: pp, line: pl, pl: inv.m_pricelist_id });
    var rowP = irows(KG1).filter(function (r) { return r.m_product_id != null && r.c_bpartner_id != null && Number(r.c_bpartner_id) === Number(BP.AR.id); })[0] || {};
    var tx = pl.c_tax_id ? one('SELECT c_tax_id AS t, rate FROM c_tax WHERE c_tax_id=?', [pl.c_tax_id]) : null;
    var itx = k.q('SELECT * FROM c_invoicetax WHERE c_invoice_id=?', [inv.c_invoice_id]);
    var base = r2(Number(pl.linenetamt)), taxOracle = tx ? r2(base * Number(tx.rate) / 100) : null;
    check('P3', 'tax', 'the product line had no tax on the row: line.setTax() found one (:765-769) and wrote it back to the I_Invoice row; the invoice\'s tax rows and grand total follow the rate of THAT tax (independent: base x rate / 100): total lines ' + (10 + 20 + (pp ? PRODQ * Number(pp.s) : 0)),
      !!tx && Number(rowP.c_tax_id) === Number(pl.c_tax_id) && r2(inv.totallines) === r2(30 + base) && r2(inv.grandtotal) === r2(30 + base + taxOracle) && r2(sum(itx.filter(function (t) { return Number(t.c_tax_id) === Number(tx.t); }), 'taxamt')) === taxOracle, { tx: tx, rowTax: rowP.c_tax_id, lineTax: pl.c_tax_id, totals: [inv.totallines, inv.grandtotal], itx: itx.map(function (t) { return [t.c_tax_id, t.taxbaseamt, t.taxamt]; }) });
    var fa = facts(inv.c_invoice_id).filter(function (f) { return Number(f.c_acctschema_id) === 101; });
    check('P3', 'fact', 'the 3-line invoice posts balanced: debits = credits = grand total ' + inv.grandtotal + ' (receivable carries it all)', fa.length >= 3 && sum(fa, 'amtacctdr') === sum(fa, 'amtacctcr') && sum(fa, 'amtacctdr') === r2(inv.grandtotal) && inv.docstatus === 'CO', { n: fa.length, dr: sum(fa, 'amtacctdr'), cr: sum(fa, 'amtacctcr'), gt: inv.grandtotal, st: inv.docstatus });
    var lid = {}; la.concat(ilines(b[0].c_invoice_id), ilines(c[0].c_invoice_id)).forEach(function (l) { lid[l.c_invoiceline_id] = 1; });
    var rs = irows(KG1).concat(irows(KG2));
    check('P3', 'rows', 'all 5 I_Invoice rows: I_IsImported=Y, each with its OWN invoice line id (distinct), C_Invoice_ID = its invoice', rs.length === 5 && rs.every(function (r) { return r.i_isimported === 'Y' && lid[r.c_invoiceline_id] && r.c_invoice_id != null; }) && Object.keys(lid).length === 5, rs.map(function (r) { return [r.i_isimported, r.c_invoice_id, r.c_invoiceline_id]; }));
  });

  // ═══ P4 ERR: legacy's exact I_ErrorMsg texts (ImportInvoice.java) ═══════════════════════════════════════
  var javaSrc = ''; try { javaSrc = fs.readFileSync((process.env.IINV_JAVA || '/home/red1/idempiere-dev-setup/idempiere/org.adempiere.base.process/src/org/compiere/process/ImportInvoice.java'), 'utf8'); } catch (e) { javaSrc = ''; }
  var NEWBP = 'NEW-IINV-BP', CTRY = one("SELECT countrycode AS c FROM c_country WHERE hasregion='N' AND ad_client_id IN (0,11) ORDER BY c_country_id").c;
  var ERRS = [
    ['E-org',    arRow('IINV-E-org', { ad_org_id: 0 }),                                                  'ERR=Invalid Org, '],
    ['E-dt',     arRow('IINV-E-dt', { doctypename: 'No Such DocType' }),                                 'ERR=Invalid DocTypeName, '],
    ['E-nodt',   arRow('IINV-E-nodt', { doctypename: null }),                                            'ERR=No DocType, '],
    ['E-cur',    arRow('IINV-E-cur', { iso_code: 'ZZZ' }),                                               'ERR=No Currency,'],
    ['E-chg',    arRow('IINV-E-chg', { chargename: 'No Such Charge' }),                                  'ERR=Invalid Charge, '],
    ['E-prod',   arRow('IINV-E-prod', { chargename: null, productvalue: 'NO-SUCH-PRODUCT' }),            'ERR=Invalid Product, '],
    ['E-pc',     arRow('IINV-E-pc', { productvalue: PRODV }),                                            'ERR=Product and Charge, '],
    ['E-tax',    arRow('IINV-E-tax', { c_tax_id: null, taxindicator: 'ZZ' }),                            'ERR=Invalid Tax, '],
    ['E-prj',    arRow('IINV-E-prj', { projectvalue: 'NO-SUCH-PROJECT' }),                               'ERR=Invalid Project, '],
    ['E-act',    arRow('IINV-E-act', { activityvalue: 'NO-SUCH-ACTIVITY' }),                             'ERR=Invalid Activity, '],
    ['E-1099',   apRow('IINV-E-1099', { c_1099box_value: 'NO-SUCH-BOX' }),                               'ERR=Invalid C_1099Box_Value, '],
    ['E-bp',     arRow('IINV-E-bp', { bpartnervalue: 'NO-SUCH-BP' }),                                    'ERR=Invalid Country, '],
    ['E-bp2',    arRow('IINV-E-bp', { bpartnervalue: 'NO-SUCH-BP' }),                                    'ERR=No BPartner, ']
  ];
  var runE = null, NE = 12, EGOOD = 'IINV-E-good';
  guard('P4', 'run', '12 bad rows (one legacy error each, E-bp is two rows of one key) + 1 good row in ONE run', function () {
    var rows = ERRS.filter(function (e, i) { return e[0] !== 'E-bp2'; }).map(function (e) { return e[1]; }).concat([arRow(EGOOD, {})]);
    var d = declare(rows);
    runE = runInv(P({ DocAction: 'CO' }), 'P4');
    var good = invs(EGOOD)[0];
    check('P4', 'run', 'the run answered ok; the good row alone became an invoice (Complete); the answer logs 1 invoice / 1 line / ' + NE + ' errors (= rows left not imported, :804-809)', d.ok && runE.res.ok && runE.invoices === 1 && runE.lines === 1 && runE.errors === NE && !!good && good.docstatus === 'CO', { d: d.error, ok: runE.res.ok, inv: runE.invoices, lines: runE.lines, errors: runE.errors, good: good && good.docstatus, err: runE.res.error, log: runE.log.filter(function (l) { return /EXCEPTION|SQL-ERROR/.test(l); }) });
  });
  ERRS.forEach(function (e) {
    guard('P4', e[0] + '-' + e[2].replace(/[^A-Za-z0-9]+/g, '_'), e[0] + ': the row ends I_IsImported=N (the closing reset :804-808) with I_ErrorMsg containing "' + e[2] + '", no invoice', function () {
      var key = e[1].f.documentno, rw = irows(key)[0] || {};
      check('P4', e[0] + '-' + e[2].replace(/[^A-Za-z0-9]+/g, '_'), e[0] + ' ends N, I_ErrorMsg contains "' + e[2] + '", no invoice, no C_Invoice_ID', rw.i_isimported === 'N' && String(rw.i_errormsg).indexOf(e[2]) >= 0 && invs(key).length === 0 && rw.c_invoice_id == null, [rw.i_isimported, rw.i_errormsg, invs(key).length]);
    });
  });
  guard('P4', 'texts-in-java', 'every error text the witness expects is a literal of ImportInvoice.java (the copy is verbatim: ' + (javaSrc ? 'source read' : 'SOURCE NOT AVAILABLE - not judged') + ')', function () {
    if (!javaSrc) { say('§IINV-NOJAVA ImportInvoice.java not readable at IINV_JAVA / the default path: texts-in-java NOT judged'); return; }
    var miss = ERRS.map(function (e) { return e[2]; }).filter(function (t, i, a) { return a.indexOf(t) === i; }).filter(function (t) { return javaSrc.indexOf("I_ErrorMsg||'" + t + "'") < 0; });
    check('P4', 'texts-in-java', 'each of the ' + ERRS.length + ' expected texts appears in the Java as I_ErrorMsg||\'<text>\' (missing: none)', miss.length === 0, miss);
  });
  guard('P4', 'unported', 'a BPartner that does not exist yet (value ' + NEWBP + ', country ' + CTRY + ') is legacy\'s :543-553 "new MBPartner" branch: NAMED unported - §PROC-UNPORTED line + "ERR=Not ported: new BPartner from names, " on the row + legacy\'s own "ERR=No BPartner, " - never a silent skip', function () {
    var K = 'IINV-E-newbp', d = declare([arRow(K, { bpartnervalue: NEWBP, name: 'New IINV BP', countrycode: CTRY })]);
    var r = runInv(P({ DocAction: 'CO' }), 'P4u'), rw = irows(K)[0] || {};
    check('P4', 'unported', 'row ends N with both "ERR=Not ported: new BPartner from names, " and "ERR=No BPartner, ", the log has §PROC-UNPORTED ImportInvoice new BPartner from names (ImportInvoice.java:546-553), no BPartner / invoice made',
      d.ok && r.res.ok && rw.i_isimported === 'N' && String(rw.i_errormsg).indexOf('ERR=Not ported: new BPartner from names, ') >= 0 && String(rw.i_errormsg).indexOf('ERR=No BPartner, ') >= 0 && r.log.some(function (l) { return /^§PROC-UNPORTED ImportInvoice new BPartner from names \(ImportInvoice\.java:546-553\)/.test(l); }) && invs(K).length === 0 && !one('SELECT 1 AS x FROM c_bpartner WHERE value=?', [NEWBP]),
      { d: d.error, row: [rw.i_isimported, rw.i_errormsg], log: r.log.filter(function (l) { return /UNPORTED/.test(l); }) });
  });

  // ═══ P5 NODA / PREPARE: DocAction handling ═══════════════════════════════════════════════════════════════
  guard('P5', 'empty-is-null', 'DocAction sent as the EMPTY string reaches the process as NULL (the twin\'s parameter mapping; Java\'s dialog does the same for an empty field): the AD_Process_Para default PR applies, exactly as if it was not sent - there is NO way to ask this process for "no processing"', function () {
    var K = 'IINV-N-0001', d = declare([arRow(K, { priceactual: 33.5 })]), r = runInv(P({ DocAction: '' }), 'P5a'), i0 = invs(K)[0] || {};
    check('P5', 'empty-is-null', 'a §PROC-PARAM DocAction=PR line, 1 processIt, header IP, 0 Fact_Acct, row Y', d.ok && r.res.ok && r.invoices === 1 && r.log.some(function (l) { return /^§PROC-PARAM ImportInvoice DocAction=PR source=AD_Process_Para default/.test(l); }) && r.pi === 1 && i0.docstatus === 'IP' && facts(i0.c_invoice_id).length === 0 && (irows(K)[0] || {}).i_isimported === 'Y', { d: d.error, inv: r.invoices, pi: r.pi, st: i0.docstatus, facts: i0.c_invoice_id && facts(i0.c_invoice_id).length, err: r.res.error });
  });
  guard('P5', 'default-prepare', 'DocAction NOT sent: the AD_Process_Para default PR (Prepare) applies and is announced (§PROC-PARAM DocAction=PR); the invoice is prepared (In Progress), not completed: no Fact_Acct, not posted', function () {
    var K = 'IINV-N-0002', d = declare([arRow(K, { priceactual: 44.5 })]), r = runInv(P({}), 'P5b'), i0 = invs(K)[0] || {};
    check('P5', 'default-prepare', 'a §PROC-PARAM ImportInvoice DocAction=PR line, 1 processIt, header IP (not CO), 0 Fact_Acct, Posted N', d.ok && r.res.ok && r.log.some(function (l) { return /^§PROC-PARAM ImportInvoice DocAction=PR source=AD_Process_Para default/.test(l); }) && r.pi === 1 && i0.docstatus === 'IP' && facts(i0.c_invoice_id).length === 0 && i0.posted === 'N', { d: d.error, pi: r.pi, st: i0.docstatus, posted: i0.posted, facts: i0.c_invoice_id && facts(i0.c_invoice_id).length, err: r.res.error, log: r.log.filter(function (l) { return /PARAM/.test(l); }) });
  });

  // ═══ P6 RESOLVE: legacy's lookups (BP from email / contact name / default cash BP, doc type by name -> IsSOTrx) ═══════
  guard('P6', 'resolve', 'rows with only an e-mail, only a contact name, and nothing about the BP; DocTypeName alone decides the document type and IsSOTrx (:145-151, :191-202)', function () {
    var u1 = one("SELECT email AS e, c_bpartner_id AS b, ad_user_id AS u FROM ad_user WHERE ad_user_id=102"), u2 = one("SELECT name AS n, c_bpartner_id AS b, ad_user_id AS u FROM ad_user WHERE ad_user_id=101");
    var cash = one('SELECT c_bpartnercashtrx_id AS b FROM ad_clientinfo WHERE ad_client_id=11').b;
    // independent oracle: uniqueness the legacy statements need (a duplicate would make PG fail the statement)
    var nEmail = one('SELECT count(*) AS n FROM ad_user WHERE email=? AND ad_client_id=11 AND c_bpartner_id IS NOT NULL', [u1.e]).n, nName = one('SELECT count(*) AS n FROM ad_user WHERE name=? AND ad_client_id=11 AND c_bpartner_id IS NOT NULL', [u2.n]).n;
    var K1 = 'IINV-R-mail', K2 = 'IINV-R-name', K3 = 'IINV-R-cash';
    var base = { iso_code: 'USD', chargename: 'Opening Charge AR', priceactual: 12, c_tax_id: EXEMPT.t };
    var d = declare([irow(K1, Object.assign({ email: u1.e, doctypename: 'AR Invoice' }, base)), irow(K2, Object.assign({ contactname: u2.n, doctypename: 'AP Invoice' }, base, { chargename: 'Opening Charge AP' })), irow(K3, Object.assign({ doctypename: 'AR Invoice' }, base))]);
    var r = runInv(P({ DocAction: 'CO' }), 'P6'), a = invs(K1)[0] || {}, b = invs(K2)[0] || {}, c = invs(K3)[0] || {};
    check('P6', 'resolve', 'by e-mail -> BP ' + u1.b + ' + contact ' + u1.u + ' (IsSOTrx Y from the ARI doc type); by contact name -> BP ' + u2.b + ' (IsSOTrx N from the API doc type); no BP data -> AD_ClientInfo cash BP ' + cash + '; every location resolved from the BP; all three Complete',
      nEmail === 1 && nName === 1 && d.ok && r.res.ok && r.invoices === 3 && Number(a.c_bpartner_id) === Number(u1.b) && Number(a.ad_user_id) === Number(u1.u) && a.issotrx === 'Y' && Number(b.c_bpartner_id) === Number(u2.b) && b.issotrx === 'N' && Number(c.c_bpartner_id) === Number(cash) && c.issotrx === 'Y' &&
      [a, b, c].every(function (x) { return x.docstatus === 'CO' && Number(x.c_bpartner_location_id) > 0; }),
      { nEmail: nEmail, nName: nName, d: d.error, inv: r.invoices, a: [a.c_bpartner_id, a.ad_user_id, a.issotrx, a.docstatus], b: [b.c_bpartner_id, b.issotrx, b.docstatus], c: [c.c_bpartner_id, c.issotrx, c.docstatus], err: r.res.error, log: r.log.filter(function (l) { return /EXCEPTION|SQL-ERROR/.test(l); }) });
  });

  // ═══ P7 TRX / COLLISION ═══════════════════════════════════════════════════════════════════════════════
  guard('P7', 'one-group', 'declare + import inside ONE caller transaction (runInTrx on a Trx that already holds the pending I_Invoice inserts): ONE journal entry, the invoice Complete, the rows end Y with links to the invoice created later in the same group', function () {
    var KT = 'IINV-T-0001', j0 = k.journal.length;
    var r = commit(function (trx) {
      var s = saveAll([arRow(KT, { priceactual: 21 }), arRow(KT, { priceactual: 22 })])(trx); if (!s.ok) return s;
      var r0 = AP.runInTrx(trx, 207, { params: P({ DocAction: 'CO' }) }); return { ok: r0.ok, error: r0.summary, r: r0 };
    });
    var o = invs(KT)[0], trs = irows(KT), lids = o ? ilines(o.c_invoice_id).map(function (l) { return String(l.c_invoiceline_id); }) : [];
    check('P7', 'one-group', 'ONE journal entry for declare+import; the group holds i_invoice, c_invoice and c_invoiceline CREATEs; the invoice is Complete with 2 lines; the 2 rows are Y with their own line ids',
      r.ok && k.journal.length - j0 === 1 && !!o && o.docstatus === 'CO' && lids.length === 2 && r.ops.some(function (op) { return op.table === 'i_invoice' && op.op_type === 'CRUD_CREATE'; }) && r.ops.some(function (op) { return op.table === 'c_invoice'; }) && r.ops.some(function (op) { return op.table === 'c_invoiceline'; }) &&
      trs.length === 2 && trs.every(function (x) { return x.i_isimported === 'Y' && String(x.c_invoice_id) === String(o.c_invoice_id) && lids.indexOf(String(x.c_invoiceline_id)) >= 0; }),
      { ok: r.ok, err: r.error, journal: k.journal.length - j0, st: o && o.docstatus, lines: lids.length, rows: trs.map(function (x) { return [x.i_isimported, x.c_invoice_id, x.c_invoiceline_id]; }) });
  });
  guard('P7', 'resend', 'the same open invoice declared AGAIN as a new row (same BP, DocumentNo ' + KAR + ', same doc type): no second Completed invoice - a refused duplicate is named in the log (§IMPORT_INVOICE_COLLISION) when the index exists, else the table shows what legacy would do', function () {
    var n0 = k.q('SELECT count(*) AS n FROM c_invoice WHERE documentno=?', [KAR])[0].n, done0 = k.q("SELECT count(*) AS n FROM c_invoice WHERE documentno=? AND docstatus='CO'", [KAR])[0].n;
    var uq = k.q("SELECT indexname FROM ad_ddl_unique WHERE tablename='c_invoice'").map(function (x) { return x.indexname; });
    var d = declare([arRow(KAR, { priceactual: AMT })]), r = runInv(P({ DocAction: 'CO' }), 'P7r'), n1 = k.q('SELECT count(*) AS n FROM c_invoice WHERE documentno=?', [KAR])[0].n, done1 = k.q("SELECT count(*) AS n FROM c_invoice WHERE documentno=? AND docstatus='CO'", [KAR])[0].n;
    var coll = r.log.filter(function (l) { return /^§IMPORT_INVOICE_COLLISION/.test(l); });
    say('  §IINV-EVIDENCE resend: unique indexes on c_invoice=' + J(uq) + ' invoices with the key ' + n0 + ' -> ' + n1 + ', completed ' + done0 + ' -> ' + done1 + ', collision lines=' + coll.length);
    check('P7', 'resend', uq.length ? 'a unique index on c_invoice exists (' + J(uq) + '): the second invoice is refused, still ONE completed invoice with the key, the refusal is logged as a collision' : 'no unique index on c_invoice documentno in this twin: the count before/after is printed as evidence, the completed count must not exceed what legacy allows',
      d.ok && r.res.ok && (uq.length ? (done1 === done0 && coll.length >= 1) : (n1 >= n0)), { uq: uq, n: [n0, n1], done: [done0, done1], coll: coll });
  });

  // ═══ P8 RERUN + DEL ═══════════════════════════════════════════════════════════════════════════════════
  guard('P8', 'rerun', 'a plain second run with no new rows makes nothing new: the imported rows (I_IsImported=Y) are not read again (:657)', function () {
    var h0 = one('SELECT count(*) AS n FROM c_invoice').n, l0 = one('SELECT count(*) AS n FROM c_invoiceline').n, f0 = one('SELECT count(*) AS n FROM fact_acct').n;
    // the rows still pending from the ERR arm are N and fail again exactly as before; clear them first so "nothing new" is about the imported rows alone
    commit(function (trx) { trx.find('i_invoice', {}).filter(function (x) { return x.i_isimported !== 'Y'; }).forEach(function (x) { trx.del('i_invoice', x); }); return { ok: true }; });
    var r = runInv(P({ DocAction: 'CO' }), 'P8');
    check('P8', 'rerun', 'invoices, lines and Fact_Acct unchanged; the answer logs 0 invoices / 0 lines / 0 errors; 0 processIt', r.res.ok && one('SELECT count(*) AS n FROM c_invoice').n === h0 && one('SELECT count(*) AS n FROM c_invoiceline').n === l0 && one('SELECT count(*) AS n FROM fact_acct').n === f0 && r.invoices === 0 && r.lines === 0 && r.errors === 0 && r.pi === 0, { h: [h0, one('SELECT count(*) AS n FROM c_invoice').n], inv: r.invoices, lines: r.lines, errors: r.errors, pi: r.pi, err: r.res.error });
  });
  guard('P8', 'delete-old', 'DeleteOldImported=Y deletes the rows already imported (DELETE ... WHERE I_IsImported=\'Y\', :99-106) and leaves every C_Invoice alone', function () {
    var y0 = one("SELECT count(*) AS n FROM i_invoice WHERE i_isimported='Y' AND ad_client_id=11").n, h0 = one('SELECT count(*) AS n FROM c_invoice').n;
    var r = runInv(P({ DocAction: 'CO', DeleteOldImported: 'Y' }), 'P8d');
    check('P8', 'delete-old', 'before: ' + y0 + ' imported rows; after: 0 rows in I_Invoice for the client, the invoices untouched (' + h0 + ')', y0 > 0 && r.res.ok && one('SELECT count(*) AS n FROM i_invoice WHERE ad_client_id=11').n === 0 && one('SELECT count(*) AS n FROM c_invoice').n === h0, { y0: y0, left: one('SELECT count(*) AS n FROM i_invoice WHERE ad_client_id=11').n, err: r.res.error });
  });

  // ═══ shipped log + verdicts ═══════════════════════════════════════════════════════════════════════════
  ML.processIt = origPI;
  var kinds = {}; SHIPPED.forEach(function (l) { var kk = l.split(' ')[0]; kinds[kk] = (kinds[kk] || 0) + 1; });
  say('§IINV-SHIPPED-LOG process lines=' + SHIPPED.length + ' kinds=' + J(kinds));
  ['§PROC-PARAM', '§IMPORT_INVOICE ', '§IMPORT_INVOICE_COLLISION', '§IMPORT_INVOICE_EXCEPTION', '§IMPORT_INVOICE_WARN', '§PROC-UNPORTED', '§PROC-SQL-ERROR'].forEach(function (kk) { var l = SHIPPED.filter(function (x) { return x.indexOf(kk) === 0; })[0]; if (l) say('  ' + l.slice(0, 300)); });
  var vs = ['TABLE', 'P0', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'].map(verdict);
  var failedCases = Object.keys(CASES).filter(function (c) { return CASES[c].failed; });
  var all = !ALL.judged ? 'INCONCLUSIVE' : ALL.failed ? 'FAIL' : 'PASS';
  say('§IINV-RESULT verdict=' + all + ' judged=' + ALL.judged + ' failed=' + ALL.failed + ' failedCases=' + J(failedCases) + (MUTANT ? ' mutant=' + MUTANT : ''));
  var exitCode = all === 'PASS' ? 0 : 1;

  // ═══ mutants (IINV_MUTANTS=1, parent run only) ═══════════════════════════════════════════════════════
  if (process.env.IINV_MUTANTS && !MUTANT) {
    var MUTS = [];
    try { MUTS = require('./witness_import_invoice_mutants.js'); } catch (e) { say('§IINV-MUTANT-ERR no mutant table: ' + e.message); }
    var killed = 0, applied = 0, notApplied = [], crashed = [], survived = [], jobs = [];
    MUTS.forEach(function (m) {
      if (process.env.IINV_ONLY && !new RegExp(process.env.IINV_ONLY).test(m.name)) return;     // debugging aid: run a subset of the table
      var dir = fs.mkdtempSync(path.join(os.tmpdir(), 'iinvmut_'));
      fs.readdirSync(ERP).forEach(function (f) { try { fs.symlinkSync(path.join(ERP, f), path.join(dir, f)); } catch (e) {} });
      // every .js module (and callouts/, processes/) is COPIED, never symlinked: node resolves a symlink to its real path, so a symlinked neighbour would bind to the witness's own instance. Big .db files and patches/ stay symlinks (read-only data).
      fs.readdirSync(ERP).forEach(function (f) { var src = path.join(ERP, f), st = fs.statSync(src);
        if ((st.isFile() && /\.(js|html)$/.test(f)) || (st.isDirectory() && (f === 'callouts' || f === 'processes'))) { try { fs.unlinkSync(path.join(dir, f)); } catch (e) {} fs.cpSync(src, path.join(dir, f), { recursive: true }); } });
      var ok = true;
      m.edits.forEach(function (ed) {
        var src = fs.readFileSync(path.join(dir, ed.file), 'utf8'), want = ed.count || 1, have = src.split(ed.from).length - 1;
        if (have !== want) { ok = false; say('§IINV-MUTANT-EDIT ' + m.name + ' ' + ed.file + ' found ' + have + ' time(s), expected ' + want); return; }
        fs.writeFileSync(path.join(dir, ed.file), src.split(ed.from).join(ed.to));
      });
      if (!ok) { notApplied.push(m.name); say('§IINV-MUTANT ' + m.name + ' NOT-APPLIED (source text not found exactly as counted: the mutant proves nothing)'); try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} return; }
      applied++; jobs.push({ m: m, dir: dir });
    });
    await new Promise(function (resolve) {
      var next = 0, running = 0, POOL = Number(process.env.IINV_JOBS || 4);
      function pump() {
        while (running < POOL && next < jobs.length) (function (job) {
          running++;
          var child = cp.spawn(process.execPath, [__filename], { env: Object.assign({}, process.env, { IINV_ERP: job.dir, IINV_MUTANT: job.m.name, IINV_MUTANTS: '' }) }), out = '', timer = setTimeout(function () { child.kill('SIGKILL'); }, 600000);
          child.stdout.on('data', function (d) { out += d; }); child.stderr.on('data', function (d) { out += d; });
          child.on('close', function (code) {
            clearTimeout(timer); running--;
            var m = job.m, rl = out.split('\n').filter(function (l) { return /^§IINV-RESULT /.test(l); })[0], failedLines = out.split('\n').filter(function (l) { return /§IINV-CHECK .* FAIL /.test(l); });
            var named = (m.kills || []).some(function (kk) { return failedLines.some(function (l) { return l.indexOf('case=' + kk.split('.')[0] + ' key=' + kk.split('.')[1] + ' ') >= 0; }); });
            if (!rl) { crashed.push(m.name); say('§IINV-MUTANT ' + m.name + ' CRASHED (no verdict line; a crash is NOT a kill) exit=' + code + ' ' + out.split('\n').filter(function (l) { return /Error|error/.test(l); })[0]); }
            else if (/verdict=FAIL/.test(rl) && named) { killed++; say('§IINV-MUTANT ' + m.name + ' KILLED by ' + m.kills.filter(function (kk) { return failedLines.some(function (l) { return l.indexOf('case=' + kk.split('.')[0] + ' key=' + kk.split('.')[1] + ' ') >= 0; }); }).join(' | ') + ' :: ' + m.what); }
            else { survived.push(m.name); say('§IINV-MUTANT ' + m.name + ' SURVIVED verdict=' + (rl.match(/verdict=\w+/) || [''])[0] + ' expected to fail ' + (m.kills || []).join(' | ') + ' failedChecks=' + failedLines.length); }
            try { fs.rmSync(job.dir, { recursive: true, force: true }); } catch (e) {}
            if (next >= jobs.length && running === 0) resolve(); else pump();
          });
        })(jobs[next++]);
        if (!jobs.length) resolve();
      }
      pump();
    });
    var nSel = jobs.length + notApplied.length, mv = !MUTS.length ? 'INCONCLUSIVE' : (killed === nSel && !notApplied.length && !crashed.length && !survived.length) ? 'PASS' : 'FAIL';
    say('§IINV-MUTANTS verdict=' + mv + ' total=' + nSel + ' applied=' + applied + ' killed=' + killed + ' notApplied=' + J(notApplied) + ' crashed=' + J(crashed) + ' survived=' + J(survived));
    if (mv !== 'PASS') exitCode = 1;
  }
  process.exit(exitCode);
})().catch(function (e) { say('§IINV-RESULT verdict=FAIL harness: ' + (e && e.stack)); process.exit(2); });
