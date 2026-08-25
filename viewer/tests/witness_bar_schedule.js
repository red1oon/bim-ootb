#!/usr/bin/env node
// WITNESS — the SCHEDULE layer of the 4D Bar model, on real buildings.
// Spec: bim-compiler prompts/4D_BAR_MODEL.md §7, §9.5, §9.6.
//
// WHICH LAYER THIS PROVES (WITNESS_INTERFACE_FRAMEWORK.md §CRISIS LESSON 1):
//   the emitted element times — midair, zero-duration, containment, phase order, band monotonicity,
//   crew caps. It says nothing about drawn pixels, kernel_ops, or the persisted `tasks` table.
//
// THE JUDGE IS NOT MINE. census() is sliced VERBATIM from viewer/tests/witness_midair_zero.js.
// A hand-written judge cost this lane a full retraction (§9.4): an inline copy testing only
// supportPool-filtered BEARING reported midair 0/4/0/0 where the real judge — which accepts bearing
// OR carrier OR embedded over EVERY element — reported 18/129/124/697. A judge built from the
// scheduler's own predicate cannot contradict the scheduler. Never reimplement it here.
//
// Command: node viewer/tests/witness_bar_schedule.js [Building ...]
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), os = require('os');
const HOME = os.homedir();
const initSqlJs = require(path.join(HOME, 'bim-ootb', 'node_modules', 'sql.js'));
const SQLJS_DIST = path.join(HOME, 'bim-ootb', 'node_modules', 'sql.js', 'dist');
const V = process.env.VIEWER_DIR || path.join(__dirname, '..');
const SG = require(path.join(V, 'schedule_gate.js')); global.ScheduleGate = SG;
const SA = require(path.join(V, 'schedule_author.js'));
const BM = require(path.join(V, 'bar_model.js'));
const BN = require(path.join(V, 'bar_needs.js'));
const KIT = path.join(__dirname, '..', '..', 'witness_kit');
const { Witness } = require(path.join(KIT, 'contract'));
const { ScheduledElementRow } = require(path.join(KIT, 'schemas', 'bar_schedule'));
const INV = require(path.join(KIT, 'invariants', 'bar_schedule'));

const POLICY = JSON.parse(fs.readFileSync(path.join(V, 'rates', '4D_policy.json'), 'utf8'));
const BLD_DIR = process.env.BLD_DIR || path.join(HOME, 'bim-ootb', 'buildings');
const BUILDINGS = process.argv.slice(2).length ? process.argv.slice(2)
  : ['Duplex', 'HHS_Office_Federated', 'Hospital', 'Terminal'];

// §MIDAIR_BASELINE — measured 2026-08-26 on this exact model, judged by the sliced census().
// Shipping engine for comparison: 17 / 147 / 139 / 226. The model beats it on three and loses on
// Terminal, which prompts/4D_SCHEDULE_PERFECTION.md §S72.2 traces to one line in room_walker.js
// (a storey row is emitted only where a room was compiled), not to the scheduler.
const MIDAIR_BASELINE = {
  Duplex: 12, HHS_Office_Federated: 70, Hospital: 92, Terminal: 336
};

// ── census(), sliced. Never reimplemented — see the header. ───────────────────────────────────
function sliceFn(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) throw new Error(name + ' not found in witness_midair_zero.js — fix the slice, do not retype it');
  let d = 0, open = false;
  for (let k = i; k < src.length; k++) {
    if (src[k] === '{') { d++; open = true; }
    else if (src[k] === '}') { d--; if (open && d === 0) return src.slice(i, k + 1); }
  }
  throw new Error('unbalanced braces slicing ' + name);
}
const census = new Function('CELL', 'EPS', 'GAP', 'D',
  sliceFn(fs.readFileSync(path.join(V, 'tests', 'witness_midair_zero.js'), 'utf8'), 'census') + '; return census;'
)(SG.CELL, SG.EPS, SG.GAP, 86400000);

function executedRules() {
  const sb = { console: { log() {}, warn() {}, error() {} } };
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(V, 'rates.js'), 'utf8'), sb);
  return sb;
}

