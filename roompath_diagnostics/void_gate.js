// §21.27 GATE — §21.26's stopper was that doorways do not exist in the raster (99% / 100% of door
// centres land on solid masonry). §SPINE-RASTER carves the voids and honours rotation_z. This is
// the gate that says whether it worked, and it must pass BEFORE any spine number is believed.
//
//   G1 VOIDS ARE OPEN — door-centre blocked rate must fall from 99-100% to ~0. This is the whole
//      point; if it does not move, the carve is not reaching the wall and everything after is moot.
//   G2 WALLS ARE NOT SHREDDED — the carve may only remove a small fraction of stamped wall. A big
//      drop means the void footprints are over-cutting and the enclosure will leak, which would
//      trade one broken map for another. Reported as blocked-cell count before vs after.
//   G3 ENCLOSURE SURVIVES — with walls carved, the sealed flood must still find enclosed floor of
//      the same order as before. If enclosed area collapses, the exterior is leaking in through the
//      carved doorways and SEAL is no longer holding.
const fs = require('fs'), path = require('path');
const WT = path.resolve(__dirname, '..');
const initSqlJs = require(path.join(process.env.HOME, 'bim-ootb', 'node_modules', 'sql.js'));
const RW = require(path.join(WT, 'viewer/lib/room_walker.js'));
const BLD = path.join(process.env.HOME, 'bim-ootb', 'buildings');
const quiet = fn => { const rl = console.log; console.log = () => {}; try { return fn(); } finally { console.log = rl; } };

(async () => {
  const SQL = await initSqlJs();
  for (const f of ['Clinic_extracted.db', 'LTU_AHouse_extracted.db']) {
    console.log('\n---- ' + f);
    const db = new SQL.Database(new Uint8Array(fs.readFileSync(path.join(BLD, f))));
    const anch = RW.storeyZAnchors(db);
    const doorsBy = RW.storeyDoors(db, anch);
    const modes = [
      ['base   (as room compile)', { carve: false, rotate: false }],
      ['rotate only             ', { carve: false, rotate: true }],
      ['carve only              ', { carve: true, rotate: false }],
      ['rotate + carve          ', { carve: true, rotate: true }]
    ];
    for (const [label, opts] of modes) {
      const map = quiet(() => RW.spineMap(db, opts));
      let tot = 0, blk = 0, wall = 0, encl = 0, biggest = 0, planCells = 0;
      Object.keys(map).forEach(st => {
        const g = map[st].grid;
        for (let k = 0; k < g.raw.length; k++) { if (g.raw[k]) wall++; if (g.enclosed[k]) encl++; }
        planCells += g.nx * g.ny;
        // §LEAK-SIGNATURE: a leak shows as ONE enclosed pocket swallowing the plan, not as a
        // smaller total. Total area alone cannot tell a leak from a legitimately different raster.
        map[st].pockets.forEach(pk => { if (pk.area > biggest) biggest = pk.area; });
        (doorsBy[st] || []).forEach(d => { tot++;
          const i2 = Math.floor((d[0] - g.xs0) / RW.RES), j2 = Math.floor((d[1] - g.ys0) / RW.RES);
          if (i2 < 0 || i2 >= g.nx || j2 < 0 || j2 >= g.ny) return;
          if (g.raw[i2 * g.ny + j2]) blk++; });
      });
      const A = c => (c * RW.RES * RW.RES);
      console.log('  ' + label + '  doorCentresOnWall=' + (100 * blk / tot).toFixed(0) + '%' +
        '  wall=' + A(wall).toFixed(0) + 'm²  enclosed=' + A(encl).toFixed(0) + 'm²' +
        '  largestPocket=' + biggest.toFixed(0) + 'm² (' +
        (100 * biggest / Math.max(1, A(planCells))).toFixed(1) + '% of plan)');
    }
    db.close();
  }
})();
