#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-SHEET-ADDIN (bim-compiler prompts/SHEET_FRONT_DOOR.md §8, slice S3). READ THE LOG after every run: every verdict is a
//   §SADDIN line; the exit code is not the evidence. INCONCLUSIVE when nothing was judged. A mutant that crashes is NOT a kill.
//   REAL EXCEL IS NOT RUN HERE (no Excel on the build machine): this proves the contract against a FAKE host and a FAKE Office.js only.
// SPEC (claims written in §8.2 before the code; each names the issue it exposes):
//   A1 READSET    File it reads on the visible sheet exactly the template's cells; a decoy in every neighbour is never read; no used-range read   -> the menu reads more than told
//   A2 WRITESET   writes applied == engine writes == {docno, status}; the workbook differs before/after only there                                  -> the menu writes outside its tags
//   A3 EQUIV      fingerprint of the invoice filed through the shim == the engine called directly; the shim holds no invoice word / cell address  -> logic hides in the menu
//   A4 REFUSED    wrong subtotal: only the status cell written, NO ledger row, kernel journal unchanged                                            -> a refusal leaves a ledger trace
//   A5 LEDGER     one filing = one row; verifies; replays to the same books; an edited chunk is refused; after reopen a 2nd filing chains          -> the workbook cannot rebuild its books
//   A6 STAMP      an entry > 32,767 chars is split and re-joins byte for byte; no-change Stamp is NO-OP and writes nothing; broken history refuses -> silent truncation / growth
//   A7 STORY      cell history lists every value with who/when; Check history catches a one-char edit in the LAST chunk of a split entry            -> tamper slips through
//   A8 EXCEL      the same shim through excel_host.js on a fake Office.js gives the same results as through the plain host                         -> the Excel layer adds/loses something
//   A9 MANIFEST   manifest.xml parses; ribbon actions == code actions (both ways); every resid resolves; URLs under the stated https base         -> a button that does nothing
//   A11 NOSAVED   a file host says G8/G9/G20 hold formulas with no saved result -> REFUSED, the three cells named, only the status cell written, no ledger row, journal unchanged; a normal sheet says checks: all ran   -> the adds-up check silently off (§12 D10/D11)
//   A10 VACUOUS   no _door_tags -> INCONCLUSIVE, no visible read, no write; Stamp on an empty workbook -> INCONCLUSIVE, no write                    -> an empty workbook passes
// Mutants (SADDIN_MUTANTS=1): each rewrites a COPY of a source file (text must match exactly once, else NOT-APPLIED); a child run must print FAIL for the named case.
// Command: node erp/tests/witness_sheet_addin.js     (SADDIN_MUTANTS=1 adds the sweep; SADDIN_ONLY=A1,A2 limits the phases run)
'use strict';
var fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
if (!global.window) global.window = {};
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
var ERP = path.join(__dirname, '..'), ADDIN = path.join(ERP, 'sheet_addin');
var SHIM = process.env.SADDIN_SHIM || path.join(ADDIN, 'host_shim.js');
var EXCEL = process.env.SADDIN_EXCEL || path.join(ADDIN, 'excel_host.js');
var MANIFEST = process.env.SADDIN_MANIFEST || path.join(ADDIN, 'manifest.xml');
var MUTANT = process.env.SADDIN_MUTANT || '';
var ONLY = (process.env.SADDIN_ONLY || '').split(',').filter(Boolean);
if (!process.env.SQLJS) process.env.SQLJS = process.env.SQLJS_DIR || '/home/red1/bim-ootb/tests/node_modules/sql.js';   // ws_kernel.load reads it
var _log = console.log, SHIPPED = [];
console.log = function () { SHIPPED.push(Array.prototype.join.call(arguments, ' ')); };   // the kernel's own § lines: captured, re-printed selectively
function say(s) { _log(s); }
var CASES = {}, ALL = { judged: 0, failed: 0 };
function J(x) { return JSON.stringify(x); }
function check(cs, key, rule, ok, info) {
  var c = CASES[cs] = CASES[cs] || { judged: 0, failed: 0 }; c.judged++; ALL.judged++; if (!ok) { c.failed++; ALL.failed++; }
  say('  §SADDIN-CHECK case=' + cs + ' key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' rule="' + rule + '"' + (ok ? '' : ' got=' + String(J(info)).slice(0, 600)));
}
async function guard(cs, key, rule, fn) { try { await fn(); } catch (e) { check(cs, key, rule, false, 'threw: ' + (e && (e.stack || e.message) || String(e))); } }
function verdict(cs) { var c = CASES[cs] || { judged: 0, failed: 0 }; var v = !c.judged ? 'INCONCLUSIVE' : c.failed ? 'FAIL' : 'PASS'; say('§SADDIN-' + cs + ' verdict=' + v + ' judged=' + c.judged + ' failed=' + c.failed + (MUTANT ? ' mutant=' + MUTANT : '')); return v; }
var wants = function (cs) { return !ONLY.length || ONLY.indexOf(cs) >= 0; };
var wantsAny = function (list) { return list.some(wants); };

var SA = require(SHIM), SX = require(EXCEL), SD = require(path.join(ERP, 'sheet_door.js')), SH = require(path.join(ERP, 'sheet_history.js'));
var K = require(path.join(ERP, 'ws_kernel.js')), AP = require(path.join(ERP, 'ad_process.js'));
var S = { clientId: 11, orgId: 11, userId: 100, roleId: 102, warehouseId: 103, actor: 'witness:sheet-addin' };
var OPTS = { AD_Client_ID: 11, AD_Org_ID: 11 };
var LIMIT = 32767;

var SF = require(path.join(__dirname, 'sheet_fakes.js')), Workbook = SF.Workbook, PlainHost = SF.PlainHost, FakeExcel = SF.FakeExcel, parseA1 = SF.parseA1, A1 = SF.A1;   // the fake hosts (shared with witness_sheet_wps.js)

// ═════════════ the books: a fresh kernel per scenario, the runner S1's D9 and ws_kernel.inTrx define ═════════════
async function boot() { return K.load(); }
function makeRunner() {
  var st = { K: null };
  return { st: st, file: async function (tpl, cells, ledgerLines, noSavedResult) {
    if (!st.K) { st.K = await boot(); if (ledgerLines.length) st.K.replay(ledgerLines.join('\n')); }            // a reopened workbook: its ledger is replayed first (S2), then the filing chains on
    var k = st.K, j0 = k.journal.length;
    var r = k.inTrx(S, { ws: 'sheet_door' }, function (trx) { return SD.file(trx, { AP: AP, ML: k.ML }, tpl, cells, Object.assign({ noSavedResult: noSavedResult || [] }, OPTS)); });
    (r.log || []).forEach(function (l) { if (/^§SHEET_DOOR/.test(l)) SHIPPED.push(l); });
    return { result: { ok: r.ok, verdict: r.verdict, reason: r.reason, writes: r.writes, checks: r.checks, invoice: r.invoice, ran: r.ran, checksLine: r.checksLine }, ledgerLine: k.journal.length > j0 ? J(k.journal[k.journal.length - 1]) : null };
  } };
}
function fingerprint(k, docno) {
  var inv = k.q('SELECT * FROM c_invoice WHERE documentno=?', [docno]);
  return J(inv.map(function (i) {
    var ls = k.q('SELECT line, m_product_id, c_charge_id, qtyinvoiced, priceactual, linenetamt, c_tax_id, description FROM c_invoiceline WHERE c_invoice_id=? ORDER BY line', [i.c_invoice_id]);
    var fa = k.q('SELECT account_id, amtacctdr, amtacctcr FROM fact_acct WHERE ad_table_id=318 AND record_id=? ORDER BY account_id, amtacctdr, amtacctcr', [i.c_invoice_id]);
    return { h: [i.c_bpartner_id, i.c_doctype_id, i.issotrx, i.documentno, String(i.dateinvoiced).slice(0, 10), i.docstatus, i.totallines, i.grandtotal, i.c_currency_id, i.posted], l: ls, f: fa };
  }));
}

// ═════════════ the sheet the user prints (GardenWorld: customer C&W, Oak / Elm) ═════════════
var DATA = { partner: 'C&W', date: '2026-11-20', docno: 'SDOOR-0001', lines: [{ product: 'Oak', description: 'Oak tree, 2m', qty: 2, price: 61.75, amount: 123.5 }, { product: 'Elm', description: 'Elm tree', qty: 3, price: 10, amount: 30 }], subtotal: 153.5 };
var TPL = { kind: 'invoice', fixed: { issotrx: 'Y', doctypename: 'AR Invoice', iso_code: 'USD' },
  header: { partner: 'B3', date: 'F3', docno: 'F2', subtotal: 'G20', grandtotal: 'G22', status: 'G24' },
  lines: { from: 8, to: 18, cols: { product: 'B', description: 'C', qty: 'D', price: 'E', amount: 'G' } } };
// the cells the template names, written out HERE by hand from §2 (not by tagCells): header partner/date/docno/subtotal/grandtotal + lines B,C,D,E,G x 8..18
var EXPECT = ['B3', 'F3', 'F2', 'G20', 'G22']; for (var rr = 8; rr <= 18; rr++) ['B', 'C', 'D', 'E', 'G'].forEach(function (c) { EXPECT.push(c + rr); });
EXPECT.sort();
var SERIAL = (Date.UTC(2026, 10, 20) - Date.UTC(1899, 11, 30)) / 86400000;       // Excel's day number of 2026-11-20, by epoch arithmetic (not by excel_host)
function buildInvoiceWB(kind, data, grand, o) {
  o = o || {}; var m = new Workbook(), ws = m.addSheet('Sheet1'), expect = {}; EXPECT.forEach(function (a) { expect[a] = 1; });
  for (var r = 1; r <= 30; r++) for (var c = 1; c <= 12; c++) { var a = A1(r, c); if (!expect[a] && a !== 'G24') ws.cells[a] = { v: 'DECOY-' + a, f: null }; }   // a decoy next to every range (header, line columns, rows above/below)
  ws.cells.Z99 = { v: 'a cell the template does not name', f: null }; ws.cells.G24 = { v: 'draft', f: null };
  var put = function (a, v, fmt) { ws.cells[a] = { v: v, f: null, fmt: fmt }; };
  put('B3', data.partner); put('F2', o.docno === undefined ? data.docno : o.docno);
  if (kind === 'excel') put('F3', SERIAL, 'yyyy-mm-dd'); else put('F3', data.date);
  data.lines.forEach(function (l, i) { var rw = 8 + i; put('B' + rw, l.product); put('C' + rw, l.description); put('D' + rw, l.qty); put('E' + rw, l.price); put('G' + rw, l.amount); });
  put('G20', o.subtotal !== undefined ? o.subtotal : data.subtotal); if (grand != null) put('G22', grand);
  if (!o.noTags) m.setHiddenRows('_door_tags', [SA.splitLine(J(TPL))]);
  m.resetLog(); return m;
}
var tick = 0, fixedNow = function () { tick++; return '2026-11-27T10:00:' + (tick < 10 ? '0' : '') + tick + '.000Z'; };
function mkShim(host, runner, extra) { return SA.create(host, Object.assign({ SheetDoor: SD, SheetHistory: SH, runner: runner || null, now: fixedNow }, extra || {})); }
function setOf(list, f) { return list.map(f).filter(function (x, i, a) { return a.indexOf(x) === i; }).sort(); }
function tamperLedgerLine(line) { return line.replace('"qtyordered":"2"', '"qtyordered":"9"'); }

// ═════════════ the sheet for the Stamp cases: > 32,767 characters of history in one entry ═════════════
function buildDataWB() {
  var m = new Workbook(); m.addSheet('Sheet1').cells.A1 = { v: 'small second sheet', f: null }; var ws = m.addSheet('Data');
  for (var i = 1; i <= 450; i++) ws.cells['A' + i] = { v: 'item ' + i + ' ' + (i % 50 === 0 ? 'emoji 😀 ' : '') + 'x'.repeat(100), f: null };
  ws.cells.B1 = { v: 5, f: null }; ws.cells.B2 = { v: 5, f: 'SUM(B1:B1)' };
  m.setHiddenRows('_door_tags', [SA.splitLine(J(TPL))]); m.resetLog(); return m;
}

(async function main() {
  say('§SADDIN-LOAD shim=' + SHIM + ' excel=' + EXCEL + ' manifest=' + MANIFEST + ' mutant=' + (MUTANT || 'none') + ' only=' + (ONLY.join(',') || 'all'));
  var FP_DIRECT = null, GRAND = null;
  if (wantsAny(['A1', 'A2', 'A3', 'A4', 'A5', 'A8', 'A11'])) {
    // ═══ prelude: the engine called DIRECTLY (no menu) on the same cell values - the oracle for A3 / A5 / A8, and the grand total the books compute ═══
    var KD = await boot(), direct = {}; direct[TPL.header.partner] = DATA.partner; direct[TPL.header.date] = DATA.date; direct[TPL.header.docno] = DATA.docno; direct[TPL.header.subtotal] = String(DATA.subtotal);
    DATA.lines.forEach(function (l, i) { var rw = 8 + i; direct['B' + rw] = l.product; direct['C' + rw] = l.description; direct['D' + rw] = String(l.qty); direct['E' + rw] = String(l.price); direct['G' + rw] = String(l.amount); });
    var d1 = KD.inTrx(S, { ws: 'sheet_door' }, function (trx) { return SD.file(trx, { AP: AP, ML: KD.ML }, TPL, direct, OPTS); });
    FP_DIRECT = fingerprint(KD, DATA.docno); var gi = KD.q('SELECT grandtotal FROM c_invoice WHERE documentno=?', [DATA.docno])[0]; GRAND = gi ? Number(gi.grandtotal) : null;
    say('§SADDIN-ORACLE direct ok=' + d1.ok + ' verdict=' + d1.verdict + ' grandtotal=' + GRAND + ' fingerprintBytes=' + FP_DIRECT.length);
  }

  var res1 = null, m1 = null, K1 = null, host1 = null, snap0 = null;
  if (wantsAny(['A1', 'A2', 'A3', 'A4', 'A5', 'A10', 'A11'])) {
    // ═══ FILE phase ═══
    var R1 = makeRunner();
    m1 = buildInvoiceWB('plain', DATA, GRAND); host1 = PlainHost(m1); var shim1 = mkShim(host1, R1); snap0 = m1.snapshotVisible();
    res1 = await shim1.fileIt(); K1 = R1.st.K;
    say('  shipped: verdict=' + res1.verdict + ' text="' + res1.text + '" writes=' + J(res1.writes.map(function (w) { return w.cell; })));

    await guard('A1', 'readset', 'the visible cells read == exactly the template\'s cells (hand-written list), each once, as single-cell reads; no decoy read; no used-range read', async function () {
      var vr = m1.visibleReads(), got = setOf(vr, function (r) { return r.addr; }), decoyRead = vr.filter(function (r) { return /^DECOY/.test(String((m1.sheets[r.sheet].cells[r.addr] || {}).v)); });
      check('A1', 'filed', 'the filing itself worked (FILED), so the read set was enough', res1.verdict === 'FILED', { v: res1.verdict, text: res1.text });
      check('A1', 'exact', 'read set == template cells (' + EXPECT.length + ' cells)', J(got) === J(EXPECT), { extra: got.filter(function (a) { return EXPECT.indexOf(a) < 0; }).slice(0, 12), missing: EXPECT.filter(function (a) { return got.indexOf(a) < 0; }).slice(0, 12), n: got.length });
      check('A1', 'once', 'each tagged cell read once (' + vr.length + ' reads)', vr.length === EXPECT.length, vr.length);
      check('A1', 'nodecoy', 'no decoy cell read', decoyRead.length === 0, decoyRead.slice(0, 5));
      check('A1', 'noused', 'no used-range (whole-sheet) read of a visible sheet; hidden sheets touched: only _door_tags and _door_ledger', m1.usedCalls === 0 && setOf(m1.reads.filter(function (r) { return /^_door_/.test(r.sheet); }), function (r) { return r.sheet; }).every(function (s) { return s === '_door_tags' || s === '_door_ledger'; }), { used: m1.usedCalls });
    });
    await guard('A2', 'writeset', 'writes applied == engine writes == {docno F2, status G24}; the workbook differs before/after only there; every decoy unchanged', async function () {
      var vw = setOf(m1.visibleWrites(), function (w) { return w.addr; }), ew = res1.writes.map(function (w) { return w.cell; }).sort(), snap1 = m1.snapshotVisible();
      var changed = Object.keys(snap1).filter(function (k) { return snap1[k] !== snap0[k]; }).concat(Object.keys(snap0).filter(function (k) { return !(k in snap1); }));
      var decoyHit = changed.filter(function (k) { return /DECOY|Z99/.test(snap0[k] || ''); });
      check('A2', 'applied', 'the cells written on the visible sheet == {F2, G24}', J(vw) === J(['F2', 'G24']), vw);
      check('A2', 'engine', 'the engine\'s own writes == {F2, G24} (the menu applied them all and nothing else)', J(ew) === J(['F2', 'G24']), ew);
      check('A2', 'diff', 'cell-by-cell diff of the whole workbook: only G24 changed (F2 already held the typed docno), to "Filed SDOOR-0001 (In Progress)"', J(changed.map(function (k) { return k.split('!')[1]; })) === J(['G24']) && JSON.parse(snap1['Sheet1!G24'])[0] === 'Filed SDOOR-0001 (In Progress)', { changed: changed, g24: snap1['Sheet1!G24'] });
      check('A2', 'decoys', 'no decoy cell changed', decoyHit.length === 0, decoyHit);
    });
    await guard('A3', 'equiv', 'the invoice filed through the shim has the same fingerprint as the engine called directly', async function () {
      var fp = fingerprint(K1, DATA.docno);
      check('A3', 'equiv', 'fingerprint(shim) == fingerprint(direct) (header, lines, Fact_Acct), non-empty', fp === FP_DIRECT && fp !== '[]', { shim: fp.slice(0, 300), direct: String(FP_DIRECT).slice(0, 300) });
      var src = fs.readFileSync(SHIM, 'utf8').replace(/\/\/.*$/gm, ''), words = src.match(/invoice|qty|price|partner|productvalue|docno|linenet|grandtotal|subtotal/ig) || [], addrs = src.match(/\b[A-Z]{1,2}[0-9]{1,3}\b/g) || [];
      check('A3', 'nologic', 'host_shim.js (comments stripped) holds no invoice word and no cell address', !words.length && !addrs.length, { words: words, addrs: addrs });
    });
    await guard('A4', 'refused', 'a wrong subtotal: only the status cell is written (Not filed: ...), NO ledger row, the kernel journal is unchanged', async function () {
      var m2 = buildInvoiceWB('plain', DATA, GRAND, { subtotal: 153.51 }), shim2 = mkShim(PlainHost(m2), R1), j0 = K1.journal.length, r2 = await shim2.fileIt();
      var vw = setOf(m2.visibleWrites(), function (w) { return w.addr; });
      check('A4', 'status-only', 'refused (REFUSED); the visible writes == {G24} only; the text starts "Not filed: " and names 153.5 and 153.51', r2.verdict === 'REFUSED' && J(vw) === J(['G24']) && /^Not filed: /.test(r2.text) && /153\.5\b/.test(r2.text) && /153\.51/.test(r2.text), { v: r2.verdict, vw: vw, text: r2.text });
      check('A4', 'no-ledger', 'no ledger row was added (the _door_ledger sheet holds 0 rows)', m2.hiddenRows('_door_ledger').length === 0, m2.hiddenRows('_door_ledger').length);
      check('A4', 'journal', 'the kernel journal did not grow', K1.journal.length === j0, { before: j0, after: K1.journal.length });
    });
    await guard('A11', 'nosaved', 'a file host reports G20, G8, G9 as formulas with no saved result: REFUSED, the three cells named with the reason, only the status cell written, NO ledger row, journal unchanged; the normal sheet reports its checks', async function () {
      var m3 = buildInvoiceWB('plain', DATA, GRAND);
      ['G8', 'G9', 'G20'].forEach(function (a) { m3.sheets.Sheet1.cells[a] = { v: null, f: a === 'G20' ? 'SUM(G8:G18)' : 'D' + a.slice(1) + '*E' + a.slice(1), noResult: true }; });
      var R3 = makeRunner(), shim3 = mkShim(PlainHost(m3), R3), r3 = await shim3.fileIt(), vw3 = setOf(m3.visibleWrites(), function (w) { return w.addr; });
      check('A11', 'refused', 'REFUSED; the text starts "Not filed: " and names G20, G8 and G9 and says "formulas with no saved result"; only G24 written', r3.verdict === 'REFUSED' && /^Not filed: /.test(r3.text) && /G20/.test(r3.text) && /G8/.test(r3.text) && /G9/.test(r3.text) && /no saved result/.test(r3.text) && /open and save the file/.test(r3.text) && J(vw3) === J(['G24']), { v: r3.verdict, text: r3.text, vw: vw3 });
      check('A11', 'no-trace', 'no ledger row, no kernel journal entry (the books engine was never asked to commit)', m3.hiddenRows('_door_ledger').length === 0 && (!R3.st.K || R3.st.K.journal.length === 0), { rows: m3.hiddenRows('_door_ledger').length });
      check('A11', 'checks-said', 'the result says which checks did not run: checks: line=no-saved-result subtotal=no-saved-result', /line=no-saved-result/.test(String(r3.checksLine)) && /subtotal=no-saved-result/.test(String(r3.checksLine)) && /grandtotal=not-reached/.test(String(r3.checksLine)), r3.checksLine);
      check('A11', 'normal', 'the normal sheet (no flag) is FILED and says checks: line=ran subtotal=ran grandtotal=ran linenet=ran', res1.verdict === 'FILED' && res1.checksLine === 'checks: line=ran subtotal=ran grandtotal=ran linenet=ran', { v: res1.verdict, c: res1.checksLine });
    });
    await guard('A5', 'ledger', 'one filing = one ledger row; it verifies, replays to the same books; after reopen a second filing chains; an edited chunk is refused', async function () {
      var rows = m1.hiddenRows('_door_ledger'), lines = rows.map(SA.joinRow);
      say('§SADDIN-COST ledgerRowChars=' + lines[0].length + ' chunks=' + rows[0].length + ' (one filing of 2 lines)');
      check('A5', 'one-row', 'the first filing added exactly 1 ledger row', rows.length === 1, rows.length);
      check('A5', 'verifies', 'the row verifies with SheetHistory.verify AND ws_kernel.verifyJournal', (await SH.verify(lines)).ok === true && K.verifyJournal(lines.join('\n')).ok === true, { sh: await SH.verify(lines), k: K.verifyJournal(lines.join('\n')) });
      var KR = await boot(), rp = KR.replay(lines.join('\n'));
      check('A5', 'replay', 'replayed into a fresh kernel: same fingerprint as the direct filing', rp.replayed === 1 && fingerprint(KR, DATA.docno) === FP_DIRECT, { rp: rp });
      // reopen: a NEW runner = a fresh kernel that replays the workbook's ledger before the next filing (the user changes the docno cell and files again)
      m1.sheets.Sheet1.cells.F2 = { v: 'SDOOR-0002', f: null }; var R2 = makeRunner(), shim1b = mkShim(host1, R2), res2 = await shim1b.fileIt();
      var rows2 = m1.hiddenRows('_door_ledger'), lines2 = rows2.map(SA.joinRow), e2 = lines2.length > 1 ? JSON.parse(lines2[1]) : {}, e1 = JSON.parse(lines2[0]);
      check('A5', 'chain', 'after reopen the second filing FILED and chained: 2 rows, seq 1 then 2, row 2 prev == row 1 hash, both verify', res2.verdict === 'FILED' && rows2.length === 2 && e1.seq === 1 && e2.seq === 2 && e2.prev === e1.hash && (await SH.verify(lines2)).ok && K.verifyJournal(lines2.join('\n')).ok, { v: res2.verdict, text: res2.text, n: rows2.length, e2: e2.seq });
      var KR2 = await boot(), rp2 = KR2.replay(lines2.join('\n')), fp2 = fingerprint(KR2, 'SDOOR-0002');
      check('A5', 'replay2', 'both rows replay into a fresh kernel: invoice 1 identical to the direct one, invoice 2 identical apart from its number', rp2.replayed === 2 && fingerprint(KR2, DATA.docno) === FP_DIRECT && fp2 !== '[]' && fp2.split('SDOOR-0002').join('SDOOR-0001') === FP_DIRECT, { rp: rp2 });
      // tamper: one field of ledger row 1 edited by hand (the same chunk edit a user could make in the hidden sheet)
      var line1 = lines2[0], bad = tamperLedgerLine(line1), badRows = SA.splitLine(bad); m1.setHiddenRows('_door_ledger', [badRows, SA.splitLine(lines2[1])]); m1.resetLog();
      var ch = await shim1b.checkHistory(), threw = null; try { (await boot()).replay([bad, lines2[1]].join('\n')); } catch (ex) { threw = ex.message; }
      check('A5', 'tamper-check', 'Check history on the edited ledger: BROKEN at entry 1 (payload)', ch.verdict === 'BROKEN' && ch.ledger.brokenAt === 1 && /payload/.test(ch.ledger.why), ch);
      check('A5', 'tamper-replay', 'the kernel also refuses to replay the edited row (digest)', !!threw && /digest/.test(threw), threw);
      check('A5', 'edit-real', 'the edit really changed the stored line (qtyordered 2 -> 9)', bad !== line1 && /"qtyordered":"9"/.test(bad), bad.length);
    });
  }
  if (wants('A10')) {
    await guard('A10', 'no-tags', 'no _door_tags: File it is INCONCLUSIVE, no visible cell read, nothing written', async function () {
      var m0 = buildInvoiceWB('plain', DATA, GRAND, { noTags: true }), s0 = mkShim(PlainHost(m0), makeRunner()), r0 = await s0.fileIt();
      check('A10', 'no-tags', 'INCONCLUSIVE; visible reads 0; writes 0', r0.verdict === 'INCONCLUSIVE' && m0.visibleReads().length === 0 && m0.writes.length === 0, { v: r0.verdict, reads: m0.visibleReads().length, writes: m0.writes.length });
    });
    await guard('A10', 'empty-stamp', 'Stamp on a workbook with no cells is INCONCLUSIVE and writes nothing', async function () {
      var me = new Workbook(); me.addSheet('Sheet1'); var se = mkShim(PlainHost(me)), re = await se.stamp();
      check('A10', 'empty-stamp', 'INCONCLUSIVE; hidden writes 0; writes 0', re.verdict === 'INCONCLUSIVE' && me.hiddenWrites === 0 && me.writes.length === 0, { v: re.verdict, hw: me.hiddenWrites });
    });
  }

  // ═══ STAMP phase (A6, A7) ═══
  if (wantsAny(['A6', 'A7'])) {
    await guard('A6', 'split', 'a surrogate pair at the cut point is never split', async function () {
      var line = 'a'.repeat(LIMIT - 1) + '😀' + 'b'.repeat(10), ch = SA.splitLine(line);
      check('A6', 'surrogate', 'splitLine backs up one unit: chunk 1 = 32,766 units, chunk 2 starts with the whole emoji, join == the line, every chunk <= 32,767', ch.length === 2 && ch[0].length === LIMIT - 1 && ch[1].indexOf('😀') === 0 && ch.join('') === line && ch.every(function (c) { return c.length <= LIMIT; }), ch.map(function (c) { return c.length; }));
    });
    var mS = buildDataWB(), hostS = PlainHost(mS, 'Aminah'), shimS = mkShim(hostS), st1 = null;
    await guard('A6', 'long', 'a history entry longer than 32,767 characters is split; every stored cell <= 32,767; re-joined it equals the entry byte for byte and verifies', async function () {
      st1 = await shimS.stamp(); var rows = mS.hiddenRows('_door_history'), full = J(st1.entry), stored = mS.sheets._door_history ? Object.keys(mS.sheets._door_history.cells).map(function (a) { return String(mS.sheets._door_history.cells[a].v).length; }) : [];
      say('§SADDIN-COST stampGenesisChars=' + full.length + ' cells=' + (st1.entry && st1.entry.payload.ops.length) + ' chunks=' + (rows[0] && rows[0].length) + ' maxStoredCell=' + Math.max.apply(null, stored) + ' bytesPerCell=' + Math.round(full.length / (st1.entry ? st1.entry.payload.ops.length : 1)));
      check('A6', 'recorded', 'Stamp 1 RECORDED the genesis entry (' + (st1.entry && st1.entry.payload.ops.length) + ' cells); the entry is longer than 32,767 chars (' + full.length + ')', st1.verdict === 'RECORDED' && full.length > LIMIT, { v: st1.verdict, len: full.length });
      check('A6', 'split', 'the entry is stored as one row of >= 2 chunks, every stored cell <= 32,767, none truncated by the host', rows.length === 1 && rows[0].length >= 2 && Math.max.apply(null, stored) <= LIMIT && mS.truncated === 0, { rows: rows.length, chunks: rows[0] && rows[0].length, max: Math.max.apply(null, stored), truncated: mS.truncated });
      check('A6', 'rejoin', 'the row re-joined == the entry (emoji cells included) in its ASCII-escaped form (§12 Rule 3: no character beyond U+FFFF stored), it parses back to the SAME entry, and ws_kernel.verifyJournal accepts it', rows.length === 1 && SA.escapeAstral(full) !== full && SA.joinRow(rows[0]) === SA.escapeAstral(full) && JSON.parse(SA.joinRow(rows[0])).payload && J(JSON.parse(SA.joinRow(rows[0]))) === J(JSON.parse(full)) && !/[\uD800-\uDFFF]/.test(SA.joinRow(rows[0])) && K.verifyJournal(SA.joinRow(rows[0])).ok === true, { eq: rows[0] && SA.joinRow(rows[0]) === SA.escapeAstral(full) });
    });
    await guard('A6', 'noop', 'a second Stamp with no change is NO-OP and writes nothing', async function () {
      var w0 = mS.writes.length, h0 = mS.hiddenWrites, st2 = await shimS.stamp();
      check('A6', 'noop', 'NO-OP, 0 cells written, 0 hidden-sheet writes, history still 1 row', st2.verdict === 'NO-OP' && mS.writes.length === w0 && mS.hiddenWrites === h0 && mS.hiddenRows('_door_history').length === 1, { v: st2.verdict, w: mS.writes.length - w0, hw: mS.hiddenWrites - h0 });
    });
    await guard('A6', 'one-edit', 'one edit, then Stamp: exactly one new row with exactly one CELL_SET', async function () {
      mS.sheets.Data.cells.A5 = { v: 'item 5 EDITED', f: null }; var st3 = await shimS.stamp(), rows = mS.hiddenRows('_door_history'), e = rows.length > 1 ? JSON.parse(SA.joinRow(rows[1])) : null;
      check('A6', 'one-edit', 'RECORDED, 2 rows, row 2 holds 1 op CELL_SET Data!A5 (item 5 ... -> item 5 EDITED), actor Aminah', st3.verdict === 'RECORDED' && rows.length === 2 && !!e && e.payload.ops.length === 1 && e.payload.ops[0].op_type === 'CELL_SET' && e.payload.ops[0].cell === 'A5' && e.payload.ops[0].after.v === 'item 5 EDITED' && e.actor === 'Aminah', { v: st3.verdict, n: rows.length, e: e && e.payload.ops });
      check('A6', 'chain', 'both rows verify with ws_kernel.verifyJournal (one verifier for ERP journal and sheet history)', K.verifyJournal(rows.map(SA.joinRow).join('\n')).ok === true, rows.length);
    });
    await guard('A7', 'story', 'History of this cell lists every value with who and when', async function () {
      mS.selected = { sheet: 'Data', addr: 'A5' }; var h = await shimS.cellHistory();
      check('A7', 'story', 'selected cell Data!A5: 2 steps - empty -> "item 5 xxx..." (genesis) and -> "item 5 EDITED", both by Aminah, with seq and time', h.verdict === 'STORY' && !!h.story && h.story.length === 2 && h.story[0].before === null && /^item 5 x/.test(h.story[0].after.v) && h.story[1].after.v === 'item 5 EDITED' && h.story.every(function (s) { return s.actor === 'Aminah' && s.at && s.seq; }), h.story);
      var hb = await shimS.cellHistory({ sheet: 'Data', cell: 'B2' });
      check('A7', 'formula', 'the formula cell Data!B2 shows its formula in its story, not only the value', !!hb.story && !!hb.story[0] && hb.story[0].after.f === 'SUM(B1:B1)', hb.verdict);
      var ch = await shimS.checkHistory();
      check('A7', 'check-ok', 'Check history on the intact workbook: OK, history 2 entries verify', ch.verdict === 'OK' && ch.history.entries === 2, ch);
    });
    await guard('A7', 'tamper', 'one changed character in the LAST chunk of a split entry is caught, and a broken history refuses Stamp and shows no story', async function () {
      var rows = mS.hiddenRows('_door_history'), last = rows[0].length - 1;
      check('A7', 'multi-chunk', 'entry 1 really is split (>= 2 chunks) before the tamper', last >= 1, rows[0].length);
      mS.editChunk('_door_history', 0, last, function (t) { var i = t.lastIndexOf('x'); return i >= 0 ? t.slice(0, i) + 'y' + t.slice(i + 1) : t; });
      var ch = await shimS.checkHistory(), w0 = mS.writes.length, h0 = mS.hiddenWrites, st = await shimS.stamp(), hh = await shimS.cellHistory({ sheet: 'Data', cell: 'A5' });
      check('A7', 'tamper', 'Check history: BROKEN, history entry 1, reason names the payload', ch.verdict === 'BROKEN' && ch.history.brokenAt === 1 && /payload/.test(ch.history.why), ch);
      check('A7', 'refuse-stamp', 'Stamp on the broken history: REFUSED, nothing written', st.verdict === 'REFUSED' && mS.writes.length === w0 && mS.hiddenWrites === h0, { v: st.verdict });
      check('A7', 'no-story', 'cell history on the broken history: BROKEN, no story shown', hh.verdict === 'BROKEN', hh.verdict);
    });
  }

  // ═══ EXCEL phase (A8): the same shim through excel_host.js on the fake Office.js ═══
  if (wants('A8')) {
    var mE = buildInvoiceWB('excel', DATA, GRAND), XE = FakeExcel(mE), hostE = SX.create(XE), RE = makeRunner(), shimE = mkShim(hostE, RE);
    await guard('A8', 'same', 'File it through excel_host on the fake Office.js: same verdict, same writes, same fingerprint, same read set as through the plain host', async function () {
      var rE = await shimE.fileIt(), vr = setOf(mE.visibleReads(), function (r) { return r.addr; });
      check('A8', 'verdict', 'FILED with writes [F2 = SDOOR-0001, G24 = Filed SDOOR-0001 (In Progress)] - identical to the plain host (date arrived as a serial and was converted)', rE.verdict === 'FILED' && J(rE.writes) === J([{ cell: 'F2', value: 'SDOOR-0001' }, { cell: 'G24', value: 'Filed SDOOR-0001 (In Progress)' }]) && J(rE.writes) === J(res1 ? res1.writes : rE.writes), { v: rE.verdict, text: rE.text, w: rE.writes });
      check('A8', 'fingerprint', 'fingerprint(Excel path) == fingerprint(direct engine call)', RE.st.K && fingerprint(RE.st.K, DATA.docno) === FP_DIRECT && FP_DIRECT !== '[]', null);
      check('A8', 'readset', 'the Excel path reads exactly the template cells too, and writes exactly {F2, G24}', J(vr) === J(EXPECT) && J(setOf(mE.visibleWrites(), function (w) { return w.addr; })) === J(['F2', 'G24']), { n: vr.length });
      var lrows = mE.hiddenRows('_door_ledger');
      check('A8', 'ledger', 'one ledger row, verifies; the ledger sheet the add-in created is VeryHidden, _door_tags stays VeryHidden', lrows.length === 1 && (await SH.verify(lrows.map(SA.joinRow))).ok && mE.sheets._door_ledger.vis === 'VeryHidden' && mE.sheets._door_tags.vis === 'VeryHidden', { vis: mE.sheets._door_ledger && mE.sheets._door_ledger.vis });
    });
    await guard('A8', 'values', 'excel_host hands the engine the printed value: date serial -> ISO day, 15 significant digits, blanks -> null; text stays text', async function () {
      var mv = new Workbook(); mv.setRaw('Sheet1', 'A1', { v: SERIAL, f: null, fmt: 'yyyy-mm-dd' }); mv.setRaw('Sheet1', 'A2', { v: 123.50000000000001, f: null }); mv.setRaw('Sheet1', 'A3', { v: SERIAL, f: null, fmt: 'General' }); mv.setRaw('Sheet1', 'A5', { v: 'Oak', f: null });
      var got = await SX.create(FakeExcel(mv)).readCells('Sheet1', ['A1', 'A2', 'A3', 'A4', 'A5']);
      check('A8', 'date', 'A1 (serial 46346 with a date format) -> "2026-11-20"; A3 (same number, General) stays the number', got.A1 === '2026-11-20' && got.A3 === SERIAL, got);
      check('A8', 'digits', 'A2 = 123.50000000000001 -> 123.5; empty A4 -> null; text A5 -> "Oak"', got.A2 === 123.5 && got.A4 === null && got.A5 === 'Oak', got);
    });
    await guard('A8', 'hidden-text', 'hidden-sheet rows survive Excel\'s coercion: digit-only, "=..." and padded text come back identical; ragged rows are padded', async function () {
      var mh = new Workbook(); mh.addSheet('Sheet1'); var hx = SX.create(FakeExcel(mh)), rows = [['0012345', '=SUM(1)', '{"a":1}', '  lead'], ['99']];
      await hx.setHidden('_door_x', rows); var back = await hx.getHidden('_door_x'), allText = Object.keys(mh.sheets._door_x.cells).every(function (a) { return mh.sheets._door_x.cells[a].fmt === '@'; });
      check('A8', 'hidden-text', 'rows read back identical; the sheet is VeryHidden; every cell text-formatted', J(back) === J(rows) && mh.sheets._door_x.vis === 'VeryHidden' && allText, { back: back, vis: mh.sheets._door_x.vis });
      await hx.setHidden('_door_x', [['short']]); check('A8', 'rewrite', 'rewriting a shorter set leaves no stale cell behind', J(await hx.getHidden('_door_x')) === J([['short']]), await hx.getHidden('_door_x'));
    });
    await guard('A8', 'writes', 'a written text starting with "=" stays text (never a formula); selected cell parsing handles quoted sheet names', async function () {
      var mw = new Workbook(); mw.addSheet('Sheet1'); var hx = SX.create(FakeExcel(mw)); await hx.writeCells('Sheet1', [{ cell: 'A9', value: '=1+1' }, { cell: 'A10', value: 'Filed X (In Progress)' }]);
      check('A8', 'no-formula', 'A9 holds the text "=1+1" and no formula; A10 plain text', mw.sheets.Sheet1.cells.A9.v === '=1+1' && mw.sheets.Sheet1.cells.A9.f == null && mw.sheets.Sheet1.cells.A10.v === 'Filed X (In Progress)', mw.sheets.Sheet1.cells.A9);
      mw.addSheet("Bob's sheet"); mw.selected = { sheet: "Bob's sheet", addr: 'B3:C4' }; var sel = await hx.selectedCell(); mw.selected = { sheet: 'Sheet1', addr: 'D7' }; var sel2 = await hx.selectedCell();
      check('A8', 'selected', 'address "\'Bob\'\'s sheet\'!B3:C4" -> {Bob\'s sheet, B3}; "Sheet1!D7" -> {Sheet1, D7}', sel.sheet === "Bob's sheet" && sel.cell === 'B3' && sel2.sheet === 'Sheet1' && sel2.cell === 'D7', [sel, sel2]);
    });
    await guard('A8', 'stamp-parity', 'Stamp through the Excel layer records the same cells as through the plain host (values, formulas); who = the name kept in the workbook settings', async function () {
      var mp = buildDataWB(), sp = mkShim(PlainHost(mp, 'Aminah')), rp = await sp.stamp();
      var mx = buildDataWB(), hx = SX.create(FakeExcel(mx)); var who0 = await hx.userName(); await hx.setUserName('Aminah'); var sx = mkShim(hx), rx = await sx.stamp();
      check('A8', 'who', 'default name "unknown" before it is set; after setUserName the entry actor is "Aminah"', who0 === 'unknown' && rx.entry && rx.entry.actor === 'Aminah', { who0: who0, actor: rx.entry && rx.entry.actor });
      check('A8', 'parity', 'the same ops (sheet, cell, before, after) through both hosts; the Excel-side history rows are within 32,767 per cell, none truncated, and re-join to the entry', rp.verdict === 'RECORDED' && rx.verdict === 'RECORDED' && J(rp.entry.payload.ops) === J(rx.entry.payload.ops) && mx.truncated === 0 && SA.joinRow(mx.hiddenRows('_door_history')[0]) === SA.escapeAstral(J(rx.entry)), { p: rp.verdict, x: rx.verdict, trunc: mx.truncated });
      var st2 = await sx.stamp(); check('A8', 'noop', 'a second Stamp through Excel is NO-OP', st2.verdict === 'NO-OP', st2.verdict);
    });
    await guard('A8', 'strict', 'the fake Office.js is strict: reading a property that was not loaded throws (a missing load() in excel_host would fail loudly)', async function () {
      var threw = null; try { await FakeExcel(new Workbook()).run(async function (ctx) { var ws = ctx.workbook.worksheets.getActiveWorksheet(); return ws.name; }); } catch (e) { threw = e.message; }
      check('A8', 'strict', 'PropertyNotLoaded thrown for ws.name without load()', /PropertyNotLoaded/.test(threw || ''), threw);
    });
  }

  // ═══ MANIFEST phase (A9) ═══
  if (wants('A9')) {
    await guard('A9', 'manifest', 'manifest.xml is well-formed and its ribbon matches the code', async function () {
      var PY = "import sys, json, xml.etree.ElementTree as E\nX='{http://www.w3.org/2001/XMLSchema-instance}type'\nr=E.parse(sys.argv[1]).getroot()\nloc=lambda t: t.split('}')[-1]\nres={}\nfor el in r.iter():\n    if loc(el.tag) in ('Image','Url','String') and el.get('id'): res[el.get('id')]=el.get('DefaultValue')\nb=[]\nfor el in r.iter():\n    if loc(el.tag)=='Control' and el.get(X)=='Button':\n        a=[c for c in el if loc(c.tag)=='Action'][0]\n        sl=[c for c in a if loc(c.tag)=='SourceLocation']\n        b.append({'id':el.get('id'),'action':a.get(X),'resid':sl[0].get('resid') if sl else None})\nprint(json.dumps({'res':res,'buttons':b,'resids':[e.get('resid') for e in r.iter() if e.get('resid')],'ids':[e.get('id') for e in r.iter() if e.get('id')],'direct':[e.get('DefaultValue') for e in r.iter() if loc(e.tag) in ('IconUrl','HighResolutionIconUrl','SourceLocation','SupportUrl') and e.get('DefaultValue')]}))";
      var py = cp.spawnSync('python3', ['-I', '-c', PY, MANIFEST], { encoding: 'utf8' }), man = null;
      check('A9', 'parses', 'python3 xml.etree (an independent parser) reads manifest.xml', py.status === 0, py.stderr && py.stderr.slice(0, 300)); if (py.status !== 0) return;
      man = JSON.parse(py.stdout);
      var BASE = 'https://red1oon.github.io/bim-ootb/erp/sheet_addin/', acts = man.buttons.map(function (b) { var u = man.res[b.resid] || '', m = /\?action=([a-z]+)$/.exec(u); return m ? m[1] : null; }).sort();
      check('A9', 'buttons', '4 ribbon buttons, every one a ShowTaskpane', man.buttons.length === 4 && man.buttons.every(function (b) { return b.action === 'ShowTaskpane'; }), man.buttons);
      check('A9', 'ribbon-code', 'the ribbon\'s action ids == the code\'s SheetAddin.ACTIONS, both ways', J(acts) === J(SA.ACTIONS.slice().sort()), { ribbon: acts, code: SA.ACTIONS });
      var shim = SA.create({}, {}), html = fs.readFileSync(path.join(ADDIN, 'taskpane.html'), 'utf8');
      check('A9', 'code-reach', 'every action is a function in the shim, listed by shim.actions, and has its button in taskpane.html', SA.ACTIONS.every(function (a) { return shim.has(a) && shim.actions.indexOf(a) >= 0 && html.indexOf('id="b-' + a + '"') >= 0; }) && shim.actions.length === 4, shim.actions);
      check('A9', 'resid', 'every resid resolves to a resource', man.resids.every(function (r) { return r in man.res; }), man.resids.filter(function (r) { return !(r in man.res); }));
      check('A9', 'unique', 'every id is unique', man.ids.length === setOf(man.ids, function (x) { return x; }).length, man.ids);
      var urls = Object.keys(man.res).map(function (k) { return man.res[k]; }).filter(function (v) { return /^https?:/.test(v); }).concat(man.direct.filter(function (v) { return /sheet_addin|bim-ootb\//.test(v); }));
      check('A9', 'https', 'every page/icon URL is https under ' + BASE + ' (the support link under the site root)', urls.length >= 8 && urls.every(function (u) { return u.indexOf('https://red1oon.github.io/bim-ootb/') === 0; }) && man.res['Pane.fileit'].indexOf(BASE) === 0, urls);
    });
  }

  var done = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'A10', 'A11'].filter(function (c) { return wants(c); });
  var vs = done.map(verdict);
  SHIPPED.filter(function (l) { return /^§SHEET_DOOR/.test(l); }).slice(0, 8).forEach(function (l) { say('  shipped: ' + l); });

  // ═══ MUTANTS ═══
  var killed = 0, MUT = [];
  if (process.env.SADDIN_MUTANTS === '1' && !MUTANT) {
    var RC = 'var cells = await host.readCells(sheet, SD.tagCells(tpl));';
    MUT = [
      { name: 'M1-shim-reads-whole-sheet', file: SHIM, env: 'SADDIN_SHIM', kills: 'A1', from: RC, to: 'await host.readSheetValues(sheet); ' + RC },
      { name: 'M2-shim-writes-extra-cell', file: SHIM, env: 'SADDIN_SHIM', kills: 'A2', from: 'var writes = r.writes || [];', to: "var writes = (r.writes || []).concat([{ cell: 'Z99', value: 'x' }]);" },
      { name: 'M3-long-entry-not-split', file: SHIM, env: 'SADDIN_SHIM', kills: 'A6', from: 'limit = limit || CELL_LIMIT;', to: 'limit = 1e9;' },
      { name: 'M4-ledger-line-on-refusal', file: SHIM, env: 'SADDIN_SHIM', kills: 'A4', from: 'var line = out.ledgerLine;', to: 'var line = out.ledgerLine || JSON.stringify(out.result);' },
      { name: 'M5-noop-stamp-still-writes', file: SHIM, env: 'SADDIN_SHIM', kills: 'A6', from: 'var r = await SH.record(entries, prev, next, await host.userName(), now());', to: 'var r = await SH.record(entries, prev, next, await host.userName(), now()); await host.setHidden(HISTORY, await host.getHidden(HISTORY));' },
      { name: 'M6-shim-rounds-numbers', file: SHIM, env: 'SADDIN_SHIM', kills: 'A3', from: RC, to: RC + " Object.keys(cells).forEach(function (k) { if (typeof cells[k] === 'number') cells[k] = Math.round(cells[k]); });" },
      { name: 'M7-hidden-sheet-left-visible', file: EXCEL, env: 'SADDIN_EXCEL', kills: 'A8', from: "ws.visibility = 'VeryHidden';", to: "ws.visibility = 'Visible';" },
      { name: 'M8-date-conversion-dropped', file: EXCEL, env: 'SADDIN_EXCEL', kills: 'A8', from: 'return isDateFormat(fmt) ? serialToIso(v) : round15(v);', to: 'return round15(v);' },
      { name: 'M9-ribbon-action-renamed', file: MANIFEST, env: 'SADDIN_MANIFEST', kills: 'A9', from: '?action=stamp"', to: '?action=stamped"' },
      { name: 'M10-check-skips-ledger', file: SHIM, env: 'SADDIN_SHIM', kills: 'A5', from: 'l = await SH.verify(ll);', to: 'l = { ok: true, entries: ll.length };' },
      { name: 'M12-astral-escape-dropped', file: SHIM, env: 'SADDIN_SHIM', kills: 'A6', from: 'function escapeAstral(line) { return line.replace(', to: 'function escapeAstral(line) { return line; } function escapeAstralOff(line) { return line.replace(' },
      { name: 'M13-shim-never-asks-host-for-no-result', file: SHIM, env: 'SADDIN_SHIM', kills: 'A11', from: 'var nsr = host.noSavedResult ?', to: 'var nsr = false ?' },
      { name: 'M14-shim-drops-the-fact-before-the-runner', file: SHIM, env: 'SADDIN_SHIM', kills: 'A11', from: 'await lines(LEDGER), nsr)', to: 'await lines(LEDGER))' },
      { name: 'M11-story-shows-first-only', file: SHIM, env: 'SADDIN_SHIM', kills: 'A7', from: 'var story = SH.cellStory(entries, sel.sheet, sel.cell);', to: 'var story = SH.cellStory(entries, sel.sheet, sel.cell).slice(0, 1);' }
    ];
    var tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'saddin-mut-'));
    MUT.forEach(function (m) {
      var src = fs.readFileSync(m.file, 'utf8'), n = src.split(m.from).length - 1;
      if (n !== 1) { say('§SADDIN-MUTANT name=' + m.name + ' NOT-APPLIED matches=' + n); return; }
      var f = path.join(tmp, m.name + path.extname(m.file)); fs.writeFileSync(f, src.replace(m.from, m.to));
      var env = Object.assign({}, process.env, { SADDIN_MUTANT: m.name, SADDIN_MUTANTS: '', SADDIN_ONLY: m.kills }); env[m.env] = f;
      var out = cp.spawnSync(process.execPath, [__filename], { env: env, encoding: 'utf8', maxBuffer: 64 << 20 }).stdout || '';
      var line = (out.match(new RegExp('§SADDIN-' + m.kills + ' verdict=\\w+[^\\n]*')) || [''])[0], crashed = new RegExp('case=' + m.kills + ' key=\\S+ FAIL .* got="threw:').test(out), k = /verdict=FAIL/.test(line) && !crashed;     // a check that THREW is a crash, not a kill
      if (k) killed++;
      say('§SADDIN-MUTANT name=' + m.name + ' kills=' + m.kills + ' ' + (k ? 'KILLED' : crashed ? 'CRASHED(not a kill)' : 'SURVIVED') + ' child="' + line + '"');
    });
    say('§SADDIN-MUTANTS killed=' + killed + '/' + MUT.length);
    if (killed !== MUT.length) ALL.failed++;
  }
  var overall = !ALL.judged ? 'INCONCLUSIVE' : ALL.failed ? 'FAIL' : vs.indexOf('INCONCLUSIVE') >= 0 ? 'INCONCLUSIVE' : 'PASS';
  say('§SADDIN-VERDICT ' + overall + ' judged=' + ALL.judged + ' failed=' + ALL.failed + ' cases=' + J(vs) + ' (fake host + fake Office.js only; real Excel NOT run)');
  process.exit(overall === 'PASS' ? 0 : 1);
})().catch(function (e) { say('§SADDIN-VERDICT FAIL crashed: ' + (e && e.stack || e)); process.exit(1); });
