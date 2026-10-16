// W-ROOM-OCCL-EQUIV — issue proved/disproved: with roomOcclEnabled=false (the default), is the
// §13 branch's dlod_nav.js behavior IDENTICAL to origin/main's shipped dlod_nav.js? Method
// mirrors W-DLOD-NAV-EQUIV: a deterministic scripted pose sweep; at each pose wait for the
// partition to fully settle (mismatch=0, fades=0), then record audit{real,boxed} + a scene-level
// FNV-1a fingerprint of every nav-proxy instance matrix. Run once per code version (the harness
// swaps viewer/dlod_nav.js on disk between runs); per-pose records must match exactly.
const fs = require('fs');
const H = require('./harness');

const RUN = process.argv[2] || 'branch'; // 'branch' | 'main'
const LOG = [];
const sink = t => { LOG.push(t); };

(async () => {
  const { browser, page } = await H.launch(sink);
  try {
    await H.loadLTU(page, sink);
    await H.engageDlod(page, LOG);
    // Deterministic pose list computed from the DB (identical both runs): the largest room per
    // floor (interior) + 4 exterior orbit points at 1.2x envelope.
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
      const env = A.dbQuery("SELECT MIN(center_x), MAX(center_x), MIN(center_y), MAX(center_y), MAX(center_z) FROM element_transforms")[0];
      const cx = (env[0] + env[1]) / 2, cy = (env[2] + env[3]) / 2;
      const rad = Math.max(env[1] - env[0], env[3] - env[2]) * 0.7;
      const ctr = A.ifc2three(cx, cy, env[4] / 2);
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2;
        const p = A.ifc2three(cx + rad * Math.cos(a), cy + rad * Math.sin(a), env[4] * 0.8);
        out.push({ name: 'orbit' + i, pos: [p.x, p.y, p.z], look: [ctr.x, ctr.y, ctr.z] });
      }
      return out;
    });
    sink('EQUIV poses=' + poses.length);
    const records = [];
    for (const po of poses) {
      await H.setPose(page, po.pos, po.look);
      const a = await H.settle(page, 30000);
      const fp = await H.proxyFingerprint(page);
      const rec = { pose: po.name, real: a.real, boxed: a.boxed, mismatch: a.mismatch,
        hash: fp.hash, boxVis: fp.boxInstancesVisible, hiddenMeshes: fp.hiddenMeshes };
      records.push(rec);
      sink('§ROOM_OCCL_EQUIV_POSE run=' + RUN + ' ' + JSON.stringify(rec));
    }
    fs.writeFileSync(__dirname + '/w_equiv_' + RUN + '.json', JSON.stringify(records, null, 1));
  } finally {
    fs.writeFileSync(__dirname + '/w_equiv_' + RUN + '.log', LOG.join('\n'));
    await browser.close();
  }
})().catch(e => { LOG.push('ERR ' + e.stack); fs.writeFileSync(__dirname + '/w_equiv_' + RUN + '.log', LOG.join('\n')); process.exit(1); });
