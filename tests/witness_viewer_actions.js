#!/usr/bin/env node
// Copyright (c) 2025-2026 Redhuan D. Oon <red1org@gmail.com>
// SPDX-License-Identifier: MIT
//
// # ⚠ DO NOT REMOVE — SPEC (W-VIEWER-ACTIONS)
// Spec: bim-compiler prompts/NEURO_SYMBOLIC_ORDER_CONTRACT.md §19.1. Read the log after every run.
// SCOPE: prove scripts/gen_viewer_actions.js lists every Viewer entry point and that the committed
//        internal/VIEWER_ACTIONS.md is current. Each case names the issue it proves:
//   VA1 a bound key is missing        — `_shortcuts` keys by an independent line scan = the rows
//   VA2 a pill is missing             — `_actions` ids by an independent line scan = the rows
//   VA3 a direct branch / listener is missing — every modifier-key line in a scanned file is a row
//                                        or a declared panel-navigation line; every keydown listener
//                                        file (independent grep) is scanned or excluded
//   VA4 stale file                    — regenerating gives the committed bytes, twice
//   VA5 vacuous                       — each table yields ≥ 1 row, else INCONCLUSIVE (never PASS)
//   VA6 a dead entry reads as working — planted key calling an undefined function → listed, PHANTOM
//   VA1-RED falsifier                 — VA_BREAK=1 (generator drops the last key) must fail VA1
// Run: node tests/witness_viewer_actions.js   — exit 0 = pass. `VA_BREAK=1` makes the generator lie.
'use strict';
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.resolve(__dirname, '..');
const GEN = path.join(ROOT, 'scripts/gen_viewer_actions.js');
const IDX = path.join(ROOT, 'internal/VIEWER_ACTIONS.md');

let fail = 0, inconclusive = 0;
const ok = (id, cond, msg) => { console.log(`§W-VIEWER-ACTIONS ${cond ? 'PASS' : 'FAIL'} ${id} — ${msg}`); if (!cond) fail++; };
const gen = (args, env) => {
  const r = spawnSync('node', [GEN, ...args], { encoding: 'utf8', env: { ...process.env, ...(env || {}) } });
  return r;
};
const genJson = (root, env) => {
  const r = gen(['--json', ...(root ? ['--root', root] : [])], env);
  if (r.status !== 0) throw new Error('generator exit ' + r.status + ': ' + r.stderr);
  return JSON.parse(r.stdout);
};

