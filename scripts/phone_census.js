#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// # ⚠ DO NOT REMOVE — SPEC: bim-compiler prompts/MOBILE_PERF.md "WO-1" (W-PHONE-CENSUS, scripts/tests/witness_phone_census.js). READ THE OUTPUT LOG; the exit code is not evidence.
// ISSUE: the phone axe (MOBILE_PERF "Build order" 1) drops whole feature groups from a phone's boot. Nobody knew which KEPT code calls into the files a phone will drop
//        (the group table was summed by hand, its file lists were not recorded).
// WHAT:  read-only. Reads viewer/modules.json (the manifest), the fields `"phone": false` + `"phoneGroup"` on a module, and the source of the kept files. Prints:
//   §PHONE_GROUP  group= files= kb=                 per group (eager = a <script src> tag of viewer/viewer.html; lazy_* = flagged files a loader fetches on demand)
//   §PHONE_DEP    kept=<file> needs=<flagged file>  a KEPT module/inline of the viewer whose `deps` names a flagged file (it cannot be dropped: FAIL)
//   §PHONE_USE    kept=<file> uses=<flagged file>   a kept module/inline of the viewer whose `uses` names a flagged file (a call that needs a guard)
//   §PHONE_BARE   <kept file>:<line> <name> guarded=<yes|no>   a reference in a kept file to a top-level function / `window.` global DEFINED in a flagged file
//   §PHONE_APP    <kept file>:<line> A.<name> guarded=<yes|no> same for a member of the APP object that a flagged file assigns (extra to the spec; reads `A.x(` / `APP.x(`)
//   §PHONE_FAMILY driver=<kept file> registry=<name> flagged_parts= kept_parts=   a generated split family (driver + parts) with some parts flagged: the driver would find parts missing
//   §PHONE_BYTES  flagged= kept= eager=            exact bytes (the witness compares `eager` with scripts/boot_weight.js)
//   §PHONE_CENSUS groups= flagged= kb_flagged= kb_kept= dep_blocks= uses= bare_unguarded= app_unguarded= lazy_flagged= verdict=PASS|FAIL|INCONCLUSIVE
// "guarded=yes" is a TEXT heuristic (a `typeof` test, `if (window.x`, `&&`/`||`/`?` test, `?.(` on the same line or the 3 lines above); it never proves a guard works. A name that a kept
//   file also declares itself (function/var/let/const/class), or that another kept file defines, is skipped as ambiguous and counted in §PHONE_AMBIGUOUS.
// USE:   node scripts/phone_census.js [--modules <path to a modules.json>] [--quiet-lines]
'use strict';
const fs = require('fs'), path = require('path');
const { scan } = require('./lib/js_scan.js');
const P = path.posix;
const ROOT = path.resolve(__dirname, '..');
const arg = n => { const i = process.argv.indexOf(n); return i < 0 ? null : process.argv[i + 1]; };
const MANIFEST = arg('--modules') ? path.resolve(arg('--modules')) : path.join(ROOT, 'viewer', 'modules.json');
const PAGE = 'viewer/viewer.html';
const GROUPS = ['film', 'still', 'filmsound', 'import', 'export', 'fourd', 'grid2d', 'civil', 'rules', 'section'];

const m = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const out = [];
const say = s => { out.push(s); console.log(s); };
const sizeOf = f => { try { return fs.statSync(path.join(ROOT, f)).size; } catch (e) { return -1; } };
const kb = b => (b / 1024).toFixed(1);
const targetOf = (file, as) => {   // the module a site names (same rule as scripts/lib/manifest_source.js targetOf, read-only copy)
  if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(as)) return as;
  const a = P.normalize(P.join(P.dirname(file), as));
  if (m.modules[a] || file.endsWith('.html')) return a;
  const b = P.normalize(P.join(m.app, as));
  return m.modules[b] ? b : a;
};

