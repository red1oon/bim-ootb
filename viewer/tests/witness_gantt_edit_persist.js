#!/usr/bin/env node
// WITNESS — W-PERS — §GANTT_EDIT_PERSIST: an in-canvas Gantt edit survives a reload
// Spec: bim-compiler prompts/4D_GANTT_TM_REFACTOR.md §S70.
//
// ISSUE THIS PROVES OR DISPROVES:
//   Every edit made in the Time Machine's Gantt drawer — drag, ruler shift, group move, undo, link,
//   unlink, typed apply — lived ONLY in the in-memory sql.js db and died on reload. Verified on
//   origin/main before the fix: ScheduleAuthor.persistDb had exactly two callers
//   (schedule_editor_ui.js — the Editor tab, since deleted and folded into the TM panel,
//   §TM_P6_FOLD 2026-08-24 — and schedule_author_ui.js), neither in time_machine.js; and
//   retimeTaskElements writes kernel_ops with raw SQL rather than through KernelOps' commit API, so
//   kernel_ops.js's own debounced persist never fired for a Gantt edit either.
//
//   This is the SAME gap the Editor tab closed for itself — its own comment called it
//   "the gap that made every schedule edit vanish on tab close" (§SE-6) — on the same db, the same
//   IDB slot, through the same verb. So: a gap, not a design choice.
//
//   W-PERS-1  wiring    — every edit commit path calls _tmPersistEdit().
//   W-PERS-2  exemption — buildTaskIndex's stale-schedule REGEN does NOT, on purpose: it runs on a
//                         plain page load, and persisting there would turn every ordinary visit to a
//                         252MB building into a 252MB IDB write. A regen is reproducible; an edit is not.
//   W-PERS-3  behaviour — _tmPersistEdit hands persistDb APP.db under APP.DB_URL and nothing else,
//                         and refuses when the url is missing or the cache is disabled. Passing the
//                         WRONG db under that key is not hypothetical: it cost a P0 in kernel_ops.js
//                         (§KRN_PERSIST_GUARD, 2026-06-12).
//
//   The round trip itself (drag → reload → new date still there) is proven live by the headless
//   probe recorded in §S70, not here: it needs a browser, an IndexedDB and a real building load.
//
// ⚠ Brace-matched, never a fixed slice window (the G-COH-6 false-negative class, §S65).
//
// Command: node viewer/tests/witness_gantt_edit_persist.js     (no fixtures, no DB, no browser)
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log('  PASS ' + msg); } else { fail++; console.log('  FAIL ' + msg); } }

const TM = path.join(__dirname, '..', 'time_machine.js');
const src = fs.readFileSync(TM, 'utf8');

function namedFns(text) {
  const out = [];
  const re = /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g;
  let m;
  while ((m = re.exec(text))) {
    const open = text.indexOf('{', m.index);
    if (open < 0) continue;
    let depth = 0, end = -1;
    for (let i = open; i < text.length; i++) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
    }
    if (end > 0) out.push({ name: m[1], start: m.index, end: end, body: text.slice(m.index, end) });
  }
  return out;
}
const FNS = namedFns(src);
function enclosingFn(idx) {
  let best = null;
  for (const f of FNS) if (f.start < idx && idx < f.end && (!best || (f.end - f.start) < (best.end - best.start))) best = f;
  return best;
}
const lineOf = idx => src.slice(0, idx).split('\n').length;

console.log('── witness_gantt_edit_persist (§S70) ──');

const persistFn = FNS.find(f => f.name === '_tmPersistEdit');
assert(!!persistFn, 'W-PERS-0 _tmPersistEdit is defined in time_machine.js — without it every Gantt edit still dies on reload');
if (!persistFn) { console.log('§GANTT_EDIT_PERSIST_SUMMARY pass=' + pass + ' fail=' + fail); process.exit(1); }

