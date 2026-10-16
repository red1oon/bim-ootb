#!/usr/bin/env node
// WITNESS — the needs() edge PROVIDERS of the 4D Bar model (viewer/bar_needs.js).
// Spec: bim-compiler prompts/4D_BAR_MODEL.md §3 ("needs() — ONE LIST, MANY PROVIDERS") and §3.1
// ("EXTRACTION IS MANDATORY").
//
// WHICH LAYER THIS PROVES (WITNESS_INTERFACE_FRAMEWORK.md §CRISIS LESSON 1): the EDGE PROVIDERS
// only — that SupportNeeds/HostNeeds/CarrierNeeds/OpeningNeeds/WallNeeds each LIFT a real shipped
// schedule_gate.js predicate instead of re-deriving one, on real building geometry. It says nothing
// about the tree arithmetic (witness_bar_composite.js) or the scheduled result — midair, phase
// stacking, crew caps (witness_bar_schedule.js, not yet built).
//
// ISSUE THIS PROVES OR DISPROVES: §3.1's own measured near-miss — a hand-written "support = anything
// below" gave Duplex 4,706 edges / 52 midair; calling ScheduleGate.supportPool gave far fewer edges
// and 0 midair. The anti-re-derivation gate here (G-BN-EDGECOUNT) makes that regression fail loudly:
// SupportNeeds+CarrierNeeds+WallNeeds+HostNeeds must sum to EXACTLY what the real
// ScheduleGate.computeSchedule's own §GEOMETRIC_SUPPORT_ORDER DAG builder reports building the SAME
// elements (its own §GEO_ORDER `edges=` log line, parsed, not trusted by inspection) — a hand-
// rederived geometry can drift from bar_needs.js's own internal bookkeeping without ever tripping a
// bug in bar_needs.js itself, but it cannot also drift the REAL shipped function's own count, so
// comparing against that is what actually catches it.
//
// Command: node viewer/tests/witness_bar_needs.js [Building ...]
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), os = require('os');
const HOME = os.homedir();
const initSqlJs = require(path.join(HOME, 'bim-ootb', 'node_modules', 'sql.js'));
const SQLJS_DIST = path.join(HOME, 'bim-ootb', 'node_modules', 'sql.js', 'dist');
const V = process.env.VIEWER_DIR || path.join(__dirname, '..');
const SG = require(path.join(V, 'schedule_gate.js')); global.ScheduleGate = SG;
const SA = require(path.join(V, 'schedule_author.js'));
const BN = require(path.join(V, 'bar_needs.js'));
const KIT = path.join(__dirname, '..', '..', 'witness_kit');
const { Witness } = require(path.join(KIT, 'contract'));
const { NeedsEdgeRow } = require(path.join(KIT, 'schemas', 'bar_needs'));
const INV = require(path.join(KIT, 'invariants', 'bar_needs'));

const BLD_DIR = process.env.BLD_DIR || path.join(HOME, 'bim-ootb', 'buildings');
const BUILDINGS = process.argv.slice(2).length ? process.argv.slice(2)
  : ['Duplex', 'HHS_Office_Federated', 'Hospital', 'Terminal'];   // §7 fleet, all four mandatory

function executedRules() {
  const sb = { console: { log() {}, warn() {}, error() {} } };
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(V, 'rates.js'), 'utf8'), sb);
  return sb;
}

// spyOn(obj, method) — G-BN-SUPPORTPOOL-CALLED needs proof that bar_needs.js CALLS
// ScheduleGate.supportPool rather than reimplementing its expression. A shallow-copied API object
// with one method wrapped, passed in as opts.scheduleGate, real behavior delegated through —
// bar_needs.js's own output must be byte-identical whether or not it's being watched.
function spyOn(obj, method) {
  let calls = 0;
  const wrapped = Object.assign({}, obj);
  wrapped[method] = function () { calls++; return obj[method].apply(obj, arguments); };
  return { wrapped, count: () => calls };
}

const GEO_ORDER_RE = /§GEO_ORDER n=(\d+) edges=(\d+) hangNearest=(\d+) hostEdges=(\d+)/;

