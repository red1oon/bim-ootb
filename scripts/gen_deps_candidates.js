#!/usr/bin/env node
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — SPEC: bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md Part B, "B1 BUILD SPEC" §3 (bim-ootb #3244;
//   owner B-5: "a tool proposes, a person confirms"; B1-Q3: the session cites file:line for each order edge, the owner confirms).
// ISSUE: nothing records which module needs which. Load order is tag order, and nobody can tell a needed order from a lucky one.
// WHAT:  reads every JS module of one app (the module list comes from gen_manifest.js's buildApp, the same reader B0 proved) plus the
//        app pages' inline script bodies, WITH A PARSER (espree + eslint-scope), and proposes dependency edges:
//          R -> P  when R reads a name N that exactly one other module P publishes;
//          R -> P  when R imports / importScripts P by a literal path.
//        A module PUBLISHES N when it assigns window.N / globalThis.N / self.N / top-level this.N (or through an IIFE parameter bound
//        to one of those) or declares N at the top level of a classic script. It READS N when N is a free identifier or window.N in it.
//        A name with 2+ publishers (a shared namespace such as `Bonsai`) gives no edge by itself: the tool goes one level down (N.x
//        written by one module, read by another) and prints what is still unresolved as §DEPS_AMBIGUOUS.
//        WHEN the read happens is the class (strongest read wins): load = top level, in an IIFE, or in the factory handed to an IIFE
//        (UMD), so the publisher must already have run; call = inside any other function, so only "exists by call time" matters;
//        -guarded = under typeof, left of && / || / ??, in an if / ?: / while test, optional-chained, inside try, or inside the right
//        of && / the branch of an if / ?: whose test mentions the same name.
//        Dev-side only. It WRITES NOTHING into the tree; it never edits a manifest (a person moves each candidate into deps / uses / notDeps).
// USE:   node scripts/gen_deps_candidates.js <app> [--root DIR] [--out FILE] [--only load|order]
// EXIT:  0 ran and printed §DEPS_SUMMARY · 1 a module failed to parse, the app has no modules, or bad arguments
// Read the log after every run: the §DEPS_* lines are the result, the exit code is not.
// Witness: scripts/tests/witness_deps_candidates.js (W-DEPS-CAND).
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const NM = path.join(__dirname, '..', 'node_modules');
const espree = require(path.join(NM, 'espree')), escope = require(path.join(NM, 'eslint-scope'));
const KEYS = require(path.join(NM, 'eslint-visitor-keys')).KEYS;
const R = require('./lib/page_refs.js');
const P = path.posix;

const GLOBS = new Set(['window', 'globalThis', 'self']);
const SKIP = /(^|\/)(lib|node_modules)\/|\.min\.js$/;
const RANK = { load: 0, 'load-guarded': 1, import: 0, call: 2, 'call-guarded': 3 };
const FORCES_ORDER = new Set(['load', 'load-guarded', 'import']);

function parse(src) {
  for (const sourceType of ['script', 'module']) {
    try { return { ast: espree.parse(src, { ecmaVersion: 'latest', sourceType, range: true, loc: true }), sourceType }; } catch (e) { /* next */ }
  }
  return null;
}
const isFn = n => n && (n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression' || n.type === 'FunctionDeclaration');
const propName = m => !m.computed && m.property.type === 'Identifier' ? m.property.name
  : (m.computed && m.property.type === 'Literal' && typeof m.property.value === 'string' ? m.property.value : null);

/**
 * Facts of one source: what it publishes, what it reads (with class and line), member writes/reads, literal imports.
 * @param {string} src
 * @param {{lineBase?:number, module?:boolean}} [o] - lineBase: added to every line (inline body inside its page)
 * @returns {null|{publishes:Set<string>, reads:Map<string,{cls:string,line:number}>, mWrites:Set<string>,
 *          mReads:Map<string,{cls:string,line:number}>, bare:Map<string,{cls:string,line:number}>, imports:{spec:string,line:number}[], sourceType:string}}
 */
function facts(src, o) {
  o = o || {};
  const p = parse(src); if (!p) return null;
  const { ast } = p, sourceType = o.module ? 'module' : p.sourceType, lb = o.lineBase || 0;
  const sm = escope.analyze(ast, { ecmaVersion: 2022, sourceType, childVisitorKeys: KEYS, fallback: 'iteration' });
  const parent = new Map();
  (function up(n, par) {
    if (!n || typeof n.type !== 'string') return;
    if (par) parent.set(n, par);
    for (const k of KEYS[n.type] || Object.keys(n)) { const v = n[k]; if (Array.isArray(v)) v.forEach(c => up(c, n)); else if (v && typeof v === 'object') up(v, n); }
  })(ast, null);
  const refOf = new Map();   // Identifier node -> Reference
  for (const s of sm.scopes) for (const r of s.references) refOf.set(r.identifier, r);
  const g = sm.globalScope;
  const ownGlobals = new Set(sourceType === 'script' ? g.variables.filter(v => v.defs.length).map(v => v.name) : []);

  // IIFE detection (also the factory handed to an IIFE, and fn.call / fn.apply)
  const iifeCall = fn => {
    const q = parent.get(fn);
    if (q && (q.type === 'CallExpression' || q.type === 'NewExpression') && q.callee === fn) return q;
    if (q && q.type === 'MemberExpression' && q.object === fn && /^(call|apply)$/.test(propName(q) || '')) { const c = parent.get(q); if (c && c.type === 'CallExpression' && c.callee === q) return c; }
    return null;
  };
  const isIife = fn => !!iifeCall(fn) || (() => { const q = parent.get(fn); return q && q.type === 'CallExpression' && q.arguments.includes(fn) && isFn(q.callee) && !!iifeCall(q.callee); })();
  // `this` at the top level of a classic script, or inside IIFEs only, is the global object
  const topThis = n => { if (sourceType !== 'script') return false; for (let q = parent.get(n); q; q = parent.get(q)) { if ((q.type === 'FunctionExpression' || q.type === 'FunctionDeclaration') && !isIife(q)) return false; } return true; };
  // IIFE parameters bound to the global object
  const aliasVars = new Set();
  const isGlobalObj = n => !n ? false
    : n.type === 'Identifier' ? (GLOBS.has(n.name) && refOf.has(n) && !refOf.get(n).resolved) || (refOf.has(n) && aliasVars.has(refOf.get(n).resolved))
    : n.type === 'ThisExpression' ? topThis(n)
    : n.type === 'ConditionalExpression' ? isGlobalObj(n.consequent) || isGlobalObj(n.alternate)
    : n.type === 'LogicalExpression' ? isGlobalObj(n.left) || isGlobalObj(n.right) : false;
  for (let pass = 0; pass < 3; pass++) for (const s of sm.scopes) {
    const fn = s.block; if (!isFn(fn)) continue;
    let call = iifeCall(fn), args;
    if (call) args = call.callee === fn ? call.arguments : (propName(call.callee) === 'call' ? call.arguments.slice(1) : []);
    if (!call) continue;
    fn.params.forEach((pr, i) => { if (pr.type === 'Identifier' && isGlobalObj(args[i])) { const v = s.variables.find(x => x.name === pr.name); if (v) aliasVars.add(v); } });
  }
  // the name a node refers to as a GLOBAL: free identifier / own top-level classic declaration / window.N
  const globalName = n => {
    if (n.type === 'Identifier') { const r = refOf.get(n); if (!r) return null; if (!r.resolved || (r.resolved.scope === g && ownGlobals.has(n.name))) return GLOBS.has(n.name) ? null : n.name; return null; }
    if (n.type === 'MemberExpression' && isGlobalObj(n.object)) return propName(n);
    return null;
  };
  const mentions = (t, name) => { let hit = false; (function w(n) { if (hit || !n || typeof n.type !== 'string') return; if ((n.type === 'Identifier' || n.type === 'MemberExpression') && globalName(n) === name) { hit = true; return; } for (const k of KEYS[n.type] || []) { const v = n[k]; if (Array.isArray(v)) v.forEach(w); else if (v && typeof v === 'object') w(v); } })(t); return hit; };
  const classify = (node, name) => {
    let n = node, guarded = false;
    for (let q = parent.get(n); q; n = q, q = parent.get(q)) {
      if (q.type === 'UnaryExpression' && q.operator === 'typeof') guarded = true;
      else if (q.type === 'LogicalExpression') { if (q.left === n || (q.operator === '&&' && mentions(q.left, name))) guarded = true; }
      else if (q.type === 'IfStatement' || q.type === 'ConditionalExpression' || q.type === 'WhileStatement') { if (q.test === n || mentions(q.test, name)) guarded = true; }
      else if (q.type === 'ChainExpression' || (q.type === 'MemberExpression' && q.optional) || (q.type === 'CallExpression' && q.optional)) guarded = true;
      else if (q.type === 'TryStatement' && q.block === n) guarded = true;
      if (isFn(q) && !isIife(q)) return guarded ? 'call-guarded' : 'call';
    }
    return guarded ? 'load-guarded' : 'load';
  };
  const keep = (map, key, cls, node) => { const cur = map.get(key), line = node.loc.start.line + lb; if (!cur || RANK[cls] < RANK[cur.cls] || (RANK[cls] === RANK[cur.cls] && line < cur.line)) map.set(key, { cls, line }); };
  const isPlainAssignTarget = n => { const q = parent.get(n); return q && q.type === 'AssignmentExpression' && q.left === n && q.operator === '='; };

  const publishes = new Set(ownGlobals), reads = new Map(), mWrites = new Set(), mReads = new Map(), bare = new Map(), imports = [];
  (function w(n) {
    if (!n || typeof n.type !== 'string') return;
    if (n.type === 'MemberExpression') {
      const N = isGlobalObj(n.object) ? propName(n) : null;
      if (N) { if (isPlainAssignTarget(n) || (parent.get(n).type === 'AssignmentExpression' && parent.get(n).left === n)) publishes.add(N); if (!isPlainAssignTarget(n)) keep(reads, N, classify(n, N), n); }
      const base = n.object.type === 'Identifier' || n.object.type === 'MemberExpression' ? globalName(n.object) : null, x = propName(n);
      if (base && x) { if (isPlainAssignTarget(n)) mWrites.add(base + '.' + x); else keep(mReads, base + '.' + x, classify(n, base), n); }
    }
    if (n.type === 'CallExpression') {
      const c = n.callee;
      if (c.type === 'MemberExpression' && c.object.type === 'Identifier' && c.object.name === 'Object' && propName(c) === 'assign' && n.arguments.length > 1) {
        const t = n.arguments[0], base = t && (t.type === 'Identifier' || t.type === 'MemberExpression') ? (isGlobalObj(t) ? '' : globalName(t)) : null;
        for (const a of n.arguments.slice(1)) if (a.type === 'ObjectExpression') for (const pr of a.properties) {
          const k = pr.type === 'Property' ? (pr.key.type === 'Identifier' && !pr.computed ? pr.key.name : (pr.key.type === 'Literal' ? String(pr.key.value) : null)) : null;
          if (!k) continue; if (base === '') publishes.add(k); else if (base) mWrites.add(base + '.' + k);
        }
      }
      if (c.type === 'Identifier' && c.name === 'importScripts') n.arguments.forEach(a => { if (a.type === 'Literal' && typeof a.value === 'string') imports.push({ spec: a.value, line: a.loc.start.line + lb }); });
    }
    if ((n.type === 'ImportDeclaration' || n.type === 'ExportAllDeclaration' || n.type === 'ExportNamedDeclaration' || n.type === 'ImportExpression') && n.source && n.source.type === 'Literal') imports.push({ spec: n.source.value, line: n.loc.start.line + lb });
    for (const k of KEYS[n.type] || []) { const v = n[k]; if (Array.isArray(v)) v.forEach(w); else if (v && typeof v === 'object') w(v); }
  })(ast);
  for (const r of g.through) {
    const id = r.identifier, N = id.name;
    if (GLOBS.has(N)) continue;
    if (r.resolved && !(r.resolved.scope === g)) continue;
    if (r.isWrite() && !r.isRead()) { if (sourceType === 'script') publishes.add(N); continue; }   // an implicit global made here
    const q = parent.get(id);
    if (!(q && q.type === 'MemberExpression' && q.object === id)) keep(bare, N, classify(id, N), id);
    keep(reads, N, classify(id, N), id);
  }
  for (const N of ownGlobals) reads.delete(N);
  return { publishes, reads, mWrites, mReads, bare, imports, sourceType };
}

/**
 * Candidate edges for one app.
 * @param {string} root
 * @param {string} app
 * @param {{manifest?:object}} [o] - a committed modules.json (B1) for the state column
 * @returns {{edges:object[], lines:string[], summary:object, fails:string[]}}
 */
function candidates(root, app, o) {
  o = o || {};
  const GM = require('./gen_manifest.js');
  const { manifest: m, frames } = GM.buildApp(root, app);
  const fails = [], readers = [], skipped = [];
  for (const mod of m.modules) {
    const f = mod.file;
    if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(f) || !/\.m?js$/.test(f) || SKIP.test(f)) { skipped.push(f); continue; }
    const src = fs.readFileSync(path.join(root, f), 'utf8'), x = facts(src, { module: /\.mjs$/.test(f) });
    if (!x) { fails.push('cannot parse ' + f); continue; }
    readers.push({ id: f, file: f, dir: P.dirname(f), x, mod });
  }
  let inlineN = 0;
  for (const pg of m.pages) {
    const src = fs.readFileSync(path.join(root, pg), 'utf8'), h = R.readHtml(src);
    h.inline.forEach((b, i) => {
      if (b.type && !/javascript|module/i.test(b.type)) return;
      const lineBase = src.slice(0, b.start).split('\n').length - 1, isMod = /module/i.test(b.type);
      const x = facts(src.slice(b.start, b.end), { lineBase, module: isMod });
      if (!x) { fails.push('cannot parse ' + pg + ' inline #' + i); return; }
      inlineN++;
      readers.push({ id: pg + '#inline' + i, file: pg, dir: P.dirname(pg), x, inline: { page: pg, start: b.start, deferred: isMod } });
    });
  }
  const pubBy = new Map(), mwBy = new Map();
  for (const r of readers) { if (r.inline) continue; for (const N of r.x.publishes) (pubBy.get(N) || pubBy.set(N, []).get(N)).push(r.id); for (const k of r.x.mWrites) (mwBy.get(k) || mwBy.set(k, []).get(k)).push(r.id); }
  const modSet = new Set(m.modules.map(x => x.file));
  const tagPos = (file, page) => { for (const mod of m.modules) if (mod.file === file) { const s = mod.sites.find(z => z.kind === 'tag' && z.in === page); if (s) return frames.get(page).slots[s.at].start; } return null; };
  const edges = new Map(), ambig = [];
  const add = (from, to, cls, name, line, file) => {
    const k = from + '\u0000' + to, e = edges.get(k) || { from, to, cls, names: new Set(), at: file + ':' + line, rank: RANK[cls] };
    if (RANK[cls] < e.rank) { e.cls = cls; e.rank = RANK[cls]; e.at = file + ':' + line; }
    if (name) e.names.add(name); edges.set(k, e);
  };
  for (const r of readers) {
    const self = r.inline ? null : r.id;
    for (const [N, rd] of r.x.reads) {
      const pubs = (pubBy.get(N) || []).filter(id => id !== self);
      if (!pubs.length) continue;
      const mine = r.x.publishes.has(N);
      if (pubs.length === 1 && !mine) { add(r.id, pubs[0], rd.cls, N, rd.line, r.file); continue; }
      // shared name: one level down
      let resolved = 0, unresolved = 0;
      for (const [k, mr] of r.x.mReads) {
        if (k.slice(0, k.indexOf('.')) !== N) continue;
        const ws = (mwBy.get(k) || []).filter(id => id !== self);
        if (ws.length === 1) { add(r.id, ws[0], mr.cls, k, mr.line, r.file); resolved++; }
        else if (!(r.x.mWrites.has(k) && ws.length === 0)) unresolved++;
      }
      if (unresolved || (!resolved && r.x.bare.has(N))) ambig.push({ from: r.id, name: N, publishers: pubs.length + (mine ? 1 : 0), resolved, unresolved });
    }
    for (const im of r.x.imports) {
      if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(im.spec)) continue;
      add(r.id, P.normalize(P.join(r.dir, im.spec.split('?')[0])), 'import', null, im.line, r.file);
    }
  }
  const state = (from, to) => {
    const mf = o.manifest, rec = mf && (mf.modules && !Array.isArray(mf.modules) ? mf.modules[from] : null) || (mf && mf.inline ? mf.inline[from] : null);
    if (!rec) return 'new';
    for (const s of ['deps', 'uses', 'notDeps']) if ((rec[s] || []).includes(to)) return s;
    return 'new';
  };
  const out = [...edges.values()].map(e => {
    let order = 'n/a';
    const R0 = readers.find(r => r.id === e.from);
    for (const pg of m.pages) {
      const b = tagPos(e.to, pg); if (b == null) continue;
      const a = R0.inline ? (R0.inline.page === pg ? (R0.inline.deferred ? Infinity : R0.inline.start) : null) : tagPos(e.from, pg);
      if (a == null) continue;
      order = b < a ? 'ok' : 'AGAINST'; break;
    }
    return { from: e.from, to: e.to, cls: e.cls, names: [...e.names].sort(), at: e.at, order, module: modSet.has(e.to), state: state(e.from, e.to) };
  }).sort((a, b) => a.from < b.from ? -1 : a.from > b.from ? 1 : a.to < b.to ? -1 : a.to > b.to ? 1 : 0);
  const sha = crypto.createHash('sha256').update(out.map(e => [e.from, e.to, e.cls, e.names.join(',')].join('|')).join('\n')).digest('hex');
  const c = k => out.filter(e => e.cls === k).length;
  const summary = { app, modules: m.modules.length, read: readers.length - inlineN, inline_bodies: inlineN, skipped: skipped.length, parse_fail: fails.length,
    candidates: out.length, load: c('load'), load_guarded: c('load-guarded'), call: c('call'), call_guarded: c('call-guarded'), import: c('import'),
    import_not_module: out.filter(e => e.cls === 'import' && !e.module).length, forces_order: out.filter(e => FORCES_ORDER.has(e.cls)).length,
    against: out.filter(e => e.order === 'AGAINST').length, against_load_unguarded: out.filter(e => e.order === 'AGAINST' && e.cls === 'load').length,
    ambiguous: ambig.length, published: pubBy.size, published_by_2plus: [...pubBy.values()].filter(v => v.length > 1).length,
    new: out.filter(e => e.state === 'new').length, reviewed: out.filter(e => e.state !== 'new').length, sha };
  const lines = [];
  for (const e of out) lines.push(`§DEPS_CAND from=${e.from} to=${e.to} class=${e.cls} names=${e.names.join(',') || '-'} at=${e.at} order=${e.order}${e.module ? '' : ' module=no'} state=${e.state}`);
  for (const a of ambig) lines.push(`§DEPS_AMBIGUOUS from=${a.from} name=${a.name} publishers=${a.publishers} members_resolved=${a.resolved} members_unresolved=${a.unresolved}`);
  lines.push('§DEPS_SUMMARY ' + Object.entries(summary).map(([k, v]) => k + '=' + v).join(' '));
  return { edges: out, ambig, lines, summary, fails };
}

