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

// R5 negative — the gate holds: a bare local `A` in a file that never binds A to APP
//               must not pollute. THREE.js math helpers use `A.x`/`A.y` heavily.
ok('R5n', !/`APP\.(elements|isVector3)`/.test(idx), 'unbound local `A` did not pollute the index');

console.log(`§APP_SURFACE_W ${out.trim()}`);
console.log(`§APP_SURFACE_W ${fail ? 'FAILED ' + fail : 'ALL PASS'}`);
process.exit(fail ? 1 : 0);
