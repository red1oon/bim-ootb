// WITNESS — W-DUCT-SIL · §DUCT_SILHOUETTE
// Spec: bim-compiler prompts/PHOTOREAL_STILL_RENDER.md §DUCT_SILHOUETTE.
// Built on witness_kit/contract.js (CLAUDE.md Session Startup 7).
//
// ISSUE IT PROVES / DISPROVES ────────────────────────────────────────────────────────────────────
// §MEP_SMOOTH_NORMALS rewrites NORMALS at a 55 deg crease: it changes SHADING, not geometry. A
// faceted cylinder therefore shades smoothly while its OUTLINE stays an N-gon. The user reports
// exactly that asymmetry — "the roundness to jagged curves seems to work on lamps but certain
// large duct piping seems lacking" — and asks whether the detector is easy.
//
// This witness answers both halves numerically, on REAL shipped geometry read out of the building
// DBs, with no browser, no bake and no screenshot anywhere in the chain (CLAUDE.md PRIMAL LAW +
// FUNDAMENTAL LAW: the proof is a number computed from real object state, never a picture):
//
//   C1  the split is SIZE, not detection — the lamp class and the duct class are both detected as
//       curved, and separate only on projected chord deviation.
//   C2  LOAD-BEARING. Refinement must not move a non-curve surface. Every original vertex is
//       preserved to the bit, and every new vertex born on a HARD edge sits EXACTLY on the segment
//       between its endpoints (deviation identically 0, not "small"). This is the user's own
//       standing constraint on the sibling pass — "it must not impact non curve intending surfaces".
//   C3  the silhouette actually improves, RE-MEASURED on the output rather than predicted from the
//       formula that motivated the change.
//   C4  no T-junction / crack is introduced: a closed input stays closed.
//   C5  the pass can report NO-OP. Raise the gate out of reach and it must say NO-OP, refine
//       nothing, and leave geometry byte-identical.
//
// A verdict of PASS here means those five held on the population named in the summary line. If the
// population is empty the contract fails loudly (§W-EMPTY-POP) rather than reporting a green zero.
'use strict';
const path = require('path');
const fs = require('fs');
const { Witness } = require(path.join(__dirname, '..', '..', 'witness_kit', 'contract.js'));
const SIL = require(path.join(__dirname, '..', 'silhouette_refine.js'));

// ── real geometry, from the shipped building DBs ────────────────────────────────────────────────
const BUILDINGS_DIR = process.env.BUILDINGS_DIR || path.join(__dirname, '..', '..', 'buildings');
let Database = null;
for (const p of ['better-sqlite3', '/home/red1/bim-compiler/node_modules/better-sqlite3']) {
  try { Database = require(p); break; } catch (e) { /* try next */ }
}

// Every building present is judged. The list is a FILE-SYSTEM scan, not a hand-written fleet: a
// building that ships tomorrow is judged tomorrow without editing this witness, and none of the
// thresholds below can key on which building it is (user, 2026-09-02: "No custom code to any
// particular building has been our rule").
function discoverBuildings() {
  if (!Database || !fs.existsSync(BUILDINGS_DIR)) return [];
  return fs.readdirSync(BUILDINGS_DIR)
    .filter(f => /_extracted\.db$/.test(f))
    .map(f => ({ name: f.replace(/_extracted\.db$/, ''), main: path.join(BUILDINGS_DIR, f),
                 geo: path.join(BUILDINGS_DIR, f.replace('_extracted.db', '_geo.db')) }))
    .filter(b => { try { return fs.statSync(b.main).size > 1024 * 1024; } catch (e) { return false; } });
}

const MAX_GEOMS_PER_BUILDING = +(process.env.SIL_MAX_GEOMS || 4000);

