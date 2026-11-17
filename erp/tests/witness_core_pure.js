#!/usr/bin/env node
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — WITNESS W-CORE-PURE (bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md "A3 W-CORE-PURE SPEC"; decisions A-1, A-4, A-7; bim-ootb #3180).
// Read the log after every run: exit code is not evidence. Verdict line: §CORE_PURE files= parse_fail= forbidden= verdict=PASS|FAIL|INCONCLUSIVE.
// ISSUE THIS PROVES OR DISPROVES: "a core file reads a clock, random numbers or the network itself instead of the installed edge (Env.edge / CoreEdge)".
// POPULATION: the REAL source of every file of the agreed core list (A-1), taken by git pathspec, so a new file in it is judged with no edit here.
//   Tests are excluded. No exemption list.
// FAILS ON (A-7, values only): Date.now(), new Date() with no argument, Date() called, performance.now() (A-4) · Math.random(),
//   crypto.randomUUID(), crypto.getRandomValues() · fetch(), new XMLHttpRequest / WebSocket / EventSource, navigator.sendBeacon().
//   One §CORE_PURE_HIT line per hit.
// INFO ONLY (A-7): §CORE_PURE_INFO per file: references to localStorage / sessionStorage / indexedDB, `document`, `console` (for Part C).
// RED CONTROL (same run): a copy of the real erp/processes/InvoiceGenerate.js with a planted Date.now() gives 1 more hit, with a planted
//   performance.now() 1 more, with the same text in a comment and in a string 0 more. If the red control is wrong the verdict is INCONCLUSIVE.
// INCONCLUSIVE also when files=0 or any file fails to parse (it is listed, never dropped).
// The scan is a parser (espree), never a regex: comments and strings are not code.
// RED RUN on real code: OOTB=<a tree from before A3-CLOCK-2, bim-ootb #3168> must FAIL with the 4 calls it still had (ad_callout.js RUNTIME.now x1, callouts/sqlfn.js generate_uuid x3).
// Command: node erp/tests/witness_core_pure.js   (OOTB=<other tree> scans that tree with this scanner)
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process');
const HERE = path.join(__dirname, '..', '..'), ROOT = process.env.OOTB ? path.resolve(process.env.OOTB) : HERE, say = s => process.stdout.write(s + '\n');
const espree = require(path.join(HERE, 'node_modules', 'espree'));

const CORE = ['erp/processes/*.js', 'erp/callouts/*.js', 'erp/ad_callout.js', 'erp/doc_poster.js', 'erp/model_*.js', 'erp/rule_fold.js', 'erp/crud_core.js',
  'viewer/cpm_schedule.js', 'viewer/schedule_*.js', 'common/room_graph.js'];
const files = cp.execSync('git ls-files ' + CORE.map(p => "'" + p + "'").join(' '), { cwd: ROOT }).toString().split('\n')
  .filter(f => f && !/(^|\/)tests?\//.test(f) && !/(^|\/)witness_[^/]*\.js$/.test(f));

// Sets, not plain objects: a plain object also answers to 'constructor', 'toString', 'valueOf' (the first run counted those as storage).
const BAN_CALL = new Set(['Date.now', 'performance.now', 'Math.random', 'crypto.randomUUID', 'crypto.getRandomValues', 'navigator.sendBeacon', 'fetch', 'Date']);
const BAN_NEW = new Set(['XMLHttpRequest', 'WebSocket', 'EventSource']);
const HOSTS = new Set(['window', 'globalThis', 'self', 'global']);   // window.fetch(), globalThis.crypto.randomUUID() are the same calls
const STORE = new Set(['localStorage', 'sessionStorage', 'indexedDB']);

/**
 * Parse one source text and report its forbidden calls and its INFO counts.
 * @param {string} src - JavaScript source.
 * @returns {{parsed:boolean, hits:Array<[string,number]>, storage:number, document:number, console:number}}
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
  (function walk(n) {
    if (!n || typeof n.type !== 'string') return;
    if (n.type === 'CallExpression') {
      const m = bare(chain(n.callee));
      if (BAN_CALL.has(m)) r.hits.push([m + '()', n.loc.start.line]);
    } else if (n.type === 'NewExpression') {
      const m = bare(chain(n.callee));
      if (m === 'Date' && n.arguments.length === 0) r.hits.push(['new Date()', n.loc.start.line]);
      else if (BAN_NEW.has(m)) r.hits.push(['new ' + m, n.loc.start.line]);
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

const rows = files.map(f => {
  const r = scan(fs.readFileSync(path.join(ROOT, f), 'utf8'));
  r.hits.forEach(h => say('  §CORE_PURE_HIT file=' + f + ' line=' + h[1] + ' call=' + h[0]));
  say('  §CORE_PURE_INFO file=' + f + ' storage=' + r.storage + ' document=' + r.document + ' console=' + r.console + (r.parsed ? '' : ' PARSE_FAIL'));
  return { file: f, parsed: r.parsed, forbidden: r.hits.length, storage: r.storage, document: r.document, console: r.console };
});
const sum = k => rows.reduce((s, r) => s + r[k], 0);
say('  §CORE_PURE_INFO_TOTAL files=' + rows.length + ' storage=' + sum('storage') + ' document=' + sum('document') + ' console=' + sum('console'));

// red control: the real scanner on a copy of a real core file, four plants
const RED_FILE = 'erp/processes/InvoiceGenerate.js';
const redSrc = fs.readFileSync(path.join(ROOT, RED_FILE), 'utf8'), redBase = scan(redSrc).hits.length;
const red = [
  ['planted Date.now()', '\n;(function () { var t = Date.now(); return t; })();\n', 1],
  ['planted performance.now()', '\n;(function () { var t = performance.now(); return t; })();\n', 1],
  ['the same text in a comment', '\n// var t = Date.now(); var u = performance.now(); fetch("x"); new Date();\n/* Math.random() */\n', 0],
  ['a method named like Object.prototype is not a hit', '\n;(function (o) { return o.constructor.toString() + String(o.valueOf()) + toString(); })({});\n', 0],
  ['the same text in a string', '\n;(function () { return "Date.now() performance.now() Math.random() new Date()" + `fetch()`; })();\n', 0],
].map(c => { const got = scan(redSrc + c[1]).hits.length - redBase; say('  §CORE_PURE_RED case="' + c[0] + '" file=' + RED_FILE + ' extra_hits=' + got + ' expected=' + c[2] + ' ok=' + (got === c[2] ? 'Y' : 'N')); return got === c[2]; });
const redOk = red.every(Boolean);

const parseFail = rows.filter(r => !r.parsed), forbidden = sum('forbidden');
if (parseFail.length) say('  §CORE_PURE_PARSE_FAIL ' + parseFail.map(r => r.file).join(' '));
const { Witness } = require(path.join(HERE, 'witness_kit', 'contract.js'));
const res = Witness('CORE_PURE')
  .population(() => rows)
  .schema({ type: 'object', required: ['file', 'parsed', 'forbidden'], properties: { file: { type: 'string', minLength: 1 }, parsed: { const: true }, forbidden: { type: 'integer', minimum: 0 } } })
  .invariant('no core file calls a clock, random numbers or the network itself', rs => rs.every(r => r.forbidden === 0))
  .invariant('the scanner finds a planted call and ignores comments and strings', () => redOk)
  .redControl(rs => rs.map((r, i) => i === 0 ? Object.assign({}, r, { forbidden: scan(redSrc + '\n;var planted = Date.now();\n').hits.length - redBase }) : r))
  .run();
const verdict = (!rows.length || parseFail.length || !redOk) ? 'INCONCLUSIVE' : (forbidden > 0 || res.fail > 0) ? 'FAIL' : 'PASS';
say('§CORE_PURE files=' + rows.length + ' parse_fail=' + parseFail.length + ' forbidden=' + forbidden + ' red_control=' + (redOk ? 'detected' : 'BROKEN') + ' verdict=' + verdict);
if (verdict !== 'PASS') process.exitCode = 1;