// ── W-PERS-1: every re-time path persists.
const CALL = 'retimeTaskElements(';
const sites = [];
for (let i = src.indexOf(CALL); i >= 0; i = src.indexOf(CALL, i + 1)) {
  if (/function\s+$/.test(src.slice(Math.max(0, i - 12), i))) continue;
  sites.push(i);
}
assert(sites.length >= 5, 'W-PERS-1a retimeTaskElements call sites found (n=' + sites.length +
  ') — a 0 means the function was renamed and this gate went blind, not that the wiring is clean');
const missing = [], seen = {};
for (const s of sites) {
  const fn = enclosingFn(s);
  if (!fn) { missing.push('line ' + lineOf(s)); continue; }
  if (seen[fn.name]) continue;
  seen[fn.name] = 1;
  if (fn.body.indexOf('_tmPersistEdit(') < 0) missing.push(fn.name + '() at line ' + lineOf(fn.start));
}
console.log('§GANTT_EDIT_PERSIST_WIRING retimeSites=' + sites.length + ' distinctFns=' + Object.keys(seen).length +
  ' missingPersist=' + missing.length + (missing.length ? ' [' + missing.join(' | ') + ']' : ''));
assert(missing.length === 0, 'W-PERS-1 every function that re-times elements also persists — ' +
  (missing.length ? 'MISSING in ' + missing.join(', ') : 'all ' + Object.keys(seen).length + ' clean'));

const undoFn = FNS.find(f => f.name === 'undoLastGanttEdit');
assert(!!undoFn && undoFn.body.indexOf('_tmPersistEdit(') >= 0,
  'W-PERS-1b undoLastGanttEdit persists too — it mutates by restoring rows directly, so the wiring gate above cannot see it, and an un-persisted undo would silently come back on reload');

// ── W-PERS-2: the deliberate exemption stays exempt.
const btiFn = FNS.find(f => f.name === 'buildTaskIndex');
assert(!!btiFn && btiFn.body.indexOf('_tmPersistEdit(') < 0,
  'W-PERS-2 buildTaskIndex (the §GANTT_SCHEDULE_STALE regen) does NOT persist — it runs on a plain page load, and wiring it would put a whole-db IDB write (252MB on Hospital) on every ordinary visit');

// ── W-PERS-3: behaviour, in a sandbox. What persistDb actually receives.
function drive(app) {
  const got = [];
  const logs = [];
  const sandbox = {
    console: { log: (...a) => logs.push(a.join(' ')), warn: () => {} },
    window: { ScheduleAuthor: { persistDb: (db, url, opts) => { got.push({ db, url, opts }); return Promise.resolve(true); } } },
    A: () => app
  };
  sandbox.window.window = sandbox.window;
  vm.createContext(sandbox);
  vm.runInContext(persistFn.body + '\nthis.__p = _tmPersistEdit;', sandbox);
  sandbox.__p('probe');
  return { got, logs };
}
const realDb = { marker: 'APP.db' };
const ok = drive({ db: realDb, DB_URL: 'buildings/Hospital_extracted.db' });
assert(ok.got.length === 1, 'W-PERS-3a a normal edit reaches persistDb exactly once (n=' + ok.got.length + ')');
assert(ok.got.length === 1 && ok.got[0].db === realDb,
  'W-PERS-3b it passes APP.db ITSELF, not another db — writing a foreign db under the building key is the §KRN_PERSIST_GUARD P0');
assert(ok.got.length === 1 && ok.got[0].url === 'buildings/Hospital_extracted.db',
  'W-PERS-3c it hands persistDb APP.DB_URL — the url persistDb canonicalises into the slot cachedFetch reads (W-PERS-5)');

const noUrl = drive({ db: realDb });
assert(noUrl.got.length === 0 && noUrl.logs.some(l => l.indexOf('reason=no_db_url') >= 0),
  'W-PERS-3d no DB_URL: refuses LOUDLY and writes nothing (' + (noUrl.logs[0] || 'no log') + ')');

