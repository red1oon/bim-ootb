#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — SPEC (W-ED-TYPES), bim-compiler prompts/EDITOR_MAINTAINABILITY_STUDY.md §8.1 S6
// SCOPE: editor-only. Writes types/globals.gen.d.ts so VS Code's F12 / hover / autocomplete can follow
//        the browser globals the UMD modules publish. No page loads types/. Nothing at run time changes.
// WHY:   557 of 855 production files end `if (typeof module…) module.exports = X`. TypeScript then treats
//        the file as a CommonJS module, so `X` is not a global to the editor, and `X.member` jumps nowhere
//        (measured: `ADParser.init` in erp/ad_ui.js -> none). Declaring
//        `declare var X: typeof import("../erp/x.js")` gives the real target (-> erp/ad_parser.js:525).
// HOW:   parse every production .js with espree (ESLint's parser, so comments never count as code).
//        Candidates: `module.exports = NAME` or `<root|window|g|self|global|globalThis>.NAME = …` in a file with a
//        `module.exports`. TypeScript then keeps only those whose `typeof import(file)` has members (editor_blind = dropped).
//        Needs TypeScript as a parser-only dep: `npm i --no-save typescript@5.6.3` or TSLIB=<path>.
//        NAME is emitted only if another production file reads `NAME.` (token scan, upper bound).
//        A NAME published by 2+ files becomes a union, so F12 offers every definition (that is a real
//        duplicate and is listed in the header so it can be looked at).
// RUN:   node scripts/gen_global_types.js          (prints §ED_TYPES_GEN; rewrites the .d.ts)
//        node scripts/gen_global_types.js --check  (exit 1 if the committed file is stale)
'use strict';
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'types', 'globals.gen.d.ts');
const HAND = path.join(ROOT, 'types', 'erp-globals.d.ts');
let espree;
try { espree = require(path.join(ROOT, 'node_modules', 'espree')); }
catch (e) { console.error('§ED_TYPES_NEED_ESPREE run `npm ci` (espree ships with eslint)'); process.exit(3); }

const PROD_DIRS = /^(viewer|erp|modeller|common|capex|teams|bim)\//;
const ROOTS = new Set(['root', 'window', 'g', 'self', 'global', 'globalThis']);
const NOT_PROD = /\/(lib|tests|sqljs|vendor|node_modules)\/|\.min\.js$|witness|probe|spike|_test\.js$|(^|\/)test_|(^|\/)sw\.js$/;

const files = cp.execSync('git ls-files "*.js"', { cwd: ROOT }).toString().split('\n')
  .filter(f => f && PROD_DIRS.test(f) && !NOT_PROD.test(f)).sort();

function parse(src) {
  for (const sourceType of ['script', 'module']) {
    try { return espree.parse(src, { ecmaVersion: 'latest', sourceType }); } catch (e) { /* try next */ }
  }
  return null;
}
function walk(n, fn) {
  if (!n || typeof n.type !== 'string') return;
  fn(n);
  for (const k in n) {
    if (k === 'parent') continue;
    const v = n[k];
    if (Array.isArray(v)) v.forEach(x => walk(x, fn)); else if (v && typeof v === 'object') walk(v, fn);
  }
}
function isModuleExports(m) {
  return m && m.type === 'MemberExpression' && !m.computed && m.object.type === 'Identifier' &&
    m.object.name === 'module' && m.property.name === 'exports';
}

const publishers = new Map();   // NAME -> [file]
const srcOf = new Map();
let parseFail = 0, umd = 0;
for (const f of files) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  srcOf.set(f, src);
  const ast = parse(src);
  if (!ast) { parseFail++; continue; }
  // Candidate NAME: `module.exports = NAME`, or `<root|window|g|self|global|globalThis>.NAME = …` (any depth), in a file
  // that has a `module.exports =`. Names must start upper-case and be 3+ chars (single letters are local aliases).
  // Whether the editor can really follow a candidate is NOT guessed from the export shape — TypeScript decides (below).
  let hasExports = false; const names = new Set(); const top = new Set();
  for (const st of ast.body) {   // `module.exports = API` with a local API is not a browser global (seen: 8 comm/capex files)
    if (st.type === 'FunctionDeclaration' && st.id) top.add(st.id.name);
    if (st.type === 'VariableDeclaration') st.declarations.forEach(d => d.id.type === 'Identifier' && top.add(d.id.name));
  }
  walk(ast, n => {
    if (n.type !== 'AssignmentExpression' || n.operator !== '=') return;
    const L = n.left;
    if (isModuleExports(L)) {
      hasExports = true;
      if (n.right.type === 'Identifier' && /^[A-Z][\w$]{2,}$/.test(n.right.name) && top.has(n.right.name)) names.add(n.right.name);
    } else if (L.type === 'MemberExpression' && !L.computed && L.object.type === 'Identifier' &&
               ROOTS.has(L.object.name) && /^[A-Z][\w$]{2,}$/.test(L.property.name)) {
      names.add(L.property.name);
    }
  });
  if (!hasExports) continue;
  umd++;
  for (const nm of names) { if (!publishers.has(nm)) publishers.set(nm, []); publishers.get(nm).push(f); }
}

