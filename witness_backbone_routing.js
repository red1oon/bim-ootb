#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-BACKBONE-ROUTING scope (READ THE LOG after every run)
 * SCOPE: room_graph.js's E2 "lone-door rescue" now targets the nearest real corridor spine
 * waypoint (common/hallway_backbone.js) instead of a single per-storey CIRC blob — this witness
 * proves the FIX, not just the backbone module in isolation (see witness_hallway_backbone.js for
 * that). ISSUE THIS EXPOSES: before this fix, two rooms both rescued via E2 on the same storey
 * measured ZERO distance apart no matter how far the real hallway ran between them (the shared
 * blob), which is the root cause of a rendered room-to-room path floating straight through open
 * space instead of hugging the corridor (user-reported, 2026-07-14).
 * RUN: node witness_backbone_routing.js   (from the worktree root)
 */
'use strict';
const Database = require(require('path').join(process.env.HOME, 'bim-compiler', 'node_modules', 'better-sqlite3'));
const RoomGraph = require('./common/room_graph.js');

const DB_PATH = '/home/red1/bim-ootb/buildings/Clinic_extracted.db';
let pass = 0, fail = 0;
const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };

console.log('§W-BACKBONE-ROUTING building=' + DB_PATH);
const db = new Database(DB_PATH, { readonly: true });
function dbQuery(sql) { return db.prepare(sql).raw(true).all(); }

const graph = RoomGraph.buildGraph(dbQuery, { log: (m) => console.log('  ' + m) });

const spineNodes = Object.keys(graph.nodesByGuid).filter(g => graph.nodesByGuid[g].kind === 'spine');
const circNodes = Object.keys(graph.nodesByGuid).filter(g => graph.nodesByGuid[g].kind === 'circ');
console.log('§NODE_KINDS spine=' + spineNodes.length + ' circ=' + circNodes.length + ' rooms=' + graph.nodes.length);
chk('G1 real corridor spine nodes were wired into the graph (not just the fallback blob)', spineNodes.length > 0, 'spine=' + spineNodes.length);

const e2edges = graph.edges.filter(e => e.kind === 'E2');
const e2ToSpine = e2edges.filter(e => spineNodes.indexOf(e.b) >= 0);
console.log('§E2_RESCUE total=' + e2edges.length + ' toSpine=' + e2ToSpine.length + ' toBlobFallback=' + (e2edges.length - e2ToSpine.length));
chk('G2 at least some E2 rescues now target a real spine waypoint, not the old blob', e2ToSpine.length > 0, 'toSpine=' + e2ToSpine.length);

// Distinct spine targets used by E2 on the SAME storey must have DIFFERENT positions (proves the
// old "every E2 door on this floor collapses to ONE point" bug is gone).
const byStorey = {};
e2ToSpine.forEach(e => { (byStorey[e.storey] = byStorey[e.storey] || new Set()).add(e.b); });
let anyStoreyMultiSpine = false, exampleStorey = null;
Object.keys(byStorey).forEach(st => { if (byStorey[st].size > 1) { anyStoreyMultiSpine = true; exampleStorey = st; } });
if (exampleStorey) console.log('§DISTINCT_TARGETS storey="' + exampleStorey + '" distinct spine targets=' + byStorey[exampleStorey].size);
chk('G3 E2-rescued doors on the SAME storey land on DIFFERENT real spine points (not one shared blob)',
  anyStoreyMultiSpine, exampleStorey ? ('storey=' + exampleStorey + ' distinctTargets=' + byStorey[exampleStorey].size) : 'n/a');

// Real distance check: two different E2 edges into the SAME spine-network storey must carry
// REAL (non-zero, geometrically distinct) weights, not the old implicit "0" of a shared blob.
if (e2ToSpine.length >= 2) {
  const weights = e2ToSpine.map(e => e.w).filter(w => typeof w === 'number');
  const distinctWeights = new Set(weights.map(w => w.toFixed(2))).size;
  console.log('§E2_WEIGHTS sample=' + weights.slice(0, 8).map(w => w.toFixed(2)).join(',') + ' distinctValues=' + distinctWeights + '/' + weights.length);
  chk('G4 E2 rescue distances are real measured values (mostly non-zero, not a uniform 0)',
    weights.filter(w => w > 0.01).length > weights.length * 0.5, 'nonZero=' + weights.filter(w => w > 0.01).length + '/' + weights.length);
}

