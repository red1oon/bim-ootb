// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — menu_core.js: the PURE state machine of the terminal MENU (bim-compiler prompts/CLI_ERP_IVR.md §21; the list screen is mis_core.js §14). READ THE LOG of W-MIS-MENU after every change.
// (state, input) -> { state, effects, screen }, the same contract as mis_core.js. NO require, NO process, NO fs, NO terminal codes: it runs unchanged in Node and in the page.
// It never acts: an effect is ONE door line {line, purpose} (the driver runs it and feeds the envelope back as {result:{purpose, envelope}}), or {open:{kind, name, windowId}} = hand over to the
// list screen on that kind (the driver runs mis_core there and, when that screen quits, sends {key:'__back'}). The menu is the door's `mis.menu` answer: the page's own tree, pruned by the role.
// input: {key} (Up Down Enter Esc PageDown PageUp Backspace, '/', '?', 'q', a digit 1-9 = that row) | {text} (the find text, on a non-terminal driver) | {result}.
(function (root) {
  'use strict';
  var q = function (v) { return /[\s"=]/.test(String(v)) ? JSON.stringify(String(v)) : String(v); };
  var PAGE = 15;
  function create(o) {
    o = o || {};
    return { v: 1, opts: { role: o.role == null || o.role === '' ? null : String(o.role), brk: o.brk || '' }, phase: 'new', tree: [], path: [], cursor: 0, top: 0,
      find: null, findText: '', found: null, note: '', counts: null };
  }
  function rl(st, line) { return st.opts.role == null ? line : line + ' role=' + st.opts.role; }
  function here(st) { if (st.found) return st.found; var n = st.path.length ? st.path[st.path.length - 1].children || [] : st.tree; return n; }
  function isFolder(n) { return !!(n && n.children && n.children.length) || !!(n && n.isSummary); }
  function move(st, d) { var n = here(st).length; if (!n) return; st.cursor = Math.max(0, Math.min(n - 1, st.cursor + d)); if (st.cursor < st.top) st.top = st.cursor; if (st.cursor >= st.top + PAGE) st.top = st.cursor - PAGE + 1; }
  function enter(st, effects) {
    var n = here(st)[st.cursor]; if (!n) return;
    if (!st.found && isFolder(n)) { st.path.push(n); st.cursor = 0; st.top = 0; st.note = ''; return; }
    if (n.action === 'W' && n.kind) { st.phase = 'opened'; st.note = ''; effects.push({ open: { kind: n.kind, name: n.name, windowId: n.windowId } }); return; }
    if (n.action === 'W') { st.note = n.name + ': its window has no tab with a table here, so there is no list to show'; return; }
    st.note = n.name + ' is a ' + ({ P: 'process', R: 'report', X: 'form', F: 'workflow', T: 'task' }[n.action] || 'menu item') + ': it opens in the browser ERP (no terminal screen for it yet); nothing was run';
  }
  function step(st0, input) {
    var st = JSON.parse(JSON.stringify(st0)), effects = [];
    if (input.result) {
      var env = input.result.envelope || {}, a = env.answer || {};
      if (env.status !== 'ok') { st.phase = st.tree.length ? 'ready' : 'dead'; st.note = 'the door said ' + env.status + ': ' + (env.why || ''); return { state: st, effects: effects, screen: render(st) }; }
      if (input.result.purpose === 'menu') { st.tree = a.tree || []; st.counts = { leaves: a.leaves, folders: a.folders, windows: a.windows }; st.phase = 'ready'; st.note = ''; }
      else if (input.result.purpose === 'find') { st.found = a.items || []; st.cursor = 0; st.top = 0; st.phase = 'ready'; st.note = st.found.length + ' match "' + st.findText + '" (Esc: back to the menu)'; }
      return { state: st, effects: effects, screen: render(st) };
    }
    if (input.text != null) { if (st.phase === 'find') st.findText = String(input.text); return { state: st, effects: effects, screen: render(st) }; }
    var k = input.key;
    if (k === '__start') { st.phase = 'loading'; effects.push({ line: rl(st, 'mis.menu'), purpose: 'menu' }); return { state: st, effects: effects, screen: render(st) }; }
    if (k === '__back') { st.phase = 'ready'; st.note = ''; return { state: st, effects: effects, screen: render(st) }; }
    if (st.phase === 'find') {
      if (k === 'Esc') { st.phase = 'ready'; st.findText = ''; st.note = 'find cancelled'; }
      else if (k === 'Enter') { if (!st.findText) { st.phase = 'ready'; st.note = ''; } else { st.phase = 'loading'; effects.push({ line: rl(st, 'mis.menu find=' + q(st.findText)), purpose: 'find' }); } }
      else if (k === 'Backspace') st.findText = st.findText.slice(0, -1);
      else if (typeof k === 'string' && k.length === 1) st.findText += k;
      return { state: st, effects: effects, screen: render(st) };
    }
    if (st.phase !== 'ready') { if (k === 'Esc' || k === 'q') st.phase = 'quit'; return { state: st, effects: effects, screen: render(st) }; }
    if (k === 'Down') move(st, 1); else if (k === 'Up') move(st, -1);
    else if (k === 'PageDown') move(st, PAGE); else if (k === 'PageUp') move(st, -PAGE);
    else if (/^[1-9]$/.test(k)) { var i = st.top + Number(k) - 1; if (i < here(st).length) { st.cursor = i; enter(st, effects); } }
    else if (k === 'Enter') enter(st, effects);
    else if (k === '/') { st.phase = 'find'; st.findText = ''; st.note = ''; }
    else if (k === '?') st.note = 'keys: Up/Down or 1-9 pick · Enter opens a folder or a window · Esc back up · / find by name · PageUp/PageDown · q quit';
    else if (k === 'Esc') { if (st.found) { st.found = null; st.cursor = 0; st.top = 0; st.note = ''; } else if (st.path.length) { st.path.pop(); st.cursor = 0; st.top = 0; st.note = ''; } else st.phase = 'quit'; }
    else if (k === 'q') st.phase = 'quit';
    return { state: st, effects: effects, screen: render(st) };
  }
  function render(st) {
    var L = [], seg = function (t, s) { return { t: String(t), s: s }; };
    var where = st.found ? 'find "' + st.findText + '"' : ['Menu'].concat(st.path.map(function (n) { return n.name; })).join(' > ');
    L.push([seg(where + (st.opts.role ? '   (role ' + st.opts.role + ')' : '   (no role: the whole menu)') + (st.counts ? '   ' + st.counts.windows + ' windows' : ''), 'head')]);
    if (st.phase === 'loading' || st.phase === 'new') { L.push([seg('reading the menu…', 'dim')]); return L; }
    var rows = here(st);
    rows.slice(st.top, st.top + PAGE).forEach(function (n, j) {
      var i = st.top + j, num = j < 9 ? String(j + 1) : ' ', mark = isFolder(n) && !st.found ? '▸ ' : '  ';
      var label = st.found ? (n.path ? n.path + ' > ' : '') + n.name : n.name;
      L.push([seg((i === st.cursor ? '> ' : '  ') + num + '  ' + mark + label + (n.action && n.action !== 'W' && !isFolder(n) ? '  [' + n.action + ']' : ''), i === st.cursor ? 'cursor' : 'row')]);
    });
    if (!rows.length) L.push([seg('(nothing here)', 'dim')]);
    if (rows.length > PAGE) L.push([seg('  ' + (st.top + 1) + '-' + Math.min(rows.length, st.top + PAGE) + ' of ' + rows.length + '  (PageDown / PageUp)', 'dim')]);
    if (st.phase === 'find') L.push([seg('find: ' + st.findText + '_   (Enter search, Esc cancel)', 'note')]);
    else L.push([seg(st.note || 'Enter open · Esc back · / find · ? keys · q quit', st.note ? 'note' : 'dim')]);
    return L;
  }
  function plain(screen) { return screen.map(function (l) { return l.map(function (g) { return g.t; }).join(''); }); }
  var API = { create: create, step: step, render: render, plain: plain };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.MenuCore = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
