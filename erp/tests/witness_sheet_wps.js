#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — W-SHEET-WPS (bim-compiler prompts/SHEET_FRONT_DOOR.md §11, slice S4). READ THE LOG after every run: every verdict is a §SWPS line; the exit code is not the evidence.
//   INCONCLUSIVE when nothing was judged. A mutant that crashes is NOT a kill.
//   REAL WPS IS NOT RUN HERE (none on the build machine): this proves the contract against a FAKE WPS object model (fake_wps.js, built only from cited API names) and the shared fake hosts.
// SPEC (claims written in §11.3 before the code; each names the issue it exposes):
//   P1 SAME     one shim through wps_host.js == plain fake host == excel_host.js on fake Office.js: verdict, writes, read set, fingerprint, ledger line byte for byte   -> the WPS layer adds something
//   P2 WRITESET visible writes == {docno, status}; a wrong subtotal writes only the status cell, no ledger row, journal unmoved                                    -> the menu writes outside its tags
//   P3 LONG     a >32,767-char entry is split, re-joined, verified; NO-OP stamp writes nothing; one edit = one CELL_SET; a tampered LAST chunk is caught             -> silent truncation / tamper
//   P4 HIDDEN   _door_* sheets very hidden (2); rows come back identical; rewrite leaves no stale cell; the user's active sheet unchanged                           -> hidden sheet shows / coerced
//   P5 VALUES   date serial -> ISO day, 15 digits, blank -> null, "=1+1" written as text, ActiveCell parse, UserName                                               -> the engine is fed raw WPS values
//   P6 CITED    the fake THROWS on any member not on the cited list; every member name wps_host.js / ribbon.js use is on the list                                      -> an API name invented
//   P7 RIBBON   ribbon.xml well-formed; its buttons == ribbon.js handlers (both ways); ribbon.js run on the fake opens the pane at ?action=<id>; entry files; URLs     -> a button that does nothing
// Mutants (SWPS_MUTANTS=1): each rewrites a COPY of a source file (text must match exactly once, else NOT-APPLIED); a child run must print FAIL for the named case.
// Command: node erp/tests/witness_sheet_wps.js     (SWPS_MUTANTS=1 adds the sweep; SWPS_ONLY=P1,P2 limits the cases run)
'use strict';
var fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process'), vm = require('vm');
if (!global.window) global.window = {};
if (!global.crypto || !global.crypto.subtle) global.crypto = require('crypto').webcrypto;
var ERP = path.join(__dirname, '..'), ADDIN = path.join(ERP, 'sheet_addin'), WPSD = path.join(ADDIN, 'wps');
var HOSTF = process.env.SWPS_HOST || path.join(ADDIN, 'wps_host.js');
var RIBBON_XML = process.env.SWPS_RIBBON_XML || path.join(WPSD, 'ribbon.xml');
var RIBBON_JS = process.env.SWPS_RIBBON_JS || path.join(WPSD, 'ribbon.js');
var MUTANT = process.env.SWPS_MUTANT || '', ONLY = (process.env.SWPS_ONLY || '').split(',').filter(Boolean);
if (!process.env.SQLJS) process.env.SQLJS = process.env.SQLJS_DIR || '/home/red1/bim-ootb/tests/node_modules/sql.js';
var _log = console.log, SHIPPED = [];
console.log = function () { SHIPPED.push(Array.prototype.join.call(arguments, ' ')); };
function say(s) { _log(s); }
var CASES = {}, ALL = { judged: 0, failed: 0 };
function J(x) { return JSON.stringify(x); }
function check(cs, key, rule, ok, info) {
  var c = CASES[cs] = CASES[cs] || { judged: 0, failed: 0 }; c.judged++; ALL.judged++; if (!ok) { c.failed++; ALL.failed++; }
  say('  §SWPS-CHECK case=' + cs + ' key=' + key + ' ' + (ok ? 'OK' : 'FAIL') + ' rule="' + rule + '"' + (ok ? '' : ' got=' + String(J(info)).slice(0, 600)));
}
async function guard(cs, key, rule, fn) { try { await fn(); } catch (e) { check(cs, key, rule, false, 'threw: ' + (e && (e.stack || e.message) || String(e))); } }
function verdict(cs) { var c = CASES[cs] || { judged: 0, failed: 0 }; var v = !c.judged ? 'INCONCLUSIVE' : c.failed ? 'FAIL' : 'PASS'; say('§SWPS-' + cs + ' verdict=' + v + ' judged=' + c.judged + ' failed=' + c.failed + (MUTANT ? ' mutant=' + MUTANT : '')); return v; }
var wants = function (cs) { return !ONLY.length || ONLY.indexOf(cs) >= 0; };
var wantsAny = function (l) { return l.some(wants); };

var SA = require(path.join(ADDIN, 'host_shim.js')), SX = require(path.join(ADDIN, 'excel_host.js')), SW = require(HOSTF), SD = require(path.join(ERP, 'sheet_door.js')), SH = require(path.join(ERP, 'sheet_history.js'));
var K = require(path.join(ERP, 'ws_kernel.js')), AP = require(path.join(ERP, 'ad_process.js')), SF = require('./sheet_fakes.js'), FW = require('./fake_wps.js');
var Workbook = SF.Workbook, PlainHost = SF.PlainHost, FakeExcel = SF.FakeExcel, LIMIT = SF.LIMIT, A1 = SF.A1;
var S = { clientId: 11, orgId: 11, userId: 100, roleId: 102, warehouseId: 103, actor: 'witness:sheet-wps' }, OPTS = { AD_Client_ID: 11, AD_Org_ID: 11 };
var BASE = 'https://red1oon.github.io/bim-ootb/erp/sheet_addin/';

