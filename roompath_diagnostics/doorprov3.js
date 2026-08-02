// §21.42 PROBE 3 — the TRUE component boundary. Supersedes §C40/§C40c's boundary.
//
// WHY THIS EXISTS: §C40c defined "the cluster" as stranded groups with `area >= 2.0`, then measured
// the links leaving THAT set. The far ends it found are simply the sub-2 m2 groups the filter
// excluded — an artifact of the filter, not of the graph. §DP5 then showed each of those 8 far ends
// carries 2-5 door links onward and every neighbour is also depth -1. So the graph does NOT die in
// the doorway: the doorway passes traffic, and the whole component is cut off somewhere else.
//
// THE ISSUE IT PROVES OR DISPROVES: where does the unreachable component actually fail to meet the
// reachable world? Take the layer-2 graph over ALL groups with no area filter, find the component
// holding the 31-group cluster, and enumerate every place it is PHYSICALLY adjacent to a depth>=0
// group without a link.
//   Each such crossing is classified: raster clear? a door within 1.5 m? an opening record emitted?
//   That is the same four-way split §C40 used, now asked at the boundary that actually matters.
const fs = require('fs'), path = require('path');
const WT = path.resolve(__dirname, '..');
const initSqlJs = require(path.join(process.env.HOME, 'bim-ootb', 'node_modules', 'sql.js'));
const RW = require(path.join(WT, 'viewer/lib/room_walker.js'));
const BLD = path.join(process.env.HOME, 'bim-ootb', 'buildings');
const quiet = fn => { const rl = console.log; console.log = () => {}; try { return fn(); } finally { console.log = rl; } };
const RES = RW.RES, PIERCE = 10 * RES;

