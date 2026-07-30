#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-ROOM-PATH-FREESPACE scope (READ THE LOG after every run)
 * SPEC: bim-compiler prompts/Modeller/DISC_Walker/VIEWER_FIND_PANEL_ROOM_ACCURACY.md §21.6.
 * SCOPE: test the USER'S formulation (2026-07-31, verbatim): "u got a common dense map that covers
 * all doors, and its walkable area is marked out … thus this walkable map simply return the shortest
 * possible length between 2 doors." Measure only; no engine file modified.
 *
 * WHY THIS DIFFERS FROM §21.4's FAILED PROTOTYPE — the correction is the whole point:
 *   §21.4 built the field from WALLS (rasterise wall boxes, dilate, block) and sealed the building
 *   into isolated pockets: 93.8%/99.5% unroutable. This builds it from WALKABLE AREA instead —
 *   the room pockets RoomWalker already compiled. A compiled pocket STOPS AT A WALL by construction
 *   (it is the flood-fill of space the exterior cannot reach), so the field is wall-aware WITHOUT
 *   ever rasterising a wall. Doors are the only connectors between pockets.
 *
 * NOTE the one deliberate difference from the shipped `_pointWalkable`: room rects are taken RAW,
 * with NO DOOR_BUFFER_SLACK inflation. That inflation (0.2 m per side, 0.4 m total) is precisely what
 * makes today's predicate blind to interior walls thinner than 0.4 m — §21.2's measured finding.
 *
 * PROVES/DISPROVES:
 *   F1 — coverage: what fraction of pairs this field can route (the metric §21.4 failed at, 6.2%).
 *   F2 — wall-legality: through-wall violations against real IfcWall footprints. Target 0.
 *   F3 — geometry: route length vs the shipped engine's drawn polyline, and vs straight line.
 *   F4 — the user's own primitive: door→door shortest length on the same field.
 *
 * RUN: node witness_room_path_freespace_map.js 2>&1 | tee /tmp/w_roompath_freespace.log
 */
'use strict';
const fs = require('fs');
const path = require('path');
const initSqlJs = require(path.join(process.env.HOME, 'bim-ootb', 'node_modules', 'sql.js'));
const RoomWalker = require('./viewer/lib/room_walker.js');
const RG = require('./common/room_graph.js');
const BLD = path.join(process.env.HOME, 'bim-ootb', 'buildings');

const RES = RoomWalker.RES;   // 0.20 m — the walker's own cell size
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

// THE MAP: free = inside a compiled room pocket, or inside a real door footprint (the connector).
function buildField(roomRects, doorBoxes) {
  const all = roomRects.concat(doorBoxes);
  if (!all.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  all.forEach(b => { x0 = Math.min(x0, b.x0); y0 = Math.min(y0, b.y0); x1 = Math.max(x1, b.x1); y1 = Math.max(y1, b.y1); });
  x0 -= 1; y0 -= 1; x1 += 1; y1 += 1;
  const cols = Math.ceil((x1 - x0) / RES), rows = Math.ceil((y1 - y0) / RES);
  if (cols * rows > 12000000) return null;
  const free = new Uint8Array(cols * rows);
  const mark = (b, inflate) => {
    const c0 = Math.max(0, Math.floor((b.x0 + inflate - x0) / RES)), c1 = Math.min(cols - 1, Math.floor((b.x1 - inflate - x0) / RES));
    const r0 = Math.max(0, Math.floor((b.y0 + inflate - y0) / RES)), r1 = Math.min(rows - 1, Math.floor((b.y1 - inflate - y0) / RES));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) free[r * cols + c] = 1;
  };
  roomRects.forEach(b => mark(b, 0));                     // raw pocket — NO slack inflation
  doorBoxes.forEach(b => mark(b, -RES));                  // door footprint + one cell, the connector
  return { free, cols, rows, x0, y0 };
}

