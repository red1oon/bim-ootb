#!/usr/bin/env node
// WITNESS — W-ASAP — §GANTT_RESCHEDULE_ASAP: explicit pull-back ("reschedule as early as possible")
// Spec: bim-compiler prompts/4D_GANTT_TM_REFACTOR.md lane — pull-back ships as a DELIBERATE,
// user-triggered action, never as a side-effect of an ordinary drag (§S68's annotate-only contract:
// moveTaskCascade is push-only by design, its own header says "never pull a successor earlier").
//
// ISSUE THIS PROVES OR DISPROVES:
//   The open product gap was that a task whose predecessor finished long ago keeps its late
//   persisted start forever — nothing in the edit surface could CLOSE provable float. The decided
//   shape is a new engine verb, ScheduleAuthor.rescheduleAsap, compression-only. Each check names
//   the property that would silently break the product decision if it regressed:
//
//   W-ASAP-1  gap closes      — a task with huge float (pred finished long before its stored start)
//                               is pulled back exactly onto its predecessor floor. Without this the
//                               button is a no-op and the feature does not exist.
//   W-ASAP-2  roots anchor    — a task with NO predecessors keeps its CURRENT start. Without this
//                               "compress" silently re-baselines the whole project to day zero.
//   W-ASAP-3  never later     — a task already AHEAD of its derived ES (violated constraint) is left
//                               byte-identical. Moving it later would turn compression into a
//                               generic re-solve — explicitly out of scope.
//   W-ASAP-4  transitive      — B's successor C is pulled through B's NEW position, not B's old one.
//                               A one-hop-only pass would leave downstream float unclosed.
//   W-ASAP-5  dryRun is dry   — opts.dryRun computes the same moved-set and writes NOTHING (the
//                               witness convention every other verb honours).
//   W-ASAP-6  real write      — without dryRun the dates land in `tasks`, duration-preserving, and
//                               untouched rows (root, summary, tight, ahead-of-floor) stay
//                               byte-identical.
//   W-ASAP-7  idempotent      — a second run reports moved=0: the schedule is at earliest float.
//   W-ASAP-8  wiring          — time_machine.js carries the transport-row button + a commit path
//                               with the full 7-step pipeline (lock → verb → retime → resync →
//                               annotate → persist → redraw). BRACE-MATCHED via namedFns, never a
//                               fixed slice window (§S65 G-COH-6 false-negative class, bitten twice).
//   W-ASAP-9  drag untouched  — moveTaskCascade still declares push-only. The explicit action must
//                               not have changed the implicit drag's semantics.
//
// Command: node viewer/tests/witness_gantt_reschedule_asap.js     (no browser, no building fixture)
'use strict';
const fs = require('fs');
const path = require('path');
const initSqlJs = require(path.join(__dirname, '..', '..', 'modeller', 'lib', 'sql-wasm.js'));

let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log('  PASS ' + msg); } else { fail++; console.log('  FAIL ' + msg); } }

// ── W-ASAP-8 / W-ASAP-9: source gates, brace-matched (same namedFns as witness_gantt_edit_persist) ──
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
const fn = FNS.find(f => f.name === 'rescheduleGanttAsap');
assert(!!fn, 'W-ASAP-8a rescheduleGanttAsap is defined in time_machine.js (brace-matched, not a comment mention)');
const PIPELINE = ['_tmEditLocked(', '.rescheduleAsap(', 'retimeTaskElements(', '_tmResyncAfterRetime(',
  '_tmAnnotateCpm(', '_tmPersistEdit(', 'invalidateGanttModel(', 'computeDays(', 'drawGanttMini(', 'renderAtTime('];
const missing = PIPELINE.filter(c => !fn || fn.body.indexOf(c) < 0);
console.log('§GANTT_RESCHEDULE_ASAP_WIRING pipelineCalls=' + (PIPELINE.length - missing.length) + '/' + PIPELINE.length +
  (missing.length ? ' MISSING [' + missing.join(' | ') + ']' : ''));
assert(missing.length === 0, 'W-ASAP-8b the commit path carries the FULL 7-step pipeline — a missing step here is the ' +
  '§S67/§S70 class of bug (stale canvas, unpersisted edit, stale critical path), not a style nit' +
  (missing.length ? ' — MISSING: ' + missing.join(', ') : ''));
// The lock must be checked BEFORE the verb runs — a lock check after the write is decoration.
assert(!!fn && fn.body.indexOf('_tmEditLocked(') < fn.body.indexOf('.rescheduleAsap('),
  'W-ASAP-8c _tmEditLocked is checked BEFORE the engine verb runs (mid-bake refusal, §S69 — the 9th edit path must not ship unlocked)');
