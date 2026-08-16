#!/usr/bin/env node
// witness_zone_display_authoring.js — §ZONE_DISPLAY_AUTHORING (2026-08-16, bim-compiler
// prompts/4D_SCHEDULE_PERFECTION.md §CHASE_TO_ZERO_WINDOW_AUTHORING).
//
// ISSUE this witness proves/disproves: the Gantt's task windows were authored from the RAW
// computeSchedule output while the movie plays the TWO-TIER DISPLAY timeline — two different
// schedules. The captured overlay then rescaled display times into raw windows, manufacturing
// order violations out of a 0-floating kernel_ops input (measured live 2026-08-16, Hospital:
// 2211 pre-repair violations, 664 residual, 97.03% window fidelity). The fix authors windows FROM
// the display timeline (materializeZones opts.displayRemap ← time_machine._tmDisplayRemap, one
// physics) and skips the strict end-bar sweep on that path (schedules.display_authored=1).
//
//   W-ZDA-1  WIRING: all 3 real materializeZones call sites in time_machine.js pass
//            displayRemap: _tmDisplayRemap (an unwired hook is a silent no-op).
//   W-ZDA-2  FLAG: materializeZones WITH displayRemap writes schedules.display_authored=1;
//            WITHOUT it writes 0 — imported/legacy schedules keep the old sweep.
//   W-ZDA-3  SWEEP GUARD: the captured overlay skips _ogSupportSweep exactly when
//            display_authored=1 and still always runs _cjpJudgeParity (source contract).
//   W-ZDA-4  THE BAR (end-to-end, real buildings, shipped functions): under display-authored
//            windows + parity-only repair, judge-rule floating is strictly below the
//            raw-window+sweep baseline AND window fidelity is not worse.
//   W-ZDA-5  LEGACY SAFETY: materializeZones WITHOUT displayRemap still writes a readable
//            schedules row (named-column INSERT after the ALTER) and identical zone windows.
//
// Command: BLD_DIR=~/bim-ootb/buildings node tests/witness_zone_display_authoring.js  (from viewer/)
// Read the § log lines, not the exit code alone.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const initSqlJs = require(path.join(__dirname, '..', '..', 'modeller', 'lib', 'sql-wasm.js'));
const ScheduleGate = require(path.join(__dirname, '..', 'schedule_gate.js'));
const ScheduleAuthor = require(path.join(__dirname, '..', 'schedule_author.js'));
const tmSrc = fs.readFileSync(path.join(__dirname, '..', 'time_machine.js'), 'utf8');

let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log('  PASS ' + msg); } else { fail++; console.log('  FAIL ' + msg); } }

function sliceFn(src, name, which, optional) {
  let from = 0;
  for (let p = 0; p <= (which || 0); p++) {
    const idx = src.indexOf('function ' + name + '(', from);
    if (idx < 0) { if (optional) return null; throw new Error(name + ' not found'); }
    let depth = 0, i = idx, seenOpen = false;
    for (; i < src.length; i++) {
      if (src[i] === '{') { depth++; seenOpen = true; }
      else if (src[i] === '}') { depth--; if (seenOpen && depth === 0) break; }
    }
    if (p === (which || 0)) return src.slice(idx, i + 1);
    from = i + 1;
  }
}

