#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — SPEC (W-APP-SURFACE)
// SCOPE: prove scripts/gen_app_surface.js obeys R1-R6, and that the index it wrote is
//        current. ISSUE PROVED: "the god object has three spellings, so grep lies."
//        If R5/R6 regress the index silently under-reports and navigation breaks again.
// Run: node tests/witness_app_surface.js   — exit 0 = pass. Read the §-log either way.
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const IDX = path.join(ROOT, 'internal/APP_SURFACE.md');

let fail = 0;
const ok = (id, cond, msg) => {
  console.log(`§APP_SURFACE_W ${cond ? 'PASS' : 'FAIL'} ${id} — ${msg}`);
  if (!cond) fail++;
};

const gen = () => execFileSync('node', [path.join(ROOT, 'scripts/gen_app_surface.js')], { encoding: 'utf8' });
const out = gen();
const idx = fs.readFileSync(IDX, 'utf8');
gen();
const idx2 = fs.readFileSync(IDX, 'utf8');

// R4 — the index is a pure function of the tree: two runs are byte-identical, so a
//      diff in git review means the CODE changed, never that the generator drifted.
ok('R4', idx === idx2, 'two consecutive runs produce an identical index (deterministic)');

// R1 — a field written somewhere is listed with a real file:line, not left blank.
ok('R1', /\| `APP\.camera` \| `[\w./-]+:\d+`/.test(idx), 'APP.camera resolves to a write site');

// R7 — that write site is production code, not whichever test the walk happened to hit first.
ok('R7', /\| `APP\.camera` \| `viewer\//.test(idx), 'APP.camera shows its viewer/ definition, not a test');

// R5 — the `A.` spelling is found. APP.camera is written as `A.camera` in scene.js.
ok('R5', /`APP\.camera`.*\*\(as `A\.`\)\*/.test(idx), 'A. alias resolved (camera written as A.camera)');

// R6 — the lowercase `app.` spelling is found. time_machine.js writes app._tmOn.
ok('R6', /`APP\._tmOn`.*\*\(as `app\.`\)\*/.test(idx), 'app. alias resolved (_tmOn written as app._tmOn)');

// R2 — a name with no writer anywhere is reported as phantom, not silently dropped.
//      APP._walkMode is read once (viewer/panels.js) and written nowhere in the tree.
ok('R2', /`APP\._walkMode`.*— \*phantom\*/.test(idx), '_walkMode listed as phantom (dead guard)');

// R3 — vendored code is never scanned; web-ifc defines thousands of names we must not index.
ok('R3', !/web-ifc|\/lib\//.test(idx), 'no vendored path leaked into the index');

// R8 — the tool does not index itself off its own spec comments.
ok('R8', !/gen_app_surface\.js:|witness_app_surface\.js:/.test(idx), 'generator/witness excluded from their own index');

// R9 — prose is not code. viewer/effects.js:4567 says "Set A._emberEnabled = true to
//      re-arm for experiments" in a comment. That sentence must NOT become a definition.
ok('R9', !/`APP\._emberEnabled` \| `viewer\/effects\.js:4567`/.test(idx),
   'comment prose not indexed as a write site');

// R9b — a `/*` inside a `//` comment must not hide the code after it (NEURO contract §19.2).
//       Real case: viewer/tools.js:25 `// ...buildings/*.db...` blanked A.screenshot (tools.js:613).
//       Temp tree: a file that binds A, a `// a/*.db` line, then `A.x = 1` and a later `*/`.
const os = require('os');
const r9b = (extraEnv) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'appsurf-'));
  fs.mkdirSync(path.join(dir, 'viewer'));
  fs.writeFileSync(path.join(dir, 'viewer/t.js'),
    'function setupT(A) {\n// a/*.db\nA.x = 1;\n/* real block */\nA.y = 2;\n}\n');
  execFileSync('node', [path.join(ROOT, 'scripts/gen_app_surface.js')],
    { encoding: 'utf8', env: { ...process.env, APPSURF_ROOT: dir, APPSURF_OUT: dir, ...extraEnv } });
  const t = fs.readFileSync(path.join(dir, 'APP_SURFACE.md'), 'utf8');
  fs.rmSync(dir, { recursive: true, force: true });
  return t;
};
const good = r9b({});
ok('R9b', /`APP\.x` \| `viewer\/t\.js:3`/.test(good) && !/`APP\.x`.*phantom/.test(good) && /`APP\.y` \| `viewer\/t\.js:5`/.test(good),
   'A.x after a `// a/*.db` line is written (t.js:3), not phantom; A.y after a real block comment kept (t.js:5)');
const red = r9b({ APPSURF_OLD_STRIP: '1' });
ok('R9b-RED', /`APP\.x`.*phantom|!`APP\.x`/.test(red) || !/`APP\.x` \| `viewer\/t\.js:3`/.test(red),
   'falsifier APPSURF_OLD_STRIP=1: old strip order loses A.x (R9b would FAIL) -> caught');
ok('R9c', /`APP\.screenshot` \| `viewer\/tools\.js:\d+`/.test(idx), 'APP.screenshot (real tree) resolves to its tools.js write site');

// R5 negative — the gate holds: a bare local `A` in a file that never binds A to APP
//               must not pollute. THREE.js math helpers use `A.x`/`A.y` heavily.
ok('R5n', !/`APP\.(elements|isVector3)`/.test(idx), 'unbound local `A` did not pollute the index');

// R5b — ISSUE (#2961): "a field written in a file that says `var A = APP;` shows as PHANTOM".
//       Real case: viewer/grid_overlay.js `function setupGridOverlay(APP) { var A = APP; … A.toggleGridOverlay = …`.
//       Temp tree: one file binds by declaration (its write must be indexed), one declares an unrelated local A
//       (its write must NOT be indexed: the red control for the widened gate).
const r5b = (() => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'appsurf-'));
  fs.mkdirSync(path.join(dir, 'viewer'));
  fs.writeFileSync(path.join(dir, 'viewer/bound.js'), 'function setupB(APP) {\n  var A = APP;\n  A.aliasField = 1;\n}\nvar z = APP.aliasField;\n');
  fs.writeFileSync(path.join(dir, 'viewer/local.js'), 'function f() {\n  var A = {};\n  A.localOnly = 1;\n}\n');
  execFileSync('node', [path.join(ROOT, 'scripts/gen_app_surface.js')],
    { encoding: 'utf8', env: { ...process.env, APPSURF_ROOT: dir, APPSURF_OUT: dir } });
  const t = fs.readFileSync(path.join(dir, 'APP_SURFACE.md'), 'utf8');
  fs.rmSync(dir, { recursive: true, force: true });
  return t;
})();
ok('R5b', /`APP\.aliasField` \| `viewer\/bound\.js:3`/.test(r5b) && !/`APP\.aliasField`.*phantom/.test(r5b),
   'a write in a `var A = APP;` file is indexed (bound.js:3), not phantom');
ok('R5b-RED', !/localOnly/.test(r5b), 'an unrelated local `var A = {}` still adds nothing to the index');
ok('R5b-real', /`APP\.toggleGridOverlay` \| `viewer\/grid_overlay\.js:\d+`/.test(idx) && !/`APP\.toggleGridOverlay` \| — \*phantom\*/.test(idx),
   'APP.toggleGridOverlay (real tree) resolves to its grid_overlay.js write site');

console.log(`§APP_SURFACE_W ${out.trim()}`);
console.log(`§APP_SURFACE_W ${fail ? 'FAILED ' + fail : 'ALL PASS'}`);
process.exit(fail ? 1 : 0);
