// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
// ⚠ DO NOT REMOVE — migrate/engine.mjs: ONE migration engine for any ERP, driven by a JSON template the user adjusts. Implementing bim-compiler prompts/MIGRATE_INSTALL_TENANT.md
//   §ENGINE-SPEC §1-§2 + §ENGINE-D-SPEC — Witness: W-MIGRATE-ENGINE (erp/tests/witness_migrate_engine.js, §MIGE lines). READ THE LOG.
//   SOURCE ──connector──▶ rows ──template (JSON, data only)──▶ the 17-sheet Ninja workbook (HEADERS/ORDER, finishBook) + manifest + provenance — the SAME triple the hand
//   converters return, so the "Migrate from …" plan/load screen and the Ninja loader are unchanged.
// A template is DATA: a closed set of block keys and expression operators, evaluated here by ONE evaluator (no eval, no JS in a template). Anything outside the closed sets,
//   a reference to a sheet not produced yet, or a ${VAR} / %let / def / valueMap that is not declared = the template is REFUSED at load, the reason named.
// Pure: no I/O, no clock, no random. Browser + node.
import { HEADERS as MASTER_HEADERS, ORDER as MASTER_ORDER, OPEN_HEADERS, OPEN_ORDER, uuid5, finishBook } from './workbook.mjs';
// the target sheets a template may name: the 17 masters + the optional open-balance sheets (§E3C-SPEC b)
const HEADERS = Object.assign({}, MASTER_HEADERS, OPEN_HEADERS), ORDER = MASTER_ORDER.concat(OPEN_ORDER);

const s = (v) => (v == null ? '' : String(v));
const BLOCK_KEYS = ['from', 'tag', 'sort', 'where', 'once', 'refuse', 'fields', 'rename', 'unique', 'group', 'prov', 'patches', 'notes', 'problems', 'keys', 'limit'];
const FROM_KEYS = ['of', 'each', 'match', 'first', 'ifNone', 'let', 'list'];
const TOP_KEYS = ['template', 'version', 'source', 'connector', 'srcKey', 'variables', 'valueMaps', 'let', 'defs', 'entities', 'manifest', 'description'];
// operator → [min args, max args] (an operator takes ONE value: a single expression or an array of them)
const OPS = { str: 1, num: 1, not: 1, has: 1, first: -1, or: -1, and: -1, eq: 2, ne: 2, in: 2, if: 3, map: 2, concat: -1, cut: 2, uuid5: 1, add: -1, sub: 2, mul: -1,
  seq: 1, count: 1, size: 1, exists: 3, out: 2, src: 2, countWhere: 2, collect: 3, join: 2, def: 1, pick: 1,
  enum: 3, caption: 1, re: 4, replace: 4, trim: 1, gt: 2, lt: 2, len: 1, take: 2, any: 2, obj: 1, with: 2, lookup: 4, treeDepth: 4, row: 2, hasSet: 1, counter: 1,
  find: 4, round: 2, abs: 1, sumSet: 3,
  // §O2 (Odoo masters, W-MIGRATE-ENGINE ODOO-GUIDE): list ops over raw sets, one-line each (the oracle line that forced it is in the PR text)
  all: 1, findAll: 3, filter: 2, each: 2, sortBy: 2, at: 2, cat: -1,   // all = a raw set's rows · findAll = the rows with that key (indexed) · filter / each / sortBy run their 2nd argument on each element · at = list[i] · cat = lists joined
  split: 2, json: 1, fixed: 2, log10: 1, dict: 1, meta: 2,   // JS split · JSON.stringify · toFixed · Math.log10 · [[k,v]..] -> object · a fact the source said about a set (count, domain, archived_too ..)
  tally: 3, key: 2 };   // tally = how many produced rows of a sheet hold that value in a column (exists counted) · key = the final key a `keys` block gave the record with that id   // §E3C-SPEC (b): find = a row of a RAW source set by key (a source whose rows point at each other by id); sumSet = a total over a raw set
