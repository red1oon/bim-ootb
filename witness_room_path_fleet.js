// witness_room_path_fleet.js — §FLEET room-path stats over every buildings/*_extracted.db.
// Implementing RESUME_FLEET_OPENINGS_BACKFILL.md §2 step 6 — Witness: W-FLEET-O2.
// Port of the 2026-08-02 scratchpad runner fleet_room_path_stats.js (RESUME_ROOMPATH_AXIS_RESWEEP.md §7):
// IDENTICAL formula + engine as witness_room_path_overlink.js run() — spineMap() per storey, union-find
// over links, §O2 pair-unroutable% = unconnected room pairs / all room pairs. Read-only report, no DB writes.
//
// Usage:
//   node witness_room_path_fleet.js                 # all *_extracted.db in ~/bim-ootb/buildings
//   node witness_room_path_fleet.js --dir <path>    # all *_extracted.db in <path>
//   node witness_room_path_fleet.js <db> [<db>...]  # explicit DB file(s)
const fs = require('fs'), path = require('path');
const initSqlJs = require(path.join(process.env.HOME, 'bim-ootb', 'node_modules', 'sql.js'));
const RW = require(path.join(__dirname, 'viewer/lib/room_walker.js'));
const quiet = fn => { const rl = console.log; console.log = () => {}; try { return fn(); } finally { console.log = rl; } };

function run(db, mode) {
  const map = quiet(() => RW.spineMap(db, { voidMode: mode }));
  let rooms = 0, stranded = 0, fused = 0, storeys = 0, pairs = 0, bad = 0;
  Object.keys(map).forEach(st => {
    const m = map[st];
    if (!m.pockets.length) return;
    storeys++;
    fused += m.doorlessOpenings;
    const others = m.groups.filter(x => x.id !== m.spineGroup);
    rooms += others.length;
    stranded += others.filter(x => x.depth === -1 && x.area >= 2.0).length;
    const ids = m.groups.map(x => x.id), p = {}; ids.forEach(i => p[i] = i);
    const find = a => { while (p[a] !== a) { p[a] = p[p[a]]; a = p[a]; } return a; };
    m.links.forEach(l => { const ra = find(l.a), rb = find(l.b); if (ra !== rb) p[ra] = rb; });
    const sz = {}; ids.forEach(i => { const r = find(i); sz[r] = (sz[r] || 0) + 1; });
    const n = ids.length, t = n * (n - 1) / 2;
    const same = Object.values(sz).reduce((s, k) => s + k * (k - 1) / 2, 0);
    pairs += t; bad += t - same;
  });
  return { rooms, stranded, fused, storeys, unroutable: 100 * bad / Math.max(1, pairs) };
}

(async () => {
  const SQL = await initSqlJs();
  const args = process.argv.slice(2);
  let files = [];
  if (args[0] === '--dir' && args[1]) {
    files = fs.readdirSync(args[1]).filter(f => f.endsWith('_extracted.db')).sort().map(f => path.join(args[1], f));
  } else if (args.length) {
    files = args;
  } else {
    const BLD = path.join(process.env.HOME, 'bim-ootb', 'buildings');
    files = fs.readdirSync(BLD).filter(f => f.endsWith('_extracted.db')).sort().map(f => path.join(BLD, f));
  }
  for (const fp of files) {
    const f = path.basename(fp);
    let db;
    try { db = new SQL.Database(fs.readFileSync(fp)); }
    catch (e) { console.log('§FLEET ' + f + '  LOAD-FAIL ' + e.message); continue; }
    for (const mode of ['W:3.0', 'cur']) {
      try {
        const r = run(db, mode);
        console.log('§FLEET ' + f.replace('_extracted.db', '').padEnd(24) + mode.padEnd(7) +
          ' storeys=' + r.storeys + '  rooms=' + String(r.rooms).padStart(4) +
          '  stranded=' + String(r.stranded).padStart(4) +
          '  unroutable=' + r.unroutable.toFixed(1) + '%  fusions=' + r.fused);
      } catch (e) {
        console.log('§FLEET ' + f.replace('_extracted.db', '').padEnd(24) + mode.padEnd(7) +
          ' RUN-FAIL ' + String(e.message).slice(0, 120));
      }
    }
    db.close();
  }
  console.log('§FLEET_DONE');
})();
