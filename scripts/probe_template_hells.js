#!/usr/bin/env node
// probe_template_hells.js — THE TWO HELLS, measured on real buildings, legacy vs template path.
//
// ⚠ DO NOT REMOVE — SCOPE. Answers one question and no other: does routing production through
// 4D_template.json (§TPL_WIRED) reduce (A) floating — an element on screen before the thing that
// bears it — and (B) stacking — elements piled at one instant. A/B on the SAME building, SAME
// rates, one flag apart. Read the §HELLS log after every run.
//
// The judge is required from viewer/support_sweep.js, never re-derived (4D_BAR_MODEL.md §10.1
// rule 1). Floating here is the ELEMENT-level physical question, not a designated-support
// election: for every bearing pair (S bears T), does T start before S finishes?
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), os = require('os');
const HOME = os.homedir();
const initSqlJs = require(path.join(HOME, 'bim-ootb', 'node_modules', 'sql.js'));
const SQLJS_DIST = path.join(HOME, 'bim-ootb', 'node_modules', 'sql.js', 'dist');
const V = path.join(__dirname, '..', 'viewer');
const ScheduleGate = require(path.join(V, 'schedule_gate.js'));
global.ScheduleGate = ScheduleGate;
const ScheduleAuthor = require(path.join(V, 'schedule_author.js'));
const SupportSweep = require(path.join(V, 'support_sweep.js'));

const BLD = process.env.BLD_DIR || path.join(HOME, 'bim-ootb', 'buildings');
const BUILDINGS = process.argv.slice(2).length ? process.argv.slice(2)
  : ['Duplex', 'HHS_Office_Federated', 'Hospital'];
const START = '2026-01-01';
const T = JSON.parse(fs.readFileSync(path.join(V, 'rates', '4D_template.json'), 'utf8'));
const EPS = ScheduleGate.EPS, GAP = ScheduleGate.GAP, CELL = ScheduleGate.CELL;

function executedRules() {
  const sb = { console: { log() {}, warn() {}, error() {} } };
  vm.createContext(sb); vm.runInContext(fs.readFileSync(path.join(V, 'rates.js'), 'utf8'), sb);
  return sb;
}

// SUPPORT PAIRS — from the SHIPPED contact graph, never re-derived (§10.1 rule 1). This probe
// re-derived the rule three times before this and was wrong three times: (1) all-of instead of
// any-of, (2) an unbounded support TOP so a riser "bore" the whole building, (3) bearing-below
// ONLY — which called every ceiling-hung pipe floating, when a pipe at bz=2.732 under a slab at
// bz=2.79 is held from ABOVE and is not hanging at all. _contactGraph already encodes all three
// clauses (bearing-below, carrier-above, embedded). Use it.
function supportPairs(items) {
  const G = SupportSweep.contactGraph(items);
  const pairs = [];
  if (!G.ok) return pairs;
  for (let i = 0; i < items.length; i++) {
    const list = G.contacts[i];
    if (!list) continue;
    for (const j of list) pairs.push([j, i]);      // j supports i
  }
  return pairs;
}

const SAMPLES = [];
// ANY-OF, not all-of. An element is floating iff NOTHING that bears it is up yet. Counting every
// bearing PAIR as a constraint is wrong physics and it showed: the top pattern was
// "MEP_Rough_in_L1 bears Architecture_Envelope_L2" 157x — a duct at the L1 ceiling whose top
// happens to meet an L2 wall's base. The SLAB carries that wall; the duct merely touches. With
// all-of semantics every such touch became a violation. Same rule the merged
// probe_floating_guid_audit.js uses (§FGA_EYE_FLOATING: bearingPlaced === 0), and the same any-of
// set bar_model.js attachContacts feeds the scheduler.
function measure(label, els, pairs, sched, taskOf) {
  SAMPLES.length = 0;
  const supportsOf = new Map();
  for (const [si, ti] of pairs) {
    if (!supportsOf.has(ti)) supportsOf.set(ti, []);
    supportsOf.get(ti).push(si);
  }
  let floating = 0, intra = 0, cross = 0, gated = 0;
  for (const [ti, sup] of supportsOf) {
    const t = sched[els[ti].guid]; if (!t) continue;
    gated++;
    let held = false, earliest = null;
    for (const si of sup) {
      const sc = sched[els[si].guid]; if (!sc) continue;
      if (sc.end - 1 <= t.start) { held = true; break; }
      if (!earliest || sc.end < earliest.end) earliest = { si, end: sc.end };
    }
    if (held) continue;
    floating++;
    const b = taskOf && taskOf[els[ti].guid];
    const a = earliest ? (taskOf && taskOf[els[earliest.si].guid]) : null;
    if (a != null && a === b) intra++; else {
      cross++;
      if (SAMPLES.length < 400 && earliest)
        SAMPLES.push({ st: a, tt: b });
    }
  }

  const hist = new Map();
  for (const e of els) { const st = sched[e.guid]; if (st) hist.set(st.start, (hist.get(st.start) || 0) + 1); }
  let maxPile = 0, over20 = 0;
  for (const v of hist.values()) { if (v > maxPile) maxPile = v; if (v >= 20) over20++; }
  const starts = [...hist.values()].reduce((a, b) => a + b, 0);
  return { label, floating, intra, cross, gated, pairs: pairs.length, maxPile, over20,
           placed: starts, distinctInstants: hist.size };
}