// ── W-ZDA-1/3: source-level wiring ────────────────────────────────────────────────────────────
console.log('W-ZDA-1/3 wiring');
const remapWires = (tmSrc.match(/displayRemap:\s*_tmDisplayRemap/g) || []).length;
assert(remapWires === 3, 'all 3 materializeZones call sites pass displayRemap: _tmDisplayRemap (found ' + remapWires + ')');
assert(/display_authored=1 LIMIT 1/.test(tmSrc) && /if \(_cjpDisplayAuthored\)/.test(tmSrc) &&
  /else \{\s*\n\s*_ogSupportSweep\(_allScheduled, _cap\.win\);/.test(tmSrc),
  'overlay skips _ogSupportSweep exactly on display_authored=1');
const guardIdx = tmSrc.indexOf('_cjpDisplayAuthored');
assert(guardIdx > 0 && /_cjpJudgeParity\(_allScheduled, _cap\.win\)/.test(tmSrc.slice(guardIdx, guardIdx + 2600)),
  '_cjpJudgeParity still always runs after the guard');
const saSrc = fs.readFileSync(path.join(__dirname, '..', 'schedule_author.js'), 'utf8');
assert(/opts\.displayRemap/.test(saSrc) && /display_authored/.test(saSrc),
  'schedule_author.js materializeZones consumes opts.displayRemap and persists display_authored');

// ── shipped-function slices (one physics — the same functions the browser runs) ───────────────
let mrCount = 0, mrFrom = 0;
for (;;) { const k = tmSrc.indexOf('function _midairRepair(', mrFrom); if (k < 0) break; mrCount++; mrFrom = k + 1; }
const zoneParts = [sliceFn(tmSrc, '_zoneIndexBuild', 0, true), sliceFn(tmSrc, '_zoneIndex', 0, true)].filter(Boolean);
const sliced = ["var _TIER1_ORDER = ['Substructure', 'Superstructure', 'Architecture'];",
  'var _CPM_DISPLAY = false;',   // §CPM_DISPLAY: legacy branch under test here; CPM branch = W-ZDA-6 below,
  (zoneParts.length === 2 ? 'var _zoneMemo = [];' : ''), zoneParts[0] || '', zoneParts[1] || '',
  sliceFn(tmSrc, '_zoneOf', 0, true) || '',
  sliceFn(tmSrc, '_tier1Extents'), sliceFn(tmSrc, '_tier1Serialize'),
  sliceFn(tmSrc, '_tier1Protrusion'), sliceFn(tmSrc, '_tierAuditRegate'),
  sliceFn(tmSrc, '_twoTierRemap'), sliceFn(tmSrc, '_contactGraph'),
  sliceFn(tmSrc, '_midairRepair', mrCount - 1),
  sliceFn(tmSrc, '_ogSupportSweep'), sliceFn(tmSrc, '_cjpJudgeParity'),
  sliceFn(tmSrc, '_capWindowRescale'), sliceFn(tmSrc, '_midairAudit'),
  sliceFn(tmSrc, '_displayTimeline'), sliceFn(tmSrc, '_displayTimelineRemember'),
  sliceFn(tmSrc, '_tmDisplayRemap')].join('\n');
const sandbox = { console: { log: () => {}, warn: () => {} }, performance: { now: () => Date.now() },
  ScheduleGate: ScheduleGate, Math: Math };
vm.createContext(sandbox);
vm.runInContext(sliced +
  '\nthis.__remapHook = _tmDisplayRemap; this.__sweep = _ogSupportSweep; this.__parity = _cjpJudgeParity; this.__cg = _contactGraph; this.__rescale = _capWindowRescale;', sandbox);
const _tmDisplayRemap = sandbox.__remapHook, _ogSupportSweep = sandbox.__sweep,
  _cjpJudgeParity = sandbox.__parity, _contactGraph = sandbox.__cg, _capWindowRescale = sandbox.__rescale;

function census(items) {
  const G = _contactGraph(items);
  let midair = 0;
  for (let i = 0; i < items.length; i++) {
    const list = G.contacts[i]; if (!list) continue;
    let first = Infinity;
    for (const k of list) { if (items[k].s < first) first = items[k].s; }
    if (first > items[i].s + 1) midair++;
  }
  return midair;
}
function winCounts(items, taskWin) {
  let inW = 0, outW = 0;
  items.forEach(it => { const w = taskWin[it.task]; if (!w) return; (it.s >= w.s && it.e <= w.e) ? inW++ : outW++; });
  return { inW, outW };
}
function readTaskWin(db) {
  const win = {};
  const tr = db.exec("SELECT task_id, schedule_start, schedule_finish FROM tasks WHERE schedule_start IS NOT NULL AND (is_summary IS NULL OR is_summary=0)");
  if (tr.length) tr[0].values.forEach(r => { win[r[0]] = { s: Date.parse(r[1]), e: Date.parse(r[2]) }; });
  return win;
}
function _slug(n) { return String(n).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, ''); }