(async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(BLD, 'Clinic_extracted.db'))));
  const anch = RW.storeyZAnchors(db);
  const doorsBy = RW.storeyDoors(db, anch);
  const map = quiet(() => RW.spineMap(db));
  const st = 'Second Floor';
  const m = map[st], g = m.grid, nx = g.nx, ny = g.ny;
  const doors = doorsBy[st] || [];

  // rebuild layer-1 groups exactly as storeySpine does
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
  const areaOf = {}; m.groups.forEach(x => areaOf[x.id] = x.area);
  const depthOf = {}; m.groups.forEach(x => depthOf[x.id] = x.depth);

  // layer-2 components over ALL groups, no area filter
  const adj = {};
  m.links.forEach(l => { (adj[l.a] = adj[l.a] || []).push(l.b); (adj[l.b] = adj[l.b] || []).push(l.a); });
  const comp = {}; let nc = 0;
  m.groups.forEach(x => {
    if (comp[x.id]) return;
    const c = ++nc, stack = [x.id]; comp[x.id] = c;
    while (stack.length) { const v = stack.pop(); (adj[v] || []).forEach(w => { if (!comp[w]) { comp[w] = c; stack.push(w); } }); }
  });
  const size = {}, carea = {};
  m.groups.forEach(x => { size[comp[x.id]] = (size[comp[x.id]] || 0) + 1; carea[comp[x.id]] = (carea[comp[x.id]] || 0) + x.area; });
  const spineComp = comp[m.spineGroup];
  // the biggest unreachable component
  let target = 0, bestA = -1;
  Object.keys(carea).forEach(c => { if (+c !== spineComp && carea[c] > bestA) { bestA = carea[c]; target = +c; } });
  const inTarget = new Set(m.groups.filter(x => comp[x.id] === target).map(x => x.id));
  console.log('§DP6 storey=' + st + '  groups=' + m.groups.length + '  layer-2 components=' + nc +
    '   spine comp=' + spineComp + ' (' + size[spineComp] + ' groups, ' + carea[spineComp].toFixed(0) + 'm2)');
  console.log('§DP6 largest UNREACHABLE component=' + target + '  groups=' + size[target] +
    '  area=' + carea[target].toFixed(0) + 'm2   (all depth -1: ' +
    [...inTarget].every(id => depthOf[id] === -1) + ')');
  const comps = Object.keys(carea).map(c => ({ c: +c, n: size[c], a: carea[c] }))
    .sort((p, q) => q.a - p.a).slice(0, 6);
  console.log('§DP6 top components by area: ' + comps.map(x => 'c' + x.c + '=' + x.n + 'grp/' + x.a.toFixed(0) + 'm2' +
    (x.c === spineComp ? '(SPINE)' : '')).join('  '));

  // every physical crossing from the target component to a group OUTSIDE it
  const found = [];
  for (let i = 1; i < nx - 1; i++) for (let j = 1; j < ny - 1; j++) {
    const k = i * ny + j;
    if (!g.enclosed[k] || !inTarget.has(find(owner[k]))) continue;
    for (const [di, dj] of [[1, 0], [0, 1]]) {
      let s = 1, kk = -1;
      for (; s <= 14; s++) {
        const ii = i + di * s, jj = j + dj * s;
        if (ii < 0 || ii >= nx || jj < 0 || jj >= ny) { kk = -1; break; }
        kk = ii * ny + jj;
        if (g.enclosed[kk]) break;
      }
      if (kk < 0 || s > 14 || !g.enclosed[kk]) continue;
      const fg = find(owner[kk]);
      if (inTarget.has(fg)) continue;
      const gap = s * RES;
      const mx = g.xs0 + (i + di * s / 2 + 0.5) * RES, my = g.ys0 + (j + dj * s / 2 + 0.5) * RES;
      let bd = 1e9;
      for (const d of doors) { const dist = Math.hypot(d[0] - mx, d[1] - my); if (dist < bd) bd = dist; }
      let blocked = 0;
      for (let t = 1; t < s; t++) { const kt = (i + di * t) * ny + (j + dj * t); if (g.raw[kt]) blocked++; }
      let op = null;
      for (const o of m.openings) if (Math.hypot(o.cx - mx, o.cy - my) <= 1.0) { op = o; break; }
      found.push({ gap, bd, blocked, farGrp: fg, farDepth: depthOf[fg], farArea: areaOf[fg],
        op: !!op, opDoors: op ? op.doors.length : -1, comp: comp[fg] });
    }
  }
  const n = found.length;
  const toSpine = found.filter(x => x.comp === spineComp);
  console.log('§DP6 physical crossings out of the component = ' + n +
    '   of which land in the SPINE component = ' + toSpine.length);
  const bucket = (arr, label) => {
    if (!arr.length) { console.log('  ' + label + ': none'); return; }
    const clear = arr.filter(x => x.blocked === 0).length;
    const near = arr.filter(x => x.bd <= 1.5).length;
    const withOp = arr.filter(x => x.op).length;
    const gaps = arr.map(x => x.gap).sort((a, b) => a - b);
    console.log('  ' + label + ' n=' + arr.length + '  raster CLEAR=' + clear + '  door<=1.5m=' + near +
      '  opening emitted=' + withOp + '  gap median=' + gaps[gaps.length >> 1].toFixed(2) + 'm' +
      '  gap min=' + gaps[0].toFixed(2) + 'm');
  };
  bucket(found, 'ALL crossings');
  bucket(toSpine, 'to SPINE comp');
  bucket(toSpine.filter(x => x.gap <= PIERCE), 'to SPINE, gap<=PIERCE');
  bucket(toSpine.filter(x => x.gap <= PIERCE && x.bd <= 1.5), 'to SPINE, gap<=PIERCE, door near');
  console.log('§DP6 VERDICT = ' + (toSpine.length === 0
    ? 'NO PHYSICAL CONTACT — the component never touches the spine within 14 cells. It is separated by real wall, i.e. reachable only via a stair/lift or another storey. Not a raster defect.'
    : toSpine.filter(x => x.blocked === 0).length > 0
      ? 'DETECTION — ' + toSpine.filter(x => x.blocked === 0).length + ' crossing(s) are clear raster yet no link. _openings misses them.'
      : 'BLOCKED RASTER — every contact still has wall between; the carve never reached these.'));
  db.close();
})();
