// §21.42 PROBE 6 — ask each door along its OWN NORMAL, and sweep the reach instead of fixing it.
//
// WHY: §DP8's isotropic window flipped its own verdict with window size (SLACK=2 -> "100% of
// stranded area has no door to the spine"; SLACK=8 -> "77% does"). A square window around a door
// centre is the wrong instrument: widen it and it reaches past the neighbouring room into a third
// space. A door does not connect its surroundings — it connects the space IN FRONT of it to the
// space BEHIND it. So march along the panel's normal only.
//
// The normal comes from the door VOID's own rotation (storeyVoids carries rotation_z; storeyDoors
// does not), and it is the same local frame _rasterizeSpine carves in: local x = (cos,sin) is the
// leaf span, local y = (-sin,cos) is the thickness — the normal.
//
// THE ISSUE IT PROVES OR DISPROVES: does a door physically join the stranded component to the spine?
// Reported as a SWEEP over reach, because a single reach is a tuned constant and this lane does not
// accept one (§21.33). A conclusion is only taken where the curve is FLAT.
const fs = require('fs'), path = require('path');
const WT = path.resolve(__dirname, '..');
const initSqlJs = require(path.join(process.env.HOME, 'bim-ootb', 'node_modules', 'sql.js'));
const RW = require(path.join(WT, 'viewer/lib/room_walker.js'));
const BLD = path.join(process.env.HOME, 'bim-ootb', 'buildings');
const quiet = fn => { const rl = console.log; console.log = () => {}; try { return fn(); } finally { console.log = rl; } };
const RES = RW.RES;
const REACH = [3, 4, 5, 6, 8, 10, 12];      // cells each side, 0.60m .. 2.40m at RES=0.20

async function run(SQL, name, file) {
  const db = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(BLD, file))));
  const anch = RW.storeyZAnchors(db);
  const voidsBy = RW.storeyVoids(db, anch);
  const map = quiet(() => RW.spineMap(db));
  const tot = {}; REACH.forEach(r => tot[r] = { area: 0, comps: 0 });
  const ctl = {}; REACH.forEach(r => ctl[r] = { n: 0, bothSides: 0, twoGroups: 0 });
  let strandedArea = 0, nComp = 0;

  Object.keys(map).sort().forEach(st => {
    const m = map[st];
    if (!m.pockets.length || !m.groups.length) return;
    const g = m.grid, nx = g.nx, ny = g.ny;
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
    const compAt = (x, y) => {
      const i = Math.floor((x - g.xs0) / RES), j = Math.floor((y - g.ys0) / RES);
      if (i < 0 || i >= nx || j < 0 || j >= ny) return 0;
      const k = i * ny + j;
      return g.enclosed[k] ? comp[find(owner[k])] || 0 : 0;
    };
    // §DP10 CONTROL — the zero below is only meaningful if this instrument can see a door we DO
    // link. For every door void, march the same normal and ask whether the two sides land in two
    // different GROUPS (any component). A high share means the normal and the reach are right and
    // the zero is a fact about the building; a low share means the instrument is blind and the zero
    // says nothing. Same shape as §21.6's control, for the same reason.
    const groupAt = (x, y) => {
      const i = Math.floor((x - g.xs0) / RES), j = Math.floor((y - g.ys0) / RES);
      if (i < 0 || i >= nx || j < 0 || j >= ny) return 0;
      const k = i * ny + j;
      return g.enclosed[k] ? find(owner[k]) : 0;
    };
    // per reach: which stranded comps are joined to the spine by SOME door's normal?
    const joined = {}; REACH.forEach(r => joined[r] = new Set());
    (voidsBy[st] || []).forEach(v => {
      if (!v[5] || !v[6]) return;                       // door voids at floor level only
      const th = v[4] || 0, nxv = -Math.sin(th), nyv = Math.cos(th);
      REACH.forEach(R => {
        let ga = 0, gb = 0;
        for (let s = 1; s <= R && !ga; s++) ga = groupAt(v[0] + nxv * s * RES, v[1] + nyv * s * RES);
        for (let s = 1; s <= R && !gb; s++) gb = groupAt(v[0] - nxv * s * RES, v[1] - nyv * s * RES);
        ctl[R].n++;
        if (ga && gb) ctl[R].bothSides++;
        if (ga && gb && ga !== gb) ctl[R].twoGroups++;
      });
      REACH.forEach(R => {
        let ca = 0, cb = 0;
        for (let s = 1; s <= R && !ca; s++) ca = compAt(v[0] + nxv * s * RES, v[1] + nyv * s * RES);
        for (let s = 1; s <= R && !cb; s++) cb = compAt(v[0] - nxv * s * RES, v[1] - nyv * s * RES);
        if (!ca || !cb || ca === cb) return;
        if (ca === spineComp) joined[R].add(cb); else if (cb === spineComp) joined[R].add(ca);
      });
    });
    Object.keys(carea).forEach(cs => {
      const c = +cs;
      if (c === spineComp || carea[c] < 2.0) return;
      nComp++; strandedArea += carea[c];
      REACH.forEach(R => { if (joined[R].has(c)) { tot[R].area += carea[c]; tot[R].comps++; } });
    });
  });

  const pct = a => strandedArea ? (100 * a / strandedArea).toFixed(1) + '%' : '—';
  console.log('\n=== ' + name + '   stranded comps=' + nComp + '  stranded area=' + strandedArea.toFixed(0) + 'm2 ===');
  console.log('§DP9 reach(m) | stranded comps joined to spine by a door normal | that area | share');
  REACH.forEach(R => console.log('  ' + (R * RES).toFixed(2).padStart(5) + '  |  ' +
    String(tot[R].comps).padStart(3) + '/' + nComp + '  |  ' + tot[R].area.toFixed(0).padStart(5) + 'm2  |  ' + pct(tot[R].area)));
  console.log('§DP10 CONTROL — same march over ALL door voids: does it see two sides at all?');
  console.log('  reach(m) | doors | both sides enclosed | two DIFFERENT groups');
  REACH.forEach(R => { const c = ctl[R]; const q = (a) => c.n ? (100 * a / c.n).toFixed(1) + '%' : '-';
    console.log('  ' + (R * RES).toFixed(2).padStart(6) + '   | ' + String(c.n).padStart(5) + ' | ' +
      String(c.bothSides).padStart(6) + ' (' + q(c.bothSides) + ')  | ' + String(c.twoGroups).padStart(6) + ' (' + q(c.twoGroups) + ')'); });
  db.close();
}

(async () => {
  const SQL = await initSqlJs();
  await run(SQL, 'Clinic', 'Clinic_extracted.db');
  await run(SQL, 'LTU', 'LTU_AHouse_extracted.db');
})();
