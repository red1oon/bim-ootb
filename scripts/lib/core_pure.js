// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — SPEC: bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md Part A (A3 W-CORE-PURE SPEC; decisions A-1, A-4, A-7) + §F.35.
// The ONE scanner and the ONE list for "a core file reads a clock, random numbers or the network itself instead of the installed edge".
// Used by erp/tests/witness_core_pure.js (CI) and by X0 Navigator (the warning in the editor). Dev-side only: nothing here reaches the browser.
// A parser scan (espree), never a regex: a comment or a string that only mentions Date.now() is not a call.
'use strict';
const path = require('path');
const espree = require(path.join(__dirname, '..', '..', 'node_modules', 'espree'));

// The agreed core list (A-1), as git pathspecs: a new file under one of them is core with no edit here. In a git pathspec `*` also crosses `/`.
const CORE = ['erp/processes/*.js', 'erp/callouts/*.js', 'erp/ad_callout.js', 'erp/doc_poster.js', 'erp/model_*.js', 'erp/rule_fold.js', 'erp/crud_core.js',
  'viewer/cpm_schedule.js', 'viewer/schedule_*.js', 'common/room_graph.js'];
const NOT_CORE = /(^|\/)tests?\/|(^|\/)witness_[^/]*\.js$/;
const CORE_RE = CORE.map(p => new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$'));
/** Is this repo-relative path (forward slashes) a core file? */
const isCore = rel => !NOT_CORE.test(rel) && CORE_RE.some(re => re.test(rel));

// Sets, not plain objects: a plain object also answers to 'constructor', 'toString', 'valueOf'.
const BAN_CALL = new Set(['Date.now', 'performance.now', 'Math.random', 'crypto.randomUUID', 'crypto.getRandomValues', 'navigator.sendBeacon', 'fetch', 'Date']);
const BAN_NEW = new Set(['XMLHttpRequest', 'WebSocket', 'EventSource']);
const HOSTS = new Set(['window', 'globalThis', 'self', 'global']);   // window.fetch(), globalThis.crypto.randomUUID() are the same calls
const STORE = new Set(['localStorage', 'sessionStorage', 'indexedDB']);
const KIND = { 'Date.now': 'clock', 'performance.now': 'clock', Date: 'clock', 'new Date': 'clock', 'Math.random': 'random', 'crypto.randomUUID': 'random',
  'crypto.getRandomValues': 'random', fetch: 'network', 'navigator.sendBeacon': 'network', XMLHttpRequest: 'network', WebSocket: 'network', EventSource: 'network' };

/**
 * Parse one source text and report its forbidden calls (A-7: values only) and its INFO counts.
 * @param {string} src - JavaScript source.
 * @returns {{parsed:boolean, hits:Array<{call:string, kind:'clock'|'random'|'network', line:number, col:number, endLine:number, endCol:number}>,
 *   storage:number, document:number, console:number}} line is 1-based, col 0-based (espree's loc).
 */
function scan(src) {
  if (src.startsWith('#!')) src = '//' + src;
  let ast = null;
  for (const sourceType of ['script', 'module']) {
    try { ast = espree.parse(src, { ecmaVersion: 'latest', sourceType, loc: true }); break; } catch (e) { ast = null; }
  }
  const r = { parsed: !!ast, hits: [], storage: 0, document: 0, console: 0 };
  if (!ast) return r;
  // a.b.c with no computed step -> "a.b.c"; anything else -> ''
  const chain = n => n.type === 'Identifier' ? n.name
    : (n.type === 'MemberExpression' && !n.computed && n.property.type === 'Identifier' && chain(n.object)) ? chain(n.object) + '.' + n.property.name : '';
  const bare = c => { const p = c.split('.'); while (p.length > 1 && HOSTS.has(p[0])) p.shift(); return p.join('.'); };
  const hit = (call, key, n) => r.hits.push({ call, kind: KIND[key], line: n.loc.start.line, col: n.loc.start.column, endLine: n.loc.end.line, endCol: n.loc.end.column });
  (function walk(n) {
    if (!n || typeof n.type !== 'string') return;
    if (n.type === 'CallExpression') {
      const m = bare(chain(n.callee));
      if (BAN_CALL.has(m)) hit(m + '()', m, n);
    } else if (n.type === 'NewExpression') {
      const m = bare(chain(n.callee));
      if (m === 'Date' && n.arguments.length === 0) hit('new Date()', 'new Date', n);
      else if (BAN_NEW.has(m)) hit('new ' + m, m, n);
    } else if (n.type === 'Identifier') {
      if (STORE.has(n.name)) r.storage++; else if (n.name === 'document') r.document++; else if (n.name === 'console') r.console++;
    }
    if (n.type === 'MemberExpression' && !n.computed) {            // x.document is a field of x, x.localStorage is the store
      walk(n.object); if (n.property.type === 'Identifier' && STORE.has(n.property.name)) r.storage++; return;
    }
    if (n.type === 'Property' && !n.computed) { walk(n.value); return; }   // { console: 1 } is a key, not a use
    for (const k in n) { if (k === 'loc' || k === 'range') continue; const v = n[k]; if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') walk(v); }
  })(ast);
  return r;
}

/** What to use instead, one short sentence per kind (the editor warning and the witness share the wording). */
const ADVICE = {
  clock: 'ask the installed edge: Env.edge().nowMs() / the transaction env (Env.nowStamp(env)); for a timing, Env.elapsed()',
  random: 'ask the installed edge for the id: Env.edge().uuid() (the edge records it, so a replay reads the same value)',
  network: 'a core file does no network; the shell fetches and hands the data in',
};

module.exports = { CORE, isCore, scan, ADVICE };
