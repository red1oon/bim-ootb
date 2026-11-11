// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — mis_core.js: the PURE state machine of the MIS list screen (bim-compiler prompts/CLI_ERP_IVR.md §14, §1b). READ THE LOG of W-MIS-SCREEN after every change.
// (state, input) -> { state, effects, screen }. NO require, NO process, NO fs, NO terminal codes: it runs unchanged in Node and in the page (W-MIS-SCREEN P1 scans for them).
// It never acts: every effect is ONE door line {line, purpose}; the driver (mis.js, or the page) runs it and feeds the envelope back as {result:{purpose, envelope}}.
// input: {key} (Up Down Left Right Tab Enter Esc PageDown PageUp, one character, or a digit = the n-th row) | {result}. screen: lines of {t, s} segments (s: head row cursor chip chipHi dim note).
(function (root) {
  'use strict';
  var q = function (v) { return /[\s"=]/.test(String(v)) ? JSON.stringify(String(v)) : String(v); };
  var up = function (s) { return String(s).toLowerCase(); };
  function create(o) {
    return { v: 1, opts: { kind: o.kind, filters: o.filters || [], limit: o.limit || 10, actionVerbs: o.actionVerbs || {}, brk: o.brk || '' },
      phase: 'new', cols: [], keyCol: null, doc: false, hasProc: false, rows: [], total: 0, offset: 0, cursor: 0, chip: 0, chips: [], chipsFor: null, note: '', confirm: null };
  }
  function listLine(st) {
    var o = st.opts, fl = o.filters.map(function (f) { return f.col + '=' + q(f.value); }).join(' ');
    return 'mis.list kind=' + q(o.kind) + ' columns=' + st.cols.join(',') + ' names=Y limit=' + o.limit + ' offset=' + st.offset + (fl ? ' ' + fl : '');
  }
  function pickColumns(props) {
    var by = {}, key = null; props.forEach(function (p) { by[up(p.name)] = p; if (p.key) key = p.name; });
    var out = [], add = function (n) { if (n && out.indexOf(n) < 0) out.push(n); };
    add(key); ['documentno', 'value', 'name', 'docstatus', 'processed'].forEach(function (n) { if (by[n]) add(by[n].name); });
    props.filter(function (p) { return p.displayed && !p.key && !/^(AD_Client_ID|AD_Org_ID|IsActive|Created|Updated|CreatedBy|UpdatedBy)$/.test(p.name); })
      .sort(function (a, b) { return (a.seq || 0) - (b.seq || 0); }).slice(0, 3).forEach(function (p) { add(p.name); });
    return { cols: out, keyCol: key, doc: !!by.docstatus, hasProc: !!by.processed };
  }
  function rowAt(st) { var i = st.opts.brk === 'offbyone' ? st.cursor + 1 : st.cursor; return st.rows[i] || st.rows[st.cursor] || null; }
  function rowId(st, r) { return r ? r[st.keyCol] : null; }
  function numOf(st, r) { if (!r) return ''; var c = ['DocumentNo', 'Value', 'Name'].filter(function (n) { return r[n] != null; })[0]; return c ? r[c] : rowId(st, r); }
  function idLine(st, verb, r) { return verb + ' kind=' + q(st.opts.kind) + ' id=' + rowId(st, r); }
  function mkChips(st, r, actions) {
    var used = {}, out = [], take = function (word, want) { var l = want; if (!l) { for (var i = 0; i < word.length; i++) { var c = word.charAt(i).toUpperCase(); if (!used[c]) { l = c; break; } } } used[l] = 1; return l; };
    take('Edit', 'U'); take('Delete', 'D');
    var processed = r && r.Processed === 'Y';
    if (st.doc) {
      out.push({ l: 'U', w: 'Edit', inert: true });
      (actions || []).forEach(function (code) { var v = st.opts.actionVerbs[code]; if (v) { var w = v.split('.')[1]; w = w.charAt(0).toUpperCase() + w.slice(1); out.push({ l: take(w), w: w, line: idLine(st, v, r), act: true }); } });
      if (!processed) out.push({ l: 'D', w: 'Delete', line: idLine(st, 'mis.delete', r), del: true });
    } else {
      out.push({ l: 'U', w: 'Edit', inert: true }, { l: 'D', w: 'Delete', line: idLine(st, 'mis.delete', r), del: true }, { l: 'C', w: 'Copy', inert: true });
    }
    return out;
  }
  function settle(st, effects) {   // after the rows changed or the pointer moved: the chips of the pointed row
    var r = rowAt(st); st.chip = 0;
    if (!r) { st.chips = []; st.chipsFor = null; return; }
    if (st.doc) { st.chips = []; st.chipsFor = rowId(st, r); effects.push({ line: idLine(st, 'erp.actions', r), purpose: 'actions' }); }
    else { st.chips = mkChips(st, r, null); st.chipsFor = rowId(st, r); }
  }
  function runChip(st, c, effects) {
    if (!c) return;
    if (c.inert) { st.note = c.w + ' is a form: it arrives in V3 (nothing written)'; return; }
    if (c.del && st.opts.brk !== 'skipconfirm') { st.phase = 'confirm'; st.confirm = { line: c.line, what: 'Delete ' + st.opts.kind + ' ' + numOf(st, rowAt(st)) + '?' }; st.note = ''; return; }
    st.phase = 'busy'; st.note = ''; effects.push({ line: c.line, purpose: 'write' });
  }
  function step(st0, input) {
    var st = JSON.parse(JSON.stringify(st0)), effects = [];
    if (input.result) {
      var p = input.result.purpose, env = input.result.envelope || {};
      if (p === 'describe') {
        if (env.status !== 'ok') { st.phase = 'dead'; st.note = 'cannot open ' + st.opts.kind + ': ' + (env.why || env.status); }
        else { var c = pickColumns(env.answer.properties); st.cols = c.cols; st.keyCol = c.keyCol; st.doc = c.doc; st.hasProc = c.hasProc; st.phase = 'listing'; effects.push({ line: listLine(st), purpose: 'list' }); }
      } else if (p === 'list') {
        if (env.status !== 'ok') { st.phase = 'dead'; st.note = 'cannot list ' + st.opts.kind + ': ' + (env.why || env.status); }
        else { st.rows = env.answer.rows; st.total = env.answer.total; st.phase = 'ready'; if (st.cursor >= st.rows.length) st.cursor = Math.max(0, st.rows.length - 1); settle(st, effects); }
      } else if (p === 'actions') {
        var r = rowAt(st);
        if (r && String(rowId(st, r)) === String(st.chipsFor) && st.phase !== 'dead') { st.chips = mkChips(st, r, env.status === 'ok' ? env.answer.actions : []); if (env.status !== 'ok') st.note = 'actions: ' + (env.why || env.status); }
      } else if (p === 'write') {
        var done = env.status === 'ok' ? 'ok' : env.status === 'claim' ? 'held as a claim (a person must confirm it)' : 'refused: ' + (env.why || env.status);
        st.note = (env.verb || 'write') + ' ' + done; st.phase = 'listing'; effects.push({ line: listLine(st), purpose: 'list' });
      }
      return { state: st, effects: effects, screen: render(st) };
    }
    var k = String(input.key);
    if (k === '__start') { st.phase = 'describing'; effects.push({ line: 'mis.describe kind=' + q(st.opts.kind), purpose: 'describe' }); return { state: st, effects: effects, screen: render(st) }; }
    if (st.phase === 'confirm') {
      if (k === 'y' || k === 'Y') { st.phase = 'busy'; effects.push({ line: st.confirm.line, purpose: 'write' }); st.confirm = null; }
      else { st.phase = 'ready'; st.confirm = null; st.note = 'cancelled: nothing was written'; }
      return { state: st, effects: effects, screen: render(st) };
    }
    if (st.phase !== 'ready') { if (k === 'Esc' || k === 'q') st.phase = 'quit'; else st.note = 'wait: ' + st.phase; return { state: st, effects: effects, screen: render(st) }; }
    if (k === 'Esc' || k === 'q') st.phase = 'quit';
    else if (k === 'Down' || k === 'Up') { var n = st.cursor + (k === 'Down' ? 1 : -1); if (n >= 0 && n < st.rows.length) { st.cursor = n; st.note = ''; settle(st, effects); } }
    else if (/^[1-9]$/.test(k)) { var m = Number(k) - 1; if (m < st.rows.length) { st.cursor = m; st.note = ''; settle(st, effects); } }
    else if (k === 'Right' || k === 'Tab') { if (st.chips.length) st.chip = (st.chip + 1) % st.chips.length; }
    else if (k === 'Left') { if (st.chips.length) st.chip = (st.chip + st.chips.length - 1) % st.chips.length; }
    else if (k === 'Enter') runChip(st, st.chips[st.chip], effects);
    else if (k === 'PageDown') { if (st.offset + st.opts.limit < st.total) { st.offset += st.opts.limit; st.cursor = 0; st.phase = 'listing'; effects.push({ line: listLine(st), purpose: 'list' }); } else st.note = 'last page'; }
    else if (k === 'PageUp') { if (st.offset > 0) { st.offset = Math.max(0, st.offset - st.opts.limit); st.cursor = 0; st.phase = 'listing'; effects.push({ line: listLine(st), purpose: 'list' }); } else st.note = 'first page'; }
    else if (k.length === 1) { var ci = -1; st.chips.forEach(function (c, i) { if (c.l === k.toUpperCase()) ci = i; }); if (ci >= 0) { st.chip = ci; runChip(st, st.chips[ci], effects); } }
    return { state: st, effects: effects, screen: render(st) };
  }
  function render(st) {
    var L = [], seg = function (t, s) { return { t: String(t), s: s }; };
    var from = st.rows.length ? st.offset + 1 : 0, to = st.offset + st.rows.length;
    L.push([seg(st.opts.kind + (st.opts.filters.length ? ' (' + st.opts.filters.map(function (f) { return f.col + '=' + f.value; }).join(', ') + ')' : '') + '   shown ' + from + '-' + to + ' of ' + st.total, 'head')]);
    if (st.phase === 'dead') { L.push([seg(st.note, 'note')]); return L; }
    var w = st.cols.map(function (c) { var m = c.length; st.rows.forEach(function (r) { m = Math.max(m, String(r[c] == null ? '' : r[c]).length); }); return Math.min(m, 22); });
    var cell = function (v, i) { var s = String(v == null ? '' : v); if (s.length > w[i]) s = s.slice(0, w[i] - 1) + '~'; return s + new Array(w[i] - s.length + 1).join(' '); };
    L.push([seg('   ' + st.cols.map(function (c, i) { return cell(c, i); }).join('  '), 'dim')]);
    st.rows.forEach(function (r, ri) {
      var cur = ri === st.cursor, line = [seg((cur ? ' > ' : '   ') + st.cols.map(function (c, i) { return cell(r[c], i); }).join('  '), cur ? 'cursor' : 'row')];
      if (cur) st.chips.forEach(function (c, i) { line.push(seg(' ', 'row')); line.push(seg('[' + c.l + ' ' + c.w + ']', i === st.chip ? 'chipHi' : (c.inert ? 'dim' : 'chip'))); });
      L.push(line);
    });
    if (st.phase === 'confirm') L.push([seg(st.confirm.what + ' [y/N]', 'note')]);
    else { var c = st.chips[st.chip]; if (c && c.line) L.push([seg('the line it will run: ' + c.line, 'dim')]); }
    if (st.note) L.push([seg(st.note, 'note')]);
    L.push([seg(' Up/Down row   Left/Right chip   Enter run   PageDown next   Esc quit', 'dim')]);
    return L;
  }
  function plain(screen) { return screen.map(function (l) { return l.map(function (g) { return g.s === 'chipHi' ? '>' + g.t + '<' : g.t; }).join(''); }); }
  var API = { create: create, step: step, render: render, plain: plain };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.MisCore = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
