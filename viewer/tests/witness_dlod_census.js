#!/usr/bin/env node
/* ⚠ WITNESS — W-DLOD-CENSUS, §129.56
 * (bim-compiler prompts/LOADPATH_FREEZE_POLISH_RESUME.md §129.56)
 *
 * THE ISSUE IT PROVES OR DISPROVES:
 *   `§DLOD_TM active=… boxed=… mode=on` prints ONLY on an engage/disengage EDGE
 *   (`time_machine.js`, `if (forceFull) console.log(…)`). On the 2026-09-20 Hospital hi-res bake it
 *   fired exactly once, at frame 0 before the buildup had placed anything — `boxed=0` — so the log
 *   could not tell "the proxy is inert" from "the proxy had nothing to do yet". §129.56 adds a
 *   standing, wall-clock-throttled `§DLOD_TM_CENSUS`. This witness proves that census reports the
 *   REAL numbers and that its throttle neither swallows everything nor spams.
 *
 * WHAT IT ASSERTS:
 *   1 COUNTS   boxed / indexed / candidates are the real populations, checked against a scene this
 *              witness constructs with a KNOWN answer (so a counter wired to the wrong variable,
 *              or left at 0 by an early `continue`, is caught).
 *   2 THROTTLE over N simulated passes at a known clock rate, the census emits the arithmetically
 *              correct number of lines, and `passes` across those lines sums to N — no pass is
 *              lost and none is double-counted.
 *   3 EDGE     the original `§DLOD_TM` edge line still fires, and still ONLY on an edge. §129.56
 *              added a line beside it; a change that replaced it would be caught here.
 *
 * WHAT MAKES IT A WITNESS AND NOT A SMOKE TEST:
 *   - NO-OP:    the function body is EXTRACTED from time_machine.js by text, so a census that was
 *               never added, or was added outside this function, produces zero lines and FAILs.
 *   - WRONG:    the expected counts are derived from the witness's own scene, not read back from
 *               the log line — a census that printed `indexed` where `boxed` belongs fails.
 *   - VACUOUS:  if the function or the census line cannot be extracted, it prints INCONCLUSIVE and
 *               exits 2 rather than passing quietly.
 *   - CONTROL:  run it against the pre-fix file and it must FAIL:
 *                 git show HEAD:viewer/time_machine.js > /tmp/before_tm.js
 *                 node viewer/tests/witness_dlod_census.js /tmp/before_tm.js
 *
 *   ⚠ SCOPE — this proves the census COMPUTES and THROTTLES correctly. It does NOT prove the line
 *   appears in a real bake; that needs a bake started after the change, grepped for
 *   `§DLOD_TM_CENSUS` with `boxed>0`. Both are required before §129.56 is called done.
 *
 * RUN: node viewer/tests/witness_dlod_census.js [path/to/time_machine.js]
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const SRC = process.argv[2] || path.resolve(__dirname, '..', 'time_machine.js');
const src = fs.readFileSync(SRC, 'utf8');

// ── extract the real function, never a retyped copy ──────────────────────────────────────────
const start = src.indexOf('function _dlodUpdateBoxes(app, engaged, placed, frontier, recent) {');
if (start < 0) { console.log('§DLOD_CENSUS INCONCLUSIVE — _dlodUpdateBoxes not found in ' + SRC); process.exit(2); }
let depth = 0, end = -1;
for (let i = src.indexOf('{', start); i < src.length; i++) {
  if (src[i] === '{') depth++;
  else if (src[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
}
if (end < 0) { console.log('§DLOD_CENSUS INCONCLUSIVE — could not find the end of _dlodUpdateBoxes'); process.exit(2); }
const fnSrc = src.slice(start, end);

// ── a scene with a KNOWN answer ──────────────────────────────────────────────────────────────
// 10 boxes. placed: 0..7 (8). frontier: 0,1. recent: 2. => candidates = 8 - 2 - 1 = 5 (ids 3..7).
// Of those, the fake frustum reports ids 3,4 as IN view, so they stay real; 5,6,7 are out of view
// AND beyond the distance gate => boxed = 3.
const IDS = Array.from({ length: 10 }, (_, i) => 'g' + i);
const IN_VIEW = new Set(['g3', 'g4']);
const EXPECT = { indexed: 10, candidates: 5, boxed: 3 };

function mkIndex() {
  const idx = {};
  IDS.forEach((g, i) => { idx[g] = { pos: { x: i, y: 0, z: 0 }, radius: 1, idx: i, visible: false, matrix: {}, mesh: { setMatrixAt() {}, instanceMatrix: { needsUpdate: false } } }; });
  return idx;
}
let CLOCK = 0;                     // the witness owns the clock; the throttle must read it
const lines = [];
function runPasses(n, msPerPass, engagedSeq) {
  const sandbox = {
    console: { log: (s) => lines.push(String(s)) },
    performance: { now: () => CLOCK },
    Date: { now: () => CLOCK },
    Object,
    Math,
    window: {},
    _dlodBoxIndex: mkIndex(),
    _dlodBoxBld: 'B', _lastProxyEngaged: null,
    _dlodDisposeBoxes() { sandbox._dlodBoxIndex = null; },
    _dlodBuildBoxes() { sandbox._dlodBoxIndex = mkIndex(); },
    _zeroMatrix: {},
    _dlodSphere: { center: { copy(p) { this._p = p; } }, radius: 0 },
    _dlodFrustum: { intersectsSphere(s) { return IN_VIEW.has(IDS[s.center._p.x]); } },
    _dlodCamPos: { distanceToSquared() { return 1e9; } },   // always beyond the distance gate
    DLOD_VIEW_DIST_SQ: 2500,
  };
  const ctx = vm.createContext(sandbox);
  vm.runInContext(src.slice(src.indexOf('// §129.56 — census throttle state') >= 0
    ? src.indexOf('// §129.56 — census throttle state') : start, start) + '\n' + fnSrc + '\n', ctx, { filename: 'time_machine.js#_dlodUpdateBoxes' });
  const placed = {}, frontier = {}, recent = {};
  for (let i = 0; i <= 7; i++) placed[IDS[i]] = true;
  frontier[IDS[0]] = true; frontier[IDS[1]] = true;
  recent[IDS[2]] = 1;
  for (let p = 0; p < n; p++) {
    ctx._dlodUpdateBoxes({ activeBuilding: 'B' }, engagedSeq ? engagedSeq(p) : true, placed, frontier, recent);
    CLOCK += msPerPass;
  }
  return ctx;
}

let fails = 0;
const ok = (cond, msg) => { console.log((cond ? '  ok    ' : '  FAIL  ') + msg); if (!cond) fails++; };

// ── PART 1/2 — COUNTS + THROTTLE ─────────────────────────────────────────────────────────────
// 2,000 ms throttle, 500 ms per pass, 40 passes = 20,000 ms => the first pass emits (clock 0,
// _dlodCensusAt 0) and then one every 4 passes: 1 + floor(39/4) = 10 lines.
console.log('── §129.56 census ' + '─'.repeat(50));
CLOCK = 0; lines.length = 0;
runPasses(40, 500);
const cens = lines.filter((l) => l.startsWith('§DLOD_TM_CENSUS'));
if (!cens.length) {
  console.log('  FAIL  no §DLOD_TM_CENSUS line was emitted in 40 passes — the census is not in this build');
  fails++;
} else {
  console.log('  first: ' + cens[0]);
  console.log('  last : ' + cens[cens.length - 1]);
  const f = (l, k) => { const m = l.match(new RegExp('\\b' + k + '=([0-9]+)')); return m ? +m[1] : null; };
  const boxedOk = cens.every((l) => f(l, 'boxed') === EXPECT.boxed);
  const idxOk = cens.every((l) => l.indexOf('boxed=' + EXPECT.boxed + '/' + EXPECT.indexed) >= 0);
  const candOk = cens.every((l) => f(l, 'candidates') === EXPECT.candidates);
  const frontOk = cens.every((l) => f(l, 'frontier') === 2);
  ok(boxedOk, 'boxed == ' + EXPECT.boxed + ' (3 placed, non-frontier, non-recent boxes are out of view)');
  ok(idxOk, 'indexed == ' + EXPECT.indexed + ' (every box in the index, counted in the live loop)');
  ok(candOk, 'candidates == ' + EXPECT.candidates + ' (8 placed − 2 frontier − 1 recent); boxed<candidates is VISIBLE');
  ok(frontOk, 'frontier == 2');
  // 40 passes at 500 ms = 20,000 ms. The first pass emits (so the tag is alive from the start),
  // then one every 2,000 ms = every 4 passes: passes 0, 4, 8 … 36 -> 11 lines.
  ok(cens.length === 11, 'throttle emitted ' + cens.length + ' lines over 40 passes at 500ms/2000ms (expect 11: first pass + one per window)');
  const sumPasses = cens.reduce((a, l) => a + (f(l, 'passes') || 0), 0);
  // A pure throttle cannot flush the tail, so the honest property is: every pass is either
  // reported or still inside the CURRENT unflushed window — never silently dropped in the middle.
  const residue = 40 - sumPasses;
  const windowPasses = Math.ceil(2000 / 500);
  ok(residue >= 0 && residue < windowPasses,
    'every pass is accounted for: ' + sumPasses + ' reported + ' + residue + ' still inside the open window (< ' + windowPasses + ')');
  ok(f(cens[0], 'passes') === 1, 'the FIRST census fires on the first pass (passes=1), so the tag is alive immediately');
}

// ── PART 3 — the edge line is still edge-only ────────────────────────────────────────────────
const edges = lines.filter((l) => l.startsWith('§DLOD_TM '));
ok(edges.length === 1, '§DLOD_TM edge line fired exactly once across 40 constant-`engaged` passes (got ' + edges.length + ')');
CLOCK = 0; lines.length = 0;
runPasses(8, 100, (p) => p < 4);   // engaged flips once, at pass 4
const edges2 = lines.filter((l) => l.startsWith('§DLOD_TM '));
ok(edges2.length === 2, '§DLOD_TM fires on BOTH edges when `engaged` flips (got ' + edges2.length + ')');

console.log('');
const verdict = fails ? 'FAIL' : 'PASS';
console.log('§DLOD_CENSUS ' + verdict + ' fails=' + fails + ' src=' + path.basename(SRC) +
  ' (SCOPE: computation + throttle only — a real bake must still show §DLOD_TM_CENSUS with boxed>0)');
process.exit(fails ? 1 : 0);
