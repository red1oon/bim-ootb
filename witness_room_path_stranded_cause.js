// §21.34 STRANDED-ROOM CAUSE CLASSIFICATION — §21.33 NEXT item 1, on the W:3.0 substrate.
// Clinic 55/208 and LTU 60/308 regions reach the spine through no door at all. §21.28 named three
// possible causes; §21.30/§21.33 struck one of them by measurement, so exactly two remain:
//   (1) NO DOOR ELEMENT exists for the region at all — the IFC has no door there to find.
//   (3) A DOOR EXISTS but no opening was ever detected for it — the sealed flood never produced a
//       gap the door could be matched to, so the region carries no link.
// Cause (2) ("a door exists but its carve did not pierce the host wall") is REFUTED — tier B vs
// tier C moved 295 -> 295 on LTU across three separate substrates. It is not a candidate here.
//
// A third OUTCOME, which is not a cause but must be separated or it inflates both: a region whose
// door links only reach OTHER stranded regions. Its own door works; its parent is the problem.
// Counting those as (1) or (3) would send the next session hunting a defect that isn't there.
//
// WHAT THIS PROVES OR DISPROVES: the counts choose the fix, per §21.28's own rule. If (1) dominates,
// the fix is upstream in extraction/room-compile and no amount of raster work will help. If (3)
// dominates, the fix is in opening detection and is squarely in this lane. Written before the run.
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
    const map = quiet(() => RW.spineMap(db));          // default = W:3.0 (§21.33)
    const B = { noDoor: 0, doorNoOpening: 0, parentStranded: 0, other: 0 };
    const areas = { noDoor: 0, doorNoOpening: 0, parentStranded: 0, other: 0 };
    let totStranded = 0;

    Object.keys(map).sort().forEach(st => {
      const m = map[st];
      if (!m.pockets.length) return;
      const g = m.grid;
      // Rebuild pocket -> group exactly as the engine does: fuse across DOORLESS openings only.
      const parent = {}; m.pockets.forEach(p => parent[p.id] = p.id);
      const find = x => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
      m.openings.forEach(o => { if (o.doors.length) return; const a = find(o.a), b = find(o.b); if (a !== b) parent[a] = b; });
      const members = {};
      m.pockets.forEach(p => { const r = find(p.id); (members[r] = members[r] || []).push(p); });
      const depthOf = {}; m.groups.forEach(x => depthOf[x.id] = x.depth);
      const strandedIds = new Set(m.groups.filter(x => x.depth === -1 && x.area >= 2.0 && x.id !== m.spineGroup).map(x => x.id));

      // door-openings incident on each group
      const inc = {};
      m.openings.forEach(o => {
        if (!o.doors.length) return;
        const ga = find(o.a), gb = find(o.b);
        (inc[ga] = inc[ga] || []).push(gb); (inc[gb] = inc[gb] || []).push(ga);
      });

      const doors = doorsBy[st] || [];
      strandedIds.forEach(gid => {
        totStranded++;
        const grp = m.groups.find(x => x.id === gid);
        const mem = members[gid] || [];
        // Does ANY door footprint fall on this group? Use the door's own half-span, plus the seal
        // band — a door sits IN the wall, so its centre is outside the pocket by design.
        const PAD = 3;
        let hasDoor = false;
        for (const d of doors) {
          const di = Math.floor((d[0] - g.xs0) / RW.RES), dj = Math.floor((d[1] - g.ys0) / RW.RES);
          const span = Math.ceil((Math.max(d[2], d[3]) / 2) / RW.RES) + PAD;
          for (const p of mem) {
            if (di >= p.mni - span && di <= p.mxi + span && dj >= p.mnj - span && dj <= p.mxj + span) { hasDoor = true; break; }
          }
          if (hasDoor) break;
        }
        const nbrs = inc[gid] || [];
        let key;
        if (!hasDoor && !nbrs.length) key = 'noDoor';
        else if (hasDoor && !nbrs.length) key = 'doorNoOpening';
        else if (nbrs.length && nbrs.every(n => strandedIds.has(n) || depthOf[n] === -1)) key = 'parentStranded';
        else key = 'other';
        B[key]++; areas[key] += grp ? grp.area : 0;
      });
    });

    // §SC3 — the count that actually matters. A stranded region whose links reach only other
    // stranded regions is not its own failure; it is downstream of one. So collapse the stranded
    // subgraph into CLUSTERS: each cluster is ONE break between a group of rooms and the spine.
    // Reporting 55 or 60 "stranded rooms" over-counts the work by the size of the average cluster.
    let clusters = 0, clustered = 0, clustersWithRoot = 0, biggest = 0;
    Object.keys(map).sort().forEach(st => {
      const m = map[st];
      if (!m.pockets.length) return;
      const parent = {}; m.pockets.forEach(p => parent[p.id] = p.id);
      const find = x => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
      m.openings.forEach(o => { if (o.doors.length) return; const a = find(o.a), b = find(o.b); if (a !== b) parent[a] = b; });
      const strandedIds = new Set(m.groups.filter(x => x.depth === -1 && x.area >= 2.0 && x.id !== m.spineGroup).map(x => x.id));
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
        const stack = [s]; seen.add(s); let n = 0;
        while (stack.length) { const v = stack.pop(); n++; (adj[v] || []).forEach(w => { if (!seen.has(w)) { seen.add(w); stack.push(w); } }); }
        clusters++; clustered += n; if (n > biggest) biggest = n;
      });
    });
    const pct = k => (100 * B[k] / Math.max(1, totStranded)).toFixed(0);
    console.log('§SC1 stranded regions classified = ' + totStranded);
    console.log('§SC1   (1) NO DOOR ELEMENT AT ALL      = ' + B.noDoor + ' (' + pct('noDoor') + '%)  ' + areas.noDoor.toFixed(0) + 'm²');
    console.log('§SC1   (3) DOOR EXISTS, NO OPENING     = ' + B.doorNoOpening + ' (' + pct('doorNoOpening') + '%)  ' + areas.doorNoOpening.toFixed(0) + 'm²');
    console.log('§SC1   (-) links only to other stranded= ' + B.parentStranded + ' (' + pct('parentStranded') + '%)  ' + areas.parentStranded.toFixed(0) + 'm²');
    console.log('§SC1   (?) unclassified                = ' + B.other + ' (' + pct('other') + '%)  ' + areas.other.toFixed(0) + 'm²');
    const dom = Object.keys(B).reduce((a, b) => B[a] >= B[b] ? a : b);
    console.log('§SC2 DOMINANT = ' + dom + ' -> ' + ({
      noDoor: 'FIX IS UPSTREAM (extraction / room compile). No raster work can reach it.',
      doorNoOpening: 'FIX IS IN THIS LANE — opening detection never produced a gap for a real door.',
      parentStranded: 'NOT A DEFECT PER REGION — a chain hanging off a smaller number of real failures.',
      other: 'MIXED — no single fix; re-cut the buckets before acting.'
    })[dom]);
    console.log('§SC3 INDEPENDENT BREAKS = ' + clusters + ' clusters over ' + totStranded +
      ' stranded regions  (largest cluster = ' + biggest + ' regions, mean = ' +
      (clustered / Math.max(1, clusters)).toFixed(1) + ')');
    console.log('§SC3 -> the real work is ' + clusters + ' breaks, not ' + totStranded +
      ' rooms. Roots found by §SC1 = ' + (B.noDoor + B.doorNoOpening) +
      ((B.noDoor + B.doorNoOpening) >= clusters
        ? '  (>= clusters: every break has a named cause)'
        : '  (< clusters: ' + (clusters - B.noDoor - B.doorNoOpening) +
          ' cluster(s) have NO root member — the break is on the cluster BOUNDARY, unexamined)'));
    db.close();
  }
})();
