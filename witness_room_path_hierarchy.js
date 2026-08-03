// §HM HIERARCHY METRIC — RESUME_FLEET_OPENINGS_BACKFILL.md §9 (user directive 2026-08-03):
// the §O2 pair metric is myopic — hidden rooms are a LAYER (BOM: floor→room→sub-room), and a
// sealed suite is ONE missing link, not N² broken pairs. Same engine, same links; only the
// SCORING changes:
//   §HM1 missing links  = Σ per storey (components − 1)  — single door-links to full connection
//   §HM2 spine rooms%   = rooms inside the spine component
//   §HM3 suite rooms%   = rooms in multi-room non-spine components (internally routable layers)
//   §HM4 isolated rooms% = singleton components (true seals + phantom flood-fill pockets)
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
    const map = quiet(() => RW.spineMap(db, { voidMode: 'W:3.0' }));
    let rooms = 0, spineRooms = 0, suiteRooms = 0, isoRooms = 0, missing = 0, suites = 0;
    Object.keys(map).forEach(st => {
      const m = map[st];
      if (!m.pockets.length) return;
      const ids = m.groups.map(x => x.id), par = {}; ids.forEach(i => par[i] = i);
      const find = a => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
      m.links.forEach(l => { const ra = find(l.a), rb = find(l.b); if (ra !== rb) par[ra] = rb; });
      const comp = {}; ids.forEach(i => { const r = find(i); (comp[r] = comp[r] || []).push(i); });
      const spineRoot = String(find(m.spineGroup)); // comp keys are Object.keys strings
      const comps = Object.keys(comp);
      missing += comps.length - 1;
      comps.forEach(r => {
        const members = comp[r].filter(i => i !== m.spineGroup);
        if (r === spineRoot) { spineRooms += members.length; rooms += members.length; return; }
        rooms += members.length;
        if (members.length > 1) { suiteRooms += members.length; suites++; }
        else isoRooms += members.length;
      });
    });
    const pc = n => rooms ? (100 * n / rooms).toFixed(1) : '0.0';
    console.log('§HM ' + b.padEnd(22) +
      ' rooms=' + String(rooms).padStart(4) +
      '  §HM1 missingLinks=' + String(missing).padStart(4) + ' (suites=' + suites + ')' +
      '  §HM2 spine=' + pc(spineRooms) + '%' +
      '  §HM3 suite=' + pc(suiteRooms) + '%' +
      '  §HM4 isolated=' + pc(isoRooms) + '%');
    db.close();
  }
  console.log('§HM_DONE');
})();
