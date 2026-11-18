#!/usr/bin/env node
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — WITNESS W-CODEFACTS-CORE-PURE (bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md §F.35, bim-ootb #3207).
// Read the log after every run: exit code is not evidence. Verdict line: §CODEFACTS_CORE_PURE_W core_files= judged= failed= verdict=PASS|FAIL|INCONCLUSIVE.
// ISSUE THIS PROVES OR DISPROVES: "a clock, random or network call in a core file says nothing in the editor until CI's W-CORE-PURE runs".
// POPULATION: EVERY core file of this checkout, listed HERE by `git ls-files <the A-1 pathspecs>` (the independent list, not the
//   extension's own answer), each opened as committed through the real extension on a `vscode` stub; and EVERY tracked .js for the list check.
// RED CONTROLS: a planted Date.now() in a real core file → exactly ONE warning on that line and column; a planted fetch() → one more, kind
//   network; the same text in a comment → none; the same planted call in a file outside the list (erp/kernel_ops.js) → none.
// INCONCLUSIVE: the list is empty, or the shared scanner cannot load (no node_modules).
// Read-only on this checkout: edited texts are document stubs, never written. Not proven: how VS Code draws the underline.
// Command: node devtools/vscode/code-facts/tests/witness_codefacts_core_pure.js
'use strict';
const fs = require('fs'), path = require('path'), cp = require('child_process'), os = require('os');
const ROOT = path.resolve(__dirname, '..', '..', '..', '..'), EXT = path.resolve(__dirname, '..');
let fail = 0, judged = 0;
const check = (label, cond) => { judged++; console.log('  ' + (cond ? 'PASS ' : 'FAIL ') + label); if (!cond) fail++; };

let P;
try { P = require(path.join(ROOT, 'scripts', 'lib', 'core_pure.js')); }
catch (e) { console.log('§CODEFACTS_CORE_PURE_W core_files=0 judged=0 failed=0 verdict=INCONCLUSIVE reason="' + String(e.message).split('\n')[0] + '"'); process.exit(1); }
const ls = args => cp.execFileSync('git', ['ls-files', ...args], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 }).split('\n').filter(Boolean);
const core = ls(P.CORE).filter(f => !/(^|\/)tests?\//.test(f) && !/(^|\/)witness_[^/]*\.js$/.test(f));   // git's own pathspec matching
if (!core.length) { console.log('§CODEFACTS_CORE_PURE_W core_files=0 judged=0 failed=0 verdict=INCONCLUSIVE reason="git ls-files returned no core file"'); process.exit(1); }

const { reg, restore } = require('./vscode_stub').install(ROOT);
const ext = require(path.join(EXT, 'extension.js'));
const api = ext.activate({ subscriptions: [], extensionPath: EXT, storageUri: { fsPath: fs.mkdtempSync(path.join(os.tmpdir(), 'code-facts-core-pure-')) } });
const docOf = (abs, text) => { const L = text.split('\n'); return { uri: { fsPath: abs, scheme: 'file' }, getText: () => text, lineAt: i => ({ text: L[i] }) }; };
const diag = () => reg.diags['code-facts-core-pure'];
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

// C1: every core file, as committed: no warning.
const dirty = [];
for (const f of core) { const h = api.judgeCorePure(docOf(path.join(ROOT, f), read(f))); if (!Array.isArray(h) || h.length) dirty.push(f + '=' + (Array.isArray(h) ? h.length : 'not judged')); }
if (dirty.length) console.log('    ' + dirty.slice(0, 8).join(' | '));
check('C1 every core file as committed (' + core.length + ') is judged and gives no warning', dirty.length === 0 && diag().m.size === 0);

// C2: the extension's list is git's list, over every tracked .js.
const coreSet = new Set(core), all = ls(['*.js']), wrong = all.filter(f => P.isCore(f) !== coreSet.has(f));
if (wrong.length) console.log('    ' + wrong.slice(0, 8).join(' | '));
check('C2 isCore() equals `git ls-files <pathspecs>` for every tracked .js (' + all.length + ' files, ' + wrong.length + ' differ)', all.length > core.length && wrong.length === 0);

// C3: red — a planted call in a real core file.
const subj = core.find(f => /InvoiceGenerate\.js$/.test(f)) || core[0], abs = path.join(ROOT, subj), text = read(subj);
const base = text.split('\n').length, plantLine = base;   // 0-based index of the first appended line (text ends with a newline)
const planted = text + (text.endsWith('\n') ? '' : '\n') + ';(function () { var t = Date.now(); return t; })();\n';
const col = planted.split('\n')[planted.split('\n').length - 2].indexOf('Date.now()');
const h1 = api.judgeCorePure(docOf(abs, planted)), d1 = diag().m.get(abs) || [];
check('C3 RED: a planted Date.now() in ' + subj + ' → ONE warning on its line and column (' + (h1 || []).map(x => x.call + '@' + x.line + ':' + x.col).join(',') + ')',
  Array.isArray(h1) && h1.length === 1 && h1[0].kind === 'clock' && d1.length === 1 && d1[0].range.start.line === planted.split('\n').length - 2 && d1[0].range.start.character === col && /Date\.now\(\)/.test(d1[0].message) && /W-CORE-PURE/.test(d1[0].message));
const h2 = api.judgeCorePure(docOf(abs, planted + ';(function () { return fetch("x"); })();\n')), d2 = diag().m.get(abs) || [];
check('C3 RED: a planted fetch() too → TWO warnings, the second kind network (' + (h2 || []).map(x => x.kind).join(',') + ')', Array.isArray(h2) && h2.length === 2 && h2[1].kind === 'network' && d2.length === 2 && d2[1].code === 'code-facts.core-pure.network');
api.judgeCorePure(docOf(abs, text));
check('C3 restoring the text clears the warning', !diag().m.has(abs));

// C4: not a call, or not a core file.
const h3 = api.judgeCorePure(docOf(abs, text + '\n// var t = Date.now(); fetch("x");\nvar s = "Math.random() new Date()";\n'));
check('C4 the same text in a comment and in a string gives no warning', Array.isArray(h3) && h3.length === 0 && !diag().m.has(abs));
const outside = 'erp/kernel_ops.js', oAbs = path.join(ROOT, outside), oPlanted = read(outside) + '\n;(function () { return Date.now(); })();\n';
const h4 = api.judgeCorePure(docOf(oAbs, oPlanted));
check('C4 RED (scope): the same planted call in ' + outside + ' (outside the list; the bare scan finds ' + P.scan(oPlanted).hits.length + ') gives no warning', h4 === null && !diag().m.has(oAbs) && P.scan(oPlanted).hits.length > 0 && !P.isCore(outside));
check('C4 a broken file mid-edit (does not parse) gives no warning and does not throw', api.judgeCorePure(docOf(abs, text + '\nfunction ( {')) === null && !diag().m.has(abs));
check('the save and open handlers are registered and do not throw on a core file', (() => { try { reg.onSave(docOf(abs, planted)); const n = (diag().m.get(abs) || []).length; reg.onSave(docOf(abs, text)); return n === 1 && !diag().m.has(abs); } catch (e) { return false; } })());

if (typeof restore === 'function') restore();
console.log(`§CODEFACTS_CORE_PURE_W core_files=${core.length} tracked_js=${all.length} judged=${judged} failed=${fail} verdict=${fail ? 'FAIL' : 'PASS'}`);
process.exit(fail ? 1 : 0);
