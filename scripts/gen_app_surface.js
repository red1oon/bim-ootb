#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — SPEC (W-APP-SURFACE)
// SCOPE: one pure report — walk the tree and emit internal/APP_SURFACE.md, an index of
//        every field on the viewer's god object: where it is WRITTEN and where it is READ.
// WHY:   the object is written as `A.foo` (modules are `setupX(A)`, §12.3) and read as
//        `APP.foo`. Same object, two spellings. So `grep 'APP.camera ='` returns NOTHING
//        and a newcomer concludes the field is undefined. With no build and no types, grep
//        is the only navigation there is — and a one-character alias breaks it. This
//        script is the symbol table the architecture never got.
// RULES (each is a case in tests/witness_app_surface.js):
//   R1 a name written `A.x =` or `APP.x =`   → listed with every write site
//   R2 a name only ever read                 → listed under PHANTOM (no writer found)
//   R3 vendored/minified/archive paths       → never scanned (not our code)
//   R4 counts in the header                  → recomputed each run, never hand-edited
//   R5 bare `A.x` counts ONLY in a file that binds A to APP (setupX(A) / = window.APP)
//   R5b `var A = APP;` inside `function setupX(APP)` is a binding too (viewer/grid_overlay.js; #2961: its writes showed as PHANTOM)
//   R5c the parts of a split file bind it as a later parameter: `function* __split_x(NF, A, …)`, and navigate_*.js as
//       `function init(A, nav)`. Both are bindings (#2974: 138 of 281 "phantoms" had a writer in such a file).
//   R11 a phantom that DOES have a same-named write through a local `A.`/`app.` the gate could not tie to the object is
//       listed a second time, under "untied write", with that site. The gate is a text rule and will miss a form again;
//       R11 makes the miss visible instead of calling a live field dead.
//   R6 same gate for the third spelling, lowercase `app.x` (time_machine.js writes this one)
//   R7 the "written at" column shows a PRODUCTION write site when one exists, never a test's
//   R8 this script and its witness are excluded — they quote `APP.x` in prose and would self-index
//   R10 a sub-folder that is itself a git checkout → never scanned (a copy of this tree, not this tree)
//   R9 comments are stripped before matching. A regex cannot tell code from prose, and this
//      tree documents its own fields IN prose ("set A._bloomOff = false to try it again").
//      R9 uses the single-pass tokenizer scripts/lib/js_scan.js (a `/*` in a `//` line no longer hides code).
//      Without R9 those 30 sentences enter the index as definitions. R8 patched one instance
//      of this class (the tool indexing itself); R9 closes the class.
// NON-INVENT: every line number is a real match; nothing is inferred or carried over.
// Run: node scripts/gen_app_surface.js   (writes internal/APP_SURFACE.md, prints the counts)
'use strict';
const fs = require('fs'), path = require('path');
const { scan } = require('./lib/js_scan');

// R8: the tool must not index itself — both files quote `APP.x` in their own spec text.
const SKIP = ['/lib/', '/node_modules/', '.min.', 'web-ifc', 'qrcode', '/archive/', '/.git',
  'scripts/gen_app_surface.js', 'tests/witness_app_surface.js'];
const ROOT = path.resolve(process.env.APPSURF_ROOT || path.join(__dirname, '..'));
const OUT_DIR = process.env.APPSURF_OUT || path.join(ROOT, 'internal');

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (SKIP.some(s => p.includes(s))) continue;
    if (e.isDirectory()) {
      // R10: a sub-folder that is itself a git checkout (an agent worktree under .claude/worktrees/, a nested clone)
      // is a COPY of this tree, not this tree. Indexing it made 1,082 rows cite the copy as the write site (#2930).
      if (fs.existsSync(path.join(p, '.git'))) continue;
      walk(p, out);
    } else if (/\.(js|mjs|html)$/.test(e.name)) out.push(p);
  }
  return out;
}

