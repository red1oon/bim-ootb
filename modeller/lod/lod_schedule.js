// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// # ⚠ DO NOT REMOVE — lod_schedule.js: a drawing's schedule TABLE read into the Beam rebar marks, through a schedule FORMAT (data, lod/rules/schedule_formats.json). Read the §LODUP_SCHED_* log; the exit code is not evidence.
// Implementing prompts/MODELLER_LOD_UPGRADE_PILL.md "P8 SPEC" — Witness: W-LODUP-SCHEDFMT (modeller/tests/witness_lodup_schedfmt.js).
// Issue proved/disproved: "the beam rebar pack only works on the one building it was built on" (the table layout and the join were code, not data).
// The JS twin of BIMCompiler scripts/lod/s401_marks.py with its hard-coded COLS replaced by the format's `columns`: the same row order, the same parse of bar text, the same refusals. Pure: tables in (dxf2tables.js read()), marks out.
// No clock, no random; marks are returned with sorted keys. Node + browser (window.LodSchedule).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LodSchedule = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var FIELDS = ['w', 'h', 'bottom_a', 'bottom_add', 'hanger', 'top_d', 'top_e', 'end_outer', 'end_inner', 'balance_outer', 'balance_inner', 'side'];
  // ---- the formats file: every entry must carry what the reader and the join need; a malformed entry is refused with its reason (nothing is half-used)
  function validateFormats(doc) {
    var list = doc && (Array.isArray(doc) ? doc : doc.formats); if (!Array.isArray(list) || !list.length) return { ok: false, why: 'no "formats" list' };
    var ids = {};
    for (var i = 0; i < list.length; i++) {
      var f = list[i], at = 'format ' + (f && f.id ? '"' + f.id + '"' : '#' + i) + ': ';
      if (!f || typeof f !== 'object') return { ok: false, why: at + 'not an object' };
      if (!f.id || ids[f.id]) return { ok: false, why: at + 'a unique id is needed' }; ids[f.id] = 1;
      if (!f.key_column || !f.columns || typeof f.columns !== 'object') return { ok: false, why: at + 'key_column and columns are needed' };
      if (!Array.isArray(f.required) || f.required.some(function (k) { return !f.columns[k]; })) return { ok: false, why: at + 'every "required" field needs a column pattern' };
      if (!f.columns.w || !f.columns.h) return { ok: false, why: at + 'columns w and h are needed' };
      if (!f.bar_grammar || !f.stirrup_grammar) return { ok: false, why: at + 'bar_grammar and stirrup_grammar are needed' };
      if (!f.join || !f.join.host_class || !f.join.mark_source || !f.join.mark_regex) return { ok: false, why: at + 'join {host_class, mark_source, mark_regex} is needed' };
      var bad = Object.keys(f.columns).filter(function (k) { return FIELDS.indexOf(k) < 0; }); if (bad.length) return { ok: false, why: at + 'unknown column field(s) ' + bad.join(', ') + ' (known: ' + FIELDS.join(', ') + ')' };
      try { [f.key_column, f.bar_grammar, f.stirrup_grammar, f.join.mark_regex, f.bar_split || '[+,&]'].concat(Object.keys(f.columns).map(function (k) { return f.columns[k]; })).forEach(function (r) { new RegExp(r); }); }
      catch (e) { return { ok: false, why: at + 'a pattern is not a valid regex (' + e.message + ')' }; }
      if (!new RegExp(f.join.mark_regex).source.match(/\(/)) return { ok: false, why: at + 'join.mark_regex needs a group (group 1 = the mark)' };
    }
    return { ok: true, count: list.length, list: list, summary: list.length + ' format(s): ' + list.map(function (f) { return f.id + ' (' + (f.status || 'status not stated') + ')'; }).join(', ') };
  }
  // ---- which columns of a table are which field; null when the table is not this format's (key column or a required heading missing)
  function columnsOf(t, f) {
    var cols = t.columns || []; if (!cols.length || !new RegExp(f.key_column, 'i').test(cols[0] || '')) return null;
    var ix = {}; Object.keys(f.columns).forEach(function (k) { var re = new RegExp(f.columns[k], 'i'), hit = -1; for (var i = 0; i < cols.length; i++) if (re.test(cols[i] || '')) { hit = i; break; } ix[k] = hit >= 0 ? hit : null; });
    var missing = f.required.filter(function (k) { return ix[k] === null; });
    return { ix: ix, missing: missing };
  }
  // ---- the format whose key column and every required heading match: exactly one, else refused (zero: the headings found are listed; more: the formats are named)
  function detect(sheet, formats) {
    var tables = (sheet && sheet.tables) || [], hits = [], near = [];
    formats.forEach(function (f) { var n = 0, miss = null; tables.forEach(function (t) { var c = columnsOf(t, f); if (!c) return; if (c.missing.length) { miss = miss || c.missing; return; } n++; }); if (n) hits.push({ f: f, tables: n }); else if (miss) near.push(f.id + ' (missing ' + miss.join(', ') + ')'); });
    if (hits.length === 1) return { ok: true, format: hits[0].f, tables: hits[0].tables };
    if (hits.length > 1) return { ok: false, why: 'more than one schedule format matches: ' + hits.map(function (h) { return h.f.id; }).join(', ') };
    var heads = tables.map(function (t, i) { return 'table ' + i + ': ' + (t.columns || []).slice(0, 8).join(' | '); });
    return { ok: false, why: 'no schedule format matches' + (near.length ? ' (' + near.join('; ') + ')' : '') + '; headings found: ' + (heads.length ? heads.join(' / ') : 'no ruled table on the sheet') };
  }
  // ---- s401_marks.py parse_bars / parse_stirrup, with the format's grammar
  function parseBars(s, f) {
    var E = f.empty_cell || ['', '-']; if (!s || E.indexOf(String(s).trim()) >= 0) return { bars: [], bad: [] };
    var out = [], bad = [], re = new RegExp(f.bar_grammar); String(s).split(new RegExp(f.bar_split || '[+,&]')).forEach(function (part) { var m = re.exec(part); if (m) out.push([parseInt(m[1], 10), parseInt(m[2], 10)]); else if (E.indexOf(part.trim()) < 0) bad.push(part.trim()); });
    return { bars: out, bad: bad };
  }
  function parseStirrup(s, f) { var m = new RegExp(f.stirrup_grammar).exec(s || ''); return m ? [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)] : null; }
  var INT = /^\s*[+-]?\d+\s*$/;
  // ---- the marks: every table of the format, every row with a mark, every cell kept verbatim and cited (the same order and the same refusals as the Python)
  function toMarks(sheet, f, fileName) {
    var marks = {}, unparsed = [], skipped = [], ntab = 0, base = fileName || (sheet && sheet.name) || 'sheet', E = f.empty_cell || ['', '-'];
    var tables = (sheet && sheet.tables) || [];
    for (var ti = 0; ti < tables.length; ti++) {
      var t = tables[ti], c0 = columnsOf(t, f); if (!c0) continue; if (c0.missing.length) return { ok: false, why: 'table ' + ti + ' lacks heading(s) ' + c0.missing.join(', ') };
      ntab++; var ix = c0.ix, cols = t.columns;
      for (var ri = 0; ri < t.rows.length; ri++) {
        var c = t.rows[ri].cells || [], mk = c.length ? String(c[0] || '').trim() : ''; if (mk === '' || mk === '-') continue;
        var cell = function (k) { return (ix[k] !== null && ix[k] !== undefined && ix[k] < c.length ? c[ix[k]] : '') || ''; };
        if (!INT.test(cell('w')) || !INT.test(cell('h'))) { skipped.push([mk, 'width/depth not integer']); continue; }
        var row = { w: parseInt(cell('w'), 10), h: parseInt(cell('h'), 10) };
        [['bottom', ['bottom_a', 'bottom_add']], ['top', ['top_d', 'top_e']], ['hanger', ['hanger']]].forEach(function (kv) { var L = []; kv[1].forEach(function (k) { var p = parseBars(cell(k), f); L = L.concat(p.bars); p.bad.forEach(function (x) { unparsed.push([mk, k, x]); }); }); row[kv[0]] = L; });
        var sd = cell('side'); row.side = E.indexOf(sd.trim()) >= 0 ? '' : sd.trim();
        var st = parseStirrup(cell('end_outer'), f); row.stirrup = st ? [st[1], st[2]] : null; row.stirrup_legs = st ? st[0] : null;
        var sb = parseStirrup(cell('balance_outer'), f); row.stirrup_balance = sb ? [sb[1], sb[2]] : null;
        row.stirrup_inner = (E.indexOf(cell('end_inner').trim()) >= 0 && E.indexOf(cell('balance_inner').trim()) >= 0) ? '' : 'end ' + cell('end_inner').trim() + ' / balance ' + cell('balance_inner').trim();
        var cells = {}; for (var i = 0; i < cols.length; i++) cells[cols[i]] = i < c.length ? c[i] : ''; row.cells = cells;
        row.source = base + ' table ' + ti + ' row ' + ri + ' (mark ' + mk + ')';
        if (marks[mk] && JSON.stringify(strip(marks[mk])) !== JSON.stringify(strip(row))) return { ok: false, why: 'mark ' + mk + ' appears twice with different values' };
        marks[mk] = row;
      }
    }
    var out = {}; Object.keys(marks).sort().forEach(function (k) { out[k] = marks[k]; });
    var n = Object.keys(out).length, verdict = n && !unparsed.length ? 'PASS' : (!n ? 'INCONCLUSIVE' : 'FAIL');
    return { ok: n > 0 && !unparsed.length, marks: out, stats: { tables: ntab, marks: n, skipped: skipped, unparsed: unparsed, verdict: verdict },
      line: '§LODUP_SCHED_MARKS format=' + f.id + ' source_sheet=' + base + ' beam_tables=' + ntab + ' marks=' + n + ' skipped_rows=' + skipped.length + ' unparsed_cells=' + unparsed.length + (unparsed.length ? ' first_unparsed=' + JSON.stringify(unparsed[0]) : '') + ' -> ' + verdict,
      why: !n ? 'no schedule row with a mark was read' : (unparsed.length ? unparsed.length + ' cell(s) could not be read, first ' + JSON.stringify(unparsed[0]) : null) };
  }
  function strip(r) { var o = {}; Object.keys(r).sort().forEach(function (k) { if (k !== 'source' && k !== 'cells') o[k] = r[k]; }); return o; }
  // ---- one call for the panel: tables -> {ok, format, marks, line, why}
  function read(sheet, formats, fileName) {
    var d = detect(sheet, formats); if (!d.ok) return { ok: false, why: d.why, line: '§LODUP_SCHED_DETECT REFUSED ' + d.why };
    var m = toMarks(sheet, d.format, fileName); return { ok: m.ok, format: d.format, marks: m.marks, stats: m.stats, line: m.line, detect: '§LODUP_SCHED_DETECT format=' + d.format.id + ' (' + (d.format.status || '-') + ') tables=' + d.tables, why: m.why };
  }
  return { validateFormats: validateFormats, detect: detect, toMarks: toMarks, read: read, parseBars: parseBars, parseStirrup: parseStirrup, FIELDS: FIELDS };
});