// ── §CIRC-SPINE-BRIDGE regression guard (2026-07-14, found via a real user screenshot: Clinic
// First Floor R10 -> Second Floor R5 returned a path with a PHANTOM cross-storey spine-to-spine
// edge — walkBackbone() ran per-storey and returned crossing indices LOCAL to that storey's own
// array, but room_graph.js looked them up as GLOBAL indices into the full cross-storey `joined`
// array, so a First-Floor local index could silently resolve to an unrelated Second-Floor bucket.
// Fixed by making crossings reference bucket OBJECTS, not positional indices. That fix then
// exposed a SECOND real bug: E2 rescuing onto the nearest spine (instead of the old CIRC blob)
// left E3's stair-bridging CIRC nodes as an unreachable island whenever a backbone existed on
// that storey — cross-floor paths returned null where they used to work. Fixed with a
// circ-to-nearest-spine bridge edge (kind E6). Both must hold together, permanently. ──
chk('G0 no E5 (corridor-junction) edge ever connects two DIFFERENT storeys',
  graph.edges.filter(e => e.kind === 'E5').every(e => graph.nodesByGuid[e.a].storey === graph.nodesByGuid[e.b].storey),
  'E5 edges=' + graph.edges.filter(e => e.kind === 'E5').length);
const spineStoreys = new Set(spineNodes.map(g => graph.nodesByGuid[g].storey));
const circOnSpineStoreys = circNodes.filter(g => spineStoreys.has(graph.nodesByGuid[g].storey));
const bridgedCirc = circOnSpineStoreys.filter(g => graph.edges.some(e => e.kind === 'E6' && (e.a === g || e.b === g)));
chk('G0b every CIRC node on a storey that HAS a spine is bridged into it (not an island) — a storey with no backbone at all (e.g. a doorless footing level) is correctly exempt',
  circOnSpineStoreys.length === 0 || bridgedCirc.length === circOnSpineStoreys.length,
  'circOnSpineStoreys=' + circOnSpineStoreys.length + ' bridged=' + bridgedCirc.length + ' (total circ=' + circNodes.length + ')');
{
  const r10r5 = RoomGraph.shortestPath(graph, 'RM_First_Floor_10', 'RM_Second_Floor_5');
  chk('G0c a known real cross-floor pair (First Floor R10 -> Second Floor R5) is reachable via a REAL stair',
    !!(r10r5 && r10r5.path.some(g => graph.nodesByGuid[g].kind === 'stairwp')),
    r10r5 ? ('distance=' + r10r5.distance.toFixed(1) + ' hops=' + r10r5.path.length) : 'NULL (regressed)');
}

// Pick a real multi-hop room pair through the spine and confirm the rendered path visits
// GEOMETRICALLY DISTINCT points (proves it hugs the corridor's real shape, not a straight
// teleport through one fixed blob position).
const roomsByStorey = {};
graph.nodes.forEach(n => { (roomsByStorey[n.storey] = roomsByStorey[n.storey] || []).push(n.guid); });
let demo = null;
Object.keys(roomsByStorey).forEach(st => {
  if (demo) return;
  const rs = roomsByStorey[st];
  for (let i = 0; i < rs.length && !demo; i++) {
    for (let j = i + 1; j < rs.length && !demo; j++) {
      const r = RoomGraph.shortestPath(graph, rs[i], rs[j]);
      if (r && r.path.length >= 4) demo = { a: rs[i], b: rs[j], result: r, storey: st };
    }
  }
});
if (demo) {
  const pts = demo.result.path.map(g => graph.nodesByGuid[g]).filter(Boolean);
  const uniquePositions = new Set(pts.map(p => p.cx.toFixed(1) + ',' + p.cy.toFixed(1))).size;
  console.log('§DEMO_PATH storey="' + demo.storey + '" ' + demo.a + ' -> ' + demo.b +
    ' hops=' + demo.result.path.length + ' distance=' + demo.result.distance.toFixed(2) +
    ' uniquePositions=' + uniquePositions);
  console.log('    points: ' + pts.map(p => '(' + p.cx.toFixed(1) + ',' + p.cy.toFixed(1) + ' ' + p.kind + ')').join(' -> '));
  chk('G5 a real multi-hop room-to-room path visits geometrically DISTINCT waypoints (hugs the corridor, does not float through one collapsed point)',
    uniquePositions === pts.length, 'uniquePositions=' + uniquePositions + '/' + pts.length);
} else {
  console.log('§DEMO_PATH no >=4-hop same-storey room pair found to demo (non-fatal, small sample)');
}

console.log('\n§W-BACKBONE-ROUTING DONE pass=' + pass + ' fail=' + fail);
process.exit(fail ? 1 : 0);
