// §12.3 STAIR-CASE CAUSE-SPLIT — RESUME_FLEET_OPENINGS_BACKFILL.md §12.2 found the vertical-classify
// pass was inconclusive on 7/8 buildings because room_walker.js's storeyStairs() has no z-based
// reassignment (unlike storeyDoors()'s _assignByZ) — every positioned stair sits under
// storey='Unknown' and is invisible to the per-real-floor overlap check.
// This witness repairs ONLY that coverage gap, locally, read-only: it re-derives stair storey via
// the SAME nearest-anchor-by-z technique room_walker.js already uses for doors/walls (RW.storeyZAnchors
// + the identical distance-to-anchor rule), then re-runs the missing-link classification with real
// per-floor stair data everywhere. No change to viewer/lib/room_walker.js itself.
const fs = require('fs'), path = require('path');
const WT = path.resolve(__dirname);
const initSqlJs = require(path.join(process.env.HOME, 'bim-ootb', 'node_modules', 'sql.js'));
const RW = require(path.join(WT, 'viewer/lib/room_walker.js'));
const BLD = path.join(process.env.HOME, 'bim-ootb', 'buildings');
const quiet = fn => { const rl = console.log; console.log = () => {}; try { return fn(); } finally { console.log = rl; } };

const FLEET = ['Clinic', 'Duplex', 'HHS_Office_Federated', 'Hospital', 'JKR', 'LTU_AHouse',
  'Terminal', 'TermRooms'];

// Same rule as room_walker.js's private _assignByZ (§STOREY-Z) — nearest anchor by mean center_z.
function assignByZ(st, cz, anchors, anchorNames) {
  if (st && st !== 'Unknown') return st;
  if (!anchorNames.length) return 'Unknown';
  let best = null, bd = Infinity;
  for (const name of anchorNames) {
    const d = Math.abs(cz - anchors[name]);
    if (d < bd) { bd = d; best = name; }
  }
  return best;
}

function rows(db, sql) {
  const r = db.exec(sql);
  if (!r.length) return [];
  const cols = r[0].columns, vals = r[0].values;
  return vals.map(v => { const o = {}; cols.forEach((c, i) => o[c] = v[i]); return o; });
}

// Stairs, z-reassigned — the fixed version of RW.storeyStairs().
function storeyStairsFixed(db, anchors) {
  const rs = rows(db, "SELECT m.storey, t.center_x,t.center_y,t.center_z, t.bbox_x,t.bbox_y " +
    "FROM elements_meta m JOIN element_transforms t ON t.guid=m.guid " +
    "WHERE (m.ifc_class LIKE 'IfcStair%' OR m.ifc_class LIKE 'IfcRamp%') " +
    "AND m.discipline='ARC' AND t.center_x IS NOT NULL");
  const anchorNames = Object.keys(anchors).sort();
  const by = {};
  let reassigned = 0, keptUnknown = 0;
  rs.forEach(r => {
    const st = assignByZ(r.storey || 'Unknown', r.center_z, anchors, anchorNames);
    if ((r.storey || 'Unknown') === 'Unknown' && st !== 'Unknown') reassigned++;
    if (st === 'Unknown') keptUnknown++;
    (by[st] = by[st] || []).push([r.center_x, r.center_y, r.bbox_x, r.bbox_y]);
  });
  return { by, total: rs.length, reassigned, keptUnknown };
}