// One full run of the model at a given band setting.
function run(els, bandRank, needs, ct, R, bands) {
  const order = BM.phaseOrder(R.SEQUENCE_RULES);
  const pol = JSON.parse(JSON.stringify(POLICY));
  if (bands != null) pol.level_bands = bands;
  const lv = BM.coarsenLevels(els, null, SG.collapsePhase, bandRank, pol.level_bands);
  const tree = BM.buildTree(els, pol, SG.collapsePhase, bandRank, order, lv);
  tree.correctedLevel = null;
  BM.attachNeeds(tree.leaves, needs.edges);
  BM.attachContacts(tree.leaves, ct.contacts, ct.grounded);
  const res = BM.schedule(tree, { laborRates: R.LABOR_RATES, baseMs: 0, phaseOrder: order, levelLink: pol.level_link });
  return { tree, res, order };
}
// §4D_BAND_MONOTONIC judged on the emitted times: a trade on rank r+1 starting before that trade's
// last element on rank r has finished. Uses the ORIGINAL storey ranks, never the coarsened bands —
// judging against the bands the scheduler used would make the gate agree with itself by definition.
function bandInversions(els, byGuid, bandRank, levelOf) {
  const m = {};
  els.forEach(e => {
    const b = byGuid[e.guid]; if (!b || b.start == null) return;
    // levelOf = the CORRECTED level when supplied, the raw storey label otherwise. Both are
    // reported; the gate uses the corrected one, and the reason is not convenience:
    // correctLevelsByGeometry only moves an element when its own label contradicts what it
    // demonstrably rests on, and only upward — 24 such cases were measured across the fleet
    // (`Superstructure Level 1` resting on `Superstructure Level 2`). Judging a corrected element
    // against the label that was wrong counts the FIX as the fault. What must never be used here is
    // the COARSENED band: fewer bands means fewer adjacent pairs, so the gate would agree with
    // itself by construction, which is exactly the §9.4 mistake.
    const lab = (levelOf && levelOf[e.guid]) || SG.collapsePhase(e.storey);
    const rk = bandRank[lab]; if (rk == null) return;
    const k = (e.resource || '_DEFAULT') + '|' + rk;
    const x = m[k] || (m[k] = { max: -Infinity, starts: [] });
    if (b.stop > x.max) x.max = b.stop;
    x.starts.push(b.start);
  });
  let inv = 0;
  Object.keys(m).forEach(k => {
    const [t, r] = k.split('|');
    const up = m[t + '|' + (Number(r) + 1)]; if (!up) return;
    up.starts.forEach(s => { if (s < m[k].max) inv++; });
  });
  return inv;
}

