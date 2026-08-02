// §21.42 FALSIFICATION PROBE, PART 2 — does the provenance rule actually REACH §C40c's 41 far ends?
//
// §DP1 (doorprov.js) proved provenance SEPARATES: 0.0% of >10 m2 pockets classify as doorway on both
// buildings. It did NOT prove the rule reaches the failure it was designed for. Clinic has only 10
// pure-carve pockets against §C40c's 39/41 sub-2 m2 far ends, so most far ends may be a DIFFERENT
// object. This probe answers that directly and is the gate on whether the merge is worth shipping.
//
// THE ISSUE IT PROVES OR DISPROVES: is "entirely inside a carve footprint" the right description of
// the pockets that terminate Clinic's graph?
//   PASS  — most far-end groups are single doorway-provenance pockets. The §21.41 merge fixes them.
//   FAIL  — far ends are mostly NOT pure-carve. Then §21.41's mechanism is only part of the story and
//           the merge is near a no-op; the frac histogram below says what they are instead.
// Reuses clinic17_dump.js's cluster walk verbatim so §C40c's 41 is the same 41.
const fs = require('fs'), path = require('path');
const WT = path.resolve(__dirname, '..');
const initSqlJs = require(path.join(process.env.HOME, 'bim-ootb', 'node_modules', 'sql.js'));
const RW = require(path.join(WT, 'viewer/lib/room_walker.js'));
const BLD = path.join(process.env.HOME, 'bim-ootb', 'buildings');
const quiet = fn => { const rl = console.log; console.log = () => {}; try { return fn(); } finally { console.log = rl; } };
const RES = RW.RES, PIERCE = 10 * RES;

