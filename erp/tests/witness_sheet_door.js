#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-SHEET-DOOR (bim-compiler prompts/SHEET_FRONT_DOOR.md §3, slice S1). READ THE LOG after every run: every verdict is a
//   §SDOOR line; the exit code is not the evidence. INCONCLUSIVE when nothing was judged. A mutant that crashes is NOT a kill.
// SPEC (claims written before the code, each names the issue it exposes):
//   D1 EQUIV      door filing == the same rows declared straight into I_Invoice + AD_Process 207 (C_Invoice + lines + Fact_Acct fingerprint, ids stripped)  -> the door adds/loses invoice logic
//   D2 LAYOUT     the same invoice in two layouts (two templates) gives an identical fingerprint                                                          -> the engine depends on one layout
//   D3 SUBTOTAL   printed subtotal != sum of line amounts, or qty x price != printed amount -> refused, journal unchanged, both numbers named                 -> a wrong sheet filed silently
//   D4 GRANDTOTAL printed grand total != the filed grand total (the twin's tax) -> refused, transaction dropped, both numbers named                         -> sheet tax and book tax disagree unseen
//   D5 WRITE-BACK writes only the docno + status cells; docno == the filed DocumentNo; a blank docno gets the minted number back                           -> writes outside the tags / wrong number
//   D6 VACUOUS    no filled line -> INCONCLUSIVE, no invoice, no journal                                                                                   -> an empty sheet passes
//   D7 LEGACY-ERR a partner that does not exist -> no invoice, status carries legacy's own I_ErrorMsg text                                                  -> errors swallowed/reworded
//   D8 FOREIGN    pending I_Invoice rows not made by this filing -> refused and named                                                                      -> the door files someone else's import
//   D10 NOSAVED   a tagged cell the host reports as a formula with no saved result (G20 / G8, G9) -> REFUSED naming the cell and the reason, nothing declared, journal unchanged; an unfilled row's flagged amount is not read   -> a check silently off on a re-saved file (§12)
//   D11 CHECKS    every verdict says which checks ran (checks: line= subtotal= grandtotal= linenet=); a blank subtotal / no subtotal tag says absent; a tagged-but-blank figure adds 'not checked' to the status cell      -> a skipped check looks like a passed one (§12)
//   D12 REVIEW    (SHEET_FRONT_DOOR §24.1) the door passes NO DocAction: the invoice is what legacy's Import Invoice default (PR) gives - DocStatus IP (MInvoice.prepareIt returns STATUS_InProgress, MInvoice.java:1814),
//                 DocAction CO, Posted N, Processed N, NO Fact_Acct row; the window's own Complete path (ModelLayer DOCACTION = runWorkflow) then completes + posts it with the entries the old one-press flow made;
//                 a template that asks for CO is REFUSED in words (nothing declared); PR / blank file as before                                  -> the door completes and posts a document nobody has looked at
//   D9 LEDGER     a filing is ONE signed journal entry; as a workbook ledger line it verifies, replays to the same books, refuses a hand edit             -> the workbook cannot rebuild its books
// Mutants (SDOOR_MUTANTS=1): each rewrites a COPY of sheet_door.js (the text must match exactly once, else NOT-APPLIED), a child run must print FAIL for the named case.
// Command: node erp/tests/witness_sheet_door.js     (SDOOR_MUTANTS=1 adds the mutant sweep)
'use strict';
var fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
if (!global.window) global.window = {};
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
var ERP = path.join(__dirname, '..');
var ENGINE = process.env.SDOOR_ENGINE || path.join(ERP, 'sheet_door.js');
var MUTANT = process.env.SDOOR_MUTANT || '';
if (!process.env.SQLJS) process.env.SQLJS = process.env.SQLJS_DIR || '/home/red1/bim-ootb/tests/node_modules/sql.js';   // ws_kernel.load reads it
var _log = console.log, SHIPPED = [];
console.log = function () { SHIPPED.push(Array.prototype.join.call(arguments, ' ')); };   // the kernel's own § lines: captured, re-printed selectively
function say(s) { _log(s); }
var CASES = {}, ALL = { judged: 0, failed: 0 };
function J(x) { return JSON.stringify(x); }
function check(cs, key, rule, ok, info) {
  var c = CASES[cs] = CASES[cs] || { judged: 0, failed: 0 }; c.judged++; ALL.judged++; if (!ok) { c.failed++; ALL.failed++; }
  say('  §SDOOR-CHECK case=' + cs + ' key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' rule="' + rule + '"' + (ok ? '' : ' got=' + J(info)));
}
async function guard(cs, key, rule, fn) { try { await fn(); } catch (e) { check(cs, key, rule, false, 'threw: ' + (e && (e.stack || e.message) || String(e))); } }
function verdict(cs) { var c = CASES[cs] || { judged: 0, failed: 0 }; var v = !c.judged ? 'INCONCLUSIVE' : c.failed ? 'FAIL' : 'PASS'; say('§SDOOR-' + cs + ' verdict=' + v + ' judged=' + c.judged + ' failed=' + c.failed + (MUTANT ? ' mutant=' + MUTANT : '')); return v; }

var SD = require(ENGINE);
var S = { clientId: 11, orgId: 11, userId: 100, roleId: 102, warehouseId: 103, actor: 'witness:sheet-door' };
var OPTS = { AD_Client_ID: 11, AD_Org_ID: 11 };

// ── one fresh GardenWorld kernel per scenario (the fingerprint compares two independent books) ──
async function boot() {                                                 // the kernel's OWN boot (ws_kernel.load: seed + patch + every boot overlay incl. ad_import_tables)
  var k = await require(path.join(ERP, 'ws_kernel.js')).load(), ML = k.ML, AP = require(path.join(ERP, 'ad_process.js'));
  function commit(fn) {                                                   // = ws_kernel inTrx: ONE Trx, on ok the op group is journalled, on ok:false it is dropped
    var trx = new ML.Trx(k.q, k.env(S)), r;
    try { r = fn(trx) || { ok: true }; } catch (ex) { r = { ok: false, error: 'threw: ' + (ex && ex.stack || ex) }; }
    var ok = r.ok !== false, ops = ok ? trx.groupOps() : [], j0 = k.journal.length;
    if (ok && ops.length) k.commit(S, ops, { ws: 'sheet_door' });
    trx.log.forEach(function (l) { if (/^§(SHEET_DOOR|IMPORT_INVOICE|PROC-UNPORTED)/.test(l)) SHIPPED.push(l); });
    return { r: r, ok: ok, ops: ops, journal: k.journal.length - j0, log: trx.log.slice() };
  }
  function door(tpl, cells, extra) { return commit(function (trx) { return SD.file(trx, { AP: AP, ML: ML }, tpl, cells, Object.assign({}, OPTS, extra || {})); }); }
  function direct(rows, docAction) {                                     // the oracle path: rows straight into I_Invoice + AD_Process 207, no door; no docAction = the process's own default (PR)
    return commit(function (trx) {
      for (var i = 0; i < rows.length; i++) { var sv = ML.save(trx, 'i_invoice', null, ML.newPO(trx, 'i_invoice', rows[i])); if (!sv.ok) return { ok: false, error: sv.error }; }
      var prm = { AD_Client_ID: 11, AD_Org_ID: 11 }; if (docAction) prm.DocAction = docAction;
      var p = AP.runInTrx(trx, 207, { params: prm }); return { ok: p.ok, error: p.summary };
    });
  }
  function complete(docno) {                                             // the ERP window's own Complete: ModelLayer DOCACTION = runWorkflow (crud_overlay completeFanout -> modelRun), one Trx, one journal entry
    var id = (k.q('SELECT c_invoice_id AS i FROM c_invoice WHERE documentno=?', [docno])[0] || {}).i;
    return commit(function (trx) { var r = ML.runWorkflow(trx, 'c_invoice', id, 'CO'); return { ok: r.ok, status: r.status, error: r.msg || r.error }; });
  }
  function fingerprint(docno) {
    var inv = k.q('SELECT * FROM c_invoice WHERE documentno=?', [docno]);
    return J(inv.map(function (i) {
      var ls = k.q('SELECT line, m_product_id, c_charge_id, qtyinvoiced, priceactual, linenetamt, c_tax_id, description FROM c_invoiceline WHERE c_invoice_id=? ORDER BY line', [i.c_invoice_id]);
      var fa = k.q('SELECT account_id, amtacctdr, amtacctcr FROM fact_acct WHERE ad_table_id=318 AND record_id=? ORDER BY account_id, amtacctdr, amtacctcr', [i.c_invoice_id]);
      return { h: [i.c_bpartner_id, i.c_doctype_id, i.issotrx, i.documentno, String(i.dateinvoiced).slice(0, 10), i.docstatus, i.totallines, i.grandtotal, i.c_currency_id, i.posted], l: ls, f: fa };
    }));
  }
  return { k: k, door: door, direct: direct, complete: complete, fingerprint: fingerprint, commit: commit, ML: ML };
}

// ── the invoice the user prints (GardenWorld: customer C&W, products Oak / Elm, explicit prices) ──
var DOCNO = 'SDOOR-0001', DATE = '2026-11-20';
var LINES = [{ product: 'Oak', description: 'Oak tree, 2m', qty: '2', price: '61.75', amount: '123.50' }, { product: 'Elm', description: 'Elm tree', qty: '3', price: '10.00', amount: '30.00' }];
var SUBTOTAL = '153.50';
// layout A: header top-right, lines from row 8, columns B..G
var TPL_A = { kind: 'invoice', fixed: { issotrx: 'Y', doctypename: 'AR Invoice', iso_code: 'USD' },
  header: { partner: 'B3', date: 'F3', docno: 'F2', subtotal: 'G20', grandtotal: 'G22', status: 'G24' },
  lines: { from: 8, to: 18, cols: { product: 'B', description: 'C', qty: 'D', price: 'E', amount: 'G' } } };
// layout B: a different sheet - header down the left, lines from row 30, other columns, amount after price
var TPL_B = { kind: 'invoice', fixed: { issotrx: 'Y', doctypename: 'AR Invoice', iso_code: 'USD' },
  header: { partner: 'C5', date: 'C6', docno: 'C4', subtotal: 'K50', grandtotal: 'K52', status: 'A60' },
  lines: { from: 30, to: 45, cols: { product: 'A', description: 'B', qty: 'H', price: 'J', amount: 'K' } } };
function sheet(tpl, o) {
  o = o || {}; var c = {}, H = tpl.header, L = tpl.lines;
  c[H.partner] = o.partner || 'C&W'; c[H.date] = DATE; c[H.docno] = o.docno === undefined ? DOCNO : o.docno;
  (o.lines || LINES).forEach(function (l, i) { var r = L.from + i; Object.keys(l).forEach(function (k) { c[L.cols[k] + r] = l[k]; }); });
  c[H.subtotal] = o.subtotal || SUBTOTAL; if (o.grand != null) c[H.grandtotal] = o.grand;
  c.Z99 = 'a cell the template does not name';
  c[L.cols.product + (L.from - 3)] = 'Deliver to site';   // a DECOY just above the line range in the product column: a reader that ignores the template's range picks it up (scope falsifier, M2)
  return c;
}
function directRows(docno, partner) {
  return LINES.map(function (l) { return { i_isimported: 'N', qtyordered: l.qty, issotrx: 'Y', doctypename: 'AR Invoice', iso_code: 'USD', bpartnervalue: partner || 'C&W', dateinvoiced: DATE + ' 00:00:00', dateacct: DATE + ' 00:00:00', documentno: docno, productvalue: l.product, description: l.description, priceactual: l.price }; });
}

(async function main() {
  say('§SDOOR-LOAD engine=' + ENGINE + ' mutant=' + (MUTANT || 'none'));

  // ═══ oracle: the direct legacy path (also gives the grand total the books compute, printed on the sheet below) ═══
  var O = (await boot()), oRun = O.direct(directRows(DOCNO)), FP_DIRECT = O.fingerprint(DOCNO);
  var oInv = O.k.q('SELECT grandtotal, totallines, docstatus, docaction, posted, processed FROM c_invoice WHERE documentno=?', [DOCNO])[0] || {};
  var oFacts = O.k.q('SELECT count(*) AS n FROM fact_acct f JOIN c_invoice i ON i.c_invoice_id=f.record_id WHERE f.ad_table_id=318 AND i.documentno=?', [DOCNO])[0].n;
  var GRAND = oInv.grandtotal != null ? String(oInv.grandtotal) : null;
  say('§SDOOR-ORACLE direct(default DocAction) ok=' + oRun.ok + ' journal=' + oRun.journal + ' invoice=' + J(oInv) + ' factRows=' + oFacts + ' fingerprintBytes=' + FP_DIRECT.length);
  var oracleOk = oRun.ok && oInv.docstatus === 'IP' && oInv.posted === 'N' && Number(oFacts) === 0 && GRAND != null && Number(oInv.totallines) === 153.5;
  // the OLD one-press result (DocAction CO straight through Import Invoice): the entries the window's Complete must still make
  var OC = (await boot()), ocRun = OC.direct(directRows(DOCNO), 'CO'), FP_CO = OC.fingerprint(DOCNO), ocFacts = OC.k.q('SELECT count(*) AS n FROM fact_acct f JOIN c_invoice i ON i.c_invoice_id=f.record_id WHERE f.ad_table_id=318 AND i.documentno=?', [DOCNO])[0].n;
  say('§SDOOR-ORACLE direct(DocAction CO, the old one-press flow) ok=' + ocRun.ok + ' factRows=' + ocFacts + ' fingerprintBytes=' + FP_CO.length);

  // ═══ D1 EQUIV + D9 ONE-GROUP + D5 (named docno) ═══
  var A = (await boot()), runA = null;
  await guard('D1', 'equiv', 'door (layout A) fingerprint == direct I_Invoice + AD_Process 207 fingerprint', async function () {
    runA = A.door(TPL_A, sheet(TPL_A, { grand: GRAND }));
    var fp = A.fingerprint(DOCNO);
    check('D1', 'oracle', 'the oracle run itself is real: ok, IN PROGRESS (legacy\'s Import Invoice default PR), Posted N, no Fact_Acct row, total lines 153.50 (2 x 61.75 + 3 x 10.00), a grand total exists', oracleOk, { ok: oRun.ok, inv: oInv, facts: oFacts });
    check('D1', 'filed', 'the door filed (ok, verdict FILED)', runA.ok && runA.r.verdict === 'FILED', { ok: runA.ok, v: runA.r.verdict, reason: runA.r.reason });
    check('D1', 'equiv', 'fingerprints identical (header incl. DocStatus, lines qty/price/net/tax, Fact_Acct = none)', oracleOk && fp === FP_DIRECT && fp !== '[]', { door: fp.slice(0, 400), direct: FP_DIRECT.slice(0, 400) });
  });
  await guard('D9', 'one-group', 'the filing is ONE signed journal entry; that entry, as the line the workbook keeps, verifies and replays into a fresh kernel to the same books', async function () {
    check('D9', 'journal', 'journal grew by exactly 1', !!runA && runA.journal === 1, runA && runA.journal);
    var e = A.k.journal[A.k.journal.length - 1], tbls = {}; ((e && e.payload && e.payload.ops) || []).forEach(function (o) { tbls[String(o.table || '').toLowerCase()] = 1; });
    check('D9', 'group', 'the entry holds the c_invoice + c_invoiceline + c_invoicetax + i_invoice writes and NO fact_acct write (the filed document is not posted, §24.1)', ['c_invoice', 'c_invoiceline', 'c_invoicetax', 'i_invoice'].every(function (t) { return tbls[t]; }) && !tbls.fact_acct, Object.keys(tbls));
    var line = J(e), K = require(path.join(ERP, 'ws_kernel.js')), v = K.verifyJournal(line);
    check('D9', 'verifies', 'the ledger line verifies (hash chain + digest)', v.ok === true, v);
    var R = await boot(), rp = R.k.replay(line);
    check('D9', 'replay', 'replaying the ledger line into a fresh kernel gives the same fingerprint as the filing (the workbook can rebuild its books)', rp.replayed === 1 && R.fingerprint(DOCNO) === FP_DIRECT, { rp: rp, fp: R.fingerprint(DOCNO).slice(0, 200) });
    var bad = JSON.parse(line); bad.payload.ops[0].fields.qtyordered = '999';
    var threw = null; try { (await boot()).k.replay(J(bad)); } catch (ex) { threw = ex.message; }
    check('D9', 'tamper', 'a ledger line edited by hand (one field) is refused on replay', !!threw && /digest/.test(threw), threw);
  });
  await guard('D5', 'named', 'a typed docno is written back unchanged; writes name only the docno + status cells', async function () {
    var w = runA.r.writes, cells = w.map(function (x) { return x.cell; }).sort();
    check('D5', 'only-tags', 'writes touch exactly {docno F2, status G24}', J(cells) === J(['F2', 'G24']), cells);
    var dn = w.filter(function (x) { return x.cell === TPL_A.header.docno; })[0];
    check('D5', 'docno', 'the docno cell gets the filed DocumentNo ' + DOCNO, !!dn && dn.value === DOCNO, dn);
  });

  // ═══ D2 LAYOUT ═══
  await guard('D2', 'layout', 'the same invoice in layout B (other cells, lines from row 30, a decoy at A27) gives the identical fingerprint', async function () {
    var B = (await boot()), rb = B.door(TPL_B, sheet(TPL_B, { grand: GRAND }));
    check('D2', 'filed', 'layout B filed', rb.ok && rb.r.verdict === 'FILED', { v: rb.r.verdict, reason: rb.r.reason });
    check('D2', 'layout', 'fingerprint(layout B) == fingerprint(direct) == fingerprint(layout A)', B.fingerprint(DOCNO) === FP_DIRECT && FP_DIRECT !== '[]', B.fingerprint(DOCNO).slice(0, 300));
  });

  // ═══ D3 SUBTOTAL / line arithmetic ═══
  await guard('D3', 'subtotal', 'subtotal printed 0.01 high -> refused, nothing journalled, both numbers named', async function () {
    var C = (await boot()), j0 = C.k.journal.length, r = C.door(TPL_A, sheet(TPL_A, { subtotal: '153.51', grand: GRAND }));
    check('D3', 'subtotal', 'refused, journal unchanged, no c_invoice, reason names 153.50 and 153.51', !r.ok && r.r.verdict === 'REFUSED' && C.k.journal.length === j0 && C.fingerprint(DOCNO) === '[]' && /153\.50/.test(r.r.reason) && /153\.51/.test(r.r.reason), { ok: r.ok, v: r.r.verdict, reason: r.r.reason });
    var st = r.r.writes.filter(function (x) { return x.cell === TPL_A.header.status; })[0];
    check('D3', 'status', 'the status cell tells the user why (Not filed: ...), and the docno cell is NOT written', !!st && /^Not filed: /.test(st.value) && !r.r.writes.some(function (x) { return x.cell === 'F2'; }), r.r.writes);
  });
  await guard('D3', 'line', 'a row whose qty x price != its printed amount -> refused naming that row', async function () {
    var C = (await boot()), bad = JSON.parse(J(LINES)); bad[1].amount = '31.00';
    var r = C.door(TPL_A, sheet(TPL_A, { lines: bad, subtotal: '154.50', grand: GRAND }));
    check('D3', 'line', 'refused, reason names row 9 and 30.00 vs 31.00, no invoice', !r.ok && /row 9/.test(r.r.reason) && /30\.00/.test(r.r.reason) && /31\.00/.test(r.r.reason) && C.fingerprint(DOCNO) === '[]', r.r.reason);
  });

  // ═══ D4 GRANDTOTAL ═══
  await guard('D4', 'grand', 'printed grand total 0.01 off the filed one -> refused, transaction dropped', async function () {
    var C = (await boot()), j0 = C.k.journal.length, g = (Math.round(Number(GRAND) * 100) + 1) / 100;
    var r = C.door(TPL_A, sheet(TPL_A, { grand: g.toFixed(2) }));
    check('D4', 'grand', 'refused, journal unchanged, no invoice, I_Invoice empty, reason names both totals', !r.ok && C.k.journal.length === j0 && C.fingerprint(DOCNO) === '[]' &&
      C.k.q('SELECT count(*) AS n FROM i_invoice')[0].n === 0 && r.r.reason.indexOf(g.toFixed(2)) >= 0, { ok: r.ok, reason: r.r.reason, grand: GRAND });
  });

  // ═══ D5 minted docno ═══
  await guard('D5', 'minted', 'a blank docno: legacy mints the number and the door writes it back', async function () {
    var C = (await boot()), r = C.door(TPL_A, sheet(TPL_A, { docno: '', grand: GRAND }));
    var dn = r.r.writes.filter(function (x) { return x.cell === 'F2'; })[0], inv = dn && C.k.q('SELECT documentno FROM c_invoice WHERE documentno=? AND c_bpartner_id=117', [dn.value]);
    check('D5', 'minted', 'filed, the docno cell gets a non-empty number that IS the filed invoice\'s DocumentNo', r.ok && !!dn && !!dn.value && inv.length === 1, { ok: r.ok, reason: r.r.reason, dn: dn });
    var nl = inv && inv.length ? C.k.q('SELECT count(*) AS n FROM c_invoiceline l JOIN c_invoice i ON i.c_invoice_id=l.c_invoice_id WHERE i.documentno=?', [dn.value])[0].n : 0;
    check('D5', 'minted-one', 'the two blank-number lines are ONE invoice with 2 lines (legacy groups a blank DocumentNo, ImportInvoice.java:674-680; the Import Loader leaves it NULL, ImpFormat.java:640-680)', Number(nl) === 2, nl);
  });

  // ═══ D6 VACUOUS ═══
  await guard('D6', 'empty', 'no filled line -> INCONCLUSIVE, nothing filed', async function () {
    var C = (await boot()), j0 = C.k.journal.length, r = C.door(TPL_A, sheet(TPL_A, { lines: [], grand: GRAND }));
    check('D6', 'empty', 'verdict INCONCLUSIVE, ok false, journal unchanged', !r.ok && r.r.verdict === 'INCONCLUSIVE' && C.k.journal.length === j0, { v: r.r.verdict, reason: r.r.reason });
  });

  // ═══ D7 LEGACY ERROR ═══
  await guard('D7', 'no-bp', 'a partner that does not exist -> no invoice, the status cell carries legacy\'s I_ErrorMsg text', async function () {
    var C = (await boot()), j0 = C.k.journal.length, r = C.door(TPL_A, sheet(TPL_A, { partner: 'NO-SUCH-CO', grand: GRAND }));
    var st = r.r.writes.filter(function (x) { return x.cell === TPL_A.header.status; })[0];
    check('D7', 'no-bp', 'refused, journal unchanged, status text contains legacy "ERR=" text (ImportInvoice.java literal)', !r.ok && C.k.journal.length === j0 && !!st && /ERR=/.test(st.value), { reason: r.r.reason, st: st });
  });

  // ═══ D8 FOREIGN ROWS ═══
  await guard('D8', 'foreign', 'a pending I_Invoice row from elsewhere -> refused and named, the foreign row untouched', async function () {
    var C = (await boot()), d = { ok: true };
    var f = C.commit(function (trx) { return C.ML.save(trx, 'i_invoice', null, C.ML.newPO(trx, 'i_invoice', { i_isimported: 'N', documentno: 'OTHER-1', bpartnervalue: 'C&W', productvalue: 'Oak', qtyordered: '1' })); });
    var r = C.door(TPL_A, sheet(TPL_A, { grand: GRAND })), other = C.k.q("SELECT i_isimported FROM i_invoice WHERE documentno='OTHER-1'");
    check('D8', 'foreign', 'refused naming 1 pending row, no SDOOR invoice, OTHER-1 still pending', f.ok && !r.ok && /1 pending/.test(r.r.reason) && C.fingerprint(DOCNO) === '[]' && other.length === 1 && other[0].i_isimported !== 'Y', { f: f.ok, reason: r.r.reason, other: other, d: d.ok });
  });

  // ═══ D10 NOSAVED + D11 CHECKS (§12): a check that cannot run must say so ═══
  var stText = function (r) { var w = r.r.writes.filter(function (x) { return x.cell === TPL_A.header.status; })[0]; return w ? String(w.value) : ''; };
  await guard('D10', 'subtotal', 'the host says G20 (the printed subtotal) holds a formula with no saved result: REFUSED, G20 named with the reason, journal unchanged, no invoice', async function () {
    var C = (await boot()), j0 = C.k.journal.length, c = sheet(TPL_A, { grand: GRAND }); c.G20 = null;
    var r = C.door(TPL_A, c, { noSavedResult: ['G20'] });
    check('D10', 'refused', 'REFUSED (not FILED) and the reason names cell G20 and "formula with no saved result"', !r.ok && r.r.verdict === 'REFUSED' && /cell G20 holds a formula with no saved result/.test(r.r.reason), { v: r.r.verdict, reason: r.r.reason });
    check('D10', 'plain-words', 'the status cell says "Not filed: cell G20 holds a formula with no saved result; open and save the file in your spreadsheet program, or type the figure"', stText(r) === 'Not filed: cell G20 holds a formula with no saved result; open and save the file in your spreadsheet program, or type the figure', stText(r));
    check('D10', 'no-trace', 'zero journal entries and no invoice declared', C.k.journal.length === j0 && C.fingerprint(DOCNO) === '[]' && C.k.q('SELECT count(*) AS n FROM i_invoice')[0].n === 0, { j: C.k.journal.length - j0 });
    check('D10', 'says-which', 'the verdict says subtotal=no-saved-result and the other checks were not reached', r.r.ran.subtotal === 'no-saved-result' && r.r.ran.grandtotal === 'not-reached' && /subtotal=no-saved-result/.test(r.r.checksLine), r.r.checksLine);
  });
  await guard('D10', 'amounts', 'the host says G8 and G9 (two line amounts) have no saved result: REFUSED naming both', async function () {
    var C = (await boot()), j0 = C.k.journal.length, c = sheet(TPL_A, { grand: GRAND }); c.G8 = null; c.G9 = null;
    var r = C.door(TPL_A, c, { noSavedResult: ['G8', 'G9'] });
    check('D10', 'two', 'REFUSED, the reason says "cells G8 and G9 hold formulas with no saved result", journal unchanged', !r.ok && /cells G8 and G9 hold formulas with no saved result/.test(r.r.reason) && C.k.journal.length === j0 && r.r.ran.line === 'no-saved-result', { reason: r.r.reason });
  });
  await guard('D10', 'unfilled', 'a flagged amount on an UNFILLED row (G12, no product printed) is not read: the filing goes through', async function () {
    var C = (await boot()), c = sheet(TPL_A, { grand: GRAND }), r = C.door(TPL_A, c, { noSavedResult: ['G12', 'G18'] });
    check('D10', 'not-over-refused', 'FILED, every check ran', r.ok && r.r.verdict === 'FILED' && r.r.checksLine === 'checks: line=ran subtotal=ran grandtotal=ran linenet=ran', { v: r.r.verdict, reason: r.r.reason, c: r.r.checksLine });
  });
  await guard('D10', 'control', 'the SAME cells with the figure absent and NO flag (a sheet that never printed a subtotal) still file: a blank is blank, but now it is said', async function () {
    var C = (await boot()), c = sheet(TPL_A, { grand: GRAND }); c.G20 = null; var r = C.door(TPL_A, c);
    check('D10', 'blank-files', 'FILED with subtotal=absent', r.ok && r.r.verdict === 'FILED' && r.r.ran.subtotal === 'absent', { v: r.r.verdict, ran: r.r.ran });
  });
  await guard('D11', 'normal', 'the normal workbook files as before (the D1 filing: oracle fingerprint) and says every check ran', async function () {
    check('D11', 'all-ran', 'checks: line=ran subtotal=ran grandtotal=ran linenet=ran, and the status cell is the plain "Filed <no> (In Progress)", the status in words', !!runA && runA.r.checksLine === 'checks: line=ran subtotal=ran grandtotal=ran linenet=ran' && /^Filed SDOOR-0001 \(In Progress\)$/.test(stText(runA)), { c: runA && runA.r.checksLine, st: runA && stText(runA) });
    check('D11', 'logged', 'the shipped §SHEET_DOOR log line carries the same checks list', SHIPPED.some(function (l) { return /^§SHEET_DOOR verdict=FILED/.test(l) && /checks: line=ran subtotal=ran grandtotal=ran linenet=ran/.test(l); }), null);
  });
  await guard('D11', 'untagged', 'a template that does not tag a subtotal files and says subtotal=absent; a tagged but EMPTY subtotal says absent and the status cell adds "not checked"', async function () {
    var C = (await boot()), tpl = JSON.parse(J(TPL_A)); delete tpl.header.subtotal; var r = C.door(tpl, sheet(tpl, { grand: GRAND }));
    check('D11', 'no-tag', 'FILED, subtotal=absent, the status cell has no "not checked" (the template never claimed one)', r.ok && r.r.ran.subtotal === 'absent' && /subtotal=absent/.test(r.r.checksLine) && !/not checked/.test(stText(r)), { v: r.r.verdict, c: r.r.checksLine, st: stText(r) });
    var C2 = (await boot()), c = sheet(TPL_A, { grand: GRAND }); c.G20 = null; var r2 = C2.door(TPL_A, c);
    check('D11', 'tagged-empty', 'FILED, subtotal=absent, the status cell says "; not checked: subtotal (none printed)"', r2.ok && /subtotal=absent/.test(r2.r.checksLine) && /Filed SDOOR-0001 \(In Progress\); not checked: subtotal \(none printed\)/.test(stText(r2)), { c: r2.r.checksLine, st: stText(r2) });
    var C3 = (await boot()), r3 = C3.door(TPL_A, sheet(TPL_A, {}));
    check('D11', 'no-grand', 'no grand total printed: FILED, grandtotal=absent, "not checked: grandtotal (none printed)"', r3.ok && /grandtotal=absent/.test(r3.r.checksLine) && /not checked: grandtotal \(none printed\)/.test(stText(r3)), { c: r3.r.checksLine, st: stText(r3) });
  });

  // ═══ D12 REVIEW (§24.1): the door stops at an unposted document; the ERP's own Complete does the rest ═══
  await guard('D12', 'prepared', 'after the door filed layout A: DocStatus IP, DocAction CO, Posted N, Processed N, NO Fact_Acct row; the shipped Import Invoice line says docAction=PR (the dictionary default, the door sent none)', async function () {
    var inv = A.k.q('SELECT c_invoice_id, docstatus, docaction, posted, processed FROM c_invoice WHERE documentno=?', [DOCNO]), fa = inv.length ? A.k.q('SELECT count(*) AS n FROM fact_acct WHERE ad_table_id=318 AND record_id=?', [inv[0].c_invoice_id])[0].n : -1;
    check('D12', 'filed', 'the door filed (the population judged is not empty: exactly one invoice)', !!runA && runA.ok && inv.length === 1, { ok: runA && runA.ok, n: inv.length });
    check('D12', 'status', 'DocStatus is IP (legacy: MInvoice.prepareIt returns STATUS_InProgress, MInvoice.java:1814, DocumentEngine.processIt stores it), DocAction CO, Posted N, Processed N', inv.length === 1 && inv[0].docstatus === 'IP' && inv[0].docaction === 'CO' && inv[0].posted === 'N' && inv[0].processed === 'N', inv);
    check('D12', 'no-entries', 'NO Fact_Acct row exists for it (nothing is posted)', inv.length === 1 && Number(fa) === 0, { facts: fa });
    var il = (runA && runA.log || []).filter(function (l) { return /^§IMPORT_INVOICE /.test(l); }).join(' | ');
    check('D12', 'default-sent', 'the filing\'s own §IMPORT_INVOICE line says docAction=PR and never docAction=CO', /docAction=PR\b/.test(il) && !/docAction=CO\b/.test(il), il);
    check('D12', 'words', 'the status the user is told is read from the record: the filing\'s result carries docstatus IP and its name "In Progress"', !!runA && runA.r.invoice && runA.r.invoice.docstatus === 'IP' && runA.r.invoice.docstatusname === 'In Progress', runA && runA.r.invoice);
  });
  await guard('D12', 'complete', 'the window\'s own Complete on the filed invoice completes and posts it with the entries the old one-press flow made', async function () {
    var c = A.complete(DOCNO), now = A.k.q('SELECT docstatus, posted, processed FROM c_invoice WHERE documentno=?', [DOCNO])[0] || {}, fa = A.k.q('SELECT count(*) AS n FROM fact_acct f JOIN c_invoice i ON i.c_invoice_id=f.record_id WHERE f.ad_table_id=318 AND i.documentno=?', [DOCNO])[0].n;
    check('D12', 'completed', 'Complete (ModelLayer DOCACTION = runWorkflow, the window\'s path) ok: DocStatus CO, Processed Y, Posted Y, Fact_Acct rows > 0', c.ok && now.docstatus === 'CO' && now.processed === 'Y' && now.posted === 'Y' && Number(fa) > 0, { c: c.r, now: now, facts: fa });
    check('D12', 'same-entries', 'the invoice after Complete has the SAME fingerprint as the old one-press flow (DocAction CO through Import Invoice): same header, lines, and every Fact_Acct row (account, debit, credit) - ' + ocFacts + ' rows', ocRun.ok && Number(ocFacts) > 0 && A.fingerprint(DOCNO) === FP_CO && FP_CO !== FP_DIRECT, { after: A.fingerprint(DOCNO).slice(0, 300), old: FP_CO.slice(0, 300) });
  });
  await guard('D12', 'refuse-co', 'a template that asks for CO is REFUSED in words and nothing is declared; blank and PR file as before', async function () {
    var C = (await boot()), j0 = C.k.journal.length, tco = JSON.parse(J(TPL_A)); tco.docAction = 'CO';
    var r = C.door(tco, sheet(tco, { grand: GRAND })), st = (r.r.writes.filter(function (x) { return x.cell === TPL_A.header.status; })[0] || {}).value;
    check('D12', 'refused', 'REFUSED, the reason says "this page files a document for review; complete it in the ERP", journal unchanged, no invoice, no I_Invoice row', !r.ok && r.r.verdict === 'REFUSED' && /this page files a document for review; complete it in the ERP/.test(r.r.reason) && C.k.journal.length === j0 && C.fingerprint(DOCNO) === '[]' && C.k.q('SELECT count(*) AS n FROM i_invoice')[0].n === 0, { v: r.r.verdict, reason: r.r.reason });
    check('D12', 'told', 'the status cell says exactly "Not filed: this page files a document for review; complete it in the ERP"', st === 'Not filed: this page files a document for review; complete it in the ERP', st);
    var C2 = (await boot()), tl = JSON.parse(J(TPL_A)); tl.docAction = ' co ';
    var r2 = C2.door(tl, sheet(tl, { grand: GRAND }));
    check('D12', 'refused-lower', 'a lower-case padded "co" is refused too', !r2.ok && r2.r.verdict === 'REFUSED' && C2.fingerprint(DOCNO) === '[]', r2.r.reason);
    var C3 = (await boot()), tp = JSON.parse(J(TPL_A)); tp.docAction = 'PR';
    var r3 = C3.door(tp, sheet(tp, { grand: GRAND })), C4 = (await boot()), tb = JSON.parse(J(TPL_A)); tb.docAction = '';
    var r4 = C4.door(tb, sheet(tb, { grand: GRAND }));
    check('D12', 'pr-blank-file', 'docAction "PR" and "" both file, each with the oracle fingerprint (In Progress, no entries)', r3.ok && r4.ok && C3.fingerprint(DOCNO) === FP_DIRECT && C4.fingerprint(DOCNO) === FP_DIRECT && FP_DIRECT !== '[]', { pr: r3.r.reason, blank: r4.r.reason });
  });

  var vs = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9', 'D10', 'D11', 'D12'].map(verdict);
  SHIPPED.filter(function (l) { return /^§SHEET_DOOR/.test(l); }).forEach(function (l) { say('  shipped: ' + l); });

  // ═══ MUTANTS ═══
  if (process.env.SDOOR_MUTANTS === '1' && !MUTANT) {
    var MUT = [
      { name: 'M1-qty-price-swapped', kills: 'D1', from: "qty: 'qtyordered', price: 'priceactual'", to: "qty: 'priceactual', price: 'qtyordered'" },
      { name: 'M2-line-start-hardcoded', kills: 'D2', from: 'for (var r = tpl.lines.from;', to: 'for (var r = 8;' },
      { name: 'M3-subtotal-check-skipped', kills: 'D3', from: 'if (!okS) {', to: 'if (false) {' },
      { name: 'M4-grandtotal-check-skipped', kills: 'D4', from: 'if (!okG) {', to: 'if (false) {' },
      { name: 'M6-formula-without-value-read-as-blank', kills: 'D10', from: 'if (nr.length) {', to: 'if (false) {' },
      { name: 'M7-unfilled-row-exemption-dropped', kills: 'D10', from: 'if (!filled) continue;', to: 'if (false) continue;' },
      { name: 'M8-flagged-list-ignored', kills: 'D10', from: "(nsr || []).forEach(function (a) { bad[a] = 1; });", to: "(nsr || []).forEach(function (a) { void a; });" },
      { name: 'M9-checks-list-not-reported', kills: 'D11', from: 'r.checksLine = ranLine(r.ran);', to: "r.checksLine = '';" },
      { name: 'M10-blank-subtotal-still-silent', kills: 'D11', from: "if (!printedSub) silent.push('subtotal');", to: '' },
      { name: 'M11-says-ran-when-not-compared', kills: 'D11', from: "res.ran.subtotal = 'absent'; var silent = [];", to: "res.ran.subtotal = 'ran'; var silent = [];" },
      { name: 'M12-door-passes-CO-again', kills: 'D12', from: 'AP.runInTrx(trx, 207, { params: { AD_Client_ID: C, AD_Org_ID: O }, stopAt: stopAt })', to: "AP.runInTrx(trx, 207, { params: { AD_Client_ID: C, AD_Org_ID: O, DocAction: 'CO' }, stopAt: stopAt })" },
      { name: 'M13-co-template-not-refused', kills: 'D12', from: "if (asked !== '' && asked !== 'PR') {", to: 'if (false) {' },
      { name: 'M14-status-shown-as-code', kills: 'D12', from: "return r && r.n ? r.n : String(code);", to: 'return String(code);' },
      { name: 'M5-docno-to-wrong-cell', kills: 'D5', from: 'res.writes.push({ cell: H.docno, value: inv.documentno });', to: 'res.writes.push({ cell: H.date, value: inv.documentno });' }
    ];
    var src = fs.readFileSync(ENGINE, 'utf8'), killed = 0, tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sdoor-mut-'));
    MUT.forEach(function (m) {
      var n = src.split(m.from).length - 1;
      if (n !== 1) { say('§SDOOR-MUTANT name=' + m.name + ' NOT-APPLIED matches=' + n); return; }
      var f = path.join(tmp, m.name + '.js'); fs.writeFileSync(f, src.replace(m.from, m.to));
      var out = cp.spawnSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { SDOOR_ENGINE: f, SDOOR_MUTANT: m.name, SDOOR_MUTANTS: '' }), encoding: 'utf8', maxBuffer: 64 << 20 }).stdout || '';
      var line = (out.match(new RegExp('§SDOOR-' + m.kills + ' verdict=\\w+[^\\n]*')) || [''])[0], k = /verdict=FAIL/.test(line);
      if (k) killed++;
      say('§SDOOR-MUTANT name=' + m.name + ' kills=' + m.kills + ' ' + (k ? 'KILLED' : 'SURVIVED') + ' child="' + line + '"');
    });
    say('§SDOOR-MUTANTS killed=' + killed + '/' + MUT.length);
    if (killed !== MUT.length) ALL.failed++;
  }
  var overall = !ALL.judged ? 'INCONCLUSIVE' : ALL.failed ? 'FAIL' : 'PASS';
  say('§SDOOR-VERDICT ' + overall + ' judged=' + ALL.judged + ' failed=' + ALL.failed + ' cases=' + J(vs));
  process.exit(overall === 'PASS' ? 0 : 1);
})().catch(function (e) { say('§SDOOR-VERDICT FAIL crashed: ' + (e && e.stack || e)); process.exit(1); });