// ═════════════ fixtures (same invoice as W-SHEET-ADDIN: GardenWorld, customer C&W, Oak / Elm) ═════════════
var DATA = { partner: 'C&W', date: '2026-11-20', docno: 'SDOOR-0001', lines: [{ product: 'Oak', description: 'Oak tree, 2m', qty: 2, price: 61.75, amount: 123.5 }, { product: 'Elm', description: 'Elm tree', qty: 3, price: 10, amount: 30 }], subtotal: 153.5 };
var TPL = { kind: 'invoice', docAction: 'CO', fixed: { issotrx: 'Y', doctypename: 'AR Invoice', iso_code: 'USD' },
  header: { partner: 'B3', date: 'F3', docno: 'F2', subtotal: 'G20', grandtotal: 'G22', status: 'G24' }, lines: { from: 8, to: 18, cols: { product: 'B', description: 'C', qty: 'D', price: 'E', amount: 'G' } } };
// the cells the template names, written out HERE by hand (not by tagCells)
var EXPECT = ['B3', 'F3', 'F2', 'G20', 'G22']; for (var rr = 8; rr <= 18; rr++) ['B', 'C', 'D', 'E', 'G'].forEach(function (c) { EXPECT.push(c + rr); });
EXPECT.sort();
var SERIAL = (Date.UTC(2026, 10, 20) - Date.UTC(1899, 11, 30)) / 86400000;
function invoiceModel(kind, grand, o) {
  o = o || {}; var m = new Workbook(), ws = m.addSheet('Sheet1'), expect = {}; EXPECT.forEach(function (a) { expect[a] = 1; });
  for (var r = 1; r <= 30; r++) for (var c = 1; c <= 12; c++) { var a = A1(r, c); if (!expect[a] && a !== 'G24') ws.cells[a] = { v: 'DECOY-' + a, f: null }; }
  ws.cells.Z99 = { v: 'a cell the template does not name', f: null }; ws.cells.G24 = { v: 'draft', f: null };
  var put = function (a, v, fmt) { ws.cells[a] = { v: v, f: null, fmt: fmt }; };
  put('B3', DATA.partner); put('F2', DATA.docno);
  if (kind === 'plain') put('F3', DATA.date); else put('F3', SERIAL, 'yyyy-mm-dd');
  DATA.lines.forEach(function (l, i) { var rw = 8 + i; put('B' + rw, l.product); put('C' + rw, l.description); put('D' + rw, l.qty); put('E' + rw, l.price); put('G' + rw, l.amount); });
  put('G20', o.subtotal !== undefined ? o.subtotal : DATA.subtotal); if (grand != null) put('G22', grand);
  m.setHiddenRows('_door_tags', [SA.splitLine(J(TPL))]); m.resetLog(); return m;
}
function dataModel() {                                                    // for Stamp: > 32,767 characters of history in one entry (as W-SHEET-ADDIN)
  var m = new Workbook(); m.addSheet('Sheet1').cells.A1 = { v: 'small second sheet', f: null }; var ws = m.addSheet('Data');
  for (var i = 1; i <= 450; i++) ws.cells['A' + i] = { v: 'item ' + i + ' ' + (i % 50 === 0 ? 'emoji 😀 ' : '') + 'x'.repeat(100), f: null };
  ws.cells.B1 = { v: 5, f: null }; ws.cells.B2 = { v: 5, f: 'SUM(B1:B1)' };
  m.setHiddenRows('_door_tags', [SA.splitLine(J(TPL))]); m.resetLog(); return m;
}
var tick = 0, fixedNow = function () { tick++; return '2026-11-27T10:00:' + (tick < 10 ? '0' : '') + tick + '.000Z'; };
function mkShim(host, runner) { return SA.create(host, { SheetDoor: SD, SheetHistory: SH, runner: runner || null, now: fixedNow }); }
function wpsHost(m, user) { return SW.create(FW.app(m, { user: user === undefined ? 'Aminah' : user }), { ex: SX }); }
function setOf(list, f) { return list.map(f).filter(function (x, i, a) { return a.indexOf(x) === i; }).sort(); }
function fingerprint(k, docno) {
  var inv = k.q('SELECT * FROM c_invoice WHERE documentno=?', [docno]);
  return J(inv.map(function (i) {
    var ls = k.q('SELECT line, m_product_id, c_charge_id, qtyinvoiced, priceactual, linenetamt, c_tax_id, description FROM c_invoiceline WHERE c_invoice_id=? ORDER BY line', [i.c_invoice_id]);
    var fa = k.q('SELECT account_id, amtacctdr, amtacctcr FROM fact_acct WHERE ad_table_id=318 AND record_id=? ORDER BY account_id, amtacctdr, amtacctcr', [i.c_invoice_id]);
    return { h: [i.c_bpartner_id, i.c_doctype_id, i.issotrx, i.documentno, String(i.dateinvoiced).slice(0, 10), i.docstatus, i.totallines, i.grandtotal, i.c_currency_id, i.posted], l: ls, f: fa };
  }));
}
async function boot() { return K.load(); }
function makeRunner() {
  var st = { K: null };
  return { st: st, file: async function (tpl, cells, ledgerLines) {
    if (!st.K) { st.K = await boot(); if (ledgerLines.length) st.K.replay(ledgerLines.join('\n')); }
    var k = st.K, j0 = k.journal.length;
    var r = k.inTrx(S, { ws: 'sheet_door' }, function (trx) { return SD.file(trx, { AP: AP, ML: k.ML }, tpl, cells, OPTS); });
    return { result: { ok: r.ok, verdict: r.verdict, reason: r.reason, writes: r.writes, checks: r.checks, invoice: r.invoice }, ledgerLine: k.journal.length > j0 ? J(k.journal[k.journal.length - 1]) : null };
  } };
}
function strip(src) { return src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/gm, ''); }
// every `.Name` member token of a source, minus the plain-JS names and this layer's own helpers
var JS_OK = ['length', 'push', 'pop', 'filter', 'map', 'forEach', 'slice', 'join', 'charAt', 'indexOf', 'from', 'concat', 'call', 'apply', 'href', 'location', 'ex', 'engineValue', 'textForCell', 'colName', 'strRow', 'cell', 'value', 'Id', 'exports', 'SheetAddinWps'];   // Id: control.Id of the wpsjs scaffold callbacks; exports / SheetAddinWps: this file's UMD tail
function memberNames(file) { var src = strip(fs.readFileSync(file, 'utf8')), out = {}, re = /\.\s*([A-Za-z_$][\w$]*)/g, m; while ((m = re.exec(src))) out[m[1]] = 1; return Object.keys(out).sort(); }
function citedNames() { var o = {}; Object.keys(FW.CITED).forEach(function (c) { Object.keys(FW.CITED[c]).forEach(function (n) { o[n] = 1; }); }); o.Application = 1; return o; }

