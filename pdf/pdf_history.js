// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// pdf_history.js - the ONE owner of "the history of this file": the S9 lines travel INSIDE the downloaded PDF (an embedded file,
//   _door_history.jsonl) and inside the downloaded .xlsx (the hidden sheet _door_history, the Excel menu's own row-of-chunks convention).
// Implementing bim-compiler prompts/PDF_EDITOR.md §4.5 - Witness: W-PDF-HISTORY (pdf/tests/witness_pdf_history.js).
// No second log format: every entry is made and verified by erp/sheet_history.js (handed in as SH); the reader (RR) and the writer (PW)
//   are handed in too, so this file holds no PDF and no hashing code of its own.
// check(SH, RR, lines, items) -> { state:'none'|'ok'|'broken'|'mismatch', ... }   the carried history, verified AND bound to the numbers on the page
// adopt(checkResult, lines) -> { history, lines, snap, brk } - continue the chain, or start over with the break to record
// start(SH, RR, history, snap, R, page, brk, actor, at) -> the page's sheet as first read: the genesis entry, or an entry that adds this page
// save(PW, bytes, lines) -> the PDF with the lines inside        toWorkbook(XLSX, wb, lines, split, limit) -> the .xlsx with the hidden sheet
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.PdfHistory = factory(); })(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var NAME = '_door_history.jsonl', SHEET = '_door_history', BREAK = '_door_break';
  function log(s) { if (typeof console !== 'undefined') console.log(s); }
  function sheetOf(page) { return Number(page) > 1 ? 'Report p' + Number(page) : 'Report'; }
  function pageOf(sheet) { var m = /^Report(?: p([1-9]\d*))?$/.exec(String(sheet)); return m ? Number(m[1] || 1) : null; }
  function toBytes(lines) { return new TextEncoder().encode((lines || []).map(function (l) { return l + '\n'; }).join('')); }
  function addr(cell) { var m = /^([A-Z]+)(\d+)$/.exec(cell) || ['', 'A', '0'], c = 0; for (var i = 0; i < m[1].length; i++) c = c * 26 + (m[1].charCodeAt(i) - 64); return [Number(m[2]), c]; }
  function byCell(a, b) { var x = addr(a), y = addr(b); return x[0] - y[0] || x[1] - y[1]; }
  function show(v) { return v === undefined ? '(nothing)' : v === null ? '(empty)' : String(v); }
  function short(h) { return String(h || '').slice(0, 12); }

  // the carried history against the file it came in: verified by the S9 engine, then replayed and compared with what the reader reads NOW
  async function check(SH, RR, lines, items) {
    if (!lines || !lines.length) return { state: 'none', entries: 0 };
    var v = { ok: true }; /*MUT-ACCEPT*/ v = await SH.verify(lines);
    if (!v.ok) return { state: 'broken', entries: lines.length, brokenAt: v.brokenAt, why: v.why };
    var history = lines.map(function (l) { return JSON.parse(l); }), snap = SH.asOf(history, history.length), last = history[history.length - 1];
    var out = { state: 'ok', entries: history.length, history: history, snap: snap, head: last.hash, pages: [], of: 0, differ: 0, first: null, kind: null };
    var skip = false; /*MUT-NOBIND*/
    Object.keys(snap).filter(function (s) { return s.indexOf('_door_') !== 0; }).sort(function (a, b) { return (pageOf(a) || 0) - (pageOf(b) || 0); }).forEach(function (s) {
      if (skip) return;
      var p = pageOf(s), was = snap[s], now = p && p <= (items || []).length ? RR.toSnapshot(RR.read(items, { page: p })).Report : {}, all = {};
      if (p) out.pages.push(p);
      Object.keys(was).concat(Object.keys(now)).forEach(function (a) { all[a] = 1; });
      Object.keys(all).sort(byCell).forEach(function (a) {
        out.of++;
        var h = was[a] ? was[a].v : undefined, n = now[a] ? now[a].v : undefined; if (h === n) return;
        out.differ++; if (h === undefined || n === undefined) out.kind = 'other-file';
        if (!out.first) out.first = { sheet: s, page: p, cell: a, history: h, printed: n };
      });
    });
    if (out.differ) { out.state = 'mismatch'; out.kind = out.kind || 'changed-outside'; }
    return out;
  }
  // continue, or not: ONLY an intact history that matches the page is taken up; anything else leaves an empty history and the break to record
  function adopt(c, lines) {
    var go = !!c && c.state === 'ok'; /*MUT-RESTART*/
    return go ? { history: c.history.slice(), lines: lines.slice(), snap: c.snap, brk: null } : { history: [], lines: [], snap: null, brk: breakNote(c) };
  }
  // what a break is, in one sentence: recorded in the next genesis (a cell of its own, so the digest protects it) and shown to the user
  function breakNote(c) {
    if (!c || (c.state !== 'broken' && c.state !== 'mismatch')) return null;
    if (c.state === 'broken') return 'The history carried in this file was changed by hand: entry ' + c.brokenAt + ' of ' + c.entries + ' does not verify (' + c.why + '). A new history starts here.';
    var f = c.first;
    return 'The history carried in this file (' + c.entries + ' entries, last ' + short(c.head) + ') does not match the page: ' + f.cell + (f.page > 1 ? ' on page ' + f.page : '') + ' prints ' + show(f.printed) + ', the history says ' + show(f.history) +
      ' (' + c.differ + ' of ' + c.of + ' cells differ: ' + (c.kind === 'other-file' ? 'this is another file\'s history' : 'the PDF was changed outside this editor') + '). A new history starts here.';
  }
  function words(c, entries, verified) {
    if (c && (c.state === 'broken' || c.state === 'mismatch') && !entries) return breakNote(c).replace(' A new history starts here.', ' It is not continued: the next change starts a new history that records this.');
    if (!entries) return 'No history yet. Read as sheet starts one; it is kept inside the PDF and the .xlsx you download.';
    return 'History: ' + entries + (entries === 1 ? ' entry' : ' entries') + ', ' + (verified ? 'verified' : 'NOT verified') + (c && c.state === 'ok' ? ', carried inside this file and continued' : '') + '. It is kept inside the PDF and the .xlsx you download.';
  }
  // the sheet of one page as first read: genesis when the history is empty (with the break, if one was found), else an entry adding this page
  async function start(SH, RR, history, snap, R, page, brk, actor, at) {
    var next = {}; Object.keys(snap || {}).forEach(function (s) { next[s] = snap[s]; });
    next[sheetOf(page)] = RR.toSnapshot(R).Report;
    if (!history.length && brk) { /*MUT-NOBREAK*/ next[BREAK] = { A1: { v: brk, f: null } }; }
    var r = await SH.record(history, history.length ? (snap || {}) : null, next, actor || 'report-reader', at);
    return { verdict: r.verdict, entry: r.entry, line: r.line, snapshot: r.entry ? next : (snap || null) };
  }
  async function save(PW, bytes, lines) {
    var r = await PW.embedFile(bytes, NAME, toBytes(lines));
    log('§PDFHIST-SAVE ok=' + r.ok + ' entries=' + (lines || []).length + ' lineBytes=' + toBytes(lines).length + ' bytesIn=' + bytes.length + ' bytesOut=' + r.bytes.length + ' added=' + (r.bytes.length - bytes.length) + ' replaced=' + r.replaced + (r.ok ? '' : ' reason=' + r.refused[0].reason));
    return r;
  }
  // the Excel menu's convention (erp/sheet_addin/host_shim.js): one entry per ROW, cut into chunks across columns, text cells, very hidden
  function toRows(lines, split, limit) { return (lines || []).map(function (l) { return split(l, limit); }); }
  function toWorkbook(XLSX, wb, lines, split, limit) {
    var rows = toRows(lines, split, limit); /*MUT-NOSHEET*/
    if (!rows.length) return wb;
    var ws = XLSX.utils.aoa_to_sheet(rows); Object.keys(ws).forEach(function (k) { if (k[0] !== '!') { ws[k].t = 's'; ws[k].z = '@'; } });
    XLSX.utils.book_append_sheet(wb, ws, SHEET);
    wb.Workbook = wb.Workbook || {}; wb.Workbook.Sheets = wb.Workbook.Sheets || []; while (wb.Workbook.Sheets.length < wb.SheetNames.length) wb.Workbook.Sheets.push({ Hidden: 0 });
    wb.Workbook.Sheets[wb.SheetNames.indexOf(SHEET)] = { Hidden: 2 };
    return wb;
  }
  // the .xlsx bytes, one owner: deflate ON (SheetJS stores uncompressed by default, and JSON lines double in size as XML text: §4.5.4)
  function xlsxBytes(XLSX, wb) { return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx', compression: true /*MUT-STORED*/ })); }
  // a cell's story, one plain line per value it had
  function story(SH, history, sheet, cell) {
    var one = function (c) { return c == null ? '(empty)' : String(c.v); };
    return SH.cellStory(history || [], sheet, cell).map(function (s) { return '#' + s.seq + ' ' + String(s.at).slice(0, 16).replace('T', ' ') + ' ' + s.actor + ': ' + one(s.before) + ' -> ' + one(s.after) + (s.typedOverFormula ? ' (typed over a total)' : ''); });
  }
  return { NAME: NAME, SHEET: SHEET, BREAK: BREAK, sheetOf: sheetOf, pageOf: pageOf, toBytes: toBytes, check: check, adopt: adopt, breakNote: breakNote, words: words, start: start, save: save, toRows: toRows, toWorkbook: toWorkbook, xlsxBytes: xlsxBytes, story: story };
});
