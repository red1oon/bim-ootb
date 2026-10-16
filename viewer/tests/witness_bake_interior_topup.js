#!/usr/bin/env node
// witness_bake_interior_topup.js — W-BAKE-TOPUP
//
// ⚠ DO NOT REMOVE — SCOPE (bim-compiler prompts/PHOTOREAL_STILL_RENDER.md §BAKE_INTERIOR_TOPUP).
// User, 2026-09-04, on a live Hospital Alt+C bake: "the indoor is gloomy and not lively" — while
// "outside the scene of the building is very lively". Read the log after every run.
//
// THE ISSUE THIS PROVES OR DISPROVES: during a still/bake fold, tools.js `_nightUpdateLights`
// selected fixture point lights by FRUSTUM-CENTRE CONTAINMENT ONLY. An interior pose is the case
// that test answers wrong — the troffers lighting the room you stand in sit overhead or behind the
// eye — so the set came back short, or empty; and with §NIGHT_BAKE_POOL an empty set means every
// pooled slot rides at intensity 0, i.e. the room is lit by flat fill alone. This witness asserts
// the in-frustum set is TOPPED UP to the still budget and is never truncated.
//
// Whitebox, no browser: `_nightPickNearest` and `_nightUpdateLights` are SLICED OUT of the shipped
// viewer/tools.js by brace matching and executed against stub THREE/A objects — never re-typed, so
// the witness cannot pass against a copy that is not what ships.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const { Witness } = require(path.join(__dirname, '..', '..', 'witness_kit', 'contract.js'));

const TOOLS = path.join(__dirname, '..', 'tools.js');
const src = fs.readFileSync(TOOLS, 'utf8');

function sliceFrom(marker) {
  const i = src.indexOf(marker);
  if (i < 0) return null;
  let d = 0, open = false;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') { d++; open = true; }
    else if (src[j] === '}') { d--; if (open && d === 0) return src.slice(i, j + 1); }
  }
  return null;
}
// The spread constant lives beside the helper in tools.js — READ it, never re-typed here.
const spreadM = (src.match(/var NIGHT_SPREAD_MIN_M\s*=\s*([0-9.]+)/) || [])[1];
const pickSrc = sliceFrom('function _nightPickNearest(');
const updSrc = sliceFrom('A._nightUpdateLights = function() {');

function V(x, y, z) { return { x, y, z }; }
function makeCtx(scn) {
  const pool = scn.fixtures.map((f, i) => Object.assign(V(f[0], f[1], f[2]), { __guid: 'F' + i }));
  const inFrustumSet = new Set(pool.filter(scn.inFrustum));
  const scene = { add() {}, remove() {} };
  const A = {
    _nightMode: true, _nightFixtures: pool, _nightBakePool: null,
    _maxqActive: !!scn.bake, _nightStillBoost: true, _stillRefineActive: !!scn.still,
    _nightMaxLights: scn.budget, _nightNearFadeFloor: 1, _nightPLScale: 1,
    _nightLights: [], scene,
    camera: {
      position: Object.assign(V(0, 0, 0), { distanceTo: () => 10 }),
      projectionMatrix: {}, matrixWorldInverse: {}, updateMatrixWorld() { this._refreshed = true; }
    },
    controls: { target: V(10, 0, 0) },
    _nightFixtureWorldPositions: () => pool,
    markDirty() {}
  };
  const THREE = {
    Frustum: function () {
      this.setFromProjectionMatrix = function () {};
      this.containsPoint = function (p) {
        for (const q of inFrustumSet) if (q.x === p.x && q.y === p.y && q.z === p.z) return true;
        return false;
      };
    },
    Matrix4: function () { this.multiplyMatrices = function () { return this; }; },
    Vector3: function (x, y, z) { return V(x, y, z); },
    PointLight: function () {
      this.intensity = 0; this.position = { copy() {} }; this.color = { set() {} };
      this.dispose = function () {};
    }
  };
  const sandbox = { A, THREE, console: { log() {} }, Set, Math,
    NIGHT_SPREAD_MIN_M: Number(spreadM),
    NIGHT_LIGHT_INTENSITY: 2.5, NIGHT_LIGHT_RANGE: 12, NIGHT_LIGHT_DECAY: 2 };
  vm.createContext(sandbox);
  vm.runInContext(pickSrc + '\nvar _ntuLastLine = null;\n' + updSrc + ';', sandbox);
  A._nightUpdateLights();
  return { A, pool, inFrustumN: inFrustumSet.size };
}

function grid(n) { const a = []; for (let i = 0; i < n; i++) a.push([i * 5, 0, 0]); return a; }
function litCount(A) {
  if (A._nightBakePool) return A._nightBakePool.filter(l => l.intensity > 0).length;
  return A._nightLights.length;
}

