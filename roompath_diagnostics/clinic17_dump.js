// §21.40 — §21.39 NEXT item 1. Clinic's 31-room cluster survived the pierce fix. §21.38 measured 17
// of its 51 door-adjacent boundary crossings as sitting INSIDE both the pierce and the march reach,
// so no constant can explain them. This enumerates those 17 and asks the two questions that split
// the remaining causes apart:
//   Q1 IS THE RASTER ACTUALLY CLEAR ALONG THE CROSSING? If yes the carve worked and the failure is
//      in opening DETECTION. If no, the carve never reached, despite the gap being inside its depth.
//   Q2 IF NOT CLEAR — DOES THE DOOR'S CARVE RECT EVEN COVER THE CROSSING? A door modelled narrower
//      than its rasterised wall, or rotated off the crossing line, cuts beside the hole instead of
//      through it. That is geometry, not depth, and no constant fixes it.
const fs = require('fs'), path = require('path');
const WT = path.resolve(__dirname, '..');
const initSqlJs = require(path.join(process.env.HOME, 'bim-ootb', 'node_modules', 'sql.js'));
const RW = require(path.join(WT, 'viewer/lib/room_walker.js'));
const BLD = path.join(process.env.HOME, 'bim-ootb', 'buildings');
const quiet = fn => { const rl = console.log; console.log = () => {}; try { return fn(); } finally { console.log = rl; } };
const RES = RW.RES, PIERCE = 10 * RES;

function inRect(cx, cy, bx, by, rot, px, py) {
  const th = rot || 0, ct = Math.cos(th), st = Math.sin(th);
  const dx = px - cx, dy = py - cy;
  return Math.abs(dx * ct + dy * st) <= bx / 2 && Math.abs(-dx * st + dy * ct) <= by / 2;
}

