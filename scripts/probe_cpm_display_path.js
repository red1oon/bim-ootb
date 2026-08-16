#!/usr/bin/env node
// probe_cpm_display_path.js — Implementing bim-compiler prompts/4D_SCHEDULE_ARCHITECTURE_REDESIGN.md
// §STAGE4_RETIREMENT_PROPOSAL step 1 (§CPM_DISPLAY wiring A/B). Faithful node reproduction of the
// NEW browser captured path: computeSchedule -> CpmSchedule display timeline -> deriveZones +
// day-rounded task windows FROM those same times (materializeZones §ZONE_DISPLAY_AUTHORING) ->
// applyGapClampRescale (_cap overlay) -> §OG skip (display-authored) -> _cjpJudgeParity ->
// floatingCensus (the judge). Target: floating 0 on all 7 buildings — the §CROSSTASK_JUDGE_PARITY
// residual (Terminal 259 windowBlocked live, 2026-08-16) must die here. Loading pattern verbatim
// from probe_captured_floating.js. Read the log after every run.
'use strict';
const fs = require('fs');
const path = require('path');
const initSqlJs = require(path.join(__dirname, '..', 'modeller', 'lib', 'sql-wasm.js'));
const ScheduleGate = require(path.join(__dirname, '..', 'viewer', 'schedule_gate.js'));
const ScheduleAuthor = require(path.join(__dirname, '..', 'viewer', 'schedule_author.js'));
const CpmSchedule = require(path.join(__dirname, '..', 'viewer', 'cpm_schedule.js'));
const tmSrc = fs.readFileSync(path.join(__dirname, '..', 'viewer', 'time_machine.js'), 'utf8');

function sliceFn(src, name) {
  const idx = src.lastIndexOf('function ' + name + '(');
  if (idx < 0) throw new Error(name + ' not found');
  let depth = 0, i = idx, seenOpen = false;
  for (; i < src.length; i++) {
    if (src[i] === '{') { depth++; seenOpen = true; }
    else if (src[i] === '}') { depth--; if (seenOpen && depth === 0) break; }
  }
  return src.slice(idx, i + 1);
}
function buildFn(srcParts, ret) {
  return new Function('ScheduleGate', srcParts.join('\n') + '\nreturn ' + ret + ';')(ScheduleGate);
}
const _contactGraph = buildFn([sliceFn(tmSrc, '_contactGraph')], '_contactGraph');
const _cjpJudgeParity = buildFn([sliceFn(tmSrc, '_contactGraph'), sliceFn(tmSrc, '_cjpJudgeParity')], '_cjpJudgeParity');
// the SHIPPED rescale, sliced verbatim (incl. §CAP_RESCALE_IDENTITY guard) — never a maintained copy
const applyCapWindowRescale = buildFn([sliceFn(tmSrc, '_capWindowRescale')], '_capWindowRescale');

const BLD_DIR = process.env.BLD_DIR || path.join(require('os').homedir(), 'bim-ootb', 'buildings');
const FLEET = (process.env.ONLY ? [process.env.ONLY] : [
  'Duplex_extracted', 'Clinic_extracted', 'HHS_Office_Federated_extracted', 'JKR_extracted',
  'Hospital_extracted', 'Terminal_extracted', 'LTU_AHouse_extracted'
]);
const SHIFT_HOURS = process.env.SHIFT_HOURS ? Number(process.env.SHIFT_HOURS) : 24;
function _slug(name) { return String(name).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, ''); }

// floatingCensus — THE JUDGE, verbatim math from probe_captured_floating.js.
function floatingCensus(items) {
  const G = _contactGraph(items);
  let midair = 0; const byClass = {};
  for (let i = 0; i < items.length; i++) {
    const list = G.contacts[i]; if (!list) continue;
    let first = Infinity;
    for (const k of list) { const s = items[k].s; if (s < first) first = s; }
    if (first > items[i].s + 1) { midair++; byClass[items[i].cls] = (byClass[items[i].cls] || 0) + 1; }
  }
  return { midair, orphans: G.orphans, byClass };
}

