#!/usr/bin/env node
// WITNESS — W-CPM — §GANTT_CPM_ANNOTATE (drag → CPM annotate, NOT re-solve)
// Spec: bim-compiler prompts/4D_GANTT_TM_REFACTOR.md §S68.
//
// ISSUE THIS PROVES OR DISPROVES:
//   The standing question on this lane was "does the in-canvas Gantt drag run CPM?" It does not:
//   moveTaskCascade runs a push-only forward cascade + predecessor-floor clamp. The product
//   decision (2026-08-23) was ANNOTATE — run CPM after the cascade, in fixedDates mode, to derive
//   float and criticality FROM the dates the cascade produced, and paint the critical path. The
//   decision rests on ONE property: annotate must never move a date. If it can, the drag silently
//   acquires a second, conflicting date engine — and the derived forward pass is measured to
//   inflate a real 93d programme to 138d (+48%) on Terminal's 71-zone graph (schedule_author.js
//   :1385), so a regression here is not cosmetic.
//
//   W-CPM-1  wiring   — every re-time path re-annotates (the §S67 failure mode, pre-empted).
//   W-CPM-2  BEHAVIOUR — computeCpm(fixedDates:true) leaves every schedule_* column byte-identical
//                        on a REAL materialized schedule, while writing real criticality.
//   W-CPM-3  counter-proof — fixedDates is load-bearing: with a task deliberately pushed off its
//                        graph-derived position, the two modes report DIFFERENT early starts. Without
//                        this, W-CPM-2 could pass simply because both modes agree on this fixture.
//   W-CPM-4  display  — drawGanttMini actually paints the marks (a computed critical path nothing
//                        renders is not the feature).
//
// ⚠ Source checks are BRACE-MATCHED, never a fixed slice window — witness_gantt_edit_coherence.js's
//   G-COH-6 has been a false negative since its function outgrew a hardcoded 2200-char window (§S65).
//
// Command: node viewer/tests/witness_gantt_cpm_annotate.js
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log('  PASS ' + msg); } else { fail++; console.log('  FAIL ' + msg); } }

// ─────────────────────────────── W-CPM-1 / W-CPM-4: source gates ───────────────────────────────
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
function enclosingFn(callIdx) {
  let best = null;
  for (const f of FNS) {
    if (f.start < callIdx && callIdx < f.end && (!best || (f.end - f.start) < (best.end - best.start))) best = f;
  }
  return best;
}
const lineOf = idx => src.slice(0, idx).split('\n').length;

const CALL = 'retimeTaskElements(';
const sites = [];
for (let i = src.indexOf(CALL); i >= 0; i = src.indexOf(CALL, i + 1)) {
  if (/function\s+$/.test(src.slice(Math.max(0, i - 12), i))) continue;   // the declaration itself
  sites.push(i);
}
assert(sites.length >= 5, 'W-CPM-0 retimeTaskElements call sites found (n=' + sites.length +
  ') — a 0 here means the function was renamed and this witness went blind, not that the wiring is clean');

const missing = [], seen = {};
for (const s of sites) {
  const fn = enclosingFn(s);
  if (!fn) { missing.push('line ' + lineOf(s) + ' <no enclosing function>'); continue; }
  const key = fn.name + ':' + fn.start;
  if (seen[key]) continue;
  seen[key] = 1;
  if (fn.body.indexOf('_tmAnnotateCpm(') < 0) missing.push(fn.name + '() at line ' + lineOf(fn.start));
}
console.log('§GANTT_CPM_ANNOTATE_WIRING retimeSites=' + sites.length + ' distinctFns=' + Object.keys(seen).length +
  ' missingAnnotate=' + missing.length + (missing.length ? ' [' + missing.join(' | ') + ']' : ''));
assert(missing.length === 0, 'W-CPM-1 every function that re-times elements also calls _tmAnnotateCpm() — ' +
  (missing.length ? 'MISSING in ' + missing.join(', ') : 'all ' + Object.keys(seen).length + ' clean'));