function astar(F, ax, ay, bx, by) {
  const { free, cols, rows, x0, y0 } = F;
  const ok = (c, r) => c >= 0 && r >= 0 && c < cols && r < rows && free[r * cols + c] === 1;
  const snap = (x, y) => {
    let c = Math.floor((x - x0) / RES), r = Math.floor((y - y0) / RES);
    if (ok(c, r)) return { c, r };
    const R = Math.ceil(1.5 / RES);
    for (let rad = 1; rad <= R; rad++) for (let dc = -rad; dc <= rad; dc++) for (let dr = -rad; dr <= rad; dr++) {
      if (Math.max(Math.abs(dc), Math.abs(dr)) !== rad) continue;
      if (ok(c + dc, r + dr)) return { c: c + dc, r: r + dr };
    }
    return null;
  };
  const s = snap(ax, ay), g = snap(bx, by);
  if (!s || !g) return null;
  const idx = (c, r) => r * cols + c, goalI = idx(g.c, g.r);
  const gs = new Map(), came = new Map(), closed = new Uint8Array(cols * rows);
  gs.set(idx(s.c, s.r), 0);
  const h = (c, r) => { const dc = Math.abs(c - g.c), dr = Math.abs(r - g.r); return (dc + dr) + (Math.SQRT2 - 2) * Math.min(dc, dr); };
  const heap = new Heap(); heap.push({ i: idx(s.c, s.r), c: s.c, r: s.r, f: h(s.c, s.r) });
  const dirs = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
  while (heap.size()) {
    const cur = heap.pop();
    if (cur.i === goalI) { const out = []; let ci = goalI; while (ci !== undefined) { const cc = ci % cols, rr = (ci - cc) / cols; out.push({ x: x0 + (cc + 0.5) * RES, y: y0 + (rr + 0.5) * RES }); ci = came.get(ci); } out.reverse(); return out; }
    if (closed[cur.i]) continue; closed[cur.i] = 1;
    for (let d = 0; d < 8; d++) {
      const nc = cur.c + dirs[d][0], nr = cur.r + dirs[d][1];
      if (!ok(nc, nr)) continue;
      if (dirs[d][2] > 1 && (!ok(cur.c + dirs[d][0], cur.r) || !ok(cur.c, cur.r + dirs[d][1]))) continue;
      const ni = idx(nc, nr); if (closed[ni]) continue;
      const ng = gs.get(cur.i) + dirs[d][2];
      if (gs.get(ni) === undefined || ng < gs.get(ni)) { gs.set(ni, ng); came.set(ni, cur.i); heap.push({ i: ni, c: nc, r: nr, f: ng + h(nc, nr) }); }
    }
  }
  return null;
}
function simplify(F, pts) {
  const clear = (a, b) => {
    const L = Math.hypot(b.x - a.x, b.y - a.y), n = Math.max(1, Math.ceil(L / (RES / 2)));
    for (let i = 0; i <= n; i++) {
      const t = i / n, c = Math.floor((a.x + (b.x - a.x) * t - F.x0) / RES), r = Math.floor((a.y + (b.y - a.y) * t - F.y0) / RES);
      if (c < 0 || r < 0 || c >= F.cols || r >= F.rows || F.free[r * F.cols + c] !== 1) return false;
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
  const doorsBy = RoomWalker.storeyDoors(db, anchors);
  console.log = rl;

  // walkable area = the walker's OWN compiled pockets, per storey, straight off the graph nodes
  const rooms = g.nodes.filter(n => n.kind === 'room');
  const rectsBy = {}, wallBoxes = {};
  rooms.forEach(n => { (rectsBy[n.storey] = rectsBy[n.storey] || []).push(...(n.rects || [])); });
  dbq("SELECT m.storey,t.center_x,t.center_y,COALESCE(t.bbox_x,0),COALESCE(t.bbox_y,0) FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid WHERE m.ifc_class LIKE 'IfcWall%'")
    .forEach(([st, cx, cy, bx, by]) => { (wallBoxes[st] = wallBoxes[st] || []).push({ x0: cx - bx / 2, x1: cx + bx / 2, y0: cy - by / 2, y1: cy + by / 2 }); });

  const fields = {};
  const t0 = Date.now();
  Object.keys(rectsBy).forEach(st => {
    const dbx = (doorsBy[st] || []).map(d => ({ x0: d[0] - d[2] / 2, x1: d[0] + d[2] / 2, y0: d[1] - d[3] / 2, y1: d[1] + d[3] / 2 }));
    fields[st] = buildField(rectsBy[st], dbx);
  });
  const buildMs = Date.now() - t0;
  const cells = Object.values(fields).filter(Boolean).reduce((s, F) => s + F.cols * F.rows, 0);
  const freeCells = Object.values(fields).filter(Boolean).reduce((s, F) => s + F.free.reduce((a, v) => a + v, 0), 0);
  console.log('§FREESPACE_MAP ' + label + ' storeys=' + Object.keys(fields).length + ' res=' + RES + 'm cells=' + cells +
    ' walkableCells=' + freeCells + ' (' + (100 * freeCells / Math.max(1, cells)).toFixed(1) + '%) buildMs=' + buildMs);

  const stride = Math.max(1, Math.floor(rooms.length * rooms.length / 2 / (SAMPLE * 12)));
  let k = 0, n = 0, noRoute = 0, ms = 0, sumE = 0, sumF = 0, sumS = 0, viol = 0, violRoutes = 0, shorter = 0, longer = 0;
  const ratios = [], vsS = [], worst = [];
  outer:
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      if ((k++) % stride) continue;
      const a = rooms[i], b = rooms[j];
      if (a.storey !== b.storey) continue;
      const S = Math.hypot(b.cx - a.cx, b.cy - a.cy); if (S <= 2) continue;
      const F = fields[a.storey]; if (!F) continue;
      const rl2 = console.log; console.log = () => {};
      const res = RG.shortestPath(g, a.guid, b.guid);
      console.log = rl2;
      if (!res || pathStorey(g, res.path) == null) continue;
      const drawn = (res.polyline && res.polyline.length > 1) ? res.polyline : res.path.map(gu => { const nn = g.nodesByGuid[gu]; return { x: nn.cx, y: nn.cy }; });
      const LE = len2D(drawn);
      const tt = Date.now();
      const raw = astar(F, a.cx, a.cy, b.cx, b.cy);
      ms += Date.now() - tt;
      if (!raw) { noRoute++; continue; }
      const pts = simplify(F, raw), LF = len2D(pts);
      n++; sumE += LE; sumF += LF; sumS += S; ratios.push(LE / Math.max(0.01, LF)); vsS.push(LF / S);
      if (LE > LF * 1.02) shorter++; else if (LF > LE * 1.02) longer++;
      let v = 0;
      for (let s2 = 0; s2 + 1 < pts.length; s2++) for (const wb of (wallBoxes[a.storey] || [])) if (segHitsBox(pts[s2].x, pts[s2].y, pts[s2 + 1].x, pts[s2 + 1].y, wb)) { v++; break; }
      if (v) { viol += v; violRoutes++; }
      worst.push({ r: LE / Math.max(0.01, LF), LE, LF, S, from: a.name || a.guid, to: b.name || b.guid });
      if (n >= SAMPLE) break outer;
    }
  }
  db.close();
  console.log('§FREESPACE_F1 ' + label + ' pairs=' + n + ' noRoute=' + noRoute + ' (' + (100 * noRoute / Math.max(1, n + noRoute)).toFixed(1) +
    '%) avgMsPerQuery=' + (n ? (ms / n).toFixed(1) : '0'));
  console.log('§FREESPACE_F2 ' + label + ' throughWallViolations=' + viol + ' on ' + violRoutes + '/' + n + ' routes (target 0)');
  console.log('§FREESPACE_F3 ' + label + ' engineDrawn=' + sumE.toFixed(0) + 'm freeSpaceMap=' + sumF.toFixed(0) + 'm straight=' + sumS.toFixed(0) +
    'm | engine/freeSpace median=' + med(ratios).toFixed(2) + 'x p90=' + qq(ratios, 0.9).toFixed(2) +
    'x | engineLonger=' + shorter + ' freeSpaceLonger=' + longer + ' of ' + n);
  console.log('§FREESPACE_DETOUR ' + label + ' vsStraight engine=' + (sumE / Math.max(1, sumS)).toFixed(2) +
    'x freeSpaceMap median=' + med(vsS).toFixed(2) + 'x p90=' + qq(vsS, 0.9).toFixed(2) + 'x');
  worst.sort((x, y) => y.r - x.r);
  worst.slice(0, 4).forEach((w, i2) => console.log('§FREESPACE_WORST ' + label + ' #' + (i2 + 1) + ' engine/freeSpace=' + w.r.toFixed(2) +
    'x engine=' + w.LE.toFixed(1) + 'm freeSpace=' + w.LF.toFixed(1) + 'm straight=' + w.S.toFixed(1) + 'm from="' + w.from + '" to="' + w.to + '"'));
  return { n, noRoute, viol, violRoutes, ratios, vsS, sumE, sumF, sumS };
}