(async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(BLD, 'Clinic_extracted.db'))));
  const anch = RW.storeyZAnchors(db);
  const doorsBy = RW.storeyDoors(db, anch);
  const voidsBy = RW.storeyVoids(db, anch);
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
  const voids = (voidsBy[st] || []).filter(v => v[6] && v[5]);
  console.log('§C40 storey=' + st + '  cluster=' + mem.length + ' groups  doors=' + doors.length + '  door-voids=' + voids.length);

  const found = [];
  for (let i = 1; i < nx - 1 && found.length < 400; i++) for (let j = 1; j < ny - 1; j++) {
    const k = i * ny + j;
    if (!g.enclosed[k] || !memSet.has(find(owner[k]))) continue;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      let s = 1, kk = -1;
      for (; s <= 14; s++) {
        const ii = i + di * s, jj = j + dj * s;
        if (ii < 0 || ii >= nx || jj < 0 || jj >= ny) { kk = -1; break; }
        kk = ii * ny + jj;
        if (g.enclosed[kk]) break;
      }
      if (kk < 0 || s > 14 || !g.enclosed[kk]) continue;
      if (memSet.has(find(owner[kk]))) continue;
      const gap = s * RES;
      if (gap > PIERCE) continue;                       // §21.38's "inside both limits" set
      const mx = g.xs0 + (i + di * s / 2 + 0.5) * RES, my = g.ys0 + (j + dj * s / 2 + 0.5) * RES;
      let bd = 1e9, bdoor = null;
      for (const d of doors) { const dist = Math.hypot(d[0] - mx, d[1] - my); if (dist < bd) { bd = dist; bdoor = d; } }
      if (bd > 1.5) continue;
      // Q1: is `raw` clear all the way across?
      let blocked = 0;
      for (let t = 1; t < s; t++) { const kt = (i + di * t) * ny + (j + dj * t); if (g.raw[kt]) blocked++; }
      // Q2: does ANY door-void carve rect cover the crossing midpoint?
      let covered = false, coverer = null;
      for (const v of voids) {
        const lng = Math.max(v[2], v[3]), thin = Math.min(v[2], v[3]);
        if (inRect(v[0], v[1], lng + 2 * RES, thin + PIERCE, v[4], mx, my)) { covered = true; coverer = v; break; }
      }
      // §21.40b — the direct question: did _openings emit ANYTHING here, and if so was it matched
      // to a door (making it a LINK) or not (making it a FUSION)? A link that lands with both ends
      // inside the cluster keeps the cluster stranded just as effectively as no opening at all.
      let op = null;
      for (const o of m.openings) if (Math.hypot(o.cx - mx, o.cy - my) <= 1.0) { op = o; break; }
      // §21.40c — the far end of the link that leaves the cluster. If these are sub-2m2 slivers with
      // depth -1, the defect is the `area >= 2.0` filter in the ANALYSIS, not anything geometric.
      let farId = null, farArea = null, farDepth = null;
      if (op) {
        const ga = find(op.a), gb = find(op.b);
        const far = memSet.has(ga) ? gb : (memSet.has(gb) ? ga : null);
        if (far !== null) {
          const grp = m.groups.find(x => x.id === far);
          farId = far; farArea = grp ? grp.area : null; farDepth = grp ? grp.depth : null;
        }
      }
      found.push({ gap, bd, blocked, span: s - 1, covered, farId, farArea, farDepth,
        op: !!op, opDoors: op ? op.doors.length : -1,
        opInside: op ? (memSet.has(find(op.a)) && memSet.has(find(op.b))) : false,
        samePocket: owner[k] === owner[kk], doorW: Math.max(bdoor[2], bdoor[3]) });
    }
  }

  const n = found.length;
  const clear = found.filter(x => x.blocked === 0).length;
  const cov = found.filter(x => x.covered).length;
  const same = found.filter(x => x.samePocket).length;
  console.log('§C40 crossings inside BOTH limits with a door <=1.5m = ' + n);
  console.log('§C40 Q1 raster CLEAR across the crossing = ' + clear + '/' + n +
    '   still BLOCKED = ' + (n - clear));
  console.log('§C40 Q2 covered by a door-void carve rect = ' + cov + '/' + n +
    '   NOT covered = ' + (n - cov));
  console.log('§C40    both sides in the SAME pocket = ' + same + '/' + n);
  const withOp = found.filter(x => x.op).length;
  const opLink = found.filter(x => x.op && x.opDoors > 0).length;
  const opFuse = found.filter(x => x.op && x.opDoors === 0).length;
  const opIn = found.filter(x => x.op && x.opInside).length;
  console.log('§C40b opening record EXISTS at the crossing = ' + withOp + '/' + n + '   none = ' + (n - withOp));
  console.log('§C40b    of those: door-matched (LINK) = ' + opLink + '   doorless (FUSION) = ' + opFuse +
    '   with BOTH ends inside the cluster = ' + opIn);
  const far = found.filter(x => x.farId !== null && x.farArea !== null);
  const tiny = far.filter(x => x.farArea < 2.0).length;
  const unreached = far.filter(x => x.farDepth === -1).length;
  const reached = far.filter(x => x.farDepth >= 0).length;
  const fa = far.map(x => x.farArea).sort((a, b) => a - b);
  console.log('§C40c far-end groups of links leaving the cluster = ' + far.length);
  console.log('§C40c    far-end area < 2.0m2 (SLIVER, invisible to strandedIds) = ' + tiny + '/' + far.length +
    '   area median=' + (fa.length ? fa[fa.length >> 1].toFixed(2) : 'n/a') + 'm2');
  console.log('§C40c    far-end depth -1 (also unreachable) = ' + unreached +
    '   depth >=0 (REACHES THE SPINE) = ' + reached);
  console.log('§C40c VERDICT = ' + (far.length === 0 ? 'no outward links after all — re-check the boundary test'
    : reached > 0 ? 'BFS DEFECT — ' + reached + ' link(s) reach a group WITH depth, so the cluster should not be depth -1. The depth propagation is wrong, not the map.'
    : tiny > far.length / 2 ? 'SLIVER FILTER — most far ends are sub-2m2 groups that are themselves unreachable. Generic fix: slivers must carry links, not be dropped.'
    : 'CHAINED — far ends are real groups that are themselves stranded; the break is further out, walk one more hop.'));
  const dw = found.map(x => x.doorW).sort((a, b) => a - b);
  const gp = found.map(x => x.gap).sort((a, b) => a - b);
  if (n) console.log('§C40 door width median=' + dw[n >> 1].toFixed(2) + 'm   gap median=' + gp[n >> 1].toFixed(2) +
    'm   nearest-door distance median=' + found.map(x => x.bd).sort((a, b) => a - b)[n >> 1].toFixed(2) + 'm');
  console.log('§C40 VERDICT = ' + (n === 0 ? 'NONE LEFT — the pierce fix already absorbed this set.'
    : clear === n ? 'DETECTION — the carve cleared every crossing; _openings is not emitting them. Fix is in detection, not geometry.'
    : cov < n / 2 ? 'GEOMETRY — most crossings are not covered by any door carve rect. The door is modelled beside the hole, not in it. No constant fixes this.'
    : 'MIXED — carve covers but raster still blocked: the void rect is being clipped. Dump one crossing cell-by-cell next.'));
  db.close();
})();
