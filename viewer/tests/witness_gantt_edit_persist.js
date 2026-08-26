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
//   W-PERS-3  behaviour — _tmPersistEdit hands persistDb APP.db under APP._dbPersistUrl (falling
//                         back to APP.DB_URL only for a pre-§S78 build that never set it) and
//                         nothing else, and refuses when the url is missing or the cache is
//                         disabled. Passing the WRONG db under that key is not hypothetical: it
//                         cost a P0 in kernel_ops.js (§KRN_PERSIST_GUARD, 2026-06-12).
//
//   ⚠ SPLIT-MODE BLIND SPOT, CLOSED 2026-08-27 (§S5b). W-PERS-3 shipped with PR #1479 (§S70), when
//   _tmPersistEdit really did pass APP.DB_URL and nothing else. PR #1494 (§S78) then changed it to
//   `app._dbPersistUrl || app.DB_URL` — and never touched this file. Every W-PERS-3 fixture was a
//   hand-rolled { db, DB_URL } with NO _dbPersistUrl, so the `_dbPersistUrl ||` half of that
//   expression was never once evaluated: deleting it outright left this witness fully GREEN, on
//   all 14 checks. That is exactly the §S76 bug (a split-mode building's A.db is loaded from
//   metaUrl, so persisting under A.DB_URL writes a slot the reload never reads — the edit survives
//   the write and is silently unreachable). W-PERS-3f/3g/3h below make the split-mode routing
//   load-bearing; W-PERS-3f FAILS on the pre-§S78 line. See PRIMAL LAW #4 "scope-blind".
//
//   The round trip itself (drag → reload → new date still there) is proven live by the headless
//   probe recorded in §S70/§S78, NOT here: it needs a browser, an IndexedDB and a real building
//   load. This witness deliberately does not re-implement it — one verification, one owner:
//     node scripts/probe_splitmode_persist_direct.js Duplex     (whole-db)
//     node scripts/probe_splitmode_persist_direct.js Hospital   (split-mode)
//   That probe drives a real data-level edit → persist → fresh-browser reload → read-back, and
//   owns claim D6 (the round trip). What THIS witness owns is the routing decision the probe can
//   only observe on the one building it was pointed at: which url _tmPersistEdit chooses.
//
// ⚠ Brace-matched, never a fixed slice window (the G-COH-6 false-negative class, §S65).
//
// Command: node viewer/tests/witness_gantt_edit_persist.js     (no fixtures, no DB, no browser)
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0, inconclusive = 0;
function assert(cond, msg) { if (cond) { pass++; console.log('  PASS ' + msg); } else { fail++; console.log('  FAIL ' + msg); } }
// PRIMAL LAW #4: a witness must be able to say its population was empty. Here that is not a
// building count — it is "the split-mode url shape could not be EXTRACTED from streaming.js", in
// which case W-PERS-3f/3g would be judging a url I invented rather than the one the loader builds.
// Inventing it would make them pass forever; skipping silently would make them vacuous. So: say so.
function inconc(msg) { inconclusive++; console.log('  INCONCLUSIVE ' + msg); }

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
// ── The split-mode fixture is EXTRACTED, not invented (PRIME RULE).
// streaming.js derives the meta url from A.DB_URL and assigns it to A._dbPersistUrl at the exact
// point A.db is loaded from it (§TM_SPLITMODE_PERSIST_KEY, streaming.js :2199/:2202/:2316). Typing
// "buildings/Hospital_meta.db" here by hand would pin this witness to a url shape the loader is
// free to stop producing — the fixture would keep passing while the real derivation drifted. So
// the two derivation statements are lifted VERBATIM out of the shipped source and run.
const ST_SRC = fs.readFileSync(path.join(__dirname, '..', 'streaming.js'), 'utf8');
const DERIV = ST_SRC.split('\n').filter(l => /metaUrl\s*=\s*A\.DB_URL\.replace\(/.test(l)).map(l => l.trim());
function metaUrlFor(dbUrl) {
  if (!DERIV.length) return null;
  const s = {};
  vm.createContext(s);
  try {
    vm.runInContext('var A = { DB_URL: ' + JSON.stringify(dbUrl) + ' };\n' + DERIV.join('\n') + '\nthis.__m = metaUrl;', s);
  } catch (e) { return null; }
  return s.__m;
}
// Duplex is the measured whole-db building, Hospital the measured split-mode one — both confirmed
// by probe_splitmode_persist_direct.js's own §S78_STATE line, not assumed here.
const WHOLE_DB_URL = 'buildings/Duplex_extracted.db';
const SPLIT_DB_URL = 'buildings/Hospital_extracted.db';
const SPLIT_PERSIST_URL = metaUrlFor(SPLIT_DB_URL);
console.log('§GANTT_EDIT_PERSIST_SPLIT_FIXTURE derivStmts=' + DERIV.length +
  ' DB_URL=' + SPLIT_DB_URL + ' _dbPersistUrl=' + SPLIT_PERSIST_URL);

const realDb = { marker: 'APP.db' };
// Whole-db mode: streaming.js :2485 sets A._dbPersistUrl = A.DB_URL EXPLICITLY on this branch
// (not "leaves it unset"), so the fixture sets it too — that is the real shipped shape.
const ok = drive({ db: realDb, DB_URL: WHOLE_DB_URL, _dbPersistUrl: WHOLE_DB_URL });
assert(ok.got.length === 1, 'W-PERS-3a a normal edit reaches persistDb exactly once (n=' + ok.got.length + ')');
assert(ok.got.length === 1 && ok.got[0].db === realDb,
  'W-PERS-3b it passes APP.db ITSELF, not another db — writing a foreign db under the building key is the §KRN_PERSIST_GUARD P0');
assert(ok.got.length === 1 && ok.got[0].url === WHOLE_DB_URL,
  'W-PERS-3c whole-db mode: it hands persistDb APP._dbPersistUrl, which streaming.js set to APP.DB_URL — the url persistDb canonicalises into the slot cachedFetch reads (W-PERS-5)');

// ── W-PERS-3f/3g/3h — SPLIT MODE. THE GAP §S5b NAMED. ─────────────────────────────────────────
// A split-mode building's A.db holds _meta.db's bytes, so persisting under A.DB_URL
// (_extracted.db) writes a slot the reload path's cachedFetch(metaUrl) never reads. That is not a
// hypothetical: it shipped, was measured on Hospital/Clinic (§S76) and was fixed in §S78. Until
// today no fixture here set _dbPersistUrl at all, so the fix was untested by its own witness.
if (!DERIV.length || !SPLIT_PERSIST_URL || SPLIT_PERSIST_URL === SPLIT_DB_URL) {
  inconc('W-PERS-3f/3g split-mode routing NOT JUDGED — could not extract streaming.js\'s metaUrl ' +
    'derivation (derivStmts=' + DERIV.length + ' derived=' + SPLIT_PERSIST_URL + '). The population ' +
    'is empty, so a PASS here would mean nothing; treat split-mode persist as UNPROVEN and repair ' +
    'the extractor against streaming.js §TM_SPLITMODE_PERSIST_KEY.');
} else {
  const split = drive({ db: realDb, DB_URL: SPLIT_DB_URL, _dbPersistUrl: SPLIT_PERSIST_URL });
  assert(split.got.length === 1 && split.got[0].url === SPLIT_PERSIST_URL,
    'W-PERS-3f SPLIT MODE: persistDb gets APP._dbPersistUrl (' + SPLIT_PERSIST_URL + '), NOT APP.DB_URL (' +
    SPLIT_DB_URL + ') — got ' + (split.got.length ? split.got[0].url : 'NOTHING') +
    '. This is the §S76 bug: persisting under DB_URL writes a slot the reload never reads, so the edit vanishes.');
  assert(split.got.length === 1 && split.got[0].db === realDb,
    'W-PERS-3g SPLIT MODE: still APP.db itself under that url — a right slot with the wrong db is the same P0 as 3b');
}
// The `||` fallback is real code and must keep working: a profile still running a pre-§S78 build
// never set _dbPersistUrl, and MUST NOT lose its persist entirely.
const legacy = drive({ db: realDb, DB_URL: SPLIT_DB_URL });
assert(legacy.got.length === 1 && legacy.got[0].url === SPLIT_DB_URL,
  'W-PERS-3h legacy build with no _dbPersistUrl still persists under DB_URL — the `||` fallback is a real branch, not dead code');

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

// W-PERS-5f — RED CONTROL for W-PERS-3f. 3f only means something if _dbPersistUrl and DB_URL land
// in DIFFERENT IDB slots; if they canonicalised to the same key, picking the wrong one would be
// harmless and 3f would be theatre. Measured by the probe on the real fleet (§S78_KEYS, Hospital:
// write=buildings/Hospital_meta.db vs readKeyWhole=buildings/Hospital_extracted.db).
if (SPLIT_PERSIST_URL && SPLIT_PERSIST_URL !== SPLIT_DB_URL) {
  const kSplit = SAmod._cacheKeyFor(SPLIT_PERSIST_URL), kWhole = SAmod._cacheKeyFor(SPLIT_DB_URL);
  console.log('§GANTT_EDIT_PERSIST_SPLIT_KEYS persist=' + kSplit + ' dbUrl=' + kWhole);
  assert(kSplit !== kWhole,
    'W-PERS-5f RED CONTROL: the split-mode persist url and DB_URL canonicalise to DIFFERENT cache keys (' +
    kSplit + ' vs ' + kWhole + ') — so choosing the wrong one in W-PERS-3f really does write a slot nothing reads');
} else {
  inconc('W-PERS-5f split-mode key divergence NOT JUDGED — no extracted split url to compare (see W-PERS-3f)');
}

console.log('§GANTT_EDIT_PERSIST_SUMMARY pass=' + pass + ' fail=' + fail + ' inconclusive=' + inconclusive);
if (fail) { console.error('FAIL — ' + fail + ' check(s) failed'); process.exit(1); }
if (inconclusive) {
  console.error('INCONCLUSIVE — ' + inconclusive + ' check(s) judged an EMPTY population; this is not a PASS');
  process.exit(2);
}
console.log('PASS — every Gantt edit path persists (split-mode included), the cold path does not');
