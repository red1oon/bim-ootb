#!/usr/bin/env node
// witness_cpe_load_path_surface.js — W-LP-SURFACE. The surface census that must hold across the
// cpe_load_path.js split (bim-compiler prompts/VIEWER_FILE_SPLIT_PLAN.md §5 + §SAFETY_GATES).
//
// ISSUE IT PROVES OR DISPROVES: "splitting cpe_load_path.js into part files changed what the module
// exposes or emits". The module's own §LOADPATH_* tags are only exercised by live bakes, so before
// this witness nothing could tell a clean split from a broken one without a GPU run.
//
// What it compares against the committed baseline (generated once from the unsplit file):
//   STATIC  every `A.<name> =` / `window.<name> =` assignment, every '§TAG' string literal, every
//           function-declaration name — across the whole family, in viewer.html load order.
//   RUNTIME the family is evaluated in a sandbox (same catch-all stub as witness_loadpath_bearing.js)
//           and setupCpeLoadPath(APP) is called; the set of APP keys defined at setup must match.
//   WIRING  viewer.html loads the family in FAMILY order, contiguously; sw.js precaches every file.
// Verdicts: PASS · FAIL (names what moved) · INCONCLUSIVE (setup defined nothing — nothing judged).
// RUN:   node viewer/tests/witness_cpe_load_path_surface.js            (judge)
//        node viewer/tests/witness_cpe_load_path_surface.js --write    (regenerate baseline — only on
//                                                                       the unsplit original)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const V = process.env.LP_DIR || path.join(__dirname, '..');   // LP_DIR: falsifier hook (judge a mutated copy)
const FAMILY = require('./_lp_family.js').FAMILY;
const BASE = path.join(__dirname, 'baselines', 'cpe_load_path_surface.json');

const srcs = FAMILY.map(f => fs.readFileSync(path.join(V, f), 'utf8'));
const all = srcs.join('\n');
const uniq = a => Array.from(new Set(a)).sort();
const grab = (re) => { const o = []; let m; while ((m = re.exec(all))) o.push(m[1]); return uniq(o); };

const census = {
  aAssign: grab(/\bA\.([A-Za-z_$][\w$]*)\s*=(?!=)/g),
  winAssign: grab(/\bwindow\.([A-Za-z_$][\w$]*)\s*=(?!=)/g),
  tags: grab(/['"`](§[A-Z0-9_]+)/g),
  functions: grab(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g).filter(n => !/^__lpPart_/.test(n)),
};

// RUNTIME — evaluate the family, call setup, record what it defined.
const win = {}; win.window = win; win.APP = {};
['Math','JSON','Date','Object','Array','Number','String','Boolean','isFinite','isNaN','parseInt','parseFloat','Error','TypeError','Map','Set','WeakMap','Promise','Symbol','Float32Array','Float64Array','Int32Array','Uint8Array','Uint16Array','Uint32Array','RegExp']
  .forEach(n => { win[n] = globalThis[n]; });
const mk = () => new Proxy(function () {}, { get: (t, k) => k === 'then' ? undefined : (k === Symbol.toPrimitive ? () => 0 : mk()), set: () => true, apply: () => mk(), construct: () => mk() });
const ctx = vm.createContext(new Proxy(win, { has: () => true, get: (t, k) => (k in t) ? t[k] : (k === 'window' ? win : mk()), set: (t, k, v) => { t[k] = v; return true; } }));
ctx.console = { log: () => {}, warn: () => {}, error: () => {} };
const winBefore = new Set(Object.keys(win));
let loadErr = null, setupErr = null;
FAMILY.forEach((f, i) => { try { vm.runInContext(srcs[i], ctx, { filename: f }); } catch (e) { loadErr = loadErr || (f + ': ' + e.message); } });
if (typeof win.setupCpeLoadPath === 'function') { try { win.setupCpeLoadPath(win.APP); } catch (e) { setupErr = e.message; } }
census.setupKeys = Object.keys(win.APP).sort();
census.windowKeysAfterLoad = Object.keys(win).filter(k => !winBefore.has(k) && k !== 'setupCpeLoadPath' && k !== '__cpeLoadPathParts').sort();

if (process.argv.includes('--write')) {
  fs.mkdirSync(path.dirname(BASE), { recursive: true });
  fs.writeFileSync(BASE, JSON.stringify(census, null, 1) + '\n');
  console.log('§LP_SURFACE baseline written: ' + Object.entries(census).map(([k, v]) => k + '=' + v.length).join(' '));
  process.exit(0);
}

const base = JSON.parse(fs.readFileSync(BASE, 'utf8'));
let fails = 0;
for (const k of Object.keys(base)) {
  const was = new Set(base[k]), now = new Set(census[k] || []);
  // ALLOWED additions, each with its reason (anything else gained is a FAIL):
  //   §LP_PART_MISSING — the split's own guard: cpe_load_path.js logs it and disables the beat if a part file
  //                      failed to load (the single file had no parts to miss). Failure path only.
  const ALLOWED = { tags: ['§LP_PART_MISSING'] };
  const lost = [...was].filter(x => !now.has(x)), gained = [...now].filter(x => !was.has(x) && !(ALLOWED[k] || []).includes(x));
  const ok = !lost.length && !gained.length;
  if (!ok) fails++;
  console.log('§LP_SURFACE ' + k + ' baseline=' + was.size + ' now=' + now.size + ' ' + (ok ? 'same' : 'DIFF lost=' + JSON.stringify(lost.slice(0, 12)) + ' gained=' + JSON.stringify(gained.slice(0, 12))));
}

// WIRING — viewer.html must load the family in FAMILY order, contiguously; sw.js must precache each.
const html = fs.readFileSync(path.join(V, 'viewer.html'), 'utf8');
const tags = []; { const re = /<script src="([^"?]+)(?:\?[^"]*)?"/g; let m; while ((m = re.exec(html))) tags.push(m[1]); }
const at = tags.indexOf(FAMILY[0]);
const orderOk = at >= 0 && FAMILY.every((f, i) => tags[at + i] === f);
const sw = fs.readFileSync(path.join(V, 'sw.js'), 'utf8');
const missingSw = FAMILY.filter(f => !sw.includes("'" + f + "'"));
if (!orderOk) fails++;
if (missingSw.length) fails++;
console.log('§LP_SURFACE wiring family=' + FAMILY.length + ' htmlOrder=' + (orderOk ? 'ok' : 'WRONG ' + JSON.stringify(tags.slice(Math.max(0, at - 1), at + FAMILY.length + 1))) +
  ' swPrecacheMissing=' + JSON.stringify(missingSw));
console.log('§LP_SURFACE load=' + (loadErr || 'ok') + ' setup=' + (setupErr || 'ok'));
if (loadErr || setupErr) fails++;

if (!census.setupKeys.length) { console.log('§LP_SURFACE VERDICT INCONCLUSIVE — setup defined no APP keys, nothing judged'); process.exit(2); }
console.log('§LP_SURFACE VERDICT ' + (fails ? 'FAIL (' + fails + ')' : 'PASS') + ' setupKeys=' + census.setupKeys.length + ' aAssign=' + census.aAssign.length + ' tags=' + census.tags.length + ' functions=' + census.functions.length);
process.exit(fails ? 1 : 0);
