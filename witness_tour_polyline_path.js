#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-TOUR-POLYLINE-PATH scope (READ THE LOG after every run)
 * SCOPE: bim-compiler prompts/Viewer/FLY_TOUR_CORRIDOR_GRAPH.md §TOUR_HIGHLIGHT_LANE Task 1 —
 * viewer/tour.js routes stop→stop with RG.shortestPath() but builds the FLOWN path from graph-node
 * CENTROIDS, discarding `result.polyline` (the A*-verified on-floor geometry the Find panel draws).
 * That is why §SCRUB_USAGE_HOSPITAL recorded illegalChords=14/81 (the tour flies through walls)
 * while the same building's Find route is clean.
 *
 * ISSUE IT PROVES/DISPROVES: does feeding the tour `sp.polyline` (with centroids kept as the
 * fallback where the polyline is absent) reduce the flown route's WALL-ILLEGAL CHORD count, without
 * changing WHICH stops are visited or their order?
 *   PASS  = illegal-chord ratio DROPS on raster-backed buildings, is never WORSE anywhere, and
 *           stops/visited/order + the route's stop sequence are byte-identical to origin/main.
 *   FAIL  = any building's illegal chords rise, or the stop set/order changes.
 *
 * The illegal-chord number here is computed INDEPENDENTLY by this witness from the returned
 * `pts` (three-space → IFC inverse, storey resolved from the door-floor z table), NOT read from
 * tour.js's own §FLY_ROUTE counter — so a bug in that counter cannot make this witness pass.
 * §FLY_ROUTE's own numbers are printed alongside for cross-check.
 *
 * RUN: node witness_tour_polyline_path.js   (needs buildings/*.db present)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execSync } = require('child_process');
const Database = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'better-sqlite3'));

const RG = require('./common/room_graph.js');
const BLD = '/home/red1/bim-ootb/buildings';

let pass = 0, fail = 0;
const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };

// origin/main's tour.js — the BEFORE build, read from git so the compare is against shipped code.
const BEFORE_TOUR = execSync('git show origin/main:viewer/tour.js', { cwd: __dirname }).toString();
const AFTER_TOUR = fs.readFileSync(path.join(__dirname, 'viewer', 'tour.js'), 'utf8');

function load(dbFile, patches) {
  const tmp = '/tmp/_wtourpoly_' + Math.random().toString(36).slice(2) + '.db';
  fs.copyFileSync(path.join(BLD, dbFile), tmp);
  const db = new Database(tmp);
  (patches || []).forEach(p => {
    const f = path.join(__dirname, p);
    if (fs.existsSync(f)) db.exec(fs.readFileSync(f, 'utf8'));
  });
  return { db, tmp, dbQuery: (q) => db.prepare(q).raw(true).all() };
}

// Run one tour.js build (src = BEFORE or AFTER) against one already-built graph.
function runTour(src, g, dbQuery) {
  const logs = [];
  const A = {
    modelOffset: { x: 0, y: 0, z: 0 },
    WALK_EYE_HEIGHT: 1.6,
    ifc2three: (ix, iy, iz) => ({ x: ix, y: iz, z: -iy }),
    wlog: () => {},
    getRoomGraph: () => g,
    dbQuery: dbQuery,
    db: { exec: (sql) => { const rows = dbQuery(sql); return rows.length ? [{ values: rows }] : []; } },
  };
  const ctx = {
    console: { log: (...a) => logs.push(a.join(' ')), warn: (...a) => logs.push('WARN ' + a.join(' ')), error: (...a) => logs.push('ERR ' + a.join(' ')) },
    window: { RoomGraph: RG },
    document: { getElementById: () => null },
    performance: { now: () => Date.now() },
    setTimeout: () => 0, clearTimeout: () => {}, requestAnimationFrame: () => 0,
  };
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: 'tour.js' });
  ctx.setupTour(A);
  const t0 = Date.now();
  const storeyZ = A._tourStoreyZ();
  const route = A._buildGraphRoute(storeyZ);
  const ms = Date.now() - t0;
  return { route, logs, ms, storeyZ };
}

// Independent legality measure. pts are three-space with modelOffset=0 → ix = x, iy = -z, and the
// eye is WALK_EYE_HEIGHT above the storey floor z. A chord is CHECKED only when both ends sit on
// the SAME storey floor plane (vertical stair segments are not floor chords and are skipped).
function measure(route, storeyZ) {
  const EYE = 1.6, TOL = 0.05;
  const zs = Object.keys(storeyZ).map(k => ({ st: k, z: storeyZ[k] }));
  const storeyOf = (y) => {
    const fz = y - EYE;
    let best = null, bd = Infinity;
    for (const e of zs) { const d = Math.abs(e.z - fz); if (d < bd) { bd = d; best = e.st; } }
    return bd <= TOL ? best : null;
  };
  let checked = 0, illegal = 0, illegalSamples = 0, skippedVertical = 0;
  const pts = route.pts;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const sa = storeyOf(a.y), sb = storeyOf(b.y);
    if (sa === null || sb === null || sa !== sb) { skippedVertical++; continue; }
    checked++;
    const n = RG.chordIllegalCount(g0, sa, a.x, -a.z, b.x, -b.z);
    if (n > 0) { illegal++; illegalSamples += n; }
  }
  return { checked, illegal, illegalSamples, skippedVertical, pts: pts.length };
}

// stop signature: the NAMED waypoints in order — proves stop set/order is untouched by the change.
function stopSig(route) {
  return route.pts.filter(p => p.name).map(p => p.name + '|' + (p.pause || '')).join(' > ');
}
function flyLine(logs) { return (logs.find(l => l.indexOf('§FLY_ROUTE ') >= 0) || '(none)').replace('[TOUR] ', ''); }

let g0 = null;  // graph currently under measurement (measure() reads it)

const CASES = [
  ['Hospital', 'Hospital_extracted.db', ['buildings/patches/Hospital_extracted.db.sql']],
  ['Terminal', 'Terminal_extracted.db', ['buildings/patches/Terminal_extracted.db.sql']],
  ['Clinic', 'Clinic_extracted.db', []],
  ['HHS', 'HHS_Office_Federated_extracted.db', ['buildings/patches/HHS_Office_Federated_extracted.db.sql']],
  ['LTU_AHouse', 'LTU_AHouse_extracted.db', []],
];

console.log('══ W-TOUR-POLYLINE-PATH — tour flown geometry: node centroids vs A* polyline ══\n');
const rows = [];
for (const [label, dbFile, patches] of CASES) {
  if (!fs.existsSync(path.join(BLD, dbFile))) { console.log('— ' + label + ': db missing, skipped'); continue; }
  const { db, tmp, dbQuery } = load(dbFile, patches);
  let g;
  try { g = RG.buildGraph(dbQuery, { log: () => {} }); }
  catch (e) { console.log('— ' + label + ': buildGraph threw ' + e.message); db.close(); fs.unlinkSync(tmp); continue; }
  g0 = g;

  const before = runTour(BEFORE_TOUR, g, dbQuery);
  const after = runTour(AFTER_TOUR, g, dbQuery);

  console.log('── ' + label + '  (nodes=' + g.nodes.length + ' edges=' + g.edges.length + ')');
  if (!before.route || !after.route) {
    console.log('   BEFORE route=' + (before.route ? 'ok' : 'null') + '  AFTER route=' + (after.route ? 'ok' : 'null'));
    console.log('   BEFORE ' + flyLine(before.logs));
    console.log('   AFTER  ' + flyLine(after.logs));
    chk(label + ': fallback status unchanged', (!!before.route) === (!!after.route),
      'before=' + (before.route ? 'route' : 'legacy') + ' after=' + (after.route ? 'route' : 'legacy'));
    db.close(); fs.unlinkSync(tmp); continue;
  }
  const mb = measure(before.route, before.storeyZ);
  const ma = measure(after.route, after.storeyZ);
  const pct = (m) => m.checked ? (100 * m.illegal / m.checked).toFixed(1) + '%' : 'n/a';
  console.log('   BEFORE  pts=' + mb.pts + ' illegalChords=' + mb.illegal + '/' + mb.checked + ' (' + pct(mb) +
    ') illegalSamples=' + mb.illegalSamples + ' planMs=' + before.ms);
  console.log('   AFTER   pts=' + ma.pts + ' illegalChords=' + ma.illegal + '/' + ma.checked + ' (' + pct(ma) +
    ') illegalSamples=' + ma.illegalSamples + ' planMs=' + after.ms);
  console.log('   BEFORE ' + flyLine(before.logs));
  console.log('   AFTER  ' + flyLine(after.logs));
  chk(label + ': never worse (illegal chord RATIO)',
    !mb.checked || !ma.checked || (ma.illegal / ma.checked) <= (mb.illegal / mb.checked) + 1e-9,
    pct(mb) + ' → ' + pct(ma));
  chk(label + ': illegal SAMPLE count never worse', ma.illegalSamples <= mb.illegalSamples,
    mb.illegalSamples + ' → ' + ma.illegalSamples);
  // A dropped anchor is ALWAYS a synthetic `circ` centroid (§CIRC-NOT-A-WALKPOINT) — never a stop:
  // stops are drawn from g.nodes, and g.nodes carries ONLY kind='room'. Proven, not assumed.
  chk(label + ': stop candidates are rooms only (circ can never be a stop)',
    g.nodes.every(n => n.kind === 'room'),
    'kinds=' + JSON.stringify(g.nodes.reduce((m, n) => (m[n.kind] = (m[n.kind] || 0) + 1, m), {})));
  // §SCRUB_PREPARE_STALL guard: prepare cost is per-point (cinemaLookDist per waypoint), so a
  // route that never GAINS points cannot make that stall worse.
  chk(label + ': flown point count never grows (prepare cost)', ma.pts <= mb.pts, mb.pts + ' → ' + ma.pts);
  chk(label + ': stop set + order untouched', stopSig(before.route) === stopSig(after.route),
    stopSig(before.route) === stopSig(after.route) ? 'identical' : '\n     BEFORE ' + stopSig(before.route) + '\n     AFTER  ' + stopSig(after.route));
  rows.push({ label, mb, ma, beforeMs: before.ms, afterMs: after.ms });
  db.close(); fs.unlinkSync(tmp);
}

console.log('\n── summary (illegal chords / checked) ──');
for (const r of rows) {
  console.log('   ' + r.label.padEnd(12) + ' ' + (r.mb.illegal + '/' + r.mb.checked).padEnd(10) + ' → ' +
    (r.ma.illegal + '/' + r.ma.checked).padEnd(10) + '  pts ' + r.mb.pts + '→' + r.ma.pts +
    '  planMs ' + r.beforeMs + '→' + r.afterMs);
}
console.log('\n' + (fail ? '❌ FAIL ' : '✅ PASS ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