assert(!!fn && /_lastEdit\s*=\s*\{/.test(fn.body),
  'W-ASAP-8d the edit is captured into _lastEdit — pull-back is undoable via ↺ Undo exactly like a drag (its restore loop is mode-agnostic)');
assert(/id="tm-reschedule-asap"/.test(src), 'W-ASAP-8e the transport-row button markup exists (#tm-reschedule-asap)');
assert(/getElementById\('tm-reschedule-asap'\)/.test(src) && /rescheduleGanttAsap\(\);/.test(src),
  'W-ASAP-8f the button is wired to the commit path (a button nothing listens to is not the feature)');

const SA_SRC = fs.readFileSync(path.join(__dirname, '..', 'schedule_author.js'), 'utf8');
const SA_FNS = namedFns(SA_SRC);
const verbFn = SA_FNS.find(f => f.name === 'rescheduleAsap');
assert(!!verbFn, 'W-ASAP-8g ScheduleAuthor.rescheduleAsap is a REAL brace-matched function in schedule_author.js');
assert(/rescheduleAsap:\s*rescheduleAsap/.test(SA_SRC), 'W-ASAP-8h it is exported on the API map (an unexported verb is unreachable from the TM)');
const mtcFn = SA_FNS.find(f => f.name === 'moveTaskCascade');
assert(!!mtcFn && mtcFn.body.indexOf('push-only: never pull a successor earlier') >= 0,
  'W-ASAP-9 moveTaskCascade STILL declares push-only — the explicit action did not change the implicit drag\'s ' +
  'semantics (the product decision: pull-back is a deliberate trigger, never a drag side-effect)');

// ─────────────────────────── behaviour: synthetic fixture, real verb ───────────────────────────
const ScheduleAuthor = require(path.join(__dirname, '..', 'schedule_author.js'));

initSqlJs({ wasmBinary: fs.readFileSync(path.join(__dirname, '..', '..', 'modeller', 'lib', 'sql-wasm.wasm')) }).then(function (SQL) {
  const db = new SQL.Database();
  const SCH = 'SCH_TEST';
  db.run('CREATE TABLE tasks (task_id TEXT PRIMARY KEY, schedule_id TEXT, name TEXT, is_summary INTEGER, ' +
    'schedule_start TEXT, schedule_finish TEXT, schedule_duration TEXT)');
  db.run('CREATE TABLE task_sequences (predecessor_id TEXT, successor_id TEXT, sequence_type TEXT, lag_days INTEGER)');
  // The fixture, one row per property under test:
  //   A     root, 2026-01-01 +10d → finishes 2026-01-11.
  //   B     pred A (FS). Stored start 2026-03-01 — a 49-day pure-float gap. MUST pull to 2026-01-11.
  //   C     pred B (FS lag 2). Stored 2026-03-15. MUST pull transitively through B's NEW finish
  //         (2026-01-16 + 2 = 2026-01-18), not B's old one (2026-03-06 + 2).
  //   R     root, no preds, 2026-02-01. MUST NOT move (anchor — W-ASAP-2).
  //   D     pred A (FS), stored start exactly 2026-01-11 (tight). MUST NOT move (ES == current).
  //   E     pred A (FS lag 30) ⇒ ES 2026-02-10, but stored 2026-01-20 (already AHEAD of its floor,
  //         an existing violation). MUST NOT move later (W-ASAP-3).
  //   S     summary row. MUST stay byte-identical (rolls up, never moved directly).
  const rows = [
    ['A', 0, '2026-01-01', '2026-01-11', 'P10D'],
    ['B', 0, '2026-03-01', '2026-03-06', 'P5D'],
    ['C', 0, '2026-03-15', '2026-03-20', 'P5D'],
    ['R', 0, '2026-02-01', '2026-02-08', 'P7D'],
    ['D', 0, '2026-01-11', '2026-01-14', 'P3D'],
    ['E', 0, '2026-01-20', '2026-01-25', 'P5D'],
    ['S', 1, '2026-01-01', '2026-03-20', null]
  ];
  const ins = db.prepare('INSERT INTO tasks VALUES (?,?,?,?,?,?,?)');
  rows.forEach(r => ins.run([r[0], SCH, 'task ' + r[0], r[1], r[2], r[3], r[4]]));
  ins.free();
  db.run("INSERT INTO task_sequences VALUES ('A','B','FS',0), ('B','C','FS',2), ('A','D','FS',0), ('A','E','FS',30)");

  const readAll = () => {
    const out = {};
    db.exec('SELECT task_id, schedule_start, schedule_finish, schedule_duration FROM tasks WHERE schedule_id=?', [SCH])[0]
      .values.forEach(r => { out[r[0]] = r[1] + '|' + r[2] + '|' + r[3]; });
    return out;
  };
  const before = readAll();

  // ── W-ASAP-5 + W-ASAP-1/2/3/4 computed half: dryRun.
  const dry = ScheduleAuthor.rescheduleAsap(db, SCH, { dryRun: true });
  assert(dry && dry.ok === true, 'RED-CONTROL: the verb ran on the fixture (ok=' + (dry && dry.ok) + ' reason=' + (dry && dry.reason) + ')');
  const dryById = {};
  (dry.moved || []).forEach(m => { dryById[m.id] = m; });
  console.log('§GANTT_RESCHEDULE_ASAP_DRY moved=[' + (dry.moved || []).map(m => m.id + '→' + m.start + '(-' + m.daysPulled + 'd)').join(' ') + ']' +
    ' PFbefore=' + dry.projectDurationBefore + 'd PFafter=' + dry.projectDurationAfter + 'd daysCompressed=' + dry.daysCompressed);
  assert(!!dryById.B && dryById.B.start === '2026-01-11',
    'W-ASAP-1 B\'s computed ES (' + (dryById.B && dryById.B.start) + ') is its predecessor floor 2026-01-11 — EARLIER than its stored 2026-03-01: the 49-day pure-float gap closes');
  assert(!!dryById.B && dryById.B.daysPulled === 49 && dryById.B.finish === '2026-01-16',
    'W-ASAP-1b B pulled exactly 49 days, duration preserved (finish=' + (dryById.B && dryById.B.finish) + ', 5d after start)');
  assert(!dryById.R, 'W-ASAP-2 root R (no predecessors) is NOT in the moved set — roots anchor, no silent re-baseline to day zero');
  assert(!dryById.A, 'W-ASAP-2b root A stays put too (both roots untouched, not just one lucky one)');
  assert(!dryById.E, 'W-ASAP-3 E (stored AHEAD of its 2026-02-10 floor) is NOT moved later — compression only, never a generic re-solve');
  assert(!dryById.D, 'W-ASAP-3b D (already tight on its floor, ES == current) is left alone');
  assert(!!dryById.C && dryById.C.start === '2026-01-18',
    'W-ASAP-4 C pulled TRANSITIVELY through B\'s NEW finish + lag 2 (got ' + (dryById.C && dryById.C.start) + ', want 2026-01-18) — a one-hop pass would have left C on B\'s OLD finish');
  assert((dry.moved || []).length === 2, 'W-ASAP-4b the moved set is EXACTLY {B, C} (n=' + (dry.moved || []).length + ') — nothing else in the fixture has closable float');
  const afterDry = readAll();
  const dryChanged = Object.keys(before).filter(id => before[id] !== afterDry[id]);
  assert(dryChanged.length === 0,
    'W-ASAP-5 dryRun wrote NOTHING — every tasks row byte-identical (changed=' + (dryChanged.length ? dryChanged.join(',') : 'none') + ')');

  // ── W-ASAP-6: the real write.
  const wet = ScheduleAuthor.rescheduleAsap(db, SCH, {});
  assert(wet && wet.ok && wet.moved.length === 2, 'W-ASAP-6a real run moved the same 2 tasks the dryRun computed');
  const afterWet = readAll();
  assert(afterWet.B === '2026-01-11|2026-01-16|P5D',
    'W-ASAP-6b B persisted at its floor, duration-preserving (got ' + afterWet.B + ')');
  assert(afterWet.C === '2026-01-18|2026-01-23|P5D',
    'W-ASAP-6c C persisted at its transitive floor (got ' + afterWet.C + ')');
  const untouched = ['A', 'R', 'D', 'E', 'S'].filter(id => before[id] !== afterWet[id]);
  assert(untouched.length === 0,
    'W-ASAP-6d every non-moved row (roots, tight, ahead-of-floor, summary) is byte-identical (changed=' + (untouched.length ? untouched.join(',') : 'none') + ')');
  // Old project finish = C's 2026-03-20. New project finish is NOT C's 2026-01-23 — after the pull,
  // the ANCHORED root R (untouched, finishing 2026-02-08) is the latest leaf, and the project finish
  // is max over ALL leaves. Mar 20 → Feb 8 = 40 days. This is itself a property under test: the
  // reported compression is bounded by what the anchors allow, never the naive moved-task delta.
  assert(wet.daysCompressed === 40 && wet.finishBefore === '2026-03-20' && wet.finishAfter === '2026-02-08',
    'W-ASAP-6e daysCompressed=' + wet.daysCompressed + ' (finish ' + wet.finishBefore + ' → ' + wet.finishAfter + ') — project finish is max over ALL leaves, so the anchored root R (2026-02-08) bounds it, want 40');

  // ── W-ASAP-7: idempotence.
  const again = ScheduleAuthor.rescheduleAsap(db, SCH, {});
  assert(again && again.ok && again.moved.length === 0 && again.daysCompressed === 0,
    'W-ASAP-7 a second run reports moved=0, compressed=0 — the schedule is AT earliest float, the verb converges (moved=' + (again && again.moved.length) + ')');

  // ── refusal shape: a schedule with no rows refuses loudly, never half-computes.
  const none = ScheduleAuthor.rescheduleAsap(db, 'SCH_NO_SUCH', {});
  assert(!!none && none.ok === false && none.reason === 'no_tasks',
    'W-ASAP-10 unknown schedule refuses with {ok:false, reason:no_tasks} — same honest-refusal convention as every other verb');

  console.log('§GANTT_RESCHEDULE_ASAP_SUMMARY pass=' + pass + ' fail=' + fail);
  if (fail) { console.error('FAIL — ' + fail + ' check(s) failed'); process.exit(1); }
  console.log('PASS — pull-back closes provable float only: roots anchor, nothing moves later, dryRun is dry, the drag stays push-only');
}).catch(function (e) {
  console.error('FAIL — witness threw: ' + (e && e.stack || e));
  process.exit(1);
});