function loadGeoms(b) {
  const out = [];
  let db;
  try { db = new Database(b.main, { readonly: true, fileMustExist: true }); } catch (e) { return out; }
  try {
    let table = 'component_geometries';
    const hasLocal = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='component_geometries'").get();
    if (!hasLocal) {
      if (!fs.existsSync(b.geo)) { db.close(); return out; }
      db.exec(`ATTACH DATABASE '${b.geo.replace(/'/g, "''")}' AS geo`);
      table = 'geo.component_geometries';
    }
    // class is carried for REPORTING only — nothing in the gate reads it.
    let cls = new Map();
    try {
      for (const r of db.prepare('SELECT ei.geometry_hash h, em.ifc_class c FROM element_instances ei ' +
                                 'LEFT JOIN elements_meta em ON em.guid = ei.guid').all()) {
        if (r.h && !cls.has(r.h)) cls.set(r.h, r.c || '');
      }
    } catch (e) { /* split DB without instances — class stays blank, gate unaffected */ }
    const rows = db.prepare(`SELECT geometry_hash h, vertices v, faces f FROM ${table} ` +
                            'WHERE vertices IS NOT NULL AND faces IS NOT NULL ' +
                            `LIMIT ${MAX_GEOMS_PER_BUILDING}`).all();
    for (const r of rows) {
      if (!r.v || !r.f || r.v.byteLength < 36 || r.f.byteLength < 12) continue;
      out.push({ building: b.name, hash: r.h, cls: cls.get(r.h) || '',
                 pos: new Float32Array(r.v.buffer, r.v.byteOffset, r.v.byteLength / 4),
                 idx: new Uint32Array(r.f.buffer, r.f.byteOffset, r.f.byteLength / 4) });
    }
  } catch (e) { /* fall through with whatever loaded */ }
  try { db.close(); } catch (e) {}
  return out;
}

// ── geometry helpers used by the CHECKS (deliberately independent of the code under test) ───────
const Q = v => Math.round(v * 1e4);
const wkey = (p, i) => Q(p[3 * i]) + '|' + Q(p[3 * i + 1]) + '|' + Q(p[3 * i + 2]);

// Edge census: how many welded edges carry 1 face (boundary) and how many carry 3+ (non-manifold).
// Uniform refinement must preserve BOTH structures exactly — every edge becomes two sub-edges with
// the same face count — so boundary doubles and non-manifold doubles, and neither may grow beyond
// that. Computed here in the witness, never read from the pass.
function edgeCensus(pos, idx) {
  const id = new Map(); const w = new Int32Array(pos.length / 3);
  for (let i = 0; i < pos.length / 3; i++) {
    const k = wkey(pos, i); let v = id.get(k); if (v === undefined) { v = id.size; id.set(k, v); } w[i] = v;
  }
  const cnt = new Map();
  for (let t = 0; t < idx.length / 3; t++) {
    for (let e = 0; e < 3; e++) {
      const a = w[idx[3 * t + e]], b = w[idx[3 * t + (e + 1) % 3]];
      const k = a < b ? a + '_' + b : b + '_' + a;
      cnt.set(k, (cnt.get(k) || 0) + 1);
    }
  }
  let boundary = 0, nonManifold = 0;
  cnt.forEach(c => { if (c === 1) boundary++; else if (c > 2) nonManifold++; });
  return { boundary, nonManifold, edges: cnt.size, verts: id.size, tris: idx.length / 3 };
}

