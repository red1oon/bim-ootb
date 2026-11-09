// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — migrate/engine.mjs: ONE migration engine for any ERP, driven by a JSON template the user adjusts. Implementing bim-compiler prompts/MIGRATE_INSTALL_TENANT.md
//   §ENGINE-SPEC §1-§2 + §ENGINE-D-SPEC — Witness: W-MIGRATE-ENGINE (erp/tests/witness_migrate_engine.js, §MIGE lines). READ THE LOG.
//   SOURCE ──connector──▶ rows ──template (JSON, data only)──▶ the 17-sheet Ninja workbook (HEADERS/ORDER, finishBook) + manifest + provenance — the SAME triple the hand
//   converters return, so the "Migrate from …" plan/load screen and the Ninja loader are unchanged.
// A template is DATA: a closed set of block keys and expression operators, evaluated here by ONE evaluator (no eval, no JS in a template). Anything outside the closed sets,
//   a reference to a sheet not produced yet, or a ${VAR} / %let / def / valueMap that is not declared = the template is REFUSED at load, the reason named.
// Pure: no I/O, no clock, no random. Browser + node.
import { HEADERS, ORDER, uuid5, finishBook } from './workbook.mjs';

const s = (v) => (v == null ? '' : String(v));
const BLOCK_KEYS = ['from', 'where', 'refuse', 'fields', 'unique', 'group', 'prov', 'patches', 'notes', 'problems'];
const FROM_KEYS = ['of', 'each', 'match', 'first', 'ifNone', 'let'];
const TOP_KEYS = ['template', 'version', 'source', 'connector', 'srcKey', 'variables', 'valueMaps', 'let', 'defs', 'entities', 'manifest', 'description'];
// operator → [min args, max args] (an operator takes ONE value: a single expression or an array of them)
const OPS = { str: 1, num: 1, not: 1, has: 1, first: -1, or: -1, and: -1, eq: 2, ne: 2, in: 2, if: 3, map: 2, concat: -1, cut: 2, uuid5: 1, add: -1, sub: 2, mul: -1,
  seq: 1, count: 1, size: 1, exists: 3, out: 2, src: 2, countWhere: 2, collect: 3, join: 2, def: 1, pick: 1 };
const SHEET_OPS = { count: 0, exists: 0, out: 0, src: 0, countWhere: 0, collect: 0 };   // first argument names a sheet

export class TemplateError extends Error { constructor(why) { super('template refused: ' + why); this.why = why; } }