function stamp(mask, g, cx, cy, bx, by, rot) {
  const nx = g.nx, ny = g.ny, xs0 = g.xs0, ys0 = g.ys0;
  const th = rot || 0, ct = Math.cos(th), st = Math.sin(th);
  const hx = bx / 2, hy = by / 2;
  const ax = Math.abs(hx * ct) + Math.abs(hy * st), ay = Math.abs(hx * st) + Math.abs(hy * ct);
  const i0 = Math.max(0, Math.floor((cx - ax - xs0) / RES)), i1 = Math.min(nx - 1, Math.floor((cx + ax - xs0) / RES));
  const j0 = Math.max(0, Math.floor((cy - ay - ys0) / RES)), j1 = Math.min(ny - 1, Math.floor((cy + ay - ys0) / RES));
  const half = RES / 2;
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
    const px = xs0 + (i + 0.5) * RES - cx, py = ys0 + (j + 0.5) * RES - cy;
    const lx = px * ct + py * st, ly = -px * st + py * ct;
    if (Math.abs(lx) <= hx + half && Math.abs(ly) <= hy + half) mask[i * ny + j] = 1;
  }
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
    const inVoid = [0], cellN = [0];
    const vm = new Uint8Array(nx * ny);
    (voidsBy[st] || []).forEach(v => {
      if (!v[6]) return;
      const lng = Math.max(v[2], v[3]), thin = Math.min(v[2], v[3]);
      stamp(vm, g, v[0], v[1], lng + 2 * RES, thin + (v[5] ? PIERCE : RES), v[4] || 0);
    });
    for (let si = 0; si < nx; si++) for (let sj = 0; sj < ny; sj++) {
      const sk = si * ny + sj;
      if (!g.enclosed[sk] || owner[sk]) continue;
      const id = ++next; inVoid[id] = 0; cellN[id] = 0;
      const stack = [sk]; owner[sk] = id;
      while (stack.length) {
        const k = stack.pop(), i = Math.floor(k / ny), j = k % ny;
        cellN[id]++; if (vm[k]) inVoid[id]++;
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
      if (!best || mem.length > best.mem.length) best = { st, mem, m, g, owner, find, nx, ny, inVoid, cellN, parent };
    });
  });

  const { st, mem, m, g, owner, find, nx, ny, inVoid, cellN } = best;
  const memSet = new Set(mem);
  const doors = doorsBy[st] || [];
  // members of each layer-1 group, so a far-end GROUP can be resolved to its pockets
  const membersOf = {};
  m.pockets.forEach(p => { const r = find(p.id); (membersOf[r] = membersOf[r] || []).push(p.id); });

  const far = [];
  for (let i = 1; i < nx - 1 && far.length < 400; i++) for (let j = 1; j < ny - 1; j++) {
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
      if (s * RES > PIERCE) continue;
      const mx = g.xs0 + (i + di * s / 2 + 0.5) * RES, my = g.ys0 + (j + dj * s / 2 + 0.5) * RES;
      let bd = 1e9;
      for (const d of doors) { const dist = Math.hypot(d[0] - mx, d[1] - my); if (dist < bd) bd = dist; }
      if (bd > 1.5) continue;
      let op = null;
      for (const o of m.openings) if (Math.hypot(o.cx - mx, o.cy - my) <= 1.0) { op = o; break; }
      if (!op) continue;
      const ga = find(op.a), gb = find(op.b);
      const fid = memSet.has(ga) ? gb : (memSet.has(gb) ? ga : null);
      if (fid === null) continue;
      const grp = m.groups.find(x => x.id === fid);
      far.push({ fid, area: grp ? grp.area : null, depth: grp ? grp.depth : null,
        pockets: (membersOf[fid] || []).length, farPocket: owner[kk] });
    }
  }

  const frac = id => cellN[id] ? inVoid[id] / cellN[id] : 0;
  const uniq = [...new Set(far.map(x => x.fid))];
  console.log('§DP4 storey=' + st + '  cluster=' + mem.length + ' groups   far-end link records=' + far.length +
    '   unique far-end groups=' + uniq.length);

  // per far-end GROUP: is every one of its pockets pure-carve? (that is what the merge removes)
  let allDoor = 0, someDoor = 0, noneDoor = 0;
  const hist = [0, 0, 0, 0, 0];    // frac 0 / 0-.25 / .25-.5 / .5-.99 / 1.0  (per far-end pocket)
  uniq.forEach(fid => {
    const ps = membersOf[fid] || [];
    const fs2 = ps.map(frac);
    const nAll = fs2.filter(f => f >= 1.0).length;
    if (nAll === ps.length && ps.length) allDoor++; else if (nAll) someDoor++; else noneDoor++;
  });
  [...new Set(far.map(x => x.farPocket))].forEach(pid => {
    const f = frac(pid);
    hist[f >= 1 ? 4 : f > 0.5 ? 3 : f > 0.25 ? 2 : f > 0 ? 1 : 0]++;
  });
  console.log('§DP4 far-end groups: ALL pockets pure-carve=' + allDoor + '   SOME=' + someDoor + '   NONE=' + noneDoor);
  console.log('§DP4 far-end POCKET carve-fraction histogram  0 / <=.25 / <=.5 / <1 / ==1  = ' + hist.join(' / '));
  const areas = uniq.map(fid => (m.groups.find(x => x.id === fid) || {}).area).filter(a => a != null).sort((a, b) => a - b);
  console.log('§DP4 far-end group area: median=' + (areas.length ? areas[areas.length >> 1].toFixed(2) : 'n/a') +
    'm2   <2m2=' + areas.filter(a => a < 2).length + '/' + areas.length +
    '   single-pocket groups=' + uniq.filter(fid => (membersOf[fid] || []).length === 1).length);
  // §DP5 — WHAT ARE THEY THEN? one line per far-end group: shape, provenance, and how it attaches.
  // A pocket whose bbox is door-sized and which touches a carve is a doorway however its cells
  // divide; a pocket that is neither is something else entirely and the merge must not touch it.
  console.log('§DP5 per far-end group  (dims = pocket bbox in m, carve = share of cells inside a carve rect)');
  uniq.forEach(fid => {
    const ps = membersOf[fid] || [];
    const grp = m.groups.find(x => x.id === fid) || {};
    const parts = ps.map(pid => {
      const p = m.pockets.find(x => x.id === pid) || {};
      const w = ((p.mxi - p.mni + 1) * RES).toFixed(2), h = ((p.mxj - p.mnj + 1) * RES).toFixed(2);
      return pid + ':' + w + 'x' + h + '/carve=' + (frac(pid) * 100).toFixed(0) + '%';
    });
    // how does it attach? every opening with this group at one end
    let nOpen = 0, nDoorOpen = 0, nbrDepth = [];
    m.openings.forEach(o => {
      const ga = find(o.a), gb = find(o.b);
      if (ga !== fid && gb !== fid) return;
      nOpen++; if (o.doors.length) nDoorOpen++;
      const other = ga === fid ? gb : ga;
      const og = m.groups.find(x => x.id === other);
      if (og) nbrDepth.push(og.depth);
    });
    console.log('  grp=' + fid + ' area=' + (grp.area || 0).toFixed(2) + 'm2 depth=' + grp.depth +
      ' pockets=' + ps.length + ' [' + parts.join(' ') + ']' +
      ' openings=' + nOpen + ' (door=' + nDoorOpen + ')' +
      ' nbrDepths=' + JSON.stringify(nbrDepth.sort((a, b) => a - b)));
  });
  console.log('§DP4 VERDICT = ' + (allDoor > uniq.length / 2
    ? 'REACHES — the merge removes most far ends; ship it.'
    : allDoor === 0
      ? 'NO-OP — not one far end is pure-carve. §21.41 named the wrong object; read the histogram.'
      : 'PARTIAL — only ' + allDoor + '/' + uniq.length + ' far ends are pure-carve. The merge helps but is not the cause.'));
  db.close();
})();