// DIRECT crack test — the one that actually caught the first implementation. A T-junction is a
// vertex sitting strictly inside another triangle's edge; the edge-count census above missed 875
// of them on one Hospital element because that mesh was already non-manifold. Measured BEFORE and
// AFTER, so an input that already had them is not blamed on the pass.
function tJunctions(pos, idx, cap) {
  const uniq = new Map();
  for (let i = 0; i < pos.length / 3; i++) {
    const k = wkey(pos, i);
    if (!uniq.has(k)) uniq.set(k, [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]]);
  }
  const verts = [...uniq.values()];
  if (verts.length > (cap || 4000)) return -1;          // -1 = not judged, never silently 0
  const seen = new Set(); let hits = 0;
  for (let t = 0; t < idx.length / 3; t++) {
    for (let e = 0; e < 3; e++) {
      const ia = idx[3 * t + e], ib = idx[3 * t + (e + 1) % 3];
      const ka = wkey(pos, ia), kb = wkey(pos, ib);
      const key = ka < kb ? ka + '#' + kb : kb + '#' + ka;
      if (seen.has(key)) continue;
      seen.add(key);
      const A = [pos[3 * ia], pos[3 * ia + 1], pos[3 * ia + 2]];
      const B = [pos[3 * ib], pos[3 * ib + 1], pos[3 * ib + 2]];
      const vx = B[0] - A[0], vy = B[1] - A[1], vz = B[2] - A[2];
      const L2 = vx * vx + vy * vy + vz * vz;
      if (L2 < 1e-18) continue;
      for (const V of verts) {
        let tt = ((V[0] - A[0]) * vx + (V[1] - A[1]) * vy + (V[2] - A[2]) * vz) / L2;
        if (tt <= 0.001 || tt >= 0.999) continue;
        const d = Math.hypot(V[0] - (A[0] + tt * vx), V[1] - (A[1] + tt * vy), V[2] - (A[2] + tt * vz));
        if (d < 1e-5) hits++;
      }
    }
  }
  return hits;
}

// distance of point m from the SEGMENT ab. Used for C2: a midpoint on a hard edge must be exactly
// on the edge, so this must be identically 0 (to float precision), never merely small.
function distFromSegment(m, a, b) {
  const vx = b[0] - a[0], vy = b[1] - a[1], vz = b[2] - a[2];
  const L2 = vx * vx + vy * vy + vz * vz;
  if (L2 < 1e-20) return Math.hypot(m[0] - a[0], m[1] - a[1], m[2] - a[2]);
  let t = ((m[0] - a[0]) * vx + (m[1] - a[1]) * vy + (m[2] - a[2]) * vz) / L2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(m[0] - (a[0] + t * vx), m[1] - (a[1] + t * vy), m[2] - (a[2] + t * vz));
}

// Independent re-derivation of the hard/smooth edge split, so C2 does not simply trust the pass's
// own classification of which midpoints it was allowed to move.
function hardEdgeMidpoints(pos, idx) {
  const nT = idx.length / 3, id = new Map(), w = new Int32Array(pos.length / 3);
  const rep = new Map();
  for (let i = 0; i < pos.length / 3; i++) {
    const k = wkey(pos, i);
    let v = id.get(k);
    if (v === undefined) { v = id.size; id.set(k, v); rep.set(v, [pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]]); }
    w[i] = v;
  }
  const fn = [];
  for (let t = 0; t < nT; t++) {
    const a = idx[3 * t], b = idx[3 * t + 1], c = idx[3 * t + 2];
    const ax = pos[3 * a], ay = pos[3 * a + 1], az = pos[3 * a + 2];
    const ux = pos[3 * b] - ax, uy = pos[3 * b + 1] - ay, uz = pos[3 * b + 2] - az;
    const vx = pos[3 * c] - ax, vy = pos[3 * c + 1] - ay, vz = pos[3 * c + 2] - az;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const L = Math.hypot(nx, ny, nz) || 1; fn.push([nx / L, ny / L, nz / L]);
  }
  const em = new Map();
  for (let t = 0; t < nT; t++) for (let e = 0; e < 3; e++) {
    const ia = idx[3 * t + e], ib = idx[3 * t + (e + 1) % 3];
    const a = w[ia], b = w[ib], k = a < b ? a + '_' + b : b + '_' + a;
    let arr = em.get(k); if (!arr) { arr = []; em.set(k, arr); }
    arr.push({ t, ia, ib, wa: a, wb: b });
  }
  const cosCrease = Math.cos(SIL.CREASE_DEG * Math.PI / 180);
  const cosThMin = Math.cos(2 * Math.PI / 180);
  const hard = [];
  em.forEach(arr => {
    if (arr.length !== 2) return;
    const n1 = fn[arr[0].t], n2 = fn[arr[1].t];
    let d = n1[0] * n2[0] + n1[1] * n2[1] + n1[2] * n2[2];
    d = Math.max(-1, Math.min(1, d));
    const isSmooth = (d >= cosCrease && d <= cosThMin);
    if (isSmooth) return;                      // smooth: the pass IS allowed to curve this one
    // Endpoints are the WELDED REPRESENTATIVES (first copy of each welded position), not this
    // triangle's own copies: copies that weld together can differ by up to the 0.1 mm quantum, so
    // taking one triangle's pair would place the expected midpoint in a different quantisation
    // cell from the emitted one and report a phantom miss. This fixes WHICH POINT is named; the
    // load-bearing claim — that the point lies ON the segment — is still computed independently.
    hard.push({ a: rep.get(arr[0].wa), b: rep.get(arr[0].wb) });
  });
  return hard;
}