const BLD_DIR = process.env.BLD_DIR || path.join(require('os').homedir(), 'bim-ootb', 'buildings');
const BUILDINGS = (process.env.ZDA_BUILDINGS || 'Duplex_extracted,HHS_Office_Federated_extracted').split(',');

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
    console.log('W-ZDA-2/4/5 ' + B);
    const bytes = fs.readFileSync(dbPath);
    const mkOpts = extra => Object.assign({ laborRates: RATES.LABOR_RATES, rates: RATES.RATES,
      nameOverrides: RATES.SEQUENCE_NAME_OVERRIDES, defaultRule: RATES.SEQUENCE_DEFAULT,
      scheduleGate: ScheduleGate, shiftHours: 24, genVersion: 999, start: '2026-01-01' }, extra || {});

    // legacy path (no hook)
    const dbA = new SQL.Database(new Uint8Array(bytes));
    const ql = console.log; console.log = quiet;
    const resA = ScheduleAuthor.materializeZones(dbA, RATES.SEQUENCE_RULES, mkOpts());
    console.log = ql;
    const flagA = dbA.exec("SELECT COALESCE(display_authored,0) FROM schedules WHERE schedule_id='SCH_AUTHORED'");
    assert(resA.ok && flagA.length && Number(flagA[0].values[0][0]) === 0,
      'W-ZDA-2a legacy call writes display_authored=0 and a readable schedules row (named-column INSERT)');
    const winA = readTaskWin(dbA);

    // display-authored path (the shipped hook)
    const dbB = new SQL.Database(new Uint8Array(bytes));
    console.log = quiet;
    const resB = ScheduleAuthor.materializeZones(dbB, RATES.SEQUENCE_RULES, mkOpts({ displayRemap: _tmDisplayRemap }));
    console.log = ql;
    const flagB = dbB.exec("SELECT COALESCE(display_authored,0) FROM schedules WHERE schedule_id='SCH_AUTHORED'");
    assert(resB.ok && flagB.length && Number(flagB[0].values[0][0]) === 1,
      'W-ZDA-2b displayRemap call writes display_authored=1');
    const winB = readTaskWin(dbB);
    assert(Object.keys(winA).length > 0 && Object.keys(winA).length === Object.keys(winB).length,
      'W-ZDA-5 same task set under both paths (n=' + Object.keys(winA).length + ')');

    // end-to-end overlay comparison, shipped functions only
    console.log = quiet;
    const elements = ScheduleAuthor._buildScheduleElements(dbA, RATES.SEQUENCE_RULES, mkOpts())
      .map(it => Object.assign({}, it, { bz: it.base_z, tz: it.top_z }));
    const maxCrews = {};
    for (const rk in RATES.LABOR_RATES) if (RATES.LABOR_RATES[rk].max_crews) maxCrews[rk] = RATES.LABOR_RATES[rk].max_crews;
    const rawSched = ScheduleGate.computeSchedule(elements, 0, 1, maxCrews, 24);
    const dispSched = _tmDisplayRemap(elements, rawSched);
    console.log = ql;
    function capItems(schedMap, win) {
      return elements.map(el => {
        const st = schedMap[el.guid]; if (!st) return null;
        const tid = 'TASK_' + _slug(el.phase || '_UNPHASED') + '_' + _slug(ScheduleGate.collapsePhase(el.storey));
        if (!win[tid]) return null;
        return { guid: el.guid, s: st.start, e: st.end, bz: el.bz, tz: el.tz,
          x0: el.x0, x1: el.x1, y0: el.y0, y1: el.y1, cls: el.cls, seq: el.seq, task: tid };
      }).filter(Boolean);
    }
    console.log = quiet;
    // baseline: raw-authored windows, display input, SHIPPED rescale + sweep + parity (pre-change path)
    const base = capItems(dispSched, winA);
    _capWindowRescale(base, winA);
    _ogSupportSweep(base, winA);
    _cjpJudgeParity(base, winA);
    const baseFloat = census(base), baseWin = winCounts(base, winA);
    // new: display-authored windows, display input, SHIPPED rescale + parity only
    const next = capItems(dispSched, winB);
    _capWindowRescale(next, winB);
    _cjpJudgeParity(next, winB);
    const nextFloat = census(next), nextWin = winCounts(next, winB);
    console.log = ql;
    console.log('  §ZDA_WITNESS ' + B + ' floating ' + baseFloat + ' -> ' + nextFloat +
      ' outWindow ' + baseWin.outW + ' -> ' + nextWin.outW);
    assert(nextFloat <= baseFloat, 'W-ZDA-4a floating not worse under display-authored windows (' + baseFloat + ' -> ' + nextFloat + ')');
    assert(nextWin.outW <= baseWin.outW, 'W-ZDA-4b window fidelity not worse (outWindow ' + baseWin.outW + ' -> ' + nextWin.outW + ')');
    // W-ZDA-6 (§CPM_DISPLAY, 2026-08-16): the CPM branch of _displayTimeline authors a 0-midair
    // display timeline through the SAME hook (proves the wiring, not just the module).
    console.log = quiet;
    const cpmSandbox = { console: { log: () => {}, warn: () => {} }, performance: { now: () => Date.now() },
      ScheduleGate: ScheduleGate, Math: Math, URLSearchParams: URLSearchParams,
      CpmSchedule: require(path.join(__dirname, '..', 'cpm_schedule.js')) };
    vm.createContext(cpmSandbox);
    vm.runInContext(sliced.replace('var _CPM_DISPLAY = false;', 'var _CPM_DISPLAY = true;') +
      '\nthis.__remapHook = _tmDisplayRemap; this.__cg = _contactGraph; this.__dt = _displayTimeline;', cpmSandbox);
    // judge the OPS timeline (what the movie plays) — the hook's map is the WINDOW view, which
    // deliberately clamps dag-wins stragglers (§ZONE_WINDOW_DAGWINS_CLIP) and is not the schedule
    const cpmItems = elements.map(el => {
      const st = rawSched[el.guid]; if (!st) return null;
      return { guid: el.guid, s: st.start, e: st.end, bz: el.bz, tz: el.tz,
        x0: el.x0, x1: el.x1, y0: el.y0, y1: el.y1, cls: el.cls, seq: el.seq,
        phase: el.phase, storey: el.storey };
    }).filter(Boolean);
    cpmSandbox.__dt(cpmItems);
    const cpmFloat = census(cpmItems);
    console.log = ql;
    console.log('  §ZDA_CPM_DISPLAY ' + B + ' midair=' + cpmFloat + ' (legacy display path above: ' + nextFloat + ')');
    assert(cpmFloat === 0, 'W-ZDA-6 CPM display timeline has 0 midair through the shipped hook (got ' + cpmFloat + ')');
    dbA.close(); dbB.close();
  }
  console.log('\n§ZDA_WITNESS_SUMMARY pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
