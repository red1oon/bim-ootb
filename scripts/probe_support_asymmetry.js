#!/usr/bin/env node
// probe_support_asymmetry.js — §S64 (bim-compiler prompts/4D_SCHEDULE_PERFECTION.md §S63's ⛔ open item).
//
// ISSUE THIS PROVES OR DISPROVES: computeSchedule and auditFloating are supposed to test the SAME
// physics (auditFloating's own header: "scheduler and auditor now test the same thing"; the hang
// guard's comment: "mirrors the scheduler's hangGate pool rule, so audit and scheduler agree").
// §S63 measured one pair where they do NOT agree. This probe asks the general question: across all
// 7 shipped buildings, for EVERY element auditFloating reports as floating, WHICH side disagrees,
// and by how much.
//
// It never re-implements physics it can import: computeSchedule/auditFloating come from the shipped
// module. The per-element route reconstruction below mirrors auditFloating's own scan verbatim
// (schedule_gate.js:1076-1130) so a classification can be attributed to a named predicate.
//
// Reads ONLY. Changes nothing. Command:
//   BLD_DIR=~/bim-ootb/buildings node scripts/probe_support_asymmetry.js
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const initSqlJs = require(path.join(__dirname, '..', 'modeller', 'lib', 'sql-wasm.js'));
const SG = require(path.join(__dirname, '..', 'viewer', 'schedule_gate.js'));
const ZoneIndex = require(path.join(__dirname, '..', 'viewer', 'zone_index.js'));
const tmSrc = fs.readFileSync(path.join(__dirname, '..', 'viewer', 'time_machine.js'), 'utf8');

function sliceFn(src, name) {
  const idx = src.indexOf('function ' + name + '(');
  if (idx < 0) throw new Error(name + ' not found');
  let d = 0, i = idx, o = false;
  for (; i < src.length; i++) { if (src[i] === '{') { d++; o = true; } else if (src[i] === '}') { d--; if (o && d === 0) return src.slice(idx, i + 1); } }
  throw new Error('unbalanced ' + name);
}
const BLD_DIR = process.env.BLD_DIR || path.join(require('os').homedir(), 'bim-ootb', 'buildings');
const BUILDINGS = (process.env.ONLY || 'Terminal,Hospital,Duplex,HHS_Office_Federated,Clinic,LTU_AHouse,JKR').split(',');
const DB_FILE = { LTU_AHouse: 'LTU_AHouse_meta.db' };
const CELL = SG.CELL, EPS = SG.EPS, GAP = SG.GAP, BIG = SG.BIG_ELEMENT_VOL, DAY = 86400000;
function cellsOf(e) { const o = []; for (let i = Math.floor(e.x0 / CELL); i <= Math.floor(e.x1 / CELL); i++) for (let j = Math.floor(e.y0 / CELL); j <= Math.floor(e.y1 / CELL); j++) o.push(i + ',' + j); return o; }
function overlap(a, b) { return a.x0 <= b.x1 && a.x1 >= b.x0 && a.y0 <= b.y1 && a.y1 >= b.y0; }
function vol(e) { return (e.x1 - e.x0) * (e.y1 - e.y0) * (e.top_z - e.base_z); }

// ── the two membership tests, written where they can be compared side by side ──────────────────
const schedPool = e => SG.supportPool(e);                                  // schedule_gate.js:1246
const auditPool = e => e.seq <= 4 || (e.cls === 'IfcSlab' && e.seq > 4);    // schedule_gate.js:1077
const schedElPool = e => (e.cls === 'IfcSlab' && e.seq > 4) || e.cls === 'IfcStairFlight';  // hangGate:611
const auditTPool = e => e.cls === 'IfcSlab' && e.seq > 4;                   // auditFloating:1106

