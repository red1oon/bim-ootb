#!/usr/bin/env node
// probe_cpm_schedule.js — Implementing prompts/4D_SCHEDULE_ARCHITECTURE_REDESIGN.md §CPM_SPEC
// (bim-compiler, 2026-08-16), §EXECUTION_PLAN stages 1-3 harness. Runs the NEW side-by-side CPM
// module (viewer/cpm_schedule.js) against the 7 shipped buildings' extracted DBs and measures:
//   §CPM_PARITY      — CpmSchedule.contactGraph agrees contact-for-contact with time_machine.js
//                      _contactGraph (the judge stays an INDEPENDENT copy here, sliced verbatim)
//   §CPM_FLOATING    — floatingCensus (the judge) on CPM output; acceptance: 0 structural
//                      (footing/column/beam/slab), total confined to cycle-break population
//   §CPM_STOREY      — storeyOrderReport at LEVEL granularity on CPM output; acceptance: 0 violations
//   §CPM_TIMING      — CPM build+solve wall-clock (own components: contact/build/solve)
// §S20 Part B (2026-08-17, 4D_GANTT_TM_REFACTOR.md): §CPM_TIMING used to also report a one-call
// _tierAuditRegate wall-clock as a comparison baseline ("the documented 78-90% dominant cost of the
// shipped pipeline") — _tierAuditRegate (time_machine.js's dead legacy repair chain) is deleted in
// this same PR, so there is nothing left to compare against; the comparison line and its regateMs
// field are removed, CPM's own timing breakdown is unaffected and kept.
// Loading pattern verbatim from probe_captured_floating.js. Read the log after every run.
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

const BLD_DIR = process.env.BLD_DIR || path.join(require('os').homedir(), 'bim-ootb', 'buildings');
const FLEET = (process.env.ONLY ? [process.env.ONLY] : [
  'Duplex_extracted', 'Clinic_extracted', 'HHS_Office_Federated_extracted', 'JKR_extracted',
  'Hospital_extracted', 'Terminal_extracted', 'LTU_AHouse_extracted'
]);
const SHIFT_HOURS = process.env.SHIFT_HOURS ? Number(process.env.SHIFT_HOURS) : 24;
const DAY_MS = 86400000;

// floatingCensus — THE JUDGE, verbatim math from probe_captured_floating.js, running on the
// SLICED time_machine _contactGraph (independent of the module under test).
function floatingCensus(items) {
  const G = _contactGraph(items);
  let midair = 0; const byClass = {};
  for (let i = 0; i < items.length; i++) {
    const list = G.contacts[i]; if (!list) continue;
    let first = Infinity;
    for (const k of list) { const s = items[k].s; if (s < first) first = s; }
    if (first > items[i].s + 1) { midair++; byClass[items[i].cls] = (byClass[items[i].cls] || 0) + 1; }
  }
  return { midair, orphans: G.orphans, grounded: G.groundedN, byClass };
}

// storeyOrderReport — verbatim math from probe_captured_floating.js (LEVEL granularity applied by
// the caller via collapsePhase).
function storeyOrderReport(items, label) {
  const byStorey = {};
  items.forEach(function (o) {
    const key = o.storey || '_NONE';
    const g = byStorey[key] || (byStorey[key] = { zs: [], starts: [] });
    g.zs.push(o.bz);
    g.starts.push(o.s);
  });
  const globalMin = Math.min.apply(null, items.map(function (o) { return o.s; }));
  const rows = Object.keys(byStorey).map(function (k) {
    const g = byStorey[k];
    const meanZ = g.zs.reduce(function (a, b) { return a + b; }, 0) / g.zs.length;
    const starts = g.starts.slice().sort(function (a, b) { return a - b; });
    const n = starts.length;
    const p10 = Math.round((starts[Math.floor(n * 0.10)] - globalMin) / DAY_MS);
    const p50 = Math.round((starts[Math.floor(n * 0.50)] - globalMin) / DAY_MS);
    return { storey: k, z: meanZ, n: n, p10: p10, p50: p50 };
  }).sort(function (a, b) { return a.z - b.z; });
  let violations = 0, worst = 0;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].p50 < rows[i - 1].p50) {
      violations++;
      worst = Math.max(worst, rows[i - 1].p50 - rows[i].p50);
    }
  }
  console.log('§CPM_STOREY_TABLE_' + label + ' ' + JSON.stringify(rows.map(function (r) {
    return [r.storey, r.z.toFixed(1), r.n, r.p10, r.p50];
  })));
  console.log('§CPM_STOREY_' + label + ' violations=' + violations + '/' + (rows.length - 1) +
    ' worstInversionDays=' + worst + ' storeys=' + rows.length);
  return { violations, worst, storeys: rows.length };
}

