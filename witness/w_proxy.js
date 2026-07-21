// W-ROOM-OCCL-PROXY — issue proved/disproved: with roomOcclEnabled=true, does the APPLIED boxed
// set match a from-scratch recompute of (distance OR frustum OR room-mismatch) eligibility?
// (__dlodNavAudit IS that recompute — mismatch must be 0 once settled.) Also proves the explicit
// no-room state: camera outside all compiled rects ⇒ room criterion contributes nothing
// (roomCur=none, roomOnlyBoxed=0), and that roomOnlyBoxed>0 inside a room (the criterion BITES).
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
    await page.evaluate(() => { window.__dlodNav.roomOcclEnabled = true; });

    const spots = await page.evaluate(() => {
      const A = window.APP || window.A;
      const rooms = A.dbQuery("SELECT room_guid, center_x, center_y, center_z FROM spatial_structure " +
        "WHERE type='IfcSpace' AND guid LIKE 'RM\\_%' ESCAPE '\\' AND center_x IS NOT NULL " +
        "AND size_x > 3 AND size_y > 3 " +
        "AND (predefined_type IS NULL OR predefined_type NOT LIKE 'SUSPECT%') " +
        "ORDER BY center_z ASC, size_x*size_y DESC");
      const lo = rooms[0], hi = rooms[rooms.length - 1];
      const env = A.dbQuery("SELECT MIN(center_x), MAX(center_x), MIN(center_y), MAX(center_y) FROM element_transforms")[0];
      const pLo = A.ifc2three(lo[1], lo[2], lo[3]);
      const pHi = A.ifc2three(hi[1], hi[2], hi[3]);
      const pOut = A.ifc2three(env[1] + 60, env[3] + 60, lo[3]); // 60m outside envelope — no room
      return [
        { name: 'roomLow', expect: lo[0], pos: [pLo.x, pLo.y + 0.5, pLo.z], look: [pLo.x + 8, pLo.y, pLo.z] },
        { name: 'roomHigh', expect: hi[0], pos: [pHi.x, pHi.y + 0.5, pHi.z], look: [pHi.x + 8, pHi.y, pHi.z] },
        { name: 'outside', expect: null, pos: [pOut.x, pOut.y, pOut.z], look: [pLo.x, pLo.y, pLo.z] },
      ];
    });

    let pass = true;
    for (const s of spots) {
      await H.setPose(page, s.pos, s.look);
      // wait for stability acceptance of the expected room state (N=12 frames) then settle scan
      await page.evaluate(async (expect) => {
        const t0 = performance.now();
        while (performance.now() - t0 < 20000) {
          await new Promise(r => requestAnimationFrame(r));
          if (window.__dlodNav.roomCur === expect) return;
        }
      }, s.expect);
      const a = await H.settle(page, 40000);
      const ro = a.roomOccl;
      const ok = a.mismatch === 0 && ro.room === s.expect &&
        (s.expect === null ? ro.active === false && ro.roomOnlyBoxed === 0
                           : ro.active === true && ro.roomOnlyBoxed > 0);
      pass = pass && ok;
      sink('§ROOM_OCCL_PROXY spot=' + s.name + ' expect=' + (s.expect || 'none') +
        ' got=' + (ro.room || 'none') + ' mismatch=' + a.mismatch + ' real=' + a.real +
        ' boxed=' + a.boxed + ' roomOnlyBoxed=' + ro.roomOnlyBoxed + ' active=' + ro.active +
        ' verdict=' + (ok ? 'PASS' : 'FAIL'));
    }
    sink('§ROOM_OCCL_PROXY_VERDICT ' + (pass ? 'PASS' : 'FAIL'));
  } finally {
    fs.writeFileSync(__dirname + '/w_proxy.log', LOG.join('\n'));
    await browser.close();
  }
})().catch(e => { LOG.push('ERR ' + e.stack); fs.writeFileSync(__dirname + '/w_proxy.log', LOG.join('\n')); process.exit(1); });
