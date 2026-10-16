#!/usr/bin/env node
/**
 * witness_bake_plays_schedule.js — the film's build-up cursor is driven by the REAL schedule (§S57).
 *
 * Implementing bim-compiler prompts/SCRIPT_LENGTH_REFACTOR_SEAMS.md §S57 — Witness: W-BAKE
 *
 * THE ISSUE. §CPE_BUILDUP_FOLLOW_TM says the film PLAYS the Time Machine and never authors a build
 * order. The whole coupling is one call: cinema_maxq.js's _workPacingArm() asks time_machine.js for
 * window.tmWorkSchedule(), and _workCursorAt() then maps film time onto that schedule's completion
 * instants. Since #1442 the cell-grain engine changed what that schedule CONTAINS, and nothing has
 * checked the coupling since — every proof in the 4D lane is about the schedule, none about the
 * film that plays it.
 *
 * WHY THIS IS HEADLESS AND NUMERIC. The project's rule is that continuous behaviour is proved by
 * §-log values and numbers computed from real state, never by watching a recording. So this does not
 * bake: it drives the SHIPPED pure mappings (tmWorkSchedule, _workCursorAt — both exported by their
 * files "for the witness … instead of sitting through a bake") over a REAL building's schedule,
 * generated here by the shipped engine from the shipped DB. Every number below is measured.
 *
 * WHAT IT CANNOT PROVE, said plainly: that a real Alt+C bake renders frames, encodes video, or looks
 * correct. It proves the build-order coupling only. A bake that fails for a rendering reason is out
 * of this witness's scope and would need a live run.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const initSqlJs = require(path.join(__dirname, '..', '..', 'modeller', 'lib', 'sql-wasm.js'));
const ScheduleGate = require(path.join(__dirname, '..', 'schedule_gate.js'));
const ScheduleAuthor = require(path.join(__dirname, '..', 'schedule_author.js'));

let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log('  PASS ' + msg); } else { fail++; console.log('  FAIL ' + msg); } }

// decl lets us slice an assigned function expression (window.X = function () {...}) as well as a
// plain declaration — tmWorkSchedule is the former, _workCursorAt the latter.
function sliceFn(src, name, decl) {
  const idx = decl ? src.indexOf(decl) : src.indexOf('function ' + name + '(');
  if (idx < 0) throw new Error(name + ' not found');
  let d = 0, i = idx, open = false;
  for (; i < src.length; i++) {
    if (src[i] === '{') { d++; open = true; }
    else if (src[i] === '}') { d--; if (open && d === 0) break; }
  }
  return src.slice(idx, i + 1);
}

const tmSrc = fs.readFileSync(path.join(__dirname, '..', 'time_machine.js'), 'utf8');
const mqSrc = fs.readFileSync(path.join(__dirname, '..', 'cinema_maxq.js'), 'utf8');
const BLD_DIR = process.env.BLD_DIR || path.join(require('os').homedir(), 'bim-ootb', 'buildings');
const BUILDINGS = (process.env.BAKE_BUILDINGS || 'Hospital_extracted,Clinic_extracted').split(',');

// The film→TM seam, asserted as TEXT before any measurement: if cinema_maxq stops asking
// time_machine for the schedule, every number below would still look fine while the film had
// quietly gone back to authoring its own pacing.
assert(/window\.tmWorkSchedule/.test(mqSrc),
  'W-BAKE-0a cinema_maxq.js asks time_machine.js for the schedule (window.tmWorkSchedule) — the coupling exists');
assert(/window\.tmWorkSchedule = function/.test(tmSrc),
  'W-BAKE-0b time_machine.js publishes tmWorkSchedule — the other half of the seam');

async function main() {
  const SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(__dirname, '..', '..', 'modeller', 'lib', 'sql-wasm.wasm')) });
  const ratesSrc = fs.readFileSync(path.join(__dirname, '..', 'rates.js'), 'utf8');
  const RATES = (new Function(ratesSrc +
    '\nreturn {SEQUENCE_RULES:SEQUENCE_RULES, SEQUENCE_DEFAULT:SEQUENCE_DEFAULT, ' +
    'SEQUENCE_NAME_OVERRIDES:SEQUENCE_NAME_OVERRIDES, LABOR_RATES:LABOR_RATES, RATES:RATES};'))();
  const quiet = () => {};

  for (const B of BUILDINGS) {
    const dbPath = path.join(BLD_DIR, B + '.db');
    if (!fs.existsSync(dbPath)) { console.log('  SKIP ' + B + ' (no DB)'); continue; }
    console.log('── ' + B + ' ──');
    const db = new SQL.Database(fs.readFileSync(dbPath));
    const mkOpts = extra => Object.assign({ laborRates: RATES.LABOR_RATES, rates: RATES.RATES,
      nameOverrides: RATES.SEQUENCE_NAME_OVERRIDES, defaultRule: RATES.SEQUENCE_DEFAULT,
      scheduleGate: ScheduleGate, shiftHours: 24, genVersion: 999, start: '2026-01-01' }, extra || {});

    const ql = console.log; console.log = quiet;
    const elements = ScheduleAuthor._buildScheduleElements(db, RATES.SEQUENCE_RULES, mkOpts());
    const maxCrews = {};
    for (const rk in RATES.LABOR_RATES) if (RATES.LABOR_RATES[rk].max_crews) maxCrews[rk] = RATES.LABOR_RATES[rk].max_crews;
    const sched = ScheduleGate.computeSchedule(elements, 0, 1, maxCrews, 24);
    console.log = ql;

    // The ops timeline the film plays: one record per placed element, exactly the shape loadOps()
    // produces from kernel_ops. Derived from the shipped engine on the shipped DB — not synthesised.
    const ops = [];
    for (const el of elements) { const st = sched[el.guid]; if (st) ops.push({ start_ts: st.start, end_ts: st.end }); }
    ops.sort((a, b) => a.start_ts - b.start_ts);
    if (!ops.length) { assert(false, 'W-BAKE ' + B + ' produced no ops'); db.close(); continue; }
    const projectStart = ops[0].start_ts - 1;
    const projectEnd = ops.reduce((m, o) => Math.max(m, o.end_ts), 0);

    // ── the REAL tmWorkSchedule, over the REAL ops ────────────────────────────────────────────
    const tmBox = { console: { log: () => {} }, window: {}, Float64Array: Float64Array, Math: Math,
                    _ops: ops, _projectStart: projectStart, _projectEnd: projectEnd };
    vm.createContext(tmBox);
    vm.runInContext(sliceFn(tmSrc, 'tmWorkSchedule', 'window.tmWorkSchedule = function'), tmBox);
    const ws = tmBox.window.tmWorkSchedule();

    assert(ws && ws.total === ops.length,
      'W-BAKE-1 ' + B + ' the film gets one completion instant per placed element (total=' +
      (ws ? ws.total : 'null') + ', ops=' + ops.length + ') — it plays the schedule, not a sample of it');
    assert(ws.projectStart === projectStart && ws.projectEnd === projectEnd,
      'W-BAKE-2 ' + B + ' the film span IS the schedule span, not a clock of its own');

    // ── the REAL cursor mapping ───────────────────────────────────────────────────────────────
    const mqBox = { console: { log: () => {} }, Math: Math,
                    window: { tmWorkSchedule: () => ws }, BUILDUP_EVEN_TEMPO: false };
    mqBox.window.window = mqBox.window;
    vm.createContext(mqBox);
    vm.runInContext('var _wpSched = null, _wpTried = false, _fcIdx = null;\n' +
      sliceFn(mqSrc, '_workPacingArm') + '\n' + sliceFn(mqSrc, '_workCursorAt') + '\n' +
      'this.__cursor = _workCursorAt;', mqBox);

    const bk = { projectStart: projectStart, projectEnd: projectEnd };
    const N = 200, cur = [];
    for (let i = 0; i <= N; i++) cur.push(mqBox.__cursor(i / N, bk));

    let backwards = 0, outside = 0;
    for (let i = 1; i < cur.length; i++) if (cur[i] < cur[i - 1]) backwards++;
    for (const c of cur) if (c < projectStart || c > projectEnd) outside++;
    assert(backwards === 0,
      'W-BAKE-3 ' + B + ' the cursor never runs backwards over ' + (N + 1) + ' film samples (' +
      backwards + ' inversions) — the film cannot un-build what it built');
    assert(outside === 0,
      'W-BAKE-4 ' + B + ' every cursor sample stays inside the schedule span (' + outside + ' outside)');
    assert(cur[0] === projectStart && cur[N] === projectEnd,
      'W-BAKE-5 ' + B + ' the film starts at day 0 and ends at the last completion — no truncated tail');

    // ── THE POINT: work-paced, not calendar-paced ─────────────────────────────────────────────
    // If _workCursorAt ignored the schedule it would be a straight line from start to end. Measure
    // the largest divergence from that line as a share of the span; a real building is front-loaded,
    // so this must be materially non-zero. This is the check that fails if the film ever goes back
    // to authoring its own even pacing.
    let maxDiv = 0;
    for (let i = 0; i <= N; i++) {
      const linear = projectStart + (i / N) * (projectEnd - projectStart);
      maxDiv = Math.max(maxDiv, Math.abs(cur[i] - linear));
    }
    const divPct = 100 * maxDiv / (projectEnd - projectStart);
    console.log('  §BAKE_PACING ' + B + ' ops=' + ws.total +
      ' workInFirst10%OfCalendar=' + (ws.workInFirstTenthOfCalendar * 100).toFixed(1) + '%' +
      ' maxDivergenceFromLinear=' + divPct.toFixed(1) + '% of span');
    assert(divPct > 1.0,
      'W-BAKE-6 ' + B + ' the cursor is SCHEDULE-driven, not a clock: it diverges ' + divPct.toFixed(1) +
      '% of the span from a linear ramp (a calendar-paced film would read ~0%)');

    // W-BAKE-7 — the k-th completion contract, spot-checked against the schedule's own sorted ends.
    let mismatch = 0;
    for (const t of [0.25, 0.5, 0.75]) {
      const k = Math.round(t * ws.total);
      if (k >= 1 && k < ws.total && mqBox.__cursor(t, bk) !== ws.ends[k - 1]) mismatch++;
    }
    assert(mismatch === 0,
      'W-BAKE-7 ' + B + ' at t the cursor is exactly the k-th completion instant, k=round(t*ops) (' +
      mismatch + ' mismatches) — the film advances by WORK DONE, which is the §CPE_BUILDUP_WORK_PACED contract');
    db.close();
  }
  console.log('§BAKE_PLAYS_SCHEDULE_SUMMARY pass=' + pass + ' fail=' + fail);
  process.exit(fail === 0 ? 0 : 1);
}
main();
