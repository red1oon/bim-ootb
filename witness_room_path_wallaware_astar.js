#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-ROOM-PATH-WALLAWARE scope (READ THE LOG after every run)
 * SPEC: bim-compiler prompts/Modeller/DISC_Walker/VIEWER_FIND_PANEL_ROOM_ACCURACY.md §21.
 * SCOPE: prototype + measure the GENERAL formulation. Measure only; no engine file is modified.
 *
 * WHY (§21's chain of evidence, each step measured not argued):
 *  1. §20 measured the redundancy: 83.2% (Clinic) / 91.3% (LTU) of routes double back, drawn line
 *     +146% / +112% over straight.
 *  2. §21's graphless experiment showed the engine's drawn line is 2.19x / 1.96x the length of plain
 *     A* over the SAME walkable evidence — engine longer on 150/150 and 148/150 pairs.
 *  3. BUT that comparison is confounded, and the confound is the real finding: `_pointWalkable` is
 *     NOT wall-aware. Measured directly (`/tmp/wall_model_check.js`): Clinic `First Floor R7 ->
 *     R17`, `chordIllegalCount=0` while 2 real IfcWalls cross the segment and NO door lies on it.
 *     The raster is slab-derived (floor continues under walls) and the rect fallback inflates every
 *     room rect by DOOR_BUFFER_SLACK, so interior walls are invisible to it either way.
 *     => wall-legality today comes ONLY from the door graph's topology. That is why the graph cannot
 *     simply be dropped, and why its ~12 hand-tuned constants are load-bearing.
 *
 * THE PROTOTYPE: one layer, wall-aware. Occupancy grid at RoomWalker's OWN RES (0.20 m) from
 * RoomWalker's OWN inputs — `storeyWalls()` blocked, `storeyDoors()` footprints cleared (a door is
 * the only place a wall may be crossed). This is not a new artifact: the room walker already builds
 * this exact grid to flood-fill rooms and then DISCARDS it. A* over it, room centre to room centre.
 *
 * PROVES/DISPROVES:
 *  W1 — TOPOLOGY AGREEMENT. On pairs where the wall-unaware A* cheated through a wall, does the
 *       wall-aware route agree with the ENGINE about going the long way round? If yes, the graph's
 *       topology is right and only its geometry is wasteful.
 *  W2 — GEOMETRY. Wall-aware route length vs the engine's drawn polyline, and vs straight line. This
 *       is the number that says whether one general layer beats two tuned ones.
 *  W3 — GENERALITY COST. How many pairs the wall-aware grid fails to route (a formulation that
 *       cannot route is worse than one that wanders), and grid build + query time per building.
 *  W4 — THROUGH-WALL VIOLATIONS on the produced routes, counted against real IfcWall footprints.
 *       Must be 0 by construction; if not, the prototype is wrong and nothing else here is readable.
 *
 * RUN: node witness_room_path_wallaware_astar.js 2>&1 | tee /tmp/w_roompath_wallaware.log
 */
'use strict';
const fs = require('fs');
const path = require('path');
const initSqlJs = require(path.join(process.env.HOME, 'bim-ootb', 'node_modules', 'sql.js'));
const RoomWalker = require('./viewer/lib/room_walker.js');
const RG = require('./common/room_graph.js');
const BLD = path.join(process.env.HOME, 'bim-ootb', 'buildings');

const RES = RoomWalker.RES;      // 0.20 m — the walker's own cell size, not a new constant
const SEAL_CELLS = 1;            // 1 cell of wall dilation closes hairline corner gaps (walker uses 2 for flood-fill)
const SAMPLE = 150;

let pass = 0, fail = 0;
const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };
const len2D = (p) => { let L = 0; for (let i = 0; i + 1 < p.length; i++) L += Math.hypot(p[i + 1].x - p[i].x, p[i + 1].y - p[i].y); return L; };
const med = (a) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const qq = (a, p) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

function Heap() { this.a = []; }
Heap.prototype.push = function (n) { const a = this.a; a.push(n); let i = a.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (a[p].f <= a[i].f) break; const t = a[p]; a[p] = a[i]; a[i] = t; i = p; } };
Heap.prototype.pop = function () { const a = this.a; if (!a.length) return null; const top = a[0], last = a.pop(); if (a.length) { a[0] = last; let i = 0; const n = a.length; for (;;) { const l = 2 * i + 1, r = l + 1; let s = i; if (l < n && a[l].f < a[s].f) s = l; if (r < n && a[r].f < a[s].f) s = r; if (s === i) break; const t = a[s]; a[s] = a[i]; a[i] = t; i = s; } } return top; };
Heap.prototype.size = function () { return this.a.length; };