// ---- populations
const flagged = new Map();   // file -> group
for (const [f, v] of Object.entries(m.modules)) {
  if (v.phone === false || v.phoneGroup != null) {
    if (v.phone !== false || !GROUPS.includes(v.phoneGroup)) { say(`§PHONE_SCHEMA module=${f} phone=${v.phone} phoneGroup=${v.phoneGroup} (both or neither; group one of ${GROUPS.join(',')})`); process.exit(1); }
    flagged.set(f, v.phoneGroup);
  }
}
const eager = [];   // the viewer page's <script src> tags, in page order (what scripts/boot_weight.js sums)
for (const s of m.order[PAGE] || []) if (s.kind === 'tag') { const t = targetOf(PAGE, s.as); if (m.modules[t] && sizeOf(t) >= 0) eager.push(t); }
const eagerSet = new Set(eager);
const reach = new Set(eager);   // everything the viewer page can load: its tags + what a reachable loader fetches lazily
for (let grew = true; grew;) { grew = false;
  for (const [f, sites] of Object.entries(m.order)) { if (f.endsWith('.html') || !reach.has(f)) continue;
    for (const s of sites) { const t = targetOf(f, s.as); if (m.modules[t] && !reach.has(t)) { reach.add(t); grew = true; } } } }
const lazyFlagged = [...flagged.keys()].filter(f => !eagerSet.has(f) && reach.has(f));
const keptFiles = [...reach].filter(f => !flagged.has(f));

// ---- §PHONE_GROUP
let kbFlagged = 0, kbKept = 0, bytesFlagged = 0, bytesKept = 0;
for (const f of eager) { const b = sizeOf(f); if (flagged.has(f)) { bytesFlagged += b; } else bytesKept += b; }
kbFlagged = bytesFlagged / 1024; kbKept = bytesKept / 1024;
const groupsUsed = [];
for (const g of GROUPS) {
  const files = [...flagged].filter(([, gg]) => gg === g).map(([f]) => f);
  if (!files.length) continue; groupsUsed.push(g);
  const ea = files.filter(f => eagerSet.has(f)), lz = files.filter(f => !eagerSet.has(f));
  say(`§PHONE_GROUP group=${g} files=${ea.length} kb=${kb(ea.reduce((a, f) => a + sizeOf(f), 0))} lazy_files=${lz.length} lazy_kb=${kb(lz.reduce((a, f) => a + Math.max(0, sizeOf(f)), 0))}`);
}

// ---- §PHONE_DEP / §PHONE_USE (the manifest's own edges). Inline readers count only for the viewer page; other pages load their own tags.
let depBlocks = 0, uses = 0;
const readers = [...keptFiles.map(f => [f, m.modules[f]])];
for (const [id, rec] of Object.entries(m.inline)) if (id.startsWith(PAGE + '#')) readers.push([id, rec]);
for (const [f, rec] of readers.sort((a, b) => a[0].localeCompare(b[0])))
  for (const d of rec.deps || []) if (flagged.has(d)) { depBlocks++; say(`§PHONE_DEP kept=${f} needs=${d}`); }
for (const [f, rec] of readers.sort((a, b) => a[0].localeCompare(b[0])))
  for (const u of rec.uses || []) if (flagged.has(u)) { uses++; say(`§PHONE_USE kept=${f} uses=${u}`); }

