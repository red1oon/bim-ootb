#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-ROOM-PATH-REDUNDANCY-ATTRIB scope (READ THE LOG after every run)
 * SPEC: bim-compiler prompts/Modeller/DISC_Walker/VIEWER_FIND_PANEL_ROOM_ACCURACY.md §20.6.
 * SCOPE: W-ROOM-PATH-REDUNDANCY (§20.2) COUNTS the redundancy; this ATTRIBUTES it to a mechanism.
 * Measure only — no engine file is modified (the A/B variant is a temp copy, deleted on exit).
 *
 * The probe that motivated this (`probe_redundancy_route.js Clinic "Second Floor R4" "Second Floor R8"`,
 * real output in §20.5): two rooms 2.57 m apart, drawn line 106.25 m, and the panel header reports
 * `distance=251.32m`. The drawn line and the reported distance disagree by 2.4x on the SAME route.
 *
 * PROVES/DISPROVES:
 *  R7 — COST/GEOMETRY DIVERGENCE. `res.distance` is `_dijkstraCore`'s accumulated EDGE WEIGHT, and
 *       `_buildAdjacency` multiplies any edge touching a utility-tagged room by UTILITY_EDGE_PENALTY
 *       (=8). viewer/navigate_find.js prints that number as `res.distance.toFixed(1) + 'm'` in the
 *       Find-panel header AND in §ROOM_PATH. If R7 is large, the app is labelling a penalty-weighted
 *       cost as metres — and Dijkstra is minimising something that is NOT the walked distance, which
 *       is a mechanism for "the route wanders" independent of any geometry bug.
 *  R8 — HOW MUCH REDUNDANCY THE PENALTY CAUSES. Same graph, same pairs, one constant changed
 *       (UTILITY_EDGE_PENALTY 8 -> 1). Any change in drawn length / detour ratio / reversals is
 *       caused by the penalty and nothing else.
 *  R9 — CIRC-HUB TRANSFER. How many routes pass through a per-storey `circ` circulation hub, and
 *       what their detour ratio is vs routes that do not — the suspected mechanism behind the probed
 *       route's 19 m excursion to (-16.66,39.28) and straight back west.
 *
 * RUN: node witness_room_path_redundancy_attrib.js 2>&1 | tee /tmp/w_roompath_attrib.log
 */
'use strict';
const fs = require('fs');
const path = require('path');
const initSqlJs = require(path.join(process.env.HOME, 'bim-ootb', 'node_modules', 'sql.js'));
const RoomWalker = require('./viewer/lib/room_walker.js');
const BLD = path.join(process.env.HOME, 'bim-ootb', 'buildings');

const RG = require('./common/room_graph.js');

// A/B variant: the SAME file with one constant changed. Written into common/ so its own relative
// requires (./storey_raster.js, ./room_habitability.js, ./hallway_backbone.js) still resolve.
const SRC = fs.readFileSync(path.join(__dirname, 'common', 'room_graph.js'), 'utf8');
const NEEDLE = 'var UTILITY_EDGE_PENALTY = 8;';
if (SRC.indexOf(NEEDLE) < 0) { console.error('FATAL: UTILITY_EDGE_PENALTY constant not found — engine changed, re-derive this witness'); process.exit(2); }
const noPenPath = path.join(__dirname, 'common', '_room_graph_nopenalty_' + process.pid + '.js');
fs.writeFileSync(noPenPath, SRC.replace(NEEDLE, 'var UTILITY_EDGE_PENALTY = 1;'));
process.on('exit', () => { try { fs.unlinkSync(noPenPath); } catch (e) {} });
const RGnp = require(noPenPath);

const SAMPLE = 400;          // connected same-storey pairs per building per variant
const DEGENERATE = 1e-6;
const REVERSAL_COS = -0.866;

let pass = 0, fail = 0;
const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };

function len2D(pts) { let L = 0; for (let i = 0; i + 1 < pts.length; i++) L += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y); return L; }
function reversals(pts) {
  let n = 0;
  for (let i = 1; i + 1 < pts.length; i++) {
    const ax = pts[i].x - pts[i - 1].x, ay = pts[i].y - pts[i - 1].y;
    const bx = pts[i + 1].x - pts[i].x, by = pts[i + 1].y - pts[i].y;
    const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
    if (la < DEGENERATE || lb < DEGENERATE) continue;
    if ((ax * bx + ay * by) / (la * lb) < REVERSAL_COS) n++;
  }
  return n;
}
function pathStorey(g, p) {
  let st = null;
  for (const guid of p) { const n = g.nodesByGuid[guid]; if (!n || n.storey == null || n.kind === 'stairwp') continue; if (st == null) st = n.storey; else if (st !== n.storey) return null; }
  return st;
}
function drawnOf(g, res) {
  return (res.polyline && res.polyline.length > 1) ? res.polyline
    : res.path.map(gu => { const n = g.nodesByGuid[gu]; return { x: n.cx, y: n.cy, z: n.cz || 0 }; });
}
function med(a) { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; }
function pct(a, b) { return b ? (100 * a / b).toFixed(1) + '%' : 'n/a'; }

function loadGraph(SQL, dbFile, Engine) {
  const db = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(BLD, dbFile))));
  const realLog = console.log; console.log = () => {};
  RoomWalker.walk(db, { write: true });
  let utilLine = '';
  const g = Engine.buildGraph((sql) => { try { const r = db.exec(sql); return r.length ? r[0].values : []; } catch (e) { return []; } },
    { log: (m) => { if (String(m).indexOf('§ROOM_GRAPH_UTILITY') >= 0) utilLine = String(m); } });
  console.log = realLog;
  return { db, g, utilLine };
}