(async () => {
  const SQL = await initSqlJs({ locateFile: f => path.join(SQLJS_DIST, f) });
  const R = executedRules();
  const SHIFT = T.calendar.hours_per_shift;
  const rows = [];
  for (const bld of BUILDINGS) {
    const file = path.join(BLD, bld + '_extracted.db');
    if (!fs.existsSync(file)) { console.log('§HELLS_SKIP ' + bld); continue; }
    const base = { start: START, laborRates: R.LABOR_RATES, rates: R.RATES,
      nameOverrides: R.SEQUENCE_NAME_OVERRIDES, defaultRule: R.SEQUENCE_DEFAULT,
      scheduleGate: ScheduleGate, shiftHours: SHIFT };

    let els = null, pairs = null;
    const out = {};
    for (const mode of ['legacy', 'template']) {
      const db = new SQL.Database(new Uint8Array(fs.readFileSync(file)));
      if (!els) {
        els = ScheduleAuthor._buildScheduleElements(db, R.SEQUENCE_RULES, base)
          .map(e => Object.assign({}, e, { bz: e.base_z, tz: e.top_z }));
        pairs = supportPairs(els);
      }
      const _l = console.log, _w = console.warn;
      console.log = () => {}; console.warn = () => {};
      let res = null;
      try {
        res = ScheduleAuthor.materializeZones(db, R.SEQUENCE_RULES,
          mode === 'template' ? Object.assign({}, base, { template: T }) : base);
      } catch (e) { console.log = _l; console.warn = _w; console.log('§HELLS_THREW ' + bld + ' ' + mode + ' ' + e.message); }
      console.log = _l; console.warn = _w;
      // the element times this path actually produces
      let sched = res && res.displaySchedule;
      if (!sched) {
        const raw = ScheduleGate.computeSchedule(els, Date.parse(START), 1, (function () {
          const m = {}; for (const k in R.LABOR_RATES) if (R.LABOR_RATES[k].max_crews) m[k] = R.LABOR_RATES[k].max_crews; return m;
        })(), SHIFT);
        sched = raw;
      }
      // guid -> task, straight off the tables this run just wrote
      const taskOf = {};
      try {
        const te = db.exec('SELECT guid, task_id FROM task_elements');
        if (te.length) te[0].values.forEach(r => { taskOf[r[0]] = r[1]; });
      } catch (e) {}
      out[mode] = measure(mode, els, pairs, sched, taskOf);
      db.close();
    }
    const L = out.legacy, P = out.template;
    console.log('§HELLS ' + bld + ' n=' + els.length + ' supportPairs=' + L.pairs);
    console.log('   HELL A floating   legacy=' + L.floating + '/' + L.gated +
      '  template=' + P.floating + '/' + P.gated + ' (elements with >=1 bearing candidate)');
    console.log('      template split: INTRA-task=' + P.intra + ' (fixable only by ordering inside a task)' +
      '  CROSS-task=' + P.cross + ' (a phase/level ordering defect or a data defect)');
    console.log('   HELL B maxPile    legacy=' + L.maxPile + '  template=' + P.maxPile +
      '   pilesOf20+  legacy=' + L.over20 + ' template=' + P.over20);
    const agg = {};
    SAMPLES.forEach(x => { const k = (x.st || '?') + '   BEARS-> ' + (x.tt || '?');
      agg[k] = (agg[k] || 0) + 1; });
    Object.entries(agg).sort((a, b) => b[1] - a[1]).slice(0, 8)
      .forEach(([k, v]) => console.log('      §HELLS_PATTERN n=' + String(v).padStart(4) + '  ' + k));
    rows.push({ bld, L, P });
  }
  let fails = 0;
  rows.forEach(r => { if (r.P.floating > 0 || r.P.maxPile >= 20) fails++; });
  console.log('§HELLS_VERDICT buildings=' + rows.length + ' notYetZero=' + fails + ' ' +
    (fails === 0 ? 'PASS — both hells at zero on the template path' : 'WORK REMAINS'));
  process.exit(0);
})().catch(e => { console.error('§HELLS_ERROR ' + (e && e.stack || e)); process.exit(2); });