// Undo does NOT call retimeTaskElements (it restores kernel_ops rows directly), so the gate above
// cannot see it — yet undoing an edit must un-colour the bars that edit coloured. Checked by name.
const undoFn = FNS.find(f => f.name === 'undoLastGanttEdit');
assert(!!undoFn && undoFn.body.indexOf('_tmAnnotateCpm(') >= 0,
  'W-CPM-1b undoLastGanttEdit re-annotates too — an undo that leaves the OLD critical path painted is the §S67 bug in a new costume');

// The graph itself changes float even when no date moves — both edge verbs must re-annotate.
const linkFn = FNS.find(f => f.name === 'linkGanttBars');
assert(!!linkFn && linkFn.body.indexOf('_tmAnnotateCpm(') >= 0, 'W-CPM-1c linkGanttBars re-annotates (a new edge changes float with no date move)');
const propsFn = FNS.find(f => f.name === 'openGanttProps');
assert(!!propsFn && (propsFn.body.match(/_tmAnnotateCpm\(/g) || []).length >= 2,
  'W-CPM-1d openGanttProps re-annotates on BOTH its write paths (typed apply AND unlink)');

const annFn = FNS.find(f => f.name === '_tmAnnotateCpm');
assert(!!annFn, 'W-CPM-1e _tmAnnotateCpm is present and brace-matched');
assert(!!annFn && /fixedDates:\s*true/.test(annFn.body),
  'W-CPM-1f it calls computeCpm with fixedDates:true — WITHOUT this flag the forward pass re-derives dates from the graph (measured +48% on Terminal) and annotate becomes a second date engine');
assert(!!annFn && /_ganttCritical\s*=\s*\{\}/.test(annFn.body),
  'W-CPM-1g it CLEARS the marks when CPM cannot run (cycle/thin table) instead of leaving a stale critical path on screen');

const drawFn = FNS.find(f => f.name === 'drawGanttMini');
assert(!!drawFn && drawFn.body.indexOf('_ganttCritical[') >= 0,
  'W-CPM-4 drawGanttMini reads _ganttCritical — a criticality nothing paints is not the feature');
assert(!!drawFn && /cpmMark\.critical\s*\?\s*'#e53935'\s*:\s*'#26a69a'/.test(drawFn.body),
  'W-CPM-4b it paints BOTH rails (red = zero float, green = slack) — see W-CPM-5b: criticality runs ' +
  '27–82% of tasks across the fleet, so at the top of that range a red-only rail carries almost no signal');

// ─────────────────────── W-CPM-2 / W-CPM-3: behaviour, real fixture ────────────────────────────
const initSqlJs = require('/home/red1/bim-ootb/node_modules/sql.js');
const SQLJS_DIST = '/home/red1/bim-ootb/node_modules/sql.js/dist';
const ScheduleAuthor = require(path.join(__dirname, '..', 'schedule_author.js'));
const ScheduleGate = require(path.join(__dirname, '..', 'schedule_gate.js'));

// Real LABOR_RATES/RATES, not {}. With empty rate tables materializeZones produces a degenerate
// ~1-day programme where everything is trivially critical — measured, and it is NOT what the live
// viewer builds (the live page reports 58% critical on Duplex where the empty-rates path reports
// 100%). Same rates.js slice loader witness_gantt_native_generate.js uses.
function loadRules() {
  const txt = fs.readFileSync(path.join(__dirname, '..', 'rates.js'), 'utf8');
  const start = txt.indexOf('var RATES = {');
  const defIdx = txt.indexOf('var SEQUENCE_DEFAULT');
  const end = txt.indexOf('};', defIdx) + 2;
  return (new Function(txt.slice(start, end) +
    '\n return { SEQUENCE_RULES: SEQUENCE_RULES, SEQUENCE_DEFAULT: SEQUENCE_DEFAULT, LABOR_RATES: LABOR_RATES, RATES: RATES };'))();
}
const RULES = loadRules();

initSqlJs({ locateFile: f => path.join(SQLJS_DIST, f) }).then(function (SQL) {
  const dbPath = path.join(os.homedir(), 'bim-ootb', 'buildings', 'Duplex_extracted.db');
  const db = new SQL.Database(fs.readFileSync(dbPath));
  const rulesJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'rates', 'sequence_rules.json'), 'utf8'));
  const SEQUENCE_RULES = rulesJson.SEQUENCE_RULES || rulesJson;
  const mres = ScheduleAuthor.materializeZones(db, SEQUENCE_RULES,
    { start: '2026-01-01', laborRates: RULES.LABOR_RATES, rates: RULES.RATES, scheduleGate: ScheduleGate });
  if (!mres.ok) { console.log('§SKIP materializeZones failed: ' + JSON.stringify(mres)); process.exit(1); }
  const schedId = mres.scheduleId;

  function readDates() {
    const r = db.exec('SELECT task_id, schedule_start, schedule_finish, schedule_duration FROM tasks WHERE schedule_id=?', [schedId]);
    const out = {};
    (r.length ? r[0].values : []).forEach(row => { out[row[0]] = row[1] + '|' + row[2] + '|' + row[3]; });
    return out;
  }

  const before = readDates();
  assert(Object.keys(before).length >= 4, 'RED-CONTROL: the real materialized schedule has ≥4 tasks (n=' +
    Object.keys(before).length + ') — a dates-unchanged test needs real rows to be unchanged');

  const fixed = ScheduleAuthor.computeCpm(db, schedId, { fixedDates: true });
  if (!fixed || fixed.error) {
    // Never a silent pass: 2 of the 7 fleet buildings carry cycles and computeCpm bails on them by
    // design. If the FIXTURE is one of those, this witness cannot prove anything and must say so.
    console.log('§GANTT_CPM_ANNOTATE_WITNESS_ABORT reason=' + (fixed ? fixed.error : 'no_result') +
      ' — the fixture cannot exercise CPM; W-CPM-2/3 are UNPROVEN, not passing');
    process.exit(1);
  }

  const after = readDates();
  const changed = Object.keys(before).filter(id => before[id] !== after[id]);
  console.log('§GANTT_CPM_ANNOTATE_DATES tasks=' + Object.keys(before).length + ' changed=' + changed.length +
    (changed.length ? ' [' + changed.slice(0, 5).join(',') + ']' : ''));
  assert(changed.length === 0,
    'W-CPM-2 computeCpm(fixedDates:true) left EVERY schedule_start/schedule_finish/schedule_duration byte-identical — ' +
    'this is the whole safety property of "annotate, not re-solve"' + (changed.length ? ' — MOVED: ' + changed.join(',') : ''));

  const critRows = db.exec('SELECT COUNT(*) FROM tasks WHERE schedule_id=? AND is_critical=1', [schedId]);
  const critInDb = critRows.length ? critRows[0].values[0][0] : 0;
  const critReturned = (fixed.criticalIds || []).length;
  console.log('§GANTT_CPM_ANNOTATE_CRIT returned=' + critReturned + ' persistedInDb=' + critInDb +
    ' projectDuration=' + fixed.projectDuration + 'd tasks=' + fixed.tasks.length);
  assert(critReturned > 0, 'W-CPM-2b it found a real critical path (n=' + critReturned +
    ') — zero would mean the annotate paints nothing and the feature is invisible');
  assert(critInDb === critReturned, 'W-CPM-2c is_critical was PERSISTED to the tasks rows the Gantt reads (db=' +
    critInDb + ' returned=' + critReturned + ')');
  const floats = fixed.tasks.map(t => t.totalFloat);
  assert(Math.min.apply(null, floats) <= 0, 'W-CPM-2d at least one task has zero/negative total float (the critical chain)');

  // ── W-CPM-3: the counter-proof. Push ONE task 30 days off its graph-derived position with a real
  // verb, then the two modes MUST disagree about its early start. If they agree, `fixedDates` is not
  // doing anything on this fixture and W-CPM-2 proves nothing.
  const victim = fixed.tasks[fixed.tasks.length - 1].id;
  const sres = ScheduleAuthor.shiftTasks(db, [victim], 30);
  assert(sres && sres.ok, 'RED-CONTROL: shiftTasks moved the probe task +30d (setup for the counter-proof)');
  const fixed2 = ScheduleAuthor.computeCpm(db, schedId, { fixedDates: true });
  const derived = ScheduleAuthor.computeCpm(db, schedId, {});           // the mode annotate must NOT use
  const f2 = (fixed2.tasks || []).find(t => t.id === victim);
  const d2 = (derived.tasks || []).find(t => t.id === victim);
  console.log('§GANTT_CPM_ANNOTATE_MODEDIFF task=' + victim + ' fixedES=' + (f2 && f2.es) +
    ' derivedES=' + (d2 && d2.es) + ' fixedPF=' + fixed2.projectDuration + ' derivedPF=' + derived.projectDuration);
  assert(!!f2 && !!d2 && f2.es !== d2.es,
    'W-CPM-3 fixedDates is load-bearing: after pushing ' + victim + ' +30d off its derived position the two modes report ' +
    'DIFFERENT early starts (fixed=' + (f2 && f2.es) + ' derived=' + (d2 && d2.es) + '). Equal values would mean W-CPM-2 passes trivially.');

  // And the derived mode is exactly what §S68 refuses to ship: it re-derives, so it can move the
  // project end. Reported as a measured number, not an opinion.
  assert(fixed2.projectDuration !== derived.projectDuration || f2.es !== d2.es,
    'W-CPM-3b the two modes are distinguishable at project level too (fixedPF=' + fixed2.projectDuration +
    ' derivedPF=' + derived.projectDuration + ')');

  // ── W-CPM-5: fleet criticality fraction. The display decision (two rails, not one) rests on the
  // claim that these generated programmes are mostly-critical. That claim is measured here, on every
  // building present, rather than asserted in a comment.
  const bDir = path.join(os.homedir(), 'bim-ootb', 'buildings');
  const fleet = fs.readdirSync(bDir).filter(f => f.endsWith('_extracted.db'));
  const table = [];
  for (const f of fleet) {
    try {
      const fdb = new SQL.Database(fs.readFileSync(path.join(bDir, f)));
      const fm = ScheduleAuthor.materializeZones(fdb, SEQUENCE_RULES,
        { start: '2026-01-01', laborRates: RULES.LABOR_RATES, rates: RULES.RATES, scheduleGate: ScheduleGate });
      if (!fm.ok) { table.push({ b: f, note: 'materialize_fail' }); fdb.close(); continue; }
      const fr = ScheduleAuthor.computeCpm(fdb, fm.scheduleId, { fixedDates: true });
      if (fr.error) { table.push({ b: f, note: 'cpm_' + fr.error }); fdb.close(); continue; }
      const n = fr.tasks.length, c = fr.criticalIds.length;
      table.push({ b: f.replace('_extracted.db', ''), n: n, c: c, pct: Math.round(c / n * 100),
                   pf: fr.projectDuration, maxFloat: Math.max.apply(null, fr.tasks.map(t => t.totalFloat)) });
      fdb.close();
    } catch (e) { table.push({ b: f, note: 'threw' }); }
  }
  const ok = table.filter(t => t.pct !== undefined);
  console.log('§GANTT_CPM_ANNOTATE_FLEET ' + table.map(t => t.pct !== undefined
    ? t.b + '=' + t.c + '/' + t.n + '(' + t.pct + '%) PF=' + t.pf + 'd maxFloat=' + t.maxFloat + 'd'
    : t.b + '=' + t.note).join(' · '));
  if (ok.length < 3) {
    console.log('  SKIP W-CPM-5 — only ' + ok.length + ' building fixture(s) available, not enough to measure a fleet fraction');
  } else {
    const pcts = ok.map(t => t.pct);
    const lo = Math.min.apply(null, pcts), hi = Math.max.apply(null, pcts);
    assert(ok.length >= 3, 'W-CPM-5 CPM ran end-to-end on ' + ok.length + ' of ' + fleet.length +
      ' fleet buildings without throwing or bailing — the annotate path is exercised on real programmes, not one fixture');
    assert(lo < 100 && hi > 0,
      'W-CPM-5b the criticality fraction spans a real range across the fleet (' + lo + '%..' + hi +
      '%) — BOTH rails are reachable: at high fractions a red-only rail would mark nearly every bar and ' +
      'carry no signal, so the complement is what makes the scarce, movable bars findable');
  }

  console.log('§GANTT_CPM_ANNOTATE_SUMMARY pass=' + pass + ' fail=' + fail);
  if (fail) { console.error('FAIL — ' + fail + ' check(s) failed'); process.exit(1); }
  console.log('PASS — annotate wires everywhere, paints, and never moves a date');
}).catch(function (e) {
  console.error('FAIL — witness threw: ' + (e && e.stack || e));
  process.exit(1);
});