// The SAME pair list for both variants — sampled from the baseline graph, so A/B compares like with like.
function samplePairs(g, Engine) {
  const rooms = g.nodes.filter(n => n.kind === 'room');
  const out = [];
  const realLog = console.log; console.log = () => {};
  outer:
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const res = Engine.shortestPath(g, rooms[i].guid, rooms[j].guid);
      if (!res) continue;
      if (pathStorey(g, res.path) == null) continue;
      const S = Math.hypot(rooms[j].cx - rooms[i].cx, rooms[j].cy - rooms[i].cy);
      if (S <= 0.5) continue;
      out.push([rooms[i].guid, rooms[j].guid, S]);
      if (out.length >= SAMPLE) break outer;
    }
  }
  console.log = realLog;
  return out;
}

function runVariant(g, Engine, pairs) {
  const realLog = console.log; console.log = () => {};
  const A = { n: 0, drawn: 0, straight: 0, cost: 0, rev: 0, circRoutes: 0, ratios: [], circRatios: [], noCircRatios: [], infl: [] };
  for (const [a, b, S] of pairs) {
    const res = Engine.shortestPath(g, a, b);
    if (!res) continue;
    const pts = drawnOf(g, res);
    const L = len2D(pts);
    A.n++; A.drawn += L; A.straight += S; A.cost += res.distance; A.rev += reversals(pts);
    A.ratios.push(L / S);
    if (L > 0.5) A.infl.push(res.distance / L);
    const hasCirc = res.path.some(gu => { const n = g.nodesByGuid[gu]; return n && n.kind === 'circ'; });
    if (hasCirc) { A.circRoutes++; A.circRatios.push(L / S); } else A.noCircRatios.push(L / S);
  }
  console.log = realLog;
  return A;
}

async function attribute(SQL, label, dbFile) {
  console.log('\n═══ ' + label + ' ═══');
  const base = loadGraph(SQL, dbFile, RG);
  console.log('§ATTRIB_UTIL ' + label + ' ' + (base.utilLine || '(no utility rooms tagged)'));
  const pairs = samplePairs(base.g, RG);
  const A = runVariant(base.g, RG, pairs);
  base.db.close();

  const np = loadGraph(SQL, dbFile, RGnp);
  const B = runVariant(np.g, RGnp, pairs);
  np.db.close();

  console.log('§ATTRIB_R7 ' + label + ' costVsDrawn median=' + med(A.infl).toFixed(2) + 'x' +
    ' mean=' + (A.infl.reduce((s, v) => s + v, 0) / Math.max(1, A.infl.length)).toFixed(2) + 'x' +
    ' max=' + (A.infl.length ? Math.max.apply(null, A.infl).toFixed(2) : '0') + 'x' +
    ' over1.05x=' + A.infl.filter(v => v > 1.05).length + '/' + A.infl.length +
    '  (res.distance is what the Find panel prints as metres)');
  console.log('§ATTRIB_R8 ' + label + ' penalty8 vs penalty1 over ' + pairs.length + ' identical pairs:' +
    ' drawnMetres ' + A.drawn.toFixed(0) + ' -> ' + B.drawn.toFixed(0) +
    ' (' + ((B.drawn - A.drawn) / Math.max(1, A.drawn) * 100).toFixed(1) + '%)' +
    ' medianRatio ' + med(A.ratios).toFixed(2) + ' -> ' + med(B.ratios).toFixed(2) +
    ' reversals ' + A.rev + ' -> ' + B.rev);
  console.log('§ATTRIB_R9 ' + label + ' routesThroughCircHub=' + A.circRoutes + '/' + A.n + ' (' + pct(A.circRoutes, A.n) + ')' +
    ' medianRatio withCirc=' + med(A.circRatios).toFixed(2) + ' withoutCirc=' + med(A.noCircRatios).toFixed(2));
  return { A, B, pairs: pairs.length };
}

(async () => {
  const SQL = await initSqlJs();
  console.log('W-ROOM-PATH-REDUNDANCY-ATTRIB — VIEWER_FIND_PANEL_ROOM_ACCURACY.md §20.6');
  console.log('engine=' + require('child_process').execSync('git -C ' + __dirname + ' rev-parse --short HEAD').toString().trim() + ' (origin/main worktree)');

  const clinic = await attribute(SQL, 'Clinic', 'Clinic_extracted.db');
  const ltu = await attribute(SQL, 'LTU_AHouse', 'LTU_AHouse_extracted.db');

  console.log('\n─── §20.6 assertions (measurability gates — a divergence NUMBER is a finding, not a failure) ───');
  chk('A1 both buildings produced a full A/B sample of identical pairs',
    clinic.pairs > 50 && ltu.pairs > 50, 'Clinic=' + clinic.pairs + ' LTU=' + ltu.pairs);
  chk('A2 R7 cost/geometry divergence is computable (res.distance vs drawn metres)',
    clinic.A.infl.length > 0 && ltu.A.infl.length > 0, 'n Clinic=' + clinic.A.infl.length + ' LTU=' + ltu.A.infl.length);
  chk('A3 the A/B variant really differs only in the penalty constant (baseline unchanged by the copy)',
    RG.DOOR_BUFFER_SLACK === RGnp.DOOR_BUFFER_SLACK, 'DOOR_BUFFER_SLACK ' + RG.DOOR_BUFFER_SLACK + ' vs ' + RGnp.DOOR_BUFFER_SLACK);

  console.log('\n§W-ROOM-PATH-REDUNDANCY-ATTRIB DONE pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
})();
