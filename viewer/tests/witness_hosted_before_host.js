#!/usr/bin/env node
// WITNESS — W-HOST — §HOSTED_BEFORE_HOST
// Spec: bim-compiler prompts/4D_SCHEDULE_PERFECTION.md §HOSTED_BEFORE_HOST.
//
// ISSUE THIS PROVES OR DISPROVES:
//   User, live 2026-08-12: "electrical outlets and hanging elements appearing bit early." Five 4D
//   changes shipped that day, each with its own witness, each green in isolation — and the user
//   still saw this. NO WITNESS OWNED THE PREDICATE. This one does: did a hosted element (outlet,
//   light fixture, air/flow terminal, sensor, alarm) start before the wall/slab/CEILING it is
//   mounted in? That is the question a viewer's eye asks, and nothing asserted it.
//
//   PROVENANCE, measured before the fix and NOT assumed (probe_arch_start.js, all 7 buildings,
//   DISPLAY timeline): the defect is LONG-STANDING, not a §TIER_SERIAL_BY_ZONE (#1314) regression.
//     building      pre-#1313 (42539c9)   at 314185d
//     Terminal              25.2%            25.6%
//     Hospital              50.3%            52.3%
//     Duplex                 9.6%             8.7%
//     HHS_Office_Federated  17.7%            17.8%
//     Clinic                23.2%            24.1%
//     LTU_AHouse            37.7%            37.8%
//     JKR                    5.7%             5.9%
//   Max delta 2.0pp. The zone barrier made it neither better nor materially worse.
//
//   ROOT CAUSE, one fact: the inferred host of essentially every offender is IfcCovering — a
//   ceiling — and IfcCovering sits in NO support pool (structGrid = seq<=4 + promoted slabs,
//   wallGrid = walls). geoGate/hangGate/wallGate/openingGate all read one of those two, so a
//   ceiling was invisible to every gate and what it hosts was never checked against it. The trade
//   order then makes the inversion the DEFAULT, not an accident: sequence_rules.json puts MEP Final
//   at seq 9 and Finishes (IfcCovering) at seq 10, so a lay-in fixture is scheduled before its own
//   ceiling by rule, everywhere. schedule_gate.js's hostGate + its DAG twin close it.
//
//   HOST IS INFERRED, NOT READ: no IfcRelVoidsElement / host column exists in the shipped extracted
//   DBs (the same fact §DOOR_WINDOW_HOST_WALL records). The inference here is byte-identical to the
//   one the defect was MEASURED with in probe_arch_start.js and to the one hostGate enforces —
//   among hosts whose bbox spans the hosted element's own XY cell and whose Z extent brackets its
//   centre (+-1.0m), the nearest in XY. One rule, three consumers, so the witness cannot drift into
//   asserting something the scheduler was never asked to do.
//
// GATES:
//   G-HOST-RAW      (BLOCKING) EARLY=0 on the GENERATIVE schedule — the timeline schedule_gate.js
//                   itself owns. Exactly 0 is required here: hostGate + its DAG edge make it
//                   structural, so any non-zero is a real gate defect, not display-layer slack.
//   G-HOST-DISPLAY  (BLOCKING) EARLY <= 5% of hostMatched on the DISPLAY timeline the movie
//                   actually plays (post _twoTierRemap + _midairRepair). Not 0: those two layers
//                   are allowed to move a host relative to what it hosts (see G-HOST-STAGE), and
//                   5% is this lane's standing error margin.
//   G-HOST-STAGE    attribution, reported per building — EARLY after generation vs after remap vs
//                   after midair repair. This is what says WHICH layer any residual came from,
//                   rather than leaving it as an unexplained number.
//   G-HOST-MATCH    the hosted-vs-hostMatched gap: hosted elements with NO bracketing host in their
//                   cell at all. A separate, already-accepted category (not part of EARLY) —
//                   reported so it can never quietly grow into a way of passing this witness.
//
// Command (from the worktree root):
//   BLD_DIR=~/bim-ootb/buildings node viewer/tests/witness_hosted_before_host.js
// Read the log, not the exit code.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const HOME = require('os').homedir();
const VIEWER_DIR = path.join(__dirname, '..');
const SQLJS_DIR = process.env.SQLJS_DIR || path.join(HOME, 'bim-ootb', 'modeller', 'lib');
const initSqlJs = require(path.join(SQLJS_DIR, 'sql-wasm.js'));
const ScheduleGate = require(path.join(VIEWER_DIR, 'schedule_gate.js'));
const ScheduleAuthor = require(path.join(VIEWER_DIR, 'schedule_author.js'));
const BLD_DIR = process.env.BLD_DIR || path.join(HOME, 'bim-ootb', 'buildings');
const DB_FILE = { LTU_AHouse: 'LTU_AHouse_meta.db' };
const BUILDINGS = (process.env.ONLY || 'Terminal,Hospital,Duplex,HHS_Office_Federated,Clinic,LTU_AHouse,JKR').split(',');
const D = 86400000;
const DISPLAY_TOL = 5;   // % of hostMatched — the lane's standing error margin (G-HOST-DISPLAY)