// ── load: validate the whole template before any row is read ──
export function load(t) {
  const bad = (w) => { throw new TemplateError(w); };
  if (!t || typeof t !== 'object') bad('not a JSON object');
  Object.keys(t).forEach((k) => { if (!TOP_KEYS.includes(k)) bad('unknown top-level key "' + k + '"'); });
  if (!t.entities || typeof t.entities !== 'object') bad('no "entities"');
  const vars = t.variables || {}, maps = t.valueMaps || {}, lets = t.let || {}, defs = t.defs || {};
  const done = new Set(), defSeen = new Set();
  const expr = (e, where, sheet, inLet) => {
    if (e == null || typeof e === 'number' || typeof e === 'boolean') return;
    if (typeof e === 'string') {
      const v = e.match(/^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/); if (v && !(v[1] in vars)) bad(where + ': variable ${' + v[1] + '} is not declared in "variables"');
      if (/\$\{/.test(e) && !v) bad(where + ': "' + e + '" — a ${VAR} must be the whole value (use concat)');
      if (e[0] === '%') { const n = e.slice(1).split('.')[0]; if (!(n in lets)) bad(where + ': %' + n + ' is not declared in "let"'); }
      return;
    }
    if (Array.isArray(e)) { e.forEach((x) => expr(x, where, sheet, inLet)); return; }
    if (typeof e !== 'object') bad(where + ': not an expression');
    const ks = Object.keys(e); if (ks.length !== 1) bad(where + ': an operator object has exactly one key, got ' + JSON.stringify(ks));
    const op = ks[0], a = e[op]; if (!(op in OPS)) bad(where + ': unknown operator "' + op + '"');
    const args = Array.isArray(a) ? a : [a], n = OPS[op];
    if (n > 0 && args.length !== n && !(n === 1 && !Array.isArray(a))) bad(where + ': ' + op + ' takes ' + n + ' argument(s), got ' + args.length);
    if (op in SHEET_OPS) { const sh = args[0]; if (inLet) bad(where + ': "' + op + '" reads the produced sheets — not allowed in "let" (a let is computed once from the source)');
      if (!(sh in HEADERS)) bad(where + ': "' + sh + '" is not a target sheet'); if (!done.has(sh) && sh !== sheet) bad(where + ': ' + op + ' reads sheet ' + sh + ' before it is produced (entities are evaluated in key order)');
      args.slice(1).forEach((x) => expr(x, where, sheet, inLet)); return; }
    if (op === 'map' && !(args[0] in maps)) bad(where + ': valueMap "' + args[0] + '" is not declared');
    if (op === 'def' && !(args[0] in defs)) bad(where + ': def "' + args[0] + '" is not declared');
    if (op === 'def') { const k = args[0] + '|' + sheet; if (!defSeen.has(k)) { defSeen.add(k); expr(defs[args[0]], where + ' (def ' + args[0] + ')', sheet, inLet); } return; }   // a def is a macro: checked where it is used
    if (op === 'seq' || op === 'size' || op === 'map') { if (op === 'map') expr(args[1], where, sheet, inLet); return; }
    if (op === 'pick') { const p = a || {}; Object.keys(p).forEach((k) => { if (!['from', 'sortBy', 'prefer'].includes(k)) bad(where + ': pick has no key "' + k + '"'); });
      if (typeof p.from !== 'string') bad(where + ': pick.from names a source set'); expr(p.sortBy, where, sheet, inLet); expr(p.prefer, where, sheet, inLet); return; }
    args.forEach((x) => expr(x, where, sheet, inLet));
  };
  // a record (prov): an object whose every value is an expression
  const rec = (r, where, sheet) => { if (r == null) return; if (typeof r !== 'object' || Array.isArray(r)) bad(where + ': a record is an object of expressions'); Object.keys(r).forEach((k) => expr(r[k], where + '.' + k, sheet)); };
  Object.keys(lets).forEach((k) => expr(lets[k], 'let.' + k, null, true));
  Object.keys(t.entities).forEach((sheet) => {
    if (!(sheet in HEADERS)) bad('entities: "' + sheet + '" is not a target sheet (one of ' + ORDER.length + ': ' + ORDER.join(', ') + ')');
    const blocks = Array.isArray(t.entities[sheet]) ? t.entities[sheet] : [t.entities[sheet]];
    blocks.forEach((b, i) => {
      const at = sheet + '[' + i + ']';
      Object.keys(b).forEach((k) => { if (!BLOCK_KEYS.includes(k)) bad(at + ': unknown block key "' + k + '"'); });
      const f = b.from;
      if (typeof f === 'string') { /* a source set */ } else if (f && typeof f === 'object') {
        Object.keys(f).forEach((k) => { if (!FROM_KEYS.includes(k)) bad(at + '.from: unknown key "' + k + '"'); });
        if (f.let != null) { if (!(f.let in lets)) bad(at + '.from.let: %' + f.let + ' is not declared'); }
        else { if (!(f.of in HEADERS)) bad(at + '.from.of: "' + f.of + '" is not a target sheet'); if (!done.has(f.of)) bad(at + '.from.of reads sheet ' + f.of + ' before it is produced'); }
        expr(f.match, at + '.from.match', sheet);
        if (f.ifNone) { Object.keys(f.ifNone).forEach((k) => { if (!['where', 'fields', 'prov'].includes(k)) bad(at + '.from.ifNone: unknown key "' + k + '"'); });
          expr(f.ifNone.where, at + '.ifNone.where', sheet); Object.keys(f.ifNone.fields || {}).forEach((c) => { if (!HEADERS[sheet].includes(c)) bad(at + '.ifNone.fields: "' + c + '" is not a column of ' + sheet); expr(f.ifNone.fields[c], at + '.ifNone.' + c, sheet); });
          rec(f.ifNone.prov, at + '.ifNone.prov', sheet); }
      } else bad(at + ': "from" is missing');
      expr(b.where, at + '.where', sheet);
      (b.refuse || []).forEach((r, j) => { if (typeof r.why !== 'string') bad(at + '.refuse[' + j + ']: a refusal states its "why"'); expr(r.when, at + '.refuse[' + j + ']', sheet); });
      Object.keys(b.fields || {}).forEach((c) => { if (!HEADERS[sheet].includes(c)) bad(at + '.fields: "' + c + '" is not a column of ' + sheet); expr(b.fields[c], at + '.' + c, sheet); });
      if (b.unique != null && !HEADERS[sheet].includes(b.unique)) bad(at + '.unique: "' + b.unique + '" is not a column of ' + sheet);
      if (b.group) { const g = b.group; Object.keys(g).forEach((k) => { if (!['by', 'sort', 'sum'].includes(k)) bad(at + '.group: unknown key "' + k + '"'); });
        if (!Array.isArray(g.by) || !g.by.length) bad(at + '.group.by: a list of key expressions'); expr(g.by, at + '.group.by', sheet);
        Object.keys(g.sum || {}).forEach((c) => { if (!HEADERS[sheet].includes(c)) bad(at + '.group.sum: "' + c + '" is not a column of ' + sheet); expr(g.sum[c].of, at + '.group.sum.' + c, sheet); }); }
      rec(b.prov, at + '.prov', sheet);
      const EK = { patches: ['when', 'rows', 'cell', 'rule', 'table', 'column'], notes: ['when', 'text'], problems: ['when', 'text'] };
      Object.keys(EK).forEach((k) => (b[k] || []).forEach((p, j) => { const w = at + '.' + k + '[' + j + ']';
        Object.keys(p).forEach((q) => { if (!EK[k].includes(q)) bad(w + ': unknown key "' + q + '"'); });
        if (k === 'patches') { if (typeof p.column !== 'string') bad(w + ': a patch names its column'); if (p.table != null && !(p.table in HEADERS)) bad(w + ': "' + p.table + '" is not a target sheet'); }
        EK[k].forEach((q) => { if (q !== 'table' && q !== 'column') expr(p[q], w + '.' + q, sheet); }); }));
    });
    done.add(sheet);
  });
  Object.keys(t.manifest || {}).forEach((k) => expr(t.manifest[k], 'manifest.' + k, null));
  return t;
}

// ── run: connector rows → book + manifest + provenance ──
export function run(t, conn, variables) {
  load(t);
  const V = Object.assign({}, t.variables || {}, variables || {}), maps = t.valueMaps || {}, defs = t.defs || {}, letE = t.let || {}, letV = {}, seqs = {};
  const sheets = {}, prov = {}, accepted = {}; ORDER.forEach((k) => { sheets[k] = []; prov[k] = []; accepted[k] = []; });
  const patches = [], renamed = [], refused = [], notes = (conn.notes || []).slice(), problems = (conn.problems || []).slice();
  const truthy = (v) => !!v;
  const letGet = (n) => { if (!(n in letV)) letV[n] = ev(letE[n], {}); return letV[n]; };
  function ev(e, cx) {
    if (e == null || typeof e === 'number' || typeof e === 'boolean') return e;
    if (typeof e === 'string') {
      const c = e[0];
      if (c === '$') { if (e[1] === '{') return V[e.slice(2, -1)]; return cx.row ? cx.row[e.slice(1)] : undefined; }
      if (c === '^') return cx.parent ? cx.parent[e.slice(1)] : undefined;
      if (c === '@') return conn.scalar(e.slice(1));
      if (c === '%') { const [n, f] = e.slice(1).split('.'); const v = letGet(n); return f == null ? v : (v == null ? undefined : v[f]); }
      return e;
    }
    if (Array.isArray(e)) return e.map((x) => ev(x, cx));
    const op = Object.keys(e)[0], a = e[op], A = Array.isArray(a) ? a : [a], x = (i) => ev(A[i], cx);
    switch (op) {
      case 'str': return s(x(0));
      case 'num': return Number(x(0));
      case 'not': return !x(0);
      case 'has': return x(0) != null;
      case 'first': for (let i = 0; i < A.length; i++) { const v = s(x(i)); if (v) return v; } return '';
      case 'or': { let v; for (let i = 0; i < A.length; i++) { v = x(i); if (v) return v; } return v; }
      case 'and': { let v = true; for (let i = 0; i < A.length; i++) { v = x(i); if (!v) return v; } return v; }
      case 'eq': return x(0) === x(1);
      case 'ne': return x(0) !== x(1);
      case 'in': return (x(1) || []).includes(x(0));
      case 'if': return x(0) ? x(1) : x(2);
      case 'map': { const m = maps[A[0]], k = s(x(1)); return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : undefined; }
      case 'concat': return A.map((_, i) => s(x(i))).join('');
      case 'cut': return s(x(0)).slice(0, Number(x(1)));
      case 'uuid5': return uuid5(s(x(0)));
      case 'add': return A.reduce((n, _, i) => n + Number(x(i)), 0);
      case 'sub': return Number(x(0)) - Number(x(1));
      case 'mul': return A.reduce((n, _, i) => n * Number(x(i)), 1);
      case 'seq': { const n = A[0]; seqs[n] = seqs[n] || 0; return seqs[n]++; }
      case 'count': return sheets[A[0]].length;
      case 'size': return conn.rows(A[0]).length;
      case 'exists': { const sh = sheets[A[0]], col = A[1], v = s(x(2)); return sh.some((r) => r[col] === v); }
      case 'out': { const r = sheets[A[0]][0]; return r ? r[A[1]] : undefined; }
      case 'src': { const r = accepted[A[0]][0]; return r ? r.row[A[1]] : undefined; }
      case 'countWhere': return accepted[A[0]].filter((r) => ev(A[1], r)).length;
      case 'collect': return accepted[A[0]].filter((r) => ev(A[1], r)).map((r) => ev(A[2], r));
      case 'join': return (x(0) || []).join(s(x(1)));
      case 'def': return ev(defs[A[0]], cx);
      case 'pick': { const p = a, rows = conn.rows(p.from).slice(); if (p.sortBy != null) rows.sort((r1, r2) => ev(p.sortBy, { row: r1 }) - ev(p.sortBy, { row: r2 }));
        return (p.prefer != null && rows.find((r) => ev(p.prefer, { row: r }))) || rows[0]; }
    }
    throw new TemplateError('unknown operator ' + op);
  }
  const recEv = (r, cx) => { if (r == null) return r; const o = {}; Object.keys(r).forEach((k) => { o[k] = ev(r[k], cx); }); return o; };
  const emitAfter = (b, sheet) => {
    (b.problems || []).forEach((p) => { if (!p.when || ev(p.when, {})) problems.push(s(ev(p.text, {}))); });
    (b.notes || []).forEach((p) => { if (!p.when || ev(p.when, {})) notes.push(s(ev(p.text, {}))); });
    (b.patches || []).forEach((p) => { if (p.when && !ev(p.when, {})) return; const rows = ev(p.rows, {}); if (rows) patches.push({ table: p.table || sheet, column: p.column, cell: s(ev(p.cell, {})), rule: s(ev(p.rule, {})), rows }); });
  };
  // the source contexts a block iterates: { row, parent }
  const sources = (b) => {
    const f = b.from, out = [];
    if (typeof f === 'string') { conn.rows(f).forEach((r) => out.push({ row: r })); return out; }
    if (f.let != null) { const v = letGet(f.let); if (v != null) out.push({ row: v }); return out; }
    accepted[f.of].forEach((p) => {
      if (!f.each) { out.push({ row: p.row, parent: p.parent }); return; }
      let kids = Array.isArray(p.row[f.each]) ? p.row[f.each] : [];
      if (f.match != null) kids = kids.filter((k) => ev(f.match, { row: k, parent: p.row }));
      if (f.first) kids = kids.slice(0, 1);
      kids.forEach((k) => out.push({ row: k, parent: p.row }));
      if (!kids.length && f.ifNone && (!f.ifNone.where || ev(f.ifNone.where, { row: p.row }))) out.push({ row: p.row, parent: p.parent, none: true });
    });
    return out;
  };
  Object.keys(t.entities).forEach((sheet) => {
    const blocks = Array.isArray(t.entities[sheet]) ? t.entities[sheet] : [t.entities[sheet]];
    blocks.forEach((b) => {
      const ref = (b.refuse || []).map((r) => ({ why: r.why, when: r.when, n: 0 })), seen = new Set(sheets[sheet].map((r) => b.unique && r[b.unique]));
      const taken = [];
      sources(b).forEach((cx) => {
        if (b.where != null && !cx.none && !truthy(ev(b.where, cx))) return;
        const hit = cx.none ? null : ref.find((r) => truthy(ev(r.when, cx))); if (hit) { hit.n++; return; }
        taken.push(cx);
      });
      const put = (cx, row, pv) => { if (b.unique) { if (seen.has(row[b.unique])) return; seen.add(row[b.unique]); } sheets[sheet].push(row); prov[sheet].push(pv); accepted[sheet].push(cx); };
      const build = (cx, fields) => { const row = {}; Object.keys(fields || {}).forEach((c) => { row[c] = s(ev(fields[c], cx)); }); return row; };
      if (b.group) {
        const G = new Map();
        taken.forEach((cx) => { const k = b.group.by.map((e) => s(ev(e, cx))).join('|'); let g = G.get(k); if (!g) G.set(k, g = { cx, sums: {} });
          Object.keys(b.group.sum || {}).forEach((c) => { const sp = b.group.sum[c], q = Number(ev(sp.of, cx)), f = Math.pow(10, sp.places == null ? 6 : sp.places);
            g.sums[c] = Math.round(((g.sums[c] || 0) + q) * f) / f; });
          (g.members = g.members || []).push(cx); });
        const keys = Array.from(G.keys()); if (b.group.sort) keys.sort();
        keys.forEach((k) => { const g = G.get(k), cx = Object.assign({}, g.cx, { key: k }), row = build(cx, b.fields); Object.keys(g.sums).forEach((c) => { row[c] = String(g.sums[c]); });
          put(cx, row, recEv(b.prov, cx)); g.members.slice(1).forEach((m) => accepted[sheet].push(m)); });
      } else taken.forEach((cx) => { const f = cx.none ? b.from.ifNone.fields : b.fields, pv = cx.none ? b.from.ifNone.prov : b.prov; put(cx, build(cx, f), recEv(pv, cx)); });
      ref.forEach((r) => { if (r.n) refused.push({ sheet, why: r.why, n: r.n }); });
      emitAfter(b, sheet);
    });
  });
  const patch = (table, column, cell, rule, rows) => { if (rows) patches.push({ table, column, cell, rule, rows }); };
  const book = finishBook(sheets, patch, renamed, t.srcKey || 'src');
  const M = t.manifest || {}, manifest = {};
  Object.keys(M).forEach((k) => { manifest[k] = ev(M[k], {}); });
  if (conn.setsReportAs) manifest[conn.setsReportAs] = conn.report();
  Object.assign(manifest, { problems, sheets: book.map((b, i) => ({ sheet: b.name, table: ORDER[i], rows: b.rows.length - 1, header: b.rows[0], source: t.srcKey || 'src' })), patches, renamed, refused, notes });
  return { book, manifest, provenance: prov };
}

// the field check (§ENGINE-SPEC §2): every "$Field" a block reads from a TOP-LEVEL source set, against the connector's model — a field the source lacks is NAMED, never guessed
export function fieldCheck(t, model) {
  const used = {}, add = (set, e) => { const walk = (x) => { if (typeof x === 'string' && /^\$[A-Za-z_]/.test(x)) (used[set] = used[set] || new Set()).add(x.slice(1)); else if (x && typeof x === 'object') Object.values(x).forEach(walk); }; walk(e); };
  Object.keys(t.entities).forEach((sheet) => (Array.isArray(t.entities[sheet]) ? t.entities[sheet] : [t.entities[sheet]]).forEach((b) => {
    if (typeof b.from === 'string') add(b.from, [b.where, b.refuse, b.fields, b.prov]); }));
  const out = [];
  Object.keys(used).forEach((set) => used[set].forEach((f) => { const m = model[set]; out.push({ set, field: f, known: !!m, ok: !m || m.includes(f) }); }));
  return out;
}