(async () => {
  const names = ['_buildXrayElements'];
  if (tmSrc.indexOf('function _promoteRoofLoadPath(') >= 0) names.unshift('_promoteRoofLoadPath');
  for (const d of ['_classifyNameOverride', '_classifyRule']) if (tmSrc.indexOf('function ' + d + '(') >= 0) names.push(d);
  const sliced = names.map(n => sliceFn(tmSrc, n)).join('\n');
  const SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(__dirname, '..', 'modeller', 'lib', 'sql-wasm.wasm')) });
  const rulesJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'viewer', 'rates', 'sequence_rules.json'), 'utf8'));
  const totals = { floating: 0 };

  for (const B of BUILDINGS) {
    const dbPath = path.join(BLD_DIR, DB_FILE[B] || (B + '_extracted.db'));
    if (!fs.existsSync(dbPath)) { console.log('§ASYM_SKIP ' + B + ' fixture missing'); continue; }
    const db = new SQL.Database(fs.readFileSync(dbPath));
    const sandbox = { console: { log: () => {}, warn: () => {} }, performance: { now: () => Date.now() },
      window: { SEQUENCE_RULES: rulesJson.SEQUENCE_RULES, SEQUENCE_DEFAULT: rulesJson.SEQUENCE_DEFAULT, SEQUENCE_NAME_OVERRIDES: rulesJson.SEQUENCE_NAME_OVERRIDES || rulesJson.NAME_OVERRIDES || [] },
      A: () => ({ db: db }), ZoneIndex: ZoneIndex, _zoneIndex: () => ZoneIndex.build(db) };
    vm.createContext(sandbox);
    vm.runInContext(sliced + '\nthis.__bxe = _buildXrayElements;', sandbox);
    const els = sandbox.__bxe(); db.close();
    const geoEls = els.filter(e => !(e.x0 === e.x1 && e.y0 === e.y1 && e.base_z === e.top_z));
    geoEls.forEach(e => { e.resource = e.cls; e.installSecs = 120; });

    const ol = console.log; const engineLines = [];
    console.log = function () { engineLines.push(Array.prototype.map.call(arguments, String).join(' ')); };
    const sched = SG.computeSchedule(geoEls, 0, 1);
    const floaters = [];
    const floating = SG.auditFloating(geoEls, sched, null, floaters);
    console.log = ol;

    // membership disagreement, counted over the whole model (not just floaters)
    const gridDiff = geoEls.filter(e => schedPool(e) !== auditPool(e));
    const poolDiff = geoEls.filter(e => e.seq > 4 && schedElPool(e) !== auditTPool(e));
    const byCls = {}; gridDiff.forEach(e => { byCls[e.cls] = (byCls[e.cls] || 0) + 1; });

    // rebuild auditFloating's TWO grids so each floater's route can be attributed. The wall grid
    // matters: auditFloating offers [structGrid, wallGrid] to a promoted slab and [structGrid] to
    // everything else (schedule_gate.js:1096) — a reconstruction that scans only structGrid
    // mis-attributes every promoted-slab floater.
    const structGrid = {}, wallGrid = {};
    for (const e of geoEls) {
      if (auditPool(e)) { for (const c of cellsOf(e)) (structGrid[c] = structGrid[c] || []).push(e); }
      else if (e.cls.indexOf('IfcWall') === 0) { for (const c of cellsOf(e)) (wallGrid[c] = wallGrid[c] || []).push(e); }
    }
    const byG = new Map(geoEls.map(e => [e.guid, e]));
    // The SCHEDULER's own grid + its own `below` relation, evaluated at FINAL times. computeSchedule
    // promises (via the §DEQ_REPAIR fixpoint) that no element starts before max(geoGate,…) — but that
    // loop iterates `nonst` (seq>4) ONLY (schedule_gate.js:951). If this is violated for a floater,
    // the disagreement is NOT audit-vs-scheduler: the scheduler is contradicting itself.
    const schedGrid = {};
    for (const e of geoEls) if (schedPool(e)) for (const c of cellsOf(e)) (schedGrid[c] = schedGrid[c] || []).push(e);
    function schedBelowGate(T) {
      let g = 0, sn = {};
      for (const c of cellsOf(T)) { const arr = schedGrid[c]; if (!arr) continue;
        for (const S of arr) { if (sn[S.guid] || S.guid === T.guid) continue; sn[S.guid] = 1;
          if (S.base_z < T.base_z - EPS && overlap(S, T)) { const en = sched[S.guid].end; if (en > g) g = en; } } }
      return g;
    }
    let selfViol = 0, selfViolByClass = {};
    const cycSet = new Set(global.__PROBE_CYCLE_GUIDS || []);
    let cycViol = 0, cycFloat = 0;
    const t0 = Math.min(...Object.values(sched).map(s => s.start));
    const KEYS = ['A1', 'A2', 'A3a', 'A3a_passA_vs_passB', 'A3b', 'A3c', 'A4'];
    const cls = {}, samples = {}; KEYS.forEach(k => { cls[k] = 0; samples[k] = []; });
    let worstDeficit = 0;

    for (const g of floaters) {
      const T = byG.get(g); if (!T) continue;
      const cs = cellsOf(T);
      let route = null, se = 0, seen = {}, seS = null, seFromWall = false;
      const isPromo = T.cls === 'IfcSlab' && T.seq > 4;
      const pools = isPromo ? [structGrid, wallGrid] : [structGrid];
      for (let pi = 0; pi < pools.length; pi++) {
        for (const c of cs) { const arr = pools[pi][c]; if (!arr) continue;
          for (const S of arr) { if (seen[S.guid] || S.guid === T.guid) continue; seen[S.guid] = 1;
            if (S.base_z < T.base_z - EPS && S.top_z >= T.base_z - GAP && overlap(S, T)) {
              route = 'bearing'; const en = sched[S.guid].end;
              if (en > se) { se = en; seS = S; seFromWall = (pi === 1); } } } }
      }
      const tPool = auditTPool(T), tWall = T.cls.indexOf('IfcWall') === 0;
      if (!route && T.seq > 4) {
        const sh = {};
        for (const c of cs) { const arr = structGrid[c]; if (!arr) continue;
          for (const S of arr) { if (sh[S.guid] || S.guid === T.guid) continue; sh[S.guid] = 1;
            if (S.base_z >= T.top_z - GAP && S.base_z <= T.top_z + GAP && S.top_z > T.top_z + EPS &&
                !(tPool && T.base_z < S.base_z - EPS) &&
                !(tWall && S.cls === 'IfcSlab' && S.seq > 4 && T.base_z < S.base_z - EPS && T.top_z >= S.base_z - GAP) &&
                overlap(S, T)) { route = 'hang'; const eh = sched[S.guid].end; if (eh > se) se = eh; } } }
        if (!route && !tPool && !tWall && vol(T) > BIG) route = 'hangNearest';
      }
      const deficit = (se - sched[T.guid].start) / DAY;
      if (deficit > worstDeficit) worstDeficit = deficit;
      // A1 — the §S63 class: T is a SCHEDULER pool member (its hangGate refuses to hang it on what
      //      it sits below of) but NOT an audit tPool member, so the audit hangs it there anyway.
      // A2 — T is audited on the hang route and IS tPool-consistent: a genuine carrier disagreement.
      // A3 — bearing route: audit and scheduler use the SAME predicate (edgeBearing), so the start
      //      really is early relative to a support both sides recognise.
      // A4 — hangNearest route, or nothing reconstructed.
      // A3 splits on WHICH grid set `se`, and on whether the scheduler's own wallGate would have
      // waited for that wall at all. wallGate is BOUNDED at the top (S.top_z <= T.base_z + GAP,
      // schedule_gate.js:684 — the §TM_GEO_ORDER_CYCLES carry-at-top rule); the audit's bearing test
      // over wallGrid has NO upper bound. A wall whose crown rises metres past the slab's underside
      // is therefore audit-support the scheduler never gated on.
      let k;
      if (route === 'hang' && schedElPool(T) && !auditTPool(T)) k = 'A1';
      else if (route === 'hang') k = 'A2';
      else if (route === 'bearing' && seFromWall && seS && !(seS.top_z <= T.base_z + GAP)) k = 'A3b';
      else if (route === 'bearing' && seFromWall) k = 'A3c';
      else if (route === 'bearing') k = (T.seq <= 4 && seS && seS.seq > 4) ? 'A3a_passA_vs_passB' : 'A3a';
      else k = 'A4';
      cls[k]++;
      const sg = schedBelowGate(T);
      if (sg > sched[T.guid].start + 1) { selfViol++; selfViolByClass[k] = (selfViolByClass[k] || 0) + 1;
        if (cycSet.has(T.guid)) cycViol++; }
      if (cycSet.has(T.guid)) cycFloat++;
      if (samples[k].length < 3) samples[k].push(T.cls + ' seq=' + T.seq + ' bz=' + T.base_z.toFixed(2) + ' deficit=' + deficit.toFixed(3) + 'd' + (seS ? ' via=' + seS.cls + '/seq' + seS.seq + (seFromWall ? '(wallGrid,top=' + seS.top_z.toFixed(2) + ' vs myBase=' + T.base_z.toFixed(2) + ')' : '') : ''));
    }
    totals.floating += floating; KEYS.forEach(k => totals[k] = (totals[k] || 0) + cls[k]);

    console.log('§ASYM ' + B + ' n=' + geoEls.length + ' floating=' + floating +
      ' | A1_tPool_not_mirrored=' + cls.A1 + ' A2_hang_carrier=' + cls.A2 +
      ' A3a_bearing_struct=' + cls.A3a + ' A3aPassAvsB=' + cls.A3a_passA_vs_passB + ' A3b_wall_above_bound=' + cls.A3b +
      ' A3c_wall_in_bound=' + cls.A3c + ' A4_nearest/none=' + cls.A4 +
      ' worstDeficitD=' + worstDeficit.toFixed(2));
    console.log('      gridMembershipDiff=' + gridDiff.length + ' ' + JSON.stringify(byCls) +
      ' hangPoolDiff(seq>4)=' + poolDiff.length);
    console.log('      cycleSet=' + cycSet.size + ' floatersInCycleSet=' + cycFloat + ' selfViolInCycleSet=' + cycViol + '/' + selfViol);
    console.log('      SCHEDULER-SELF-CONTRADICTION among floaters: ' + selfViol + '/' + floaters.length +
      ' ' + JSON.stringify(selfViolByClass) + '  (element starts before its OWN geoGate `below` support ends, at final times)');
    for (const k of KEYS) if (samples[k].length) console.log('      ' + k + ': ' + samples[k].join(' | '));
    engineLines.filter(l => /§SUPPORT_CYCLE|§DEQ_REPAIR|§GEO_ORDER /.test(l)).forEach(l => console.log('      engine| ' + l.slice(0, 150)));
  }
  console.log('§ASYM_TOTAL floating=' + totals.floating + ' ' +
    ['A1', 'A2', 'A3a', 'A3a_passA_vs_passB', 'A3b', 'A3c', 'A4'].map(k => k + '=' + (totals[k] || 0)).join(' '));
})();
