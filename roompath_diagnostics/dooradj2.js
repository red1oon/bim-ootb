// §21.21 FIX — the real door<->pocket relation, measured against the proximity guess it replaces.
//
// WHAT THIS PROVES OR DISPROVES (written before reading any output, per §21.14):
//   T1 REGRESSION GUARD — the compile must be unchanged. RoomWalker.walk() with and without the
//      new opts.doorAdjacency flag must produce the identical room set. If this fails the fix
//      contaminated the walker and nothing below is admissible.
//   T2 the aperture relation must be STRUCTURALLY VALID: no door may claim >2 pockets. This is
//      true by construction (a ray stops at its first hit), so T2 failing means a coding error,
//      not a data finding. It is here to catch that.
//   T3 THE ACTUAL CLAIM — interior doors. The proximity guess found 2 rooms for 2/254 Clinic doors
//      at tol=0 and for 97/254 at tol=0.4m while 91 claimed 3-4. The aperture relation must find a
//      LARGE, threshold-free count of 2-room doors. If it lands near the tol=0 number the pockets
//      genuinely do not meet at doors and the two-layer design has a real problem; if it lands
//      near tol=0.4's 97 WITHOUT the 91 over-claims, the defect was the rects, as §21.21 argued.
//   T4 ORPHANS — doors touching nothing. §21.21 blamed the coverage gap partly on these
//      (orphanDoors 16/92). Report the count and, for the 0-room doors, whether the ray was
//      stopped by masonry or cleared into unassigned space.
//
// NOT PROVEN HERE: whether routability or spine connectivity improve. That is spine2.js.
const fs = require('fs'), path = require('path');
const WT = path.resolve(__dirname, '..');
const initSqlJs = require(path.join(process.env.HOME, 'bim-ootb', 'node_modules', 'sql.js'));
const RW = require(path.join(WT, 'viewer/lib/room_walker.js'));
const BLD = path.join(process.env.HOME, 'bim-ootb', 'buildings');

const quiet = fn => { const rl = console.log; console.log = () => {}; try { return fn(); } finally { console.log = rl; } };

(async () => {
  const SQL = await initSqlJs();
  for (const f of ['Clinic_extracted.db', 'LTU_AHouse_extracted.db']) {
    const bytes = new Uint8Array(fs.readFileSync(path.join(BLD, f)));

    // ---- T1: compile invariance. Same DB, two fresh copies, flag off vs flag on.
    const dbA = new SQL.Database(bytes.slice());
    const dbB = new SQL.Database(bytes.slice());
    const cA = quiet(() => RW.compileRooms(dbA));
    const cB = quiet(() => RW.compileRooms(dbB, { doorAdjacency: true }));
    const sig = c => c.rooms.map(r => [r.guid, r.cx.toFixed(6), r.cy.toFixed(6),
      (r.rects || []).map(q => q.cx.toFixed(6) + ',' + q.cy.toFixed(6) + ',' + q.sx.toFixed(6) + ',' + q.sy.toFixed(6)).join(';')].join('|')).join('\n');
    const t1 = sig(cA) === sig(cB) && cA.total === cB.total;
    console.log('§ADJ2_T1 ' + f + ' compileInvariant=' + (t1 ? 'PASS' : 'FAIL') +
      '  rooms ' + cA.total + ' vs ' + cB.total);

    // ---- the relation itself
    const adj = cB.doorAdj;
    const all = [];
    Object.keys(adj).forEach(st => adj[st].forEach(a => all.push(Object.assign({ storey: st }, a))));
    const noRaster = all.filter(a => a.noRaster).length;
    const cnt = {};
    all.forEach(a => { const n = a.guids.length; cnt[n] = (cnt[n] || 0) + 1; });
    const over = all.filter(a => a.guids.length > 2).length;

    console.log('§ADJ2 ' + f + '  doors=' + all.length +
      '  ' + Object.keys(cnt).sort((x, y) => x - y).map(k => k + ' rooms x' + cnt[k]).join('  ') +
      (noRaster ? '   (door-partition storeys, no raster: ' + noRaster + ')' : ''));
    console.log('§ADJ2_T2 ' + f + ' joins>2 = ' + over + '/' + all.length + (over ? '  FAIL' : '  PASS'));
    console.log('§ADJ2_T3 ' + f + ' interiorDoors(2 pockets) = ' + (cnt[2] || 0) + '/' + all.length +
      '   [proximity guess: tol=0 -> ' + (f[0] === 'C' ? 2 : 11) + ', tol=0.4 -> ' +
      (f[0] === 'C' ? '97 with 91 over-claims' : '275 with 75 over-claims') + ']');
    console.log('§ADJ2_T4 ' + f + ' orphanDoors(0 pockets) = ' + (cnt[0] || 0) + '/' + all.length +
      '   singleSided(1 pocket, i.e. external/entry) = ' + (cnt[1] || 0));

    // ---- unique room-pair links this relation yields (what a router would actually get)
    const pairs = new Set();
    all.forEach(a => { if (a.guids.length === 2) pairs.add(a.guids.slice().sort().join('~')); });
    const linked = new Set(); all.forEach(a => a.guids.forEach(g => linked.add(g)));
    console.log('§ADJ2_LINKS ' + f + ' distinctRoomPairs=' + pairs.size +
      '  roomsWithAtLeastOneDoor=' + linked.size + '/' + cB.total);

    dbA.close(); dbB.close();
  }
})();