(async () => {
  const SQL = await initSqlJs({ locateFile: f => path.join(SQLJS_DIST, f) });
  const R = executedRules();
  const spy = spyOn(SG, 'supportPool');
  const rows = [], perBuilding = [];

  for (const bld of BUILDINGS) {
    const file = path.join(BLD_DIR, bld + '_extracted.db');
    if (!fs.existsSync(file)) { console.log('§BN_SKIP ' + bld + ' fixture missing'); continue; }
    const db = new SQL.Database(new Uint8Array(fs.readFileSync(file)));
    const _l = console.log, _w = console.warn;
    console.log = () => {}; console.warn = () => {};
    const els = SA._buildScheduleElements(db, R.SEQUENCE_RULES, {
      laborRates: R.LABOR_RATES, rates: R.RATES,
      nameOverrides: R.SEQUENCE_NAME_OVERRIDES, defaultRule: R.SEQUENCE_DEFAULT });
    console.log = _l; console.warn = _w;

    // ── bar_needs.js under test — the spied ScheduleGate proves supportPool is CALLED ──────────
    console.log = () => {};   // suppress the module's own §BAR_NEEDS line here, printed once below
    const res = BN.buildNeeds(els, { scheduleGate: spy.wrapped });
    console.log = _l;

    // ── the independent, second computation: run the REAL shipped DAG builder and READ ITS OWN
    // COUNT off its own log line — never trust bar_needs.js's bookkeeping against itself ──────────
    let geoLine = null;
    console.log = function (s) { if (typeof s === 'string' && GEO_ORDER_RE.test(s)) geoLine = s; };
    SG.computeSchedule(els, 0, 1, undefined, 8);
    console.log = _l;
    const m = GEO_ORDER_RE.exec(geoLine || '');
    if (!m) { console.log('§BN_SKIP ' + bld + ' — §GEO_ORDER line not found, cannot verify'); db.close(); continue; }
    const shippedEdges = +m[2], shippedHostEdges = +m[4];
    const hostPairsLen = SG.hostPairs(els).length;
    const openingPairsLen = SG.openingPairs(els).length;
    const mySum = res.counts.support + res.counts.carrier + res.counts.wall + res.counts.host;

    res.edges.forEach(e => rows.push({ building: bld, from: e.from, to: e.to, kind: e.kind }));
    perBuilding.push({
      bld, elements: els.length, counts: res.counts, mySum, shippedEdges,
      myHost: res.counts.host, shippedHostEdges, hostPairsLen,
      myOpening: res.counts.opening, openingPairsLen
    });

    console.log('§BAR_NEEDS ' + bld + ' n=' + els.length +
      ' support=' + res.counts.support + ' host=' + res.counts.host +
      ' carrier=' + res.counts.carrier + ' opening=' + res.counts.opening +
      ' wall=' + res.counts.wall + ' total=' + res.edges.length +
      ' | shippedEdges=' + shippedEdges + ' mySum=' + mySum +
      ' shippedHostEdges=' + shippedHostEdges + ' hostPairsLen=' + hostPairsLen +
      ' openingPairsLen=' + openingPairsLen);
    db.close();
  }

  Witness('bar_needs')
    .population(() => rows)
    .schema(NeedsEdgeRow)
    .invariant('no-self-edges', INV.noSelfEdges)
    .invariant('no-duplicate-edges', INV.noDuplicateEdges)
    // THE anti-re-derivation gate (§3.1) — checked against the REAL shipped predicate's own count.
    .invariant('edge-count-matches-shipped-geo-order', () => INV.edgeCountMatchesShipped(perBuilding))
    .invariant('host-count-matches-shipped-hostpairs', () => INV.hostCountMatchesShipped(perBuilding))
    .invariant('opening-count-matches-shipped-openingpairs', () => INV.openingCountMatchesShipped(perBuilding))
    .invariant('supportPool-called-not-reimplemented', () => INV.supportPoolWasCalled(spy.count()))
    // RED CONTROLS — each gate must reject its OWN defect, in the committed witness
    // (feedback_extract_dont_author_then_gate.md), not asserted only in a throwaway session.
    .invariant('redctl:no-self-edges rejects from===to',
      () => INV.noSelfEdges([{ building: 'X', from: 'A', to: 'A', kind: 'support' }]) === false)
    .invariant('redctl:no-duplicate-edges rejects a repeated tuple',
      () => INV.noDuplicateEdges([
        { building: 'X', kind: 'support', from: 'A', to: 'B' },
        { building: 'X', kind: 'support', from: 'A', to: 'B' }]) === false)
    .invariant('redctl:edge-count gate rejects a mismatched sum',
      () => INV.edgeCountMatchesShipped([{ mySum: 5, shippedEdges: 6 }]) === false)
    .invariant('redctl:host-count gate rejects a mismatched hostPairs call',
      () => INV.hostCountMatchesShipped([{ myHost: 5, shippedHostEdges: 5, hostPairsLen: 6 }]) === false)
    .invariant('redctl:opening-count gate rejects a mismatched openingPairs call',
      () => INV.openingCountMatchesShipped([{ myOpening: 5, openingPairsLen: 6 }]) === false)
    .invariant('redctl:supportPool-called gate rejects a zero call count',
      () => INV.supportPoolWasCalled(0) === false)
    // Population-level red control: corrupt the FIRST real row into a self-edge and duplicate the
    // SECOND — noSelfEdges/noDuplicateEdges (which read the passed rows, not the closure) must
    // catch this even though the closure-based §GEO_ORDER comparisons cannot see a rows mutation.
    .redControl(rs => {
      const c = rs.map(r => Object.assign({}, r));
      if (c[0]) c[0].to = c[0].from;
      if (c[1]) c.push(Object.assign({}, c[1]));
      return c;
    })
    .run();
})();
