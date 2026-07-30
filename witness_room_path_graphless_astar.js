#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-ROOM-PATH-GRAPHLESS scope (READ THE LOG after every run)
 * SPEC: bim-compiler prompts/Modeller/DISC_Walker/VIEWER_FIND_PANEL_ROOM_ACCURACY.md §21.
 * SCOPE: answer ONE question with numbers — "is the room-pathing formula abstract and general, or is
 * the two-layer design itself the redundancy?" (user, 2026-07-31). Measure only; no engine edit.
 *
 * THE CONTROLLED EXPERIMENT. Today's engine is two layers optimising different objectives:
 *   L1  Dijkstra over node CENTROIDS (rooms/doorwps/spines/circ), weighted by edge length x
 *       UTILITY_EDGE_PENALTY, bridged chain-to-chain through ONE synthetic per-storey `circ` hub
 *       -> decides WHICH rooms and doors the route uses.
 *   L2  A* over the storey's walkable evidence (_pointWalkable) between L1's anchors, plus the
 *       door-visibility legalizer -> decides HOW the line is drawn.
 * L1 minimises a graph cost that is NOT walked metres; L2 then draws something else. This witness
 * removes L1 entirely and runs L2's OWN A* (RG.astarHop — the engine's exported predicate, same
 * walkable evidence, same implementation) straight from room centre to room centre.
 *
 * PROVES/DISPROVES:
 *   G1 — if graphless A* is materially SHORTER than the shipped drawn polyline on the same pair, the
 *        graph layer is ADDING the redundancy §20 measured, and the fix is formulation (one layer,
 *        one cost) not tuning. If it is the same or longer, the graph is earning its keep and the
 *        redundancy lives in L2/the walkable evidence instead — a different fix entirely.
 *   G2 — how often graphless A* finds an on-floor route AT ALL. This is the honest cost of dropping
 *        L1: the graph exists partly because rect-fallback floor evidence is patchy. A formulation
 *        that cannot route is worse than one that wanders, so this number gates any redesign.
 *
 * The A* window is widened (temp module copy — the shipped 6m/28m margins are sized for hop-to-hop
 * legs, not whole-building routes) and the cell cap raised. Nothing else is changed; the ONLY
 * difference from the shipped predicate is search extent, so a length comparison stays honest.
 *
 * RUN: node witness_room_path_graphless_astar.js 2>&1 | tee /tmp/w_roompath_graphless.log
 */
'use strict';
const fs = require('fs');
const path = require('path');
const initSqlJs = require(path.join(process.env.HOME, 'bim-ootb', 'node_modules', 'sql.js'));
const RoomWalker = require('./viewer/lib/room_walker.js');
const RG = require('./common/room_graph.js');
const BLD = path.join(process.env.HOME, 'bim-ootb', 'buildings');

// Widened-window variant of the SAME file — search extent only.
const SRC = fs.readFileSync(path.join(__dirname, 'common', 'room_graph.js'), 'utf8');
const EDITS = [
  ['var ASTAR_WIDEN_MARGIN = 28.0;', 'var ASTAR_WIDEN_MARGIN = 400.0;'],
  ['var ASTAR_MAX_CELLS = 400000;', 'var ASTAR_MAX_CELLS = 4000000;']
];
let wideSrc = SRC;
for (const [a, b] of EDITS) {
  if (wideSrc.indexOf(a) < 0) { console.error('FATAL: constant not found: ' + a + ' — engine changed, re-derive this witness'); process.exit(2); }
  wideSrc = wideSrc.replace(a, b);
}
const widePath = path.join(__dirname, 'common', '_room_graph_wide_' + process.pid + '.js');
fs.writeFileSync(widePath, wideSrc);
process.on('exit', () => { try { fs.unlinkSync(widePath); } catch (e) {} });
const RGwide = require(widePath);

const SAMPLE = 150;
let pass = 0, fail = 0;
const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };
const len2D = (p) => { let L = 0; for (let i = 0; i + 1 < p.length; i++) L += Math.hypot(p[i + 1].x - p[i].x, p[i + 1].y - p[i].y); return L; };
const med = (a) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const q = (a, p) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
function pathStorey(g, p) {
  let st = null;
  for (const guid of p) { const n = g.nodesByGuid[guid]; if (!n || n.storey == null || n.kind === 'stairwp') continue; if (st == null) st = n.storey; else if (st !== n.storey) return null; }
  return st;
}

