// §21.42 PROBE 5 — fleet version of §DP7. How much stranded area has NO modelled same-storey link?
//
// §DP7 answered it for one storey of Clinic: 96 doors, 49 touch the 310 m2 unreachable component,
// 43 touch the spine, ZERO touch both; no stair on the storey. This asks the same question of every
// storey of both fixtures and reports the SHARE OF STRANDED AREA that sits in a component no door
// joins to the spine.
//
// THE ISSUE IT PROVES OR DISPROVES: is the residual unroutable share a raster defect we can still
// fix, or a model-scope limit (vertical circulation, which a per-storey graph cannot represent)?
//   HIGH share with no door contact -> scope limit; more carve/detect work cannot recover it, and the
//     honest baseline for this lane has to exclude it or the graph has to go multi-storey.
//   LOW share -> the residue really is detection and the lane continues as it was.
// Also reports STAIR-IN-COMPONENT (any storey's stair whose XY falls inside the component), which is
// the positive evidence for vertical entry rather than mere absence of a door.
const fs = require('fs'), path = require('path');
const WT = path.resolve(__dirname, '..');
const initSqlJs = require(path.join(process.env.HOME, 'bim-ootb', 'node_modules', 'sql.js'));
const RW = require(path.join(WT, 'viewer/lib/room_walker.js'));
const BLD = path.join(process.env.HOME, 'bim-ootb', 'buildings');
const quiet = fn => { const rl = console.log; console.log = () => {}; try { return fn(); } finally { console.log = rl; } };
const RES = RW.RES;

async function run(SQL, name, file) {
  const db = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(BLD, file))));
  const anch = RW.storeyZAnchors(db);
  const doorsBy = RW.storeyDoors(db, anch);
  const map = quiet(() => RW.spineMap(db));
  // every stair/ramp XY in the building, storey ignored on purpose (a stair belongs to the storey it
  // rises FROM, so the storey it arrives on never lists it)
  const stairXY = [];
  try {
    const r = db.exec("SELECT t.center_x,t.center_y FROM elements_meta m JOIN element_transforms t ON t.guid=m.guid " +
      "WHERE (m.ifc_class LIKE 'IfcStair%' OR m.ifc_class LIKE 'IfcRamp%') AND t.center_x IS NOT NULL");
    if (r.length) r[0].values.forEach(v => stairXY.push([v[0], v[1]]));
  } catch (e) { /* no stairs */ }

  let strandedArea = 0, noDoorArea = 0, withStairArea = 0, spineAreaAll = 0, nComp = 0, nNoDoor = 0;
  const rows = [];
  Object.keys(map).sort().forEach(st => {
    const m = map[st];
    if (!m.pockets.length || !m.groups.length) return;
    const g = m.grid, nx = g.nx, ny = g.ny;
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
    spineAreaAll += carea[spineComp] || 0;
    // which components does each door's own footprint touch?
    // SLACK is the only knob here and it exists to defend the NEGATIVE result: the engine's own
    // matcher uses half-span + 2 cells, which may not reach across SEAL's band on both sides, so a
    // door joining two components could read as touching one. Widening to 8 cells (2.0 m at
    // RES=0.20) covers the band twice over. If the straddle count is still zero at 8, the absence is
    // real and not an artifact of the window.
    const SLACK = +(process.env.SLACK || 2);
    const touch = {};                                  // comp -> Set(doorIdx)
    doors.forEach((d, di) => {
      const w = Math.max(d[2], d[3]) / 2 + SLACK * RES;
      const i0 = Math.max(0, Math.floor((d[0] - w - g.xs0) / RES)), i1 = Math.min(nx - 1, Math.floor((d[0] + w - g.xs0) / RES));
      const j0 = Math.max(0, Math.floor((d[1] - w - g.ys0) / RES)), j1 = Math.min(ny - 1, Math.floor((d[1] + w - g.ys0) / RES));
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const k = i * ny + j;
        if (!g.enclosed[k]) continue;
        const c = comp[find(owner[k])];
        if (c) (touch[c] = touch[c] || new Set()).add(di);
      }
    });
    const spineDoors = touch[spineComp] || new Set();
    Object.keys(carea).forEach(cs => {
      const c = +cs;
      if (c === spineComp) return;
      const a = carea[c];
      if (a < 2.0) return;                              // ignore sliver components, they carry no room
      nComp++; strandedArea += a;
      const ds = touch[c] || new Set();
      let straddle = 0; ds.forEach(di => { if (spineDoors.has(di)) straddle++; });
      // stair inside this component?
      let stair = 0;
      stairXY.forEach(([sx, sy]) => {
        const i = Math.floor((sx - g.xs0) / RES), j = Math.floor((sy - g.ys0) / RES);
        if (i < 0 || i >= nx || j < 0 || j >= ny) return;
        const k = i * ny + j;
        if (g.enclosed[k] && comp[find(owner[k])] === c) stair++;
      });
      if (!straddle) { nNoDoor++; noDoorArea += a; if (stair) withStairArea += a; }
      if (a >= 20) rows.push({ st, c, a, doors: ds.size, straddle, stair });
    });
  });

  const pct = (a, b) => b ? (100 * a / b).toFixed(1) + '%' : '—';
  console.log('\n=== ' + name + ' ===');
  rows.sort((p, q) => q.a - p.a).slice(0, 8).forEach(r => console.log(
    '  ' + r.st.padEnd(16) + ' comp' + r.c + ' area=' + r.a.toFixed(0) + 'm2 doorsTouching=' + r.doors +
    ' straddlingSpine=' + r.straddle + ' stairsInside=' + r.stair));
  console.log('§DP8 stranded components (>=2m2) = ' + nComp + '   total stranded area = ' + strandedArea.toFixed(0) + 'm2' +
    '   (spine area ' + spineAreaAll.toFixed(0) + 'm2)');
  console.log('§DP8 components with ZERO door straddling to the spine = ' + nNoDoor + '/' + nComp +
    '   = ' + noDoorArea.toFixed(0) + 'm2 = ' + pct(noDoorArea, strandedArea) + ' of stranded area');
  console.log('§DP8    of that, area containing a STAIR/RAMP (vertical entry) = ' + withStairArea.toFixed(0) + 'm2 = ' +
    pct(withStairArea, noDoorArea) + ' of the no-door area');
  console.log('§DP8 VERDICT = ' + (noDoorArea / Math.max(1, strandedArea) > 0.5
    ? 'SCOPE LIMIT — most stranded area has no door joining it to the spine on its own storey. A per-storey graph cannot reach it; more carve/detection work will not recover it.'
    : 'DETECTION — most stranded area IS joined by a door that produced no link. The residue is still ours to fix.'));
  db.close();
}

(async () => {
  const SQL = await initSqlJs();
  await run(SQL, 'Clinic', 'Clinic_extracted.db');
  await run(SQL, 'LTU', 'LTU_AHouse_extracted.db');
})();
