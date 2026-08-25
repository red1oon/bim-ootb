#!/usr/bin/env node
// PROBE — walk HHS_Office_Federated through the 4D motion hop by hop and report, at each hop,
// what the 4D_template DECLARES vs what the engine PRODUCES. Not a witness: a measurement.
'use strict';
const fs = require('fs'), path = require('path');
const initSqlJs = require('/home/red1/bim-ootb/node_modules/sql.js');
const SQLJS_DIST = '/home/red1/bim-ootb/node_modules/sql.js/dist';
const ScheduleAuthor = require(path.join(__dirname, '..', 'schedule_author.js'));
const ScheduleGate  = require(path.join(__dirname, '..', 'schedule_gate.js'));
global.ScheduleGate = ScheduleGate;

function loadRules() {
  // Run rates.js WHOLE in a sandbox — the EXECUTED table, not a hand-sliced subset. Slicing from
  // 'var RATES = {' silently dropped SEQUENCE_NAME_OVERRIDES and SHIFT_HOURS.
  const vm = require('vm');
  const sandbox = { console: { log() {}, warn() {}, error() {} }, window: undefined };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'rates.js'), 'utf8'), sandbox);
  return { SEQUENCE_RULES: sandbox.SEQUENCE_RULES, SEQUENCE_DEFAULT: sandbox.SEQUENCE_DEFAULT,
           LABOR_RATES: sandbox.LABOR_RATES, RATES: sandbox.RATES,
           SEQUENCE_NAME_OVERRIDES: sandbox.SEQUENCE_NAME_OVERRIDES || [], SHIFT_HOURS: sandbox.SHIFT_HOURS };
}
const T = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'rates', '4D_template.json'), 'utf8'));
const BUILDING = process.argv[2] || 'HHS_Office_Federated';
const BLD = process.env.BLD || path.join(require('os').homedir(), 'bim-ootb', 'buildings', BUILDING + '_extracted.db');

