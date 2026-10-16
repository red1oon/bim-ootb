// Smoke probe: GPU real, LTU loads, dlod engages, rooms compile, §ROOM_OCCL index builds when
// the lever flips. Names the issue: is the whole §13 wiring reachable end-to-end in-browser?
const fs = require('fs');
const H = require('./harness');
const LOG = [];
const sink = t => { LOG.push(t); };

(async () => {
  const { browser, page } = await H.launch(sink);
  try {
    await H.loadLTU(page, sink);
    await H.engageDlod(page); sink('PROBE engaged');
    await H.ensureRooms(page, sink);
    // place camera inside a room (query one), flip lever, watch index+room acceptance
    const room = await page.evaluate(() => {
      const A = window.APP || window.A;
      const r = A.dbQuery("SELECT room_guid, center_x, center_y, center_z, name FROM spatial_structure " +
        "WHERE type='IfcSpace' AND guid LIKE 'RM\\_%' ESCAPE '\\' AND size_x > 3 AND size_y > 3 " +
        "AND (predefined_type IS NULL OR predefined_type NOT LIKE 'SUSPECT%') ORDER BY size_x*size_y DESC LIMIT 1")[0];
      const p = A.ifc2three(r[1], r[2], r[3]);
      return { guid: r[0], name: r[4], three: [p.x, p.y + 0.5, p.z] };
    });
    sink('PROBE room=' + JSON.stringify(room));
    await H.setPose(page, room.three, [room.three[0] + 5, room.three[1], room.three[2]]);
    await page.evaluate(() => { window.__dlodNav.roomOcclEnabled = true; });
    // wait for room acceptance (stability N=12 frames) — poll stats
    await page.evaluate(async () => {
      const t0 = performance.now();
      while (performance.now() - t0 < 15000) {
        await new Promise(r => requestAnimationFrame(r));
        // nudge pose each frame so eval keeps running even if idle-parked
        const A = window.APP || window.A;
        A.camera.position.x += 0.0001; if (A.markDirty) A.markDirty();
        if (window.__dlodNav.roomCur) return;
      }
    });
    const st = await page.evaluate(() => ({
      roomCur: window.__dlodNav.roomCur, rects: window.__dlodNav.roomIdxRects,
      stamped: window.__dlodNav.roomIdxStamped, evals: window.__dlodNav.roomEvals,
      leg: window.__dlodNav.roomLeg }));
    sink('PROBE stats=' + JSON.stringify(st) + ' expectedRoom=' + room.guid +
      ' verdict=' + (st.roomCur === room.guid ? 'PASS' : 'CHECK'));
    const a = await H.settle(page);
    sink('PROBE audit=' + JSON.stringify(a));
  } finally {
    fs.writeFileSync(__dirname + '/w_probe.log', LOG.join('\n'));
    await browser.close();
  }
})().catch(e => { LOG.push('ERR ' + e.stack); fs.writeFileSync(__dirname + '/w_probe.log', LOG.join('\n')); process.exit(1); });
