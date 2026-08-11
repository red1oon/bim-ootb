#!/usr/bin/env node
// witness_tier_serial_display.js — §TIER_SERIAL (2026-08-11, bim-compiler
// prompts/4D_SCHEDULE_PERFECTION.md §SPEC 2026-08-11 evening: phase-window collapse).
//
// ISSUE this witness proves/disproves: the two-tier display remap (time_machine.js _twoTierRemap)
// claims (a) the structural backbone Substructure→Superstructure→Architecture is STRICTLY SERIAL
// on the displayed timeline, (b) the remap NEVER moves an element earlier than its generative
// (computeSchedule) time — the property that makes support-order preservation provable, not
// asserted, (c) Tier 2 (MEP Rough-in / MEP Final / Finishes) stays ONE CONCURRENT POOL — no
// phase-window barrier was smuggled in for non-backbone phases, (d) the furniture safeguard
// ('furniture_generic_bucket' NAME_OVERRIDE) keeps furniture-named generic-class elements out of
// Tier 1 on every shipped building, and (e/f) the two open spec questions get REAL numbers:
// the schedule-duration cost of serializing the backbone (§TIER_COST) and the Movie-Maker
// phase-sightability structure (§TIER_MOVIE — each backbone phase owns a contiguous, exclusive
// slice of the displayed timeline, which is exactly what a linear movie clock renders).
//
//   W-TS-1  Tier-1 strictly serial: _twoTierRemap reports tier1OverlapPairs=0 on every building.
//           >0 = the backbone still overlaps — the capstone claim is false.
//   W-TS-2  No new support violations: auditFloating over the REMAPPED times <= auditFloating over
//           the RAW generative times (display may REPAIR the known floating tail, never grow it).
//   W-TS-3  Monotone: zero elements start EARLIER than their generative start (earlier = the one
//           direction that can break support order; shifts and sweep pushes only ever move later).
//   W-TS-4  Furniture safeguard: zero furniture-named elements in the GENERIC buckets
//           (IfcBuildingElementProxy/IfcBuildingElementPart) resolve into a Tier-1 phase after
//           NAME_OVERRIDES run. Non-generic Tier-1 classes are REPORTED and LOCKED (Terminal has
//           exactly 1 known case — 'Floor:Table Top:904745', an IfcSlab built-in counter,
//           deliberately NOT reclassified: unambiguous class + seq<=4 support-pool member, see
//           rates.js override comment) — a change in that count is a real data/rules change.
//   W-TS-5  Tier-2 concurrency preserved: >=1 pair of present Tier-2 phase windows OVERLAP on the
//           displayed timeline (a serialized Tier 2 would betray the "one concurrent pool" spec).
//   W-TS-6  §TIER_COST / §TIER_MOVIE report lines carry the real numbers (duration cost + phase
//           timeline shares) — asserted present + internally consistent (spans positive, shares
//           sum <= 100.5%), values reported for the human decision, not gated on an invented cap.
//
// Approximation caveat (same as witness_tm_geo_order_cycles): the x-ray element build carries no
// resource/installSecs, so durations come from ScheduleAuthor._installSecs with real class
// fragmentation + linear weighting (the same single-source formula injectGantt's getInstallSecs
// uses) — real per-element durations, node-side, no browser.
//
// Command: BLD_DIR=~/bim-ootb/buildings node tests/witness_tier_serial_display.js  (from viewer/)
// Read the § log lines, not exit code alone.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const initSqlJs = require(path.join(__dirname, '..', '..', 'modeller', 'lib', 'sql-wasm.js'));