async function runBuilding(SQL, RATES, name) {
  const db = new SQL.Database(fs.readFileSync(path.join(BLD_DIR, name + '.db')));
  const rawElements = ScheduleAuthor._buildScheduleElements(db, RATES.SEQUENCE_RULES, {
    laborRates: RATES.LABOR_RATES, rates: RATES.RATES, nameOverrides: RATES.SEQUENCE_NAME_OVERRIDES,
    defaultRule: RATES.SEQUENCE_DEFAULT
  });
  db.close();
  const elements = rawElements.map(it => Object.assign({}, it, { bz: it.base_z, tz: it.top_z }));
  const maxCrews = {};
  for (const res in RATES.LABOR_RATES) if (RATES.LABOR_RATES[res].max_crews) maxCrews[res] = RATES.LABOR_RATES[res].max_crews;
  const schedule = ScheduleGate.computeSchedule(elements, 0, 1, maxCrews, SHIFT_HOURS);

  // §CPM_DISPLAY: the CPM pass authors the display timeline (same items shape as _twItems).
  const items = elements.map(function (el) {
    const st = schedule[el.guid]; if (!st) return null;
    return { guid: el.guid, cls: el.cls, seq: el.seq, phase: el.phase, storey: el.storey,
             x0: el.x0, x1: el.x1, y0: el.y0, y1: el.y1, bz: el.bz, tz: el.tz,
             s: st.start, e: st.end };
  }).filter(Boolean);
  console.log('§CPMDP_BUILDING ' + name + ' n=' + items.length);
  const res = CpmSchedule.run(items);
  if (!res.ok) throw new Error('CPM failed');
  items.forEach((o, i) => { o.s = res.solution.times[i].s; o.e = res.solution.times[i].e; });

  // §ZONE_DISPLAY_AUTHORING with the CPM display schedule: deriveZones + day-rounded windows
  // (materializeZones' own construction, verbatim from probe_captured_floating.js).
  // §ZONE_WINDOW_DAGWINS_CLIP mirror: straggler times clamped into their group's non-straggler
  // envelope for WINDOW AUTHORING ONLY (the played items keep true physics times).
  const stragOf = res.graph.stragglerOf;
  const envByG = {};
  const gkOf = o => (o.phase || '_UNPHASED') + '||' + ScheduleGate.collapsePhase(o.storey);
  items.forEach((o, i) => {
    if (stragOf[i]) return;
    const k = gkOf(o), e2 = envByG[k] || (envByG[k] = { min: Infinity, max: -Infinity });
    if (o.s < e2.min) e2.min = o.s;
    if (o.e > e2.max) e2.max = o.e;
  });
  const dispSchedule = {};
  let clamped = 0;
  items.forEach((o, i) => {
    let st = o.s, en = o.e;
    if (stragOf[i]) {
      const e2 = envByG[gkOf(o)];
      if (e2 && e2.max > e2.min) {
        st = Math.min(Math.max(st, e2.min), e2.max);
        en = Math.min(Math.max(en, e2.min), e2.max);
        if (en <= st) { st = Math.max(e2.min, e2.max - 60000); en = e2.max; }
        clamped++;
      }
    }
    dispSchedule[o.guid] = { start: st, end: en };
  });
  console.log('§CPMDP_DAGWINS_CLIP clamped=' + clamped);
  const rolled = ScheduleGate.deriveZones(elements, dispSchedule);
  const minStart = Math.min.apply(null, rolled.zones.map(z => z.start));
  const taskWin = {}, guidTask = {};
  rolled.zones.forEach(function (z) {
    const tid = 'TASK_' + _slug(z.phase) + '_' + _slug(z.storey);
    // §ZONE_ENVELOPE_DAYS (display-authored): floor/ceil day envelope, mirroring materializeZones
    const sDays = Math.floor((z.start - minStart) / 86400000);
    let eDays = Math.ceil((z.end - minStart) / 86400000);
    if (eDays <= sDays) eDays = sDays + 1;
    taskWin[tid] = { s: minStart + sDays * 86400000, e: minStart + eDays * 86400000 };
    z.guids.forEach(g => guidTask[g] = tid);   // EXACT task membership (browser: task_elements rows)
  });
  const scheduled = items.map(function (o) {
    return Object.assign({}, o, { task: guidTask[o.guid] });
  });

  const preRescale = floatingCensus(scheduled.map(o => Object.assign({}, o)));
  console.log('§CPMDP_PRE_RESCALE floating=' + preRescale.midair + ' orphans=' + preRescale.orphans);

  // _cap overlay, display-authored path: §CAP_RESCALE_SKIP (windows are views — no reconcile),
  // §OG skip, judge parity only.
  const rescaled = scheduled.map(o => Object.assign({}, o));
  console.log('§CAP_RESCALE_SKIP mirror (display-authored)');
  const postRescale = floatingCensus(rescaled.map(o => Object.assign({}, o)));
  console.log('§CPMDP_POST_RESCALE floating=' + postRescale.midair + ' byClass=' + JSON.stringify(postRescale.byClass));
  const cjp = _cjpJudgeParity(rescaled, taskWin);
  const final = floatingCensus(rescaled);
  console.log('§CPMDP_FINAL floating=' + final.midair + ' windowBlocked=' + cjp.windowBlocked +
    ' cjpPushed=' + cjp.pushed + ' byClass=' + JSON.stringify(final.byClass));

  // Window fidelity of the played timeline vs its own authored windows. A dag-wins straggler
  // legitimately rides OUTSIDE its bar (§ZONE_WINDOW_DAGWINS_CLIP — counted, never hidden);
  // any NON-straggler outside its window is a real defect and must be 0.
  const stragGuid = {};
  items.forEach((o, i) => { if (stragOf[i]) stragGuid[o.guid] = 1; });
  let inWin = 0, stragOut = 0, otherOut = 0;
  rescaled.forEach(function (o) {
    const w = taskWin[o.task]; if (!w) return;
    if (o.s >= w.s && o.e <= w.e) inWin++;
    else if (stragGuid[o.guid]) stragOut++;
    else otherOut++;
  });
  console.log('§CPMDP_WINDOW_FIDELITY inWindow=' + inWin + '/' + (inWin + stragOut + otherOut) +
    ' stragglerOutside=' + stragOut + ' nonStragglerOutside=' + otherOut + ' (bar: nonStraggler must be 0)');

  const pass = final.midair === 0 && otherOut === 0;
  console.log('§CPMDP_ACCEPT ' + name + ' finalFloating=' + final.midair + ' nonStragglerOutside=' + otherOut + ' ' + (pass ? 'PASS' : 'FAIL'));
  return { name, final: final.midair, pre: preRescale.midair, post: postRescale.midair,
           stragOut, otherOut };
}