const SCENARIOS = [
  { name: 'bake-interior-frustum-short', fixtures: grid(40), budget: 50, bake: true, still: true,
    inFrustum: (p, i) => i < 3 },
  { name: 'bake-interior-frustum-empty', fixtures: grid(40), budget: 50, bake: true, still: true,
    inFrustum: () => false },
  { name: 'bake-wide-frustum-full', fixtures: grid(80), budget: 50, bake: true, still: true,
    inFrustum: (p, i) => i < 60 },
  { name: 'alt-s-frustum-short', fixtures: grid(40), budget: 50, bake: false, still: true,
    inFrustum: (p, i) => i < 2 },
  { name: 'nav-no-still', fixtures: grid(40), budget: 24, bake: false, still: false,
    inFrustum: () => false }
];

function population() {
  if (!pickSrc || !updSrc) return [];
  return SCENARIOS.map(scn => {
    const r = makeCtx(scn);
    return {
      scenario: scn.name,
      still: !!scn.still,
      fixtures: scn.fixtures.length,
      budget: scn.budget,
      inFrustum: r.inFrustumN,
      lit: litCount(r.A),
      refreshed: !!r.A.camera._refreshed
    };
  });
}

const schema = {
  type: 'object',
  required: ['scenario', 'still', 'fixtures', 'budget', 'inFrustum', 'lit', 'refreshed'],
  properties: {
    scenario: { type: 'string' }, still: { type: 'boolean' }, fixtures: { type: 'integer' },
    budget: { type: 'integer' }, inFrustum: { type: 'integer' }, lit: { type: 'integer' },
    refreshed: { type: 'boolean' }
  }
};

const w = Witness('BAKE_INTERIOR_TOPUP')
  .population(population)
  .schema(schema)
  // G1 — the defect itself: a still/bake pose whose frustum is SHORT of the budget must still be
  // lit to the budget (or to every fixture there is, whichever is smaller).
  .invariant('topup-fills-budget', rows => rows.filter(r => r.still && r.inFrustum < r.budget)
    .every(r => r.lit === Math.min(r.fixtures, r.budget)))
  // G2 — the user's exact symptom: frustum finds NO fixture centre, and the room is still lit.
  .invariant('empty-frustum-still-lit', rows => rows.filter(r => r.still && r.inFrustum === 0)
    .every(r => r.lit > 0))
  // G3 — the top-up must never TRUNCATE what the frustum genuinely found.
  .invariant('no-truncation', rows => rows.filter(r => r.still && r.inFrustum > r.budget)
    .every(r => r.lit >= r.inFrustum))
  // G4 — navigation is untouched by the extraction (§NIGHT_PICK_NEAREST called with empty `already`).
  .invariant('nav-unchanged', rows => rows.filter(r => !r.still)
    .every(r => r.lit === Math.min(r.fixtures, r.budget)))
  // G5 — §BAKE_FRUSTUM_STALE: the still/bake branch refreshes the camera matrix before culling.
  .invariant('frustum-matrix-refreshed', rows => rows.filter(r => r.still).every(r => r.refreshed))
  // RED — the pre-fix behaviour: the set is whatever the frustum found, no top-up.
  .redControl(rows => rows.map(r => Object.assign({}, r,
    r.still ? { lit: r.inFrustum, refreshed: false } : {})));

if (!pickSrc || !updSrc || spreadM === undefined) {
  console.log('§WITNESS_BAKE_INTERIOR_TOPUP_VERDICT INCONCLUSIVE — could not slice ' +
    (!pickSrc ? '_nightPickNearest' : '_nightUpdateLights') + ' out of viewer/tools.js; nothing judged');
  process.exit(1);
}
const res = w.run();
const rows = population();
rows.forEach(r => console.log('§BAKE_INTERIOR_TOPUP_ROW ' + r.scenario + ' fixtures=' + r.fixtures +
  ' budget=' + r.budget + ' inFrustum=' + r.inFrustum + ' lit=' + r.lit + ' matrixRefreshed=' + r.refreshed));
const noop = rows.filter(r => r.still).every(r => r.lit === r.inFrustum);
console.log('§WITNESS_BAKE_INTERIOR_TOPUP_VERDICT ' +
  (rows.length === 0 ? 'VACUOUS — no scenario judged'
   : noop ? 'NO-OP — the top-up never changed a single selection; it is not in force'
   : res.fail === 0 ? 'PASS' : 'FAIL') +
  ' rows=' + rows.length + ' pass=' + res.pass + ' fail=' + res.fail);
process.exit(res.fail === 0 && rows.length > 0 && !noop ? 0 : 1);
