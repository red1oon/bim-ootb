// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — draw_core.js: the red1 shell's PURE drawings (bim-compiler prompts/CLI_ERP_IVR.md §22.3, §22.8; step R6 adds the funnel and the tree). READ THE LOG of W-RED1-DRAW.
// Text in, lines out. NO require, NO process, NO terminal codes: it runs unchanged in Node and in the page. It draws only what the envelope holds; it computes nothing.
(function (root) {
  'use strict';
  function cell(v) { return v == null ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v)); }
  // a table: cols = names, rows = arrays or objects; each column as wide as its widest cell, capped; the last column is not cut
  function table(cols, rows, o) {
    o = o || {}; var cap = o.cap || 40;
    var get = function (r, i) { return Array.isArray(r) ? r[i] : r[cols[i]]; };
    var w = cols.map(function (c, i) { var m = String(c).length; rows.forEach(function (r) { m = Math.max(m, cell(get(r, i)).length); }); return Math.min(m, cap); });
    var fit = function (s, i) { s = cell(s); if (i === cols.length - 1) return s; return s.length > w[i] ? s.slice(0, w[i] - 1) + '…' : s + new Array(w[i] - s.length + 1).join(' '); };
    var out = [cols.map(fit).join('  ').replace(/\s+$/, '')];
    rows.forEach(function (r) { out.push(cols.map(function (c, i) { return fit(get(r, i), i); }).join('  ').replace(/\s+$/, '')); });
    return out;
  }
  // THE CLASH FUNNEL (§22.8, R6): the Viewer's own clash answer (viewer_verbs value) as a tree. Every number is a field of the value, none computed; the tree is drawn
  // only when the value's own parts add up (box overlaps = mesh clashes + cleared + unjudged; cleared = box-turn test + triangle test), else it says which do not.
  function funnel(v, o) {
    o = o || {}; var A = !!o.ascii, T = A ? '+-' : '├─', E = A ? '\\-' : '└─', V = A ? '| ' : '│ ';
    var need = ['bboxOverlaps', 'meshClashes', 'cleared', 'unknown', 'obbRejected', 'triangleClear', 'contained'];
    if (!v || need.some(function (k) { return typeof v[k] !== 'number'; })) return null;
    var sum1 = v.meshClashes + v.cleared + v.unknown === v.bboxOverlaps, sum2 = v.obbRejected + v.triangleClear === v.cleared;
    if (!sum1 || !sum2) return ['the answer\'s parts do not add up, so no funnel is drawn: ' + (sum1 ? '' : 'meshClashes ' + v.meshClashes + ' + cleared ' + v.cleared + ' + unknown ' + v.unknown + ' != bboxOverlaps ' + v.bboxOverlaps + ' ') + (sum2 ? '' : 'obbRejected ' + v.obbRejected + ' + triangleClear ' + v.triangleClear + ' != cleared ' + v.cleared)];
    var w = String(v.bboxOverlaps).length, n = function (x) { x = String(o.brk === 'off1' && x === v.meshClashes ? x + 1 : x); return new Array(w - x.length + 1).join(' ') + x; };   // off1: W-RED1-DRAW falsifier
    var tol = typeof v.toleranceM === 'number' ? '  (at ' + Math.round(v.toleranceM * 1000) + ' mm)' : '';
    return [
      n(v.bboxOverlaps) + ' box overlaps  ' + (v.discA || '') + ' x ' + (v.discB || '') + tol,
      T + ' ' + n(v.meshClashes) + ' clash at mesh level',
      V + '   ' + E + ' ' + n(v.contained) + ' of them one inside the other',
      T + ' ' + n(v.cleared) + ' cleared by the shape tests',
      V + '   ' + T + ' ' + n(v.obbRejected) + ' turned boxes do not touch',
      V + '   ' + E + ' ' + n(v.triangleClear) + ' triangles do not touch',
      E + ' ' + n(v.unknown) + ' not judged'
    ];
  }
  // THE NEXT-STEP TREE (§22.8, R6): a document's legal actions as erp.actions answers them (its status, then each code in the engine's order); a code the shell has
  // a word for shows the line that runs it (verbOf: code -> the do word, from erp_cli's own ACT table, handed in). Nothing here judges what is legal.
  function nextTree(a, verbOf, o) {
    o = o || {}; var A = !!o.ascii, T = A ? '+-' : '├─', E = A ? '\\-' : '└─';
    if (!a || !a.document || !Array.isArray(a.legal)) return null;
    var codes = o.brk === 'dropone' ? a.legal.slice(0, -1) : a.legal, no = a.document.number, d = a.document;
    var out = [d.kind + ' ' + no + '  status ' + a.docStatus + (codes.length ? '' : '  (no action is legal now)')];
    codes.forEach(function (c, i) { var v = verbOf[c]; out.push((i === codes.length - 1 ? E : T) + ' ' + c + (v ? '  → do ' + v + ' ' + no : '  (no red1 word for it yet)')); });
    return out;
  }
  // THE RECORD, READABLE (§29.1, D15; the film found `cat` printing raw JSON): the answer of mis.read + the kind's own properties (mis.describe, handed in as ctx.props: name,
  // label, type, seq, displayed). The identifier first, then the BOTTOM-LINE columns (the window's amount columns, in the window's field order: for Project PlannedAmt,
  // PlannedMarginAmt, CommittedAmt, InvoicedAmt, ProjectBalanceAmt; for an Order TotalLines, GrandTotal), then every other shown column that holds a value as a two-column table.
  // Nothing is computed: each value is the record's own cell. A column the window does not show (ids, audit columns) is left out; the count of empty ones is said.
  function record(a, ctx, o) {
    o = o || {}; var R = a && a.record; if (!R || !ctx || !Array.isArray(ctx.props)) return null;
    var key = String(ctx.key || '').toLowerCase(), idv = R[key], lab = R.documentno != null ? R.documentno : (R.name != null ? R.name : (R.value != null ? R.value : idv));
    var shown = ctx.props.filter(function (p) { return p.displayed !== false && p.name.toLowerCase() !== key; }).sort(function (x, y) { return (x.seq == null ? 1e9 : x.seq) - (y.seq == null ? 1e9 : y.seq); });
    var val = function (p) { return R[p.name.toLowerCase()]; }, none = function (v) { return v == null || v === ''; };
    var money = shown.filter(function (p) { return p.type === 'amount'; }), rest = shown.filter(function (p) { return p.type !== 'amount' && !none(val(p)); });
    if (o.brk === 'json') return JSON.stringify(a.record, null, 1).split('\n');   // W-RED1-RECORD falsifier: the raw JSON back (must FAIL R6)
    var out = [(ctx.kind || a.kind || '') + ' ' + lab + '  (' + (ctx.key || 'id') + ' ' + idv + ')', ''];
    if (money.length) { table(['bottom line', 'value'], money.map(function (p) { return [p.name, none(val(p)) ? '(none)' : val(p)]; })).forEach(function (l) { out.push(l); }); out.push(''); }
    table(['column', 'value'], rest.map(function (p) { return [p.name, val(p)]; })).forEach(function (l) { out.push(l); });
    var empty = shown.length - money.length - rest.length; if (empty) out.push('(' + empty + ' more columns are empty)');
    return out;
  }
  // THE TABS OF A RECORD (§29.1): the kind's child tabs (mis.describe childTabs, handed in) with the number of rows each holds under this record (mis.read children)
  function tabs(a, ctx) {
    if (!a || !Array.isArray(a.children) || !ctx || !Array.isArray(ctx.tabs)) return null;
    var n = {}; a.children.forEach(function (c) { n[c.kind] = Array.isArray(c.rows) ? c.rows.length : null; });
    var rows = ctx.tabs.map(function (t) { return [t.tab, n[t.kind] == null ? '-' : n[t.kind], t.link || '']; });
    return [(ctx.kind || '') + ' ' + (ctx.label || '') + ': ' + rows.length + ' tabs, cd <tab> opens one'].concat(rows.length ? table(['tab', 'records', 'link'], rows) : []);
  }
  // THE PROJECT'S EARNED-VALUE STATUS (§29.4, P5): erp.project_status' answer as a table, phase by phase, then the project's own total row (the engine's figures; the sum is
  // NOT computed here, so a table whose phases do not add to the project shows it). A figure the answer does not hold (a phase's CPI) is a dash, never a zero.
  function status(a) {
    if (!a || !a.evm || !Array.isArray(a.phases) || !a.contract) return null;
    var e = a.evm, c = a.contract, n = function (v) { return v == null ? '-' : v; };
    var rows = a.phases.map(function (p) { return [p.name, p.bac, p.pv, p.ev, p.sv, n(p.spi)]; });
    rows.push(['PROJECT', e.bac, e.pv, e.ev, e.sv, n(e.spi)]);
    var out = [(a.project.name || a.project.value) + '  status as of ' + a.asOf,
      'contract  original ' + c.original + ' · approved VOs ' + c.approvedVOs + ' · pending VOs ' + c.pendingVOs + ' · revised ' + c.revised, ''];
    table(['phase', 'BAC', 'PV', 'EV', 'SV', 'SPI'], rows).forEach(function (l) { out.push(l); });
    out.push('', 'AC ' + e.ac + ' · CV ' + e.cv + ' · CPI ' + n(e.cpi) + ' · complete ' + n(e.percentComplete) + ' · planned ' + n(e.percentPlanned));
    if (a.note) out.push(a.note);
    return out;
  }
  var API = { table: table, cell: cell, funnel: funnel, nextTree: nextTree, record: record, tabs: tabs, status: status };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.DrawCore = API;
})(this);