async function run(SQL, label, dbFile) {
  console.log('\n═══ ' + label + ' ═══');
  const db = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(BLD, dbFile))));
  const rl = console.log; console.log = () => {};
  RoomWalker.walk(db, { write: true });
  const g = RG.buildGraph((s) => { try { const r = db.exec(s); return r.length ? r[0].values : []; } catch (e) { return []; } }, { log: () => {} });
  console.log = rl;
  const rooms = g.nodes.filter(n => n.kind === 'room');

  const ratios = [], engLen = [], astLen = [];
  let n = 0, astarNull = 0, astarStraight = 0, engineWorse = 0, astarWorse = 0, sumEng = 0, sumAst = 0, sumStraight = 0;
  const worst = [];
  const stride = Math.max(1, Math.floor(rooms.length * rooms.length / 2 / (SAMPLE * 12)));
  let k = 0, msAstar = 0;

  const rl2 = console.log; console.log = () => {};
  outer:
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      if ((k++) % stride) continue;
      const a = rooms[i], b = rooms[j];
      if (a.storey !== b.storey) continue;
      const S = Math.hypot(b.cx - a.cx, b.cy - a.cy);
      if (S <= 2) continue;
      const res = RG.shortestPath(g, a.guid, b.guid);
      if (!res || pathStorey(g, res.path) == null) continue;
      const drawn = (res.polyline && res.polyline.length > 1) ? res.polyline
        : res.path.map(gu => { const nn = g.nodesByGuid[gu]; return { x: nn.cx, y: nn.cy }; });
      const LE = len2D(drawn);

      const t0 = Date.now();
      const hop = RGwide.astarHop(g, a, b);   // graphless: the SAME A*, straight from room to room
      msAstar += Date.now() - t0;
      if (hop === null) { astarNull++; continue; }
      if (hop.length === 0) astarStraight++;
      const LA = len2D([{ x: a.cx, y: a.cy }].concat(hop.map(p => ({ x: p.x, y: p.y }))).concat([{ x: b.cx, y: b.cy }]));

      n++; sumEng += LE; sumAst += LA; sumStraight += S;
      engLen.push(LE); astLen.push(LA); ratios.push(LE / Math.max(0.01, LA));
      if (LE > LA * 1.02) engineWorse++; else if (LA > LE * 1.02) astarWorse++;
      worst.push({ r: LE / Math.max(0.01, LA), LE, LA, S, from: a.name || a.guid, to: b.name || b.guid });
      if (n >= SAMPLE) break outer;
    }
  }
  console.log = rl2;
  db.close();

  console.log('§GRAPHLESS_G2 ' + label + ' comparablePairs=' + n + ' astarNoRoute=' + astarNull +
    ' (' + (100 * astarNull / Math.max(1, n + astarNull)).toFixed(1) + '% of attempted)' +
    ' straightAlreadyOnFloor=' + astarStraight + ' avgMsPerAstar=' + (n ? (msAstar / (n + astarNull)).toFixed(0) : '0'));
  console.log('§GRAPHLESS_G1 ' + label + ' engineDrawn=' + sumEng.toFixed(0) + 'm graphlessAstar=' + sumAst.toFixed(0) +
    'm straight=' + sumStraight.toFixed(0) + 'm  |  engine/astar median=' + med(ratios).toFixed(2) +
    'x p90=' + q(ratios, 0.9).toFixed(2) + 'x max=' + (ratios.length ? Math.max.apply(null, ratios).toFixed(2) : '0') +
    'x  |  engineLonger=' + engineWorse + ' astarLonger=' + astarWorse + ' of ' + n);
  console.log('§GRAPHLESS_RATIO ' + label + ' vsStraight engine=' + (sumEng / Math.max(1, sumStraight)).toFixed(2) +
    'x  graphlessAstar=' + (sumAst / Math.max(1, sumStraight)).toFixed(2) + 'x');
  worst.sort((x, y) => y.r - x.r);
  worst.slice(0, 5).forEach((w, i2) => console.log('§GRAPHLESS_WORST ' + label + ' #' + (i2 + 1) + ' engine/astar=' + w.r.toFixed(2) +
    'x engine=' + w.LE.toFixed(1) + 'm astar=' + w.LA.toFixed(1) + 'm straight=' + w.S.toFixed(1) +
    'm from="' + w.from + '" to="' + w.to + '"'));
  return { n, astarNull, ratios, sumEng, sumAst, sumStraight, engineWorse, astarWorse };
}

(async () => {
  const SQL = await initSqlJs();
  console.log('W-ROOM-PATH-GRAPHLESS — VIEWER_FIND_PANEL_ROOM_ACCURACY.md §21');
  console.log('engine=' + require('child_process').execSync('git -C ' + __dirname + ' rev-parse --short HEAD').toString().trim() + ' (origin/main worktree)');
  const clinic = await run(SQL, 'Clinic', 'Clinic_extracted.db');
  const ltu = await run(SQL, 'LTU_AHouse', 'LTU_AHouse_extracted.db');

  console.log('\n─── §21 assertions (measurability gates — the RATIO is the finding, not a pass/fail) ───');
  chk('G0 both buildings produced a comparable sample (engine route AND graphless A* on the same pair)',
    clinic.n > 20 && ltu.n > 20, 'Clinic n=' + clinic.n + ' LTU n=' + ltu.n);
  chk('G2 graphless A* routes a usable majority of pairs (it is not a formulation that cannot route)',
    clinic.astarNull < clinic.n && ltu.astarNull < ltu.n,
    'noRoute Clinic=' + clinic.astarNull + '/' + (clinic.n + clinic.astarNull) + ' LTU=' + ltu.astarNull + '/' + (ltu.n + ltu.astarNull));
  console.log('\n§W-ROOM-PATH-GRAPHLESS DONE pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
})();
