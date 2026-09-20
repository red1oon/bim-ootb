#!/usr/bin/env node
/* ⚠ WITNESS — W-STOREY-TINT-SCOPE, §129.59
 * (bim-compiler prompts/LOADPATH_FREEZE_POLISH_RESUME.md §129.59)
 *
 * THE ISSUE IT PROVES OR DISPROVES:
 *   §93.4 MEASURED why the storey tint could not carry its beat: `_applyTint` only touched the
 *   FACADE SUBSET (`_facadeGuidsFor`), which is 2-51 meshes per storey. Level 4 (51) read as broad
 *   bands, Level 5 (44) only as parapet lines, Levels 1 / 7A / 7 (19 / 2 / 6) NOT AT ALL. The old
 *   films rescued that with an x-ray costing 2.6x-3.0x.
 *
 *   §129.59 fixes the SCOPE instead: tint every mesh on the level, no x-ray. This witness proves
 *   the tint now REACHES the geometry on exactly the storeys §93.4 measured as unreachable — and
 *   fails if it does not.
 *
 * WHAT IT ASSERTS:
 *   1 MODE      STOREY_REVEAL_MODE='tint' turns the tint on AND stands the section cut down, so
 *               §108's "tint still running underneath the cut, storey painted twice" cannot recur.
 *               Checked by behaviour (a cut call with a real plan must not arm), not by reading a
 *               flag back.
 *   2 SCOPE     Under scope='storey' the tint touches EVERY mesh on the level. Under scope='facade'
 *               it touches exactly the facade subset. Both directions, so a scope wired to a
 *               constant `true` fails leg 2b.
 *   3 §93.4     On a storey whose facade subset is the size §93.4 called invisible (2 or 6 meshes)
 *               the new scope reaches materially more. This is the leg that would have been red
 *               before the change and is the reason the change exists.
 *   4 RESTORE   Every tinted mesh gets its ORIGINAL material object back — not a look-alike clone.
 *               A leaked tint is what §108 was reported as ("Why is there lingering blue tint?").
 *   5 CENSUS    §STOREY_REVEAL_TINT prints scope= and facadeMeshes= so one bake line is directly
 *               comparable with §93.4's numbers, and says FAIL when it marked nothing.
 *
 * WHAT MAKES IT A WITNESS AND NOT A SMOKE TEST:
 *   - NO-OP:   leg 3 compares the two scopes on the SAME storey, so a change that widened nothing
 *              reads equal and fails.
 *   - WRONG:   leg 4 compares material IDENTITY after restore, so a "restore" that assigns a fresh
 *              equivalent material fails.
 *   - VACUOUS: if the module will not load or the tint marks zero meshes, it says so and exits 2
 *              rather than passing.
 *   - CONTROL: git show HEAD:viewer/cpe_storey_reveal.js > /tmp/before_sr.js && run with that path
 *              -> the tint is off entirely, so legs 2-5 cannot even run: INCONCLUSIVE, exit 2.
 *
 *   ⚠ PIXELS ARE NOT EVIDENCE (bim-ootb standing rule). This proves the tint REACHES the geometry.
 *   Whether it reads better than the section cut is red1's eyes on a real clip, and this witness
 *   makes no claim about that.
 *
 * RUN: node witness_storey_tint_scope.js [path/to/cpe_storey_reveal.js]
 */
'use strict';
const path = require('path');

// THREE must exist BEFORE the module is required — `var _C = (typeof THREE !== 'undefined' && ...)`
// runs at setup time, and without it _applyTint returns 0 and every leg below would be vacuous.
class FakeColor {
  constructor(h) { this.h = h >>> 0; }
  setHex(h) { this.h = h >>> 0; return this; }
  getHex() { return this.h; }
}
global.THREE = { Color: FakeColor };
global.window = global.window || {};

const SRC = process.argv[2] || './viewer/cpe_storey_reveal.js';
let setupCpeStoreyReveal;
try { setupCpeStoreyReveal = require(path.resolve(SRC)); }
catch (e) { console.log('§TINT_SCOPE INCONCLUSIVE — cannot load ' + SRC + ': ' + e.message); process.exit(2); }