let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log('  PASS ' + msg); } else { fail++; console.log('  FAIL ' + msg); } }
function finish() {
  console.log('\n§TIER_SERIAL_SUMMARY pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
}

const ScheduleGate = require(path.join(__dirname, '..', 'schedule_gate.js'));
const ScheduleAuthor = require(path.join(__dirname, '..', 'schedule_author.js'));
const tmSrc = fs.readFileSync(path.join(__dirname, '..', 'time_machine.js'), 'utf8');

function sliceFn(src, name) {
  const idx = src.indexOf('function ' + name + '(');
  if (idx < 0) throw new Error(name + ' not found');
  let depth = 0, i = idx, seenOpen = false;
  for (; i < src.length; i++) {
    if (src[i] === '{') { depth++; seenOpen = true; }
    else if (src[i] === '}') { depth--; if (seenOpen && depth === 0) return src.slice(idx, i + 1); }
  }
  throw new Error('unbalanced braces for ' + name);
}

// the shipped Tier-1 order constant rides along verbatim (a var, not a function — assert found)
const tierOrderLine = "var _TIER1_ORDER = ['Substructure', 'Superstructure', 'Architecture'];";
if (tmSrc.indexOf(tierOrderLine) < 0) { assert(false, 'W-TS-0 _TIER1_ORDER constant found in time_machine.js'); finish(); }

const sliced = [
  tierOrderLine,
  sliceFn(tmSrc, '_promoteRoofLoadPath'),
  sliceFn(tmSrc, '_buildXrayElements'),
  sliceFn(tmSrc, '_tier1Extents'),
  sliceFn(tmSrc, '_tier1Serialize'),
  sliceFn(tmSrc, '_tier1Protrusion'),
  sliceFn(tmSrc, '_tierAuditRegate'),
  sliceFn(tmSrc, '_twoTierRemap')
].join('\n');

// RATES (QS/BOQ table) for fragmentation/linear weighting — same slice idiom as
// witness_og_guard_bearing_bound.js loadRules().
function loadRatesTable() {
  const txt = fs.readFileSync(path.join(__dirname, '..', 'rates.js'), 'utf8');
  const start = txt.indexOf('var RATES = {');
  const defIdx = txt.indexOf('var SEQUENCE_DEFAULT');
  const end = txt.indexOf('};', defIdx) + 2;
  return (new Function(txt.slice(start, end) + '\n return RATES;'))();
}

const TIER1 = { Substructure: 1, Superstructure: 1, Architecture: 1 };
const TIER2 = ['MEP Rough-in', 'MEP Final', 'Finishes'];
const FURN_RE = /\b(chair|desk|table|sofa|couch|settee|cabinet|wardrobe|shelf|shelving|bookcase|credenza|armchair|furniture|dresser|nightstand|stool|bench)\b/i;
const GENERIC = { IfcBuildingElementProxy: 1, IfcBuildingElementPart: 1 };
// LOCKED baseline (measured 2026-08-11, furniture_measure.log): furniture-named elements in
// NON-generic Tier-1 classes — Terminal's single IfcSlab 'Floor:Table Top:904745' counter, 0
// everywhere else. Movement either way = a real data/rules change to examine, not absorb.
const NONGENERIC_T1_BASELINE = { Terminal: 1, Hospital: 0, Duplex: 0, HHS_Office_Federated: 0, Clinic: 0 };

const BLD_DIR = process.env.BLD_DIR || path.join(require('os').homedir(), 'bim-ootb', 'buildings');
const BUILDINGS = ['Terminal', 'Hospital', 'Duplex', 'HHS_Office_Federated', 'Clinic'];
const D = 86400000;

(async () => {
  const SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(__dirname, '..', '..', 'modeller', 'lib', 'sql-wasm.wasm')) });
  const rulesJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'rates', 'sequence_rules.json'), 'utf8'));
  const SR = rulesJson.SEQUENCE_RULES, SD = rulesJson.SEQUENCE_DEFAULT, LR = rulesJson.LABOR_RATES;
  const NO = rulesJson.NAME_OVERRIDES || [];
  const RATES = loadRatesTable();
  assert(NO.some(o => o.id === 'furniture_generic_bucket'),
    'W-TS-0 furniture_generic_bucket override shipped in rates/sequence_rules.json');

  for (const bld of BUILDINGS) {
    const dbPath = path.join(BLD_DIR, bld + '_extracted.db');
    if (!fs.existsSync(dbPath)) { assert(false, 'W-TS fixture missing: ' + dbPath); continue; }
    const db = new SQL.Database(fs.readFileSync(dbPath));

    // ── shipped element build (sliced, never reimplemented) ──
    const sandbox = {
      console: { log: () => {}, warn: () => {} },
      performance: { now: () => Date.now() },
      window: { SEQUENCE_RULES: SR, SEQUENCE_DEFAULT: SD, SEQUENCE_NAME_OVERRIDES: NO },
      ScheduleGate: ScheduleGate,
      Math: Math,
      A: () => ({ db: db })
    };
    vm.createContext(sandbox);
    vm.runInContext(sliced + '\nthis.__bxe = _buildXrayElements; this.__remap = _twoTierRemap;', sandbox);
    const els = sandbox.__bxe();
    if (!els || !els.length) { assert(false, 'W-TS ' + bld + ' element build produced nothing'); db.close(); continue; }

    // guid → (cls, name): phase + real durations need the element name (overrides) — the x-ray
    // build applies matchRule internally for seq but does not export name/phase.
    const nameOf = {}, clsOf = {};
    const nr = db.exec("SELECT guid, ifc_class, COALESCE(element_name,'') FROM elements_meta");
    if (nr.length) nr[0].values.forEach(v => { clsOf[v[0]] = v[1]; nameOf[v[0]] = v[2]; });

    // real durations — the same single-source formula injectGantt's getInstallSecs uses
    const frag = ScheduleAuthor._classFragmentation(db, RATES);
    const lin = ScheduleAuthor._linearWeighting(db, RATES);

    // furniture safeguard scan (whole elements_meta, not just geo) — W-TS-4
    let furnGenericT1 = 0, furnNonGenericT1 = 0;
    const furnNonGenericNames = [];
    if (nr.length) nr[0].values.forEach(v => {
      const cls = v[1], name = v[2];
      if (cls === 'IfcOpeningElement' || cls === 'IfcSpace') return;
      if (!FURN_RE.test(name)) return;
      const rule = ScheduleAuthor.matchNameOverride(cls, name, NO) || ScheduleAuthor.matchRule(cls, SR, SD);
      if (!TIER1[rule.phase]) return;
      if (GENERIC[cls]) furnGenericT1++;
      else { furnNonGenericT1++; if (furnNonGenericNames.length < 5) furnNonGenericNames.push(cls + ':"' + name + '"'); }
    });
    assert(furnGenericT1 === 0, 'W-TS-4a ' + bld + ' zero furniture-named GENERIC-bucket elements in Tier 1 after overrides (got ' + furnGenericT1 + ')');
    assert(furnNonGenericT1 === (NONGENERIC_T1_BASELINE[bld] || 0),
      'W-TS-4b ' + bld + ' furniture-named NON-generic Tier-1 classes locked at ' + (NONGENERIC_T1_BASELINE[bld] || 0) +
      ' (got ' + furnNonGenericT1 + (furnNonGenericNames.length ? ' — ' + furnNonGenericNames.join(', ') : '') + ') — reported, deliberately not reclassified');

    // ── generative schedule (RAW — the proven layer, untouched by this PR) ──
    const geoEls = els.filter(e => !(e.x0 === e.x1 && e.y0 === e.y1 && e.base_z === e.top_z));
    geoEls.forEach(e => {
      const cls = e.cls, name = nameOf[e.guid] || '';
      const rule = ScheduleAuthor.matchNameOverride(cls, name, NO) || ScheduleAuthor.matchRule(cls, SR, SD);
      if (!e.phase) e.phase = rule.phase;              // promoted slabs already carry phase='Architecture'
      e.resource = rule.resource || '_DEFAULT';
      const realQty = (frag.fragmented[cls] && frag.area[e.guid] != null) ? frag.area[e.guid] : null;
      const span = Math.max(e.x1 - e.x0, e.y1 - e.y0, e.top_z - e.base_z);
      const avgLen = lin.avgLength[cls];
      const lengthRatio = (realQty == null && span > 0 && avgLen > 0) ? span / avgLen : null;
      e.installSecs = ScheduleAuthor._installSecs(cls, rule, LR, realQty, lengthRatio);
    });
    db.close();
    const maxCrews = {};
    for (const rk in LR) if (LR[rk].max_crews) maxCrews[rk] = LR[rk].max_crews;

    const quiet = console.log; console.log = () => {};   // computeSchedule's own § lines counted elsewhere
    let sched, rawFloat;
    try {
      sched = ScheduleGate.computeSchedule(geoEls, 0, 1, maxCrews);
      rawFloat = ScheduleGate.auditFloating(geoEls, sched);
    } finally { console.log = quiet; }
    let rawEnd = 0;
    for (const g in sched) if (sched[g].end > rawEnd) rawEnd = sched[g].end;

    // ── the shipped two-tier remap (sliced) ──
    const items = geoEls.map(e => ({ guid: e.guid, s: sched[e.guid].start, e: sched[e.guid].end,
      bz: e.base_z, tz: e.top_z, x0: e.x0, x1: e.x1, y0: e.y0, y1: e.y1,
      cls: e.cls, seq: e.seq, phase: e.phase }));
    const tierLines = [];
    sandbox.console = { log: (...a) => tierLines.push(a.join(' ')), warn: () => {} };
    vm.runInContext('this.__lastStats = null;', sandbox);
    sandbox.__items = items;
    vm.runInContext('this.__lastStats = this.__remap(this.__items);', sandbox);
    const stats = sandbox.__lastStats;
    const tierLine = tierLines.find(l => l.indexOf('§TIER_SERIAL ') === 0) || '';
    console.log(tierLine || ('§TIER_SERIAL <no log captured for ' + bld + '>'));

    // W-TS-1 — strict serial backbone (dag-wins-excluded extents; the dag-wins population is
    // counted + locked in W-TS-1b, never hidden)
    assert(stats && stats.overlapPairs === 0,
      'W-TS-1 ' + bld + ' Tier-1 backbone strictly serial (tier1OverlapPairs=' + (stats ? stats.overlapPairs : '?') + ', iterations=' + (stats ? stats.iterations : '?') + ')');
    // §TIER_DAG_WINS lock (measured 2026-08-11, stragglers.log + promoted_deps.log): elements the
    // support DAG itself places inside a LATER backbone phase — support order wins for them.
    // Hospital/Clinic: isolated forward deps (foundation slab / slab-on-grade poured around
    // full-height columns). Terminal: the wall-carried tower cone — 45 direct "upper column
    // stands on a load-path-PROMOTED structural flat slab" edges pull their whole dependency
    // cone (~24k of 34.8k Superstructure) after Architecture-phase carriers; HHS: the same shape
    // through its 10 promoted slabs (294 direct bearers). A frame building (Hospital) has almost
    // none — the measured counts ARE the building topology. Movement either way = a real
    // data/topology/rules change to examine, not absorb.
    const DAGWINS_BASELINE = { Terminal: 24007, Hospital: 9, Duplex: 0, HHS_Office_Federated: 420, Clinic: 6 };
    assert(stats && stats.dagWins === DAGWINS_BASELINE[bld],
      'W-TS-1b ' + bld + ' DAG-forced cross-phase population locked at ' + DAGWINS_BASELINE[bld] +
      ' (got ' + (stats ? stats.dagWins : '?') + ') — support order wins for these, counted never hidden');

    // W-TS-3 — monotone (never earlier than generative)
    let earlier = 0;
    items.forEach(it => { if (it.s < sched[it.guid].start) earlier++; });
    assert(earlier === 0, 'W-TS-3 ' + bld + ' zero elements displayed EARLIER than their generative start (got ' + earlier + ')');

    // W-TS-2 — no new support violations on the displayed timeline
    const dispMap = {};
    items.forEach(it => { dispMap[it.guid] = { start: it.s, end: it.e }; });
    console.log = () => {};
    let dispFloat;
    try { dispFloat = ScheduleGate.auditFloating(geoEls, dispMap); } finally { console.log = quiet; }
    assert(dispFloat <= rawFloat,
      'W-TS-2 ' + bld + ' displayed floating <= generative floating (' + dispFloat + ' <= ' + rawFloat + ') — remap repairs, never breaks');

    // per-phase displayed windows
    const ext = {};
    items.forEach(it => {
      const x = ext[it.phase] || (ext[it.phase] = { minS: Infinity, maxE: -Infinity, n: 0 });
      if (it.s < x.minS) x.minS = it.s;
      if (it.e > x.maxE) x.maxE = it.e;
      x.n++;
    });
    let dispEnd = 0, dispBase = Infinity;
    items.forEach(it => { if (it.e > dispEnd) dispEnd = it.e; if (it.s < dispBase) dispBase = it.s; });

    // W-TS-5 — Tier 2 stays one concurrent pool (some pair of present Tier-2 windows overlaps)
    const t2Present = TIER2.filter(ph => ext[ph] && ext[ph].n > 0);
    if (t2Present.length >= 2) {
      let overlapPair = false;
      for (let i = 0; i < t2Present.length && !overlapPair; i++)
        for (let j = i + 1; j < t2Present.length && !overlapPair; j++) {
          const a = ext[t2Present[i]], b = ext[t2Present[j]];
          if (a.minS < b.maxE && b.minS < a.maxE) overlapPair = true;
        }
      assert(overlapPair, 'W-TS-5 ' + bld + ' Tier-2 phases remain CONCURRENT (>=1 overlapping window pair among ' + t2Present.join('/') + ')');
    } else {
      console.log('  INFO W-TS-5 ' + bld + ' <2 Tier-2 phases present (' + t2Present.join('/') + ') — concurrency pair check n/a');
    }

    // W-TS-6 — §TIER_COST (open question 2: the real serialization cost) + §TIER_MOVIE (open
    // question 3: phase sightability on the movie's linear clock)
    const rawDays = rawEnd / D, twoTierDays = (dispEnd - dispBase) / D;
    console.log('§TIER_COST bld=' + bld + ' generativeDays=' + rawDays.toFixed(1) +
      ' twoTierDays=' + twoTierDays.toFixed(1) + ' ratio=' + (twoTierDays / Math.max(rawDays, 1e-9)).toFixed(2) +
      ' floating raw=' + rawFloat + ' displayed=' + dispFloat);
    const span = Math.max(1, dispEnd - dispBase);
    // movie slices measured over the SERIALIZED backbone (dag-wins excluded — that population
    // deliberately rides the DAG through later windows and is reported separately below)
    const serExt = {};
    items.forEach(it => {
      if (it._t1Straggler) return;
      const x = serExt[it.phase] || (serExt[it.phase] = { minS: Infinity, maxE: -Infinity, n: 0 });
      if (it.s < x.minS) x.minS = it.s;
      if (it.e > x.maxE) x.maxE = it.e;
      x.n++;
    });
    const parts = [];
    let shareSum = 0, positive = true;
    ['Substructure', 'Superstructure', 'Architecture'].forEach(ph => {
      const x = serExt[ph]; if (!x || !x.n) return;
      const sh = (x.maxE - x.minS) / span * 100;
      if (!(x.maxE > x.minS)) positive = false;
      shareSum += sh;
      parts.push(ph + '=' + sh.toFixed(1) + '%[' + ((x.minS - dispBase) / D).toFixed(0) + '..' + ((x.maxE - dispBase) / D).toFixed(0) + 'd]n=' + x.n);
    });
    let t2Concurrent = 0, t2N = 0;
    items.forEach(it => {
      if (TIER2.indexOf(it.phase) < 0) return;
      t2N++;
      for (const ph of ['Substructure', 'Superstructure', 'Architecture']) {
        const x = ext[ph]; if (!x) continue;
        if (it.s < x.maxE && it.e > x.minS) { t2Concurrent++; break; }
      }
    });
    console.log('§TIER_MOVIE bld=' + bld + ' backboneShares ' + parts.join(' ') +
      ' | dagWinsRidingLaterWindows=' + (stats ? stats.dagWins : '?') +
      ' | tier2 n=' + t2N + ' runningConcurrentWithBackbone=' + t2Concurrent +
      ' (' + (t2N ? (t2Concurrent / t2N * 100).toFixed(0) : 0) + '%) — serialized backbone slices are exclusive+contiguous, Tier 2 fills alongside');
    assert(positive && shareSum <= 100.5,
      'W-TS-6 ' + bld + ' backbone movie slices well-formed (each present serialized phase >0 span; exclusive shares sum ' + shareSum.toFixed(1) + '% <= 100%)');
  }

  finish();
})().catch(e => { console.error('WITNESS CRASH', e); assert(false, 'W-TS crash: ' + e.message); finish(); });
