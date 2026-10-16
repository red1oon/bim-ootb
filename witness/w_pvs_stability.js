// W-PVS-STABILITY — issue proved/disproved: with §16's pvsEnabled=true (not just §13's
// roomOcclEnabled), does the SAME ROOM_STABLE_N membership-stability gate still stop A→B→A flap
// sequences from triggering a room-state change, AND does the PVS build stay a ONE-TIME per-
// building cost (never rebuilt per flap/room-change)? Synthetic flap: camera alternates between
// two rooms every FLAP_HOLD(5) frames — faster than any §11.2 Q4-measured flap — for many cycles;
// roomChanges must not move, and §ROOM_PVS_BUILD must log at most once total.
const fs = require('fs');
const H = require('./harness');
const LOG = [];
const sink = t => { LOG.push(t); };

(async () => {
  const { browser, page } = await H.launch(sink);
  try {
    await H.loadLTU(page, sink);
    await H.engageDlod(page, LOG);
    await H.ensureRooms(page, sink);
    await page.evaluate(() => { window.__dlodNav.roomOcclEnabled = true; window.__dlodNav.pvsEnabled = true; });

    const res = await page.evaluate(async () => {
      const A = window.APP || window.A;
      // two same-floor rooms, far apart (first + last by X on the lowest floor)
      const rooms = A.dbQuery("SELECT room_guid, center_x, center_y, center_z FROM spatial_structure " +
        "WHERE type='IfcSpace' AND guid LIKE 'RM\\_%' ESCAPE '\\' AND center_x IS NOT NULL " +
        "AND size_x > 2 AND size_y > 2 " +
        "AND (predefined_type IS NULL OR predefined_type NOT LIKE 'SUSPECT%') " +
        "ORDER BY center_z ASC, center_x ASC");
      const z0 = rooms[0][3];
      const sameFloor = rooms.filter(r => Math.abs(r[3] - z0) < 1);
      const ra = sameFloor[0], rb = sameFloor[sameFloor.length - 1];
      const pa = A.ifc2three(ra[1], ra[2], ra[3]), pb = A.ifc2three(rb[1], rb[2], rb[3]);
      const S = window.__dlodNav;
      const frame = () => new Promise(r => requestAnimationFrame(r));
      const put = p => { A.camera.position.set(p.x, p.y + 0.5, p.z); A.camera.updateMatrixWorld(true); if (A.markDirty) A.markDirty(); };
      const out = { roomA: ra[0], roomB: rb[0], phases: [] };

      // Phase 1: hold A until accepted
      put(pa);
      let f = 0;
      while (S.roomCur !== ra[0] && f < 600) { await frame(); f++; }
      out.phases.push({ phase: 'holdA', frames: f, roomCur: S.roomCur, changes: S.roomChanges });

      // Phase 2: synthetic A→B→A flap, 5 frames per side (faster than every measured flap),
      // 24 alternations = 120 frames. roomChanges must stay put, roomCur must stay A.
      const changesBefore = S.roomChanges;
      const FLAP_HOLD = 5, CYCLES = 24;
      for (let c = 0; c < CYCLES; c++) {
        put(c % 2 === 0 ? pb : pa);
        for (let i = 0; i < FLAP_HOLD; i++) await frame();
      }
      out.phases.push({ phase: 'flap5', cycles: CYCLES, roomCur: S.roomCur,
        changesDuringFlap: S.roomChanges - changesBefore });

      // Phase 3: genuine move — hold B; must be accepted (no deadlock), count frames to accept
      put(pb);
      f = 0;
      while (S.roomCur !== rb[0] && f < 600) { await frame(); f++; }
      out.phases.push({ phase: 'holdB', frames: f, roomCur: S.roomCur, changes: S.roomChanges });
      return out;
    });

    const p1 = res.phases[0], p2 = res.phases[1], p3 = res.phases[2];
    const pvsBuilds = LOG.filter(l => l.indexOf('§ROOM_PVS_BUILD') >= 0).length;
    const pass = p1.roomCur === res.roomA && p2.changesDuringFlap === 0 && p2.roomCur === res.roomA &&
      p3.roomCur === res.roomB && pvsBuilds <= 1;
    sink('§PVS_STABILITY holdA_frames=' + p1.frames + ' roomA=' + res.roomA +
      ' flap5x24_changes=' + p2.changesDuringFlap + ' flap_roomCur=' + p2.roomCur +
      ' holdB_frames=' + p3.frames + ' roomB=' + res.roomB + ' pvsBuilds=' + pvsBuilds +
      ' verdict=' + (pass ? 'PASS' : 'FAIL'));
  } finally {
    fs.writeFileSync(__dirname + '/w_pvs_stability.log', LOG.join('\n'));
    await browser.close();
  }
})().catch(e => { LOG.push('ERR ' + e.stack); fs.writeFileSync(__dirname + '/w_pvs_stability.log', LOG.join('\n')); process.exit(1); });
