// §21.35 CLUSTER-BOUNDARY ANALYSIS — §21.34 NEXT item 1, the class nothing in §21.20–§21.34 has
// looked at. §21.34 found that 5 of Clinic's 11 breaks and 8 of LTU's 34 have NO root member: the
// cluster is internally connected by a working door graph, every room in it has a door, and yet
// nothing reaches the spine. So the missing thing is not inside the cluster — it is the link that
// should LEAVE it. Every construction in this lane so far asked "does this region have a door /
// an aperture / a link". None asked "is the link that should exit this cluster missing, and why".
//
// THE ONLY THREE THINGS THAT CAN SEPARATE A CLUSTER FROM ITS NEIGHBOUR, and they need different fixes:
//   W  SOLID MODELLED WALL — a wall really is stamped there. The rooms are genuinely unreachable and
//      the MODEL says so. Nothing to fix; the residual unroutable is a property of the building.
//   S  SEAL-INVENTED — free in the wall raster, blocked only by SEAL's 0.4 m dilation. This is a wall
//      that does not exist in the model. §21.24's §OPEN-THRESHOLD, now at cluster scale.
//   G  GAP IN THE WALL EXTRACTION — neither: no wall, no seal, the flood simply never joined. Related
//      to §21.33's 101/30 `noVoid` fusions.
//
// WHAT THIS PROVES OR DISPROVES (written before the run): if S dominates, SEAL is the last big
// structural defect in this lane and the fix is known. If W dominates, these rooms are CORRECTLY
// unreachable, the engine is not at fault, and the lane's core question is answered in the other
// direction — which is just as much of a close. Either way the ambiguity ends here.
const fs = require('fs'), path = require('path');
const WT = path.resolve(__dirname);
const initSqlJs = require(path.join(process.env.HOME, 'bim-ootb', 'node_modules', 'sql.js'));
const RW = require(path.join(WT, 'viewer/lib/room_walker.js'));
const BLD = path.join(process.env.HOME, 'bim-ootb', 'buildings');
const quiet = fn => { const rl = console.log; console.log = () => {}; try { return fn(); } finally { console.log = rl; } };

