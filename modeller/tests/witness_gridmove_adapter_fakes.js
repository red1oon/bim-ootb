#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-GRIDMOVE-ADAPTER-FAKES: Tier 2 of prompts/GRID_KINEMATICS_SANDBOX_PROOF.md's sandbox
 * (§2 Tier 2 — "bonsai_gridmove.js adapter, hand-built fakes, no real browser, no real building"). Proves
 * elementData()'s TWO independent narrowings (prompts/GRID_SMART_ELEMENT_SCOPE.md §4 — class allowlist +
 * grab-locality) in total isolation from BOTH Tier 1's pure engine AND any real building: a hand-built fake
 * window.Bonsai.group() (fake mesh-like objects with known userData.featureId/bbox), a fake
 * window.Bonsai.oplog.db (a stub .exec() returning sql.js-shaped rows for a few hand-inserted GEOM_INSERT
 * ops carrying known ifc_class values), and a hand-set window.Bonsai.grid.xs/ys. Every expected fid list
 * below is worked out by hand in the comments BEFORE the assertion, not inferred from running the code once.
 *
 * FIXTURE (5 fake meshes, fids 1-5), draggedAxis='x' (an X-axis gridline grabbed) so elementData()'s locality
 * filter reads each mesh's Y-coordinate (bonsai_gridmove.js's own convention: for an x-axis drag, the
 * ORTHOGONAL coordinate is elem.y — see elementData()'s own comment on this line):
 *   fid=1  structural (recorded ifc_class='IfcWall'),            bbox y-center = 0        (== orthoAt)
 *   fid=2  FURNITURE  (recorded ifc_class='IfcFurnishingElement'), bbox y-center = 0       (== orthoAt — would
 *          pass locality; must be excluded by CLASS ALONE, isolating that filter from locality)
 *   fid=3  synthetic  (NO recorded ifc_class -- UNKNOWN, class-eligible per the "stays eligible" rule),
 *          bbox y-center = radius + 1           (fails locality; isolates locality filtering a class-unknown/
 *          eligible element)
 *   fid=4  structural (recorded ifc_class='IfcWallStandardCase'), bbox y-center = radius - 0.1  (just INSIDE
 *          the locality radius -- boundary correctness, near side)
 *   fid=5  structural (recorded ifc_class='IfcWallStandardCase'), bbox y-center = radius + 0.1  (just OUTSIDE
 *          the locality radius -- boundary correctness, far side; class-eligible but locality-excluded, same
 *          shape as fid=3 but proves a KNOWN-good class doesn't buy an exemption from locality)
 *
 * grid.ys = [0, 2, 6] -> gaps [2, 4], maxGap = 4 -> _localityRadius('x') MUST be EXACTLY 4 * 1.5 = 6.0
 * orthoAt = 0 (the grab point) -> fid=4 y-center = 6 - 0.1 = 5.9 (inside), fid=5 y-center = 6 + 0.1 = 6.1 (outside)
 *
 *   Q1 CLASS-MAP EXACT   — _buildClassByFid() returns EXACTLY the 3 recorded fids, no more/no less.
 *   Q2 LOCALITY-RADIUS EXACT — _localityRadius('x') === 6.0 exactly, from the one unambiguous max gap.
 *   Q3 CLASS-ALONE (no session) — elementData() with no drag session excludes ONLY fid=2 (furniture); the
 *                        rest (1,3,4,5) stay regardless of position (locality inactive when draggedAxis==null,
 *                        matching bonsai_gridmove.js's own documented behavior for non-session callers).
 *   Q4 COMBINED (class AND locality) — with a session active (draggedAxis='x', orthoAt=0), elementData()
 *                        returns EXACTLY {1,4} — fid=2 excluded by class, fid=3 and fid=5 excluded by
 *                        locality (fid=3 despite being class-UNKNOWN/eligible, fid=5 despite being a KNOWN
 *                        structural class), fid=4 included (inside radius, boundary case).
 */
'use strict';

global.window = global.window || {};

// ── Fake window.Bonsai.oplog.db — sql.js-shaped .exec() over 3 hand-inserted GEOM_INSERT rows ────────────
const INSERT_ROWS = [
  { id: 1, ifc_class: 'IfcWall' },
  { id: 2, ifc_class: 'IfcFurnishingElement' },
  { id: 4, ifc_class: 'IfcWallStandardCase' },
  // fid 3 and 5 intentionally have NO recorded row (unknown class).
];
const fakeDb = {
  exec(sql) {
    if (!/kernel_ops/.test(sql)) return [];
    return [{ columns: ['id', 'parameters'], values: INSERT_ROWS.map(r => [r.id, JSON.stringify({ ifc_class: r.ifc_class })]) }];
  }
};

// ── Fake window.Bonsai.group() — 5 fake mesh-like objects ─────────────────────────────────────────────
const RADIUS = 6.0; // = maxGap(4) * 1.5, hand-computed above from grid.ys=[0,2,6]
const Y_BY_FID = { 1: 0, 2: 0, 3: RADIUS + 1, 4: RADIUS - 0.1, 5: RADIUS + 0.1 };
function fakeMesh(fid) {
  const y = Y_BY_FID[fid];
  return {
    isMesh: true,
    userData: { featureId: fid },
    geometry: {
      computeBoundingBox() { /* no-op: boundingBox already set below, matches THREE's lazy-compute contract */ },
      boundingBox: { min: { x: 0, y: y, z: 0 }, max: { x: 1, y: y, z: 1 } } // x/z irrelevant here; y is the axis under test
    }
  };
}
window.Bonsai = {
  group() { return { children: [1, 2, 3, 4, 5].map(fakeMesh) }; },
  oplog: { db: fakeDb },
  grid: { xs: [0, 4, 8], ys: [0, 2, 6] } // ys gaps: 2-0=2, 6-2=4 -> maxGap=4 (unambiguous single max)
};

const path = require('path');
require(path.join(__dirname, '..', 'bonsai_gridmove.js'));
const GM = window.Bonsai.gridmove;

let pass = 0, fail = 0;
function chk(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name + (extra ? '  ' + extra : '')); }
  else { fail++; console.log('  ❌ ' + name + (extra ? '  ' + extra : '')); }
}
function sameSet(actual, expected) {
  const a = Array.from(actual).map(String).sort(), e = expected.map(String).sort();
  return a.length === e.length && a.every((v, i) => v === e[i]);
}

