#!/usr/bin/env node
// witness_split_surface.js — W-SPLIT-SURFACE. The surface census that must hold across a move-only split of one
// module into part files (bim-compiler prompts/VIEWER_FILE_SPLIT_PLAN.md §SAFETY_GATES + §LANES_RULING).
//
// ISSUE IT PROVES OR DISPROVES: "splitting <module> into part files changed what it exposes, emits or loads". Many
// of these modules' § lines only fire in a live browser session, so without this a clean split and a broken one
// look the same until someone opens the page.
//
// Compared against a baseline committed BEFORE the split (generated from the single file):
//   STATIC  `A.<name> =` / `window.<name> =` / `APP.<name> =` assignments, '§TAG' string literals, function-
//           declaration names — across the whole family, in load order.
//   RUNTIME the family is evaluated in a sandbox (catch-all stub, as witness_loadpath_bearing.js) then the family's
//           entry is called (_split_families.js `runtime`); the APP keys and window keys defined must match.
//   WIRING  the loader lists the family contiguously in family order; sw.js mentions every file (precache or a
//           version note — lazy modules are deliberately not precached).
// Verdicts: PASS · FAIL (names what moved) · INCONCLUSIVE (nothing defined at runtime — nothing judged).
// RUN:   node viewer/tests/witness_split_surface.js <family>           (judge)
//        node viewer/tests/witness_split_surface.js <family> --write   (baseline — ONLY on the unsplit original)
//        SPLIT_DIR=<dir> ... judges a copy (falsifier hook)
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const FAM = process.argv[2];
const { FAMILIES } = require('./_split_families.js');
const F = FAMILIES[FAM];
if (!F) { console.log('§SPLIT_SURFACE unknown family ' + FAM + ' (known: ' + Object.keys(FAMILIES).join(',') + ')'); process.exit(2); }
const V = process.env.SPLIT_DIR || path.join(__dirname, '..');
const BASE = path.join(__dirname, 'baselines', 'split_surface_' + FAM + '.json');
// ALLOWED additions, each with its reason (anything else gained is a FAIL):
//   §SPLIT_PART_MISSING — the split's own guard (scripts/split_closure.js driver): logged, and setup skipped, if a part
//                         file failed to load. The single file had no parts to miss. Failure path only.
const ALLOWED = { tags: ['§SPLIT_PART_MISSING'] };

const srcs = F.files.map((f) => fs.readFileSync(path.join(V, f), 'utf8'));
const all = srcs.join('\n');
const uniq = (a) => Array.from(new Set(a)).sort();
const grab = (re) => { const o = []; let m; while ((m = re.exec(all))) o.push(m[1]); return uniq(o); };
const census = {
  aAssign: grab(/\b(?:A|APP)\.([A-Za-z_$][\w$]*)\s*=(?!=)/g),
  winAssign: grab(/\bwindow\.([A-Za-z_$][\w$]*)\s*=(?!=)/g),
  tags: grab(/(§[A-Z][A-Z0-9_]{2,})/g),   // every § tag in the family text (strings and comments alike)
  functions: grab(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g).filter((n) => !/^__split_/.test(n)),
};

const win = {}; win.window = win; win.APP = {}; win.A = win.APP;
['Math','JSON','Date','Object','Array','Number','String','Boolean','isFinite','isNaN','parseInt','parseFloat','Error','TypeError','RangeError','Map','Set','WeakMap','WeakSet','Promise','Symbol','Reflect','Proxy','Float32Array','Float64Array','Int8Array','Int16Array','Int32Array','Uint8Array','Uint16Array','Uint32Array','Uint8ClampedArray','ArrayBuffer','DataView','RegExp','encodeURIComponent','decodeURIComponent','globalThis']
  .forEach((n) => { win[n] = globalThis[n]; });