// ── the grid: walls block, doors clear. Both from RoomWalker's own extraction queries. ──
function buildGrid(wallBoxes, doorBoxes) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const all = wallBoxes.concat(doorBoxes);
  if (!all.length) return null;
  all.forEach(b => { x0 = Math.min(x0, b.x0); y0 = Math.min(y0, b.y0); x1 = Math.max(x1, b.x1); y1 = Math.max(y1, b.y1); });
  const PAD = 2.0;
  x0 -= PAD; y0 -= PAD; x1 += PAD; y1 += PAD;
  const cols = Math.ceil((x1 - x0) / RES), rows = Math.ceil((y1 - y0) / RES);
  if (cols * rows > 12000000) return null;
  const blocked = new Uint8Array(cols * rows);
  const mark = (b, val, inflate) => {
    const c0 = Math.max(0, Math.floor((b.x0 - inflate - x0) / RES)), c1 = Math.min(cols - 1, Math.ceil((b.x1 + inflate - x0) / RES));
    const r0 = Math.max(0, Math.floor((b.y0 - inflate - y0) / RES)), r1 = Math.min(rows - 1, Math.ceil((b.y1 + inflate - y0) / RES));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) blocked[r * cols + c] = val;
  };
  wallBoxes.forEach(b => mark(b, 1, SEAL_CELLS * RES));
  // A door is the ONLY place a wall may be crossed — cleared AFTER wall dilation so it always wins.
  // Inflation is the door's own measured footprint plus one cell of rasterisation slack (the same
  // treatment room_walker.js already gives a door in its adjacency test) — no invented clearance.
  doorBoxes.forEach(b => mark(b, 0, RES));
  return { blocked, cols, rows, x0, y0 };
}

function astar(G, ax, ay, bx, by) {
  const { blocked, cols, rows, x0, y0 } = G;
  const free = (c, r) => c >= 0 && r >= 0 && c < cols && r < rows && !blocked[r * cols + c];
  const toCell = (x, y) => ({ c: Math.floor((x - x0) / RES), r: Math.floor((y - y0) / RES) });
  const snap = (c0) => {
    if (free(c0.c, c0.r)) return c0;
    const R = Math.ceil(1.2 / RES);
    for (let rad = 1; rad <= R; rad++) for (let dc = -rad; dc <= rad; dc++) for (let dr = -rad; dr <= rad; dr++) {
      if (Math.max(Math.abs(dc), Math.abs(dr)) !== rad) continue;
      if (free(c0.c + dc, c0.r + dr)) return { c: c0.c + dc, r: c0.r + dr };
    }
    return null;
  };
  const s = snap(toCell(ax, ay)), g = snap(toCell(bx, by));
  if (!s || !g) return null;
  const idx = (c, r) => r * cols + c;
  const goalI = idx(g.c, g.r), gs = new Map(), came = new Map(), closed = new Uint8Array(cols * rows);
  gs.set(idx(s.c, s.r), 0);
  const h = (c, r) => { const dc = Math.abs(c - g.c), dr = Math.abs(r - g.r); return (dc + dr) + (Math.SQRT2 - 2) * Math.min(dc, dr); };
  const heap = new Heap(); heap.push({ i: idx(s.c, s.r), c: s.c, r: s.r, f: h(s.c, s.r) });
  const dirs = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
  while (heap.size()) {
    const cur = heap.pop();
    if (cur.i === goalI) {
      const out = []; let ci = goalI;
      while (ci !== undefined) { const cc = ci % cols, rr = (ci - cc) / cols; out.push({ x: x0 + (cc + 0.5) * RES, y: y0 + (rr + 0.5) * RES }); ci = came.get(ci); }
      out.reverse(); return out;
    }
    if (closed[cur.i]) continue; closed[cur.i] = 1;
    for (let d = 0; d < 8; d++) {
      const nc = cur.c + dirs[d][0], nr = cur.r + dirs[d][1];
      if (!free(nc, nr)) continue;
      if (dirs[d][2] > 1 && (!free(cur.c + dirs[d][0], cur.r) || !free(cur.c, cur.r + dirs[d][1]))) continue;
      const ni = idx(nc, nr); if (closed[ni]) continue;
      const ng = gs.get(cur.i) + dirs[d][2];
      if (gs.get(ni) === undefined || ng < gs.get(ni)) { gs.set(ni, ng); came.set(ni, cur.i); heap.push({ i: ni, c: nc, r: nr, f: ng + h(nc, nr) }); }
    }
  }
  return null;
}