console.log('═══ W-GRIDMOVE-ADAPTER-FAKES — Tier 2: elementData() filters, hand-built fakes, no browser/building ═══');

// Q1 — class map exact
const classMap = GM._buildClassByFid();
chk('Q1 CLASS-MAP EXACT (only the 3 recorded fids, exact classes)',
  Object.keys(classMap).length === 3 && classMap[1] === 'IfcWall' && classMap[2] === 'IfcFurnishingElement' && classMap[4] === 'IfcWallStandardCase',
  JSON.stringify(classMap));

// Q2 — locality radius exact
const radius = GM._localityRadius('x');
chk('Q2 LOCALITY-RADIUS EXACT (maxGap=4 * 1.5 = 6.0)', radius === 6.0, 'radius=' + radius);

// Q3 — class filter alone (no drag session: _dragAxis stays null)
GM._dragAxis = null; GM._dragOrthoAt = null;
const q3fids = GM.elementData().map(e => e.guid);
chk('Q3 CLASS-ALONE (no session): excludes ONLY fid=2 (furniture)', sameSet(q3fids, [1, 3, 4, 5]), 'got=' + JSON.stringify(q3fids));

// Q4 — combined class + locality (session active: draggedAxis='x', orthoAt=0, matching beginDragSession's own
// field-setting contract — bonsai_gridmove.js:150-151 — without needing the full engine-building session start)
GM._dragAxis = 'x'; GM._dragOrthoAt = 0;
const q4fids = GM.elementData().map(e => e.guid);
chk('Q4 COMBINED (class AND locality): EXACTLY {1,4}', sameSet(q4fids, [1, 4]), 'got=' + JSON.stringify(q4fids));

console.log('W-GRIDMOVE-ADAPTER-FAKES: ' + pass + ' PASS / ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