(async function main() {
  say('§SWPS-LOAD host=' + HOSTF + ' ribbon_xml=' + RIBBON_XML + ' ribbon_js=' + RIBBON_JS + ' mutant=' + (MUTANT || 'none') + ' only=' + (ONLY.join(',') || 'all'));
  say('§SWPS-FAKE-ASSUMES ' + FW.ASSUMED.join(' | '));

  // ═══ P1 SAME + P2 WRITESET ═══
  var GRAND = null, FP_DIRECT = null;
  if (wantsAny(['P1', 'P2'])) {
    var KD = await boot(), direct = {}; direct[TPL.header.partner] = DATA.partner; direct[TPL.header.date] = DATA.date; direct[TPL.header.docno] = DATA.docno; direct[TPL.header.subtotal] = String(DATA.subtotal);
    DATA.lines.forEach(function (l, i) { var rw = 8 + i; direct['B' + rw] = l.product; direct['C' + rw] = l.description; direct['D' + rw] = String(l.qty); direct['E' + rw] = String(l.price); direct['G' + rw] = String(l.amount); });
    var d1 = KD.inTrx(S, { ws: 'sheet_door' }, function (trx) { return SD.file(trx, { AP: AP, ML: KD.ML }, TPL, direct, OPTS); });
    FP_DIRECT = fingerprint(KD, DATA.docno); GRAND = Number(KD.q('SELECT grandtotal FROM c_invoice WHERE documentno=?', [DATA.docno])[0].grandtotal);
    say('§SWPS-ORACLE direct ok=' + d1.ok + ' verdict=' + d1.verdict + ' grandtotal=' + GRAND + ' fingerprintBytes=' + FP_DIRECT.length);
    var real = K.shell(), n = 0, T = Date.UTC(2026, 10, 27, 10, 0, 0);
    var fix = function () { n = 0; K.shell({ nowMs: function () { return T; }, uuid: function () { n++; return '00000000-0000-4000-8000-' + ('000000000000' + n).slice(-12); } }); };
    var runs = {};
    try {
      for (var kind of ['plain', 'excel', 'wps']) {
        fix(); var m = invoiceModel(kind, GRAND), host = kind === 'plain' ? PlainHost(m) : kind === 'excel' ? SX.create(FakeExcel(m)) : wpsHost(m), R = makeRunner(), snap0 = null;
        snap0 = m.snapshotVisible(); var res = await mkShim(host, R).fileIt();
        runs[kind] = { m: m, res: res, R: R, snap0: snap0, line: res.ledgerRow ? m.hiddenRows('_door_ledger').map(SA.joinRow)[0] : null };
      }
    } finally { K.shell({ nowMs: real.nowMs, uuid: real.uuid }); }
    var W = runs.wps || {}, Pn = runs.plain || {}, E = runs.excel || {};
    say('  shipped: wps verdict=' + (W.res && W.res.verdict) + ' text="' + (W.res && W.res.text) + '" writes=' + J(W.res && W.res.writes.map(function (w) { return w.cell; })));
    await guard('P1', 'same', 'the same shim through wps_host == plain host == excel_host: FILED, same writes, same fingerprint, same ledger line byte for byte, the read set is exactly the template cells', async function () {
      ['plain', 'excel', 'wps'].forEach(function (k) { check('P1', 'filed-' + k, k + ': FILED, writes [F2, G24]', !!runs[k] && runs[k].res.verdict === 'FILED' && J(runs[k].res.writes.map(function (w) { return w.cell; })) === J(['F2', 'G24']), runs[k] && { v: runs[k].res.verdict, t: runs[k].res.text }); });
      check('P1', 'writes', 'the writes (cell and value) are identical through all three hosts', J(W.res.writes) === J(Pn.res.writes) && J(W.res.writes) === J(E.res.writes), { w: W.res.writes, p: Pn.res.writes, e: E.res.writes });
      var fw = fingerprint(W.R.st.K, DATA.docno), fp = fingerprint(Pn.R.st.K, DATA.docno), fe = fingerprint(E.R.st.K, DATA.docno);
      check('P1', 'fingerprint', 'fingerprint(wps) == fingerprint(plain) == fingerprint(excel) == the engine called directly, non-empty', fw === fp && fw === fe && fw === FP_DIRECT && fw !== '[]', { w: fw.slice(0, 200), d: String(FP_DIRECT).slice(0, 200) });
      check('P1', 'ledger-line', 'with clock and ids fixed, the ledger line (the hidden-sheet row, re-joined) is the SAME STRING through wps, plain and excel (' + (W.line || '').length + ' chars)', !!W.line && W.line === Pn.line && W.line === E.line, { w: (W.line || '').length, p: (Pn.line || '').length, e: (E.line || '').length });
      var vr = W.m.visibleReads(), got = setOf(vr, function (r) { return r.addr; }), decoy = vr.filter(function (r) { return /^DECOY/.test(String((W.m.sheets[r.sheet].cells[r.addr] || {}).v)); });
      check('P1', 'readset', 'the visible cells read through wps_host == exactly the template cells (' + EXPECT.length + ', each once, no decoy), and no used-range walk of a visible sheet', J(got) === J(EXPECT) && vr.length === EXPECT.length && !decoy.length, { extra: got.filter(function (a) { return EXPECT.indexOf(a) < 0; }).slice(0, 8), missing: EXPECT.filter(function (a) { return got.indexOf(a) < 0; }).slice(0, 8), n: vr.length, decoy: decoy.length });
      var used = W.m.reads.filter(function (r) { return r.kind === 'used'; }).length;
      check('P1', 'no-used', 'no cell of a visible sheet was read through a used range (File it)', !W.m.visibleReads().some(function (r) { return r.kind === 'used'; }) && used >= 0, used);
    });
    await guard('P2', 'writeset', 'wps File it: visible writes == engine writes == {F2, G24}; the whole workbook differs only in G24; decoys unchanged', async function () {
      var vw = setOf(W.m.visibleWrites(), function (w) { return w.addr; }), ew = W.res.writes.map(function (w) { return w.cell; }).sort(), s1 = W.m.snapshotVisible();
      var changed = Object.keys(s1).filter(function (k) { return s1[k] !== W.snap0[k]; }).concat(Object.keys(W.snap0).filter(function (k) { return !(k in s1); }));
      check('P2', 'applied', 'cells written on the visible sheet == {F2, G24}', J(vw) === J(['F2', 'G24']), vw);
      check('P2', 'engine', 'the engine\'s own writes == {F2, G24}', J(ew) === J(['F2', 'G24']), ew);
      check('P2', 'diff', 'cell-by-cell diff: only G24 changed, to "Filed SDOOR-0001 (CO)"', J(changed.map(function (k) { return k.split('!')[1]; })) === J(['G24']) && JSON.parse(s1['Sheet1!G24'])[0] === 'Filed SDOOR-0001 (CO)', { changed: changed });
      check('P2', 'decoys', 'no decoy / Z99 cell changed', !changed.some(function (k) { return /DECOY|Z99/.test(W.snap0[k] || ''); }), changed);
    });
    await guard('P2', 'refused', 'a wrong subtotal through wps: only the status cell written, no ledger row, kernel journal unchanged', async function () {
      var m2 = invoiceModel('wps', GRAND, { subtotal: 153.51 }), j0 = W.R.st.K.journal.length, r2 = await mkShim(wpsHost(m2), W.R).fileIt(), vw = setOf(m2.visibleWrites(), function (w) { return w.addr; });
      check('P2', 'status-only', 'REFUSED; visible writes == {G24}; text "Not filed: ..." names 153.5 and 153.51', r2.verdict === 'REFUSED' && J(vw) === J(['G24']) && /^Not filed: /.test(r2.text) && /153\.5\b/.test(r2.text) && /153\.51/.test(r2.text), { v: r2.verdict, vw: vw, text: r2.text });
      check('P2', 'no-ledger', 'no ledger row (the _door_ledger sheet holds 0 rows) and the kernel journal did not grow', m2.hiddenRows('_door_ledger').length === 0 && W.R.st.K.journal.length === j0, { rows: m2.hiddenRows('_door_ledger').length, j: W.R.st.K.journal.length - j0 });
    });
  }

  // ═══ P3 LONG ═══
  if (wants('P3')) {
    var mP = dataModel(), mW = dataModel(), shimP = mkShim(PlainHost(mP, 'Aminah')), shimW = mkShim(wpsHost(mW, 'Aminah')), stW = null;
    await guard('P3', 'long', 'a >32,767-char history entry through wps: split, none truncated, re-joined byte for byte, accepted by ws_kernel.verifyJournal; same ops as the plain host', async function () {
      var stP = await shimP.stamp(); stW = await shimW.stamp(); var rows = mW.hiddenRows('_door_history'), full = stW.entry ? J(stW.entry) : '';
      check('P3', 'recorded', 'Stamp RECORDED the genesis entry (' + (stW.entry && stW.entry.payload.ops.length) + ' cells), longer than 32,767 (' + full.length + ')', stW.verdict === 'RECORDED' && full.length > LIMIT, { v: stW.verdict, len: full.length });
      check('P3', 'split', 'stored as one row of >= 2 chunks; the fake lost nothing (truncated 0)', rows.length === 1 && rows[0].length >= 2 && mW.truncated === 0, { rows: rows.length, chunks: rows[0] && rows[0].length, truncated: mW.truncated });
      check('P3', 'rejoin', 'the row re-joined == the entry (emoji included) in its ASCII-escaped form (§12 Rule 3), it parses back to the SAME entry, and ws_kernel.verifyJournal accepts it', rows.length === 1 && SA.escapeAstral(full) !== full && SA.joinRow(rows[0]) === SA.escapeAstral(full) && JSON.stringify(JSON.parse(SA.joinRow(rows[0]))) === JSON.stringify(JSON.parse(full)) && K.verifyJournal(SA.joinRow(rows[0])).ok === true, null);
      check('P3', 'parity', 'the same ops (sheet, cell, before, after) through wps and plain', stP.verdict === 'RECORDED' && J(stP.entry.payload.ops) === J(stW.entry.payload.ops), { p: stP.verdict });
      say('§SWPS-COST stampGenesisChars=' + full.length + ' cells=' + (stW.entry && stW.entry.payload.ops.length) + ' chunks=' + (rows[0] && rows[0].length));
    });
    await guard('P3', 'noop', 'a second Stamp with no change is NO-OP and writes nothing', async function () {
      var w0 = mW.writes.length, h0 = mW.hiddenWrites, s2 = await shimW.stamp();
      check('P3', 'noop', 'NO-OP, 0 cells written, history still 1 row', s2.verdict === 'NO-OP' && mW.writes.length === w0 && mW.hiddenWrites === h0 && mW.hiddenRows('_door_history').length === 1, { v: s2.verdict, w: mW.writes.length - w0 });
    });
    await guard('P3', 'one-edit', 'one edit, then Stamp: exactly one new row with one CELL_SET, actor = Application.UserName', async function () {
      mW.sheets.Data.cells.A5 = { v: 'item 5 EDITED', f: null }; var s3 = await shimW.stamp(), rows = mW.hiddenRows('_door_history'), e = rows.length > 1 ? JSON.parse(SA.joinRow(rows[1])) : null;
      check('P3', 'one-edit', 'RECORDED, 2 rows, row 2 = 1 op CELL_SET Data!A5 -> "item 5 EDITED", actor Aminah', s3.verdict === 'RECORDED' && rows.length === 2 && !!e && e.payload.ops.length === 1 && e.payload.ops[0].op_type === 'CELL_SET' && e.payload.ops[0].cell === 'A5' && e.payload.ops[0].after.v === 'item 5 EDITED' && e.actor === 'Aminah', { v: s3.verdict, n: rows.length });
      mW.selected = { sheet: 'Data', addr: 'A5' }; var h = await shimW.cellHistory();
      check('P3', 'story', 'History of this cell (the selection read through ActiveCell): 2 steps, the last "item 5 EDITED"', h.verdict === 'STORY' && h.story.length === 2 && h.story[1].after.v === 'item 5 EDITED', h.verdict);
      var hb = await shimW.cellHistory({ sheet: 'Data', cell: 'B2' });
      check('P3', 'formula', 'the formula cell Data!B2 shows its formula in its story (Range.Formula read)', !!hb.story && !!hb.story[0] && hb.story[0].after.f === 'SUM(B1:B1)', hb.verdict);
    });
    await guard('P3', 'tamper', 'one changed character in the LAST chunk of the split entry: Check history BROKEN at entry 1; Stamp refuses and writes nothing', async function () {
      var rows = mW.hiddenRows('_door_history'), last = rows[0].length - 1; check('P3', 'multi-chunk', 'entry 1 really is split before the tamper', last >= 1, rows[0].length);
      mW.editChunk('_door_history', 0, last, function (t) { var i = t.lastIndexOf('x'); return i >= 0 ? t.slice(0, i) + 'y' + t.slice(i + 1) : t; });
      var ch = await shimW.checkHistory(), w0 = mW.writes.length, st = await shimW.stamp();
      check('P3', 'tamper', 'BROKEN, history entry 1, payload named', ch.verdict === 'BROKEN' && ch.history.brokenAt === 1 && /payload/.test(ch.history.why), ch);
      check('P3', 'refuse', 'Stamp on the broken history: REFUSED, nothing written', st.verdict === 'REFUSED' && mW.writes.length === w0, st.verdict);
    });
  }

  // ═══ P4 HIDDEN ═══
  if (wants('P4')) {
    await guard('P4', 'hidden', 'hidden sheets through wps_host: very hidden (2), text-formatted rows survive, rewrite leaves nothing stale, the active sheet is unchanged', async function () {
      var m = new Workbook(); m.addSheet('Sheet1'); m.addSheet('Other'); m.active = 'Other'; var app = FW.app(m, { user: 'x' }), h = SW.create(app, { ex: SX }), rows = [['0012345', '=SUM(1)', '{"a":1}', '  lead'], ['99']];
      await h.setHidden('_door_x', rows); var back = await h.getHidden('_door_x'), s = m.sheets._door_x;
      check('P4', 'back', 'rows read back identical (digit-only, "=..." and padded text stay text; ragged row kept)', J(back) === J(rows), back);
      check('P4', 'very-hidden', 'the sheet exists with Visible = 2 (xlSheetVeryHidden), not in visibleSheets()', !!s && s.vis === 'VeryHidden' && (await h.visibleSheets()).indexOf('_door_x') < 0 && J(await h.visibleSheets()) === J(['Sheet1', 'Other']), { vis: s && s.vis, v: await h.visibleSheets() });
      check('P4', 'text', 'every written cell is text-formatted (@) and no formula was created', Object.keys(s.cells).every(function (a) { return s.cells[a].fmt === '@' && s.cells[a].f == null; }), Object.keys(s.cells).slice(0, 4));
      check('P4', 'active', 'the user\'s active sheet is still "Other" after the sheet was added and hidden', m.active === 'Other' && (await h.activeSheet()) === 'Other', m.active);
      await h.setHidden('_door_x', [['short']]); check('P4', 'rewrite', 'rewriting a shorter set leaves no stale cell behind', J(await h.getHidden('_door_x')) === J([['short']]), await h.getHidden('_door_x'));
      check('P4', 'missing', 'a sheet that does not exist reads as no rows', J(await h.getHidden('_door_none')) === '[]', null);
    });
  }

  // ═══ P5 VALUES ═══
  if (wants('P5')) {
    await guard('P5', 'values', 'wps_host hands the engine the printed value: date serial -> ISO day, 15 significant digits, blank -> null; written "=1+1" stays text; ActiveCell; UserName', async function () {
      var m = new Workbook(); m.setRaw('Sheet1', 'A1', { v: SERIAL, f: null, fmt: 'yyyy-mm-dd' }); m.setRaw('Sheet1', 'A2', { v: 123.50000000000001, f: null }); m.setRaw('Sheet1', 'A3', { v: SERIAL, f: null, fmt: 'General' }); m.setRaw('Sheet1', 'A5', { v: 'Oak', f: null });
      var h = SW.create(FW.app(m, { user: 'Aminah' }), { ex: SX }), got = await h.readCells('Sheet1', ['A1', 'A2', 'A3', 'A4', 'A5']);
      check('P5', 'date', 'A1 (serial with a date format) -> "2026-11-20"; A3 (same number, General) stays the number', got.A1 === '2026-11-20' && got.A3 === SERIAL, got);
      check('P5', 'digits', 'A2 = 123.50000000000001 -> 123.5; empty A4 (Value2 undefined) -> null; text A5 -> "Oak"', got.A2 === 123.5 && got.A4 === null && got.A5 === 'Oak', got);
      await h.writeCells('Sheet1', [{ cell: 'A9', value: '=1+1' }, { cell: 'A10', value: 'Filed X (CO)' }]);
      check('P5', 'no-formula', 'A9 holds the text "=1+1" and no formula; A10 plain text', m.sheets.Sheet1.cells.A9.v === '=1+1' && m.sheets.Sheet1.cells.A9.f == null && m.sheets.Sheet1.cells.A10.v === 'Filed X (CO)', m.sheets.Sheet1.cells.A9);
      m.addSheet("Bob's sheet"); m.selected = { sheet: "Bob's sheet", addr: 'B3' }; var sel = await h.selectedCell(); m.selected = { sheet: 'Sheet1', addr: 'AB7' }; var sel2 = await h.selectedCell();
      check('P5', 'selected', 'ActiveCell on a quoted sheet name -> {Bob\'s sheet, B3}; column 28 -> {Sheet1, AB7}', sel.sheet === "Bob's sheet" && sel.cell === 'B3' && sel2.sheet === 'Sheet1' && sel2.cell === 'AB7', [sel, sel2]);
      check('P5', 'user', 'userName = Application.UserName ("Aminah"); an empty one -> "unknown"', (await h.userName()) === 'Aminah' && (await SW.create(FW.app(m, { user: '' }), { ex: SX }).userName()) === 'unknown', await h.userName());
      var vs = await h.readSheetValues('Sheet1');
      check('P5', 'used', 'readSheetValues (the Stamp snapshot) walks the used range cell by cell: A1 = the serial, A5 = Oak, empty cells absent', vs.A5 && vs.A5.v === 'Oak' && vs.A1 && vs.A1.v === SERIAL && !('A4' in vs), Object.keys(vs));
    });
  }

  // ═══ P6 CITED ═══
  if (wants('P6')) {
    await guard('P6', 'cited', 'every member name wps_host.js and ribbon.js use is on the cited list (or a plain JS name); the fake throws on any other', async function () {
      var ok = citedNames(), js = {}; JS_OK.forEach(function (n) { js[n] = 1; });
      [[HOSTF, 'wps_host.js'], [RIBBON_JS, 'ribbon.js']].forEach(function (p) {
        var names = memberNames(p[0]), bad = names.filter(function (n) { return !ok[n] && !js[n]; });
        check('P6', 'names-' + p[1], p[1] + ': ' + names.length + ' member names, all on the cited list or plain JS', bad.length === 0, bad);
      });
      var used = memberNames(HOSTF).filter(function (n) { return ok[n]; });
      say('§SWPS-CITED wps_host.js uses ' + used.length + ' WPS names: ' + used.join(' '));
      var m = new Workbook(); m.addSheet('Sheet1'); var app = FW.app(m, { user: 'x' }), t1 = null;
      try { var u = app.ActiveWorkbook.Worksheets.Item(1).UsedRange; u.Value3; } catch (e) { t1 = e.message; }
      check('P6', 'fake-strict', 'the fake throws NotCited on a name that is not listed (Range.Value3)', /NotCited/.test(t1 || ''), t1);
      var t2 = null; try { app.Nope; } catch (e) { t2 = e.message; } check('P6', 'fake-strict-app', 'and on Application.Nope', /NotCited/.test(t2 || ''), t2);
      // every host method once against the strict fake: a name off the list throws NotCited here (and counts as a failure of this case, not a crash)
      var h = SW.create(FW.app(m, { user: 'u' }), { ex: SX }), thrown = null; m.selected = { sheet: 'Sheet1', addr: 'A1' };
      try { await h.setHidden('_door_p6', [['a', 'b']]); await h.getHidden('_door_p6'); await h.readCells('Sheet1', ['A1']); await h.writeCells('Sheet1', [{ cell: 'A1', value: 'x' }]); await h.readSheetValues('Sheet1'); await h.userName(); await h.activeSheet(); await h.visibleSheets(); await h.selectedCell(); } catch (e) { thrown = e.message; }
      check('P6', 'host-runs', 'all nine host methods run against the strict fake without touching a name off the list', thrown === null, thrown);
    });
  }

  // ═══ P7 RIBBON ═══
  if (wants('P7')) {
    await guard('P7', 'ribbon', 'ribbon.xml is well-formed and its buttons match ribbon.js, both ways; ribbon.js opens the pane at ?action=<id>', async function () {
      var PY = "import sys, json, xml.etree.ElementTree as E\nr=E.parse(sys.argv[1]).getroot()\nloc=lambda t: t.split('}')[-1]\nns=r.tag.split('}')[0].lstrip('{') if '}' in r.tag else ''\nb=[{'id':e.get('id'),'onAction':e.get('onAction'),'getImage':e.get('getImage'),'tag':loc(e.tag)} for e in r.iter() if loc(e.tag) in ('button','toggleButton','menu','splitButton','checkBox','dropDown','comboBox','editBox','gallery','labelControl','dynamicMenu')]\nprint(json.dumps({'ns':ns,'root':loc(r.tag),'onLoad':r.get('onLoad'),'controls':b,'ids':[e.get('id') for e in r.iter() if e.get('id')],'tabs':len([e for e in r.iter() if loc(e.tag)=='tab'])}))";
      var py = cp.spawnSync('python3', ['-I', '-c', PY, RIBBON_XML], { encoding: 'utf8' });
      check('P7', 'parses', 'python3 xml.etree (an independent parser) reads ribbon.xml', py.status === 0, py.stderr && py.stderr.slice(0, 300)); if (py.status !== 0) return;
      var man = JSON.parse(py.stdout);
      check('P7', 'customui', 'the root is <customUI> in the Office customUI namespace with an onLoad handler; one tab', man.root === 'customUI' && man.ns === 'http://schemas.microsoft.com/office/2006/01/customui' && !!man.onLoad && man.tabs === 1, { root: man.root, ns: man.ns });
      check('P7', 'only-button', 'every control is a plain button (no toggleButton: its onAction argument order differs in WPS, §11.1 [S-C]); 4 of them', man.controls.length === 4 && man.controls.every(function (c) { return c.tag === 'button'; }), man.controls);
      var src = fs.readFileSync(RIBBON_JS, 'utf8'), sb = { window: { Application: null }, document: { location: { href: BASE + 'wps/index.html' } }, URL: URL, Number: Number }, app = FW.app(new Workbook(), { user: 'u' });
      var mm = new Workbook(); mm.addSheet('Sheet1'); app = FW.app(mm, { user: 'u' }); sb.window.Application = app; vm.createContext(sb); vm.runInContext(src + '\n;this.__ACTION_OF = ACTION_OF; this.__fn = { OnAddinLoad: typeof OnAddinLoad, OnAction: typeof OnAction, GetImage: typeof GetImage };', sb);
      var table = sb.__ACTION_OF || {}, ids = man.controls.map(function (c) { return c.id; }).sort();
      check('P7', 'ids', 'the ribbon\'s button ids == the OnAction table\'s ids, both ways', J(ids) === J(Object.keys(table).sort()), { ribbon: ids, code: Object.keys(table).sort() });
      check('P7', 'actions', 'the table\'s actions == SheetAddin.ACTIONS, both ways', J(Object.keys(table).map(function (k) { return table[k]; }).sort()) === J(SA.ACTIONS.slice().sort()), { table: table, code: SA.ACTIONS });
      check('P7', 'callbacks', 'every callback ribbon.xml names (onLoad, onAction, getImage) is a global function in ribbon.js', ['onLoad', 'onAction', 'getImage'].every(function (cb) { var names = cb === 'onLoad' ? [man.onLoad] : man.controls.map(function (c) { return c[cb]; }); return names.every(function (nm) { return !!nm && sb.__fn[nm] === 'function'; }); }), sb.__fn);
      var imgs = setOf(man.controls, function (c) { return c.getImage; }); sb.__ctl = { Id: 'btnFileIt' };
      var img = vm.runInContext('GetImage(__ctl)', sb); check('P7', 'image', 'GetImage returns a file that exists next to ribbon.xml', fs.existsSync(path.join(WPSD, img)) && imgs.length === 1, img);
      vm.runInContext('OnAddinLoad({})', sb);
      var urls = []; for (var id of Object.keys(table)) { sb.__ctl = { Id: id }; vm.runInContext('OnAction(__ctl)', sb); var p = FW.panesOf(app)[0]; urls.push(p && p.url); }
      var want = SA.ACTIONS.map(function (a) { return BASE + 'taskpane.html?action=' + a; });
      check('P7', 'pane-url', 'each button, run on the fake WPS: the pane is created once, then navigated, at <base>taskpane.html?action=<its action>, and made visible', FW.panesOf(app).length === 1 && J(urls.slice().sort()) === J(want.slice().sort()) && FW.panesOf(app)[0].visible === true && FW.panesOf(app)[0].navigated.length === Object.keys(table).length - 1, { panes: FW.panesOf(app).length, urls: urls, nav: FW.panesOf(app)[0] && FW.panesOf(app)[0].navigated.length });
      var n0 = FW.panesOf(app).length; sb.__ctl = { Id: 'btnNope' }; vm.runInContext('OnAction(__ctl)', sb); check('P7', 'unknown-id', 'an unknown control id opens nothing', FW.panesOf(app).length === n0 && FW.panesOf(app)[0].url === urls[urls.length - 1], null);
      check('P7', 'unique', 'every id in ribbon.xml is unique', man.ids.length === setOf(man.ids, function (x) { return x; }).length, man.ids);
    });
    await guard('P7', 'entry', 'entry files: index.html loads main.js, main.js loads ribbon.js, jsplugins.xml names the https base and ends with "/"', async function () {
      var idx = fs.readFileSync(path.join(WPSD, 'index.html'), 'utf8'), mainjs = fs.readFileSync(path.join(WPSD, 'main.js'), 'utf8');
      check('P7', 'entry-chain', 'index.html has a script src=main.js (with the manifest tool ?v= code); main.js writes a script for ribbon.js', /<script[^>]+src="(\.\/)?main\.js(\?v=[0-9a-f]+)?"/.test(idx) && /document\.write\([^)]*src='ribbon\.js'/.test(mainjs), null);
      var PY = "import sys, json, xml.etree.ElementTree as E\nr=E.parse(sys.argv[1]).getroot()\nprint(json.dumps({'root':r.tag,'p':[e.attrib for e in r]}))";
      var py = cp.spawnSync('python3', ['-I', '-c', PY, path.join(WPSD, 'jsplugins.xml')], { encoding: 'utf8' }), j = py.status === 0 ? JSON.parse(py.stdout) : null;
      check('P7', 'jsplugins', 'jsplugins.xml parses; one jspluginonline, type "et" (spreadsheet), url == ' + BASE + 'wps/ (ends with "/", as wpsjs publish demands)', !!j && j.root === 'jsplugins' && j.p.length === 1 && j.p[0].type === 'et' && j.p[0].url === BASE + 'wps/', j);
      check('P7', 'images', 'images/door.svg is a well-formed SVG', /^<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/.test(fs.readFileSync(path.join(WPSD, 'images/door.svg'), 'utf8')), null);
    });
  }

  var done = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7'].filter(wants), vs = done.map(verdict);

  // ═══ MUTANTS ═══
  var killed = 0, MUT = [];
  if (process.env.SWPS_MUTANTS === '1' && !MUTANT) {
    MUT = [
      { name: 'M1-wps-host-reads-whole-sheet', file: HOSTF, env: 'SWPS_HOST', kills: 'P1', from: 'async function readCells(sheet, addrs) {', to: 'async function readCells(sheet, addrs) { await readSheetValues(sheet);' },
      { name: 'M2-wps-host-writes-extra-cell', file: HOSTF, env: 'SWPS_HOST', kills: 'P2', from: 'writes.forEach(function (x) { w.Range(x.cell).Value2 = textForCell(x.value); });', to: "writes.forEach(function (x) { w.Range(x.cell).Value2 = textForCell(x.value); }); w.Range('Z99').Value2 = 'x';" },
      { name: 'M5-hidden-sheet-left-visible', file: HOSTF, env: 'SWPS_HOST', kills: 'P4', from: 'w.Visible = VERY_HIDDEN;', to: 'w.Visible = VISIBLE;' },
      { name: 'M6-date-conversion-dropped', file: HOSTF, env: 'SWPS_HOST', kills: 'P5', from: 'out[a] = engineValue(val(r), r.NumberFormat);', to: "out[a] = engineValue(val(r), 'General');" },
      { name: 'M7-text-format-skipped', file: HOSTF, env: 'SWPS_HOST', kills: 'P4', from: "c.NumberFormat = '@'; ", to: '' },
      { name: 'M10-name-not-on-the-cited-list', file: HOSTF, env: 'SWPS_HOST', kills: 'P6', from: 'async function userName() { var n = app.UserName;', to: 'async function userName() { var n = app.UserName; app.ActiveWorkbook.Worksheets.Item(1).UsedRange.Value3;' },
      { name: 'M3-ribbon-button-without-handler', file: RIBBON_XML, env: 'SWPS_RIBBON_XML', kills: 'P7', from: '</group>', to: '<button id="btnGhost" label="Ghost" onAction="OnAction" getImage="GetImage" size="large"/></group>' },
      { name: 'M9-handler-id-renamed', file: RIBBON_JS, env: 'SWPS_RIBBON_JS', kills: 'P7', from: "btnStamp: 'stamp'", to: "btnStampX: 'stamp'" }
    ];
    var tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'swps-mut-'));
    MUT.forEach(function (m) {
      var src = fs.readFileSync(m.file, 'utf8'), n = src.split(m.from).length - 1;
      if (n !== 1) { say('§SWPS-MUTANT name=' + m.name + ' NOT-APPLIED matches=' + n); return; }
      var f = path.join(tmp, m.name + path.extname(m.file)); fs.writeFileSync(f, src.replace(m.from, m.to));
      var env = Object.assign({}, process.env, { SWPS_MUTANT: m.name, SWPS_MUTANTS: '', SWPS_ONLY: m.kills }); env[m.env] = f;
      var out = cp.spawnSync(process.execPath, [__filename], { env: env, encoding: 'utf8', maxBuffer: 64 << 20 }).stdout || '';
      var line = (out.match(new RegExp('§SWPS-' + m.kills + ' verdict=\\w+[^\\n]*')) || [''])[0], crashed = new RegExp('case=' + m.kills + ' key=\\S+ FAIL .* got="threw:').test(out), k = /verdict=FAIL/.test(line) && !crashed;
      if (k) killed++;
      say('§SWPS-MUTANT name=' + m.name + ' kills=' + m.kills + ' ' + (k ? 'KILLED' : crashed ? 'CRASHED(not a kill)' : 'SURVIVED') + ' child="' + line + '"');
    });
    say('§SWPS-MUTANTS killed=' + killed + '/' + MUT.length);
    if (killed !== MUT.length) ALL.failed++;
  }
  var overall = !ALL.judged ? 'INCONCLUSIVE' : ALL.failed ? 'FAIL' : vs.indexOf('INCONCLUSIVE') >= 0 ? 'INCONCLUSIVE' : 'PASS';
  say('§SWPS-VERDICT ' + overall + ' judged=' + ALL.judged + ' failed=' + ALL.failed + ' cases=' + J(vs) + ' (fake WPS object model; real WPS NOT run)');
  process.exit(overall === 'PASS' ? 0 : 1);
})().catch(function (e) { say('§SWPS-VERDICT FAIL crashed: ' + (e && e.stack || e)); process.exit(1); });