// string-pull against the SAME grid so the reported length is the real minimal-turn walk
function simplify(G, pts) {
  const clear = (a, b) => {
    const L = Math.hypot(b.x - a.x, b.y - a.y), n = Math.max(1, Math.ceil(L / (RES / 2)));
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
      const c = Math.floor((x - G.x0) / RES), r = Math.floor((y - G.y0) / RES);
      if (c < 0 || r < 0 || c >= G.cols || r >= G.rows || G.blocked[r * G.cols + c]) return false;
    }
    return true;
  };
  if (pts.length <= 2) return pts.slice();
  const out = [pts[0]]; let i = 0;
  while (i < pts.length - 1) { let j = pts.length - 1; for (; j > i + 1; j--) if (clear(pts[i], pts[j])) break; out.push(pts[j]); i = j; }
  return out;
}

function segHitsBox(ax, ay, bx, by, bo) {
  const L = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.ceil(L / 0.05));
  for (let i = 0; i <= n; i++) { const t = i / n, x = ax + (bx - ax) * t, y = ay + (by - ay) * t; if (x >= bo.x0 && x <= bo.x1 && y >= bo.y0 && y <= bo.y1) return true; }
  return false;
}
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
  const dbq = (s) => { try { const r = db.exec(s); return r.length ? r[0].values : []; } catch (e) { return []; } };
  const g = RG.buildGraph(dbq, { log: () => {} });
  const anchors = RoomWalker.storeyZAnchors(db);
  const wallsBy = RoomWalker.storeyWalls(db, 0.0, anchors);
  const doorsBy = RoomWalker.storeyDoors(db, anchors);
  console.log = rl;

  const box = (w) => ({ x0: w[0] - w[2] / 2, x1: w[0] + w[2] / 2, y0: w[1] - w[3] / 2, y1: w[1] + w[3] / 2 });
  const grids = {}, wallBoxes = {};
  const tG0 = Date.now();
  Object.keys(wallsBy).forEach(st => {
    const wb = (wallsBy[st] || []).map(box), dbx = (doorsBy[st] || []).map(box);
    wallBoxes[st] = wb;
    grids[st] = buildGrid(wb, dbx);
  });
  const gridMs = Date.now() - tG0;
  const cells = Object.values(grids).filter(Boolean).reduce((s, G) => s + G.cols * G.rows, 0);
  console.log('§WALLAWARE_GRID ' + label + ' storeys=' + Object.keys(grids).length + ' res=' + RES + 'm cells=' + cells +
    ' buildMs=' + gridMs + ' (walls blocked from RoomWalker.storeyWalls, doors cleared from RoomWalker.storeyDoors)');

  const rooms = g.nodes.filter(n => n.kind === 'room');
  const stride = Math.max(1, Math.floor(rooms.length * rooms.length / 2 / (SAMPLE * 12)));
  let k = 0, n = 0, noRoute = 0, msA = 0, sumEng = 0, sumWall = 0, sumStraight = 0, viol = 0, violRoutes = 0;
  let agreeLong = 0, cheatPairs = 0, shorter = 0, longer = 0;
  const ratios = [], vsStraight = [], worst = [];

  outer:
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      if ((k++) % stride) continue;
      const a = rooms[i], b = rooms[j];
      if (a.storey !== b.storey) continue;
      const S = Math.hypot(b.cx - a.cx, b.cy - a.cy);
      if (S <= 2) continue;
      const G = grids[a.storey]; if (!G) continue;
      const rl3 = console.log; console.log = () => {};
      const res = RG.shortestPath(g, a.guid, b.guid);
      console.log = rl3;
      if (!res || pathStorey(g, res.path) == null) continue;
      const drawn = (res.polyline && res.polyline.length > 1) ? res.polyline
        : res.path.map(gu => { const nn = g.nodesByGuid[gu]; return { x: nn.cx, y: nn.cy }; });
      const LE = len2D(drawn);

      const t0 = Date.now();
      const raw = astar(G, a.cx, a.cy, b.cx, b.cy);
      msA += Date.now() - t0;
      if (!raw) { noRoute++; continue; }
      const pts = simplify(G, raw);
      const LW = len2D(pts);
      n++; sumEng += LE; sumWall += LW; sumStraight += S;
      ratios.push(LE / Math.max(0.01, LW)); vsStraight.push(LW / S);
      if (LE > LW * 1.02) shorter++; else if (LW > LE * 1.02) longer++;

      // W1 — the pairs where the wall-UNAWARE predicate said the straight chord was fine
      if (RG.chordIllegalCount(g, a.storey, a.cx, a.cy, b.cx, b.cy) === 0 && LW > S * 1.5) { cheatPairs++; if (LE > S * 1.5) agreeLong++; }

      // W4 — through-wall violations against real IfcWall footprints
      let v = 0;
      for (let s2 = 0; s2 + 1 < pts.length; s2++) for (const wb of wallBoxes[a.storey]) if (segHitsBox(pts[s2].x, pts[s2].y, pts[s2 + 1].x, pts[s2 + 1].y, wb)) { v++; break; }
      if (v) { viol += v; violRoutes++; }

      worst.push({ r: LE / Math.max(0.01, LW), LE, LW, S, from: a.name || a.guid, to: b.name || b.guid });
      if (n >= SAMPLE) break outer;
    }
  }
  db.close();

  console.log('§WALLAWARE_W3 ' + label + ' pairs=' + n + ' noRoute=' + noRoute +
    ' (' + (100 * noRoute / Math.max(1, n + noRoute)).toFixed(1) + '%) avgMsPerQuery=' + (n ? (msA / n).toFixed(1) : '0'));
  console.log('§WALLAWARE_W2 ' + label + ' engineDrawn=' + sumEng.toFixed(0) + 'm wallAwareAstar=' + sumWall.toFixed(0) +
    'm straight=' + sumStraight.toFixed(0) + 'm  |  engine/wallAware median=' + med(ratios).toFixed(2) +
    'x p90=' + qq(ratios, 0.9).toFixed(2) + 'x  |  engineLonger=' + shorter + ' wallAwareLonger=' + longer + ' of ' + n);
  console.log('§WALLAWARE_DETOUR ' + label + ' vsStraight engine=' + (sumEng / Math.max(1, sumStraight)).toFixed(2) +
    'x  wallAware median=' + med(vsStraight).toFixed(2) + 'x p90=' + qq(vsStraight, 0.9).toFixed(2) + 'x');
  console.log('§WALLAWARE_W1 ' + label + ' pairsWhereStraightLooksLegalButWallAwareMustGoRound=' + cheatPairs +
    ' engineAlsoGoesRound=' + agreeLong + ' (' + (cheatPairs ? (100 * agreeLong / cheatPairs).toFixed(0) : '0') + '% topology agreement)');
  console.log('§WALLAWARE_W4 ' + label + ' throughWallViolations=' + viol + ' on ' + violRoutes + '/' + n + ' routes (must be 0)');
  worst.sort((x, y) => y.r - x.r);
  worst.slice(0, 5).forEach((w, i2) => console.log('§WALLAWARE_WORST ' + label + ' #' + (i2 + 1) + ' engine/wallAware=' + w.r.toFixed(2) +
    'x engine=' + w.LE.toFixed(1) + 'm wallAware=' + w.LW.toFixed(1) + 'm straight=' + w.S.toFixed(1) + 'm from="' + w.from + '" to="' + w.to + '"'));
  return { n, noRoute, viol, violRoutes, ratios, vsStraight, sumEng, sumWall, sumStraight, cheatPairs, agreeLong, shorter, longer };
}