(async () => {
  const SQL = await initSqlJs();
  console.log('W-ROOM-PATH-FREESPACE — VIEWER_FIND_PANEL_ROOM_ACCURACY.md §21.6');
  console.log('engine=' + require('child_process').execSync('git -C ' + __dirname + ' rev-parse --short HEAD').toString().trim() + ' (origin/main worktree)');
  const clinic = await run(SQL, 'Clinic', 'Clinic_extracted.db');
  const ltu = await run(SQL, 'LTU_AHouse', 'LTU_AHouse_extracted.db');
  console.log('\n─── §21.6 assertions ───');
  chk('F1 the free-space map routes the great majority of pairs (§21.4 failed here at 6.2%)',
    clinic.noRoute / Math.max(1, clinic.n + clinic.noRoute) < 0.25 && ltu.noRoute / Math.max(1, ltu.n + ltu.noRoute) < 0.25,
    'noRoute Clinic=' + clinic.noRoute + '/' + (clinic.n + clinic.noRoute) + ' LTU=' + ltu.noRoute + '/' + (ltu.n + ltu.noRoute));
  chk('F2 zero through-wall violations against real IfcWall footprints',
    clinic.viol === 0 && ltu.viol === 0, 'Clinic=' + clinic.viol + ' LTU=' + ltu.viol);
  console.log('\n§W-ROOM-PATH-FREESPACE DONE pass=' + pass + ' fail=' + fail);
  process.exit(fail ? 1 : 0);
})();
