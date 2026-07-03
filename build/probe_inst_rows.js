#!/usr/bin/env node
// # ⚠ DO NOT REMOVE — probe (not a witness): after a REAL ELEC walk on Duplex, which InstancedMesh
// instances carry guids that have Outliner leaf rows? Read the log after the run; exit code is not evidence.
'use strict';
const { runE2E } = require('../modeller/tests/e2e_harness');
runE2E('PROBE-INST-ROWS', async (t) => {
  await t.open('Duplex');
  await t.pg.evaluate(() => window.discWalk('ELEC', { building: 'Duplex' }));
  await t.pg.waitForFunction(() => {
    const g = window.Bonsai.group(); const root = g && g.children.find(o => o.userData && o.userData.dwRoot);
    return !!(root && root.children.some(o => o.isInstancedMesh && o.userData.dwDisc === 'ELEC'));
  }, { timeout: 30000 }).catch(() => {});
  await t.sleep(3000);
  const st = await t.pg.evaluate(() => {
    const g = window.Bonsai.group(); const root = g.children.find(o => o.userData && o.userData.dwRoot);
    const ims = root ? root.children.filter(o => o.isInstancedMesh && o.userData.dwSub) : [];
    if (window.Bonsai.outliner) { window.Bonsai.outliner._collapsed = {}; window.Bonsai.outliner._paint(); }
    const out = [];
    ims.forEach((im, k) => {
      const sub = im.userData.dwSub;
      const withGuid = sub.filter(p => p && p.guid).length;
      // how many of those guids have an outliner leaf row in the tree fold (not just DOM — DOM is windowed)
      const roots = (window.Bonsai.outliner && window.Bonsai.outliner._lastRoots) || {};
      const ids = new Set();
      const walk = n => { ids.add(String(n.id)); (n.children || []).forEach(walk); };
      Object.keys(roots).forEach(key => (roots[key] || []).forEach(walk));
      const inTree = sub.filter(p => p && p.guid && ids.has(String(p.guid))).length;
      out.push({ k, disc: im.userData.dwDisc || null, asm: im.userData.dwAsm || null, chain: im.userData.dwChain || null,
        count: im.count, withGuid, inTree, sample: (sub.find(p => p && p.guid) || {}).guid || null });
    });
    // also: total element leaf nodes in tree + how many resolve to fid bridge
    const roots = (window.Bonsai.outliner && window.Bonsai.outliner._lastRoots) || {};
    let leaves = 0, bridged = 0;
    const fidByGuid = window.__arcFidByGuid || {};
    const walk2 = n => { if (n.kind === 'element') { leaves++; if (fidByGuid[n.id] != null) bridged++; } (n.children || []).forEach(walk2); };
    Object.keys(roots).forEach(key => (roots[key] || []).forEach(walk2));
    return { ims: out, leaves, bridged };
  });
  console.log('  §PROBE ims=' + JSON.stringify(st.ims, null, 1));
  console.log('  §PROBE leaves=' + st.leaves + ' bridged=' + st.bridged);
  t.assert('probe ran (see §PROBE lines)', true, '');
}, { width: 1200, height: 850, dpr: 1 });