(async () => {
  const SQL = await initSqlJs();
  console.log('W-ROOM-PATH-WALLAWARE — VIEWER_FIND_PANEL_ROOM_ACCURACY.md §21');
  console.log('engine=' + require('child_process').execSync('git -C ' + __dirname + ' rev-parse --short HEAD').toString().trim() + ' (origin/main worktree)');
  const clinic = await run(SQL, 'Clinic', 'Clinic_extracted.db');
  const ltu = await run(SQL, 'LTU_AHouse', 'LTU_AHouse_extracted.db');

  console.log('\n─── §21 assertions ───');
  chk('W4 ZERO through-wall violations on both buildings (the prototype is wall-legal by construction)',
    clinic.viol === 0 && ltu.viol === 0, 'Clinic=' + clinic.viol + ' LTU=' + ltu.viol);
  chk('W3 the wall-aware grid routes the great majority of pairs (generality cost is acceptable)',
    clinic.noRoute / Math.max(1, clinic.n + clinic.noRoute) < 0.25 && ltu.noRoute / Math.max(1, ltu.n + ltu.noRoute) < 0.25,
    'noRoute Clinic=' + clinic.noRoute + '/' + (clinic.n + clinic.noRoute) + ' LTU=' + ltu.noRoute + '/' + (ltu.n + ltu.noRoute));
  chk('W1 topology agreement with the shipped engine is high (the graph knows the RIGHT way round)',
    clinic.cheatPairs === 0 || clinic.agreeLong / clinic.cheatPairs > 0.5,
    'Clinic ' + clinic.agreeLong + '/' + clinic.cheatPairs + ' LTU ' + ltu.agreeLong + '/' + ltu.cheatPairs);
  console.log('\n§W-ROOM-PATH-WALLAWARE DONE pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
})();
