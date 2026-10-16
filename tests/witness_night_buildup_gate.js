#!/usr/bin/env node
/**
 * W-NIGHT-BUILDUP-GATE — §NIGHT_BUILDUP_GATE (2026-09-05).
 *
 * ISSUE THIS TEST EXPOSES: A._nightUpdateLights (viewer/tools.js) creates the real THREE.PointLight
 * objects that illuminate a room from real IFC light-fixture positions. Unlike the decorative glow
 * sprite (§GLOW_BUILDUP_GATE, effects.js, already witnessed by tests/witness_glow_buildup_gate.js),
 * this function did NOT check whether a fixture had actually been constructed yet during a 4D
 * buildup bake — it lit every fixture in the whole FINISHED building from frame 0, filtered only by
 * camera frustum + nearest-N distance. A fixture could shine a real light into the room before its
 * own construction op had even started.
 *
 * FIX (viewer/tools.js A._nightUpdateLights, ~L1733): the exact same filter §GLOW_BUILDUP_GATE
 * already applies to A._nightFixtureWorldPositions() is now applied to the SAME list before it is
 * used for ANY of the three PointLight-selection branches (still-boost frustum+topup, small-building
 * "light them all", and the mixed nearest-N pick) — `visPos`. The list `allPos` (unfiltered) is kept
 * only to size the frozen §NIGHT_BAKE_POOL (which must have slots for fixtures placed LATER in the
 * buildup), never to select which fixtures actually light.
 *
 * NOT A REIMPLEMENTATION. The filter line, the three branch bodies, the §NIGHT_BAKE_POOL sizing
 * line, and _nightPickNearest are extracted from the SHIPPED SOURCE TEXT by exact-substring match
 * and run via new Function(), against REAL fixture guids + REAL kernel_ops timestamps + REAL
 * element_transforms positions from a real 4D DB. The Time Machine op->state loop and the
 * §TM_OVERLAY_SYNC fan-out are the identical extraction tests/witness_glow_buildup_gate.js already
 * uses (same anchors, same files) — not re-derived a second way.
 *
 * Run:  node tests/witness_night_buildup_gate.js 2>&1 | tee /tmp/W_NIGHT_BUILDUP_GATE.log
 *       (then READ THE LOG — exit code is not evidence.)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DB = '/home/red1/Downloads/OPEN SOURCE BIM/TerminalHi4D.db';

let pass = 0, fail = 0;
function gate(id, claim, ok, detail) {
  (ok ? pass++ : fail++);
  console.log((ok ? '✅' : '❌') + ' ' + id + ' — ' + claim + '\n     ' + detail);
}
function q(sql) { return execFileSync('sqlite3', ['-noheader', DB, sql], { encoding: 'utf8' }).trim(); }
function qrows(sql) { const out = q(sql); return out ? out.split('\n').map(l => l.split('|')) : []; }

console.log('§NIGHT_GATE_WITNESS start db=' + DB);

const tmSrc = fs.readFileSync(path.join(ROOT, 'viewer/time_machine.js'), 'utf8');
const fxSrc = fs.readFileSync(path.join(ROOT, 'viewer/effects.js'), 'utf8');
const toolsSrc = fs.readFileSync(path.join(ROOT, 'viewer/tools.js'), 'utf8');

// ── extract (a) renderAtTime's op→state loop, verbatim — SAME anchor witness_glow_buildup_gate.js uses ──
const LOOP_HEAD = '    for (var i = 0; i < _ops.length; i++) {\n      var op = _ops[i];\n      if (op.start_ts > cursorMs) break;';
const li = tmSrc.indexOf(LOOP_HEAD);
if (li < 0) { console.log('❌ EXTRACT — renderAtTime op loop not found in viewer/time_machine.js (source changed shape)'); process.exit(1); }
let depth = 0, end = -1;
for (let i = li; i < tmSrc.length; i++) {
  if (tmSrc[i] === '{') depth++;
  else if (tmSrc[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
}
const LOOP_SRC = tmSrc.slice(li, end);

// ── extract (b) the §TM_OVERLAY_SYNC fan-out block, verbatim ──
const FAN_ANCHOR = 'var _tmVisListeners = [];';
const fai = fxSrc.indexOf(FAN_ANCHOR);
if (fai < 0) { console.log('❌ EXTRACT — §GLOW_BUILDUP_GATE fan-out block not found in viewer/effects.js'); process.exit(1); }
const REG_HEAD = 'A._tmOverlayRegister = function() {';
const rhi = fxSrc.indexOf(REG_HEAD, fai);
if (rhi < 0) { console.log('❌ EXTRACT — A._tmOverlayRegister not found after fan-out block'); process.exit(1); }
const rbrace = fxSrc.indexOf('{', rhi);
depth = 0; end = -1;
for (let i = rbrace; i < fxSrc.length; i++) {
  if (fxSrc[i] === '{') depth++;
  else if (fxSrc[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
}
while (fxSrc[end] === ';') end++;
const FANOUT_SRC = fxSrc.slice(fai, end);

// ── extract (c) the GLOW filter line (effects.js), for the cross-check that the two mechanisms track ──
const GLOW_FILTER_LINE = 'var pos = allPos.filter(function(p) { return p.__guid == null || A._tmIsVisible(p.__guid); });';
if (fxSrc.indexOf(GLOW_FILTER_LINE) < 0) { console.log('❌ EXTRACT — §GLOW_BUILDUP_GATE filter line not found in viewer/effects.js'); process.exit(1); }

// ── extract (d) THE FIX UNDER TEST — the visPos filter line in tools.js A._nightUpdateLights ──
const NIGHT_FILTER_LINE = 'var visPos = allPos.filter(function(p) { return p.__guid == null || A._tmIsVisible(p.__guid); });';
if (toolsSrc.indexOf(NIGHT_FILTER_LINE) < 0) { console.log('❌ EXTRACT — §NIGHT_BUILDUP_GATE filter line not found in viewer/tools.js A._nightUpdateLights'); process.exit(1); }

// ── extract (e) _nightPickNearest, verbatim, + its NIGHT_SPREAD_MIN_M constant ──
const PICK_HEAD = 'function _nightPickNearest(pool, limit, already) {';
const phi = toolsSrc.indexOf(PICK_HEAD);
if (phi < 0) { console.log('❌ EXTRACT — _nightPickNearest not found in viewer/tools.js'); process.exit(1); }
const pbrace = toolsSrc.indexOf('{', phi);
depth = 0; end = -1;
for (let i = pbrace; i < toolsSrc.length; i++) {
  if (toolsSrc[i] === '{') depth++;
  else if (toolsSrc[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
}
const PICK_SRC = toolsSrc.slice(phi, end);
const SPREAD_LINE = 'var NIGHT_SPREAD_MIN_M = 4;';
if (toolsSrc.indexOf(SPREAD_LINE) < 0) { console.log('❌ EXTRACT — NIGHT_SPREAD_MIN_M not found in viewer/tools.js'); process.exit(1); }

// ── structural regression guards: the three selection branches read visPos, NOT allPos; the
//    §NIGHT_BAKE_POOL sizing line still reads the UNFILTERED allPos (it must, so the pool has slots
//    for fixtures the buildup hasn't placed yet at the moment the pool is first created) ──
const FRUSTUM_LINE = 'var inView = visPos.filter(function(p) {';
const TOPUP_CALL = '_picked = _nightPickNearest(visPos, _tuLimit, _picked);';
const SMALLBLDG_COND = '} else if (visPos.length <= A._nightMaxLights) {';
const SMALLBLDG_BODY = 'needed = visPos.map(function(p) { return { pos: p }; });';
const MIXED_CALL = 'needed = _nightPickNearest(visPos, A._nightMaxLights, []).map(function(p) { return { pos: p }; });';
const POOL_SIZE_LINE = 'var _poolN = Math.min(200, Math.max(1, allPos.length));';
const structuralChecks = {
  frustumUsesVisPos: toolsSrc.indexOf(FRUSTUM_LINE) >= 0,
  topupUsesVisPos: toolsSrc.indexOf(TOPUP_CALL) >= 0,
  smallBuildingCondUsesVisPos: toolsSrc.indexOf(SMALLBLDG_COND) >= 0,
  smallBuildingBodyUsesVisPos: toolsSrc.indexOf(SMALLBLDG_BODY) >= 0,
  mixedSelectionUsesVisPos: toolsSrc.indexOf(MIXED_CALL) >= 0,
  poolSizeStillUsesUNFILTEREDallPos: toolsSrc.indexOf(POOL_SIZE_LINE) >= 0,
};
const allStructuralOK = Object.values(structuralChecks).every(Boolean);
gate('G0', 'all three PointLight-selection branches read the buildup-gated visPos, not the unfiltered allPos — and §NIGHT_BAKE_POOL sizing deliberately keeps reading UNFILTERED allPos',
  allStructuralOK, JSON.stringify(structuralChecks));

const witnessLineIdx = toolsSrc.indexOf('§NIGHT_BUILDUP_GATE total=');
gate('G1', 'a §NIGHT_BUILDUP_GATE witness log line ships in A._nightUpdateLights reporting total/placed/lit',
  witnessLineIdx >= 0, 'found at byte offset ' + witnessLineIdx);

console.log('§NIGHT_GATE_WITNESS extracted tmLoop=' + LOOP_SRC.length + 'B fanout=' + FANOUT_SRC.length +
  'B nightFilterLine=' + NIGHT_FILTER_LINE.length + 'B pickNearest=' + PICK_SRC.length + 'B');

// ── real data: every IfcLightFixture in Terminal_Hi that has its own ELEMENT_PLACE op, its REAL
//    element_transforms position (never invented — center_x/y/z straight from the extraction DB) ──
const fixtureRows = qrows("SELECT m.guid, k.timestamp, json_extract(k.parameters,'$._end_ts') " +
  "FROM elements_meta m JOIN kernel_ops k ON k.output_guid=m.guid " +
  "WHERE m.ifc_class='IfcLightFixture' AND k.op_type='ELEMENT_PLACE' ORDER BY k.timestamp");
if (!fixtureRows.length) { console.log('❌ no IfcLightFixture kernel_ops rows found — DB changed shape'); process.exit(1); }
const posRows = qrows("SELECT m.guid, t.center_x, t.center_y, t.center_z FROM elements_meta m " +
  "JOIN element_transforms t ON t.guid = m.guid WHERE m.ifc_class='IfcLightFixture'");
const posByGuid = new Map(posRows.map(r => [r[0], { x: +r[1], y: +r[2], z: +r[3] }]));

const fixtures = fixtureRows.map(r => ({ guid: r[0], start: +r[1], end: +r[2] }));
const fxStart = Math.min.apply(null, fixtures.map(f => f.start));
const fxEnd = Math.max.apply(null, fixtures.map(f => f.end));
const N = fixtures.length;
console.log('§NIGHT_GATE_WITNESS fixtures(total)=' + N + ' withRealPosition=' + posByGuid.size +
  ' installWindow=' + new Date(fxStart).toISOString() + '..' + new Date(fxEnd).toISOString());

// tmState — identical shape/anchor to witness_glow_buildup_gate.js
function tickMs() { return 3200000; }
const _ops = fixtures.map(f => ({ start_ts: f.start, end_ts: f.end, output_guid: f.guid, input_guids: [f.guid], parameters: {} }));
function tmState(cursorMs) {
  const placed = {}, frontier = {}, recent = {}, arrival = {};
  const lingerMs = tickMs() * 3;
  const run = new Function('_ops', 'cursorMs', 'placed', 'frontier', 'recent', 'arrival', 'lingerMs', 'window', '_sfxPhases',
    LOOP_SRC + '\n return null;');
  run(_ops, cursorMs, placed, frontier, recent, arrival, lingerMs, {}, null);
  return { placed, frontier, recent };
}
const PRED = 'return !!placed[g] || !!frontier[g] || recent[g] !== undefined;';
if (tmSrc.indexOf(PRED) < 0) { console.log('❌ EXTRACT — §TM_OVERLAY_SYNC predicate not found in viewer/time_machine.js'); process.exit(1); }
const predFn = new Function('placed', 'frontier', 'recent', 'return function(g){ ' + PRED + ' };');

function makeHarness() {
  const A = {};
  const windowObj = {};
  const logs = [];
  const consoleObj = { log: s => logs.push(s) };
  const build = new Function('A', 'window', 'console',
    'var _billboardNameMesh = null, _billboardNameGuid = null;\n' + FANOUT_SRC + '\nreturn A;');
  build(A, windowObj, consoleObj);
  A._tmOverlayRegister();
  return { A, window: windowObj, logs };
}
const runNightFilter = new Function('allPos', 'A', NIGHT_FILTER_LINE + '\nreturn visPos;');
const runGlowFilter = new Function('allPos', 'A', GLOW_FILTER_LINE + '\nreturn pos;');
// _nightPickNearest (shipped source) reads `A.camera`/`A.controls` as free identifiers closing over
// the module-level `A` tools.js's setup IIFE is called with — so the extraction factory takes `A` as
// its own parameter and returns a closure bound to THAT A, one per sample (camera differs per sample).
const makePickNearest = new Function('A', SPREAD_LINE + '\n' + PICK_SRC + '\nreturn _nightPickNearest;');

// allPos with REAL positions (fixtures missing a transforms row are skipped — none expected here)
const allPos = fixtures
  .filter(f => posByGuid.has(f.guid))
  .map(f => Object.assign({ __guid: f.guid }, posByGuid.get(f.guid)));
gate('DATA', 'every fixture with a kernel_ops placement also has a real element_transforms position (no invented coordinates needed)',
  allPos.length === N, 'placementOps=' + N + ' withPosition=' + allPos.length);

function cursorAt(rank) { // rank = 1-based nth earliest ELEMENT_PLACE timestamp
  return fixtures.slice().sort((a, b) => a.start - b.start)[rank - 1].start;
}

// ── V1: mid-buildup — the visPos gate matches Time Machine's own placed/frontier/recent set exactly,
//    strictly partial (not stuck at 0 or N) — same shape as witness_glow_buildup_gate.js V1 ──
const midCursor = Math.floor((fxStart + fxEnd) / 2);
const stMid = tmState(midCursor);
const predMid = predFn(stMid.placed, stMid.frontier, stMid.recent);
const groundTruthMid = new Set(fixtures.filter(f => predMid(f.guid)).map(f => f.guid));
const hMid = makeHarness();
hMid.window.__tmOverlaySync(predMid);
const visPosMid = runNightFilter(allPos, hMid.A);
const visPosMidGuids = new Set(visPosMid.map(p => p.__guid));
const setsEqualMid = visPosMidGuids.size === groundTruthMid.size && [...groundTruthMid].every(g => visPosMidGuids.has(g));
gate('V1', 'mid-buildup: the PointLight buildup gate matches Time Machine\'s own placed set exactly — partial, not all-or-nothing',
  setsEqualMid && groundTruthMid.size > 0 && groundTruthMid.size < N,
  'cursor=' + new Date(midCursor).toISOString() + '  groundTruth=' + groundTruthMid.size + '/' + N +
  '  visPos=' + visPosMidGuids.size + '/' + N + '  setsEqual=' + setsEqualMid);

// ── V2: THE DEFECT — cursor before the first fixture is even scheduled — ZERO fixtures can light ──
const stStart = tmState(fxStart - 1);
const predStart = predFn(stStart.placed, stStart.frontier, stStart.recent);
const hStart = makeHarness();
hStart.window.__tmOverlaySync(predStart);
const visPosStart = runNightFilter(allPos, hStart.A);
gate('V2', 'THE DEFECT THIS FIX CLOSES — zero fixtures can contribute a PointLight before the first one is even scheduled to install (previously ALL fixtures in the finished building lit from frame 0)',
  visPosStart.length === 0,
  'cursor=' + new Date(fxStart - 1).toISOString() + ' (1ms before the first fixture op)  eligible=' +
  visPosStart.length + '/' + N + ' (must be 0)');

// ── V3: full build — every fixture eligible once the buildup has actually reached its own install time ──
const stEnd = tmState(fxEnd);
const predEnd = predFn(stEnd.placed, stEnd.frontier, stEnd.recent);
const hEnd = makeHarness();
hEnd.window.__tmOverlaySync(predEnd);
const visPosEnd = runNightFilter(allPos, hEnd.A);
gate('V3', 'finished building: every fixture is eligible once the buildup has actually reached its own install time',
  visPosEnd.length === N, 'cursor=' + new Date(fxEnd).toISOString() + '  eligible=' + visPosEnd.length + '/' + N);

// ── V4: TM OFF — plain Night Mode outside any buildup is UNCHANGED by this fix ──
const hOff = makeHarness();
hOff.window.__tmOverlaySync(null);
const visPosOff = runNightFilter(allPos, hOff.A);
gate('V4', 'Time Machine inactive (plain Night Mode, no buildup bake) — every fixture is eligible, exactly as before this fix',
  visPosOff.length === N, 'isVisible=null  eligible=' + visPosOff.length + '/' + N);

// ── V5: CROSS-CHECK — the PointLight gate and the glow-sprite gate consult the SAME predicate on
//    the SAME list, so at every cursor they must produce the IDENTICAL eligible set ("they should
//    track together now") ──
function crossCheck(cursorLabel, A) {
  const nightSet = new Set(runNightFilter(allPos, A).map(p => p.__guid));
  const glowSet = new Set(runGlowFilter(allPos, A).map(p => p.__guid));
  const equal = nightSet.size === glowSet.size && [...nightSet].every(g => glowSet.has(g));
  return { cursorLabel, equal, nightSize: nightSet.size, glowSize: glowSet.size };
}
const cc = [crossCheck('start', hStart.A), crossCheck('mid', hMid.A), crossCheck('end', hEnd.A), crossCheck('off', hOff.A)];
gate('V5', 'PointLight buildup gate and glow-sprite buildup gate track together at every cursor (same predicate, same list)',
  cc.every(c => c.equal), JSON.stringify(cc));

// ── V6: THE REQUESTED INVARIANT — lit <= placed <= total at multiple real buildup samples, and lit
//    is non-decreasing as the buildup progresses (real §NIGHT_BAKE_POOL/nav budget = A._nightMaxLightsNav,
//    extracted from source, not invented) ──
const capMatch = toolsSrc.match(/A\._nightMaxLightsNav = A\._isMobile \? 1 : (\d+);/);
if (!capMatch) { console.log('❌ EXTRACT — A._nightMaxLightsNav literal not found in viewer/tools.js'); process.exit(1); }
const CAP = +capMatch[1];
console.log('§NIGHT_GATE_WITNESS nav budget A._nightMaxLightsNav=' + CAP + ' (extracted, not invented)');

// real ranks either side of the cap so growth-then-plateau is actually exercised
const ranks = [5, 10, Math.max(11, CAP - 10), CAP, CAP + 20, 400, N];
const samples = ranks.map(function(r) {
  const cur = cursorAt(r);
  const st = tmState(cur);
  const pred = predFn(st.placed, st.frontier, st.recent);
  const h = makeHarness();
  h.window.__tmOverlaySync(pred);
  const visPos = runNightFilter(allPos, h.A);
  // Same synthetic camera used for every sample: the REAL centroid of every fixture in the building
  // (computed, not invented) with target == camera (degenerate aim point) — irrelevant to the
  // set-size invariant under test, only the geometric spread of the pick is camera-dependent.
  const cx = allPos.reduce((s, p) => s + p.x, 0) / allPos.length;
  const cy = allPos.reduce((s, p) => s + p.y, 0) / allPos.length;
  const cz = allPos.reduce((s, p) => s + p.z, 0) / allPos.length;
  const A2 = Object.assign({}, h.A, { camera: { position: { x: cx, y: cy, z: cz } }, controls: { target: { x: cx, y: cy, z: cz } }, _nightMaxLights: CAP });
  const pickNearest = makePickNearest(A2);
  const needed = (visPos.length <= CAP) ? visPos.slice() : pickNearest(visPos, CAP, []);
  return { rank: r, cursor: cur, total: allPos.length, placed: visPos.length, lit: needed.length };
});
console.log('§NIGHT_GATE_WITNESS samples=' + JSON.stringify(samples));

const invariantOK = samples.every(s => s.lit <= s.placed && s.placed <= s.total);
gate('V6a', 'at every real buildup sample: lit <= placed <= total',
  invariantOK, JSON.stringify(samples.map(s => ({ rank: s.rank, total: s.total, placed: s.placed, lit: s.lit }))));

let nonDecreasing = true;
for (let i = 1; i < samples.length; i++) if (samples[i].lit < samples[i - 1].lit) nonDecreasing = false;
const litValues = samples.map(s => s.lit);
const preCapGrows = litValues[0] < litValues[2]; // rank5 < rank(CAP-10ish), both should be below/near cap
const plateausAtCap = samples.some(s => s.lit === CAP) && samples[samples.length - 1].lit === CAP;
gate('V6b', 'lit is non-decreasing as the buildup progresses, grows while under budget, and plateaus at the nav cap once placed exceeds it (never lights a fixture ahead of its own construction, never exceeds the light budget)',
  nonDecreasing && preCapGrows && plateausAtCap,
  'litSequence=' + JSON.stringify(litValues) + ' cap=' + CAP + ' nonDecreasing=' + nonDecreasing +
  ' preCapGrows=' + preCapGrows + ' plateausAtCap=' + plateausAtCap);

// ══ V7/V8 — THE ALT+S / STILL-BOOST BRANCH SPECIFICALLY (2026-09-05, coordinator directive) ══════
// `_nightUpdateLights` is ONE function shared by Alt+S/still-refine AND a MaxQ buildup bake — the
// mixed-selection branch V6 already exercised is the ONE NAVIGATION TAKES; Alt+S/bake instead take
// THIS branch (A._nightStillBoost && A._stillRefineActive: frustum-cull + §BAKE_INTERIOR_TOPUP).
// So the buildup-gate fix is proven on the actual Alt+S code path too, not only the nav path.
// Extracted VERBATIM, byte-for-byte, from A._nightUpdateLights — if the source shape drifts this
// extraction fails loudly rather than silently grading a stale copy (same discipline as LOOP_SRC).
const STILL_HEAD = 'A.camera.updateMatrixWorld();\n      var frustum = new THREE.Frustum();';
const STILL_TAIL = 'needed = _picked.map(function(p) { return { pos: p }; });';
const shi = toolsSrc.indexOf(STILL_HEAD);
const sti = toolsSrc.indexOf(STILL_TAIL, shi);
if (shi < 0 || sti < 0) { console.log('❌ EXTRACT — still-boost/Alt+S branch not found verbatim in viewer/tools.js (source changed shape)'); process.exit(1); }
const STILL_SRC = toolsSrc.slice(shi, sti + STILL_TAIL.length);
console.log('§NIGHT_GATE_WITNESS extracted stillBoostBranch=' + STILL_SRC.length + 'B (the actual Alt+S/bake code path)');

// THREE.Frustum/Matrix4/Vector3 containment math itself is PRE-EXISTING, UNCHANGED, unrelated to
// this fix (no npm `three` package and the vendored ESM build needs a full module-resolution setup
// not worth standing up for a "cheap" check per the coordinator's own framing) — stubbed here as a
// controllable predicate so the test isolates what THIS fix changed: whether visPos (buildup-gated)
// or allPos (unfiltered) feeds the branch. Two extremes exercise both of the branch's own paths:
// EMPTY frustum (forces the §BAKE_INTERIOR_TOPUP fallback) and FULL frustum (everything in view).
function runStillBranch(visPos, A_nightMaxLights, frustumContainsAll) {
  const THREE_STUB = {
    Frustum: function() { this.containsPoint = function() { return frustumContainsAll; }; this.setFromProjectionMatrix = function() {}; },
    Matrix4: function() { this.multiplyMatrices = function() { return this; }; },
    Vector3: function(x, y, z) { this.x = x; this.y = y; this.z = z; },
  };
  const A = {
    camera: { updateMatrixWorld: function() {}, projectionMatrix: {}, matrixWorldInverse: {} },
    _nightMaxLights: A_nightMaxLights,
  };
  const _ntuLastLineLocal = { v: null };
  const runner = new Function('THREE', 'A', 'visPos', '_nightPickNearest', '_ntuLastLine',
    'var needed;\n' + STILL_SRC + '\nreturn needed;');
  // _nightPickNearest itself also reads A.camera/A.controls — bind it to a REAL centroid of visPos
  // (computed, not invented) so the top-up path has a real aim point, same convention as V6 above.
  const cx = visPos.length ? visPos.reduce((s, p) => s + p.x, 0) / visPos.length : 0;
  const cy = visPos.length ? visPos.reduce((s, p) => s + p.y, 0) / visPos.length : 0;
  const cz = visPos.length ? visPos.reduce((s, p) => s + p.z, 0) / visPos.length : 0;
  A.controls = { target: { x: cx, y: cy, z: cz } };
  Object.assign(A, { camera: Object.assign(A.camera, { position: { x: cx, y: cy, z: cz } }) });
  const pickNearest = makePickNearest(A);
  return runner(THREE_STUB, A, visPos, pickNearest, _ntuLastLineLocal.v);
}

// mid-buildup ground truth (422/818 eligible, from V1 above) drives both extremes
const stillEmpty = runStillBranch(visPosMid, CAP, false);   // nothing in frustum -> pure top-up
const stillFull = runStillBranch(visPosMid, CAP, true);     // everything in frustum -> slice(0,200)

const emptyGuids = stillEmpty.map(f => f.pos.__guid);
const emptyAllEligible = emptyGuids.every(g => visPosMidGuids.has(g));
gate('V7', 'Alt+S/bake branch, EMPTY frustum (forces §BAKE_INTERIOR_TOPUP): every top-up pick still comes from the buildup-gated set — never a fixture TM has not placed yet',
  emptyAllEligible && stillEmpty.length > 0 && stillEmpty.length <= CAP && stillEmpty.length <= visPosMid.length,
  'picked=' + stillEmpty.length + '/' + CAP + ' (cap)  allFromEligibleSet=' + emptyAllEligible +
  '  eligiblePool=' + visPosMid.length + '/' + N);

const fullGuids = stillFull.map(f => f.pos.__guid);
const fullAllEligible = fullGuids.every(g => visPosMidGuids.has(g));
gate('V8', 'Alt+S/bake branch, FULL frustum (everything in view): the in-view set is still drawn from the buildup-gated visPos, not the unfiltered allPos — no not-yet-built fixture leaks in even when nothing is culled by view',
  fullAllEligible && stillFull.length === Math.min(200, visPosMid.length),
  'picked=' + stillFull.length + ' expected=min(200,' + visPosMid.length + ')=' + Math.min(200, visPosMid.length) +
  '  allFromEligibleSet=' + fullAllEligible);

console.log('\n§NIGHT_GATE_WITNESS done pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