const disabled = drive({ db: realDb, DB_URL: 'x.db', _cacheDisabled: true });
assert(disabled.got.length === 0 && disabled.logs.some(l => l.indexOf('reason=cache_disabled') >= 0),
  'W-PERS-3e _cacheDisabled (incognito / low quota): refuses LOUDLY and writes nothing — same guard kernel_ops.js uses');

// ── W-PERS-5: the write must land in the slot the READER reads. This is not theoretical — it is
// what the live round-trip caught. The drag persisted (§SCHED_PERSIST ok=true, 15264KB), the reload
// hit the cache (§CACHE_HIT 14.3MB) and the edit was GONE: scene.js's cachedFetch looks up
// DbResolve.cacheKey(url), every persist path wrote the RAW url, and cachedFetch reads the raw url
// only as a LEGACY fallback when the canonical key misses. On any profile that had loaded the
// building normally, every persisted edit went somewhere nothing reads.
const SA_SRC = fs.readFileSync(path.join(__dirname, '..', 'schedule_author.js'), 'utf8');
const KO_SRC = fs.readFileSync(path.join(__dirname, '..', 'kernel_ops.js'), 'utf8');
const SA_FNS = namedFns(SA_SRC);
const persistDbFn = SA_FNS.find(f => f.name === 'persistDb');
assert(!!persistDbFn && /put\(buf,\s*key\)/.test(persistDbFn.body) && /_cacheKeyFor\(url\)/.test(persistDbFn.body),
  'W-PERS-5a ScheduleAuthor.persistDb writes under the canonical cacheKey, not the raw url');
const koFn = namedFns(KO_SRC).find(f => f.name === '_persistToIdb');
assert(!!koFn && /put\(buf,\s*dbKey\)/.test(koFn.body) && /DbResolve\.cacheKey/.test(koFn.body),
  'W-PERS-5b kernel_ops.js persists under the same canonical key — its "survive refresh" had the identical defect');
// (W-PERS-5c retired 2026-08-24 with the Editor tab itself, §TM_P6_FOLD: it gated the deleted
// schedule_editor_ui.js's _idbGetDb read-key derivation. The surviving reader is scene.js's
// cachedFetch via DbResolve.cacheKey — exactly what W-PERS-5b and W-PERS-5d already gate.)

// Behavioural: the helper and the reader's own function must agree, on real url shapes.
const DbResolve = require(path.join(__dirname, '..', 'db_resolve.js'));
global.window = { DbResolve: DbResolve };
const SAmod = require(path.join(__dirname, '..', 'schedule_author.js'));
const SHAPES = ['/buildings/Duplex_extracted.db', 'buildings/Hospital_extracted.db',
  'buildings/Terminal_extracted.db?v=3', 'https://objectstorage.example/x/buildings/JKR_extracted.db',
  '/deploy/dev/buildings/Terminal_extracted.db', 'import://scratch'];
const disagree = SHAPES.filter(u => SAmod._cacheKeyFor(u) !== DbResolve.cacheKey(u));
console.log('§SCHED_PERSIST_KEY ' + SHAPES.map(u => u.split('/').pop() + '→' + SAmod._cacheKeyFor(u)).join(' · '));
assert(disagree.length === 0, 'W-PERS-5d persistDb\'s key derivation agrees with DbResolve.cacheKey on every url shape' +
  (disagree.length ? ' — DISAGREES on ' + disagree.join(', ') : ' (' + SHAPES.length + ' shapes)'));
assert(SAmod._cacheKeyFor('/buildings/Duplex_extracted.db') !== '/buildings/Duplex_extracted.db',
  'W-PERS-5e RED CONTROL: the canonical key really does differ from the raw url for a normal viewer url — otherwise this whole fix would be a no-op and W-PERS-5d would pass trivially');

console.log('§GANTT_EDIT_PERSIST_SUMMARY pass=' + pass + ' fail=' + fail);
if (fail) { console.error('FAIL — ' + fail + ' check(s) failed'); process.exit(1); }
console.log('PASS — every Gantt edit path persists, the cold path does not');