const STRUCTURAL = ['IfcFooting', 'IfcColumn', 'IfcBeam', 'IfcSlab'];
function structuralCount(byClass) {
  let s = 0;
  Object.keys(byClass).forEach(function (c) {
    if (STRUCTURAL.some(function (p) { return c.indexOf(p) === 0; })) s += byClass[c];
  });
  return s;
}

async function runBuilding(SQL, RATES, name) {
  const db = new SQL.Database(fs.readFileSync(path.join(BLD_DIR, name + '.db')));
  const rawElements = ScheduleAuthor._buildScheduleElements(db, RATES.SEQUENCE_RULES, {
    laborRates: RATES.LABOR_RATES, rates: RATES.RATES, nameOverrides: RATES.SEQUENCE_NAME_OVERRIDES,
    defaultRule: RATES.SEQUENCE_DEFAULT
  });
  db.close();
  const elements = rawElements.map(function (it) { return Object.assign({}, it, { bz: it.base_z, tz: it.top_z }); });
  const maxCrews = {};
  for (const res in RATES.LABOR_RATES) if (RATES.LABOR_RATES[res].max_crews) maxCrews[res] = RATES.LABOR_RATES[res].max_crews;
  const schedule = ScheduleGate.computeSchedule(elements, 0, 1, maxCrews, SHIFT_HOURS);
  const items = elements.map(function (el) {
    const st = schedule[el.guid]; if (!st) return null;
    return { guid: el.guid, cls: el.cls, seq: el.seq, phase: el.phase, storey: el.storey,
             x0: el.x0, x1: el.x1, y0: el.y0, y1: el.y1, bz: el.bz, tz: el.tz,
             s: st.start, e: st.end, resource: el.resource };   // §S6_CREW_PASS
  }).filter(Boolean);
  console.log('§CPM_BUILDING ' + name + ' n=' + items.length);

  // §CPM_PARITY — the module's own contactGraph vs the sliced judge, contact-for-contact.
  const Gj = _contactGraph(items), Gm = CpmSchedule.contactGraph(items);
  let contactsJ = 0, contactsM = 0, mismatch = 0;
  for (let i = 0; i < items.length; i++) {
    const a = Gj.contacts[i] ? Gj.contacts[i].slice().sort((x, y) => x - y) : [];
    const b = Gm.contacts[i] ? Gm.contacts[i].slice().sort((x, y) => x - y) : [];
    contactsJ += a.length; contactsM += b.length;
    if (a.length !== b.length || a.some((v, k) => v !== b[k])) mismatch++;
  }
  console.log('§CPM_PARITY contactsJudge=' + contactsJ + ' contactsModule=' + contactsM +
    ' elementMismatch=' + mismatch + ' orphans=' + Gj.orphans + '/' + Gm.orphans +
    ' grounded=' + Gj.groundedN + '/' + Gm.groundedN + ' ' + (mismatch === 0 ? 'PASS' : 'FAIL'));

  // RAW baseline floating (pre-CPM, crew-leveled generative times), for the delta report.
  const rawCensus = floatingCensus(items.map(o => Object.assign({}, o)));
  console.log('§CPM_RAW_FLOATING midair=' + rawCensus.midair + ' structural=' + structuralCount(rawCensus.byClass) +
    ' orphans=' + rawCensus.orphans);

  // THE CPM PASS (§S6_CREW_PASS: same per-resource caps computeSchedule ran on).
  const res = CpmSchedule.run(items, { maxCrews });
  if (!res.ok) throw new Error('CPM run failed: ' + res.error);
  const cpmItems = items.map(function (o, i) {
    return Object.assign({}, o, { s: res.solution.times[i].s, e: res.solution.times[i].e });
  });

  // §CREW_FEASIBILITY (4D_GANTT_TM_REFACTOR.md §S2_REVIEW_VERDICT S6 acceptance 1) — the invariant
  // the tail compression broke: per resource, concurrently-running elements must not exceed
  // max_crews. Tolerance = the day-rounding quantum: a resource only VIOLATES when its integrated
  // over-cap exposure exceeds one day (boundary/SCC-equality overlaps inside a day are absorbed).
  // Printed for RAW and CPM so the before/after is in the same log.
  function crewFeasibility(list, label) {
    const byRes = {};
    list.forEach(o => { (byRes[o.resource] = byRes[o.resource] || []).push(o); });
    let violations = 0; const detail = [];
    Object.keys(byRes).sort().forEach(function (r) {
      const cap = maxCrews[r] || 3;   // schedule_gate.js MAX_CREWS_DEFAULT, mirrored
      const ev = [];
      byRes[r].forEach(o => { ev.push([o.s, 1]); ev.push([o.e, -1]); });
      ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]);   // half-open: ends before starts at same t
      let cur = 0, mx = 0, overMs = 0, lastT = null;
      for (const [t, d] of ev) {
        if (cur > cap && lastT != null) overMs += t - lastT;
        lastT = t; cur += d; if (cur > mx) mx = cur;
      }
      if (overMs > DAY_MS) { violations++; detail.push(r + ' cap=' + cap + ' maxConc=' + mx + ' overDays=' + (overMs / DAY_MS).toFixed(1)); }
    });
    console.log('§CREW_FEASIBILITY_' + label + ' resources=' + Object.keys(byRes).length +
      ' violations=' + violations + (detail.length ? ' detail=' + JSON.stringify(detail.slice(0, 8)) : '') +
      ' ' + (violations === 0 ? 'PASS' : 'FAIL'));
    return violations;
  }
  crewFeasibility(items, 'RAW');
  const crewViol = crewFeasibility(cpmItems, 'CPM');

  // §CREW_SPREAD_FLOOR (S6 acceptance 2) — a large task-group's span must be at least its own
  // crew-arithmetic floor: max over its resources of (Σ crew-leveled duration ÷ that resource's
  // cap). Computed from the data, not assumed; tolerance 1 day (the rounding quantum).
  {
    const byGrp = {};
    cpmItems.forEach(function (o) {
      if (!o.storey) return;
      const k = (o.phase || '_UNPHASED') + '||' + ScheduleGate.collapsePhase(o.storey);
      const g = byGrp[k] || (byGrp[k] = { s: Infinity, e: -Infinity, n: 0, durByRes: {} });
      if (o.s < g.s) g.s = o.s;
      if (o.e > g.e) g.e = o.e;
      g.n++;
      g.durByRes[o.resource] = (g.durByRes[o.resource] || 0) + Math.max(0, o.e - o.s);
    });
    let floorViol = 0; const fDetail = [];
    Object.keys(byGrp).forEach(function (k) {
      const g = byGrp[k]; if (g.n < 1000) return;
      let floorMs = 0, floorRes = null;
      Object.keys(g.durByRes).forEach(function (r) {
        const f = g.durByRes[r] / (maxCrews[r] || 3);
        if (f > floorMs) { floorMs = f; floorRes = r; }
      });
      const spanMs = g.e - g.s;
      const ok = spanMs >= floorMs - DAY_MS;
      if (!ok) floorViol++;
      fDetail.push(k + ' n=' + g.n + ' span=' + (spanMs / DAY_MS).toFixed(1) + 'd floor=' +
        (floorMs / DAY_MS).toFixed(1) + 'd(' + floorRes + ') ' + (ok ? 'ok' : 'VIOL'));
    });
    console.log('§CREW_SPREAD_FLOOR groups(n>=1000)=' + fDetail.length + ' violations=' + floorViol +
      ' ' + JSON.stringify(fDetail) + ' ' + (floorViol === 0 ? 'PASS' : 'FAIL'));
  }

  // §CPM_FLOATING — the judge on CPM output.
  const census = floatingCensus(cpmItems);
  const structural = structuralCount(census.byClass);
  console.log('§CPM_FLOATING midair=' + census.midair + ' structural=' + structural +
    ' orphans=' + census.orphans + ' byClass=' + JSON.stringify(census.byClass));

  // §CPM_STOREY — LEVEL granularity (collapsePhase). RAW baseline first: an inversion already
  // present in the crew-leveled generative schedule is not something the CPM pass introduced.
  const rawStorey = storeyOrderReport(items.map(function (o) {
    return { storey: ScheduleGate.collapsePhase(o.storey), bz: o.bz, s: o.s };
  }), 'RAW_LEVEL');
  const storeyRes = storeyOrderReport(cpmItems.map(function (o) {
    return { storey: ScheduleGate.collapsePhase(o.storey), bz: o.bz, s: o.s };
  }), 'LEVEL');

  // §CPM_STOREY_PHASE — what E4 actually asserts: per-discipline level monotonicity (p50).
  {
    const byPL = {};
    const stragglerOf = res.graph.stragglerOf;
    cpmItems.forEach(function (o, idx) {
      const L = ScheduleGate.collapsePhase(o.storey); if (!L || !o.storey) return;
      const P = o.phase || '_UNPHASED';
      const g = byPL[P] || (byPL[P] = {});
      (g[L] || (g[L] = { zs: [], starts: [], strag: 0 })).zs.push(o.bz);
      g[L].starts.push(o.s);
      if (stragglerOf[idx]) g[L].strag++;
    });
    let phaseViol = 0, detail = [];
    Object.keys(byPL).forEach(function (P) {
      const rows = Object.keys(byPL[P]).map(function (L) {
        const g = byPL[P][L];
        const starts = g.starts.slice().sort((a, b) => a - b);
        return { L, z: g.zs.reduce((a, b) => a + b, 0) / g.zs.length,
                 p50: starts[Math.floor(starts.length / 2)], n: starts.length,
                 stragPct: Math.round(100 * g.strag / starts.length) };
      }).sort((a, b) => a.z - b.z);
      for (let i = 1; i < rows.length; i++) {
        if (rows[i].p50 < rows[i - 1].p50 - DAY_MS) {   // > 1 day = a real inversion, not tail rounding
          phaseViol++;
          if (detail.length < 8) detail.push(P + ':' + rows[i - 1].L + '(n=' + rows[i - 1].n +
            ',strag=' + rows[i - 1].stragPct + '%)>' + rows[i].L + '(n=' + rows[i].n +
            ',strag=' + rows[i].stragPct + '%)by' +
            Math.round((rows[i - 1].p50 - rows[i].p50) / DAY_MS) + 'd');
        }
      }
    });
    console.log('§CPM_STOREY_PHASE violations=' + phaseViol + (detail.length ? ' detail=' + JSON.stringify(detail) : ''));
  }

  // §CPM_GATE_CHECK — the forward pass's own guarantee, asserted independently: no element may
  // start before any of its (non-dropped) in-edge bounds. 0 = the solver honoured every edge.
  {
    const idxByGuid = {}; cpmItems.forEach((o, i) => idxByGuid[o.guid] = i);
    let gateViol = 0;
    const graph = res.graph, sol = res.solution;
    const nodeES = new Float64Array(graph.nNodes), nodeEF = new Float64Array(graph.nNodes);
    for (let i = 0; i < items.length; i++) { nodeES[i] = sol.times[i].s; nodeEF[i] = sol.times[i].e; }
    // milestones: recompute ES from non-dropped in-edges via one sweep (they aren't in times[])
    // — instead verify only element-target edges, whose sources' ES/EF we recompute transitively:
    // milestone ES = max over its own in-edges; walk edges twice (milestone ids are > n and the
    // graph is acyclic over them, but member->milestone->element ordering is not index-sorted, so
    // iterate to fixpoint over milestone nodes only — small count, converges in <= chain depth).
    let changed = true, guard = 0;
    while (changed && guard++ < 20) {
      changed = false;
      for (let u = 0; u < graph.nNodes; u++) {
        const os = graph.out[u]; if (!os) continue;
        const ef = u < items.length ? nodeEF[u] : nodeES[u];
        for (const e of os) {
          if (e.dropped || e.to < items.length) continue;
          const b = e.kind === 1 ? ef : nodeES[u];
          if (b > nodeES[e.to] + 0.5) { nodeES[e.to] = b; changed = true; }
        }
      }
    }
    for (let u = 0; u < graph.nNodes; u++) {
      const os = graph.out[u]; if (!os) continue;
      const ef = u < items.length ? nodeEF[u] : nodeES[u];
      for (const e of os) {
        if (e.dropped || e.to >= items.length) continue;
        if (sol.comp[e.to] === sol.comp[u]) continue;   // contracted physics SCC: counted as fsViolInScc, not here
        const b = e.kind === 1 ? ef : nodeES[u];
        if (sol.times[e.to].s < b - 1) gateViol++;
      }
    }
    console.log('§CPM_GATE_CHECK elementEdgeViolations=' + gateViol + ' ' + (gateViol === 0 ? 'PASS' : 'FAIL'));
  }

  // Derived windows (§CPM_SPEC Windows — a VIEW of the one schedule, logged for drift visibility).
  const win = {};
  cpmItems.forEach(function (o) {
    const tid = (o.phase || '_UNPHASED') + '||' + ScheduleGate.collapsePhase(o.storey);
    const w = win[tid] || (win[tid] = { s: Infinity, e: -Infinity, n: 0 });
    if (o.s < w.s) w.s = o.s;
    if (o.e > w.e) w.e = o.e;
    w.n++;
  });
  console.log('§CPM_WINDOWS derivedTasks=' + Object.keys(win).length +
    ' makespanDays=' + res.solution.makespanDays.toFixed(1));

  // §S20 Part B: the _tierAuditRegate one-call timing comparison was removed here (see file header)
  // — CPM's own build+solve breakdown is still printed via §CPM_WINDOWS's neighbor line below.
  console.log('§CPM_TIMING cpmTotalMs=' + res.ms.total + ' (contact=' + res.ms.contact +
    ' build=' + res.ms.build + ' solve=' + res.ms.solve + ')');

  const pass = census.midair === 0 && storeyRes.violations === 0 && crewViol === 0;
  console.log('§CPM_ACCEPT ' + name + ' floating=' + census.midair + ' structural=' + structural +
    ' storeyViolations=' + storeyRes.violations + '/' + (storeyRes.storeys - 1) +
    ' crewFeasViolations=' + crewViol +
    ' cycleDrops=' + JSON.stringify(res.solution.drops) + ' ' + (pass ? 'PASS' : 'FAIL'));
  return { name, midair: census.midair, structural, storeyViolations: storeyRes.violations,
           crewViol,
           rawMidair: rawCensus.midair, cpmMs: res.ms.total, parity: mismatch === 0 };
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
  console.log('§CPM_FLEET ' + JSON.stringify(out.map(function (r) {
    if (r.midair !== 0 || r.storeyViolations !== 0 || !r.parity || r.crewViol !== 0) fails++;
    return [r.name, 'raw=' + r.rawMidair, 'cpm=' + r.midair, 'str=' + r.structural,
            'storeyViol=' + r.storeyViolations, 'crewViol=' + r.crewViol,
            'cpmMs=' + r.cpmMs];
  })));
  console.log('§CPM_FLEET_VERDICT buildings=' + out.length + ' fails=' + fails + ' ' + (fails === 0 ? 'PASS' : 'FAIL'));
  process.exit(fails === 0 ? 0 : 1);
}

main().catch(function (e) { console.error('§CPM_PROBE_ERROR ' + (e && e.stack || e)); process.exit(2); });