async function main() {
  const SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(__dirname, '..', 'modeller', 'lib', 'sql-wasm.wasm')) });
  const ratesSrc = fs.readFileSync(path.join(__dirname, '..', 'viewer', 'rates.js'), 'utf8');
  const RATES = (new Function(ratesSrc +
    '\nreturn {SEQUENCE_RULES:SEQUENCE_RULES, SEQUENCE_DEFAULT:SEQUENCE_DEFAULT, ' +
    'SEQUENCE_NAME_OVERRIDES:SEQUENCE_NAME_OVERRIDES, LABOR_RATES:LABOR_RATES, RATES:RATES};'))();
  const out = [];
  for (const name of FLEET) out.push(await runBuilding(SQL, RATES, name));
  let fails = 0;
  out.forEach(r => { if (r.final !== 0 || r.otherOut !== 0) fails++; });
  console.log('§CPMDP_FLEET ' + JSON.stringify(out.map(r => [r.name, 'pre=' + r.pre, 'post=' + r.post,
    'final=' + r.final, 'stragOut=' + r.stragOut, 'otherOut=' + r.otherOut])));
  console.log('§CPMDP_FLEET_VERDICT buildings=' + out.length + ' fails=' + fails + ' ' + (fails === 0 ? 'PASS' : 'FAIL'));
  process.exit(fails === 0 ? 0 : 1);
}

main().catch(function (e) { console.error('§CPMDP_ERROR ' + (e && e.stack || e)); process.exit(2); });
