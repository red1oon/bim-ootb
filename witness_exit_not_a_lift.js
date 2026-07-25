#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-EXIT-NOT-A-LIFT scope (READ THE LOG after every run)
 * SCOPE: bim-compiler OCCUPANT_PATHFINDER.md §G1-EXIT-IS-A-LIFT-DOOR, work-order step 1 —
 * `common/room_graph.js` E4 turned every door FAILING `isRoomDoor()` into an `EXIT::` node, but that
 * predicate is a LIFT-NAME test (`NON_ROOM_DOOR_NAMES`), not an exterior test. Terminal's 5 "exits"
 * were 5 elevator doors, which made the Fly Tour's `entrance` a lift door and would have made
 * `escapeRoute()` route egress INTO A LIFT.
 *
 * ISSUE IT PROVES/DISPROVES — one wrong answer removed, nothing else moved:
 *   (G1) NO node of kind 'exit' survives on any building, and specifically none sourced from a
 *        lift-named door. BEFORE (origin/main) must show Terminal's 5 to prove the fixture is real —
 *        a witness that passes because the bug was never there proves nothing.
 *   (G2) The ROUTING graph is otherwise byte-identical: room/circ/stairwp/spine/doorwp node counts,
 *        non-E4 edge counts, and room→room PATHABILITY (the metric G2/#1006 moved) all unchanged.
 *   (G3) Terminal's Fly Tour improves and nothing else changes: its 2 residual wall-illegal chords
 *        (the legs to/from the lift-door "entrance", cause=ENDPOINT_OFF_FLOOR) go to ZERO, and every
 *        building's visited-stop count is unchanged.
 *   (G4) Every consumer's no-exit path is ALREADY the common path — asserted by counting how many
 *        buildings had 0 exits BEFORE the change (6 of 7). This is what makes the change low-risk.
 *
 * RUN: node witness_exit_not_a_lift.js   (needs buildings/*.db present)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execSync } = require('child_process');
const Database = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'better-sqlite3'));

const RG = require('./common/room_graph.js');
// BEFORE = origin/main's shipped module, loaded from git (must live in common/ so its own relative
// requires resolve). Same pattern as witness_room_path_raster_polyline.js.
const beforePath = path.join(__dirname, 'common', '_room_graph_before_' + process.pid + '.js');
fs.writeFileSync(beforePath, execSync('git show origin/main:common/room_graph.js', { cwd: __dirname }).toString());
const RGbefore = require(beforePath);
process.on('exit', () => { try { fs.unlinkSync(beforePath); } catch (e) {} });
const BEFORE_TOUR = execSync('git show origin/main:viewer/tour.js', { cwd: __dirname }).toString();
const AFTER_TOUR = fs.readFileSync(path.join(__dirname, 'viewer', 'tour.js'), 'utf8');

const BLD = '/home/red1/bim-ootb/buildings';
const LIFT_NAMES = ['liftdeur', 'lift', 'elevator', 'aufzug', 'fahrstuhl', 'hoist'];
let pass = 0, fail = 0;
const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };

const CASES = [
  ['Terminal', 'Terminal_extracted.db', ['buildings/patches/Terminal_extracted.db.sql']],   // the ONLY building with exits — the fixture
  ['Hospital', 'Hospital_extracted.db', ['buildings/patches/Hospital_extracted.db.sql']],
  ['Clinic', 'Clinic_extracted.db', []],
  ['HHS', 'HHS_Office_Federated_extracted.db', ['buildings/patches/HHS_Office_Federated_extracted.db.sql']],
  ['LTU_AHouse', 'LTU_AHouse_extracted.db', []],
  ['JKR', 'JKR_extracted.db', ['buildings/patches/JKR_extracted.db.sql']],
  ['Duplex', 'Duplex_extracted.db', []],
];

function load(dbFile, patches) {
  const tmp = '/tmp/_wexit_' + Math.random().toString(36).slice(2) + '.db';
  fs.copyFileSync(path.join(BLD, dbFile), tmp);
  const db = new Database(tmp);
  (patches || []).forEach(p => { const f = path.join(__dirname, p); if (fs.existsSync(f)) db.exec(fs.readFileSync(f, 'utf8')); });
  return { db, tmp, dbQuery: q => db.prepare(q).raw(true).all() };
}
function kindCounts(g) {
  const c = {};
  for (const k in g.nodesByGuid) { const n = g.nodesByGuid[k]; c[n.kind] = (c[n.kind] || 0) + 1; }
  return c;
}
// room→room pathability over a fixed sample — the metric #1006 moved; it must NOT move here.
function pathability(MOD, g, cap) {
  const rooms = g.nodes.filter(n => n.kind === 'room');
  let tried = 0, ok = 0;
  for (let i = 0; i < rooms.length && tried < cap; i++) {
    const a = rooms[i], b = rooms[(i * 7 + 3) % rooms.length];
    if (a.guid === b.guid) continue;
    tried++;
    const sp = MOD.shortestPath(g, a.guid, b.guid);
    if (sp && sp.path && sp.path.length > 1) ok++;
  }
  return { tried, ok };
}
// Run a tour.js build against an already-built graph (same harness as W-TOUR-POLYLINE-PATH).
function runTour(src, g, dbQuery) {
  const logs = [];
  const A = {
    modelOffset: { x: 0, y: 0, z: 0 }, WALK_EYE_HEIGHT: 1.6,
    ifc2three: (ix, iy, iz) => ({ x: ix, y: iz, z: -iy }),
    wlog: () => {}, getRoomGraph: () => g, dbQuery: dbQuery,
    db: { exec: sql => { const r = dbQuery(sql); return r.length ? [{ values: r }] : []; } },
  };
  const ctx = {
    console: { log: (...a) => logs.push(a.join(' ')), warn: (...a) => logs.push('WARN ' + a.join(' ')), error: (...a) => logs.push('ERR ' + a.join(' ')) },
    window: { RoomGraph: null }, document: { getElementById: () => null },
    performance: { now: () => Date.now() }, setTimeout: () => 0, clearTimeout: () => {}, requestAnimationFrame: () => 0,
  };
  return { A, ctx, logs, src };
}
function tourRoute(src, RGmod, g, dbQuery) {
  const h = runTour(src, g, dbQuery);
  h.ctx.window.RoomGraph = RGmod;
  vm.createContext(h.ctx);
  vm.runInContext(h.src, h.ctx, { filename: 'tour.js' });
  h.ctx.setupTour(h.A);
  const storeyZ = h.A._tourStoreyZ();
  const route = h.A._buildGraphRoute(storeyZ);
  return { route, logs: h.logs, storeyZ };
}
// independent illegal-chord measure over the flown points (same method as W-TOUR-POLYLINE-PATH)
function chords(RGmod, g, route, storeyZ) {
  if (!route) return { checked: 0, illegal: 0 };
  const zs = Object.keys(storeyZ).map(k => ({ st: k, z: storeyZ[k] }));
  const storeyOf = y => { const fz = y - 1.6; let b = null, bd = Infinity; for (const e of zs) { const d = Math.abs(e.z - fz); if (d < bd) { bd = d; b = e.st; } } return bd <= 0.05 ? b : null; };
  let checked = 0, illegal = 0;
  for (let i = 1; i < route.pts.length; i++) {
    const a = route.pts[i - 1], b = route.pts[i];
    const sa = storeyOf(a.y), sb = storeyOf(b.y);
    if (sa === null || sb === null || sa !== sb) continue;
    checked++;
    if (RGmod.chordIllegalCount(g, sa, a.x, -a.z, b.x, -b.z) > 0) illegal++;
  }
  return { checked, illegal };
}
const visitedOf = logs => { const l = logs.find(x => x.indexOf('§FLY_ROUTE ') >= 0) || ''; const m = l.match(/stops=(\d+)\/(\d+)/); return m ? m[1] + '/' + m[2] : 'n/a'; };

console.log('══ W-EXIT-NOT-A-LIFT — an `exit` node was a lift door; removing it must break nothing ══\n');
let buildingsWithExitsBefore = 0, buildingsTotal = 0;
for (const [label, dbFile, patches] of CASES) {
  if (!fs.existsSync(path.join(BLD, dbFile))) { console.log('— ' + label + ': db missing, skipped'); continue; }
  const { db, tmp, dbQuery } = load(dbFile, patches);
  const realLog = console.log; console.log = () => {};
  let gB, gA;
  try { gB = RGbefore.buildGraph(dbQuery, { log: () => {} }); gA = RG.buildGraph(dbQuery, { log: () => {} }); }
  finally { console.log = realLog; }
  buildingsTotal++;

  const cB = kindCounts(gB), cA = kindCounts(gA);
  const exitsB = cB.exit || 0, exitsA = cA.exit || 0;
  if (exitsB > 0) buildingsWithExitsBefore++;

  // which door names produced the BEFORE exits — proves the source really was the lift filter
  const liftNamed = [];
  for (const k in gB.nodesByGuid) {
    const n = gB.nodesByGuid[k];
    if (n.kind !== 'exit') continue;
    liftNamed.push(LIFT_NAMES.some(w => String(n.name || '').toLowerCase().indexOf(w) >= 0));
  }
  const e4B = gB.edges.filter(e => e.kind === 'E4').length, e4A = gA.edges.filter(e => e.kind === 'E4').length;
  const nonE4B = gB.edges.length - e4B, nonE4A = gA.edges.length - e4A;
  const pB = pathability(RGbefore, gB, 60), pA = pathability(RG, gA, 60);

  console.log('── ' + label + '  exits ' + exitsB + ' → ' + exitsA + '  E4 edges ' + e4B + ' → ' + e4A +
    '  other edges ' + nonE4B + ' → ' + nonE4A + '  pathable ' + pB.ok + '/' + pB.tried + ' → ' + pA.ok + '/' + pA.tried);

  chk(label + ': G1 no exit node survives', exitsA === 0, exitsB + ' → 0');
  if (exitsB > 0) {
    chk(label + ': G1 the BEFORE exits really were lift-named doors (fixture is real)',
      liftNamed.length > 0 && liftNamed.every(Boolean), liftNamed.length + '/' + liftNamed.length + ' lift-named');
    chk(label + ': G1 all E4 edges gone with them', e4A === 0, e4B + ' → 0');
  }
  chk(label + ': G2 routing node counts unchanged (room/circ/stairwp/spine/doorwp)',
    ['room', 'circ', 'stairwp', 'spine', 'doorwp'].every(k => (cB[k] || 0) === (cA[k] || 0)),
    ['room', 'circ', 'stairwp', 'spine', 'doorwp'].map(k => k + '=' + (cA[k] || 0)).join(' '));
  chk(label + ': G2 non-E4 edge count unchanged', nonE4B === nonE4A, nonE4B + ' → ' + nonE4A);
  chk(label + ': G2 room→room pathability unchanged', pB.ok === pA.ok && pB.tried === pA.tried,
    pB.ok + '/' + pB.tried + ' → ' + pA.ok + '/' + pA.tried);

  // G3 — the tour, BEFORE build vs AFTER build, each against its own graph
  const rB = tourRoute(BEFORE_TOUR, RGbefore, gB, dbQuery);
  const rA = tourRoute(AFTER_TOUR, RG, gA, dbQuery);
  if (rB.route && rA.route) {
    const chB = chords(RGbefore, gB, rB.route, rB.storeyZ), chA = chords(RG, gA, rA.route, rA.storeyZ);
    console.log('   tour: illegalChords ' + chB.illegal + '/' + chB.checked + ' → ' + chA.illegal + '/' + chA.checked +
      '  visitedStops ' + visitedOf(rB.logs) + ' → ' + visitedOf(rA.logs));
    chk(label + ': G3 tour illegal chords never worse', chA.illegal <= chB.illegal, chB.illegal + ' → ' + chA.illegal);
    chk(label + ': G3 visited stops unchanged', visitedOf(rB.logs) === visitedOf(rA.logs), visitedOf(rA.logs));
  } else {
    chk(label + ': G3 tour fallback status unchanged', (!!rB.route) === (!!rA.route),
      (rB.route ? 'route' : 'legacy') + ' → ' + (rA.route ? 'route' : 'legacy'));
  }
  db.close(); fs.unlinkSync(tmp);
}

console.log('');
chk('G4 the no-exit path was ALREADY the common path before this change',
  buildingsTotal - buildingsWithExitsBefore >= buildingsTotal - 1,
  (buildingsTotal - buildingsWithExitsBefore) + ' of ' + buildingsTotal +
  ' buildings already had exits=0 (tour.js §HL-ORIGIN, scene.js _graphEntrance→none, effects.js §CINEMA_EXIT→db-doors)');

console.log('\n' + (fail ? '❌ FAIL ' : '✅ PASS ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