let pass = 0, fail = 0;
const chk = (n, c, x) => { (c ? pass++ : fail++); console.log('  ' + (c ? 'ok    ' : 'FAIL  ') + n + (x ? '  ' + x : '')); };

// ── a scene with a KNOWN answer ──────────────────────────────────────────────────────────────
// Three storeys sized after §93.4's own report: L4 is the one that READ (51 facade), L7A and L7
// are the ones that did not (2 and 6). Each storey has many more non-facade meshes than facade.
const PLAN = { 'Level 4': { total: 120, facade: 51 }, 'Level 7A': { total: 40, facade: 2 }, 'Level 7': { total: 55, facade: 6 } };
function buildScene() {
  const meshes = [];
  for (const [storey, spec] of Object.entries(PLAN)) {
    for (let i = 0; i < spec.total; i++) {
      const mat = { emissive: new FakeColor(0), clone() { return { emissive: new FakeColor(0), transparent: true, opacity: 0.5 }; } };
      meshes.push({ isMesh: true, userData: { storey, guid: storey + ':' + i }, material: mat, _origMat: mat });
    }
  }
  return meshes;
}
function facadeSetFor(storey) {   // the first `facade` guids of each storey ARE the facade subset
  const s = {}; for (let i = 0; i < PLAN[storey].facade; i++) s[storey + ':' + i] = true; return s;
}
function makeA(meshes) {
  const A = {
    activeBuilding: 'W', _metaGen: 0,
    dbQuery: () => [],
    collectMeshes: (pred) => meshes.filter((m) => { try { return !!pred(m); } catch (e) { return false; } }),
  };
  setupCpeStoreyReveal(A);
  return A;
}
function capture(fn) {
  const lines = [], _log = console.log;
  console.log = (m) => { if (typeof m === 'string') lines.push(m); };
  let out; try { out = fn(); } finally { console.log = _log; }
  return { out, lines };
}

// The module keeps `_facadeGuidsFor` private and it needs a raster we have no fixture for, so the
// witness substitutes a KNOWN facade set through the one seam the module reads it by. If that seam
// is not there, say so rather than testing something else.
const fs = require('fs');
const src = fs.readFileSync(path.resolve(SRC), 'utf8');
if (!/STOREY_REVEAL_MODE/.test(src)) {
  console.log('§TINT_SCOPE INCONCLUSIVE — no §129.59 STOREY_REVEAL_MODE in ' + path.basename(SRC) +
    '; the tint is off entirely on this tree and legs 2-5 cannot run');
  process.exit(2);
}

