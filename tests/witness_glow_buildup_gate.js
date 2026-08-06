#!/usr/bin/env node
/**
 * W-GLOW-BUILDUP-GATE — §GLOW_BUILDUP_GATE (2026-08-07).
 *
 * ISSUE THIS TEST EXPOSES: a MaxQ buildup bake (Alt+C, buildup ON) showed every light fixture in
 * the FINISHED building glowing from Day 1, regardless of how much of the building was actually
 * built yet — user, verbatim: "all the lights are lighted and not following the buildup schedule".
 * Root cause: A._loadNightFixtures() (tools.js) reads fixture positions from the final, fully-built
 * elements_meta/element_transforms snapshot with zero join to the 4D schedule, and §PHOTO_GLOW_SPRITE
 * (effects.js _glowOn) staged a glow sprite for every one of them unconditionally.
 *
 * Fix: thread guid through the fixture query, and gate _glowOn()'s sprite list through the SAME
 * §TM_OVERLAY_SYNC per-tick predicate Time Machine already hands to the billboard-nameplate overlay
 * (effects.js A._tmOverlayRegister / window.__tmOverlaySync) — extended into a small fan-out
 * (A._tmVisSubscribe / A._tmIsVisible) so a second consumer can read it without re-deriving
 * placed/frontier/recent itself.
 *
 * NOT A REIMPLEMENTATION. All three pieces of logic under test — Time Machine's op→state loop, the
 * §TM_OVERLAY_SYNC fan-out (A._tmOverlayRegister/_tmIsVisible/_tmVisSubscribe), and the glow-sprite
 * filter line itself — are extracted from the SHIPPED SOURCE TEXT by exact-substring match and run
 * via new Function(), against REAL fixture guids + REAL kernel_ops timestamps from a real 4D DB.
 * If any source changes shape, extraction FAILS LOUDLY rather than silently grading a stale copy.
 *
 * Run:  node tests/witness_glow_buildup_gate.js 2>&1 | tee /tmp/W_GLOW_GATE.log
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

console.log('§GLOW_GATE_WITNESS start db=' + DB);

const tmSrc = fs.readFileSync(path.join(ROOT, 'viewer/time_machine.js'), 'utf8');
const fxSrc = fs.readFileSync(path.join(ROOT, 'viewer/effects.js'), 'utf8');
const toolsSrc = fs.readFileSync(path.join(ROOT, 'viewer/tools.js'), 'utf8');

// ── extract (a) renderAtTime's op→state loop, verbatim (same anchor as witness_billboard_nameplate.js) ──
const LOOP_HEAD = '    for (var i = 0; i < _ops.length; i++) {\n      var op = _ops[i];\n      if (op.start_ts > cursorMs) break;';
const li = tmSrc.indexOf(LOOP_HEAD);
if (li < 0) { console.log('❌ EXTRACT — renderAtTime op loop not found in viewer/time_machine.js (source changed shape)'); process.exit(1); }
let depth = 0, end = -1;
for (let i = li; i < tmSrc.length; i++) {
  if (tmSrc[i] === '{') depth++;
  else if (tmSrc[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
}
const LOOP_SRC = tmSrc.slice(li, end);

// ── extract (b) the §TM_OVERLAY_SYNC fan-out block, verbatim: _tmVisListeners / _lastTmIsVisible /
//    A._tmVisSubscribe / A._tmIsVisible / A._tmOverlayRegister (which installs window.__tmOverlaySync) ──
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
// consume the trailing `;` after the assignment, same as the surrounding statement
while (fxSrc[end] === ';') end++;
const FANOUT_SRC = fxSrc.slice(fai, end);

// ── extract (c) the glow-sprite filter line itself, verbatim ──
const FILTER_LINE = 'var pos = allPos.filter(function(p) { return p.__guid == null || A._tmIsVisible(p.__guid); });';
if (fxSrc.indexOf(FILTER_LINE) < 0) { console.log('❌ EXTRACT — §GLOW_BUILDUP_GATE filter line not found in viewer/effects.js _glowOn()'); process.exit(1); }

console.log('§GLOW_GATE_WITNESS extracted tmLoop=' + LOOP_SRC.length + 'B fanout=' + FANOUT_SRC.length +
  'B filterLine=' + FILTER_LINE.length + 'B');

// ── G0: the fixture query carries guid through, and the world-position mapper tags __guid ──
const sqlHasGuid = /SELECT t\.center_x, t\.center_y, t\.center_z, m\.element_name, t\.bbox_z, m\.guid FROM elements_meta/.test(toolsSrc);
const pushHasGuid = /A\._nightFixtures\.push\(\{ x: row\[0\], y: row\[1\], z: row\[2\], name: row\[3\] \|\| '', h: row\[4\] \|\| 0, guid: row\[5\] \|\| null \}\)/.test(toolsSrc);
const posHasGuid = /p\.__guid = f\.guid \|\| null;/.test(toolsSrc);
gate('G0', 'fixture guid is threaded from the SQL row through to the world-space position object',
  sqlHasGuid && pushHasGuid && posHasGuid,
  'SELECT includes m.guid=' + sqlHasGuid + '  _nightFixtures row carries guid=' + pushHasGuid +
  '  world position carries __guid=' + posHasGuid);

// ── real data: every IfcLightFixture in Terminal_Hi that has its own ELEMENT_PLACE op ──
const fixtureRows = qrows("SELECT m.guid, k.timestamp, json_extract(k.parameters,'$._end_ts') " +
  "FROM elements_meta m JOIN kernel_ops k ON k.output_guid=m.guid " +
  "WHERE m.ifc_class='IfcLightFixture' AND k.op_type='ELEMENT_PLACE' ORDER BY k.timestamp");
if (!fixtureRows.length) { console.log('❌ no IfcLightFixture kernel_ops rows found — DB changed shape'); process.exit(1); }
const fixtures = fixtureRows.map(r => ({ guid: r[0], start: +r[1], end: +r[2] }));
const fxStart = Math.min.apply(null, fixtures.map(f => f.start));
const fxEnd = Math.max.apply(null, fixtures.map(f => f.end));
const N = fixtures.length;
console.log('§GLOW_GATE_WITNESS fixtures=' + N + ' installWindow=' + new Date(fxStart).toISOString() +
  '..' + new Date(fxEnd).toISOString());

// tmState — SAME shape as witness_billboard_nameplate.js, driven off ONLY the fixture ops (a guid's
// placed/frontier/recent entry depends only on that guid's own op, never on any other guid's op).
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

// the SHIPPED fan-out, sandboxed with a real A/window/console
function makeHarness() {
  const A = {};
  const windowObj = {};
  const logs = [];
  const consoleObj = { log: s => logs.push(s) };
  // §TM_OVERLAY_SYNC's setter also reads _billboardNameMesh/_billboardNameGuid — real module-level
  // vars declared elsewhere in effects.js (the billboard-nameplate feature), outside FANOUT_SRC's own
  // extracted span. Stub them as absent (no nameplate built in this sandbox) — same as any building
  // with no config.json/buildingName, where A._tmOverlayRegister() runs from _glowOn() alone.
  const build = new Function('A', 'window', 'console',
    'var _billboardNameMesh = null, _billboardNameGuid = null;\n' + FANOUT_SRC + '\nreturn A;');
  build(A, windowObj, consoleObj);
  A._tmOverlayRegister();   // installs window.__tmOverlaySync, exactly as _glowOn() now does
  return { A, window: windowObj, logs };
}
// the SHIPPED filter line, executed as-is (not re-derived)
const runFilter = new Function('allPos', 'A', FILTER_LINE + '\nreturn pos;');

const allPos = fixtures.map(f => ({ __guid: f.guid }));

// ── V1: EARLY buildup — mid-way through the fixtures' own install window ──
const midCursor = Math.floor((fxStart + fxEnd) / 2);
const stMid = tmState(midCursor);
const predMid = predFn(stMid.placed, stMid.frontier, stMid.recent);
const groundTruthMid = new Set(fixtures.filter(f => predMid(f.guid)).map(f => f.guid));

const hMid = makeHarness();
hMid.window.__tmOverlaySync(predMid);
const shippedMid = runFilter(allPos, hMid.A);
const shippedMidGuids = new Set(shippedMid.map(p => p.__guid));
const setsEqualMid = shippedMidGuids.size === groundTruthMid.size &&
  [...groundTruthMid].every(g => shippedMidGuids.has(g));
gate('V1', 'mid-buildup: the glow filter matches Time Machine\'s own placed/frontier/recent set exactly — partial, not all-or-nothing',
  setsEqualMid && groundTruthMid.size > 0 && groundTruthMid.size < N,
  'cursor=' + new Date(midCursor).toISOString() + '  groundTruth=' + groundTruthMid.size + '/' + N +
  '  shippedFilter=' + shippedMidGuids.size + '/' + N + '  setsEqual=' + setsEqualMid +
  ' (both must be strictly between 0 and ' + N + ' to prove this is a REAL partial gate, not a stuck 0 or N)');

// ── V2: THE LITERAL REGRESSION — cursor at project/fixture start, before any fixture is placed ──
const stStart = tmState(fxStart - 1);
const predStart = predFn(stStart.placed, stStart.frontier, stStart.recent);
const hStart = makeHarness();
hStart.window.__tmOverlaySync(predStart);
const shippedStart = runFilter(allPos, hStart.A);
gate('V2', '"all the lights are lighted... not following the buildup schedule" — ZERO fixtures glow before the first one is even scheduled to install',
  shippedStart.length === 0,
  'cursor=' + new Date(fxStart - 1).toISOString() + ' (1ms before the first fixture op)  glowing=' +
  shippedStart.length + '/' + N + ' (must be 0 — this is the exact defect reported live)');

// ── V3: full build — every fixture placed ──
const stEnd = tmState(fxEnd);
const predEnd = predFn(stEnd.placed, stEnd.frontier, stEnd.recent);
const hEnd = makeHarness();
hEnd.window.__tmOverlaySync(predEnd);
const shippedEnd = runFilter(allPos, hEnd.A);
gate('V3', 'finished building: every fixture glows once the buildup has actually reached its own install time',
  shippedEnd.length === N,
  'cursor=' + new Date(fxEnd).toISOString() + ' (last fixture\'s own end_ts)  glowing=' + shippedEnd.length + '/' + N);

// ── V4: TM OFF must restore full glow — plain Night Mode outside any buildup is UNCHANGED by this fix ──
const hOff = makeHarness();
hOff.window.__tmOverlaySync(null);   // §TM_OVERLAY_SYNC's own convention: null = "TM is off, show everything"
const shippedOff = runFilter(allPos, hOff.A);
gate('V4', 'Time Machine inactive (plain Night Mode, no buildup bake in progress) — every fixture glows, exactly as before this fix',
  shippedOff.length === N,
  'isVisible=null  glowing=' + shippedOff.length + '/' + N + ' (regression guard: this fix must not touch Night Mode outside a buildup)');

console.log('\n§GLOW_GATE_WITNESS done pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