// The measured host inference — kept identical to schedule_gate.js's HOSTED_CLS/HOST_CLS/HOST_Z and
// to probe_arch_start.js §HOSTED_BEFORE_HOST. Changing it here without changing them there is what
// this comment exists to prevent.
const HOSTED = /^(IfcOutlet|IfcLightFixture|IfcSwitchingDevice|IfcSensor|IfcAlarm|IfcFlowTerminal|IfcAirTerminal|IfcElectricAppliance|IfcFireSuppressionTerminal)$/;
const HOSTS = /^(IfcWall|IfcWallStandardCase|IfcSlab|IfcRoof|IfcCovering|IfcCurtainWall)$/;
const HOST_Z = 1.0;   // m
const CELL = 4;       // m — schedule_gate.js's own grid cell

const results = [];
function gate(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  ${detail}`);
}

function sliceFn(src, name, which) {
  let from = 0;
  for (let pass = 0; pass <= (which || 0); pass++) {
    const idx = src.indexOf('function ' + name + '(', from);
    if (idx < 0) return null;
    let depth = 0, i = idx, seenOpen = false;
    for (; i < src.length; i++) {
      if (src[i] === '{') { depth++; seenOpen = true; }
      else if (src[i] === '}') { depth--; if (seenOpen && depth === 0) break; }
    }
    if (pass === (which || 0)) return src.slice(idx, i + 1);
    from = i + 1;
  }
  return null;
}

function loadRatesTable() {
  const txt = fs.readFileSync(path.join(VIEWER_DIR, 'rates.js'), 'utf8');
  const start = txt.indexOf('var RATES = {');
  const defIdx = txt.indexOf('var SEQUENCE_DEFAULT');
  return (new Function(txt.slice(start, txt.indexOf('};', defIdx) + 2) + '\n return RATES;'))();
}

// Pair every hosted element with its inferred host ONCE, on geometry alone — so the three stage
// measurements below compare the SAME pairs and a stage difference can only be a timing difference.
function pairHosts(items) {
  const hosted = items.filter(it => HOSTED.test(it.cls));
  const hosts = items.filter(it => HOSTS.test(it.cls));
  const grid = {};
  const cells = e => { const o = [];
    for (let i = Math.floor(e.x0 / CELL); i <= Math.floor(e.x1 / CELL); i++)
      for (let j = Math.floor(e.y0 / CELL); j <= Math.floor(e.y1 / CELL); j++) o.push(i + ',' + j);
    return o; };
  hosts.forEach(h => cells(h).forEach(c => (grid[c] || (grid[c] = [])).push(h)));
  const pairs = [];
  hosted.forEach(e => {
    const cx = (e.x0 + e.x1) / 2, cy = (e.y0 + e.y1) / 2, cz = (e.bz + e.tz) / 2;
    const cand = grid[Math.floor(cx / CELL) + ',' + Math.floor(cy / CELL)];
    if (!cand) return;
    let best = null, bestD = Infinity;
    for (const h of cand) {
      if (h.guid === e.guid) continue;
      if (cz < h.bz - HOST_Z || cz > h.tz + HOST_Z) continue;
      const d = Math.abs((h.x0 + h.x1) / 2 - cx) + Math.abs((h.y0 + h.y1) / 2 - cy);
      if (d < bestD) { bestD = d; best = h; }
    }
    if (best) pairs.push({ e, h: best });
  });
  return { hostedN: hosted.length, pairs };
}

// EARLY = hosted element STARTS before its host starts — literally "appears before the thing it
// hangs on" on screen, the user's own predicate. `get` reads the stage's start times.
function countEarly(pairs, get) {
  let early = 0, worstD = 0, worst = null;
  pairs.forEach(p => {
    const dDays = (get(p.h) - get(p.e)) / D;
    if (dDays > 0) { early++; if (dDays > worstD) { worstD = dDays; worst = p.e.cls + '@' + p.h.cls; } }
  });
  return { early, worstD, worst };
}

(async () => {
  const SQL = await initSqlJs({ wasmBinary: fs.readFileSync(path.join(SQLJS_DIR, 'sql-wasm.wasm')) });
  const rulesJson = JSON.parse(fs.readFileSync(path.join(VIEWER_DIR, 'rates', 'sequence_rules.json'), 'utf8'));
  const SR = rulesJson.SEQUENCE_RULES, SD = rulesJson.SEQUENCE_DEFAULT, LR = rulesJson.LABOR_RATES;
  const NO = rulesJson.NAME_OVERRIDES || [];
  const RATES = loadRatesTable();
  const tmSrc = fs.readFileSync(path.join(VIEWER_DIR, 'time_machine.js'), 'utf8');
  const zoneParts = [sliceFn(tmSrc, '_zoneIndexBuild'), sliceFn(tmSrc, '_zoneIndex')].filter(Boolean);
  const sliced = ["var _TIER1_ORDER = ['Substructure', 'Superstructure', 'Architecture'];",
    (zoneParts.length === 2 ? 'var _zoneMemo = [];' : ''), zoneParts[0] || '', zoneParts[1] || '',
    sliceFn(tmSrc, '_zoneOf') || '',
    // §SCHEDULE_CLASSIFY_DEDUP (2026-08-15): _buildXrayElements' local matchNameOverride/matchRule
    // now delegate to this shared pair — rides along verbatim, same idiom as the zone helpers above.
    sliceFn(tmSrc, '_classifyNameOverride'), sliceFn(tmSrc, '_classifyRule'),
    sliceFn(tmSrc, '_promoteRoofLoadPath'), sliceFn(tmSrc, '_buildXrayElements'),
    sliceFn(tmSrc, '_tier1Extents'), sliceFn(tmSrc, '_tier1Serialize'),
    sliceFn(tmSrc, '_tier1Protrusion'), sliceFn(tmSrc, '_tierAuditRegate'),
    sliceFn(tmSrc, '_twoTierRemap'), sliceFn(tmSrc, '_contactGraph'),
    sliceFn(tmSrc, '_midairAudit'),
    // the LAST _midairRepair definition is the one that hoists last and therefore the one the
    // browser executes — measure ship truth, same selection probe_arch_start.js defaults to
    sliceFn(tmSrc, '_midairRepair', 1) || sliceFn(tmSrc, '_midairRepair', 0)].filter(Boolean).join('\n');

  let ran = 0, rawBad = [], dispBad = [], stageRep = [], matchRep = [];

  for (const bld of BUILDINGS) {
    const dbPath = path.join(BLD_DIR, DB_FILE[bld] || (bld + '_extracted.db'));
    if (!fs.existsSync(dbPath)) { console.log(`      (skip ${bld} — fixture missing)`); continue; }
    const db = new SQL.Database(fs.readFileSync(dbPath));
    const sandbox = { console: { log: () => {}, warn: () => {} }, performance: { now: () => Date.now() },
      window: { SEQUENCE_RULES: SR, SEQUENCE_DEFAULT: SD, SEQUENCE_NAME_OVERRIDES: NO },
      ScheduleGate: ScheduleGate, Math: Math, RegExp: RegExp, Object: Object, Infinity: Infinity,
      A: () => ({ db: db, activeBuilding: bld, _metaGen: 0 }) };
    vm.createContext(sandbox);
    vm.runInContext(sliced + '\nthis.__bxe = _buildXrayElements; this.__remap = _twoTierRemap; this.__repair = _midairRepair;', sandbox);
    const els = sandbox.__bxe();
    if (!els || !els.length) { console.log(`      (skip ${bld} — element build returned nothing)`); db.close(); continue; }

    const nameOf = {};
    const nr = db.exec("SELECT guid, ifc_class, COALESCE(element_name,'') FROM elements_meta");
    if (nr.length) nr[0].values.forEach(v => { nameOf[v[0]] = v[2]; });
    const frag = ScheduleAuthor._classFragmentation(db, RATES);
    const lin = ScheduleAuthor._linearWeighting(db, RATES);
    const geoEls = els.filter(e => !(e.x0 === e.x1 && e.y0 === e.y1 && e.base_z === e.top_z));
    geoEls.forEach(e => {
      const rule = ScheduleAuthor.matchNameOverride(e.cls, nameOf[e.guid] || '', NO) || ScheduleAuthor.matchRule(e.cls, SR, SD);
      if (!e.phase) e.phase = rule.phase;
      e.resource = rule.resource || '_DEFAULT';
      const realQty = (frag.fragmented[e.cls] && frag.area[e.guid] != null) ? frag.area[e.guid] : null;
      const span = Math.max(e.x1 - e.x0, e.y1 - e.y0, e.top_z - e.base_z);
      const avgLen = lin.avgLength[e.cls];
      const lengthRatio = (realQty == null && span > 0 && avgLen > 0) ? span / avgLen : null;
      e.installSecs = ScheduleAuthor._installSecs(e.cls, rule, LR, realQty, lengthRatio);
    });
    db.close();

    // §CREW_AUTOSCALE — mirrors injectGantt so this witness schedules the SAME programme the viewer does
    const crewWorkDays = {};
    let totSecs = 0;
    geoEls.forEach(e => { const r = e.resource || '_DEFAULT';
      crewWorkDays[r] = (crewWorkDays[r] || 0) + (e.installSecs || 0) / 28800; totSecs += e.installSecs || 0; });
    // §ARCH_START_TEMPO / M1 (2026-08-12): injectGantt sizes a day by the 8-h crew SHIFT now — same
    // owner, same formula. (This value only feeds the autoscale `need` below, which measures as a
    // no-op on all 7 shipped buildings either way; kept in step so the mirror stays a real mirror.)
    const projDays = Math.max(10, Math.ceil(totSecs * 1000 / ScheduleGate.SHIFT_MS));
    const maxCrews = {};
    for (const rk in LR) {
      if (!LR[rk].max_crews && LR[rk].max_crews_fixed == null) continue;
      maxCrews[rk] = (LR[rk].max_crews_fixed != null) ? LR[rk].max_crews_fixed
        : Math.max(LR[rk].max_crews || 0, Math.ceil((crewWorkDays[rk] || 0) / projDays));
    }

    const quiet = console.log; console.log = () => {};
    let sched;
    try { sched = ScheduleGate.computeSchedule(geoEls, 0, 1, maxCrews); } finally { console.log = quiet; }

    const items = geoEls.map(e => ({ guid: e.guid, s: sched[e.guid].start, e: sched[e.guid].end,
      rawS: sched[e.guid].start,
      bz: e.base_z, tz: e.top_z, x0: e.x0, x1: e.x1, y0: e.y0, y1: e.y1, cls: e.cls, seq: e.seq,
      phase: e.phase, storey: e.storey }));

    const { hostedN, pairs } = pairHosts(items);
    if (!pairs.length) { console.log(`      ${bld}: hosted=${hostedN} hostMatched=0 — nothing to check`); continue; }
    ran++;

    const raw = countEarly(pairs, it => it.rawS);                      // stage 1: generative
    sandbox.console = { log: () => {}, warn: () => {} };
    sandbox.__items = items;
    vm.runInContext('this.__remap(this.__items);', sandbox);
    const remapS = {}; items.forEach(it => { remapS[it.guid] = it.s; });
    const rem = countEarly(pairs, it => remapS[it.guid]);              // stage 2: + two-tier remap
    vm.runInContext('this.__repair(this.__items);', sandbox);
    const disp = countEarly(pairs, it => it.s);                        // stage 3: DISPLAY (what plays)

    const pct = n => (100 * n / pairs.length).toFixed(1);
    if (raw.early !== 0) rawBad.push(`${bld}=${raw.early}(${pct(raw.early)}%, worst ${raw.worstD.toFixed(1)}d ${raw.worst})`);
    if (100 * disp.early / pairs.length > DISPLAY_TOL)
      dispBad.push(`${bld}=${pct(disp.early)}% (${disp.early}/${pairs.length}, worst ${disp.worstD.toFixed(1)}d ${disp.worst})`);
    stageRep.push(`${bld} gen=${raw.early} remap=${rem.early} display=${disp.early}`);
    matchRep.push(`${bld}=${hostedN - pairs.length}/${hostedN}`);

    console.log(`      ${bld}: hosted=${hostedN} hostMatched=${pairs.length} ` +
      `EARLY gen=${raw.early}(${pct(raw.early)}%) remap=${rem.early}(${pct(rem.early)}%) ` +
      `display=${disp.early}(${pct(disp.early)}%) worstDisplay=${disp.worstD.toFixed(1)}d${disp.worst ? ' ' + disp.worst : ''}`);
  }

  gate('G-HOST-RAW', rawBad.length === 0 && ran > 0,
    rawBad.length ? 'generative schedule still inverts: ' + rawBad.join(' ')
      : `0 hosted elements start before their host on the generative timeline, all ${ran} buildings ` +
        `— hostGate + its DAG edge make this structural, not incidental`);
  gate('G-HOST-DISPLAY', dispBad.length === 0 && ran > 0,
    dispBad.length ? `over the ${DISPLAY_TOL}% margin on the timeline the movie plays: ` + dispBad.join(' ')
      : `every building within the ${DISPLAY_TOL}% margin on the DISPLAY timeline (post remap + midair repair)`);
  gate('G-HOST-STAGE', ran > 0, stageRep.join(' | ') +
    ' — gen is schedule_gate.js\'s own output; any growth from gen to display is _twoTierRemap or ' +
    '_midairRepair moving a host relative to what it hosts, and this is where that shows');
  gate('G-HOST-MATCH', ran > 0, `hosted elements with NO bracketing host in their cell: ${matchRep.join(' ')} ` +
    `— an accepted separate category (never counted as EARLY), reported so it cannot grow into a way of passing this witness`);

  const passed = results.filter(r => r.pass).length;
  console.log(`\n§HOST_WITNESS ${passed}/${results.length} gates passed`);
  process.exit(passed === results.length ? 0 : 1);
})();
