// §21.36 — §21.35 NEXT item 1. ONE cluster, fully enumerated, no aggregate. Clinic's largest
// stranded cluster is 31 rooms sealed behind solid modelled wall with no stair, which no real
// building has. Three mechanisms could produce that and they are distinguishable by inspection:
//   M1 no door element anywhere on the boundary          -> upstream extraction problem
//   M2 a door IS on the boundary, its carve intersects it, but the march found no opening
//                                                        -> opening detection, this lane's fix
//   M3 a door is on the boundary and its carve does NOT reach it (wall thicker than the pierce,
//      or the door sits off the boundary line)           -> carve geometry
// Picking between these by further aggregate measurement is exactly what cost §21.23 and §21.26 a
// session each, so this dumps the actual cells.
const fs = require('fs'), path = require('path');
const WT = path.resolve(__dirname, '..');
const initSqlJs = require(path.join(process.env.HOME, 'bim-ootb', 'node_modules', 'sql.js'));
const RW = require(path.join(WT, 'viewer/lib/room_walker.js'));
const BLD = path.join(process.env.HOME, 'bim-ootb', 'buildings');
const quiet = fn => { const rl = console.log; console.log = () => {}; try { return fn(); } finally { console.log = rl; } };

(async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(BLD, 'Clinic_extracted.db'))));
  const anch = RW.storeyZAnchors(db);
  const doorsBy = RW.storeyDoors(db, anch);
  const map = quiet(() => RW.spineMap(db));
  let best = null;

  Object.keys(map).sort().forEach(st => {
    const m = map[st];
    if (!m.pockets.length) return;
    const g = m.grid, nx = g.nx, ny = g.ny;
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
    const parent = {}; m.pockets.forEach(p => parent[p.id] = p.id);
    const find = x => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
    m.openings.forEach(o => { if (o.doors.length) return; const a = find(o.a), b = find(o.b); if (a !== b) parent[a] = b; });
    const strandedIds = new Set(m.groups.filter(x => x.depth === -1 && x.area >= 2.0 && x.id !== m.spineGroup).map(x => x.id));
    if (!strandedIds.size) return;
    const adj = {};
    m.openings.forEach(o => {
      if (!o.doors.length) return;
      const ga = find(o.a), gb = find(o.b);
      if (!strandedIds.has(ga) || !strandedIds.has(gb) || ga === gb) return;
      (adj[ga] = adj[ga] || []).push(gb); (adj[gb] = adj[gb] || []).push(ga);
    });
    const seen = new Set();
    strandedIds.forEach(s => {
      if (seen.has(s)) return;
      const stack = [s], mem = []; seen.add(s);
      while (stack.length) { const v = stack.pop(); mem.push(v); (adj[v] || []).forEach(w => { if (!seen.has(w)) { seen.add(w); stack.push(w); } }); }
      if (!best || mem.length > best.mem.length) best = { st, mem, m, g, owner, find, nx, ny };
    });
  });

  const { st, mem, m, g, owner, find, nx, ny } = best;
  const memSet = new Set(mem);
  const doors = doorsBy[st] || [];
  console.log('§C31 storey=' + st + '  cluster groups=' + mem.length +
    '  area=' + mem.reduce((s, id) => s + (m.groups.find(x => x.id === id) || { area: 0 }).area, 0).toFixed(0) + 'm²' +
    '  doors on this storey=' + doors.length);

  // Every boundary cell: enclosed cell of the cluster with a blocked neighbour whose far side is
  // an enclosed cell OUTSIDE the cluster. That is a place the cluster should have been able to exit.
  let bcells = 0, withDoorNear = [], noDoor = 0;
  const near = [];
  for (let i = 1; i < nx - 1; i++) for (let j = 1; j < ny - 1; j++) {
    const k = i * ny + j;
    if (!g.enclosed[k]) continue;
    const gid = find(owner[k]);
    if (!memSet.has(gid)) continue;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      let s = 1, kk = k;
      for (; s <= 14; s++) {
        const ii = i + di * s, jj = j + dj * s;
        if (ii < 0 || ii >= nx || jj < 0 || jj >= ny) { kk = -1; break; }
        kk = ii * ny + jj;
        if (g.enclosed[kk]) break;
      }
      if (kk < 0 || s > 14 || !g.enclosed[kk]) continue;
      const og = find(owner[kk]);
      if (memSet.has(og)) continue;                       // still inside the cluster
      bcells++;
      // nearest door to the MIDPOINT of the crossing
      const mx = g.xs0 + (i + di * s / 2 + 0.5) * RW.RES, my = g.ys0 + (j + dj * s / 2 + 0.5) * RW.RES;
      let bd = 1e9, bw = 0;
      for (const d of doors) {
        const dist = Math.hypot(d[0] - mx, d[1] - my);
        if (dist < bd) { bd = dist; bw = Math.max(d[2], d[3]); }
      }
      near.push({ d: bd, thick: s * RW.RES, w: bw });
      if (bd <= 1.5) withDoorNear.push(bd); else noDoor++;
    }
  }
  near.sort((a, b) => a.d - b.d);
  console.log('§C31 boundary crossings (cluster -> outside) = ' + bcells);
  console.log('§C31 nearest-door distance at the crossing: min=' + (near[0] ? near[0].d.toFixed(2) : 'n/a') +
    'm  p10=' + (near.length ? near[Math.floor(near.length * 0.1)].d.toFixed(2) : 'n/a') +
    'm  median=' + (near.length ? near[near.length >> 1].d.toFixed(2) : 'n/a') + 'm');
  console.log('§C31 crossings with a door within 1.5 m = ' + withDoorNear.length + '/' + bcells +
    '   without = ' + noDoor);
  const thick = near.filter(x => x.d <= 1.5).map(x => x.thick).sort((a, b) => a - b);
  if (thick.length) console.log('§C31 wall thickness AT those crossings: median=' + thick[thick.length >> 1].toFixed(2) +
    'm  max=' + thick[thick.length - 1].toFixed(2) + 'm   (door pierce depth = ' + (6 * RW.RES).toFixed(2) + 'm)');
  // §21.37 item 1 — the histogram that decides (a) deepen the pierce vs (b) lengthen the march.
  // reach = 6 + SEAL + 2 cells = 2.00 m; pierce = 6*RES = 1.20 m. A crossing is only explained by
  // the march if it EXCEEDS 2.00 m; one at 1.40 m is inside reach and needs a different explanation.
  const REACH = (6 + 2 + 2) * RW.RES, PIERCE = 6 * RW.RES;
  const b = { lePierce: 0, pierceToReach: 0, gtReach: 0 };
  thick.forEach(t => { if (t <= PIERCE) b.lePierce++; else if (t <= REACH) b.pierceToReach++; else b.gtReach++; });
  console.log('§C37 door-adjacent crossings by gap width (n=' + thick.length + ')  reach=' + REACH.toFixed(2) +
    'm  pierce=' + PIERCE.toFixed(2) + 'm');
  console.log('§C37   <= 1.20m (inside BOTH pierce and reach) = ' + b.lePierce +
    '  -> neither mechanism explains these');
  console.log('§C37   1.20-2.00m (beyond pierce, inside reach) = ' + b.pierceToReach +
    '  -> PIERCE-limited: carve never breaks through');
  console.log('§C37   > 2.00m (beyond reach too)               = ' + b.gtReach +
    '  -> MARCH-limited as well');
  const dom2 = b.pierceToReach >= b.gtReach && b.pierceToReach >= b.lePierce ? 'PIERCE'
    : (b.gtReach >= b.lePierce ? 'MARCH' : 'NEITHER');
  console.log('§C37 VERDICT = ' + dom2 + ' -> ' + ({
    PIERCE: 'FIX (a): deepen the carve to clear wall + 2xSEAL. Lengthening the march alone cannot help — the raster is still solid at these crossings.',
    MARCH: 'FIX (b): lengthen _openings reach. Safer, cannot over-cut. Do this before touching carve depth.',
    NEITHER: 'NEITHER — most crossings are inside both limits, so the failure is elsewhere. Instrument one 1.40m crossing cell by cell before changing any constant.'
  })[dom2]);
  console.log('§C31 MECHANISM = ' + (withDoorNear.length === 0
    ? 'M1 — no door element anywhere on this cluster boundary. Upstream extraction, not this lane.'
    : (thick.length && thick[thick.length >> 1] > 6 * RW.RES
      ? 'M3 — doors ARE on the boundary but the wall there is thicker than the 1.20 m pierce, so the carve never breaks through.'
      : 'M2 — doors are on the boundary and the carve reaches, but no opening was detected. Opening detection is the fix.')));
  db.close();
})();
