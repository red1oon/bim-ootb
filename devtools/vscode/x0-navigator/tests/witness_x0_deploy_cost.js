#!/usr/bin/env node
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — WITNESS W-PERF-IMPACT, first version (bim-compiler prompts/CODE_ARCHITECTURE_DESIGN.md §F.12a, issue #2943).
// Read the log after every run: exit code is not evidence.
// ISSUE THIS PROVES OR DISPROVES: "nothing tells a developer what a change adds to what every user downloads at start".
// POPULATION: a fixture repo made here (one app: sw.js with PRECACHE_ASSETS, one page, three scripts), committed, then changed
//   three ways; and the real repo's totals.
// CASES (§F.3's own): (a) a new start-up script → boot_delta is EXACTLY its size; (b) a file that was only in the cache list
//   becomes a page script → moved_to_boot=1; (c) RED CONTROL: no change → every delta is 0.
// No parser (VS Code's TypeScript not found) or no git → INCONCLUSIVE, never PASS.
// Command: node devtools/vscode/x0-navigator/tests/witness_x0_deploy_cost.js
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');
const D = require('../lib/deploy_cost');
const J = require('../lib/js_facts');

const ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const SEC = '§';
let fail = 0;
function check(label, cond) { console.log('  ' + (cond ? 'PASS ' : 'FAIL ') + label); if (!cond) fail++; return !!cond; }
function summary(f, verdict) { console.log(SEC + 'PERF_IMPACT ' + Object.keys(f).map(k => k + '=' + f[k]).join(' ') + ' verdict=' + verdict); }
if (!J.loadTs(ROOT)) { console.log('  no JavaScript parser found (scripts/lib/find_ts.js)'); summary({ parser: 'N' }, 'INCONCLUSIVE'); process.exit(0); }

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'x0-cost-'));
const FIX = path.join(TMP, 'repo');
const w = (rel, txt) => { fs.mkdirSync(path.dirname(path.join(FIX, rel)), { recursive: true }); fs.writeFileSync(path.join(FIX, rel), txt); };
const g = a => cp.spawnSync('git', a, { cwd: FIX, encoding: 'utf8' });
// the fixture carries the repo's own parser finder, so measure() works on it exactly as on the real repo
w('scripts/lib/find_ts.js', fs.readFileSync(path.join(ROOT, 'scripts', 'lib', 'find_ts.js'), 'utf8'));
w('app/sw.js', "const CACHE_VERSION = 'v1';\nconst PRECACHE_ASSETS = [\n  'page.html',\n  'boot.js', // a comment with 'ghost.js' in it must not count\n  'cached_only.js',\n  ...EXTRA,\n];\n");
w('app/page.html', '<html><!-- <script src="commented.js"></script> is a comment, but HTML comments are not parsed away: see below -->\n<script src="boot.js?v=3"></script>\n<script src="https://cdn.example/x.js"></script>\n</html>\n');
w('app/boot.js', 'var boot = 1;\n'); w('app/cached_only.js', 'var cached = 12345;\n'); w('app/lazy.js', 'var lazy = 1;\n');
if (g(['init', '-q']).status !== 0) { summary({ git: 'N' }, 'INCONCLUSIVE'); process.exit(0); }
g(['add', '-A']); g(['-c', 'user.name=w', '-c', 'user.email=w@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-q', '--no-verify', '-m', 'base']);

const base = D.measure(FIX, D.gitReader(FIX, 'HEAD'));
const row = () => D.compare(D.measure(FIX, D.fsReader(FIX)), base)[0];

// (c) red control first: nothing changed
const r0 = row();
console.log('  ' + D.formatRow(r0, 'HEAD'));
check('fixture read: 1 start-up file (boot.js), 3 cached files, the commented-out name and the CDN script do not count, 1 element is not a plain string',
  r0.bootFiles === 1 && r0.precacheFiles === 3 && r0.nonliteral === 1);
const redOk = check('red control: no change → boot_delta=0 precache_delta=0 moved_to_boot=0', r0.bootDelta === 0 && r0.precacheDelta === 0 && r0.movedToBoot.length === 0 && r0.newBoot.length === 0);

// (a) a new start-up script
const NEW = 'var added = "' + 'x'.repeat(777) + '";\n';
w('app/added.js', NEW);
w('app/page.html', fs.readFileSync(path.join(FIX, 'app/page.html'), 'utf8').replace('</html>', '<script src="added.js"></script>\n</html>'));
const ra = row();
console.log('  ' + D.formatRow(ra, 'HEAD'));
const pageGrew = fs.statSync(path.join(FIX, 'app/page.html')).size - base.apps.app.precache.get('app/page.html');
const aOk = check('(a) a new start-up script of ' + NEW.length + ' bytes → boot_delta is exactly ' + NEW.length + '; the page itself grew by ' + pageGrew + ' in the cache',
  ra.bootDelta === NEW.length && ra.newBoot.length === 1 && ra.precacheDelta === pageGrew);

// (b) a cache-only file becomes a page script
w('app/page.html', fs.readFileSync(path.join(FIX, 'app/page.html'), 'utf8').replace('</html>', '<script src="cached_only.js"></script>\n</html>'));
const rb = row();
console.log('  ' + D.formatRow(rb, 'HEAD'));
const bOk = check('(b) a file that was only in the cache list is now a page script → moved_to_boot=1 (' + rb.movedToBoot.join(',') + ')',
  rb.movedToBoot.length === 1 && rb.movedToBoot[0] === 'app/cached_only.js');
const cls = D.fileClass(D.measure(FIX, D.fsReader(FIX)), 'app/lazy.js');
check('a file no page and no cache list names is "not loaded at start"', cls.length === 0
  && D.fileClass(D.measure(FIX, D.fsReader(FIX)), 'app/boot.js')[0].how === 'start-up');
fs.rmSync(TMP, { recursive: true, force: true });

// the real repo: totals, and a clean tree against its own HEAD must show no delta
const realNow = D.measure(ROOT, D.fsReader(ROOT));
let realRows = [], dirty = '?';
try {
  realRows = D.compare(realNow, D.measure(ROOT, D.gitReader(ROOT, 'HEAD')));
  dirty = cp.execFileSync('git', ['status', '--porcelain', '-uno'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean).length;
} catch (e) { realRows = []; }
for (const r of realRows) console.log('  ' + D.formatRow(r, 'HEAD'));
const realOk = check('real repo: ' + realRows.length + ' apps measured' + (dirty === 0 ? ', clean tree → all deltas 0' : ' (tree has ' + dirty + ' changed files: deltas not judged)'),
  realRows.length >= 3 && realRows.every(r => r.bootFiles > 0 && r.precacheBytes > 0) && (dirty !== 0 || realRows.every(r => r.bootDelta === 0 && r.precacheDelta === 0)));

const yn = b => (b ? 'Y' : 'N');
summary({ new_boot_exact: yn(aOk), moved_to_boot: yn(bOk), red_zero: yn(redOk), real_apps: realRows.length,
  real_boot_bytes: realRows.reduce((a, r) => a + r.bootBytes, 0), real_precache_bytes: realRows.reduce((a, r) => a + r.precacheBytes, 0), real: yn(realOk) }, fail === 0 ? 'PASS' : 'FAIL');
if (fail) process.exitCode = 1;
