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
const SupportSweep = require(path.join(__dirname, '..', 'viewer', 'support_sweep.js'));   // §S58: required, never sliced
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
const _contactGraph = SupportSweep.contactGraph;        // §S58: the real module, not a text slice
const _designatedSupport = SupportSweep.designatedSupport;  // §S58
const _cjpJudgeParity = SupportSweep.cjpJudgeParity;    // §S58 (the module resolves its own contactGraph)
// the SHIPPED rescale, sliced verbatim (incl. §CAP_RESCALE_IDENTITY guard) — never a maintained copy
const applyCapWindowRescale = SupportSweep.capWindowRescale;  // §S58

const BLD_DIR = process.env.BLD_DIR || path.join(require('os').homedir(), 'bim-ootb', 'buildings');
const FLEET = (process.env.ONLY ? [process.env.ONLY] : [
  'Duplex_extracted', 'Clinic_extracted', 'HHS_Office_Federated_extracted', 'JKR_extracted',
  'Hospital_extracted', 'Terminal_extracted', 'LTU_AHouse_extracted'
]);
const SHIFT_HOURS = process.env.SHIFT_HOURS ? Number(process.env.SHIFT_HOURS) : 24;
function _slug(name) { return String(name).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, ''); }

// floatingCensus — THE JUDGE, directional (§MIDAIR_DIRECTIONAL, 4D_GANTT_TM_REFACTOR.md).
function floatingCensus(items) {
  const G = _contactGraph(items);
  const des = _designatedSupport(items, G);
  let midair = 0; const byClass = {};
  for (let i = 0; i < items.length; i++) {
    const sIdx = des[i]; if (sIdx < 0) continue;
    if (items[sIdx].s > items[i].s + 1) { midair++; byClass[items[i].cls] = (byClass[items[i].cls] || 0) + 1; }
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
             s: st.start, e: st.end, resource: el.resource };   // §S6_CREW_PASS
  }).filter(Boolean);
  console.log('§CPMDP_BUILDING ' + name + ' n=' + items.length);
  const res = CpmSchedule.run(items, { maxCrews });
  if (!res.ok) throw new Error('CPM failed');
  // §S14.0 (bim-compiler prompts/4D_GANTT_TM_REFACTOR.md) — REACHABILITY EVIDENCE, printed before
  // any number is quoted. §S13.7 was retracted because it measured _twoTierRemap, which
  // time_machine.js only ever reached via _displayTimeline's §CPM_DISPLAY_FALLBACK branch. The live
  // default is the branch THIS probe is on: `CpmSchedule.run(...).ok` truthy makes _displayTimeline
  // return from its CPM branch. §S20 Part B (2026-08-17) DELETED _twoTierRemap/_midairRepair
  // entirely (confirmed twice this lane never reached them live) — the fallback branch is now a
  // minimal explicit console.error + no-op, not a second schedule generator, so "NOT reached" is
  // now "does not exist" rather than merely "not taken this run". Nothing here is sliced out of
  // source — `CpmSchedule` is the shipped module, required directly, and its own §CPM_RUN line
  // above is the proof it executed.
  console.log('§CPM_LIVE_PATH ' + name + ' cpmRunOk=' + res.ok +
    ' -> _displayTimeline returned from its CPM branch (§CPM_DISPLAY on); the legacy ' +
    '_twoTierRemap/_midairRepair fallback no longer exists (§S20 Part B). Module=require(viewer/cpm_schedule.js), not a source slice.');
  const _rawStart = {}; items.forEach(function (o) { _rawStart[o.guid] = o.s; });
  items.forEach((o, i) => { o.s = res.solution.times[i].s; o.e = res.solution.times[i].e; });

  // §S14.0 — the SAME per-phase, per-storey p50 table §S13.7 built, now on the confirmed-live
  // author. RAW = ScheduleGate.computeSchedule (the generative engine, unchanged on either path);
  // CPM = CpmSchedule.run's solution (what the browser plays). Per phase because the aggregate
  // storey report's p50 runs over ALL of a storey's elements, so an MEP-heavy storey and a
  // structure-heavy one get compared on different things and a global phase ordering alone reads
  // as an "inversion".
  {
    const tbl = function (startOf, label) {
      const byKey = {};
      items.forEach(function (o) {
        const k = (o.phase || '_NONE') + '||' + ScheduleGate.collapsePhase(o.storey);
        (byKey[k] = byKey[k] || { s: [], z: [] }).s.push(startOf(o));
        byKey[k].z.push(o.bz);
      });
      const gmin = Math.min.apply(null, items.map(startOf));
      const phases = {};
      Object.keys(byKey).forEach(function (k) {
        const pr = k.split('||'), g = byKey[k];
        const ss = g.s.slice().sort(function (a, b) { return a - b; });
        (phases[pr[0]] = phases[pr[0]] || []).push({ st: pr[1], n: ss.length,
          z: g.z.reduce(function (a, b) { return a + b; }, 0) / g.z.length,
          p50: Math.round((ss[Math.floor(ss.length / 2)] - gmin) / 86400000) });
      });
      Object.keys(phases).sort().forEach(function (ph) {
        const rows = phases[ph].filter(function (r) { return r.st !== 'Unknown' && r.n >= 20; })
          .sort(function (a, b) { return a.z - b.z; });
        let v = 0, worst = 0;
        for (let i = 1; i < rows.length; i++)
          if (rows[i].p50 < rows[i - 1].p50) { v++; worst = Math.max(worst, rows[i - 1].p50 - rows[i].p50); }
        console.log('§S14_PHASE_ORDER ' + name + ' ' + label + ' phase=' + ph +
          ' storeys=' + rows.length + ' violations=' + v + '/' + Math.max(0, rows.length - 1) +
          ' worst=' + worst + 'd ' + JSON.stringify(rows.map(function (r) { return [r.st, r.z.toFixed(1), r.n, r.p50]; })));
      });
    };
    tbl(function (o) { return _rawStart[o.guid]; }, 'RAW');
    tbl(function (o) { return o.s; }, 'CPM_LIVE');
  }

  // §CREW_FEASIBILITY (4D_GANTT_TM_REFACTOR.md §S6 acceptance 1) on the CPM-authored schedule this
  // display path plays: per resource, integrated over-cap exposure must stay within the 1-day
  // rounding quantum.
  let crewViol = 0;
  {
    const byRes = {};
    items.forEach(o => { (byRes[o.resource] = byRes[o.resource] || []).push(o); });
    const detail = [];
    Object.keys(byRes).sort().forEach(function (r) {
      const cap = maxCrews[r] || 3;   // schedule_gate.js MAX_CREWS_DEFAULT, mirrored
      const ev = [];
      byRes[r].forEach(o => { ev.push([o.s, 1]); ev.push([o.e, -1]); });
      ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      let cur = 0, mx = 0, overMs = 0, lastT = null;
      for (const [t, d] of ev) {
        if (cur > cap && lastT != null) overMs += t - lastT;
        lastT = t; cur += d; if (cur > mx) mx = cur;
      }
      if (overMs > 86400000) { crewViol++; detail.push(r + ' cap=' + cap + ' maxConc=' + mx + ' overDays=' + (overMs / 86400000).toFixed(1)); }
    });
    console.log('§CREW_FEASIBILITY_CPMDP violations=' + crewViol +
      (detail.length ? ' detail=' + JSON.stringify(detail.slice(0, 8)) : '') +
      ' ' + (crewViol === 0 ? 'PASS' : 'FAIL'));
  }

  // §ZONE_DISPLAY_AUTHORING with the CPM display schedule: deriveZones + day-rounded windows
  // (materializeZones' own construction, verbatim from probe_captured_floating.js).
  // §ZONE_WINDOW_DAGWINS_CLIP mirror (M2, 4D_GANTT_TM_REFACTOR.md) — Tukey-fenced robust envelope
  // over ALL members' times (classification-free), mirroring time_machine.js's own _tmDisplayRemap
  // formula verbatim. Percentile convention: sorted[Math.floor(n*p)] (matches storeyOrderReport).
  const gkOf = o => (o.phase || '_UNPHASED') + '||' + ScheduleGate.collapsePhase(o.storey);
  const groupsByG = {};
  items.forEach(o => {
    const k = gkOf(o), g = groupsByG[k] || (groupsByG[k] = { starts: [], ends: [] });
    g.starts.push(o.s); g.ends.push(o.e);
  });
  function tukeyBound(arr, lowSide) {
    const s = arr.slice().sort((a, b) => a - b);
    const n = s.length, q1 = s[Math.floor(n * 0.25)], q3 = s[Math.floor(n * 0.75)], iqr = q3 - q1;
    return lowSide ? Math.max(s[0], q1 - 1.5 * iqr) : Math.min(s[n - 1], q3 + 1.5 * iqr);
  }
  const barByG = {};
  Object.keys(groupsByG).forEach(k => {
    const g = groupsByG[k], lo = tukeyBound(g.starts, true), hi = tukeyBound(g.ends, false);
    barByG[k] = { lo, hi: Math.max(hi, lo) };
  });
  const dispSchedule = {};
  let clamped = 0;
  const outlierGuid = {};
  items.forEach(o => {
    const b = barByG[gkOf(o)];
    let st = o.s, en = o.e;
    if (b) {
      let nst = Math.min(Math.max(st, b.lo), b.hi), nen = Math.min(Math.max(en, b.lo), b.hi);
      if (nen <= nst) { nst = Math.max(b.lo, b.hi - 60000); nen = b.hi; }
      if (nst !== st || nen !== en) { clamped++; outlierGuid[o.guid] = 1; }
      st = nst; en = nen;
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

  // Window fidelity of the played timeline vs its own authored windows. A Tukey outlier
  // legitimately rides OUTSIDE its bar (§ZONE_WINDOW_DAGWINS_CLIP M2 — counted, never hidden);
  // the hard bar (4D_GANTT_TM_REFACTOR.md §STAGES S2): elements outside their bar <= the
  // Tukey-outlier count. Set-membership check (stricter, implies the count bar): any element
  // outside its window that was NOT flagged an outlier during fencing is a real defect, must be 0.
  let inWin = 0, outlierOutside = 0, otherOut = 0;
  rescaled.forEach(function (o) {
    const w = taskWin[o.task]; if (!w) return;
    if (o.s >= w.s && o.e <= w.e) inWin++;
    else if (outlierGuid[o.guid]) outlierOutside++;
    else otherOut++;
  });
  console.log('§CPMDP_WINDOW_FIDELITY inWindow=' + inWin + '/' + (inWin + outlierOutside + otherOut) +
    ' outlierOutside=' + outlierOutside + '/' + clamped + ' nonOutlierOutside=' + otherOut +
    ' (bar: outside <= Tukey-outlier count; nonOutlier outside must be 0)');

  const pass = final.midair === 0 && otherOut === 0 && crewViol === 0;
  console.log('§CPMDP_ACCEPT ' + name + ' finalFloating=' + final.midair + ' nonOutlierOutside=' + otherOut +
    ' crewFeasViolations=' + crewViol + ' ' + (pass ? 'PASS' : 'FAIL'));
  return { name, final: final.midair, pre: preRescale.midair, post: postRescale.midair,
           outlierOutside, otherOut, crewViol };
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
  out.forEach(r => { if (r.final !== 0 || r.otherOut !== 0 || r.crewViol !== 0) fails++; });
  console.log('§CPMDP_FLEET ' + JSON.stringify(out.map(r => [r.name, 'pre=' + r.pre, 'post=' + r.post,
    'final=' + r.final, 'outlierOutside=' + r.outlierOutside, 'otherOut=' + r.otherOut,
    'crewViol=' + r.crewViol])));
  console.log('§CPMDP_FLEET_VERDICT buildings=' + out.length + ' fails=' + fails + ' ' + (fails === 0 ? 'PASS' : 'FAIL'));
  process.exit(fails === 0 ? 0 : 1);
}

main().catch(function (e) { console.error('§CPMDP_ERROR ' + (e && e.stack || e)); process.exit(2); });