// `A` counts as the god object ONLY in a file that actually binds it to APP —
// a `setupX(A)`/`(A)` module entry, an explicit `= window.APP`, or a declared `var A = APP` (R5b). Without this
// gate, any unrelated local named `A` pollutes the index (R5).
const BINDS_A = /function\s+setup\w*\s*\(\s*A\s*[,)]|\(\s*A\s*\)\s*(?:=>|\{)|\bA\s*=\s*window\.APP\b|\b(?:var|let|const)\s+A\s*=\s*APP\b|function\s*\*?\s*(?:__split_\w+|init)\s*\((?:\s*\w+\s*,)*\s*A\s*[,)]/;
const BINDS_app = /function\s+\w*\s*\(\s*app\s*[,)]|\bapp\s*=\s*window\.APP\b|\bvar\s+app\s*=\s*(?:window\.)?APP\b/;
const W_APP = /(?<![\w.])window\.APP\.([A-Za-z_]\w*)\s*=(?!=)|(?<![\w.])APP\.([A-Za-z_]\w*)\s*=(?!=)/g;
const W_A   = /(?<![\w.])A\.([A-Za-z_]\w*)\s*=(?!=)/g;
const W_app = /(?<![\w.])app\.([A-Za-z_]\w*)\s*=(?!=)/g;
const R_APP = /(?<![\w.])(?:window\.)?APP\.([A-Za-z_]\w*)/g;
const R_A   = /(?<![\w.])A\.([A-Za-z_]\w*)/g;
const R_app = /(?<![\w.])app\.([A-Za-z_]\w*)/g;

const writes = new Map(), reads = new Map(), untied = new Map();   // untied: R11
const add = (m, k, v) => (m.get(k) || m.set(k, []).get(k)).push(v);

const files = walk(ROOT, []);
for (const f of files) {
  const rel = path.relative(ROOT, f);
  // R9: blank out comment bodies, preserving line count and column offsets so every
  // reported file:line still points at the real line in the untouched file.
  const raw = fs.readFileSync(f, 'utf8');
  // One tokenizer pass (scripts/lib/js_scan.js): a `/*` inside a `//` line comment must not open a
  // block comment (NEURO contract §19.2). APPSURF_OLD_STRIP=1 restores the old two-regex order (falsifier).
  const src = process.env.APPSURF_OLD_STRIP === '1' ? raw
    .replace(/\/\*[\s\S]*?\*\//g, c => c.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"\\])\/\/[^\n]*/g, (m, p) => p + ' '.repeat(m.length - p.length))
    : scan(raw).code;
  const aliased = BINDS_A.test(src);           // R5: only then is bare `A.` the god object
  const lcAlias = BINDS_app.test(src);         // R6: same gate for the lowercase `app.` spelling
  src.split('\n').forEach((ln, i) => {
    let m;
    W_APP.lastIndex = 0;
    while ((m = W_APP.exec(ln))) add(writes, m[1] || m[2], { rel, line: i + 1, as: 'APP' });
    R_APP.lastIndex = 0;
    while ((m = R_APP.exec(ln))) add(reads, m[1], { rel, line: i + 1 });
    if (!aliased) { W_A.lastIndex = 0; while ((m = W_A.exec(ln))) add(untied, m[1], { rel, line: i + 1, as: 'A' }); }
    if (!lcAlias) { W_app.lastIndex = 0; while ((m = W_app.exec(ln))) add(untied, m[1], { rel, line: i + 1, as: 'app' }); }
    if (aliased) {
      W_A.lastIndex = 0;
      while ((m = W_A.exec(ln))) add(writes, m[1], { rel, line: i + 1, as: 'A' });
      R_A.lastIndex = 0;
      while ((m = R_A.exec(ln))) add(reads, m[1], { rel, line: i + 1 });
    }
    if (lcAlias) {
      W_app.lastIndex = 0;
      while ((m = W_app.exec(ln))) add(writes, m[1], { rel, line: i + 1, as: 'app' });
      R_app.lastIndex = 0;
      while ((m = R_app.exec(ln))) add(reads, m[1], { rel, line: i + 1 });
    }
  });
}

const isProd = r => !/test|witness|probe|spike|poc/i.test(r.rel);
const names = [...new Set([...writes.keys(), ...reads.keys()])].sort();
const phantom = names.filter(n => !writes.has(n));
// R11: only production writes count as a lead (a test harness that fakes the object is not a writer)
const suspect = phantom.filter(n => (untied.get(n) || []).some(isProd));
const aliasOnly = names.filter(n => writes.has(n) && writes.get(n).every(w => w.as !== 'APP'));

const L = [];
L.push('# APP surface — generated index', '');
L.push('> **Generated. Do not hand-edit.** `node scripts/gen_app_surface.js`');
L.push('> Spec: `scripts/gen_app_surface.js` §W-APP-SURFACE. See CodeScrapBook §2 and §14.', '');
L.push('The viewer god object is **written as `A.x`** (every module is `setupX(A)`) and');
L.push('**read as `APP.x`**. Same object, two spellings — so `grep \'APP.camera =\'` finds');
L.push('nothing. This index is the missing "go to definition".', '');
L.push('| | |', '|---|---:|');
L.push(`| files scanned | ${files.length} |`);
L.push(`| distinct fields | ${names.length} |`);
L.push(`| written only as \`A.x\`/\`app.x\` (invisible to an \`APP.\` grep) | ${aliasOnly.length} |`);
L.push(`| read but never written (phantom) | ${phantom.length} |`);
L.push(`| — of those, read from production code | ${phantom.filter(n => reads.get(n).some(isProd)).length} |`);
L.push(`| — of those, with an untied write: NOT proven dead (R11) | ${suspect.length} |`);
L.push('');
if (phantom.length) {
  L.push('## Phantom fields — read, never written', '');
  L.push('Each is a guard that can never be true, or a writer that was removed. Check before use.', '');
  L.push('| field | first read site | prod? |', '|---|---|---|');
  for (const n of phantom) {
    const r = reads.get(n)[0];
    L.push(`| \`APP.${n}\` | \`${r.rel}:${r.line}\` | ${reads.get(n).some(isProd) ? '**yes**' : 'no' } |`);
  }
  L.push('');
}
if (suspect.length) {
  L.push('## Phantom, but an untied write exists', '');
  L.push('The index found no writer it can tie to the shared object, yet production code assigns a field of this name through a', 'local `A.`/`app.` it could not tie. Probably NOT dead: read that line before trusting "phantom".', '');
  L.push('| field | untied write site |', '|---|---|');
  for (const n of suspect) { const u = untied.get(n).find(isProd); L.push(`| \`APP.${n}\` | \`${u.rel}:${u.line}\` *(as \`${u.as}.\`)* |`); }
  L.push('');
}
L.push('## All fields', '');
L.push('| field | written at | writes | reads |', '|---|---|---:|---:|');
for (const n of names) {
  const w = writes.get(n);
  const d = w && (w.find(isProd) || w[0]);   // R7: show the production definition, not a test's
  const at = d ? `\`${d.rel}:${d.line}\`` + (d.as !== 'APP' ? ' *(as `' + d.as + '.`)*' : '') : '— *phantom*';
  L.push(`| \`APP.${n}\` | ${at} | ${w ? w.length : 0} | ${(reads.get(n) || []).length} |`);
}
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'APP_SURFACE.md'), L.join('\n') + '\n');
console.log(`§APP_SURFACE files=${files.length} fields=${names.length} alias_only=${aliasOnly.length} phantom=${phantom.length} untied=${suspect.length}`);