// ── build the population: one row per geometry that the pass actually refined ───────────────────
const buildings = discoverBuildings();
const rows = [];
const perBuilding = new Map();
let consideredAll = 0, measuredAll = 0;

for (const b of buildings) {
  const geoms = loadGeoms(b);
  if (!geoms.length) continue;
  SIL.resetStats();
  const bStat = { name: b.name, considered: 0, measured: 0, refined: 0,
                  sBefore: 0, sAfter: 0, addedVerts: 0, vertsBefore: 0, byClass: new Map() };
  for (const g of geoms) {
    bStat.considered++; consideredAll++;
    const m = SIL.silMeasure(g.pos, g.idx);
    if (m) {
      bStat.measured++; measuredAll++;
      if (g.cls) {
        let c = bStat.byClass.get(g.cls);
        if (!c) { c = { n: 0, maxD1px: 0, sumS: 0 }; bStat.byClass.set(g.cls, c); }
        c.n++; c.sumS += m.sMedian; if (m.D1px > c.maxD1px) c.maxD1px = m.D1px;
      }
    }
    const r = SIL.silRefine(g.pos, g.idx, null, {});
    if (!r) continue;

    // ---- everything below is MEASURED ON THE OUTPUT, not predicted ----
    // C3: re-run the same estimator on the refined mesh and read its real residual sag.
    const after = SIL.silMeasure(r.position, r.index);

    // C2a: every original vertex position still present, bit-exact.
    const outSet = new Set();
    for (let i = 0; i < r.position.length / 3; i++) outSet.add(wkey(r.position, i));
    let missing = 0;
    const inSet = new Set();
    for (let i = 0; i < g.pos.length / 3; i++) inSet.add(wkey(g.pos, i));
    inSet.forEach(k => { if (!outSet.has(k)) missing++; });

    // C2b — LOAD-BEARING. Every HARD original edge must have been split at its EXACT linear
    // midpoint, which lies ON the edge, so the facet is geometrically untouched. The hard/smooth
    // split is re-derived here from the raw mesh; the pass's own classification is not consulted.
    // Vertices are matched by exact welded key, NOT by proximity: an earlier revision of this
    // witness scanned every output vertex within 0.5 mm of the midpoint and so charged a
    // neighbouring SMOOTH vertex's legitimate displacement against the hard edge, failing C2 on
    // all 37 rows for a reason that was in the witness, not the code.
    const hard = hardEdgeMidpoints(g.pos, g.idx);
    // ALL occupants of each 0.1 mm weld cell, not just the first. A cell can legitimately hold
    // several distinct vertices (MEASURED: 7 in one Hospital cell), and an earlier revision of this
    // witness took whichever landed there first — so it charged a NEIGHBOURING edge's vertex
    // against the hard edge under test and reported a 0.042 mm displacement that never happened.
    const outByKey = new Map();
    for (let i = 0; i < r.position.length / 3; i++) {
      const k = wkey(r.position, i);
      let a = outByKey.get(k); if (!a) { a = []; outByKey.set(k, a); }
      a.push([r.position[3 * i], r.position[3 * i + 1], r.position[3 * i + 2]]);
    }
    let worstHardDev = 0, worstHardUlp = 0, hardChecked = 0, hardMissing = 0;
    for (const h of hard) {
      // fround because the pass STORES into a Float32Array: the float64 midpoint and its float32
      // image can land either side of a 0.1 mm quantisation boundary, which reported 7 phantom
      // "missing" midpoints out of 37 rows. This aligns the precision, not the arithmetic.
      const mid = [Math.fround((h.a[0] + h.b[0]) / 2),
                   Math.fround((h.a[1] + h.b[1]) / 2),
                   Math.fround((h.a[2] + h.b[2]) / 2)];
      const mk = Q(mid[0]) + '|' + Q(mid[1]) + '|' + Q(mid[2]);
      const cell = outByKey.get(mk);
      if (!cell || !cell.length) { hardMissing++; continue; }  // uniform refinement always emits it
      // identify WHICH occupant is this edge's midpoint: the nearest one to the expected position.
      let got = cell[0], best = Infinity;
      for (const c of cell) {
        const dd = Math.hypot(c[0] - mid[0], c[1] - mid[1], c[2] - mid[2]);
        if (dd < best) { best = dd; got = c; }
      }
      hardChecked++;
      const dv = distFromSegment(got, h.a, h.b);
      // Expressed in float32 ULPs at this edge's own coordinate magnitude, because that is the
      // FLOOR of what can be measured at all: positions are stored in a Float32Array, whose ULP at
      // a 35 m coordinate is 35 * 2^-23 = 4.2 microns. A real displacement by this pass would be
      // the sagitta — MILLIMETRES, ~1000x above that floor — so "within a few ULP" and "displaced"
      // are never confusable. Reporting an absolute micron figure instead would be measuring
      // float32, not the code.
      const mag = Math.max(Math.abs(h.a[0]), Math.abs(h.a[1]), Math.abs(h.a[2]),
                           Math.abs(h.b[0]), Math.abs(h.b[1]), Math.abs(h.b[2]), 1);
      const ulp = mag * Math.pow(2, -23);
      const dvUlp = dv / ulp;
      if (dvUlp > worstHardUlp) worstHardUlp = dvUlp;
      if (dv > worstHardDev) worstHardDev = dv;
    }

    // C4: structure preserved + no NEW crack.
    const cBefore = edgeCensus(g.pos, g.idx);
    const cAfter = edgeCensus(r.position, r.index);
    const tjBefore = tJunctions(g.pos, g.idx);
    const tjAfter = tJunctions(r.position, r.index);

    bStat.refined++;
    bStat.sBefore += r.measure.sMedian;
    bStat.sAfter += after ? after.sMedian : r.measure.sMedian;
    bStat.addedVerts += (r.triAfter - r.triBefore) * 3;
    bStat.vertsBefore += g.pos.length / 3;

    rows.push({
      building: b.name,
      ifcClass: g.cls || '(none)',
      segCountBefore: +r.measure.N.toFixed(2),
      radiusMm: +(r.measure.R * 1000).toFixed(2),
      sagittaBeforeMm: +(r.measure.sMedian * 1000).toFixed(4),
      sagittaAfterMm: +((after ? after.sMedian : r.measure.sMedian) * 1000).toFixed(4),
      d1pxBeforeM: +r.measure.D1px.toFixed(3),
      d1pxAfterM: +((after ? after.D1px : r.measure.D1px)).toFixed(3),
      triBefore: r.triBefore,
      triAfter: r.triAfter,
      originalVertsMissing: missing,
      hardEdgesChecked: hardChecked,
      hardEdgeMidpointsMissing: hardMissing,
      worstHardEdgeDeviationMm: +(worstHardDev * 1000).toFixed(9),
      worstHardEdgeDeviationUlp: +worstHardUlp.toFixed(3),
      boundaryEdgesBefore: cBefore.boundary,
      boundaryEdgesAfter: cAfter.boundary,
      edgesBefore: cBefore.edges,
      edgesAfter: cAfter.edges,
      nonManifoldBefore: cBefore.nonManifold,
      nonManifoldAfter: cAfter.nonManifold,
      // Uniform 1-to-4 identity: V' = V + E, E' = 2E + 3T, T' = 4T. It holds EXACTLY unless the
      // source mesh carries two vertices closer together than the 0.1 mm weld quantum, in which
      // case two midpoints share a cell and the identity legitimately runs short. That deficit is
      // MEASURED per element and named, so C4a can say which rows it did not judge instead of
      // passing over them silently (CLAUDE.md PRIMAL LAW clause 4: scope-blind is a defect).
      weldCollisions: (cBefore.verts + cBefore.edges) - cAfter.verts,
      identityJudged: ((cBefore.verts + cBefore.edges) - cAfter.verts) === 0,
      tJunctionsBefore: tjBefore,
      tJunctionsAfter: tjAfter
    });
  }
  perBuilding.set(b.name, bStat);
}