// ---- §PHONE_BARE / §PHONE_APP (line-level, from the source text; strings and comments are blanked by lib/js_scan.js)
const maskOf = new Map();
const maskFor = f => { if (!maskOf.has(f)) { let t = ''; try { t = fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { return null; } maskOf.set(f, scan(t).mask); } return maskOf.get(f); };
const GLOBAL_ASSIGN = /\b(?:window|globalThis|global|self|root)\.([A-Za-z_$][\w$]*)\s*=(?!=)/g;
const TOP_DECL = /^(?:async\s+)?(?:function\*?|var|let|const|class)\s+([A-Za-z_$][\w$]*)/gm;   // column 0 only: a script-level declaration is a global
const APP_ASSIGN = /\b(?:window\.APP|APP|A)\.([A-Za-z_$][\w$]*)\s*=(?!=)/g;
function depthAt(t) {   // bracket depth of every offset a TOP_DECL can match (computed once per text)
  const d = new Int32Array(t.length + 1); let k = 0;
  for (let i = 0; i < t.length; i++) { d[i] = k; const c = t[i]; if (c === '{' || c === '(' || c === '[') k++; else if (c === '}' || c === ')' || c === ']') k--; }
  return d;
}
function definedIn(f, withApp) {
  const t = maskFor(f); const g = new Set(), a = new Set(); if (t == null) return { g, a };
  let x; GLOBAL_ASSIGN.lastIndex = 0; while ((x = GLOBAL_ASSIGN.exec(t))) g.add(x[1]);
  if (!/_worker\.js$/.test(f)) { const d = depthAt(t); TOP_DECL.lastIndex = 0; while ((x = TOP_DECL.exec(t))) if (d[x.index] === 0) g.add(x[1]); }   // a worker has its own global scope
  if (withApp !== false) { APP_ASSIGN.lastIndex = 0; while ((x = APP_ASSIGN.exec(t))) a.add(x[1]); }
  return { g, a };
}
const gDef = new Map(), aDef = new Map();   // name -> flagged file that defines it (first)
for (const f of flagged.keys()) { const d = definedIn(f, true); for (const n of d.g) if (!gDef.has(n)) gDef.set(n, f); for (const n of d.a) if (!aDef.has(n)) aDef.set(n, f); }
const keptDefs = new Set(), keptApp = new Set();   // names a kept file defines at script level / assigns on the APP object: a reference to them is ambiguous
for (const f of keptFiles) { const d = definedIn(f, true); for (const n of d.g) keptDefs.add(n); for (const n of d.a) keptApp.add(n); }
const esc = s => s.replace(/[$]/g, '\\$');
let bareUnguarded = 0, appUnguarded = 0, ambiguous = 0, bareN = 0, appN = 0;
const guardedAt = (lines, li, name, viaApp) => {
  const lo = Math.max(0, li - 3), txt = lines.slice(lo, li + 1).join('\n'), n = esc(name);
  const pre = '(?:window\\.|window\\.APP\\.|APP\\.|A\\.)' + (viaApp ? '' : '?');
  return new RegExp('typeof\\s+' + pre + n + '\\b').test(txt)
    || new RegExp('(?:\\bif\\s*\\(\\s*!?|&&\\s*|\\|\\|\\s*|\\?\\s*|!)\\(?(?:window\\.|window\\.APP\\.|APP\\.|A\\.)' + n + '\\b').test(txt)
    || new RegExp('(?:window|APP|A)\\.' + n + '\\s*\\?\\.\\(').test(txt);
};
for (const f of keptFiles.sort()) {
  if (!/\.m?js$/.test(f)) continue;
  const t = maskFor(f); if (t == null) continue;
  const lines = t.split('\n');
  const own = new Set(); let x; const DECL = /\b(?:function\*?|var|let|const|class)\s+([A-Za-z_$][\w$]*)/g; while ((x = DECL.exec(t))) own.add(x[1]);
  const PARAMS = /\(([^()]*)\)\s*(?:=>|\{)/g; while ((x = PARAMS.exec(t))) for (const p of x[1].split(',')) { const id = p.trim().replace(/^\.\.\./, '').split(/[\s=]/)[0]; if (id) own.add(id); }
  for (const [name, def] of gDef) {
    if (own.has(name)) { if (new RegExp('(?<![\\w$.])' + esc(name) + '(?![\\w$])').test(t)) ambiguous++; continue; }
    if (keptDefs.has(name)) { if (new RegExp('(?<![\\w$.])' + esc(name) + '(?![\\w$])').test(t)) ambiguous++; continue; }
    const re = new RegExp('(?<![\\w$.])(?:window\\.)?' + esc(name) + '(?![\\w$])', 'g');
    lines.forEach((ln, li) => {
      re.lastIndex = 0; let r;
      while ((r = re.exec(ln))) {
        const before = ln.slice(0, r.index), after = ln.slice(r.index + r[0].length);
        if (/^\s*:/.test(after) && /[{,]\s*$/.test(before)) continue;      // an object key, not a reference
        if (/^\s*\([^)]*\)\s*\{/.test(after) && /^\s*$/.test(before)) continue;   // a method definition
        const viaWin = r[0].startsWith('window.');
        // a `window.x` that is only READ (not called on the spot) cannot throw; a bare `x` or a `window.x(` call needs a test in view
        const guarded = guardedAt(lines, li, name, false) || (viaWin && !/^\s*\(/.test(after));
        bareN++; if (!guarded) bareUnguarded++;
        say(`§PHONE_BARE ${f}:${li + 1} ${name} guarded=${guarded ? 'yes' : 'no'} defined_in=${def}`);
      }
    });
  }
  for (const [name, def] of aDef) {
    if (keptApp.has(name)) continue;   // a kept file assigns it too: not ours to judge
    const re = new RegExp('(?<![\\w$.])(?:window\\.APP|APP|A)\\.' + esc(name) + '(?![\\w$])', 'g');
    lines.forEach((ln, li) => {
      re.lastIndex = 0; let r;
      while ((r = re.exec(ln))) {
        const after = ln.slice(r.index + r[0].length);
        if (/^\s*=(?!=)/.test(after)) continue;                                  // an assignment by the kept file itself
        const guarded = guardedAt(lines, li, name, true);
        appN++; if (!guarded) appUnguarded++;
        say(`§PHONE_APP ${f}:${li + 1} A.${name} guarded=${guarded ? 'yes' : 'no'} defined_in=${def}`);
      }
    });
  }
}
say(`§PHONE_AMBIGUOUS skipped_files_names=${ambiguous} (a kept file declares the name itself, or another kept file defines it)`);

// ---- §PHONE_FAMILY: generated split families register parts on window.__<x>Parts; a driver reads them all
const regOf = new Map();   // registry -> {flagged:Set, kept:Set}
for (const f of [...flagged.keys(), ...keptFiles]) {
  const t = maskFor(f); if (t == null) continue; const r = /__(\w+Parts)\b/g; let x; const seen = new Set();
  while ((x = r.exec(t))) seen.add(x[1]);
  for (const reg of seen) { if (!regOf.has(reg)) regOf.set(reg, { flagged: new Set(), kept: new Set() }); (flagged.has(f) ? regOf.get(reg).flagged : regOf.get(reg).kept).add(f); }
}
let familyBreaks = 0;
for (const [reg, v] of regOf) if (v.flagged.size && v.kept.size) {
  familyBreaks++; say(`§PHONE_FAMILY registry=__${reg} flagged_parts=${v.flagged.size} kept=${[...v.kept].sort().join(',')}`);
}
if (!familyBreaks) say('§PHONE_FAMILY none (no split family has some parts flagged and some kept)');

// ---- totals
say(`§PHONE_BYTES flagged=${bytesFlagged} kept=${bytesKept} eager=${bytesFlagged + bytesKept}`);
const verdict = !flagged.size ? 'INCONCLUSIVE' : depBlocks > 0 ? 'FAIL' : 'PASS';
say(`§PHONE_CENSUS groups=${groupsUsed.length} flagged=${[...flagged.keys()].filter(f => eagerSet.has(f)).length} kb_flagged=${kb(bytesFlagged)} kb_kept=${kb(bytesKept)} dep_blocks=${depBlocks} uses=${uses} bare_unguarded=${bareUnguarded} app_unguarded=${appUnguarded} lazy_flagged=${lazyFlagged.length} family_breaks=${familyBreaks} verdict=${verdict}`);
process.exit(verdict === 'PASS' ? 0 : 1);
