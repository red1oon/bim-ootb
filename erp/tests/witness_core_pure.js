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
// the ONE scanner and the ONE list (also used by X0 Navigator's editor warning, §F.35)
const { CORE, scan } = require(path.join(HERE, 'scripts', 'lib', 'core_pure.js'));
const files = cp.execSync('git ls-files ' + CORE.map(p => "'" + p + "'").join(' '), { cwd: ROOT }).toString().split('\n')
  .filter(f => f && !/(^|\/)tests?\//.test(f) && !/(^|\/)witness_[^/]*\.js$/.test(f));

const rows = files.map(f => {
  const r = scan(fs.readFileSync(path.join(ROOT, f), 'utf8'));
  r.hits.forEach(h => say('  §CORE_PURE_HIT file=' + f + ' line=' + h.line + ' call=' + h.call));
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