// Exercise the real selection predicate by running the module source with `_facadeGuidsFor`
// swapped for our known set — a source-level seam, so the predicate under test is the real one.
function loadWith(scope) {
  const patched = src
    .replace(/var STOREY_REVEAL_TINT_SCOPE = '[a-z]+';/, "var STOREY_REVEAL_TINT_SCOPE = '" + scope + "';")
    .replace(/function _facadeGuidsFor\(storeyName\) \{/, 'function _facadeGuidsFor(storeyName) { return (window.__wFacade || {})[storeyName] || {};');
  const mod = { exports: {} };
  new Function('module', 'exports', 'window', 'THREE', 'require', patched + '\n;module.exports = setupCpeStoreyReveal;')
    (mod, mod.exports, global.window, global.THREE, require);
  return mod.exports;
}
global.window.__wFacade = Object.fromEntries(Object.keys(PLAN).map((s) => [s, facadeSetFor(s)]));

function run(scope) {
  const setup = loadWith(scope);
  const meshes = buildScene();
  const A = { activeBuilding: 'W', _metaGen: 0, dbQuery: () => [],
    collectMeshes: (pred) => meshes.filter((m) => { try { return !!pred(m); } catch (e) { return false; } }) };
  setup(A);
  const per = {};
  for (const storey of Object.keys(PLAN)) {
    const { out, lines } = capture(() => A.storeyRevealTintFor(storey, 0x2979ff));
    per[storey] = { n: out, line: lines.find((l) => l.indexOf('§STOREY_REVEAL_TINT ') === 0) || '' };
    capture(() => A.storeyRevealTintRestore());
  }
  return { A, meshes, per };
}

console.log('\n── 1 MODE — tint on, cut stood down ' + '─'.repeat(32));
{
  const setup = loadWith('storey');
  const meshes = buildScene();
  const A = { activeBuilding: 'W', _metaGen: 0, dbQuery: () => [], collectMeshes: () => meshes };
  setup(A);
  const m = A.storeyRevealMode();
  chk("mode is 'tint'", m.mode === 'tint', JSON.stringify(m));
  chk('STOREY_REVEAL_TINT follows the mode', m.tint === true);
  // behaviour, not a flag read: a cut call with a real plan must not arm anything
  const { lines } = capture(() => { try { A.storeyRevealApplyCut({ beats: [], storeyReveal: {} }, 0.5); } catch (e) {} });
  chk('a cut call with a real plan does NOT arm (§108 cannot recur)',
    !A._storeyRevealArmed, 'armed=' + !!A._storeyRevealArmed);
  chk('§STOREY_REVEAL_MODE says the cut stood down',
    lines.some((l) => l.indexOf('§STOREY_REVEAL_MODE tint') === 0), lines[0] ? lines[0].slice(0, 80) : '(no line)');
}

console.log('\n── 2 SCOPE — both directions ' + '─'.repeat(39));
const S = run('storey'), F = run('facade');
for (const storey of Object.keys(PLAN)) {
  chk("scope='storey' tints EVERY mesh on " + storey,
    S.per[storey].n === PLAN[storey].total, S.per[storey].n + '/' + PLAN[storey].total);
  chk("scope='facade' tints exactly the facade subset on " + storey,
    F.per[storey].n === PLAN[storey].facade, F.per[storey].n + '/' + PLAN[storey].facade + ' (§93.4 behaviour preserved)');
}

console.log('\n── 3 §93.4 — the storeys that read as NOTHING ' + '─'.repeat(22));
for (const storey of ['Level 7A', 'Level 7']) {
  const was = PLAN[storey].facade, now = S.per[storey].n;
  chk(storey + ': the tint now reaches materially more than §93.4 measured',
    now > was * 3 && now > 10, was + ' facade meshes -> ' + now + ' whole-storey meshes (' + (now / was).toFixed(1) + 'x)');
}
chk('Level 4 (the one §93.4 said DID read) also widens, not shrinks',
  S.per['Level 4'].n > PLAN['Level 4'].facade, PLAN['Level 4'].facade + ' -> ' + S.per['Level 4'].n);

console.log('\n── 4 RESTORE — the ORIGINAL material object, by identity ' + '─'.repeat(12));
{
  const setup = loadWith('storey');
  const meshes = buildScene();
  const A = { activeBuilding: 'W', _metaGen: 0, dbQuery: () => [],
    collectMeshes: (pred) => meshes.filter((m) => { try { return !!pred(m); } catch (e) { return false; } }) };
  setup(A);
  capture(() => A.storeyRevealTintFor('Level 7', 0x2979ff));
  const changed = meshes.filter((m) => m.material !== m._origMat).length;
  chk('the tint actually swapped materials', changed === PLAN['Level 7'].total, changed + ' meshes');
  capture(() => A.storeyRevealTintRestore());
  const leaked = meshes.filter((m) => m.material !== m._origMat);
  chk('every mesh has its ORIGINAL material object back (no lingering tint, §108)',
    leaked.length === 0, leaked.length + ' leaked');
}

console.log('\n── 5 CENSUS — one line, comparable with §93.4 ' + '─'.repeat(22));
{
  const line = S.per['Level 7A'].line;
  chk('§STOREY_REVEAL_TINT prints scope=', /scope=storey/.test(line));
  chk('§STOREY_REVEAL_TINT prints facadeMeshes= beside meshesTouched=',
    /meshesTouched=\d+ facadeMeshes=\d+/.test(line), line.slice(0, 110));
  const setup = loadWith('storey');
  const A = { activeBuilding: 'W', _metaGen: 0, dbQuery: () => [], collectMeshes: () => [] };
  setup(A);
  const { lines } = capture(() => A.storeyRevealTintFor('Nowhere', 0x2979ff));
  chk('a storey it marks NOTHING on says FAIL, not silence',
    (lines[0] || '').indexOf('=> FAIL') > 0, (lines[0] || '(no line)').slice(0, 100));
}

console.log('\n\u2500\u2500 6 CHANNELS \u2014 what is WRITTEN, not just what is reached ' + '\u2500'.repeat(12));
{
  // THE ISSUE THIS EXISTS FOR. red1, 2026-09-20 on a delivered clip: "It is not lighting thruout."
  // Sections 1-5 above count meshes REACHED and they were 18/18 green while the picture was patchy,
  // because reach was never the problem: _applyTint wrote `emissive` on regular meshes and DIFFUSE
  // (setColorAt) on instanced and batched ones, so one storey was painted two different ways at
  // once and the regular parts kept their original grey. `emissive.setHex` also leaves
  // emissiveIntensity alone, so a source material at 0 showed nothing at all.
  // Disproved the moment any path stops writing both channels, or the lift goes back to being
  // whatever the source material happened to carry.
  const hex = 0x2979ff;
  const clones = [];
  const mkMat = () => ({
    color: new FakeColor(0x888888), emissive: new FakeColor(0), emissiveIntensity: 0,
    clone() { const c = { color: new FakeColor(0x888888), emissive: new FakeColor(0),
                          emissiveIntensity: 0, transparent: true, opacity: 0.5 };
              clones.push(c); return c; }
  });
  const inst = { isInstancedMesh: true, id: 11, instanceColor: null, setColorAt(i, c) { this._last = c.getHex(); },
                 count: 1 };
  // batched meshes are indexed by A._batchMeta, NOT A._instanceMeta — a different map, and using
  // the wrong one makes this leg silently vacuous (it did on the first run: "never called").
  const batch = { isBatchedMesh: true, id: 22,
                  getColorAt(slot, c) { return c; },
                  setColorAt(slot, c) { this._last = c.getHex(); } };
  const reg = { isMesh: true, userData: { storey: 'Level 4', guid: 'g-reg' }, material: mkMat() };
  const meshes = [reg, inst, batch];
  const A = { activeBuilding: 'W', _metaGen: 0, dbQuery: () => [],
              _instanceMeta: { 11: [{ storey: 'Level 4', guid: 'g-inst' }] },
              _batchMeta: { 22: [{ storey: 'Level 4', guid: 'g-batch', slotId: 0 }] },
              collectMeshes: (pred) => meshes.filter((m) => { try { return !!pred(m); } catch (e) { return false; } }) };
  setupCpeStoreyReveal(A);
  capture(() => A.storeyRevealTintFor('Level 4', hex));
  const cl = clones[0];
  chk('regular mesh: DIFFUSE is set to the tint colour (was untouched \u2014 the patchiness)',
    !!cl && cl.color.getHex() === hex, cl ? '#' + cl.color.getHex().toString(16) : '(no clone)');
  chk('regular mesh: EMISSIVE is set to the same colour',
    !!cl && cl.emissive.getHex() === hex, cl ? '#' + cl.emissive.getHex().toString(16) : '(no clone)');
  chk('regular mesh: emissiveIntensity is LIFTED \u2014 a source material at 0 showed nothing',
    !!cl && cl.emissiveIntensity > 0, cl ? String(cl.emissiveIntensity) : '(no clone)');
  chk('the lift is the SAME number cpe_load_path.js already uses (0.35), not a second guess',
    !!cl && Math.abs(cl.emissiveIntensity - 0.35) < 1e-9, cl ? String(cl.emissiveIntensity) : '-');
  chk('instanced mesh: setColorAt got the tint colour', inst._last === hex,
    inst._last == null ? '(never called)' : '#' + inst._last.toString(16));
  chk('batched mesh: setColorAt got the tint colour', batch._last === hex,
    batch._last == null ? '(never called)' : '#' + batch._last.toString(16));
  chk('ALL THREE geometry paths now agree on the colour \u2014 one storey, one look',
    !!cl && cl.color.getHex() === hex && inst._last === hex && batch._last === hex);
}

console.log('');
console.log('§TINT_SCOPE ' + (fail ? 'FAIL' : 'PASS') + ' pass=' + pass + ' fail=' + fail +
  ' src=' + path.basename(SRC) +
  ' (SCOPE: proves the tint REACHES the geometry. Whether it READS better than the section cut is' +
  " red1's eyes on a clip — no pixel analysis is offered as proof of that.)");
process.exit(fail ? 1 : 0);
