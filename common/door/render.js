// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — render.js: the door's readable forms. READ THE §-LOG after every run. One envelope, three renderings (--json | --list | --csv), and !help.
// Spec: bim-compiler prompts/NEURO_SYMBOLIC_ORDER_CONTRACT.md §R.V items 9 (results as a list / into a file) and 10 (!help). Witnesses: W-DOOR-OUT, W-DOOR-HELP.
// Nothing here runs an engine or reads anything but the envelope it is handed and verbs.json. Every word of !help comes from the vocabulary (never a hand list).
'use strict';
const path = require('path');

// ───────────── rows out of an envelope ─────────────
// The rows of an answer: answer.rows if the verb says so (erp.list), else the first top-level array of objects (erp.find's matches), else one record.
function tableOf(env) {
  const a = env && env.answer;
  if (!a || typeof a !== 'object') return { record: null, rows: null };
  const k = ['rows', 'matches', 'entries'].filter(x => Array.isArray(a[x]) && a[x].every(r => r && typeof r === 'object' && !Array.isArray(r)))[0];   // the answer's row sets; any other array stays inside a record's cell
  if (k) return shape(a[k], k === 'rows' ? a.columns : null, k === 'rows' ? a.total : null);
  return { record: a, rows: null };
}
function shape(rows, columns, total) {
  if (process.env.OUT_BREAK === 'droplast') rows = rows.slice(0, -1);   // the witness's falsifier
  const cols = Array.isArray(columns) && columns.length ? columns.slice() : [];
  if (!cols.length) rows.forEach(r => Object.keys(r).forEach(c => { if (cols.indexOf(c) < 0) cols.push(c); }));
  return { rows, columns: cols, total: total == null ? rows.length : total };
}
// a cell as text: strings as they are, numbers as the engine returned them (JSON.stringify keeps the digits), null as empty, objects as JSON
function cell(v) { return v == null ? '' : (typeof v === 'string' ? v : (typeof v === 'object' ? JSON.stringify(v) : String(v))); }

// ───────────── --csv : RFC 4180 ─────────────
function q(s) { return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
function toCsv(env) {
  const t = tableOf(env);
  if (!t.rows) return null;   // a single record or an empty answer has no rows: the caller says so
  const lines = [t.columns.map(q).join(',')];
  t.rows.forEach(r => lines.push(t.columns.map(c => q(cell(r[c]))).join(',')));
  return lines.join('\r\n') + '\r\n';
}

// ───────────── --list : an aligned table, or field: value lines ─────────────
function toList(env) {
  const t = tableOf(env);
  if (t.rows) {
    const cells = t.rows.map(r => t.columns.map(c => cell(r[c]).replace(/\r?\n/g, '\\n')));
    const w = t.columns.map((c, i) => Math.max(c.length, ...cells.map(r => r[i].length)));
    const fmt = (arr) => arr.map((x, i) => x + ' '.repeat(w[i] - x.length)).join('  ').replace(/\s+$/, '');
    return [fmt(t.columns)].concat(cells.map(fmt)).concat(['shown ' + t.rows.length + ' of ' + t.total]).join('\n') + '\n';
  }
  if (t.record) return Object.keys(t.record).map(k => k + ': ' + cell(t.record[k]).replace(/\r?\n/g, '\\n')).join('\n') + '\n';
  return (env && env.why ? String(env.why) : String(env && env.status)) + '\n';
}

// a rendering by name; the form of a file follows its name (.csv = CSV, .json = envelope, anything else = list)
function formOf(file) { return /\.csv$/i.test(file) ? 'csv' : (/\.json$/i.test(file) ? 'json' : 'list'); }
function render(env, form) {
  if (form === 'csv') return toCsv(env);
  if (form === 'list') return toList(env);
  return JSON.stringify(env) + '\n';
}
// a file inside the folder, or null: a path that leaves it is refused
function inside(folder, file) {
  const root = path.resolve(folder), p = path.resolve(root, file);
  return p === root || p.indexOf(root + path.sep) === 0 ? p : null;
}

// ───────────── !help : generated from the vocabulary ─────────────
const HARM_WORDS = { read: 'reads only', trial: 'tries it on a copy, changes nothing real', writes: 'writes', posts: 'posts to the books', sends: 'sends something outside' };
function exampleOf(e) {
  const parts = e.inputs.filter(i => i.required && i.example != null).map(i => i.name + '=' + (/[\s"]/.test(String(i.example)) ? JSON.stringify(String(i.example)) : i.example));
  return e.verb + (parts.length ? ' ' + parts.join(' ') : '');
}
function isHelp(line) { return /^\s*(!help|help|\?)(\s|$)/.test(line); }
function help(vocab, line) {
  if (process.env.HELP_BREAK === 'handlist') vocab = { verbs: vocab.verbs.slice(0, -2), byVerb: vocab.byVerb };   // the witness's falsifier: a stale hand list
  const topic = String(line).replace(/^\s*(!help|help|\?)/, '').trim(), verbs = vocab.verbs, apps = [];
  verbs.forEach(v => { if (apps.indexOf(v.app) < 0) apps.push(v.app); });
  const row = (e) => '  ' + exampleOf(e).padEnd(64) + '  ' + e.title;
  if (!topic) {
    const out = ['Common commands (type !help <app> for all of an app, !help <app.verb> for one, !help all for everything):'];
    apps.forEach(a => {
      const all = verbs.filter(v => v.app === a), com = all.filter(v => v.common);
      if (com.length) out.push('', a + ' (' + com.length + ' of ' + all.length + ')', ...com.map(row));
    });
    return { ok: true, text: out.join('\n') + '\n' };
  }
  if (topic === 'all') return { ok: true, text: apps.map(a => { const all = verbs.filter(v => v.app === a); return a + ' (' + all.length + ' of ' + all.length + ')\n' + all.map(row).join('\n'); }).join('\n\n') + '\n' };
  if (apps.indexOf(topic) >= 0) { const all = verbs.filter(v => v.app === topic); return { ok: true, text: topic + ' (' + all.length + ' of ' + all.length + ')\n' + all.map(row).join('\n') + '\n' }; }
  const e = vocab.byVerb.get(topic);
  if (e) {
    const out = [e.verb + ' — ' + e.title, '', e.description, '', 'Inputs:'];
    if (!e.inputs.length) out.push('  (none)');
    e.inputs.forEach(i => out.push('  ' + i.name + ' (' + (i.required ? 'required' : 'optional') + (i.type ? ', ' + i.type : '') + (i.unit ? ', ' + i.unit : '') + ')' + (i.example != null ? ' e.g. ' + i.example : '') + (i.description ? ' — ' + i.description : '')));
    out.push('', 'Harm: ' + e.harm + ' (' + (HARM_WORDS[e.harm] || e.harm) + ')', 'Who may run it: ' + (e.actors || ['human']).join(', ') + (e.actors && e.actors.indexOf('ai') < 0 ? ' (an AI cannot call it)' : ''), 'Example: ' + exampleOf(e));
    return { ok: true, text: out.join('\n') + '\n' };
  }
  return { ok: false, text: 'no such topic: "' + topic + '". Apps: ' + apps.join(', ') + '. Or one verb, e.g. ' + exampleOf(verbs[0]).split(' ')[0] + '. Or all.\n' };
}

module.exports = { tableOf, toCsv, toList, render, formOf, inside, help, isHelp, exampleOf, cell };