(async () => {
  const SQL = await initSqlJs({ locateFile: f => path.join(SQLJS_DIST, f) });
  const db = new SQL.Database(new Uint8Array(fs.readFileSync(BLD)));
  const R = loadRules();
  const SHIFT = T.calendar.hours_per_shift;              // ONE CLOCK — from the template
  const shiftSecs = SHIFT * 3600;

  // ── HOP 0 — elements ────────────────────────────────────────────────────────────────────────
  const _log = console.log, _warn = console.warn;
  let floors = [];
  const unmatched = {};
  console.warn = (...a) => { const s = a.join(' ');
    if (s.indexOf('§TPL_ZERO_MINUTE') === 0) floors.push(s);
    const m = s.match(/§CLASS_UNMATCHED cls=(\S+)/); if (m) unmatched[m[1]] = (unmatched[m[1]] || 0) + 1; };
  console.log = () => {};
  const els = ScheduleAuthor._buildScheduleElements
    ? ScheduleAuthor._buildScheduleElements(db, R.SEQUENCE_RULES, { laborRates: R.LABOR_RATES, rates: R.RATES, nameOverrides: R.SEQUENCE_NAME_OVERRIDES, defaultRule: R.SEQUENCE_DEFAULT })
    : null;
  console.log = _log; console.warn = _warn;
  if (!els) { console.log('HOP0 FAIL: _buildScheduleElements not exported'); process.exit(2); }

  console.log('§HOP0_ELEMENTS n=' + els.length + ' zeroMinuteClasses=' + floors.length +
    ' unmatchedClasses=' + Object.keys(unmatched).length);
  floors.forEach(f => console.log('   ' + f.replace(/ — .*$/, '')));
  Object.keys(unmatched).forEach(c => console.log('   §CLASS_UNMATCHED ' + c + ' x' + unmatched[c] + ' -> default ' + R.SEQUENCE_DEFAULT.phase));

  // real storeys
  const storeys = {}; els.forEach(e => { storeys[ScheduleGate.collapsePhase(e.storey)] = 1; });
  const storeyList = Object.keys(storeys).sort();
  // per-phase / per-trade work content
  const byPhase = {};
  els.forEach(e => {
    const p = e.phase || '_UNPHASED';
    const b = byPhase[p] || (byPhase[p] = { secs: 0, n: 0, trades: {} });
    b.secs += e.installSecs || 0; b.n++;
    const t = e.resource || '_NONE';
    b.trades[t] = (b.trades[t] || 0) + (e.installSecs || 0);
  });
  console.log('§HOP0_STOREYS n=' + storeyList.length + ' [' + storeyList.join(', ') + ']');

  // ── HOP 0b — CONTAMINATION + THE DAY-0 STACK ────────────────────────────────────────────────
  // User report 2026-08-25: "i noticed MEP appearing or that HR 0 truly stacked. Also they can be
  // contaminated with MEP elements in there."
  // (1) CONTAMINATION = an element whose FINAL phase differs from the phase its own ifc_class
  //     declares in SEQUENCE_RULES. Something moved it: a NAME_OVERRIDE, or a reclass pass.
  // (2) DAY-0 STACK = elements whose solved start is the very first instant. A structural phase
  //     legitimately starts there; anything else starting at hour 0 is the reported symptom.
  const classPhaseOf = {};
  Object.keys(R.SEQUENCE_RULES).forEach(k => { classPhaseOf[k] = R.SEQUENCE_RULES[k].phase; });
  const declaredPhase = cls => {
    let best = null, bl = 0;
    for (const k in classPhaseOf) if (cls.indexOf(k) >= 0 && k.length > bl) { best = k; bl = k.length; }
    return best ? classPhaseOf[best] : R.SEQUENCE_DEFAULT.phase;
  };
  const MEP = ph => ph === 'MEP Rough-in' || ph === 'MEP Final';
  const contam = {}, moved = {};
  els.forEach(e => {
    const want = declaredPhase(e.cls), got = e.phase;
    if (want === got) return;
    const k = e.cls + ': ' + want + ' -> ' + got;
    moved[k] = (moved[k] || 0) + 1;
    if (MEP(want) && !MEP(got)) contam[k] = (contam[k] || 0) + 1;   // an MEP element sitting in a structural/arch phase
  });
  console.log('\n§HOP0B_CONTAMINATION reclassified=' + Object.values(moved).reduce((a, b) => a + b, 0) +
    ' ofWhichMEPintoNonMEP=' + Object.values(contam).reduce((a, b) => a + b, 0));
  Object.keys(moved).sort((a, b) => moved[b] - moved[a]).slice(0, 8)
    .forEach(k => console.log('   ' + (contam[k] ? 'MEP-CONTAM ' : 'reclass    ') + k + ' x' + moved[k]));
  // what classes actually sit in each structural phase
  ['Substructure', 'Superstructure'].forEach(ph => {
    const cc = {};
    els.forEach(e => { if (e.phase === ph) cc[e.cls] = (cc[e.cls] || 0) + 1; });
    const keys = Object.keys(cc).sort((a, b) => cc[b] - cc[a]);
    const bad = keys.filter(c => MEP(declaredPhase(c)));
    console.log('   ' + ph.padEnd(15) + (keys.length ? keys.map(c => c + '=' + cc[c]).join(' ') : '(empty)') +
      (bad.length ? '   ⛔ MEP classes present: ' + bad.join(',') : ''));
  });

  // ── HOP 1 — what the TEMPLATE declares ──────────────────────────────────────────────────────
  console.log('\n§HOP1_TEMPLATE_SAYS phases=' + T.phases.length + ' shift=' + SHIFT + 'h');
  const mc = t => (R.LABOR_RATES[t] && R.LABOR_RATES[t].max_crews) || 1;
  let tplSerial = 0, tplSumCrew = 0, tplPerTrade = 0;
  const hdr = ['phase', 'declared?', 'present?', 'els', 'crewSecs', 'days:Σcrews', 'days:perTrade', 'bottleneck'];
  const rows = [];
  T.phases.forEach(p => {
    const b = byPhase[p.name];
    if (!b) { rows.push([p.name, 'yes', 'ABSENT', 0, 0, '-', '-', '-']); return; }
    const sumCrews = Object.keys(b.trades).filter(t => t !== '_NONE').reduce((a, t) => a + mc(t), 0) || 1;
    const dSum = b.secs / (shiftSecs * sumCrews);
    let dMax = 0, bott = '-';
    Object.keys(b.trades).forEach(t => {
      const d = b.trades[t] / (shiftSecs * (t === '_NONE' ? 1 : mc(t)));
      if (d > dMax) { dMax = d; bott = t + '(' + mc(t) + ' crews)'; }
    });
    tplSerial += b.secs / shiftSecs; tplSumCrew += dSum; tplPerTrade += dMax;
    rows.push([p.name, 'yes', 'yes', b.n, Math.round(b.secs), dSum.toFixed(2), dMax.toFixed(2), bott]);
  });
  Object.keys(byPhase).filter(p => !T.phases.some(x => x.name === p)).forEach(p => {
    rows.push([p, 'NO — UNDECLARED', 'yes', byPhase[p].n, Math.round(byPhase[p].secs), '-', '-', '-']);
  });
  const w = hdr.map((h, i) => Math.max(h.length, ...rows.map(r => String(r[i]).length)));
  console.log('  ' + hdr.map((h, i) => h.padEnd(w[i])).join('  '));
  rows.forEach(r => console.log('  ' + r.map((c, i) => String(c).padEnd(w[i])).join('  ')));
  console.log('§HOP1_DURATION serialDays=' + tplSerial.toFixed(1) +
    ' sumCrewsDays=' + tplSumCrew.toFixed(1) + ' perTradeDays=' + tplPerTrade.toFixed(1) +
    '  (serial = 1 crew does everything; sumCrews = the SHIPPED formula; perTrade = correct lower bound)');

  // ── HOP 2 — the solve ───────────────────────────────────────────────────────────────────────
  const maxCrews = {}; for (const k in R.LABOR_RATES) if (R.LABOR_RATES[k].max_crews) maxCrews[k] = R.LABOR_RATES[k].max_crews;
  console.log = () => {};
  const sched = ScheduleGate.computeSchedule(els, 0, 1, maxCrews, SHIFT);
  console.log = _log;
  let sMin = Infinity, sMax = -Infinity, nSched = 0;
  for (const g in sched) { nSched++; if (sched[g].start < sMin) sMin = sched[g].start; if (sched[g].end > sMax) sMax = sched[g].end; }
  const spanDays = (sMax - sMin) / 86400000;
  console.log('\n§HOP2_SOLVE scheduled=' + nSched + '/' + els.length + ' spanDays=' + spanDays.toFixed(1) +
    ' vs template perTradeDays=' + tplPerTrade.toFixed(1) + ' (ratio=' + (spanDays / tplPerTrade).toFixed(2) + 'x)');

  // day-0 stack: what starts at the very first instant, by phase
  const zeroBy = {};
  let zeroN = 0;
  els.forEach(e => { const st = sched[e.guid]; if (!st || st.start !== sMin) return; zeroN++;
    zeroBy[e.phase || '_UNPHASED'] = (zeroBy[e.phase || '_UNPHASED'] || 0) + 1; });
  const structFirst = Object.keys(zeroBy).every(ph => ph === 'Substructure' || ph === 'Superstructure');
  console.log('§HOP2C_DAY0_STACK atFirstInstant=' + zeroN + '/' + els.length + ' byPhase=' +
    JSON.stringify(zeroBy) + ' structuralOnly=' + structFirst +
    (structFirst ? '' : '   ⛔ a non-structural phase starts at hour 0'));

  // ── HOP 2b — THE HARD FLOOR: no trade can beat its own crew cap, whatever the overlap ───────
  // Building-wide, phase-agnostic. Overlap between phases is a legitimate design choice; exceeding
  // a trade's max_crews is not — it is physically impossible work.
  const tradeSecs = {}, conc = {};
  els.forEach(e => { const t = e.resource || '_NONE'; tradeSecs[t] = (tradeSecs[t] || 0) + (e.installSecs || 0); });
  // observed peak concurrency per trade, swept from the solve's own start/end times
  const ev = {};
  els.forEach(e => { const st = sched[e.guid]; if (!st) return; const t = e.resource || '_NONE';
    (ev[t] = ev[t] || []).push([st.start, 1], [st.end, -1]); });
  Object.keys(ev).forEach(t => {
    ev[t].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let cur = 0, pk = 0; ev[t].forEach(x => { cur += x[1]; if (cur > pk) pk = cur; }); conc[t] = pk;
  });
  console.log('\n§HOP2B_TRADE_FLOOR spanDays=' + spanDays.toFixed(1) + '  (a trade needing MORE days than the span is impossible work)');
  const th = ['trade', 'crewSecs', 'max_crews', 'needDays', 'fitsInSpan?', 'peakConcurrent', 'capBreached?'];
  const tr = Object.keys(tradeSecs).sort((a, b) => tradeSecs[b] - tradeSecs[a]).map(t => {
    const cap = t === '_NONE' ? 1 : mc(t);
    const need = tradeSecs[t] / (shiftSecs * cap);
    return [t, Math.round(tradeSecs[t]), cap, need.toFixed(2), need <= spanDays ? 'yes' : 'NO — IMPOSSIBLE',
            conc[t] || 0, (conc[t] || 0) > cap ? 'YES x' + ((conc[t] / cap).toFixed(1)) : 'no'];
  });
  const tw = th.map((h, i) => Math.max(h.length, ...tr.map(r => String(r[i]).length)));
  console.log('  ' + th.map((h, i) => h.padEnd(tw[i])).join('  '));
  tr.forEach(r => console.log('  ' + r.map((c, i) => String(c).padEnd(tw[i])).join('  ')));

  // ── HOP 3 — zones ───────────────────────────────────────────────────────────────────────────
  console.log = () => {};
  const rolled = ScheduleGate.deriveZones(els, sched, null);
  console.log = _log;
  const expectTasks = T.phases.reduce((a, p) => a + (byPhase[p.name] ? (p.replicate_per_level ? storeyList.length : 1) : 0), 0);
  console.log('§HOP3_ZONES actual=' + rolled.zones.length + ' templateExpects=' + expectTasks +
    ' edges=' + rolled.edges.length);
  const zByPhase = {}; rolled.zones.forEach(z => { (zByPhase[z.phase] = zByPhase[z.phase] || []).push(z); });
  T.phases.forEach(p => {
    if (!byPhase[p.name]) return;
    const want = p.replicate_per_level ? storeyList.length : 1;
    const got = (zByPhase[p.name] || []).length;
    if (got !== want) console.log('   DEVIATION ' + p.name + ': template wants ' + want + ' task(s) (' +
      (p.replicate_per_level ? 'per-level x' + storeyList.length : 'per-building') + '), engine produced ' + got);
  });

  // ── HOP 3b — HOW MUCH DO PHASES ACTUALLY STACK? ─────────────────────────────────────────────
  // User 2026-08-25: "it is strange why all this while we cannot rein in phases stacking."
  // The template says phases are FS+0 within a level: zero overlap. Measure the real overlap.
  const zByLevel = {};
  rolled.zones.forEach(z => { (zByLevel[z.storey] = zByLevel[z.storey] || []).push(z); });
  const order = {}; T.phases.forEach((p, i) => { order[p.name] = i; });
  let pairs = 0, overlapping = 0, worstPair = null, invertedPairs = 0;
  Object.keys(zByLevel).forEach(lv => {
    const list = zByLevel[lv].filter(z => order[z.phase] != null).sort((a, b) => order[a.phase] - order[b.phase]);
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j]; pairs++;
      const ov = Math.min(a.end, b.end) - Math.max(a.start, b.start);
      if (ov > 0) {
        overlapping++;
        const frac = ov / Math.max(1, Math.min(a.end - a.start, b.end - b.start));
        if (!worstPair || frac > worstPair.frac) worstPair = { frac, lv, a: a.phase, b: b.phase, days: ov / 86400000 };
      }
      if (b.start < a.start) invertedPairs++;    // a LATER phase starts before an EARLIER one
    }
  });
  console.log('§HOP3B_PHASE_STACK samLevelPhasePairs=' + pairs + ' overlapping=' + overlapping +
    ' (' + (100 * overlapping / Math.max(1, pairs)).toFixed(0) + '%) startOrderInverted=' + invertedPairs +
    (worstPair ? '  worst=' + worstPair.lv + ' ' + worstPair.a + ' vs ' + worstPair.b + ' ' +
      worstPair.days.toFixed(1) + 'd (' + (worstPair.frac * 100).toFixed(0) + '% of the shorter bar)' : '') +
    '   — template declares FS+0: 0% overlap, 0 inversions');

  // ── HOP 4 — zone windows vs their own work ──────────────────────────────────────────────────
  const elByGuid = {}; els.forEach(e => { elByGuid[e.guid] = e; });
  let over = 0, worst = null;
  rolled.zones.forEach(z => {
    let secs = 0; const tr = {};
    z.guids.forEach(g => { const e = elByGuid[g]; if (!e) return; secs += e.installSecs || 0; if (e.resource) tr[e.resource] = (tr[e.resource] || 0) + (e.installSecs || 0); });
    const winD = (z.end - z.start) / 86400000;
    const sumC = Object.keys(tr).reduce((a, t) => a + mc(t), 0) || 1;
    const dSum = secs / (shiftSecs * sumC);
    let dMax = 0; Object.keys(tr).forEach(t => { const d = tr[t] / (shiftSecs * mc(t)); if (d > dMax) dMax = d; });
    if (dMax > winD) { over++; const r = dMax / Math.max(winD, 1e-9); if (!worst || r > worst.r) worst = { id: z.id, r, winD, dMax, dSum }; }
  });
  console.log('§HOP4_WINDOWS zonesOverCommitted(perTrade)=' + over + '/' + rolled.zones.length +
    (worst ? ' worst=' + worst.id + ' window=' + worst.winD.toFixed(2) + 'd needs(perTrade)=' + worst.dMax.toFixed(2) + 'd needs(Σcrews)=' + worst.dSum.toFixed(2) + 'd' : ''));

  // ── HOP 6 — WHAT WOULD THE TEMPLATE'S OWN SERIAL CHAIN COST? ────────────────────────────────
  // The question this answers: if the engine STOPPED overlapping and instantiated the template
  // literally — phases packed but strictly sequential per level, levels tied only by the
  // superstructure ladder — how much longer is the programme? Nothing here changes any engine
  // behaviour; it prices the option.
  const ranks = ScheduleGate.deriveBandRanks(els, null).bandRank;
  const levelsUp = storeyList.slice().sort((a, b) => (ranks[a] == null ? 1e9 : ranks[a]) - (ranks[b] == null ? 1e9 : ranks[b]));
  // per (phase, level) work content, per-trade
  const cell = {};
  els.forEach(e => {
    const ph = e.phase || '_UNPHASED', st = ScheduleGate.collapsePhase(e.storey);
    const k = ph + '||' + st;
    const c = cell[k] || (cell[k] = {});
    const t = e.resource || '_NONE';
    c[t] = (c[t] || 0) + (e.installSecs || 0);
  });
  const cellDays = k => {
    const c = cell[k]; if (!c) return 0;
    let d = 0;
    Object.keys(c).forEach(t => { const v = c[t] / (shiftSecs * (t === '_NONE' ? 1 : mc(t))); if (v > d) d = v; });
    return Math.max(d > 0 ? 1 : 0, Math.ceil(d));   // duration_rule.min_days = 1
  };
  const ladderPhases = new Set(T.dependencies.across_levels
    .filter(e => e.pred === e.succ && e.level_offset === 1)
    .filter(e => !process.env.LADDER_ONLY || process.env.LADDER_ONLY.split(',').indexOf(e.pred) >= 0)
    .map(e => e.pred));
  const present = T.phases.filter(p => byPhase[p.name]);          // _empty_phase_rule: dropped, chain BRIDGED
  const finish = {}, finishSpan = {};                             // key -> finish day / {s,e}
  let programme = 0;
  levelsUp.forEach((lv, li) => {
    let t = 0;
    present.forEach(p => {
      const isBuilding = p.scope === 'building';
      if (isBuilding && li > 0) return;                            // _edge_scope_rule: LOWEST level only
      const k = p.name + '||' + lv;
      const d = cellDays(k);
      if (!d) return;                                              // no elements of this phase on this level
      let start = t;
      // across_levels ladder, READ FROM THE TEMPLATE — never a second hand-typed list. LADDER_ONLY
      // is a what-if knob for pricing a narrower ladder (it is how the v1.1.0 superstructure-only
      // ladder was measured at PLUMBER 1.84x over cap before v1.2.0 widened it).
      if (ladderPhases.has(p.id) && li > 0) {
        const below = finish[p.name + '||' + levelsUp[li - 1]];   // keyed by NAME, same as finish[k]
        if (below != null && below > start) start = below;
      }
      const end = start + d;
      finish[k] = end; finishSpan[k] = { s: start, e: end }; t = end;
      if (process.env.HOP6_DEBUG) console.log('     dbg ' + k + ' start=' + start + ' d=' + d + ' end=' + end);
      if (end > programme) programme = end;
    });
  });
  // HOP 6b — is the serial plan CREW-LEGAL? Levels run in parallel (only the superstructure ladder
  // ties them), so the same trade can be demanded on two levels at once. Average crew demand per
  // task per trade = secs_t / (shift * durationDays); summed across every task live on a given day.
  const dayDemand = {};                                            // trade -> day -> crews
  Object.keys(finishSpan).forEach(k => {
    const sp = finishSpan[k], c = cell[k] || {};
    Object.keys(c).forEach(t => {
      if (t === '_NONE') return;
      const crews = c[t] / (shiftSecs * Math.max(1, sp.e - sp.s));
      const dd = dayDemand[t] || (dayDemand[t] = {});
      for (let d = sp.s; d < sp.e; d++) dd[d] = (dd[d] || 0) + crews;
    });
  });
  const serialBreach = [];
  Object.keys(dayDemand).forEach(t => {
    let pk = 0; Object.keys(dayDemand[t]).forEach(d => { if (dayDemand[t][d] > pk) pk = dayDemand[t][d]; });
    if (pk > mc(t) + 1e-9) serialBreach.push(t + ' peak=' + pk.toFixed(2) + ' cap=' + mc(t) + ' (' + (pk / mc(t)).toFixed(2) + 'x)');
  });

  console.log('\n§HOP6_SERIAL_COST ladder=[' + Array.from(ladderPhases).join(',') + '] templateSerialProgramme=' + programme + 'd vs engineSpan=' +
    spanDays.toFixed(1) + 'd  (ratio=' + (programme / spanDays).toFixed(2) + 'x) — phases packed, strictly sequential per level, levels tied only by the superstructure ladder');
  levelsUp.forEach(lv => {
    const parts = present.map(p => { const d = cellDays(p.name + '||' + lv); return d ? p.name + '=' + d + 'd' : null; }).filter(Boolean);
    if (parts.length) console.log('   ' + lv.padEnd(14) + parts.join('  '));
  });
  console.log('§HOP6B_SERIAL_CREWLEGAL breaches=' + serialBreach.length +
    (serialBreach.length ? ' [' + serialBreach.join('; ') + ']' : ' — every trade within max_crews across the level-parallel plan') +
    '  (levels run in parallel under the one declared vertical edge, so a trade CAN be demanded on two levels at once)');

  // ── HOP 5 — edges: are they logic or restatements of the dates? ─────────────────────────────
  let restated = 0;
  rolled.edges.forEach(e => {
    const p = rolled.zones.find(z => z.id === e.predId), s = rolled.zones.find(z => z.id === e.succId);
    if (!p || !s) return;
    if (Math.abs((s.start - p.end) - e.lagMs) < 1) restated++;    // lag IS the observed gap
  });
  console.log('§HOP5_EDGES n=' + rolled.edges.length + ' lagEqualsObservedGap=' + restated +
    ' (' + (100 * restated / Math.max(1, rolled.edges.length)).toFixed(0) + '%) — template declares ' +
    (T.dependencies.within_level.length + T.dependencies.across_levels.length) + ' LOGIC edges with no date');
  db.close();
})();
