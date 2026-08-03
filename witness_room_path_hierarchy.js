// §HM HIERARCHY METRIC v2 — RESUME_FLEET_OPENINGS_BACKFILL.md §9 + §10 (user directives 2026-08-03):
// v1: the §O2 pair metric is myopic — hidden rooms are a LAYER (BOM: floor→room→sub-room); a sealed
//     suite is ONE missing link, not N² broken pairs.
// v2 (§10): "wall cavities are not rooms if there are no doors" — a pocket group with NO door
//     footprint on its boundary AND NO opening incident cannot be entered; it is a PHANTOM
//     (flood-fill cavity/shaft), excluded from the room census and from missing-link demand.
// Scoring (same engine, same links — REPORTING only):
//   §HM1 missing links   = Σ per storey (non-phantom components − 1)
//   §HM2 spine rooms%    = rooms in the spine component
//   §HM3 suite rooms%    = rooms in multi-room non-spine components (internally routable layers)
//   §HM4 isolated rooms% = singleton components WITH an aperture (true sealed rooms)
//   §HM5 phantom pockets = doorless+openingless groups, EXCLUDED from rooms (reported separately)
const fs = require('fs'), path = require('path');
const WT = path.resolve(__dirname);
const initSqlJs = require(path.join(process.env.HOME, 'bim-ootb', 'node_modules', 'sql.js'));
const RW = require(path.join(WT, 'viewer/lib/room_walker.js'));
const BLD = path.join(process.env.HOME, 'bim-ootb', 'buildings');
const quiet = fn => { const rl = console.log; console.log = () => {}; try { return fn(); } finally { console.log = rl; } };

const FLEET = ['Clinic', 'Duplex', 'HHS_Office_Federated', 'Hospital', 'JKR', 'LTU_AHouse',
  'Terminal', 'TermRooms']; // Hospital_3 removed by user directive 2026-08-03

(async () => {
  const SQL = await initSqlJs();
  for (const b of FLEET) {
    const p = path.join(BLD, b + '_extracted.db');
    if (!fs.existsSync(p)) { console.log('§HM ' + b + ' MISSING-DB'); continue; }
    const db = new SQL.Database(fs.readFileSync(p));
    const anch = RW.storeyZAnchors(db);
    const doorsBy = RW.storeyDoors(db, anch);
    const map = quiet(() => RW.spineMap(db, { voidMode: 'W:3.0' }));
    let rooms = 0, spineRooms = 0, suiteRooms = 0, isoRooms = 0, missing = 0, suites = 0, phantoms = 0;
    Object.keys(map).forEach(st => {
      const m = map[st];
      if (!m.pockets.length) return;
      const g = m.grid;

      // pocket -> engine group (fused across doorless openings), as the cause witness does
      const pp = {}; m.pockets.forEach(pk => pp[pk.id] = pk.id);
      const pfind = x => { while (pp[x] !== x) { pp[x] = pp[pp[x]]; x = pp[x]; } return x; };
      m.openings.forEach(o => { if (o.doors.length) return; const a = pfind(o.a), b = pfind(o.b); if (a !== b) pp[a] = b; });
      const members = {};
      m.pockets.forEach(pk => { const r = pfind(pk.id); (members[r] = members[r] || []).push(pk); });

      // aperture test per group: any door footprint on its padded bbox, or any opening incident
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

      // components over engine groups via links
      const ids = m.groups.map(x => x.id), par = {}; ids.forEach(i => par[i] = i);
      const find = a => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
      m.links.forEach(l => { const ra = find(l.a), rb = find(l.b); if (ra !== rb) par[ra] = rb; });
      const comp = {}; ids.forEach(i => { const r = find(i); (comp[r] = comp[r] || []).push(i); });
      const spineRoot = String(find(m.spineGroup));

      let liveComps = 0;
      Object.keys(comp).forEach(r => {
        const membersC = comp[r].filter(i => i !== m.spineGroup);
        if (r === spineRoot) { liveComps++; spineRooms += membersC.length; rooms += membersC.length; return; }
        // phantom: every group in this component lacks doors AND openings
        if (comp[r].every(i => !hasAperture(i))) { phantoms += comp[r].length; return; }
        liveComps++;
        rooms += membersC.length;
        if (membersC.length > 1) { suiteRooms += membersC.length; suites++; }
        else isoRooms += membersC.length;
      });
      missing += Math.max(0, liveComps - 1);
    });
    const pc = n => rooms ? (100 * n / rooms).toFixed(1) : '0.0';
    console.log('§HM ' + b.padEnd(22) +
      ' rooms=' + String(rooms).padStart(4) +
      '  §HM1 missingLinks=' + String(missing).padStart(4) + ' (suites=' + suites + ')' +
      '  §HM2 spine=' + pc(spineRooms) + '%' +
      '  §HM3 suite=' + pc(suiteRooms) + '%' +
      '  §HM4 isolated=' + pc(isoRooms) + '%' +
      '  §HM5 phantoms=' + phantoms);
    db.close();
  }
  console.log('§HM_DONE');
})();
