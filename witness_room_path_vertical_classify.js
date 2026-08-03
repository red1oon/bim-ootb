// §12 VERIFY — of the fleet's current per-storey "missing links" (§HM1, RESUME_FLEET_OPENINGS_
// BACKFILL.md §10/§11), how many sit on a stair footprint (candidate vertical connector the
// per-storey graph structurally can't see) vs how many are ordinary same-floor gaps?
// Read-only reporting, same engine (spineMap/storeyStairs), no walker/engine changes.
const fs = require('fs'), path = require('path');
const WT = path.resolve(__dirname);
const initSqlJs = require(path.join(process.env.HOME, 'bim-ootb', 'node_modules', 'sql.js'));
const RW = require(path.join(WT, 'viewer/lib/room_walker.js'));
const BLD = path.join(process.env.HOME, 'bim-ootb', 'buildings');
const quiet = fn => { const rl = console.log; console.log = () => {}; try { return fn(); } finally { console.log = rl; } };

const FLEET = ['Clinic', 'Duplex', 'HHS_Office_Federated', 'Hospital', 'JKR', 'LTU_AHouse',
  'Terminal', 'TermRooms'];

(async () => {
  const SQL = await initSqlJs();
  for (const b of FLEET) {
    const p = path.join(BLD, b + '_extracted.db');
    if (!fs.existsSync(p)) { console.log('§VC ' + b + ' MISSING-DB'); continue; }
    const db = new SQL.Database(fs.readFileSync(p));
    const anch = RW.storeyZAnchors(db);
    const doorsBy = RW.storeyDoors(db, anch);
    const stairsBy = RW.storeyStairs(db);
    const map = quiet(() => RW.spineMap(db, { voidMode: 'W:3.0' }));
    let missing = 0, stairAdj = 0, other = 0;
    const detail = [];

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

      const ids = m.groups.map(x => x.id), par = {}; ids.forEach(i => par[i] = i);
      const find = a => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
      m.links.forEach(l => { const ra = find(l.a), rb = find(l.b); if (ra !== rb) par[ra] = rb; });
      const comp = {}; ids.forEach(i => { const r = find(i); (comp[r] = comp[r] || []).push(i); });
      const spineRoot = String(find(m.spineGroup));

      const liveRoots = [];
      Object.keys(comp).forEach(r => {
        if (r === spineRoot) return;
        if (comp[r].every(i => !hasAperture(i))) return; // phantom, excluded per §10
        liveRoots.push(r);
      });
      if (liveRoots.length === 0) return;
      // §HM1: (liveComps - 1) missing links per storey, where liveComps = spine + liveRoots.length.
      // Attribute each EXTRA missing link to the non-spine component with the highest stair overlap,
      // so the count matches §HM1 exactly (Σ(liveComps-1)) while still naming a cause per link.
      liveRoots.forEach(r => {
        const mem = (comp[r] || []).flatMap(i => members[i] || []);
        let bestFrac = 0;
        mem.forEach(pk => {
          const rx0 = g.xs0 + pk.mni * RW.RES, rx1 = g.xs0 + (pk.mxi + 1) * RW.RES;
          const ry0 = g.ys0 + pk.mnj * RW.RES, ry1 = g.ys0 + (pk.mxj + 1) * RW.RES;
          const f = RW.stairOverlapFrac(rx0, ry0, rx1, ry1, stairs);
          if (f > bestFrac) bestFrac = f;
        });
        missing++;
        if (bestFrac > 0.10) { stairAdj++; detail.push(st + ':stair(' + bestFrac.toFixed(2) + ')'); }
        else { other++; detail.push(st + ':other'); }
      });
    });

    console.log('§VC ' + b.padEnd(22) +
      ' missingLinks=' + String(missing).padStart(4) +
      '  stairAdjacent=' + String(stairAdj).padStart(3) +
      '  other=' + String(other).padStart(3) +
      '  [' + detail.join(', ') + ']');
    db.close();
  }
  console.log('§VC_DONE');
})();
