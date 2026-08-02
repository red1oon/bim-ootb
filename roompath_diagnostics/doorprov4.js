// §21.42 PROBE 4 — ask the DOORS, not the raster.
//
// §DP6: Clinic Second Floor's 310 m2 unreachable component touches the spine component at 54 places,
// every one of them 1.40 m of BLOCKED raster with NO door within 1.5 m. So along the contact line
// there is real wall. That leaves exactly two possibilities and this probe separates them:
//   (a) a door DOES straddle the two components somewhere, and _openings/the carve failed at it
//       -> a raster/detection defect, fixable here;
//   (b) no door on this storey joins them -> the component is entered vertically (stair/lift) or from
//       a storey the graph does not model, and NO amount of raster work will connect it. That would
//       make part of Clinic's 49.3% unroutable a MODEL-SCOPE limit, not a bug.
//
// Method: for each door, take the cells within its own measured half-span (no global tolerance, same
// rule the engine's door->opening matcher uses) and collect which layer-2 COMPONENTS they belong to.
const fs = require('fs'), path = require('path');
const WT = path.resolve(__dirname, '..');
const initSqlJs = require(path.join(process.env.HOME, 'bim-ootb', 'node_modules', 'sql.js'));
const RW = require(path.join(WT, 'viewer/lib/room_walker.js'));
const BLD = path.join(process.env.HOME, 'bim-ootb', 'buildings');
const quiet = fn => { const rl = console.log; console.log = () => {}; try { return fn(); } finally { console.log = rl; } };
const RES = RW.RES;

(async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(BLD, 'Clinic_extracted.db'))));
  const anch = RW.storeyZAnchors(db);
  const doorsBy = RW.storeyDoors(db, anch);
  const stairsBy = RW.storeyStairs(db, anch);
  const map = quiet(() => RW.spineMap(db));
  const st = 'Second Floor';
  const m = map[st], g = m.grid, nx = g.nx, ny = g.ny;
  const doors = doorsBy[st] || [];

  const parent = {}; m.pockets.forEach(p => parent[p.id] = p.id);
  const find = x => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  m.openings.forEach(o => { if (o.doors.length) return; const a = find(o.a), b = find(o.b); if (a !== b) parent[a] = b; });
  const owner = new Int32Array(nx * ny);
  let next = 0;
  for (let si = 0; si < nx; si++) for (let sj = 0; sj < ny; sj++) {
    const sk = si * ny + sj;
    if (!g.enclosed[sk] || owner[sk]) continue;
    const id = ++next, stack = [sk]; owner[sk] = id;
    while (stack.length) {
      const k = stack.pop(), i = Math.floor(k / ny), j = k % ny;
      [[k - ny, i > 0], [k + ny, i < nx - 1], [k - 1, j > 0], [k + 1, j < ny - 1]].forEach(([kk, ok]) => {
        if (ok && g.enclosed[kk] && !owner[kk]) { owner[kk] = id; stack.push(kk); }
      });
    }
  }
  const adj = {};
  m.links.forEach(l => { (adj[l.a] = adj[l.a] || []).push(l.b); (adj[l.b] = adj[l.b] || []).push(l.a); });
  const comp = {}; let nc = 0;
  m.groups.forEach(x => {
    if (comp[x.id]) return;
    const c = ++nc, stack = [x.id]; comp[x.id] = c;
    while (stack.length) { const v = stack.pop(); (adj[v] || []).forEach(w => { if (!comp[w]) { comp[w] = c; stack.push(w); } }); }
  });
  const carea = {}; m.groups.forEach(x => carea[comp[x.id]] = (carea[comp[x.id]] || 0) + x.area);
  const spineComp = comp[m.spineGroup];
  let target = 0, bestA = -1;
  Object.keys(carea).forEach(c => { if (+c !== spineComp && carea[c] > bestA) { bestA = carea[c]; target = +c; } });

  // per door: which components does its own footprint touch?
  let straddle = 0, touchTarget = 0, touchSpine = 0, dead = 0;
  const straddleList = [];
  doors.forEach((d, di) => {
    const w = Math.max(d[2], d[3]) / 2 + 2 * RES;
    const i0 = Math.max(0, Math.floor((d[0] - w - g.xs0) / RES)), i1 = Math.min(nx - 1, Math.floor((d[0] + w - g.xs0) / RES));
    const j0 = Math.max(0, Math.floor((d[1] - w - g.ys0) / RES)), j1 = Math.min(ny - 1, Math.floor((d[1] + w - g.ys0) / RES));
    const cs = new Set();
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const k = i * ny + j;
      if (!g.enclosed[k]) continue;
      const c = comp[find(owner[k])];
      if (c) cs.add(c);
    }
    if (!cs.size) { dead++; return; }
    if (cs.has(target)) touchTarget++;
    if (cs.has(spineComp)) touchSpine++;
    if (cs.has(target) && cs.has(spineComp)) { straddle++; straddleList.push({ di, x: d[0], y: d[1], w: Math.max(d[2], d[3]) }); }
  });

  console.log('§DP7 storey=' + st + '  doors=' + doors.length + '  spineComp=' + spineComp +
    '  targetComp=' + target + ' (' + carea[target].toFixed(0) + 'm2)');
  console.log('§DP7 doors whose own footprint touches BOTH components (should have linked) = ' + straddle);
  console.log('§DP7 doors touching target comp=' + touchTarget + '   spine comp=' + touchSpine +
    '   touching NO enclosed cell at all=' + dead + '/' + doors.length);
  straddleList.slice(0, 10).forEach(x => console.log('   door#' + x.di + ' at (' + x.x.toFixed(2) + ',' + x.y.toFixed(2) + ') w=' + x.w.toFixed(2) + 'm'));

  // stairs: is the component entered vertically instead?
  const stairs = (stairsBy && stairsBy[st]) || [];
  let stairInTarget = 0;
  stairs.forEach(s => {
    const i = Math.floor((s[0] - g.xs0) / RES), j = Math.floor((s[1] - g.ys0) / RES);
    if (i < 0 || i >= nx || j < 0 || j >= ny) return;
    const k = i * ny + j;
    if (g.enclosed[k] && comp[find(owner[k])] === target) stairInTarget++;
  });
  console.log('§DP7 stairs on this storey=' + stairs.length + '   inside the target component=' + stairInTarget);
  console.log('§DP7 VERDICT = ' + (straddle > 0
    ? 'DETECTION/GEOMETRY — ' + straddle + ' door(s) straddle both components yet emitted no link. Fixable here.'
    : stairInTarget > 0
      ? 'VERTICAL ENTRY — no door joins the two on this storey, but ' + stairInTarget + ' stair(s) sit inside the component. It is entered from another storey; a single-storey graph CANNOT connect it.'
      : 'NO CONNECTION MODELLED — neither a door nor a stair joins the component to the spine on this storey. The 310m2 is unreachable in the MODEL, not merely in our raster.'));
  db.close();
})();