module.exports = { facts, candidates, FORCES_ORDER };

if (require.main === module) {
  const argv = process.argv.slice(2), app = argv.find(a => !a.startsWith('--') && !['--root', '--out', '--only'].includes(argv[argv.indexOf(a) - 1]));
  const opt = k => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  const root = path.resolve(opt('--root') || path.join(__dirname, '..'));
  if (!app) { console.error('usage: node scripts/gen_deps_candidates.js <app> [--root DIR] [--out FILE] [--only load|order]'); process.exit(1); }
  const mf = path.join(root, app, 'modules.json');
  const r = candidates(root, app, { manifest: fs.existsSync(mf) ? JSON.parse(fs.readFileSync(mf, 'utf8')) : null });
  r.fails.forEach(f => console.log('§DEPS_FAIL ' + f));
  const only = opt('--only');
  r.lines.filter(l => !only || !l.startsWith('§DEPS_CAND') || (only === 'load' ? / class=(load|load-guarded|import) / : / order=AGAINST/).test(l)).forEach(l => console.log(l));
  if (opt('--out')) {
    const out = path.resolve(opt('--out'));
    if (!path.relative(root, out).startsWith('..')) { console.log('§DEPS_ERR --out must be outside the tree (this tool writes nothing into it)'); process.exit(1); }
    fs.writeFileSync(out, JSON.stringify({ summary: r.summary, edges: r.edges, ambiguous: r.ambig }, null, 1)); console.log('§DEPS_OUT file=' + out);
  }
  process.exit(r.fails.length || !r.summary.modules ? 1 : 0);
}
