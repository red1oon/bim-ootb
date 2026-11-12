#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — WITNESS W-BUMP (bim-compiler prompts/EDITOR_MAINTAINABILITY_STUDY.md §8 S5)
// ISSUE IT PROVES OR DISPROVES: "scripts/bump.js makes exactly the edits that stop a by-hand change being served stale
// (page ?v=+1, that page's sw CACHE_VERSION +1) and nothing else; a dry run and a bad target write nothing."
// Runs on a TEMP COPY of viewer/viewer.html, viewer/sw.js, erp/idempiere.html, erp/sw.js + one real target file.
// Prints §BUMP_W <case> PASS|FAIL and §BUMP_W_VERDICT. A no-op bump.js fails C2 (that is the red control).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const REPO = path.resolve(__dirname, '..', '..');
const BUMP = path.join(REPO, 'scripts', 'bump.js');
const COPY = ['viewer/viewer.html', 'viewer/sw.js', 'erp/idempiere.html', 'erp/sw.js'];
const html = fs.readFileSync(path.join(REPO, 'viewer/viewer.html'), 'utf8');
const m = [...html.matchAll(/src="([a-z0-9_]+\.js)\?v=(\d+)"/g)].find(x => fs.existsSync(path.join(REPO, 'viewer', x[1])));
if (!m) { console.log('§BUMP_W_VERDICT INCONCLUSIVE no viewer.html script with ?v= found'); process.exit(1); }
const TARGET = 'viewer/' + m[1], V = +m[2];
const n = html.split(m[0]).length - 1;   // how many times the page loads it (normally 1)

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'witness_bump_'));
for (const f of [...COPY, TARGET, 'viewer/__unloaded_probe.js']) {
  fs.mkdirSync(path.join(tmp, path.dirname(f)), { recursive: true });
  if (f.endsWith('__unloaded_probe.js')) fs.writeFileSync(path.join(tmp, f), '// exists, but no page loads it\n');
  else fs.copyFileSync(path.join(REPO, f), path.join(tmp, f));
}
const snap = () => Object.fromEntries([...COPY, TARGET].map(f => [f, fs.readFileSync(path.join(tmp, f), 'utf8')]));
const run = args => { try { return { code: 0, out: cp.execFileSync('node', [BUMP, ...args, '--root', tmp], { encoding: 'utf8' }) }; }
  catch (e) { return { code: e.status, out: String(e.stdout || '') }; } };
const changedLines = (a, b) => { const x = a.split('\n'), y = b.split('\n'); const d = []; for (let i = 0; i < Math.max(x.length, y.length); i++) if (x[i] !== y[i]) d.push([x[i], y[i]]); return d; };
let fails = 0;
const check = (c, ok, info) => { if (!ok) fails++; console.log(`§BUMP_W ${c} ${ok ? 'PASS' : 'FAIL'} ${info}`); };

try {
  const s0 = snap();
  const r1 = run([TARGET]);
  check('C1-dry-run-writes-nothing', r1.code === 0 && JSON.stringify(snap()) === JSON.stringify(s0) && /written=0/.test(r1.out), `target=${TARGET} exit=${r1.code}`);

  const r2 = run([TARGET, '--write']); const s2 = snap();
  const dv = changedLines(s0['viewer/viewer.html'], s2['viewer/viewer.html']);
  const ds = changedLines(s0['viewer/sw.js'], s2['viewer/sw.js']);
  const oldV = /CACHE_VERSION\s*=\s*'v(\d+)'/.exec(s0['viewer/sw.js'])[1], newV = /CACHE_VERSION\s*=\s*'v(\d+)'/.exec(s2['viewer/sw.js'])[1];
  const pageOk = dv.length === n && dv.every(([a, b]) => a.replace(`${m[1]}?v=${V}"`, `${m[1]}?v=${V + 1}"`) === b);
  const untouched = ['erp/idempiere.html', 'erp/sw.js', TARGET].every(f => s0[f] === s2[f]);
  check('C2-write-exact-edits', r2.code === 0 && pageOk && ds.length === 1 && +newV === +oldV + 1 && untouched,
    `page_lines=${dv.length} (want ${n}) v=${V}->${V + 1} sw_lines=${ds.length} CACHE_VERSION v${oldV}->v${newV} others_untouched=${untouched}`);

  const s3 = snap(); const r3 = run(['viewer/__no_such_file.js', '--write']);
  check('C3-missing-file-exit2-no-write', r3.code === 2 && JSON.stringify(snap()) === JSON.stringify(s3), `exit=${r3.code}`);
  const r4 = run(['viewer/__unloaded_probe.js', '--write']);
  check('C4-unloaded-file-exit2-no-write', r4.code === 2 && JSON.stringify(snap()) === JSON.stringify(s3), `exit=${r4.code}`);
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
console.log(`§BUMP_W_VERDICT ${fails ? 'FAIL' : 'PASS'} judged=4 failed=${fails}`);
process.exit(fails ? 1 : 0);
