// W-PVS-EQUIV — issue proved/disproved: with §16's NEW pvsEnabled flag left at its default
// (false), is behavior BYTE-IDENTICAL to §13's shipped dlod_nav.js (origin/main, pre-§16),
// with roomOcclEnabled ACTUALLY ENGAGED (true) — not just both-flags-dormant, which the
// pre-existing w_equiv_*.json pair already proved trivially. Method: same deterministic pose
// sweep + scene fingerprint as the original W-ROOM-OCCL-EQUIV, run once against THIS worktree's
// modified dlod_nav.js (pvsEnabled left false) and once against origin/main's dlod_nav.js swapped
// onto disk in its place (the harness's own established swap convention) — records must match
// exactly.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const H = require('./harness');

const RUN = process.argv[2] || 'pvs-off'; // 'pvs-off' (this worktree's code) | 'shipped-main' (origin/main's dlod_nav.js)
const LOG = [];
const sink = t => { LOG.push(t); };

(async () => {
  const { browser, page } = await H.launch(sink);
  try {
    await H.loadLTU(page, sink);
    await H.engageDlod(page, LOG);
    // Actually engage the §13 room-mismatch mechanism (roomOcclEnabled) — dormant by default,
    // this is the ONLY way to test the code path W-PVS-EQUIV cares about (§16's pvsEnabled=false
    // fallback branch inside an ACTIVE roomOcclEnabled mechanism, not both flags dormant).
    await H.ensureRooms(page, sink);
    await page.evaluate(() => { window.__dlodNav.roomOcclEnabled = true; });
    sink('§PVS_EQUIV_FLAGS roomOcclEnabled=true pvsEnabled=' + await page.evaluate(() => window.__dlodNav.pvsEnabled));

    const poses = await page.evaluate(() => {
      const A = window.APP || window.A;
      const rooms = A.dbQuery("SELECT guid, center_x, center_y, center_z FROM spatial_structure " +
        "WHERE type='IfcSpace' AND guid LIKE 'RM\\_%' ESCAPE '\\' AND center_x IS NOT NULL " +
        "AND (predefined_type IS NULL OR predefined_type NOT LIKE 'SUSPECT%') " +
        "ORDER BY size_x*size_y DESC LIMIT 40") || [];
      const perFloor = {};
      for (const r of rooms) { const k = Math.round(r[3]); if (Object.keys(perFloor).length < 4 && !(k in perFloor)) perFloor[k] = r; }
      const out = [];
      for (const k of Object.keys(perFloor).sort((a, b) => a - b)) {
        const r = perFloor[k]; const p = A.ifc2three(r[1], r[2], r[3]);
        out.push({ name: 'room@z' + k, pos: [p.x, p.y + 0.5, p.z], look: [p.x + 10, p.y, p.z] });
      }
      return out;
    });
    sink('PVS_EQUIV poses=' + poses.length);
    const records = [];
    for (const po of poses) {
      await H.setPose(page, po.pos, po.look);
      const a = await H.settle(page, 30000);
      const fp = await H.proxyFingerprint(page);
      const audit = await page.evaluate(() => window.__dlodNavAudit());
      const rec = { pose: po.name, real: a.real, boxed: a.boxed, mismatch: a.mismatch,
        hash: fp.hash, boxVis: fp.boxInstancesVisible, hiddenMeshes: fp.hiddenMeshes,
        roomCur: audit.roomOccl.room, roomOnlyBoxed: audit.roomOccl.roomOnlyBoxed };
      records.push(rec);
      sink('§PVS_EQUIV_POSE run=' + RUN + ' ' + JSON.stringify(rec));
    }
    fs.writeFileSync(__dirname + '/w_pvs_equiv_' + RUN + '.json', JSON.stringify(records, null, 1));
  } finally {
    fs.writeFileSync(__dirname + '/w_pvs_equiv_' + RUN + '.log', LOG.join('\n'));
    await browser.close();
  }
})().catch(e => { LOG.push('ERR ' + e.stack); fs.writeFileSync(__dirname + '/w_pvs_equiv_' + RUN + '.log', LOG.join('\n')); process.exit(1); });