// keep NAME only if another production file reads `NAME.`
const emitted = [];
for (const [nm, pubs] of [...publishers].sort((a, b) => a[0].localeCompare(b[0]))) {
  const re = new RegExp('(^|[^.\\w$])' + nm.replace(/\$/g, '\\$') + '\\.[A-Za-z_$]');
  const reader = files.find(f => !pubs.includes(f) && re.test(srcOf.get(f)));
  if (reader) emitted.push({ nm, pubs });
}

// TypeScript decides: keep a candidate only if `typeof import("<file>")` has at least one property. An export made
// inside a UMD wrapper function is often invisible to TypeScript (empty type, F12 finds nothing); those are
// counted as `editor_blind` and left out, because declaring them would only move F12 to this file.
let ts; try { ts = require(process.env.TSLIB || 'typescript'); }
catch (e) { console.error('§ED_TYPES_NEED_TS npm i --no-save typescript@5.6.3  (or set TSLIB)'); process.exit(3); }
const probe = path.join(ROOT, 'types', '__probe.gen.d.ts');
const probeSrc = emitted.map((e, i) => e.pubs.map((p, j) => `declare var __p${i}_${j}: typeof import("../${p}");`).join('\n')).join('\n');
const opts = { allowJs: true, checkJs: false, noEmit: true, target: ts.ScriptTarget.ES2020, skipLibCheck: true };
const host = ts.createCompilerHost(opts);
const rf = host.readFile.bind(host), fe = host.fileExists.bind(host);
host.readFile = f => path.resolve(f) === probe ? probeSrc : rf(f);
host.fileExists = f => path.resolve(f) === probe || fe(f);
const prog = ts.createProgram([probe], opts, host); const chk = prog.getTypeChecker();
const psf = prog.getSourceFile(probe); const propCount = new Map();
for (const st of psf.statements) { const d = st.declarationList.declarations[0];
  propCount.set(d.name.text, chk.getTypeAtLocation(d.name).getProperties().length); }
let blind = 0;
for (let i = emitted.length - 1; i >= 0; i--) {
  const e = emitted[i]; const keep = e.pubs.filter((p, j) => (propCount.get(`__p${i}_${j}`) || 0) > 0);
  if (!keep.length) { blind++; emitted.splice(i, 1); } else e.pubs = keep;
}
const dups = emitted.filter(e => e.pubs.length > 1);
const lines = [
  '// GENERATED by scripts/gen_global_types.js — DO NOT EDIT. Regenerate: node scripts/gen_global_types.js',
  '// Editor-only (jsconfig.json). Never loaded by a page. Spec: bim-compiler prompts/EDITOR_MAINTAINABILITY_STUDY.md §8.1 S6.',
  '// Each browser global published by a UMD file points at that file, so F12 on `NAME.member` opens the real code.',
  `// ${emitted.length} globals from ${umd} UMD files; ${blind} more are published in a shape TypeScript cannot follow (left out).` + (dups.length ? ` ${dups.length} are published by more than one file (union, F12 lists every copy):` : ''),
  ...dups.map(e => `//   ${e.nm}: ${e.pubs.join(', ')}`),
  '',
  ...emitted.map(e => `declare var ${e.nm}: ${e.pubs.map(p => `typeof import("../${p}")`).join(' | ')};`),
  '',
];
const out = lines.join('\n');

// names now typed here must not also be `declare var NAME: any` in the hand file (a clash)
const handSrc = fs.readFileSync(HAND, 'utf8');
const gen = new Set(emitted.map(e => e.nm));
const handOut = handSrc.split('\n').filter(l => {
  const m = /^declare var ([\w$]+): any;\s*$/.exec(l);
  return !(m && gen.has(m[1]));
}).join('\n');
const removed = handSrc.split('\n').length - handOut.split('\n').length;

if (process.argv.includes('--check')) {
  const cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  const stale = cur !== out || handOut !== handSrc;
  console.log(`§ED_TYPES_GEN check stale=${stale ? 1 : 0}`);
  process.exit(stale ? 1 : 0);
}
fs.writeFileSync(OUT, out);
if (removed) fs.writeFileSync(HAND, handOut);
console.log(`§ED_TYPES_GEN files=${files.length} umd=${umd} parse_fail=${parseFail} published=${publishers.size} editor_blind=${blind} emitted=${emitted.length} multi_publisher=${dups.length} hand_any_removed=${removed}`);
