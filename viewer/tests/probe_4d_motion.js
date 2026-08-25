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
