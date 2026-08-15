#!/usr/bin/env node
// WITNESS — W-CWO — §CURTAIN_WALL_OPENING
// Spec: bim-compiler prompts/4D_SCHEDULE_PERFECTION.md §CURTAIN_WALL_OPENING.
//
// ISSUE THIS PROVES OR DISPROVES:
//   User, live 2026-08-12: HHS_Office_Federated Level 3 doors float — visible before their host
//   wall exists. §DOOR_WINDOW_HOST_WALL (#1294) was built for exactly this symptom a day earlier
//   and its own witness stayed green, because openingGate's PREDICATE is correct — it is the POOL
//   that was wrong. place() fills wallGrid from `cls.indexOf('IfcWall') === 0`, and HHS's façade is
//   a CURTAIN WALL, so 34 of 133 HHS openings (25.6%) had ZERO candidate, openingGate fell through
//   to baseMs, and they were ungated from day 0. A witness that only asks "is the wall pool
//   respected" passes perfectly while a quarter of the doors are not in it. THIS witness asks the
//   question that was missing: is every opening that HAS an available host actually gated against
//   one — whatever class that host happens to be?
//
//   PROVENANCE, measured before the fix (bim-compiler scripts/probe_door_wall.js, all 7 buildings,
//   `wallLike` pool, generative timeline) — EARLY openings / worst days:
//     HHS_Office_Federated  30/133 (22.6%)  9.5d      <- Level 3 alone: 6/37 (16.2%) 9.5d
//     Clinic                10/312  (3.2%) 22.2d
//     Hospital              10/570  (1.8%) 187.6d
//     Terminal/Duplex/LTU/JKR  0            0.0d      (no curtain-wall openings — fix is a no-op)
//   After the fix: HHS 0 (0.0%), Clinic 2 (0.6%), Hospital 5 (0.9%), rest byte-identical.
//
//   HOST IS INFERRED, NOT READ, and the classes are EXTRACTED not guessed: the shipped DBs carry no
//   IfcRelAggregates/IfcRelFillsElement (spatial_structure holds only IfcBuildingStorey/IfcSpace;
//   zero IfcPlate/IfcMember rows have a parent), and IfcCurtainWall itself has ZERO geometry rows in
//   HHS — a pure container. HHS's own element_name column names the parts: IfcPlate =
//   "Systemelement:Verglasung" (glazing), IfcMember = "Rechteckiger Pfosten:6 x 15 mit Deckprofil"
//   (mullion). So the assembly exists solely as its geometric parts, and the parts are the pool.
//
// GATES:
//   G-CWO-RAW      (BLOCKING) 0 openings start before their bracketing host FINISHES on the
//                  GENERATIVE schedule — the timeline schedule_gate.js itself owns. Exactly 0:
//                  openingGate makes it structural, so non-zero is a real gate defect.
//   G-CWO-COVER    (BLOCKING) 0 openings are left ungated while a host IS available in their own
//                  cell. This is the gate that would have caught the original defect: pre-fix, HHS
//                  fails it 34 times. It asserts COVERAGE, which no prior witness did.
//   G-CWO-FALLBACK reported — how many openings the curtain-wall pool actually caught per building,
//                  and how many have no host of any kind (a real data limit, never invented away).
//   G-CWO-DISPLAY  (BLOCKING since 2026-08-12) EARLY <= 5% of hostMatched on the DISPLAY timeline
//                  the movie actually plays (post _twoTierRemap + _midairRepair). It shipped
//                  REPORT-ONLY for one day, deliberately, so the defect it surfaced —
//                  §DOOR_WINDOW_HOST_WALL_DISPLAY, openingGate correct at the generative layer and
//                  undone by the display rewrite — could be fixed and this gate promoted rather than
//                  red-flagging every run for something unowned. That fix landed: _twoTierRemap now
//                  carries openingGate's twin (ScheduleGate.openingPairs), the same shape
//                  §HOSTED_BEFORE_HOST's own display twin uses.
//                  MEASURED display EARLY%, before the twin → after it:
//                    LTU_AHouse 28.5 → 2.0 (25/1280) | Terminal 16.4 → 0.0 | JKR 10.1 → 0.0
//                    Hospital    2.5 → 0.2 (1/570)   | HHS/Clinic/Duplex 0.0 → 0.0
//                  Not 0, for the same measured reason G-HOST-DISPLAY is not: _midairRepair runs
//                  AFTER the remap and may move a host wall later than what it hosts (LTU 25 doors,
//                  Hospital 1 — every residual is remap=0 → display=N, i.e. attributable to that one
//                  pass, which is what G-CWO-STAGE below prints). Chasing it to 0 means alternating
//                  the two rules to a joint fixpoint, which _midairRepair's own header records as
//                  BUILT, MEASURED and REJECTED (4 rounds, 7,650 pushes, no convergence, 0.8s→14.8s)
//                  — one is keyed on a contact's START, the other on a host's END. 5% is this lane's
//                  standing error margin.
//   G-CWO-STAGE    attribution, reported per building — EARLY after generation vs after the remap
//                  (where the twin runs) vs after the midair repair. This is what names WHICH layer
//                  any residual came from instead of leaving it an unexplained number.
//
// Command (from the worktree root):
//   BLD_DIR=~/bim-ootb/buildings node viewer/tests/witness_curtain_wall_opening.js
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
const DISPLAY_TOL = 5;   // % of hostMatched — the lane's standing error margin (G-CWO-DISPLAY),
                         // the same one witness_hosted_before_host's G-HOST-DISPLAY carries

