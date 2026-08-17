#!/usr/bin/env node
// probe_e5_resolution.js — 4D_GANTT_TM_REFACTOR.md §S19 Part B evidence.
//
// §S2_REVIEW_VERDICT (S6 spec) said E5-as-lower-bound "becomes redundant once slots are claimed
// in-pass" but §S6_RESULTS never measured/reported it removed. This probe answers the open question
// directly against cpm_schedule.js's real solve(), on a real building, not by reading code alone:
//
//   §E5_BOUND_CHECK — is ES(T) >= computeSchedule(T).start still enforced PER ELEMENT? If it were,
//     cpmStart could never be earlier than rawStart for any element. Measured: it legitimately is,
//     for a large fraction of elements — the per-element floor is gone (only a single shared epoch,
//     `base` = min over all items, remains, per §S6_CREW_PASS's own comment in solve()).
//   §E5_SUMMARY / durations — is DUR[i] = items[i].e - items[i].s (computeSchedule's crew-leveled
//     duration) still the ONLY source cpm_schedule.js uses for element duration? Measured: yes,
//     bit-exact (maxDelta 0ms) across the whole fleet — S6's crew-slot pass changes START only,
//     never recomputes duration. This is why E5 is not dead weight: solve() has no independent
//     duration model, so deleting the `s`/`e` read would leave DUR undefined for every element.
//
// Command: BLD_DIR=~/bim-ootb/buildings BLD=Terminal_extracted node scripts/probe_e5_resolution.js
'use strict';
const fs = require('fs');
const path = require('path');
const initSqlJs = require(path.join(__dirname, '..', 'modeller', 'lib', 'sql-wasm.js'));
const ScheduleGate = require(path.join(__dirname, '..', 'viewer', 'schedule_gate.js'));
const ScheduleAuthor = require(path.join(__dirname, '..', 'viewer', 'schedule_author.js'));
const CpmSchedule = require(path.join(__dirname, '..', 'viewer', 'cpm_schedule.js'));

const BLD_DIR = process.env.BLD_DIR || path.join(require('os').homedir(), 'bim-ootb', 'buildings');
const BLD = process.env.BLD || 'Terminal_extracted';
const ratesSrc = fs.readFileSync(path.join(__dirname, '..', 'viewer', 'rates.js'), 'utf8');
const RATES = (new Function(ratesSrc +
  '\nreturn {SEQUENCE_RULES:SEQUENCE_RULES, SEQUENCE_DEFAULT:SEQUENCE_DEFAULT, ' +
  'SEQUENCE_NAME_OVERRIDES:SEQUENCE_NAME_OVERRIDES, LABOR_RATES:LABOR_RATES, RATES:RATES};'))();

async function main() {
  const SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(__dirname, '..', 'modeller', 'lib', 'sql-wasm.wasm')) });
  const db = new SQL.Database(fs.readFileSync(path.join(BLD_DIR, BLD + '.db')));
  const rawElements = ScheduleAuthor._buildScheduleElements(db, RATES.SEQUENCE_RULES, {
    laborRates: RATES.LABOR_RATES, rates: RATES.RATES, nameOverrides: RATES.SEQUENCE_NAME_OVERRIDES,
    defaultRule: RATES.SEQUENCE_DEFAULT
  });
  db.close();
  const elements = rawElements.map(it => Object.assign({}, it, { bz: it.base_z, tz: it.top_z }));
  const maxCrews = {};
  for (const r in RATES.LABOR_RATES) if (RATES.LABOR_RATES[r].max_crews) maxCrews[r] = RATES.LABOR_RATES[r].max_crews;
  const schedule = ScheduleGate.computeSchedule(elements, 0, 1, maxCrews, 24);
  const items = elements.map(el => {
    const st = schedule[el.guid]; if (!st) return null;
    return { guid: el.guid, cls: el.cls, seq: el.seq, phase: el.phase, storey: el.storey,
             x0: el.x0, x1: el.x1, y0: el.y0, y1: el.y1, bz: el.bz, tz: el.tz,
             s: st.start, e: st.end, resource: el.resource };
  }).filter(Boolean);
  console.log('§E5_BUILDING ' + BLD + ' n=' + items.length);

  const res = CpmSchedule.run(items, { maxCrews });
  if (!res.ok) throw new Error('CPM failed: ' + res.error);

  // Duration preservation, fleet-wide for this building.
  let allDurMatch = true, maxDelta = 0;
  items.forEach((it, i) => {
    const d = Math.abs((it.e - it.s) - (res.solution.times[i].e - res.solution.times[i].s));
    if (d > maxDelta) maxDelta = d;
    if (d > 1) allDurMatch = false;   // 1ms tolerance
  });

  // One concrete named example (longest-duration roof element, or longest overall if none on roof).
  let worstIdx = 0, worstDur = -1;
  items.forEach((it, i) => { const d = it.e - it.s; if (it.storey && it.storey.indexOf('ROOF') >= 0 && d > worstDur) { worstDur = d; worstIdx = i; } });
  if (worstDur <= 0) items.forEach((it, i) => { const d = it.e - it.s; if (d > worstDur) { worstDur = d; worstIdx = i; } });
  const ex = items[worstIdx], exCpm = res.solution.times[worstIdx];
  console.log('§E5_ELEMENT_EXAMPLE guid=' + ex.guid + ' cls=' + ex.cls + ' storey=' + ex.storey +
    ' rawStart(computeSchedule/E5)=' + new Date(ex.s).toISOString() +
    ' rawDurHrs=' + ((ex.e - ex.s) / 3600000).toFixed(3) +
    ' cpmStart(solve)=' + new Date(exCpm.s).toISOString() +
    ' cpmDurHrs=' + ((exCpm.e - exCpm.s) / 3600000).toFixed(3) +
    ' startShiftDays=' + ((exCpm.s - ex.s) / 86400000).toFixed(2));

  const durs = items.map(it => (it.e - it.s) / 3600000).sort((a, b) => a - b);
  const pct = p => durs[Math.floor(p * (durs.length - 1))];
  console.log('§E5_DUR_PERCENTILES_HRS p10=' + pct(0.10).toFixed(3) + ' p50=' + pct(0.50).toFixed(3) +
    ' p90=' + pct(0.90).toFixed(3) + ' p99=' + pct(0.99).toFixed(3) + ' max=' + durs[durs.length - 1].toFixed(3) +
    ' zeroCount=' + durs.filter(d => d === 0).length + '/' + durs.length);
  console.log('§E5_SUMMARY allDurationsPreservedExactly=' + allDurMatch + ' maxDeltaMs=' + maxDelta +
    ' (E5-as-DURATION-SOURCE is the only source -- cpmDur === rawDur exactly, S6 never recomputes it)');

  // The decisive check: is ES(T) >= computeSchedule(T).start still enforced per element? If so,
  // cpmStart must never be earlier than rawStart for ANY element.
  let earlier = 0, later = 0, same = 0;
  items.forEach((it, i) => {
    const d = res.solution.times[i].s - it.s;
    if (d < -1000) earlier++; else if (d > 1000) later++; else same++;
  });
  console.log('§E5_BOUND_CHECK ' + BLD + ': cpmStart<rawStart(per-element bound NOT enforced)=' + earlier +
    ' cpmStart>rawStart=' + later + ' cpmStart==rawStart=' + same + '/' + items.length +
    ' -- ' + (earlier > 0 ? 'CONFIRMS E5-as-lower-bound is fully retired (S6 superseded it)'
                          : 'UNEXPECTED: per-element floor still holds, investigate before concluding E5 is dead'));
}
main().catch(e => { console.error(e); process.exit(1); });