// ── independent scans (line-based; NOT the generator's tokenizer) ──
function scanShortcutKeys(root) {
  const L = fs.readFileSync(path.join(root, 'viewer/scene.js'), 'utf8').split('\n');
  const a = L.findIndex(l => /var _shortcuts = \{/.test(l));
  const b = L.findIndex((l, i) => i > a && /^  \};\s*$/.test(l));
  const keys = [];
  for (let i = a + 1; i < b; i++) { const m = L[i].match(/^\s{4}(['"])(.+?)\1\s*:\s*function/); if (m) keys.push(m[2]); }
  return { keys, a: a + 1, b: b + 1 };
}
function scanPillIds(root) {
  const L = fs.readFileSync(path.join(root, 'viewer/panels.js'), 'utf8').split('\n');
  const a = L.findIndex(l => /var _actions = \[/.test(l));
  const b = L.findIndex((l, i) => i > a && /^    \];/.test(l));
  const ids = [];
  for (let i = a + 1; i < b; i++) { const m = L[i].match(/^\s*\{\s*id:\s*'([^']+)'/); if (m) ids.push(m[1]); }
  return { ids, a: a + 1, b: b + 1 };
}
const sameSet = (x, y) => x.length === y.length && [...x].sort().join('\u0000') === [...y].sort().join('\u0000');
const diff = (x, y) => x.filter(k => !y.includes(k));

const J = genJson();
const sc = scanShortcutKeys(ROOT), pi = scanPillIds(ROOT);
const genKeys = J.rows.filter(r => r.source === '_shortcuts').map(r => r.key);
const genPills = J.rows.filter(r => r.source === '_actions' && !/\(long-press\)$/.test(r.pill)).map(r => r.pill);

// VA5 first: a table that yields nothing makes every comparison below meaningless.
const pops = { shortcuts: genKeys.length, direct: J.rows.filter(r => r.source === 'direct').length, pills: genPills.length, scan_keys: sc.keys.length, scan_pills: pi.ids.length };
const empty = Object.entries(pops).filter(([, n]) => !n).map(([k]) => k);
if (empty.length) { inconclusive++; console.log(`§W-VIEWER-ACTIONS INCONCLUSIVE VA5 — empty population: ${empty.join(', ')} (nothing judged)`); }
else console.log(`§W-VIEWER-ACTIONS PASS VA5 — populations ${Object.entries(pops).map(([k, n]) => k + '=' + n).join(' ')}`);

// VA1
ok('VA1', sameSet(genKeys, sc.keys), `_shortcuts keys: generator ${genKeys.length}, line scan ${sc.keys.length} (scene.js:${sc.a}-${sc.b})` +
  (sameSet(genKeys, sc.keys) ? '' : ` missing=[${diff(sc.keys, genKeys).join(' ')}] extra=[${diff(genKeys, sc.keys).join(' ')}]`));
// VA2
ok('VA2', sameSet(genPills, pi.ids), `_actions ids: generator ${genPills.length}, line scan ${pi.ids.length} (panels.js:${pi.a}-${pi.b})` +
  (sameSet(genPills, pi.ids) ? '' : ` missing=[${diff(pi.ids, genPills).join(' ')}] extra=[${diff(genPills, pi.ids).join(' ')}]`));

// VA3a — every modifier-key / F-key / e.code line in a scanned file is covered
const MOD = /\b(?:altKey|ctrlKey|metaKey)\b[^\n]*\bkey\s*===\s*'|\be\.code\s*===\s*'|\be\.key\s*===\s*'F\d+'/;
const covered = new Set([...J.rows.filter(r => r.source === 'direct').map(r => r.file + ':' + r.line), ...J.ignored.map(g => g.file + ':' + g.line)]);
const uncovered = [];
let modLines = 0;
for (const f of J.scanned) {
  const L = fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n');
  L.forEach((ln, i) => {
    if (/^\s*\/\//.test(ln) || !MOD.test(ln.replace(/\/\/.*$/, ''))) return;
    if (f === 'viewer/scene.js' && i + 1 >= sc.a && i + 1 <= sc.b) return;   // inside _shortcuts (VA1 owns it)
    modLines++;
    if (!covered.has(f + ':' + (i + 1))) uncovered.push(f + ':' + (i + 1) + ' ' + ln.trim().slice(0, 70));
  });
}
ok('VA3a', modLines > 0 && uncovered.length === 0, `${modLines} modifier-key lines in ${J.scanned.length} scanned files, uncovered ${uncovered.length}` + (uncovered.length ? ': ' + uncovered.join(' | ') : ''));
// VA3b — keydown listener files by an independent grep = the generator's list; none unaccounted
const grepped = [];
(function walk(d) {
  if (!fs.existsSync(d)) return;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (/\/(lib|node_modules|archive|tests|\.git)(\/|$)|\.min\./.test(p)) continue;
    if (e.isDirectory()) walk(p);
    else if (/\.(js|html)$/.test(e.name)) {
      const t = fs.readFileSync(p, 'utf8').split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
      if (/addEventListener\(\s*['"]keydown['"]|\.onkeydown\s*=/.test(t)) grepped.push(path.relative(ROOT, p));
    }
  }
})(path.join(ROOT, 'viewer')); (function () {})();
(function walk(d) {
  if (!fs.existsSync(d)) return;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (/\/(lib|node_modules|archive|tests|\.git)(\/|$)|\.min\./.test(p)) continue;
    if (e.isDirectory()) walk(p);
    else if (/\.(js|html)$/.test(e.name)) {
      const t = fs.readFileSync(p, 'utf8').split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
      if (/addEventListener\(\s*['"]keydown['"]|\.onkeydown\s*=/.test(t)) grepped.push(path.relative(ROOT, p));
    }
  }
})(path.join(ROOT, 'common'));
ok('VA3b', sameSet(grepped, J.listenerFiles) && J.unaccounted.length === 0 && J.directMissing.length === 0,
  `keydown listener files: grep ${grepped.length}, generator ${J.listenerFiles.length}, unaccounted ${J.unaccounted.length}, direct anchors missing ${J.directMissing.length}` +
  (sameSet(grepped, J.listenerFiles) ? '' : ` grep-only=[${diff(grepped, J.listenerFiles).join(' ')}] gen-only=[${diff(J.listenerFiles, grepped).join(' ')}]`));

// VA4 — the committed file is current and the generator is deterministic
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'va-'));
const o1 = path.join(tmp, 'a.md'), o2 = path.join(tmp, 'b.md');
gen(['--out', o1]); gen(['--out', o2]);
const committed = fs.existsSync(IDX) ? fs.readFileSync(IDX, 'utf8') : '';
const fresh = fs.readFileSync(o1, 'utf8');
ok('VA4', fresh === fs.readFileSync(o2, 'utf8') && fresh === committed,
  `two runs identical=${fresh === fs.readFileSync(o2, 'utf8')}, committed internal/VIEWER_ACTIONS.md current=${fresh === committed}` + (fresh === committed ? '' : ' (run node scripts/gen_viewer_actions.js)'));

// VA6 — positive control on a temp copy: a planted key calling a function nothing defines
const croot = path.join(tmp, 'root');
(function copy(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (/^(lib|node_modules|archive|tests|buildings|\.git)$/.test(e.name)) continue;
    if (e.isDirectory()) copy(s, d); else if (/\.(js|html)$/.test(e.name)) fs.copyFileSync(s, d);
  }
})(path.join(ROOT, 'viewer'), path.join(croot, 'viewer'));
(function copy(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (/^(lib|node_modules|archive|tests|\.git)$/.test(e.name)) continue;
    if (e.isDirectory()) copy(s, d); else if (/\.(js|html)$/.test(e.name)) fs.copyFileSync(s, d);
  }
})(path.join(ROOT, 'common'), path.join(croot, 'common'));
const sp = path.join(croot, 'viewer/scene.js');
fs.writeFileSync(sp, fs.readFileSync(sp, 'utf8').replace('var _shortcuts = {\n',
  "var _shortcuts = {\n    '§': function() { if (A.__vaPlantedNoSuchFn) A.__vaPlantedNoSuchFn(); },\n"));
let planted = null, scanSeen = false;
try {
  const P = genJson(croot);
  planted = P.rows.find(r => r.source === '_shortcuts' && r.key === '§');
  scanSeen = scanShortcutKeys(croot).keys.includes('§');
  const ph = P.phantoms.some(p => p.key === '§' && p.callee === 'A.__vaPlantedNoSuchFn');
  ok('VA6', !!planted && ph && scanSeen, `planted key listed=${!!planted}, PHANTOM A.__vaPlantedNoSuchFn=${ph}, line scan sees it=${scanSeen}`);
} catch (e) { ok('VA6', false, 'generator failed on the temp copy: ' + e.message); }

// VA1-RED — the falsifier must make VA1 fail (a witness that cannot fail is not a witness)
if (process.env.VA_BREAK !== '1') {
  const B = genJson(null, { VA_BREAK: '1' });
  const bk = B.rows.filter(r => r.source === '_shortcuts').map(r => r.key);
  ok('VA1-RED', !sameSet(bk, sc.keys), `VA_BREAK=1 generator lists ${bk.length} keys vs line scan ${sc.keys.length} → VA1 would ${sameSet(bk, sc.keys) ? 'PASS (witness blind)' : 'FAIL (caught)'}`);
}
fs.rmSync(tmp, { recursive: true, force: true });

console.log(J.summary);
const verdict = fail ? 'FAIL' : inconclusive ? 'INCONCLUSIVE' : 'PASS';
console.log(`§W-VIEWER-ACTIONS verdict=${verdict} fail=${fail} inconclusive=${inconclusive}`);
process.exit(fail || inconclusive ? 1 : 0);