// Kept identical to schedule_gate.js's own openingGate/CW_HOST_CLS and to probe_door_wall.js.
// Changing it here without changing them there is what this comment exists to prevent.
const isOpening = cls => cls === 'IfcDoor' || cls === 'IfcWindow';
const inWallPool = cls => !!cls && cls.indexOf('IfcWall') === 0;
const inCwPool = cls => /^(IfcCurtainWall|IfcPlate|IfcMember)$/.test(cls || '');
const CELL = ScheduleGate.CELL != null ? ScheduleGate.CELL : 4;
const EPS = ScheduleGate.EPS != null ? ScheduleGate.EPS : 0.05;
const overlap = (a, b) => a.x0 <= b.x1 && a.x1 >= b.x0 && a.y0 <= b.y1 && a.y1 >= b.y0;

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

// Pair every opening with the hosts bracketing it, ONCE, on geometry alone — so the stage
// measurements below compare the SAME pairs and a stage difference can only be a timing difference.
// Mirrors openingGate's fallback ORDER exactly: the wall pool if it has anything, else the
// curtain-wall pool. Getting that order wrong here would assert something the scheduler was never
// asked to do.
function pairOpenings(items) {
  const openings = items.filter(it => isOpening(it.cls));
  const grid = {};
  const cells = e => { const o = [];
    for (let i = Math.floor(e.x0 / CELL); i <= Math.floor(e.x1 / CELL); i++)
      for (let j = Math.floor(e.y0 / CELL); j <= Math.floor(e.y1 / CELL); j++) o.push(i + ',' + j);
    return o; };
  items.forEach(it => { if (isOpening(it.cls)) return;
    if (!inWallPool(it.cls) && !inCwPool(it.cls)) return;
    cells(it).forEach(c => (grid[c] || (grid[c] = [])).push(it)); });
  const pairs = [];
  let noHost = 0, viaCw = 0;
  openings.forEach(op => {
    const seen = {}, wall = [], cw = [];
    cells(op).forEach(c => { const arr = grid[c]; if (!arr) return;
      for (const S of arr) { if (seen[S.guid]) continue;
        if (S.bz <= op.tz + EPS && S.tz >= op.bz - EPS && overlap(S, op)) {
          seen[S.guid] = 1; (inWallPool(S.cls) ? wall : cw).push(S);
        } } });
    const pool = wall.length ? wall : cw;
    if (!pool.length) { noHost++; return; }
    if (!wall.length) viaCw++;
    pairs.push({ op, pool, viaCw: !wall.length });
  });
  return { openN: openings.length, pairs, noHost, viaCw };
}