const mk = () => new Proxy(function () {}, { get: (t, k) => k === 'then' ? undefined : (k === Symbol.toPrimitive ? () => 0 : (k === Symbol.iterator ? undefined : mk())), set: () => true, apply: () => mk(), construct: () => mk() });
const ctx = vm.createContext(new Proxy(win, { has: () => true, get: (t, k) => (k in t) ? t[k] : (k === 'window' ? win : mk()), set: (t, k, v) => { t[k] = v; return true; } }));
ctx.console = { log: () => {}, warn: () => {}, error: () => {} };
const before = new Set(Object.keys(win));
let loadErr = null, runErr = null;
F.files.forEach((f, i) => { try { vm.runInContext(srcs[i], ctx, { filename: f }); } catch (e) { loadErr = loadErr || (f + ': ' + e.message); } });
try { F.runtime(win); } catch (e) { runErr = e.message; }
census.appKeys = Object.keys(win.APP).sort();
census.windowKeys = Object.keys(win).filter((k) => !before.has(k) && !/^__\w+Parts$/.test(k)).sort();
census.loadError = loadErr ? [String(loadErr).replace(/^[^:]+: /, '')] : [];
census.runtimeError = runErr ? [runErr] : [];

if (process.argv.includes('--write')) {
  fs.mkdirSync(path.dirname(BASE), { recursive: true });
  fs.writeFileSync(BASE, JSON.stringify(census, null, 1) + '\n');
  console.log('§SPLIT_SURFACE ' + FAM + ' baseline written: ' + Object.entries(census).map(([k, v]) => k + '=' + v.length).join(' '));
  process.exit(0);
}
const base = JSON.parse(fs.readFileSync(BASE, 'utf8'));
let fails = 0;
for (const k of Object.keys(base)) {
  const was = new Set(base[k]), now = new Set(census[k] || []);
  const lost = [...was].filter((x) => !now.has(x)), gained = [...now].filter((x) => !was.has(x) && !(ALLOWED[k] || []).includes(x));
  const ok = !lost.length && !gained.length; if (!ok) fails++;
  console.log('§SPLIT_SURFACE ' + FAM + ' ' + k + ' baseline=' + was.size + ' now=' + now.size + ' ' + (ok ? 'same' : 'DIFF lost=' + JSON.stringify(lost.slice(0, 12)) + ' gained=' + JSON.stringify(gained.slice(0, 12))));
}
// WIRING
const ldr = fs.readFileSync(path.join(V, F.loader.file), 'utf8');
const listed = []; { const re = F.loader.kind === 'html' ? /<script src="([^"?]+)(?:\?[^"]*)?"/g : /'([\w./-]+\.js)(?:\?[^']*)?'/g; let m; while ((m = re.exec(ldr))) listed.push(path.basename(m[1])); }
const at = listed.indexOf(F.files[0]);
const orderOk = at >= 0 && F.files.every((f, i) => listed[at + i] === f);
const sw = fs.readFileSync(path.join(V, 'sw.js'), 'utf8');
const swMissing = F.files.filter((f) => !sw.includes(f));
if (!orderOk) fails++;
if (swMissing.length) fails++;
console.log('§SPLIT_SURFACE ' + FAM + ' wiring files=' + F.files.length + ' loaderOrder=' + (orderOk ? 'ok' : 'WRONG ' + JSON.stringify(listed.slice(Math.max(0, at - 1), at + F.files.length + 1))) + ' swMissing=' + JSON.stringify(swMissing));
if (!census.appKeys.length && !census.windowKeys.length) { console.log('§SPLIT_SURFACE ' + FAM + ' VERDICT INCONCLUSIVE — nothing defined at runtime, nothing judged'); process.exit(2); }
console.log('§SPLIT_SURFACE ' + FAM + ' VERDICT ' + (fails ? 'FAIL (' + fails + ')' : 'PASS') + ' appKeys=' + census.appKeys.length + ' windowKeys=' + census.windowKeys.length + ' aAssign=' + census.aAssign.length + ' tags=' + census.tags.length + ' functions=' + census.functions.length);
process.exit(fails ? 1 : 0);
