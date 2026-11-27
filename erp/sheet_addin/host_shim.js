// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// host_shim.js - the THIN menu every spreadsheet host shares: read the tagged cells, apply `writes`, show the verdict.
// Implementing bim-compiler prompts/SHEET_FRONT_DOOR.md §8 (slice S3) - Witness: W-SHEET-ADDIN (erp/tests/witness_sheet_addin.js).
// Host-neutral (browser + node, UMD). It is written against a tiny HOST INTERFACE, every call async:
//   readCells(sheet, addrs) -> { addr: value }          writeCells(sheet, [{ cell, value }])
//   readSheetValues(sheet)  -> { addr: { v, f } }        getHidden(name) -> rows | []      setHidden(name, rows)  (rows = arrays of strings)
//   userName() -> string     activeSheet() -> name       visibleSheets() -> [names]        selectedCell() -> { sheet, cell }
//   OPTIONAL: noSavedResult(sheet, addrs) -> [addrs]  the cells that hold a formula and NO saved result (a file re-saved by a writer that does not calculate). A live program
//   (Excel, WPS) always has a value for a formula cell and does not have this method; a workbook FILE host (xlsx_host.js) does. §12 Rule 1: the engine refuses on it.
// The shim holds NO invoice logic and NO cell address: the engine (sheet_door.js) says which cells it reads (tagCells) and what to write back;
// a new layout is a new `_door_tags` entry. Hidden sheets: _door_tags (the template), _door_ledger (signed journal entries, one per filing),
// _door_history (S9 entries). One entry = one ROW, cut into chunks across columns so no cell passes the host's character limit (§6.4).
(function (global) {
  'use strict';
  var TAGS = '_door_tags', LEDGER = '_door_ledger', HISTORY = '_door_history';
  var CELL_LIMIT = 32767;                                   // an Excel cell holds at most 32,767 characters (§6.4)
  var ACTIONS = ['fileit', 'stamp', 'cellhistory', 'checkhistory'];

  // splitLine(line, limit) -> chunks of at most `limit` UTF-16 units, never between the two halves of a surrogate pair
  function splitLine(line, limit) {
    var out = [], i = 0, n = line.length;
    limit = limit || CELL_LIMIT;
    while (i < n) {
      var end = Math.min(n, i + limit);
      if (end < n) { var c = line.charCodeAt(end - 1); if (c >= 0xD800 && c <= 0xDBFF) end--; }
      out.push(line.slice(i, end)); i = end;
    }
    return out;
  }
  // §12 Rule 3: a character beyond U+FFFF is written as its two \uXXXX surrogate escapes (these lines are JSON, so parsing returns the same text and no digest changes); the vendored
  //   reader misreads such a character stored inline (U+1F600 -> U+F600), the escaped line has none.
  function escapeAstral(line) { return line.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, function (p) { return '\\u' + p.charCodeAt(0).toString(16) + '\\u' + p.charCodeAt(1).toString(16); }); }
  function joinRow(row) { return row.join(''); }
  function rowsToLines(rows) { return rows.map(joinRow).filter(function (l) { return l !== ''; }); }

  function create(host, deps) {
    deps = deps || {};
    var SD = deps.SheetDoor, SH = deps.SheetHistory, runner = deps.runner || null, now = deps.now || function () { return new Date().toISOString(); };
    var limit = deps.cellLimit || CELL_LIMIT;

    async function appendRow(name, line) {                    // every stored line (old ones too) in the escaped form, one row each, cut into chunks
      var ls = rowsToLines(await host.getHidden(name));
      ls.push(line);
      await host.setHidden(name, ls.map(function (l) { return splitLine(escapeAstral(l), limit); }));
    }
    async function lines(name) { return rowsToLines(await host.getHidden(name)); }
    function parse(ls) { return ls.map(function (l) { return JSON.parse(l); }); }

    // ── File it ──
    async function fileIt() {
      var tplLines = await lines(TAGS);
      if (!tplLines.length) return { action: 'fileit', verdict: 'INCONCLUSIVE', text: 'Not filed: this workbook has no ' + TAGS + ' sheet (no template to read)', writes: [] };
      var tpl; try { tpl = JSON.parse(tplLines[0]); } catch (e) { return { action: 'fileit', verdict: 'REFUSED', text: 'Not filed: ' + TAGS + ' is not valid JSON', writes: [] }; }
      var sheet = tpl.sheet || await host.activeSheet();
      var cells = await host.readCells(sheet, SD.tagCells(tpl));
      var nsr = host.noSavedResult ? await host.noSavedResult(sheet, SD.tagCells(tpl)) : [];
      if (!runner) return { action: 'fileit', verdict: 'NOT-WIRED', text: 'Not filed: the books engine is not loaded in this pane (browser runner not wired yet)', writes: [] };
      var out = await runner.file(tpl, cells, await lines(LEDGER), nsr), r = out.result || {};
      var line = out.ledgerLine;
      if (line) { try { await appendRow(LEDGER, line); } catch (e) { return { action: 'fileit', verdict: 'ERROR', text: 'The ledger row could not be saved: ' + (e && e.message), writes: [] }; } }
      var writes = r.writes || [];
      if (writes.length) await host.writeCells(sheet, writes);
      var st = tpl.header && tpl.header.status ? writes.filter(function (w) { return w.cell === tpl.header.status; })[0] : null;
      return { action: 'fileit', verdict: r.verdict || 'REFUSED', ok: !!r.ok, text: st ? String(st.value) : (r.reason || r.verdict || ''), writes: writes, result: r, ledgerRow: !!line, checksLine: r.checksLine || null };
    }

    // ── Stamp ──
    async function stamp() {
      var ls = await lines(HISTORY), v = await SH.verify(ls);
      if (!v.ok) return { action: 'stamp', verdict: 'REFUSED', text: 'History is broken at entry ' + v.brokenAt + ' (' + v.why + '); nothing recorded' };
      var entries = parse(ls), next = {}, names = await host.visibleSheets(), cellCount = 0;
      for (var i = 0; i < names.length; i++) { var snap = await host.readSheetValues(names[i]); next[names[i]] = snap; cellCount += Object.keys(snap).length; }
      if (!cellCount && !entries.length) return { action: 'stamp', verdict: 'INCONCLUSIVE', text: 'Nothing to record: the visible sheets hold no cells' };
      var prev = entries.length ? SH.asOf(entries, entries.length) : null;
      var r = await SH.record(entries, prev, next, await host.userName(), now());
      if (r.verdict !== 'RECORDED') return { action: 'stamp', verdict: 'NO-OP', text: 'No change since the last stamp' };
      await appendRow(HISTORY, r.line);
      return { action: 'stamp', verdict: 'RECORDED', text: 'Stamped entry ' + r.entry.seq + ': ' + r.entry.payload.ops.length + ' cell(s)', entry: r.entry, cells: r.entry.payload.ops.length, chunks: splitLine(r.line, limit).length };
    }

    // ── History of this cell ──
    async function cellHistory(where) {
      var sel = where || await host.selectedCell(), hl = await lines(HISTORY), v = await SH.verify(hl);
      if (!v.ok) return { action: 'cellhistory', verdict: 'BROKEN', text: 'History is broken at entry ' + v.brokenAt + ' (' + v.why + '); no story shown' };
      var entries = parse(hl);
      var story = SH.cellStory(entries, sel.sheet, sel.cell);
      var show = function (c) { return c == null ? '(empty)' : (c.f != null ? '=' + c.f : String(c.v)); };
      var text = story.length ? story.map(function (s) { return '#' + s.seq + ' ' + s.at + ' ' + s.actor + ': ' + show(s.before) + ' -> ' + show(s.after) + (s.typedOverFormula ? ' (formula typed over)' : ''); }).join('\n') : 'No recorded history for ' + sel.sheet + '!' + sel.cell;
      return { action: 'cellhistory', verdict: story.length ? 'STORY' : 'INCONCLUSIVE', text: text, story: story, sheet: sel.sheet, cell: sel.cell };
    }

    // ── Check history: the sheet history AND the ledger share one entry format, one verifier ──
    async function checkHistory() {
      var hl = await lines(HISTORY), ll = await lines(LEDGER);
      if (!hl.length && !ll.length) return { action: 'checkhistory', verdict: 'INCONCLUSIVE', text: 'Nothing recorded yet: no history and no ledger' };
      var parts = [], ok = true, h = await SH.verify(hl), l = await SH.verify(ll);
      [['history', hl, h], ['ledger', ll, l]].forEach(function (x) {
        if (!x[1].length) { parts.push(x[0] + ': empty'); return; }
        if (x[2].ok) parts.push(x[0] + ': ' + x[2].entries + ' entr' + (x[2].entries === 1 ? 'y' : 'ies') + ' verify'); else { ok = false; parts.push(x[0] + ': BROKEN at entry ' + x[2].brokenAt + ' (' + x[2].why + ')'); }
      });
      return { action: 'checkhistory', verdict: ok ? 'OK' : 'BROKEN', ok: ok, text: parts.join('; '), history: h, ledger: l };
    }

    var run = { fileit: fileIt, stamp: stamp, cellhistory: cellHistory, checkhistory: checkHistory };
    return { fileIt: fileIt, stamp: stamp, cellHistory: cellHistory, checkHistory: checkHistory, run: function (id) { return run[id](); }, has: function (id) { return typeof run[id] === 'function'; }, actions: ACTIONS.slice() };
  }

  var api = { create: create, splitLine: splitLine, escapeAstral: escapeAstral, joinRow: joinRow, ACTIONS: ACTIONS, CELL_LIMIT: CELL_LIMIT, TAGS: TAGS, LEDGER: LEDGER, HISTORY: HISTORY };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else global.SheetAddin = api;
})(typeof window !== 'undefined' ? window : this);