// ── §-log: the primary evidence, printed before any verdict (CLAUDE.md PRIMAL LAW clause 3) ─────
console.log(`§SIL_FLEET buildings=${buildings.length} geometriesConsidered=${consideredAll} ` +
            `curveMeasured=${measuredAll} refined=${rows.length} gateM=${SIL.GATE_M} ` +
            `alpha=${SIL.ALPHA} kPxPerRad=${SIL.K.toFixed(1)} creaseDeg=${SIL.CREASE_DEG}`);
for (const [, s] of perBuilding) {
  const ratio = s.sAfter > 0 ? (s.sBefore / s.sAfter) : 0;
  console.log(`§SIL_BUILDING ${s.name} considered=${s.considered} curveMeasured=${s.measured} ` +
              `refined=${s.refined} meanSagittaMm=${s.refined ? (s.sBefore / s.refined * 1000).toFixed(3) : 'n/a'}` +
              `->${s.refined ? (s.sAfter / s.refined * 1000).toFixed(3) : 'n/a'} ` +
              `(${s.refined ? ratio.toFixed(2) + 'x' : 'NO-OP'}) addedVerts=${s.addedVerts} ` +
              `vertsOfRefined=${s.vertsBefore}` +
              (s.refined === 0 ? '  NO-OP — nothing qualified in this building' : ''));
  // C1 evidence: the lamp-vs-duct separation, by measurement, for whatever classes this DB carries.
  const interesting = [...s.byClass.entries()]
    .filter(([c]) => /LightFixture|DuctSegment|DuctFitting|FlowSegment|FlowTerminal|PipeSegment/.test(c))
    .sort((a, b2) => b2[1].maxD1px - a[1].maxD1px);
  for (const [c, v] of interesting) {
    console.log(`  §SIL_CLASS ${s.name} ${c} curveGeoms=${v.n} meanSagittaMm=${(v.sumS / v.n * 1000).toFixed(3)} maxD_1px=${v.maxD1px.toFixed(2)}m`);
  }
}

