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
    return { v: 1, opts: { kind: o.kind, filters: o.filters || [], limit: o.limit || 10, actionVerbs: o.actionVerbs || {}, brk: o.brk || '', role: o.role == null || o.role === '' ? null : String(o.role) }, role: null,
      phase: 'new', cols: [], keyCol: null, doc: false, hasProc: false, rows: [], total: 0, offset: 0, cursor: 0, chip: 0, chips: [], chipsFor: null, note: '', confirm: null };
  }
  // CLI_ERP_IVR §17: with a role, EVERY door line the screen sends carries it (rl); without one nothing is filtered and the head line says so.
  function rl(st, line) { return st.opts.role == null || st.opts.brk === 'dropRole' ? line : line + ' role=' + st.opts.role; }
  function roWin(st) { return !!(st.role && st.role.window && st.role.window.readWrite === false); }
  function listLine(st) {
    var o = st.opts, fl = o.filters.map(function (f) { return f.col + '=' + q(f.value); }).join(' ');
    return rl(st, 'mis.list kind=' + q(o.kind) + ' columns=' + st.cols.join(',') + ' names=Y limit=' + o.limit + ' offset=' + st.offset + (fl ? ' ' + fl : ''));
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
  function idLine(st, verb, r) { return rl(st, verb + ' kind=' + q(st.opts.kind) + ' id=' + rowId(st, r)); }
  function mkChips(st, r, actions) {
    var used = {}, out = [], take = function (word, want) { var l = want; if (!l) { for (var i = 0; i < word.length; i++) { var c = word.charAt(i).toUpperCase(); if (!used[c]) { l = c; break; } } } used[l] = 1; return l; };
    take('Edit', 'U'); take('Delete', 'D');
    var processed = r && r.Processed === 'Y';
    if (roWin(st)) return out;   // the role opens this window read-only (GridWindowVO L277): nothing to run on a row
    if (st.doc) {
      out.push({ l: 'U', w: 'Edit', edit: true, line: idLine(st, 'mis.read', r) });
      (actions || []).forEach(function (code) { var v = st.opts.actionVerbs[code]; if (v) { var w = v.split('.')[1]; w = w.charAt(0).toUpperCase() + w.slice(1); out.push({ l: take(w), w: w, line: idLine(st, v, r), act: true }); } });
      if (!processed) out.push({ l: 'D', w: 'Delete', line: idLine(st, 'mis.delete', r), del: true });
    } else {
      out.push({ l: 'U', w: 'Edit', edit: true, line: idLine(st, 'mis.read', r) }, { l: 'D', w: 'Delete', line: idLine(st, 'mis.delete', r), del: true }, { l: 'C', w: 'Copy', copy: true, line: idLine(st, 'mis.read', r) });
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
    if (c.inert) { st.note = c.w + ' is not built yet (nothing written)'; return; }
    if (c.edit || c.copy) { st.phase = 'busy'; st.note = ''; effects.push({ line: c.line, purpose: c.copy ? 'readcopy' : 'readrec' }); return; }
    if (c.del && st.opts.brk !== 'skipconfirm') { st.phase = 'confirm'; st.confirm = { line: c.line, what: 'Delete ' + st.opts.kind + ' ' + numOf(st, rowAt(st)) + '?' }; st.note = ''; return; }
    st.phase = 'busy'; st.note = ''; effects.push({ line: c.line, purpose: 'write' });
  }

  var KNOWN = { string: 1, text: 1, integer: 1, number: 1, amount: 1, quantity: 1, list: 1, yesno: 1, date: 1, datetime: 1, tabledirect: 1, table: 1, search: 1 };
  function propOf(st, n) { return (st.props || []).filter(function (p) { return up(p.name) === up(n); })[0] || { name: n, label: n, mandatory: true, help: '' }; }
  function mkField(p, value) { return { name: p.name, label: p.label || p.name, mandatory: !!p.mandatory, help: p.help || '', type: p.type || '', value: value == null ? '' : String(value), orig: value == null ? '' : String(value) }; }
  function editable(st, rec) {   // the columns the window lets a person edit: GridField.isEditable's rules as the dictionary states them (CLI_ERP_IVR §15)
    var loose = st.opts.brk === 'extrafields', proc = rec && (rec.processed === 'Y');
    return (st.props || []).filter(function (p) {
      if (!p.displayed || p.key || p.parent || !KNOWN[p.type]) return false;
      if (loose) return true;
      if (p.fieldReadOnly || p.readOnlyLogic) return false;
      if (p.roleReadOnly && st.opts.brk !== 'roleEdit') return false;   // the role may read it, not write it (AD_Column_Access)
      if (!p.updateable && !p.alwaysUpdateable) return false;
      if (proc && !p.alwaysUpdateable) return false;
      return true;
    }).sort(function (a, b) { return a.seq - b.seq; });
  }
  function copyable(st) {   // GridTab.dataNew(copy=true): the displayed columns of the record, minus the key, those the dictionary says IsAllowCopy=N, and those the window would not let a person set
    var loose = st.opts.brk === 'copyall';
    return (st.props || []).filter(function (p) { return p.displayed && !p.key && KNOWN[p.type] && (loose || (p.allowCopy && !p.fieldReadOnly && !p.readOnlyLogic && !p.roleReadOnly)); }).sort(function (a, b) { return a.seq - b.seq; });
  }
  var LOOK = { tabledirect: 1, table: 1, search: 1 };
  function formLine(st) {
    var f = st.form, parts = [];
    f.fields.forEach(function (x) { if (f.mode === 'new') { if (x.value !== '') parts.push(x.name + '=' + q(x.value)); } else if (st.opts.brk === 'sendall' || x.value !== x.orig) parts.push(x.name + '=' + (x.value === '' ? '<null>' : q(x.value))); });
    if (f.mode === 'new') return rl(st, 'mis.new kind=' + q(st.opts.kind) + (parts.length ? ' ' + parts.join(' ') : ''));
    return parts.length ? rl(st, 'mis.update kind=' + q(st.opts.kind) + ' id=' + f.id + ' ' + parts.join(' ')) : null;
  }
  function openForm(st, mode, fields, id) { st.form = { mode: mode, fields: fields, idx: 0, id: id, line: null }; st.phase = fields.length ? 'form' : 'formConfirm'; if (!fields.length) st.form.line = formLine(st); st.note = ''; }
  function phase_busy(st) { st.phase = 'busy'; st.note = ''; }
  function formKey(st, k, effects) {
    var f = st.form, cur = f.fields[f.idx];
    if (k === 'Esc') { st.phase = 'ready'; st.form = null; st.note = 'cancelled: nothing was written'; return; }
    if (st.phase === 'formConfirm') {
      if (k === 'y' || k === 'Y') { st.phase = 'busy'; effects.push({ line: f.line, purpose: 'formwrite' }); }
      else { st.phase = f.fields.length ? 'form' : 'ready'; if (!f.fields.length) st.form = null; st.note = 'not saved: nothing was written'; }
      return;
    }
    if (k === 'Tab' || k === 'Down' || k === 'Enter') {
      if (k === 'Enter' && f.idx === f.fields.length - 1) {
        var line = formLine(st);
        if (!line) { st.phase = 'ready'; st.form = null; st.note = 'no changes: nothing was written (NO-OP)'; return; }
        f.line = line; st.phase = 'formConfirm'; st.note = ''; return;
      }
      f.idx = (f.idx + 1) % f.fields.length; st.note = '';
    } else if (k === 'Up') f.idx = (f.idx + f.fields.length - 1) % f.fields.length;
    else if (k === 'Backspace') cur.value = cur.value.slice(0, -1);
    else if (k.length === 1) cur.value += k;
  }
  function formResult(st, p, env, effects) {
    if (p === 'newdry') {
      if (env.status !== 'ok') { st.phase = 'ready'; st.note = 'cannot start a new record: ' + (env.why || env.status); return true; }
      var a = env.answer, names = (a.needs || []).map(function (n) { return n.name; }).concat(a.mandatory || []);
      var fields = names.map(function (n) { var fl = mkField(propOf(st, n), n === 'IsSOTrx' ? 'Y' : ''); fl.mandatory = true; if (n === 'IsSOTrx') fl.help = ((a.needs || [])[0] || {}).why || fl.help; return fl; });
      st.engineFills = a.defaulted; openForm(st, 'new', fields, null); return true;
    }
    if (p === 'readrec' || p === 'readcopy') {
      if (env.status !== 'ok') { st.phase = 'ready'; st.note = 'cannot read the record: ' + (env.why || env.status); return true; }
      var rec = env.answer.record, cp = p === 'readcopy', src = cp ? copyable(st) : editable(st, rec);
      var fl = src.map(function (pp) { var f1 = mkField(pp, rec[pp.name.toLowerCase()]); if (cp) f1.orig = ''; return f1; });
      if (!fl.length) { st.phase = 'ready'; st.note = 'nothing in this record can be ' + (cp ? 'copied' : 'edited') + ' here'; return true; }
      var look = fl.filter(function (f1) { return LOOK[f1.type] && f1.value !== ''; }), id = rowId(st, rowAt(st));
      st.pending = { mode: cp ? 'new' : 'edit', copy: cp, fields: fl, id: id };
      if (look.length) { phase_busy(st); effects.push({ line: rl(st, 'mis.list kind=' + q(st.opts.kind) + ' ' + st.keyCol + '=' + id + ' columns=' + look.map(function (f1) { return f1.name; }).join(',') + ' names=Y limit=1'), purpose: 'readnames' }); return true; }
      openForm(st, st.pending.mode, fl, id); st.form.copy = cp; st.pending = null; return true;
    }
    if (p === 'readnames') {
      var pd = st.pending; if (!pd) return true;
      var row = env.status === 'ok' && env.answer.rows[0] ? env.answer.rows[0] : {};
      pd.fields.forEach(function (f1) { if (LOOK[f1.type] && row[f1.name] != null && row[f1.name] !== '') { f1.value = String(row[f1.name]); if (!pd.copy) f1.orig = f1.value; } });
      openForm(st, pd.mode, pd.fields, pd.id); st.form.copy = pd.copy; st.pending = null; return true;
    }
    if (p === 'formwrite') {
      var f = st.form;
      if (env.status === 'ok') {
        st.note = f.mode === 'new' ? 'created ' + (env.answer.number || env.answer.id) + (env.answer.filled ? ': ' + env.answer.filled.length + ' columns filled by the engine (' + env.answer.filled.slice(0, 6).join(', ') + (env.answer.filled.length > 6 ? ', +' + (env.answer.filled.length - 6) + ' more' : '') + ')' : '') : (env.answer.noop ? 'saved: NO-OP (nothing changed)' : 'saved: changed ' + env.answer.changed.join(', '));
        st.form = null; st.phase = 'listing'; effects.push({ line: listLine(st), purpose: 'list' });
      } else if (env.status === 'claim') { st.note = 'held as a claim (a person must confirm it)'; st.form = null; st.phase = 'listing'; effects.push({ line: listLine(st), purpose: 'list' }); }
      else { st.phase = 'form'; f.idx = Math.max(0, f.fields.length - 1); st.note = 'refused: ' + (env.why || env.status) + ' (your values are kept; Esc cancels)'; }
      return true;
    }
    return false;
  }
  function renderForm(st) {
    var f = st.form, L = [], seg = function (t, s) { return { t: String(t), s: s }; };
    L.push([seg((f.copy ? 'Copy ' : f.mode === 'new' ? 'New ' : 'Edit ') + st.opts.kind + (f.mode === 'edit' || f.copy ? ' ' + numOf(st, rowAt(st)) : '') + '   (Esc cancels everything, nothing is written)', 'head')]);
    var lo = Math.max(0, Math.min(f.idx - 6, f.fields.length - 14)), hi = Math.min(f.fields.length, lo + 14), lw = 0;
    f.fields.forEach(function (x) { lw = Math.max(lw, x.label.length); });
    for (var i = lo; i < hi; i++) { var x = f.fields[i], cur = i === f.idx; L.push([seg((cur ? ' > ' : '   ') + (x.mandatory ? '* ' : '  ') + x.label + new Array(lw - x.label.length + 2).join(' ') + '[' + x.value + (cur && st.phase === 'form' ? '_' : '') + ']', cur ? 'cursor' : 'row')]); }
    if (f.fields.length > hi) L.push([seg('   ... ' + (f.fields.length - hi) + ' more', 'dim')]);
    var c = f.fields[f.idx]; if (c && c.help && st.phase === 'form') L.push([seg('help: ' + c.help.replace(/\s+/g, ' ').slice(0, 120), 'dim')]);
    if (st.phase === 'formConfirm') { L.push([seg('the line it will run: ' + f.line, 'dim')]); L.push([seg('Save? [y/N]', 'note')]); }
    if (st.note) L.push([seg(st.note, 'note')]);
    L.push([seg(st.phase === 'form' ? ' type to fill   Tab/Enter next field   Enter on the last field saves   Esc cancel' : ' y saves   any other key goes back   Esc cancel', 'dim')]);
    return L;
  }
  function step(st0, input) {
    var st = JSON.parse(JSON.stringify(st0)), effects = [];
    if (input.result) {
      var p = input.result.purpose, env = input.result.envelope || {};
      if (formResult(st, p, env, effects)) return { state: st, effects: effects, screen: render(st) };
      if (p === 'describe') {
        if (env.status !== 'ok') { st.phase = 'dead'; st.note = 'cannot open ' + st.opts.kind + ': ' + (env.why || env.status); }
        else { var c = pickColumns(env.answer.properties); st.cols = c.cols; st.keyCol = c.keyCol; st.doc = c.doc; st.hasProc = c.hasProc; st.props = env.answer.properties.map(function (p) { return { name: p.name, label: p.label, type: p.type, mandatory: !!p.mandatory, updateable: p.updateable !== false, key: !!p.key, parent: !!p.parent, displayed: !!p.displayed, seq: p.seq || 0, fieldReadOnly: !!p.fieldReadOnly, readOnlyLogic: p.readOnlyLogic || '', alwaysUpdateable: !!p.alwaysUpdateable, allowCopy: p.allowCopy !== false, roleReadOnly: !!p.roleReadOnly, help: p.help || '' }; }); st.role = env.answer.role || null; st.phase = 'listing'; effects.push({ line: listLine(st), purpose: 'list' }); }
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
    if (input.text != null) { if (st.phase === 'form') st.form.fields[st.form.idx].value = String(input.text); return { state: st, effects: effects, screen: render(st) }; }   // a typed line answers the prompt: it REPLACES the value
    var k = String(input.key);
    if (k === '__start') { st.phase = 'describing'; effects.push({ line: rl(st, 'mis.describe kind=' + q(st.opts.kind)), purpose: 'describe' }); return { state: st, effects: effects, screen: render(st) }; }
    if (st.phase === 'form' || st.phase === 'formConfirm') { formKey(st, k, effects); return { state: st, effects: effects, screen: render(st) }; }
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
    else if (k === '+' || k === 'n') { if (roWin(st)) st.note = 'read-only for this role: nothing can be created here'; else { st.phase = 'busy'; st.note = ''; effects.push({ line: rl(st, 'mis.new kind=' + q(st.opts.kind) + ' dry=Y'), purpose: 'newdry' }); } }
    else if (k.length === 1) { var ci = -1; st.chips.forEach(function (c, i) { if (c.l === k.toUpperCase()) ci = i; }); if (ci >= 0) { st.chip = ci; runChip(st, st.chips[ci], effects); } }
    return { state: st, effects: effects, screen: render(st) };
  }
  function render(st) {
    if ((st.phase === 'form' || st.phase === 'formConfirm') && st.form) return renderForm(st);
    var L = [], seg = function (t, s) { return { t: String(t), s: s }; };
    var from = st.rows.length ? st.offset + 1 : 0, to = st.offset + st.rows.length;
    L.push([seg(st.opts.kind + (st.opts.filters.length ? ' (' + st.opts.filters.map(function (f) { return f.col + '=' + f.value; }).join(', ') + ')' : '') + '   shown ' + from + '-' + to + ' of ' + st.total + (roWin(st) ? '' : '   [+ New]'), 'head'),
      seg(st.opts.role == null ? '   no role: nothing is filtered' : '   role ' + st.opts.role + (st.role ? ': ' + st.role.name + (roWin(st) ? ' (read-only)' : '') : ''), 'dim')]);
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
    L.push([seg(' Up/Down row   Left/Right chip   Enter run   + new   PageDown next   Esc quit', 'dim')]);
    return L;
  }
  function plain(screen) { return screen.map(function (l) { return l.map(function (g) { return g.s === 'chipHi' ? '>' + g.t + '<' : g.t; }).join(''); }); }
  var API = { create: create, step: step, render: render, plain: plain };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.MisCore = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