const SHEET_OPS = { count: 0, exists: 0, out: 0, src: 0, countWhere: 0, collect: 0, lookup: 0, tally: 0 };   // first argument names a sheet
const LITERAL_ARGS = { enum: [1], re: [0, 1, 3], replace: [1, 2], row: [0, 1], hasSet: [0], counter: [0], treeDepth: [0, 1, 2, 3], any: [0], find: [0, 1, 3], sumSet: [0], all: [0], findAll: [0, 1], key: [0] };   // arguments that are names/patterns, not expressions
const SPECIAL = ['#tag', '#v', '#prev', '#label', '#ukey', '#members', '#L', '#ids', '#items', '#col'];
const fld = (e) => { const i = e.indexOf('.'); return i < 0 ? [e, null] : [e.slice(0, i), e.slice(i + 1)]; };   // "%NAME.Field name." — the field may itself contain dots ("No.")

export class TemplateError extends Error { constructor(why) { super('template refused: ' + why); this.why = why; } }

// ── load: validate the whole template before any row is read ──
export function load(t) {
  const bad = (w) => { throw new TemplateError(w); };
  if (!t || typeof t !== 'object') bad('not a JSON object');
  Object.keys(t).forEach((k) => { if (!TOP_KEYS.includes(k)) bad('unknown top-level key "' + k + '"'); });
  if (!t.entities || typeof t.entities !== 'object') bad('no "entities"');
  const vars = t.variables || {}, maps = t.valueMaps || {}, lets = t.let || {}, defs = t.defs || {};
  const done = new Set(), defSeen = new Set(), keyNames = new Set();
  const expr = (e, where, sheet, inLet) => {
    if (e == null || typeof e === 'number' || typeof e === 'boolean') return;
    if (typeof e === 'string') {
      const v = e.match(/^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/); if (v && !(v[1] in vars)) bad(where + ': variable ${' + v[1] + '} is not declared in "variables"');
      if (/\$\{/.test(e) && !v) bad(where + ': "' + e + '" — a ${VAR} must be the whole value (use concat)');
      if (e[0] === '%') { const n = fld(e.slice(1))[0]; if (!(n in lets)) bad(where + ': %' + n + ' is not declared in "let"'); }
      if (e[0] === '#' && !SPECIAL.includes(e)) bad(where + ': "' + e + '" — only ' + SPECIAL.join(', ') + ' start with #');
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
    if (op === 'key') { if (inLet) bad(where + ': key reads a `keys` block\'s result — not allowed in "let"'); if (!keyNames.has(args[0])) bad(where + ': key "' + args[0] + '" is not declared by a block\'s keys.as before this point'); expr(args[1], where, sheet, inLet); return; }
    if (op === 'seq' || op === 'size' || op === 'map') { if (op === 'map') expr(args[1], where, sheet, inLet); return; }
    if (op === 'obj') { if (!a || typeof a !== 'object' || Array.isArray(a)) bad(where + ': obj takes an object of expressions'); Object.keys(a).forEach((k) => expr(a[k], where + '.' + k, sheet, inLet)); return; }
    if (op in LITERAL_ARGS) {
      if ((op === 're' || op === 'replace')) { const pi = op === 're' ? 0 : 1; try { new RegExp(args[pi], args[pi + 1] || ''); } catch (er) { bad(where + ': ' + op + ' pattern does not compile: ' + er.message); }
        if (!/^[gimsu]*$/.test(String(args[pi + 1] || ''))) bad(where + ': ' + op + ' flags "' + args[pi + 1] + '" (only g i m s u)'); }
      args.forEach((x, i) => { if (!LITERAL_ARGS[op].includes(i)) expr(x, where, sheet, inLet); }); return; }
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
        expr(f.match, at + '.from.match', sheet); expr(f.list, at + '.from.list', sheet);
        if (f.list != null && f.let != null) bad(at + '.from: list and let are two ways to say the same thing');
        if (f.ifNone) { Object.keys(f.ifNone).forEach((k) => { if (!['where', 'fields', 'prov'].includes(k)) bad(at + '.from.ifNone: unknown key "' + k + '"'); });
          expr(f.ifNone.where, at + '.ifNone.where', sheet); Object.keys(f.ifNone.fields || {}).forEach((c) => { if (!HEADERS[sheet].includes(c)) bad(at + '.ifNone.fields: "' + c + '" is not a column of ' + sheet); expr(f.ifNone.fields[c], at + '.ifNone.' + c, sheet); });
          rec(f.ifNone.prov, at + '.ifNone.prov', sheet); }
      } else bad(at + ': "from" is missing');
      if (b.keys) { const K = b.keys; Object.keys(K).forEach((k) => { if (!['col', 'id', 'raw', 'max', 'as', 'patch'].includes(k)) bad(at + '.keys: unknown key "' + k + '"'); });
        if (!HEADERS[sheet].includes(K.col)) bad(at + '.keys.col: "' + K.col + '" is not a column of ' + sheet); if (typeof K.as !== 'string' || !K.as) bad(at + '.keys.as names the key map');
        if (!(K.max > 0)) bad(at + '.keys.max: the column length'); expr(K.id, at + '.keys.id', sheet); expr(K.raw, at + '.keys.raw', sheet);
        Object.keys(K.patch || {}).forEach((k) => { if (!['cell', 'rule'].includes(k)) bad(at + '.keys.patch: unknown key "' + k + '"'); expr(K.patch[k], at + '.keys.patch.' + k, sheet); }); keyNames.add(K.as); }
      if (b.limit) { const Lm = b.limit; Object.keys(Lm).forEach((k) => { if (!['id', 'cell', 'rule', 'cols'].includes(k)) bad(at + '.limit: unknown key "' + k + '"'); });
        Object.keys(Lm.cols || {}).forEach((c) => { if (!HEADERS[sheet].includes(c)) bad(at + '.limit.cols: "' + c + '" is not a column of ' + sheet); if (!(Lm.cols[c] > 0)) bad(at + '.limit.cols.' + c + ': a length'); });
        ['id', 'cell', 'rule'].forEach((k) => expr(Lm[k], at + '.limit.' + k, sheet)); }
      expr(b.where, at + '.where', sheet); expr(b.once, at + '.once', sheet); expr(b.sort, at + '.sort', sheet);
      if (b.tag != null && typeof b.tag !== 'string' && typeof b.tag !== 'number') bad(at + '.tag: a string or a number');
      (b.refuse || []).forEach((r, j) => { if (r.silent != null && typeof r.silent !== 'string') bad(at + '.refuse[' + j + '].silent names a counter'); Object.keys(r).forEach((k) => { if (!['when', 'why', 'silent'].includes(k)) bad(at + '.refuse[' + j + ']: unknown key "' + k + '"'); }); });
      if (b.rename) { const r = b.rename; Object.keys(r).forEach((k) => { if (!['col', 'label', 'to', 'src', 'why'].includes(k)) bad(at + '.rename: unknown key "' + k + '"'); });
        if (!HEADERS[sheet].includes(r.col)) bad(at + '.rename.col: "' + r.col + '" is not a column of ' + sheet); ['label', 'to', 'src', 'why'].forEach((k) => expr(r[k], at + '.rename.' + k, sheet)); }
      (b.refuse || []).forEach((r, j) => { if (typeof r.why !== 'string' && r.silent == null) bad(at + '.refuse[' + j + ']: a refusal states its "why"'); expr(r.when, at + '.refuse[' + j + ']', sheet); });
      Object.keys(b.fields || {}).forEach((c) => { if (!HEADERS[sheet].includes(c) && c[0] !== '_') bad(at + '.fields: "' + c + '" is not a column of ' + sheet); expr(b.fields[c], at + '.' + c, sheet); });
      if (b.unique != null && !HEADERS[sheet].includes(b.unique)) bad(at + '.unique: "' + b.unique + '" is not a column of ' + sheet);
      if (b.group) { const g = b.group; Object.keys(g).forEach((k) => { if (!['by', 'sort', 'sum', 'having', 'within'].includes(k)) bad(at + '.group: unknown key "' + k + '"'); });
        if (g.having != null && !(g.sum && g.having in g.sum)) bad(at + '.group.having: "' + g.having + '" is not one of its sums');
        if (g.within != null && typeof g.within !== 'boolean') bad(at + '.group.within: true or false');
        if (!Array.isArray(g.by) || !g.by.length) bad(at + '.group.by: a list of key expressions'); expr(g.by, at + '.group.by', sheet);
        Object.keys(g.sum || {}).forEach((c) => { if (!HEADERS[sheet].includes(c)) bad(at + '.group.sum: "' + c + '" is not a column of ' + sheet); expr(g.sum[c].of, at + '.group.sum.' + c, sheet); }); }
      rec(b.prov, at + '.prov', sheet);
      const EK = { patches: ['when', 'rows', 'cell', 'rule', 'table', 'column', 'zero'], notes: ['when', 'text'], problems: ['when', 'text'] };
      Object.keys(EK).forEach((k) => (b[k] || []).forEach((p, j) => { const w = at + '.' + k + '[' + j + ']';
        Object.keys(p).forEach((q) => { if (!EK[k].includes(q)) bad(w + ': unknown key "' + q + '"'); });
        if (k === 'patches') { if (typeof p.column !== 'string') bad(w + ': a patch names its column'); if (p.table != null && !(p.table in HEADERS)) bad(w + ': "' + p.table + '" is not a target sheet'); }
        EK[k].forEach((q) => { if (q !== 'table' && q !== 'column' && q !== 'zero') expr(p[q], w + '.' + q, sheet); }); }));
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
  const open = OPEN_ORDER.filter((k) => k in t.entities);   // the optional sheets this template produces
  const sheets = {}, prov = {}, accepted = {}; MASTER_ORDER.concat(open).forEach((k) => { sheets[k] = []; prov[k] = []; accepted[k] = []; });
  const patches = [], renamed = [], refused = [], notes = (conn.notes || []).slice(), problems = (conn.problems || []).slice();
  const truthy = (v) => !!v, counters = {}, onceSeen = {}, renameUsed = {}, lookIdx = new Map(), treeIdx = new Map(), findIdx = new Map(), allIdx = new Map(), colIdx = new Map(), keyMaps = {}, keyBlocks = [], limits = {};
  // how many produced rows of a sheet hold `v` in a column (an index grown as rows are appended; limit's cut clears it)
  const colCount = (sh, col, v) => { const k = sh + '|' + col; let ix = colIdx.get(k); if (!ix) colIdx.set(k, ix = { n: 0, m: new Map() }); const rows = sheets[sh];
    for (; ix.n < rows.length; ix.n++) { const val = rows[ix.n][col]; ix.m.set(val, (ix.m.get(val) || 0) + 1); } return ix.m.get(v) || 0; };
  const letGet = (n) => { if (!(n in letV)) letV[n] = ev(letE[n], {}); return letV[n]; };
  function ev(e, cx) {
    if (e == null || typeof e === 'number' || typeof e === 'boolean') return e;
    if (typeof e === 'string') {
      const c = e[0];
      if (c === '$') { if (e === '$') return cx.row; if (e[1] === '{') return V[e.slice(2, -1)]; return cx.row ? cx.row[e.slice(1)] : undefined; }
      if (c === '^') return cx.parent ? cx.parent[e.slice(1)] : undefined;
      if (c === '@') return conn.scalar(e.slice(1));
      if (c === '%') { const [n, f] = fld(e.slice(1)); const v = letGet(n); return f == null ? v : (v == null ? undefined : v[f]); }
      if (c === '#') return cx[e.slice(1)];
      if (c === '&') return cx.src ? cx.src[e.slice(1)] : undefined;      // the produced row of the source a block iterates with "of" (the parent's, for "each")
      if (c === '!') return cx.out ? cx.out[e.slice(1)] : undefined;      // this entry's own produced row (countWhere / collect / lookup)
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
      case 'exists': return colCount(A[0], A[1], s(x(2))) > 0;
      case 'tally': return colCount(A[0], A[1], s(x(2)));
      case 'out': { const r = sheets[A[0]][0]; return r ? r[A[1]] : undefined; }
      case 'src': { const r = accepted[A[0]][0]; return r ? r.row[A[1]] : undefined; }
      case 'countWhere': return accepted[A[0]].filter((r) => ev(A[1], r)).length;
      case 'collect': return accepted[A[0]].filter((r) => ev(A[1], r)).map((r) => ev(A[2], r));
      case 'join': return (x(0) || []).join(s(x(1)));
      case 'def': return ev(defs[A[0]], cx);
      case 'pick': { const p = a, rows = conn.rows(p.from).slice(); if (p.sortBy != null) rows.sort((r1, r2) => ev(p.sortBy, { row: r1 }) - ev(p.sortBy, { row: r2 }));
        return (p.prefer != null && rows.find((r) => ev(p.prefer, { row: r }))) || rows[0]; }
      case 'enum': return conn.enumName(x(0), A[1], x(2));
      case 'caption': return conn.caption(x(0));
      case 're': { const m = new RegExp(A[0], A[1] || '').exec(s(x(2))); return m ? m[A[3]] : undefined; }
      case 'replace': return s(x(0)).replace(new RegExp(A[1], A[2] || ''), s(x(3)));
      case 'trim': return s(x(0)).trim();
      case 'gt': return x(0) > x(1);
      case 'lt': return x(0) < x(1);
      case 'len': return (x(0) || []).length;
      case 'take': return (x(0) || []).slice(0, Number(x(1)));
      case 'any': return conn.rows(A[0]).some((r) => ev(A[1], { row: r }));
      case 'obj': { const o = {}; Object.keys(a).forEach((k) => { o[k] = ev(a[k], cx); }); return o; }
      case 'with': return ev(A[1], Object.assign({}, cx, { row: x(0) }));
      case 'lookup': { // [sheet, key of an accepted entry, the value looked for, what to answer from that entry] — the LAST entry with the key wins (a JS object map)
        let ix = lookIdx.get(e); const acc = accepted[A[0]]; if (!ix || ix.n !== acc.length) { const m = new Map(); acc.forEach((r) => m.set(s(ev(A[1], r)), r)); lookIdx.set(e, ix = { n: acc.length, m }); }
        const hit = ix.m.get(s(x(2))); return hit ? ev(A[3], hit) : undefined; }
      case 'treeDepth': { // [set, key field, parent field, max] — how many parents above the row (the BC converter's depth(), parents sorted first)
        const k = A[0] + '|' + A[1]; let by = treeIdx.get(k); if (!by) { by = new Map(); conn.rows(A[0]).forEach((r) => by.set(String(r[A[1]]), r)); treeIdx.set(k, by); }
        let d = 0, r = cx.row; while (r && r[A[2]] && by.get(String(r[A[2]])) && d < A[3]) { r = by.get(String(r[A[2]])); d++; } return d; }
      case 'row': return conn.rows(A[0])[A[1]];
      case 'hasSet': return conn.hasSet(A[0]);
      case 'counter': return counters[A[0]] || 0;
      case 'find': { // [set, key field, the value looked for, the field answered] - the FIRST row of the raw set with that key (ids are unique in the source)
        const k = A[0] + '|' + A[1]; let by = findIdx.get(k); if (!by) { by = new Map(); conn.rows(A[0]).forEach((r) => { const kv = s(r[A[1]]); if (!by.has(kv)) by.set(kv, r); }); findIdx.set(k, by); }
        const hit = by.get(s(x(2))); return hit ? hit[A[3]] : undefined; }
      case 'round': { const f = Math.pow(10, Number(x(1)) || 0); return Math.round(Number(x(0)) * f) / f; }
      case 'abs': return Math.abs(Number(x(0)));
      case 'all': return conn.rows(A[0]);
      case 'findAll': { const k = A[0] + '|' + A[1]; let by = allIdx.get(k); if (!by) { by = new Map(); conn.rows(A[0]).forEach((r) => { const kv = s(r[A[1]]); if (!by.has(kv)) by.set(kv, []); by.get(kv).push(r); }); allIdx.set(k, by); }
        return by.get(s(x(2))) || []; }
      case 'filter': return (x(0) || []).filter((r) => ev(A[1], Object.assign({}, cx, { row: r })));
      case 'each': return (x(0) || []).map((r) => ev(A[1], Object.assign({}, cx, { row: r })));
      case 'sortBy': { const ks = (Array.isArray(A[1]) ? A[1] : [A[1]]), rows = (x(0) || []).slice(), kv = new Map(rows.map((r) => [r, ks.map((k) => ev(k, Object.assign({}, cx, { row: r })))]));
        return rows.sort((p, q) => { const a = kv.get(p), b = kv.get(q); for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; if (d) return d; } return 0; }); }   // ascending, each key numeric (a - b), the next key breaks a tie, stable
      case 'at': return (x(0) || [])[Number(x(1))];
      case 'cat': return [].concat(...A.map((_, i) => x(i) || []));
      case 'split': return s(x(0)).split(s(x(1)));
      case 'json': return JSON.stringify(x(0));
      case 'fixed': return Number(x(0)).toFixed(Number(x(1)));
      case 'log10': return Math.log10(Number(x(0)));
      case 'dict': { const o = {}; (x(0) || []).forEach((p) => { o[p[0]] = p[1]; }); return o; }
      case 'meta': { const m = conn.meta ? conn.meta(s(x(0))) : undefined; return m ? m[s(x(1))] : undefined; }
      case 'key': { const m = keyMaps[A[0]]; return m ? m.get(s(x(1))) : undefined; }
      case 'sumSet': return conn.rows(A[0]).reduce((n, r) => (ev(A[1], { row: r }) ? n + Number(ev(A[2], { row: r })) : n), 0);
    }
    throw new TemplateError('unknown operator ' + op);
  }
  const recEv = (r, cx) => { if (r == null) return r; const o = {}; Object.keys(r).forEach((k) => { o[k] = ev(r[k], cx); }); return o; };
  const emitAfter = (b, sheet) => {
    (b.problems || []).forEach((p) => { if (!p.when || ev(p.when, {})) problems.push(s(ev(p.text, {}))); });
    (b.notes || []).forEach((p) => { if (!p.when || ev(p.when, {})) notes.push(s(ev(p.text, {}))); });
    (b.patches || []).forEach((p) => { if (p.when && !ev(p.when, {})) return; const rows = ev(p.rows, {}); if (rows || (p.zero && rows === 0)) patches.push({ table: p.table || sheet, column: p.column, cell: s(ev(p.cell, {})), rule: s(ev(p.rule, {})), rows }); });
  };
  // the source contexts a block iterates: { row, parent }
  const sources = (b) => {
    const f = b.from, out = [];
    if (typeof f === 'string') { conn.rows(f).forEach((r) => out.push({ row: r })); return out; }
    if (f.let != null) { const v = letGet(f.let); if (Array.isArray(v)) v.forEach((r) => out.push({ row: r })); else if (v != null) out.push({ row: v }); return out; }   // a list = one source row per element
    accepted[f.of].forEach((p) => {
      if (!f.each && f.list == null) { out.push({ row: p.row, parent: p.parent, tag: p.tag, src: p.out }); return; }
      let kids = f.list != null ? ev(f.list, { row: p.row, parent: p.parent }) : (Array.isArray(p.row[f.each]) ? p.row[f.each] : []); if (!Array.isArray(kids)) kids = [];   // children = a list the template computes from the parent row
      if (f.match != null) kids = kids.filter((k) => ev(f.match, { row: k, parent: p.row }));
      if (f.first) kids = kids.slice(0, 1);
      kids.forEach((k) => out.push({ row: k, parent: p.row, tag: p.tag, src: p.out }));
      if (!kids.length && f.ifNone && (!f.ifNone.where || ev(f.ifNone.where, { row: p.row }))) out.push({ row: p.row, parent: p.parent, none: true, tag: p.tag, src: p.out });
    });
    return out;
  };
  Object.keys(t.entities).forEach((sheet) => {
    const blocks = Array.isArray(t.entities[sheet]) ? t.entities[sheet] : [t.entities[sheet]];
    blocks.forEach((b) => {
      const ref = (b.refuse || []).map((r) => ({ why: r.why, when: r.when, silent: r.silent, n: 0 })), seen = new Set(sheets[sheet].map((r) => b.unique && r[b.unique]));
      const once = onceSeen[sheet] = onceSeen[sheet] || new Set(), used = renameUsed[sheet] = renameUsed[sheet] || new Map();
      const taken = [], src = sources(b);
      if (b.tag != null) src.forEach((cx) => { cx.tag = b.tag; });
      if (b.sort != null) { const k = new Map(src.map((cx) => [cx, Number(ev(b.sort, cx))])); src.sort((p, q) => k.get(p) - k.get(q)); }   // stable, ascending
      src.forEach((cx) => {
        if (b.where != null && !cx.none && !truthy(ev(b.where, cx))) return;
        if (b.once != null) { const k = s(ev(b.once, cx)); if (once.has(k)) return; once.add(k); }      // the same key a second time: not taken (before any refusal, as the converters do)
        const hit = cx.none ? null : ref.find((r) => truthy(ev(r.when, cx))); if (hit) { if (hit.silent) counters[hit.silent] = (counters[hit.silent] || 0) + 1; else hit.n++; return; }
        taken.push(cx);
      });
      if (b.keys) {   // unique, length-limited keys, assigned in ascending id order: the first record keeps its code, a repeat gets "<code>-<id>", a code over the column is cut and keeps "~<id>"
        const K = b.keys, L = K.max, seenK = new Set(), map = new Map(), items = taken.map((cx) => ({ cx, id: ev(K.id, cx), raw: s(ev(K.raw, cx)) }));
        items.slice().sort((p, q) => p.id - q.id).forEach((it) => { let v = it.raw, why = ''; const il = String(it.id).length;
          if (v.length > L) { v = v.slice(0, L - il - 1) + '~' + it.id; why = 'longer than ' + L; }
          if (seenK.has(v)) { v = it.raw + '-' + it.id; why = 'repeats ' + JSON.stringify(it.raw); if (v.length > L) v = it.raw.slice(0, L - il - 1) + '-' + it.id; }
          seenK.add(v); map.set(s(it.id), v); it.cx.ukey = v;
          if (why) renamed.push({ table: sheet, column: K.col, [(t.srcKey || 'src') + '_id']: it.id, [t.srcKey || 'src']: it.raw, erp: v, why }); });
        keyMaps[K.as] = map; keyBlocks.push({ sheet, K }); }
      const mine = [], put = (cx, row, pv) => { if (b.unique) { if (seen.has(row[b.unique])) return; seen.add(row[b.unique]); } cx.out = row; sheets[sheet].push(row); prov[sheet].push(pv); accepted[sheet].push(cx); mine.push([row, cx]); };
      const build = (cx, fields) => { const row = {}; Object.keys(fields || {}).forEach((c) => { row[c] = s(ev(fields[c], cx)); });
        if (b.rename && fields === b.fields) { const R = b.rename, v = row[R.col], label = s(ev(R.label, cx));   // one key per sheet: a value already taken gets a suffix, named in manifest.renamed
          if (used.has(v)) { const c2 = Object.assign({}, cx, { v, prev: used.get(v), label }), v2 = s(ev(R.to, c2));
            renamed.push({ table: sheet, column: R.col, [t.srcKey || 'src']: s(ev(R.src, c2)), erp: v2, why: s(ev(R.why, c2)) }); row[R.col] = v2; }
          used.set(row[R.col], label); }
        return row; };
      if (b.group) {
        const G = new Map();
        const pOrd = new Map();   // group.within: the groups are made inside each parent row (its position = the order of the groups)
        taken.forEach((cx) => { const bk = b.group.by.map((e) => s(ev(e, cx))).join('|'); if (b.group.within && !pOrd.has(cx.parent)) pOrd.set(cx.parent, pOrd.size);
          const k = b.group.within ? pOrd.get(cx.parent) + '\u0001' + bk : bk; let g = G.get(k); if (!g) G.set(k, g = { cx, sums: {}, bk, pi: b.group.within ? pOrd.get(cx.parent) : 0 });
          Object.keys(b.group.sum || {}).forEach((c) => { const sp = b.group.sum[c], q = Number(ev(sp.of, cx)), f = Math.pow(10, sp.places == null ? 6 : sp.places);
            g.sums[c] = Math.round(((g.sums[c] || 0) + q) * f) / f; });
          (g.members = g.members || []).push(cx); });
        const keys = Array.from(G.keys()); if (b.group.sort) { if (b.group.within) keys.sort((p, q) => { const a = G.get(p), c = G.get(q); return a.pi - c.pi || (a.bk < c.bk ? -1 : a.bk > c.bk ? 1 : 0); }); else keys.sort(); }
        keys.forEach((k) => { const g = G.get(k);
          if (b.group.having != null && !g.sums[b.group.having]) { g.members.forEach((m) => accepted[sheet].push(m)); return; }   // the group is not a row, its members stay readable (e.g. the header per warehouse)
          const cx = Object.assign({}, g.cx, { key: b.group.within ? g.bk : k, members: g.members.map((m) => m.row) }), row = build(cx, b.fields); Object.keys(g.sums).forEach((c) => { row[c] = String(g.sums[c]); });
          put(cx, row, recEv(b.prov, cx)); g.members.slice(1).forEach((m) => accepted[sheet].push(m)); });
      } else taken.forEach((cx) => { const f = cx.none ? b.from.ifNone.fields : b.fields, pv = cx.none ? b.from.ifNone.prov : b.prov; put(cx, build(cx, f), recEv(pv, cx)); });
      if (b.limit) {   // text over its column length is cut as legacy PO.set_Value cuts it; counted per sheet + column, patched once all blocks are done (below)
        const Lm = b.limit, ST = limits[sheet] = limits[sheet] || { spec: Lm, cols: {} };
        Object.keys(Lm.cols).forEach((c) => { const st = ST.cols[c] = ST.cols[c] || { L: Lm.cols[c], n: 0, ids: [] };
          mine.forEach(([row, cx]) => { const v = row[c]; if (typeof v === 'string' && v.length > st.L) { st.ids.push(ev(Lm.id, cx)); row[c] = v.slice(0, st.L); st.n++; } }); });
        colIdx.clear(); lookIdx.clear(); }
      ref.forEach((r) => { if (!r.n) return; const same = refused.find((x) => x.sheet === sheet && x.why === r.why); if (same) same.n += r.n; else refused.push({ sheet, why: r.why, n: r.n }); });   // ONE line per sheet + reason, over all its blocks
      emitAfter(b, sheet);
    });
  });
  // after every block: the length cuts (sheet order, column order), then one patch per renamed key column (first renamed first)
  MASTER_ORDER.concat(open).forEach((sh) => { const ST = limits[sh]; if (!ST) return;
    HEADERS[sh].forEach((h) => { const st = ST.cols[h]; if (st && st.n) patches.push({ table: sh, column: h, cell: s(ev(ST.spec.cell, { L: st.L })), rule: s(ev(ST.spec.rule, { L: st.L, ids: st.ids.join(', ') })), rows: st.n }); }); });
  const byCol = new Map(); renamed.forEach((r) => { const k = r.table + '.' + r.column; if (!byCol.has(k)) byCol.set(k, []); byCol.get(k).push(r); });
  byCol.forEach((items, k) => { const kb = keyBlocks.find((x) => x.sheet + '.' + x.K.col === k); if (!kb || !kb.K.patch) return;
    const cx = { L: kb.K.max, items, col: kb.K.col }; patches.push({ table: kb.sheet, column: kb.K.col, cell: s(ev(kb.K.patch.cell, cx)), rule: s(ev(kb.K.patch.rule, cx)), rows: items.length }); });
  const patch = (table, column, cell, rule, rows) => { if (rows) patches.push({ table, column, cell, rule, rows }); };
  const book = finishBook(sheets, patch, renamed, t.srcKey || 'src');
  open.forEach((k) => book.push({ name: String(book.length + 1).padStart(2, '0') + k, rows: [OPEN_HEADERS[k]].concat(sheets[k].map((r) => OPEN_HEADERS[k].map((h) => (r[h] == null ? '' : String(r[h]))))) }));
  const M = t.manifest || {}, manifest = {};
  Object.keys(M).forEach((k) => { manifest[k] = ev(M[k], {}); });
  if (conn.setsReportAs) manifest[conn.setsReportAs] = conn.report();
  Object.assign(manifest, { problems, sheets: book.map((b) => ({ sheet: b.name, table: b.name.slice(2), rows: b.rows.length - 1, header: b.rows[0], source: t.srcKey || 'src' })), patches, renamed, refused, notes });
  return { book, manifest, provenance: prov };
}

// the field check (§ENGINE-SPEC §2): every "$Field" a block reads from a TOP-LEVEL source set, against the connector's model — a field the source lacks is NAMED, never guessed
export function fieldCheck(t, model) {
  // a lookup's key and answer (args 1 and 3) are read on ANOTHER sheet's rows, a with's expression on the row it names: not this set's fields
  const used = {}, add = (set, e) => { const walk = (x) => { if (typeof x === 'string' && /^\$[A-Za-z_]/.test(x)) (used[set] = used[set] || new Set()).add(x.slice(1));
    else if (x && typeof x === 'object' && !Array.isArray(x) && x.lookup) walk(x.lookup[2]); else if (x && typeof x === 'object' && !Array.isArray(x) && x.with) walk(x.with[0]);
    else if (x && typeof x === 'object' && !Array.isArray(x) && (x.each || x.filter || x.sortBy)) { const a = x.each || x.filter || x.sortBy; walk(a[0]); }   // the 2nd argument runs on the elements, not on this set's rows
    else if (x && typeof x === 'object') Object.values(x).forEach(walk); }; walk(e); };
  Object.keys(t.entities).forEach((sheet) => (Array.isArray(t.entities[sheet]) ? t.entities[sheet] : [t.entities[sheet]]).forEach((b) => {
    if (typeof b.from === 'string') add(b.from, [b.where, b.refuse, b.fields, b.prov]); }));
  const out = [];
  Object.keys(used).forEach((set) => used[set].forEach((f) => { const m = model[set]; out.push({ set, field: f, known: !!m, ok: !m || m.includes(f) }); }));
  return out;
}