// C5 — NO-OP reporting, exercised for real: same population, gate raised out of reach.
let noopRefined = 0, noopChanged = 0;
if (buildings.length) {
  const g0 = loadGeoms(buildings[0]).slice(0, 400);
  for (const g of g0) {
    const r = SIL.silRefine(g.pos, g.idx, null, { gateM: 1e9 });
    if (r) { noopRefined++; if (r.position.length !== g.pos.length) noopChanged++; }
  }
}
console.log(`§SIL_NOOP gateM=1e9 judged=${buildings.length ? 400 : 0} refined=${noopRefined} ` +
            `geometryChanged=${noopChanged}` +
            (noopRefined === 0 ? '  NO-OP — correctly refused every element at an unreachable gate' : '  WRONG'));

// ── the contract ────────────────────────────────────────────────────────────────────────────────
Witness('DUCT_SIL')
  .population(() => rows)
  .schema({
    type: 'object',
    required: ['building', 'segCountBefore', 'radiusMm', 'sagittaBeforeMm', 'sagittaAfterMm',
               'd1pxBeforeM', 'triBefore', 'triAfter', 'originalVertsMissing',
               'worstHardEdgeDeviationMm', 'boundaryEdgesBefore', 'boundaryEdgesAfter',
               'nonManifoldBefore', 'nonManifoldAfter', 'tJunctionsBefore', 'tJunctionsAfter'],
    properties: {
      building: { type: 'string', minLength: 1 },
      ifcClass: { type: 'string' },
      segCountBefore: { type: 'number', minimum: 2 },
      radiusMm: { type: 'number', exclusiveMinimum: 0 },
      sagittaBeforeMm: { type: 'number', exclusiveMinimum: 0 },
      sagittaAfterMm: { type: 'number', minimum: 0 },
      // the gate is the definition of the population: nothing below it may be in here
      d1pxBeforeM: { type: 'number', minimum: 5 },
      d1pxAfterM: { type: 'number', minimum: 0 },
      triBefore: { type: 'integer', minimum: 4 },
      triAfter: { type: 'integer', minimum: 4 },
      originalVertsMissing: { type: 'integer', maximum: 0 },
      hardEdgeMidpointsMissing: { type: 'integer', maximum: 0 },
      // 4 float32 ULP at the edge's own coordinate magnitude — i.e. indistinguishable from zero
      // in the format the positions are stored in. The red control below sets 120 ULP and is
      // caught, so this bound still separates "unmoved" from "moved" by a wide margin.
      worstHardEdgeDeviationUlp: { type: 'number', maximum: 4 },
      worstHardEdgeDeviationMm: { type: 'number', maximum: 0.01 },
      boundaryEdgesBefore: { type: 'integer', minimum: 0 },
      boundaryEdgesAfter: { type: 'integer', minimum: 0 },
      nonManifoldBefore: { type: 'integer', minimum: 0 },
      nonManifoldAfter: { type: 'integer', minimum: 0 },
      tJunctionsBefore: { type: 'integer', minimum: -1 },
      tJunctionsAfter: { type: 'integer', minimum: -1 }
    }
  })
  // C2 — LOAD-BEARING. No original vertex lost; every hard edge split at its exact linear
  // midpoint, so every flat facet occupies the same plane, outline and area it did before.
  .invariant('C2 non-curve surfaces unmoved (0 original verts lost, every hard-edge midpoint ' +
             'within 4 float32 ULP of its own edge)',
    rs => rs.every(r => r.originalVertsMissing === 0 && r.hardEdgeMidpointsMissing === 0 &&
                        r.worstHardEdgeDeviationUlp <= 4))
  // C3 — the silhouette measurably improves, re-measured on the OUTPUT. Theory says 4x; the gate
  // is 3.5x so a real regression is caught while normal per-element scatter is not flagged.
  .invariant('C3 silhouette sagitta improves >=3.5x fleet-wide (re-measured on the refined mesh)',
    rs => {
      const b = rs.reduce((a, r) => a + r.sagittaBeforeMm, 0);
      const a2 = rs.reduce((a, r) => a + r.sagittaAfterMm, 0);
      return a2 > 0 && (b / a2) >= 3.5;
    })
  .invariant('C3b every refined element got strictly rounder (no element regressed)',
    rs => rs.every(r => r.sagittaAfterMm < r.sagittaBeforeMm))
  // C4 — refinement introduces no crack. Uniform 1-to-4 turns every edge into two sub-edges with
  // the same face count, so boundary and non-manifold structure must EXACTLY double and never more
  // (0 stays 0). Plus a direct point-on-edge scan: no T-junction the input did not already have.
  // This is the claim that caught the first implementation (24 -> 211 non-manifold, 875 new
  // T-junctions); it is not decoration.
  .invariant('C4a uniform-refinement identity holds exactly on every weld-injective element ' +
             '(V\'=V+E, E\'=2E+3T, T\'=4T, boundary and non-manifold structure exactly doubled)',
    rs => {
      const judged = rs.filter(r => r.identityJudged);
      if (judged.length === 0) { console.log('    INCONCLUSIVE — 0 weld-injective elements to judge'); return false; }
      return judged.every(r => r.triAfter === 4 * r.triBefore &&
                               r.edgesAfter === 2 * r.edgesBefore + 3 * r.triBefore &&
                               r.boundaryEdgesAfter === 2 * r.boundaryEdgesBefore &&
                               r.nonManifoldAfter === 2 * r.nonManifoldBefore);
    })
  // C4b — the DIRECT geometric crack test, deliberately scoped to the only population where it can
  // decide. The scan calls any vertex within 0.01 mm of another edge's interior a T-junction, so on
  // a mesh that ALREADY has such coincidences the count grows with tessellation density whether or
  // not the pass opened anything (MEASURED: Terminal 003ad5a1 goes 8 -> 114, and its combinatorial
  // structure is nonetheless exactly preserved — C4a passes on it). Judging those rows would be
  // measuring the source mesh, not this change. So the claim is made ONLY on elements that enter
  // clean, where 0 -> 0 is unambiguous, and the judged count is printed rather than assumed
  // non-empty (CLAUDE.md PRIMAL LAW clause 4: vacuous must read INCONCLUSIVE, never PASS).
  .invariant('C4b clean-in stays clean-out (direct point-on-edge scan on tJunctionsBefore==0 rows)',
    rs => {
      const judged = rs.filter(r => r.tJunctionsBefore === 0 && r.tJunctionsAfter >= 0);
      console.log(`    C4b population: ${judged.length} clean-input elements judged of ${rs.length} ` +
                  `(${rs.filter(r => r.tJunctionsBefore > 0).length} entered with coincidences, ` +
                  `${rs.filter(r => r.tJunctionsAfter < 0).length} exceeded the scan cap)`);
      if (judged.length === 0) { console.log('    INCONCLUSIVE — no clean-input element to judge'); return false; }
      return judged.every(r => r.tJunctionsAfter === 0);
    })
  // C5 — the pass can decline. Proven above against the real population at an unreachable gate.
  .invariant('C5 reports NO-OP at an unreachable gate (refined 0, geometry untouched)',
    () => noopRefined === 0 && noopChanged === 0)
  // Triangle growth must stay bounded — a runaway refinement is a memory regression, not a fix.
  .invariant('C6 triangle growth is exactly 4x per element, never more',
    rs => rs.every(r => r.triAfter === r.triBefore * 4))
  // RED CONTROL — moves a hard-edge midpoint off its edge and flattens the improvement. If the
  // witness still passes with this, it is not measuring what it claims to measure.
  .redControl(rs => rs.map(r => Object.assign({}, r, {
    worstHardEdgeDeviationMm: 0.5,
    worstHardEdgeDeviationUlp: 120,
    tJunctionsAfter: (r.tJunctionsBefore > 0 ? r.tJunctionsBefore : 1) * 9,
    nonManifoldAfter: r.nonManifoldBefore * 7 + 5,
    edgesAfter: r.edgesAfter * 3 + 11,
    identityJudged: true,
    sagittaAfterMm: r.sagittaBeforeMm
  })))
  .run();
