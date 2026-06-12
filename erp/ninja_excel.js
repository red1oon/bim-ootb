// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ninja_excel.js — NinjaExcel RUN engine: read a three-sheet workbook (BACKUP/Input/Process), gate it,
// execute the Process rows over an injected query executor, write values back to addressed cells, and
// verify-by-example against the filled BACKUP sample. The binder between Excel (layout/format/graphs,
// the user's tool) and the in-browser substrate (sql.js over the folded client db).
//
// Implementing internal/NinjaExcelAdaptation.md §5.5 (completeness gate) + §6.2 (RUN verb) + §6.3
// (formula re-derivation duty) — Witnesses: W-NINJA-READ / W-NINJA-GATE / W-NINJA-RUN.
//
// ZERO-LLM + EXTRACT-DON'T-INVENT: nothing here authors a query or a value. The human owns the Process
// sheet (SELECT/TABLE/JOIN/WHERE columns = the executable truth); this module only assembles, executes,
// writes back, and FALSIFIES against the BACKUP sample (equality in integer cents = the oracle). A
// dangling token / missing bind / incomplete row REFUSES to run (explicit), never silently skips.
//
// SEAMS (internal, not a product axis — §6 of the design note): this module never requires `xlsx` or a
// DB driver. The caller hands in (a) a SheetJS workbook OBJECT and (b) an executor `exec(sql, params) ->
// scalar`. Node witness injects better-sqlite3; the browser pill will inject sql.js. Cell shape used:
// { v: cached value, f: formula text, t: type } — SheetJS's own.
//
// §6.3 RE-DERIVATION (named duty): SheetJS parses formulas but does NOT evaluate them, while the
// original's row engine relies on Excel recalc (`=ROW()`, `=CONCATENATE("@",C,"@",B)` —
// ProcessSheetGenerator:96/100). We therefore RE-DERIVE both deterministically from sheet geometry and
// NEVER trust the cached value of those two formula cells (a moved row leaves a stale cache).
// Determinism: no Date.now/Math.random; money compared in integer cents.
(function (global) {
  'use strict';

  // ── tiny A1 codec (keeps the module dependency-free; SheetJS not required here) ─────────────────────
  function decodeA1(addr) {
    var m = /^([A-Z]+)(\d+)$/.exec(String(addr).trim().toUpperCase());
    if (!m) return null;
    var col = 0;
    for (var i = 0; i < m[1].length; i++) col = col * 26 + (m[1].charCodeAt(i) - 64);
    return { c: col - 1, r: parseInt(m[2], 10) - 1 };            // 0-based, SheetJS convention
  }
  function encodeA1(rc) {
    var c = rc.c + 1, s = '';
    while (c > 0) { var rem = (c - 1) % 26; s = String.fromCharCode(65 + rem) + s; c = Math.floor((c - 1) / 26); }
    return s + (rc.r + 1);
  }
  function cellAt(ws, r, c) { return ws ? ws[encodeA1({ r: r, c: c })] : undefined; }
  function txt(cell) { return cell == null || cell.v == null ? '' : String(cell.v).trim(); }
  function cents(n) { return Math.round(Number(n || 0) * 100); }

  // Process sheet column order — the original schema, unchanged (ProcessSheetGenerator:70).
  var COLS = { ANNOTATION: 0, ROW: 1, SELECT: 2, TABLE: 3, JOIN: 4, WHERE: 5, ADDRESS: 6, DIRECTION: 7, VALUES: 8 };

  // ── readManifest(wb) → { binds, rows, inputTokens, errors } ─────────────────────────────────────────
  // binds: from the Input sheet by deterministic adjacency — a cell whose text is "#n" labels a bind;
  //        the bind VALUE is the cell immediately to its right (the Input sheet is the parameter surface).
  // rows:  Process rows 2.. with re-derived `row` (=ROW() ⇒ sheet position) and re-derived `annotation`
  //        (=CONCATENATE("@",C,"@",B) ⇒ '@'+SELECT+'@'+row). staleAnnotation flags a cache≠derived cell.
  // inputTokens: every @…@ cell on Input — each must be covered by exactly one Process ADDRESS (gate).
  function readManifest(wb, opts) {
    opts = opts || {};
    var inputName = opts.inputSheet || 'Input', procName = opts.processSheet || 'Process';
    var input = wb.Sheets[inputName], proc = wb.Sheets[procName];
    var errors = [];
    if (!input) errors.push('missing sheet: ' + inputName);
    if (!proc) errors.push('missing sheet: ' + procName);
    if (errors.length) return { binds: {}, rows: [], inputTokens: [], errors: errors };

    var binds = {}, inputTokens = [], addr, cell, m;
    for (addr in input) {
      if (addr[0] === '!') continue;
      cell = input[addr];
      var t = txt(cell);
      if ((m = /^#(\d+)$/.exec(t))) {                                  // "#n" label → value sits to the right
        var rc = decodeA1(addr), vcell = cellAt(input, rc.r, rc.c + 1);
        if (vcell && vcell.v != null && String(vcell.v).trim() !== '') binds[m[1]] = vcell.v;
        else errors.push('bind #' + m[1] + ' labelled at ' + addr + ' has no value cell to its right');
      } else if (/^@.+@$/.test(t)) {
        inputTokens.push({ address: addr, token: t });
      }
    }

    var rows = [];
    for (var r = 1; ; r++) {                                           // sheet row 2.. (0-based r=1..)
      var any = false, raw = {};
      for (var k in COLS) { var c0 = cellAt(proc, r, COLS[k]); raw[k] = c0; if (c0 && c0.v != null && txt(c0) !== '') any = true; }
      if (!any) break;                                                 // first fully-empty row ends the table
      var select = txt(raw.SELECT), table = txt(raw.TABLE), join = txt(raw.JOIN), where = txt(raw.WHERE);
      var derivedRow = r + 1;                                          // §6.3: =ROW() re-derived from position
      var derivedAnn = '@' + select + '@' + derivedRow;                // §6.3: =CONCATENATE("@",C,"@",B) re-derived
      var cachedAnn = raw.ANNOTATION ? txt(raw.ANNOTATION) : '';
      rows.push({
        sheetRow: derivedRow, row: derivedRow, annotation: derivedAnn,
        staleAnnotation: !!(raw.ANNOTATION && raw.ANNOTATION.f && cachedAnn !== '' && cachedAnn !== derivedAnn),
        cachedAnnotation: cachedAnn,
        select: select, table: table, join: join, where: where,
        address: txt(raw.ADDRESS).toUpperCase(), direction: txt(raw.DIRECTION) || '>'
      });
    }
    return { binds: binds, rows: rows, inputTokens: inputTokens, inputSheet: inputName, errors: errors };
  }

  // ── gate(manifest) → { ok, errors } — the §5.5 completeness gate: REFUSE, never silently skip ───────
  function gate(manifest) {
    var errors = manifest.errors.slice();
    var covered = {};
    manifest.rows.forEach(function (row, i) {
      var tag = 'Process row ' + row.sheetRow;
      if (row.direction !== '>') { errors.push(tag + ': Direction "' + row.direction + '" not supported (read-only RUN; write-back is phase 2)'); return; }
      if (!row.select) errors.push(tag + ': empty SELECT');
      if (!row.table) errors.push(tag + ': empty TABLE');
      if (!row.address) errors.push(tag + ': empty ADDRESS');
      else if (!decodeA1(row.address)) errors.push(tag + ': bad ADDRESS "' + row.address + '"');
      else covered[row.address] = (covered[row.address] || 0) + 1;
      var bm, bre = /#(\d+)/g, full = row.select + ' ' + row.join + ' ' + row.where;
      while ((bm = bre.exec(full))) {
        if (!(bm[1] in manifest.binds)) errors.push(tag + ': bind #' + bm[1] + ' referenced but not provided on ' + manifest.inputSheet);
      }
    });
    manifest.inputTokens.forEach(function (tk) {
      if (!covered[tk.address]) errors.push('dangling token ' + tk.token + ' at ' + manifest.inputSheet + '!' + tk.address + ': no Process row addresses it');
      else if (covered[tk.address] > 1) errors.push('token at ' + tk.address + ' addressed by ' + covered[tk.address] + ' Process rows (must be exactly one)');
    });
    return { ok: errors.length === 0, errors: errors };
  }

  // ── assemble(row, binds) → { sql, params } — #n → '?' in textual order (sql.js + better-sqlite3 safe) ─
  function assemble(row, binds) {
    var params = [];
    function sub(s) { return String(s).replace(/#(\d+)/g, function (_, n) { params.push(binds[n]); return '?'; }); }
    var sql = 'SELECT ' + sub(row.select) + ' FROM ' + sub(row.table);
    if (row.join) sql += ' JOIN ' + sub(row.join);
    if (row.where) sql += ' WHERE ' + sub(row.where);
    return { sql: sql, params: params };
  }

  // ── run(manifest, exec) → [{address, value, sql}] — exec(sql, params) returns the scalar ────────────
  // GATE FIRST: a manifest that does not pass the gate throws (refuse-to-run is the contract).
  function run(manifest, exec) {
    var g = gate(manifest);
    if (!g.ok) { var e = new Error('gate refused: ' + g.errors.join(' | ')); e.gateErrors = g.errors; throw e; }
    return manifest.rows.map(function (row) {
      var q = assemble(row, manifest.binds);
      return { address: row.address, value: exec(q.sql, q.params), sql: q.sql, annotation: row.annotation };
    });
  }

  // ── writeBack(wb, sheetName, results) — fill the addressed cells (replacing the @token@ holes) ──────
  function writeBack(wb, sheetName, results) {
    var ws = wb.Sheets[sheetName];
    results.forEach(function (res) {
      var num = typeof res.value === 'number';
      ws[res.address] = { t: num ? 'n' : 's', v: res.value };
    });
  }

  // ── verifyByExample(wb, backupSheet, results) → the §FALSIFIER oracle (design note §5.1) ────────────
  // Numbers compare in integer cents (maxDiffCents); strings compare exact. Equality with the filled
  // BACKUP sample is the ONLY acceptance — a wrong binding is falsified, never explained away.
  function verifyByExample(wb, backupSheet, results) {
    var bk = wb.Sheets[backupSheet], per = [], maxDiffCents = 0, stringMismatches = 0;
    results.forEach(function (res) {
      var sample = bk[res.address], sv = sample ? sample.v : undefined, entry = { address: res.address, got: res.value, sample: sv };
      if (typeof res.value === 'number' && typeof sv === 'number') {
        entry.diffCents = Math.abs(cents(res.value) - cents(sv));
        if (entry.diffCents > maxDiffCents) maxDiffCents = entry.diffCents;
      } else {
        entry.equal = String(res.value) === String(sv);
        if (!entry.equal) stringMismatches++;
      }
      per.push(entry);
    });
    return { cells: per.length, maxDiffCents: maxDiffCents, stringMismatches: stringMismatches,
             pass: maxDiffCents === 0 && stringMismatches === 0, per: per };
  }

  // ════ MAKE verb — analyze a filled BACKUP sheet, scaffold Input + Process ════════════════════════════
  // Implementing internal/NinjaExcelAdaptation.md §5.2 (suggestedQueryType from formula text), §5.3
  // (identifyTableStructures as pure run-length geometry), §5.4 (SELECT proposal from adjacent label) —
  // Witness: W-NINJA-MAKE. The Maker PROPOSES; the human finishes the Process sheet (confirm-each, §9.1):
  // a scaffold is deliberately NOT runnable (empty TABLE → the §5.5 gate refuses it until the user fills it).

  // §5.2 — the cell IS a formula; parse the author's own intent (closes the suggestedQueryType stub).
  function suggestedQueryType(formula) {
    var f = String(formula || '').replace(/^=/, '').trim().toUpperCase();
    if (/^SUM\(/.test(f)) return 'SUM';
    if (/^COUNT(A)?\(/.test(f)) return 'COUNT';
    if (/^AVERAGE\(/.test(f)) return 'AVG';
    return 'SELECT';
  }

  function normalizeLabel(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }

  // §5.3 — a table = a maximal run of ≥2 consecutive rows sharing the same filled-column span, containing
  // no formula cells (a formula row is template machinery — §3/§4: FORMULA is a declared fact); header =
  // the all-STRING first row of the run. Pure shape detection, no AI (closes the identifyTableStructures stub).
  function detectTables(ws) {
    var ref = ws['!ref']; if (!ref) return [];
    var end = decodeA1(ref.split(':')[1] || ref.split(':')[0]);
    var rows = [];
    for (var r = 0; r <= end.r; r++) {
      var cols = [], allString = true, hasFormula = false;
      for (var c = 0; c <= end.c; c++) {
        var cell = cellAt(ws, r, c);
        if (cell && cell.v != null && String(cell.v) !== '') {
          cols.push(c);
          if (cell.f) hasFormula = true;
          if (cell.t !== 's') allString = false;
        }
      }
      rows.push({ sig: cols.join(','), cols: cols, allString: allString, hasFormula: hasFormula, empty: cols.length === 0 });
    }
    var tables = [], r0 = 0;
    while (r0 < rows.length) {
      if (rows[r0].empty || rows[r0].hasFormula) { r0++; continue; }
      var r1 = r0;
      while (r1 + 1 < rows.length && !rows[r1 + 1].empty && !rows[r1 + 1].hasFormula && rows[r1 + 1].sig === rows[r0].sig) r1++;
      if (r1 > r0 && rows[r0].allString) {                       // ≥2 rows, all-string first row = header
        var dataHasValue = false;
        for (var rr = r0 + 1; rr <= r1; rr++) if (!rows[rr].allString) dataHasValue = true;
        if (dataHasValue) tables.push({
          headerRow: r0, dataStart: r0 + 1, dataEnd: r1,
          cols: rows[r0].cols.map(function (c) { return { c: c, header: txt(cellAt(ws, r0, c)) }; })
        });
      }
      r0 = r1 + 1;
    }
    return tables;
  }

  // analyzeBackup(ws) → { tables, dynamicCells, preservedFormulas } — what the Maker found, and what it
  // deliberately leaves alone. dynamicCells = table data cells (§5.3) + single numeric point-cells with a
  // string label immediately left (§5.4 adjacency); each carries a SELECT *proposal* from its label.
  function analyzeBackup(ws) {
    var tables = detectTables(ws), ref = ws['!ref'], end = decodeA1(ref.split(':')[1] || ref.split(':')[0]);
    var dynamicCells = [], preservedFormulas = [], inTable = {};
    tables.forEach(function (t) {
      for (var r = t.dataStart; r <= t.dataEnd; r++) t.cols.forEach(function (col) {
        var addr = encodeA1({ r: r, c: col.c });
        inTable[addr] = true;
        dynamicCells.push({ address: addr, row: r + 1, col: col.c + 1, kind: 'table-cell',
                            label: col.header, selectProposal: normalizeLabel(col.header) });
      });
    });
    for (var r = 0; r <= end.r; r++) for (var c = 0; c <= end.c; c++) {
      var addr = encodeA1({ r: r, c: c }), cell = ws[addr];
      if (!cell || cell.v == null) continue;
      if (cell.f) {                                              // template-owned: PRESERVED, never a query
        preservedFormulas.push({ address: addr, formula: cell.f, queryType: suggestedQueryType(cell.f) });
      } else if (cell.t === 'n' && !inTable[addr]) {             // §5.4 point-cell: numeric + label to the left
        var left = cellAt(ws, r, c - 1);
        if (left && left.t === 's' && txt(left) !== '') {
          dynamicCells.push({ address: addr, row: r + 1, col: c + 1, kind: 'point-cell',
                              label: txt(left), selectProposal: normalizeLabel(txt(left)) });
        }
      }
    }
    return { tables: tables, dynamicCells: dynamicCells, preservedFormulas: preservedFormulas };
  }

  // makeScaffold(wb) — generate Input (layout copy, @field_<row>_<col>@ holes, formulas preserved) and
  // Process (one proposal row per dynamic cell: SELECT=label proposal, TABLE/WHERE EMPTY for the user).
  function makeScaffold(wb, opts) {
    opts = opts || {};
    var backupName = opts.backupSheet || 'BACKUP', ws = wb.Sheets[backupName];
    var a = analyzeBackup(ws);
    var dyn = {}; a.dynamicCells.forEach(function (d) { dyn[d.address] = d; });

    var input = { '!ref': ws['!ref'] };
    for (var addr in ws) {
      if (addr[0] === '!') continue;
      var cell = ws[addr];
      if (dyn[addr]) input[addr] = { t: 's', v: '@field_' + dyn[addr].row + '_' + dyn[addr].col + '@' };
      else if (cell.f) input[addr] = { t: cell.t, f: cell.f, v: 0 };     // formula survives; Excel recalcs
      else input[addr] = { t: cell.t, v: cell.v };
    }

    var proc = { '!ref': 'A1:I' + (1 + a.dynamicCells.length) };
    var header = ['ANNOTATION', 'ROW', 'SELECT', 'TABLE', 'JOIN', 'WHERE', 'ADDRESS', 'Direction', 'VALUES'];
    header.forEach(function (h, c) { proc[encodeA1({ r: 0, c: c })] = { t: 's', v: h }; });
    a.dynamicCells.forEach(function (d, i) {
      var sheetRow = i + 2;
      proc['A' + sheetRow] = { t: 's', f: 'CONCATENATE("@",C' + sheetRow + ',"@",B' + sheetRow + ')',
                               v: '@' + d.selectProposal + '@' + sheetRow };
      proc['B' + sheetRow] = { t: 'n', f: 'ROW()', v: sheetRow };
      proc['C' + sheetRow] = { t: 's', v: d.selectProposal };           // PROPOSAL — user confirms/edits
      proc['G' + sheetRow] = { t: 's', v: d.address };                  // D/E/F (TABLE/JOIN/WHERE) left for user
      proc['H' + sheetRow] = { t: 's', v: '>' };
    });

    wb.Sheets.Input = input; wb.Sheets.Process = proc;
    ['Input', 'Process'].forEach(function (n) { if (wb.SheetNames.indexOf(n) < 0) wb.SheetNames.push(n); });
    return a;
  }

  var API = { decodeA1: decodeA1, encodeA1: encodeA1, cents: cents, COLS: COLS,
              readManifest: readManifest, gate: gate, assemble: assemble, run: run,
              writeBack: writeBack, verifyByExample: verifyByExample,
              suggestedQueryType: suggestedQueryType, detectTables: detectTables,
              analyzeBackup: analyzeBackup, makeScaffold: makeScaffold, normalizeLabel: normalizeLabel };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else global.NinjaExcel = API;
})(typeof self !== 'undefined' ? self : this);