(async () => {
  const SQL = await initSqlJs({ locateFile: f => path.join(SQLJS_DIST, f) });
  const R = executedRules();
  const rows = [], per = [], dial = [];

  for (const bld of BUILDINGS) {
    const file = path.join(BLD_DIR, bld + '_extracted.db');
    if (!fs.existsSync(file)) { console.log('§BS_SKIP ' + bld); continue; }
    const db = new SQL.Database(new Uint8Array(fs.readFileSync(file)));
    const _l = console.log, _w = console.warn;
    console.log = () => {}; console.warn = () => {};
    const els = SA._buildScheduleElements(db, R.SEQUENCE_RULES, {
      laborRates: R.LABOR_RATES, rates: R.RATES,
      nameOverrides: R.SEQUENCE_NAME_OVERRIDES, defaultRule: R.SEQUENCE_DEFAULT });
    const bandRank = SG.deriveBandRanks(els, null).bandRank;
    const needs = BN.buildNeeds(els, {});
    const ct = BN.buildContacts(els);
    console.log = _l; console.warn = _w;

    const { tree, res } = run(els, bandRank, needs, ct, R, null);   // the POLICY default
    const byGuid = {}; tree.leaves.forEach(b => { byGuid[b.guid] = b; });
    const taskOf = {}; tree.tasks.forEach(t => t.children().forEach(c => { taskOf[c.guid] = t; }));

    const geo = els.filter(e => (e.x1 - e.x0) || (e.y1 - e.y0) || (e.top_z - e.base_z));
    const items = geo.filter(e => byGuid[e.guid] && byGuid[e.guid].start != null).map(e => {
      const b = byGuid[e.guid];
      return { guid: e.guid, s: b.start, e: b.stop, bz: e.base_z, tz: e.top_z,
               x0: e.x0, x1: e.x1, y0: e.y0, y1: e.y1, cls: e.cls, seq: e.seq, phase: e.phase };
    });
    const c = census(items);
    const floating = {}; c.worst.forEach(w => { floating[w.cls + '|' + w.phase] = 1; });

    els.forEach(e => {
      const b = byGuid[e.guid], t = taskOf[e.guid];
      if (!b || b.start == null || !t) return;
      rows.push({ building: bld, guid: e.guid, cls: e.cls, phase: e.phase || '?',
        structural: BM.isStructural(e.phase), trade: e.resource || '_DEFAULT',
        start: b.start, stop: b.stop, taskStart: t.start, taskStop: t.stop,
        floating: !!floating[e.cls + '|' + e.phase] });
    });

    const invRaw = bandInversions(els, byGuid, bandRank, null);
    const inv = bandInversions(els, byGuid, bandRank, tree.correctedLevel);
    const stack = INV.phaseStacking(tree.tasks.map(t => ({ level: t.level, start: t.start, stop: t.stop })));
    per.push({ bld, tree, res, midair: c.midair, inv, stack, els, byGuid });
    console.log('§BAR_SCHEDULE ' + bld + ' n=' + els.length + ' bars=' + tree.tasks.length +
      ' midair=' + c.midair + ' bandInversions=' + inv + ' (byRawLabel=' + invRaw + ')' +
      ' phaseStacking=' + stack +
      ' forcePlaced=' + res.cycles.length +
      ' spanD=' + ((tree.project.stop - tree.project.start) / 86400000).toFixed(0));

    // THE DIAL, proved on the two buildings that have levels to coarsen. Documented behaviour is
    // monotone: coarser bands buy less midair and cost band monotonicity. If that ever inverts, the
    // policy's own _level_bands_why is lying to whoever reads it.
    if (bld === 'Terminal' || bld === 'Hospital') {
      const fine = { midair: c.midair, inv };
      const r2 = run(els, bandRank, needs, ct, R, 1);
      const g2 = {}; r2.tree.leaves.forEach(b => { g2[b.guid] = b; });
      const items2 = geo.filter(e => g2[e.guid] && g2[e.guid].start != null).map(e => {
        const b = g2[e.guid];
        return { guid: e.guid, s: b.start, e: b.stop, bz: e.base_z, tz: e.top_z,
                 x0: e.x0, x1: e.x1, y0: e.y0, y1: e.y1, cls: e.cls, seq: e.seq, phase: e.phase };
      });
      const coarse = { midair: census(items2).midair, inv: bandInversions(els, g2, bandRank, r2.tree.correctedLevel) };
      dial.push({ bld, fine, coarse });
      console.log('   §BAR_DIAL ' + bld + ' fine(storey) midair=' + fine.midair + ' bandInv=' + fine.inv +
        '   coarse(1 band) midair=' + coarse.midair + ' bandInv=' + coarse.inv);
    }
    db.close();
  }

  Witness('bar_schedule')
    .population(() => rows)
    .schema(ScheduledElementRow)
    // Composite guarantees — these are tautologies under §2.1 and gated so they stay that way.
    .invariant('every-element-inside-its-task', INV.everyElementInsideItsTask)
    .invariant('no-zero-duration', INV.noZeroDuration)
    // The two hells, at the POLICY DEFAULT. Locked to the measured fleet baseline, not to 0:
    // a baseline that lies is worse than a number that is honest about where it stands.
    // MIDAIR — THE PRIMARY HELL, GATED, not merely printed. It was printed-only until 2026-08-26:
    // Terminal could have gone 336 -> 3,360 with this witness still green. A number in a §-log that
    // no invariant reads is a number nothing defends.
    // LOCKED PER-BUILDING BASELINE, the same shape witness_midair_zero.js's own W-MZ-2 uses — not a
    // gate at 0, because 0 is not where this stands and a baseline that lies is worse than an honest
    // one. Lower these when the work earns it; never raise one without saying why in the same commit.
    .invariant('midair-within-locked-baseline', () => per.every(p => p.midair <= MIDAIR_BASELINE[p.bld]))
    .invariant('band-monotonic-holds', () => per.every(p => p.inv <= 20))
    .invariant('phases-do-not-stack-within-a-level', () => per.every(p => p.stack === 0))
    // Was a two-branch `||` whose first branch passed {} as the rate table — every cap defaulting to
    // 1, so it always failed and always fell through to the real check. It worked by accident.
    .invariant('crew-caps-honoured', () => per.every(p =>
      INV.crewBreaches(rows.filter(r => r.building === p.bld), R.LABOR_RATES).length === 0))
    // THE DIAL is monotone in both directions, on both buildings that have levels to coarsen.
    .invariant('dial-coarser-buys-less-midair', () => dial.every(d => d.coarse.midair <= d.fine.midair))
    .invariant('dial-coarser-costs-band-monotonicity', () => dial.every(d => d.coarse.inv > d.fine.inv))
    // RED CONTROLS — each gate rejects its own defect, in the committed witness.
    .invariant('redctl:midair gate rejects a building over its baseline',
      () => !(([{ bld: 'Duplex', midair: MIDAIR_BASELINE.Duplex + 1 }])
              .every(p => p.midair <= MIDAIR_BASELINE[p.bld])))
    .invariant('redctl:inside gate rejects an element outside its task',
      () => INV.everyElementInsideItsTask([{ start: 0, stop: 10, taskStart: 5, taskStop: 10 }]) === false)
    .invariant('redctl:zero gate rejects a zero-duration element',
      () => INV.noZeroDuration([{ start: 5, stop: 5 }]) === false)
    .invariant('redctl:stacking gate rejects two overlapping tasks on one level',
      () => INV.phaseStacking([{ level: 'L1', start: 0, stop: 10 }, { level: 'L1', start: 5, stop: 15 }]) === 1)
    .redControl(rs => rs.map((r, i) => i ? r : Object.assign({}, r, { stop: r.taskStop + 86400000 })))
    .run();
})();