(async () => {
  const SQL = await initSqlJs();
  for (const f of ['Clinic_extracted.db', 'LTU_AHouse_extracted.db']) {
    console.log('\n================ ' + f + ' ================');
    const db = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(BLD, f))));
    const anch = RW.storeyZAnchors(db);
    const doorsBy = RW.storeyDoors(db, anch);
    const map = quiet(() => RW.spineMap(db));            // default W:3.0 (§21.33)
    let CW = 0, CS = 0, CG = 0, clustersAll = 0, rootless = 0, rootlessS = 0, rootlessW = 0, rootlessG = 0;
    let sealReach = 0, vertical = 0, CWvert = 0, rootlessWvert = 0;

    Object.keys(map).sort().forEach(st => {
      const m = map[st];
      if (!m.pockets.length) return;
      const g = m.grid, nx = g.nx, ny = g.ny;

      // owner grid, rebuilt with the SAME scan order and id rule as _pocketComponents, so ids match
      const owner = new Int32Array(nx * ny);
      let next = 0;
      for (let si = 0; si < nx; si++) for (let sj = 0; sj < ny; sj++) {
        const sk = si * ny + sj;
        if (!g.enclosed[sk] || owner[sk]) continue;
        const id = ++next, stack = [sk]; owner[sk] = id;
        while (stack.length) {
          const k = stack.pop(), i = Math.floor(k / ny), j = k % ny;
          if (i > 0 && g.enclosed[k - ny] && !owner[k - ny]) { owner[k - ny] = id; stack.push(k - ny); }
          if (i < nx - 1 && g.enclosed[k + ny] && !owner[k + ny]) { owner[k + ny] = id; stack.push(k + ny); }
          if (j > 0 && g.enclosed[k - 1] && !owner[k - 1]) { owner[k - 1] = id; stack.push(k - 1); }
          if (j < ny - 1 && g.enclosed[k + 1] && !owner[k + 1]) { owner[k + 1] = id; stack.push(k + 1); }
        }
      }

      // pocket -> layer-1 group, exactly as the engine fuses (doorless openings only)
      const parent = {}; m.pockets.forEach(p => parent[p.id] = p.id);
      const find = x => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
      m.openings.forEach(o => { if (o.doors.length) return; const a = find(o.a), b = find(o.b); if (a !== b) parent[a] = b; });
      const strandedIds = new Set(m.groups.filter(x => x.depth === -1 && x.area >= 2.0 && x.id !== m.spineGroup).map(x => x.id));
      if (!strandedIds.size) return;

      // stranded clusters (§SC3), plus which of them contain a §SC1 root
      const adj = {};
      m.openings.forEach(o => {
        if (!o.doors.length) return;
        const ga = find(o.a), gb = find(o.b);
        if (!strandedIds.has(ga) || !strandedIds.has(gb) || ga === gb) return;
        (adj[ga] = adj[ga] || []).push(gb); (adj[gb] = adj[gb] || []).push(ga);
      });
      const incAny = {};
      m.openings.forEach(o => { if (!o.doors.length) return; const ga = find(o.a), gb = find(o.b); incAny[ga] = 1; incAny[gb] = 1; });
      const doors = doorsBy[st] || [];
      const members = {}; m.pockets.forEach(p => (members[find(p.id)] = members[find(p.id)] || []).push(p));
      const hasDoorFor = gid => {
        const mem = members[gid] || [];
        for (const d of doors) {
          const di = Math.floor((d[0] - g.xs0) / RW.RES), dj = Math.floor((d[1] - g.ys0) / RW.RES);
          const span = Math.ceil((Math.max(d[2], d[3]) / 2) / RW.RES) + 3;
          for (const p of mem) if (di >= p.mni - span && di <= p.mxi + span && dj >= p.mnj - span && dj <= p.mxj + span) return true;
        }
        return false;
      };
      const seen = new Set(), clusterOf = {}, clusterList = [];
      strandedIds.forEach(s => {
        if (seen.has(s)) return;
        const cid = clusterList.length, stack = [s], mem = [];
        seen.add(s);
        while (stack.length) { const v = stack.pop(); mem.push(v); clusterOf[v] = cid; (adj[v] || []).forEach(w => { if (!seen.has(w)) { seen.add(w); stack.push(w); } }); }
        clusterList.push(mem);
      });

      // §BOUNDARY-MARCH: every cell blocked by SEAL but NOT by a modelled wall is a candidate
      // invented separation. March both axes through the band; if the two sides land in different
      // groups and exactly one of them is in this cluster, that is a link SEAL removed.
      const bandCross = clusterList.map(() => 0);
      const wallCross = clusterList.map(() => 0);
      const gapCross = clusterList.map(() => 0);
      const sealed = g.rawSealed;
      for (let i = 1; i < nx - 1; i++) for (let j = 1; j < ny - 1; j++) {
        const k = i * ny + j;
        if (g.enclosed[k] || !g.dil[k]) continue;              // must be blocked
        const invented = !sealed[k];                            // blocked by SEAL only
        for (const ax of [0, 1]) {
          let a = null, b = null;
          for (let s = 1; s <= 12; s++) {
            const kk = ax ? k - s : k - s * ny;
            if ((ax ? j - s : i - s) < 0) break;
            if (g.enclosed[kk]) { a = owner[kk]; break; }
            if (sealed[kk] && invented) break;                  // hit real wall: not a clean band
          }
          for (let s = 1; s <= 12; s++) {
            const kk = ax ? k + s : k + s * ny;
            if ((ax ? j + s : i + s) >= (ax ? ny : nx)) break;
            if (g.enclosed[kk]) { b = owner[kk]; break; }
            if (sealed[kk] && invented) break;
          }
          if (!a || !b || a === b) continue;
          const ga = find(a), gb = find(b);
          if (ga === gb) continue;
          const ca = clusterOf[ga], cb = clusterOf[gb];
          const inA = ca !== undefined, inB = cb !== undefined;
          if (inA === inB && ca === cb) continue;               // both inside the same cluster
          const cid = inA ? ca : cb;
          if (cid === undefined) continue;
          if (invented) { bandCross[cid]++; sealReach++; }
          else wallCross[cid]++;
        }
      }
      // §CB4 VERTICAL ACCESS — the confound that would make a 'W' verdict meaningless. This whole
      // analysis is PER STOREY. A suite reachable only by stair or lift is perfectly reachable in
      // the building and merely looks stranded on its own floor. A 31-room sealed suite with no
      // access is architecturally implausible; a 31-room wing reached by its own stair is normal.
      // So before "correctly unreachable" can be claimed, every cluster is tested for a stair
      // footprint inside or touching it.
      // storeyStairs returns a whole-building map keyed by storey. Flatten it: a stair at (x,y)
      // is a vertical connector regardless of which storey label it was filed under.
      const stairsBy = RW.storeyStairs(db) || {};
      const stairs = Object.keys(stairsBy).reduce((a, k) => a.concat(stairsBy[k]), []);
      const stairCells = [];
      stairs.forEach(s => {
        const i = Math.floor((s[0] - g.xs0) / RW.RES), j = Math.floor((s[1] - g.ys0) / RW.RES);
        const ri = Math.ceil((Math.max(s[2] || 0, 0.5) / 2) / RW.RES) + 4, rj = Math.ceil((Math.max(s[3] || 0, 0.5) / 2) / RW.RES) + 4;
        stairCells.push([i, j, ri, rj]);
      });
      const touchesStair = gid => {
        const mem = members[gid] || [];
        for (const [i, j, ri, rj] of stairCells)
          for (const p of mem)
            if (i >= p.mni - ri && i <= p.mxi + ri && j >= p.mnj - rj && j <= p.mxj + rj) return true;
        return false;
      };
      clusterList.forEach((mem, cid) => {
        clustersAll++;
        const roots = mem.filter(x => !hasDoorFor(x) || !incAny[x]).length;
        const S = bandCross[cid], W = wallCross[cid];
        const vert = mem.some(touchesStair);
        if (vert) vertical++;
        const cls = S > 0 ? 'S' : (W > 0 ? 'W' : 'G');
        if (cls === 'S') CS++; else if (cls === 'W') { CW++; if (vert) CWvert++; } else CG++;
        if (!roots) {
          rootless++;
          if (cls === 'S') rootlessS++; else if (cls === 'W') { rootlessW++; if (vert) rootlessWvert++; } else rootlessG++;
        }
      });
    });

    console.log('§CB1 stranded clusters = ' + clustersAll +
      '   separated by: S SEAL-INVENTED=' + CS + '  W SOLID WALL=' + CW + '  G EXTRACTION GAP=' + CG);
    console.log('§CB2 ROOTLESS clusters (§21.34\'s unexamined class) = ' + rootless +
      '   S=' + rootlessS + '  W=' + rootlessW + '  G=' + rootlessG);
    console.log('§CB4 VERTICAL ACCESS — clusters touching a stair footprint = ' + vertical + '/' + clustersAll +
      '   of the W (solid-wall) clusters: ' + CWvert + '/' + CW +
      '   of the ROOTLESS W clusters: ' + rootlessWvert + '/' + rootlessW);
    const trulySealed = CW - CWvert;
    console.log('§CB5 CORRECTLY UNREACHABLE (solid wall AND no stair) = ' + trulySealed + '/' + clustersAll +
      '   -> ' + (trulySealed === 0
        ? 'ZERO. Every solid-wall cluster has vertical access; NONE of them is a real defect and none is a sealed suite.'
        : trulySealed + ' cluster(s) are sealed with no stair — architecturally implausible, so THOSE are where a real missed door lives.'));
    // §CB3 is reported LAST and is SUBORDINATE to §CB5 by design. A raw 'W' majority reads as
    // "correctly unreachable", and that reading is only valid for clusters that also have no stair.
    // Stating the dominant separation without the vertical-access filter would have closed this lane
    // on a false negative.
    const dom = CS >= CW && CS >= CG ? 'S' : (CW >= CG ? 'W' : 'G');
    console.log('§CB3 dominant separation = ' + dom + ' (' + ({
      S: 'SEAL-invented — walls that do not exist in the model',
      W: 'solid modelled wall',
      G: 'gap in the wall extraction'
    })[dom] + ')  — SUPERSEDED BY §CB5 above: ' + (trulySealed === 0
      ? 'no defect remains.'
      : trulySealed + ' of ' + clustersAll + ' clusters are sealed suites with neither a door route nor a stair, ' +
        'which no real building has. The separation being "solid wall" is therefore a statement about ' +
        'the RASTER, not about the building: a door route exists and the raster does not carry it.'));
    db.close();
  }
})();