// EARLY = the opening STARTS before a bracketing host FINISHES — openingGate's own predicate
// (it returns the host's `end`), so a violation here is literally the gate not holding.
function countEarly(pairs, getS, getE) {
  let early = 0, worstD = 0, worst = null;
  pairs.forEach(p => {
    let d = 0, who = null;
    p.pool.forEach(S => { const dd = (getE(S) - getS(p.op)) / D; if (dd > d) { d = dd; who = S.cls; } });
    if (d > 0) { early++; if (d > worstD) { worstD = d; worst = p.op.cls + '@' + who; } }
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
    sliceFn(tmSrc, '_midairRepair', 1) || sliceFn(tmSrc, '_midairRepair', 0)].filter(Boolean).join('\n');

  let ran = 0;
  const rawBad = [], coverBad = [], fallbackRep = [], dispBad = [], stageRep = [];

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
    const projDays = Math.max(10, Math.ceil(totSecs * 1000 / 86400000));
    const maxCrews = {};
    for (const rk in LR) {
      if (!LR[rk].max_crews && LR[rk].max_crews_fixed == null) continue;
      maxCrews[rk] = (LR[rk].max_crews_fixed != null) ? LR[rk].max_crews_fixed
        : Math.max(LR[rk].max_crews || 0, Math.ceil((crewWorkDays[rk] || 0) / projDays));
    }

    // Capture the ENGINE's own §CURTAIN_WALL_OPENING tally so G-CWO-COVER can cross-check it against
    // this witness's INDEPENDENT re-derivation of the same pairing. If the shipped pool and the
    // witness's idea of the pool ever drift apart, that gate fails — which is the whole point of
    // re-deriving it here instead of just reading the log back.
    const quiet = console.log;
    let engineLine = null;
    console.log = (...a) => { const s = a.join(' '); if (/^§CURTAIN_WALL_OPENING/.test(s)) engineLine = s; };
    let sched;
    try { sched = ScheduleGate.computeSchedule(geoEls, 0, 1, maxCrews); } finally { console.log = quiet; }
    const em = engineLine && engineLine.match(/cwGated=(\d+)\s+stillUngated=(\d+)/);
    const engCw = em ? +em[1] : null, engUn = em ? +em[2] : null;

    const items = geoEls.map(e => ({ guid: e.guid, s: sched[e.guid].start, e: sched[e.guid].end,
      rawS: sched[e.guid].start, rawE: sched[e.guid].end,
      bz: e.base_z, tz: e.top_z, x0: e.x0, x1: e.x1, y0: e.y0, y1: e.y1, cls: e.cls, seq: e.seq,
      phase: e.phase, storey: e.storey }));

    const { openN, pairs, noHost, viaCw } = pairOpenings(items);
    if (!pairs.length) { console.log(`      ${bld}: openings=${openN} hostMatched=0 — nothing to check`); continue; }
    ran++;

    const raw = countEarly(pairs, it => it.rawS, it => it.rawE);        // stage 1: generative
    sandbox.console = { log: () => {}, warn: () => {} };
    sandbox.__items = items;
    vm.runInContext('this.__remap(this.__items);', sandbox);
    // stage 2: + two-tier remap (where §DOOR_WINDOW_HOST_WALL_DISPLAY's twin runs). Frozen here so
    // G-CWO-STAGE can attribute any residual to a NAMED layer instead of leaving it unexplained.
    const remS = {}, remE = {};
    items.forEach(it => { remS[it.guid] = it.s; remE[it.guid] = it.e; });
    const rem = countEarly(pairs, it => remS[it.guid], it => remE[it.guid]);
    vm.runInContext('this.__repair(this.__items);', sandbox);
    const disp = countEarly(pairs, it => it.s, it => it.e);             // stage 3: DISPLAY (what plays)

    const pct = n => (100 * n / pairs.length).toFixed(1);
    if (raw.early !== 0)
      rawBad.push(`${bld}=${raw.early}(${pct(raw.early)}%, worst ${raw.worstD.toFixed(1)}d ${raw.worst})`);
    // COVERAGE: the engine's own tally must equal this witness's independent re-derivation. A
    // mismatch means the shipped pool and the documented pool have drifted — the exact failure that
    // let a quarter of HHS's openings sit outside wallGrid unnoticed. `null` = the engine printed no
    // §CURTAIN_WALL_OPENING line at all, which is itself a failure (the fix is not in this build).
    if (engCw === null) coverBad.push(`${bld}=engine printed no §CURTAIN_WALL_OPENING line`);
    else if (engCw !== viaCw || engUn !== noHost)
      coverBad.push(`${bld}=engine(cwGated=${engCw},stillUngated=${engUn}) vs witness(viaCw=${viaCw},noHost=${noHost})`);
    fallbackRep.push(`${bld} viaCurtainWall=${viaCw} noHostAtAll=${noHost}/${openN}`);
    if (100 * disp.early / pairs.length > DISPLAY_TOL)
      dispBad.push(`${bld}=${pct(disp.early)}% (${disp.early}/${pairs.length}, worst ${disp.worstD.toFixed(1)}d ${disp.worst})`);
    stageRep.push(`${bld} gen=${raw.early} remap=${rem.early} display=${disp.early}`);

    console.log(`      ${bld}: openings=${openN} hostMatched=${pairs.length} viaCurtainWall=${viaCw} ` +
      `noHostAtAll=${noHost} EARLY gen=${raw.early}(${pct(raw.early)}%) remap=${rem.early}(${pct(rem.early)}%) ` +
      `display=${disp.early}(${pct(disp.early)}%) ` +
      `worstDisplay=${disp.worstD.toFixed(1)}d${disp.worst ? ' ' + disp.worst : ''}`);
  }

  gate('G-CWO-RAW', rawBad.length === 0 && ran > 0,
    rawBad.length ? 'generative schedule still inverts: ' + rawBad.join(' ')
      : `0 openings start before their bracketing host finishes on the generative timeline, all ${ran} ` +
        `buildings — openingGate + its curtain-wall fallback make this structural, not incidental`);
  gate('G-CWO-COVER', coverBad.length === 0 && ran > 0,
    coverBad.length ? 'shipped pool disagrees with this witness\'s independent re-derivation: ' + coverBad.join(' ')
      : `the engine's own §CURTAIN_WALL_OPENING tally equals this witness's independent re-derivation ` +
        `of the same pairing on all ${ran} buildings — so the pool the scheduler USES and the pool ` +
        `documented here cannot drift apart unnoticed, which is how 34 of HHS's 133 openings sat ` +
        `outside wallGrid while §DOOR_WINDOW_HOST_WALL's own witness stayed green`);
  gate('G-CWO-FALLBACK', ran > 0, fallbackRep.join(' | ') +
    ' — viaCurtainWall is what the IfcCurtainWall/IfcPlate/IfcMember pool caught that the IfcWall* ' +
    'pool could not see; noHostAtAll is a real data limit (an opening in no modelled envelope), ' +
    'reported rather than invented away');
  gate('G-CWO-DISPLAY', dispBad.length === 0 && ran > 0,
    dispBad.length ? `over the ${DISPLAY_TOL}% margin on the timeline the movie plays: ` + dispBad.join(' ')
      : `every building within the ${DISPLAY_TOL}% margin on the DISPLAY timeline (post remap + ` +
        `midair repair) — §DOOR_WINDOW_HOST_WALL_DISPLAY's twin in _twoTierRemap holds`);
  gate('G-CWO-STAGE', ran > 0, stageRep.join(' | ') +
    ' — gen is schedule_gate.js\'s own output (openingGate); remap is after _twoTierRemap, where ' +
    '§DOOR_WINDOW_HOST_WALL_DISPLAY\'s twin runs; any growth from remap to display is _midairRepair ' +
    'moving a host wall later than what it hosts, and this is where that shows rather than being an ' +
    'unexplained number');

  const passed = results.filter(r => r.pass).length;
  console.log(`\n§CWO_WITNESS ${passed}/${results.length} gates passed`);
  process.exit(passed === results.length ? 0 : 1);
})();