(async () => {
  const SQL = await initSqlJs();
  for (const b of FLEET) {
    const p = path.join(BLD, b + '_extracted.db');
    if (!fs.existsSync(p)) { console.log('§SCAUSE ' + b + ' MISSING-DB'); continue; }
    const db = new SQL.Database(fs.readFileSync(p));
    const anch = RW.storeyZAnchors(db);
    const doorsBy = RW.storeyDoors(db, anch);
    const { by: stairsBy, total: stTotal, reassigned, keptUnknown } = storeyStairsFixed(db, anch);
    const map = quiet(() => RW.spineMap(db, { voidMode: 'W:3.0' }));

    const B = { stairAdjacent: 0, noDoorNoStair: 0, doorNoOpeningNoStair: 0, parentStrandedNoStair: 0, otherNoStair: 0 };
    let missing = 0;
    const rowsOut = [];

    Object.keys(map).forEach(st => {
      const m = map[st];
      if (!m.pockets.length) return;
      const g = m.grid;
      const stairs = stairsBy[st] || [];

      const pp = {}; m.pockets.forEach(pk => pp[pk.id] = pk.id);
      const pfind = x => { while (pp[x] !== x) { pp[x] = pp[pp[x]]; x = pp[x]; } return x; };
      m.openings.forEach(o => { if (o.doors.length) return; const a = pfind(o.a), b = pfind(o.b); if (a !== b) pp[a] = b; });
      const members = {};
      m.pockets.forEach(pk => { const r = pfind(pk.id); (members[r] = members[r] || []).push(pk); });

      const touched = new Set();
      m.openings.forEach(o => { touched.add(pfind(o.a)); touched.add(pfind(o.b)); });
      const doors = doorsBy[st] || [];
      const PAD = 3;
      const hasAperture = gid => {
        if (touched.has(gid)) return true;
        const mem = members[gid] || [];
        for (const d of doors) {
          const di = Math.floor((d[0] - g.xs0) / RW.RES), dj = Math.floor((d[1] - g.ys0) / RW.RES);
          const span = Math.ceil((Math.max(d[2], d[3]) / 2) / RW.RES) + PAD;
          for (const pk of mem) {
            if (di >= pk.mni - span && di <= pk.mxi + span && dj >= pk.mnj - span && dj <= pk.mxj + span) return true;
          }
        }
        return false;
      };
      const hasDoorFootprint = gid => {
        const mem = members[gid] || [];
        for (const d of doors) {
          const di = Math.floor((d[0] - g.xs0) / RW.RES), dj = Math.floor((d[1] - g.ys0) / RW.RES);
          const span = Math.ceil((Math.max(d[2], d[3]) / 2) / RW.RES) + PAD;
          for (const pk of mem) if (di >= pk.mni - span && di <= pk.mxi + span && dj >= pk.mnj - span && dj <= pk.mxj + span) return true;
        }
        return false;
      };

      const ids = m.groups.map(x => x.id), par = {}; ids.forEach(i => par[i] = i);
      const find = a => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
      m.links.forEach(l => { const ra = find(l.a), rb = find(l.b); if (ra !== rb) par[ra] = rb; });
      const comp = {}; ids.forEach(i => { const r = find(i); (comp[r] = comp[r] || []).push(i); });
      const spineRoot = String(find(m.spineGroup));
      // door-opening neighbours per group (for parentStranded test, §8-style)
      const inc = {};
      m.openings.forEach(o => {
        if (!o.doors.length) return;
        const ga = find(pfind(o.a)), gb = find(pfind(o.b));
        (inc[ga] = inc[ga] || []).push(gb); (inc[gb] = inc[gb] || []).push(ga);
      });

      Object.keys(comp).forEach(r => {
        if (r === spineRoot) return;
        if (comp[r].every(i => !hasAperture(i))) return; // phantom, excluded per §10
        missing++;

        const mem = comp[r].flatMap(i => members[i] || []);
        let bestFrac = 0;
        mem.forEach(pk => {
          const rx0 = g.xs0 + pk.mni * RW.RES, rx1 = g.xs0 + (pk.mxi + 1) * RW.RES;
          const ry0 = g.ys0 + pk.mnj * RW.RES, ry1 = g.ys0 + (pk.mxj + 1) * RW.RES;
          const f = RW.stairOverlapFrac(rx0, ry0, rx1, ry1, stairs);
          if (f > bestFrac) bestFrac = f;
        });
        const stairAdj = bestFrac > 0.10;

        if (stairAdj) { B.stairAdjacent++; rowsOut.push(st + ':STAIR(' + bestFrac.toFixed(2) + ')'); return; }

        const anyDoor = comp[r].some(i => hasDoorFootprint(i));
        const nbrs = new Set();
        comp[r].forEach(i => (inc[i] || []).forEach(n => nbrs.add(n)));
        const nbrsOutside = [...nbrs].some(n => !comp[r].includes(n));
        let key;
        if (!anyDoor && !nbrsOutside) key = 'noDoorNoStair';
        else if (anyDoor && !nbrsOutside) key = 'doorNoOpeningNoStair';
        else if (nbrsOutside) key = 'parentStrandedNoStair';
        else key = 'otherNoStair';
        B[key]++; rowsOut.push(st + ':' + key);
      });
    });

    const cov = stTotal ? ((stTotal - keptUnknown) / stTotal * 100).toFixed(0) : '0';
    console.log('§SCAUSE ' + b.padEnd(22) + ' missing=' + String(missing).padStart(4) +
      '  stairAdj=' + String(B.stairAdjacent).padStart(3) +
      '  noDoorNoStair=' + B.noDoorNoStair +
      '  doorNoOpeningNoStair=' + B.doorNoOpeningNoStair +
      '  parentStrandedNoStair=' + B.parentStrandedNoStair +
      '  otherNoStair=' + B.otherNoStair +
      '  [stairCoverage=' + cov + '% of ' + stTotal + ', reassignedByZ=' + reassigned + ', stillUnknown=' + keptUnknown + ']');
    console.log('§SCAUSE_DETAIL ' + b + ': ' + rowsOut.join(', '));
    db.close();
  }
  console.log('§SCAUSE_DONE');
})();
