#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — WITNESS W-BUMP (bim-compiler prompts/EDITOR_MAINTAINABILITY_STUDY.md §8 S5)
// ISSUE IT PROVES OR DISPROVES: "scripts/bump.js makes exactly the edits that stop a by-hand change being served stale
// (page ?v=+1, that page's sw CACHE_VERSION +1) and nothing else; a dry run and a bad target write nothing."
// Runs on a TEMP COPY of viewer/viewer.html, viewer/sw.js, erp/idempiere.html, erp/sw.js + one real target file.
// C5 (§14 N2): a LAZY module (viewer/main.js modules[], not precached on purpose) stays lazy: its loader list and the
// loader's own ?v= go up, PRECACHE_ASSETS is untouched, and the not-precached line is a NOTE, never a WARN.
// Prints §BUMP_W <case> PASS|FAIL and §BUMP_W_VERDICT. A no-op bump.js fails C2 (that is the red control).
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const REPO = path.resolve(__dirname, '..', '..');
const BUMP = path.join(REPO, 'scripts', 'bump.js');
const COPY = ['viewer/viewer.html', 'viewer/sw.js', 'viewer/main.js', 'erp/idempiere.html', 'erp/sw.js'];
const html = fs.readFileSync(path.join(REPO, 'viewer/viewer.html'), 'utf8');
const m = [...html.matchAll(/src="([a-z0-9_]+\.js)\?v=(\d+)"/g)].find(x => fs.existsSync(path.join(REPO, 'viewer', x[1])));
if (!m) { console.log('§BUMP_W_VERDICT INCONCLUSIVE no viewer.html script with ?v= found'); process.exit(1); }
const TARGET = 'viewer/' + m[1], V = +m[2];
const n = html.split(m[0]).length - 1;   // how many times the page loads it (normally 1)
// C5 target: a LAZY module — in viewer/main.js modules[] ('nf_room.js?v=1'), loaded on first use, NOT precached on purpose.
const mainSrc = fs.readFileSync(path.join(REPO, 'viewer/main.js'), 'utf8');
const lz = [...mainSrc.matchAll(/'([a-z0-9_]+\.js)\?v=(\d+)'/g)].find(x => fs.existsSync(path.join(REPO, 'viewer', x[1])) && !html.includes(x[1] + '?v='));
const LAZY = lz ? 'viewer/' + lz[1] : null;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'witness_bump_'));
for (const f of [...COPY, TARGET, ...(LAZY ? [LAZY] : []), 'viewer/__unloaded_probe.js']) {
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
  const untouched = ['erp/idempiere.html', 'erp/sw.js', 'viewer/main.js', TARGET].every(f => s0[f] === s2[f]);
  check('C2-write-exact-edits', r2.code === 0 && pageOk && ds.length === 1 && +newV === +oldV + 1 && untouched,
    `page_lines=${dv.length} (want ${n}) v=${V}->${V + 1} sw_lines=${ds.length} CACHE_VERSION v${oldV}->v${newV} others_untouched=${untouched}`);

  const s3 = snap(); const r3 = run(['viewer/__no_such_file.js', '--write']);
  check('C3-missing-file-exit2-no-write', r3.code === 2 && JSON.stringify(snap()) === JSON.stringify(s3), `exit=${r3.code}`);
  const r4 = run(['viewer/__unloaded_probe.js', '--write']);
  check('C4-unloaded-file-exit2-no-write', r4.code === 2 && JSON.stringify(snap()) === JSON.stringify(s3), `exit=${r4.code}`);
  // C5 — lazy loading is KEPT: bumping a lazy module edits its loader's list (+ the loader's own ?v= in the page, since the
  // loader is precached), bumps the sw once, says NOTE (never WARN) about precache, and never touches PRECACHE_ASSETS.
  if (!LAZY) { check('C5-lazy-module', false, 'INCONCLUSIVE no lazy module found in viewer/main.js'); }
  else {
    const t0 = snap(); const sw0 = fs.readFileSync(path.join(tmp, 'viewer/sw.js'), 'utf8');
    const r5 = run([LAZY, '--write']); const t5 = snap(); const sw5 = fs.readFileSync(path.join(tmp, 'viewer/sw.js'), 'utf8');
    const dm = changedLines(t0['viewer/main.js'], t5['viewer/main.js']);
    const dh = changedLines(t0['viewer/viewer.html'], t5['viewer/viewer.html']);
    const ds5 = changedLines(sw0, sw5);
    const pre = s => (/PRECACHE_ASSETS\s*=\s*\[([\s\S]*?)\n\];/.exec(s) || [, ''])[1];
    const ok = r5.code === 0 && dm.length === 1 && dm[0][1] === dm[0][0].replace(`${lz[1]}?v=${lz[2]}'`, `${lz[1]}?v=${+lz[2] + 1}'`) &&
      dh.length === 1 && /main\.js\?v=\d+/.test(dh[0][1]) && ds5.length === 1 && pre(sw0) === pre(sw5) &&
      /§BUMP_NOTE not_precached/.test(r5.out) && !/§BUMP_WARN/.test(r5.out);
    check('C5-lazy-module-kept-lazy', ok, `lazy=${LAZY} exit=${r5.code} main_lines=${dm.length} page_lines=${dh.length} (main.js ?v=) sw_lines=${ds5.length} precache_unchanged=${pre(sw0) === pre(sw5)} note=${/§BUMP_NOTE not_precached/.test(r5.out)} warn=${/§BUMP_WARN/.test(r5.out)}`);
  }
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
console.log(`§BUMP_W_VERDICT ${fails ? 'FAIL' : 'PASS'} judged=5 failed=${fails}`);
process.exit(fails ? 1 : 0);
