// WITNESS — §STAFFAGE_SIT_OPEN_FLOOR (R1, PHOTOREAL_STILL_RENDER.md "LIVE TRIAL REGRESSIONS").
// ISSUE IT PROVES/DISPROVES: "There are no more sitting pax in the Terminal hall though there are
// seats" — measured root cause (this session, r1_probe_before.txt): Terminal's furniture set has
// only 4 rows that pass §STAFFAGE_SEAT_CLASS as real seats out of 176, and none land in this camera's
// view/16m range on ANY of 3 presses (`§STAFFAGE_SEAT_CLASS ... inViewSeats=0`, sit=0 every time).
// User ruling: a seated figure needs no real chair or adjacent table — fall back to open floor
// "just for semblance". This drives the REAL _updateInFrameInterior (via A.togglePopulate()) inside
// the Terminal/Hospital hall and asserts:
//   (a) cumulative seated pax placed over 3 presses is >0 (the exact negation of the reported defect;
//       BEFORE-fix logs captured this session show sit=0/openFloor=0 on every press, every building
//       tested — see r1_probe_before.txt),
//   (b) EVERY open-floor seated figure (userData.sitOpenFloor === true) independently re-audits as
//       CLEAR of real geometry (>= 0.4m — the `_CLR_PERSON` bar minus float slack), re-derived from a
//       fresh BVH raycast against the rendered scene, never asking the placement code whether it
//       thinks it did the right thing (same discipline as witness_staffage_indoor_clearance.js).
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');

const PORT = process.env.PORT || 8399;
const CASES = [
  { name: 'Terminal', db: '/buildings/Terminal_extracted.db', frac: 0.30 },
  { name: 'Hospital', db: '/buildings/Hospital_extracted.db', frac: 0.30 },
];

function auditInPage() {
  const A = window.APP, THREE = window.THREE;
  const grp = A._photoStaffageGroup;
  if (!grp) return { err: 'no staffage group' };
  const solids = [];
  A.scene.traverse(o => {
    if (!(o.isMesh || o.isInstancedMesh || o.isBatchedMesh)) return;
    if (!o.visible) return;
    if (o.userData && o.userData.staffageKind !== undefined) return;
    if (o.parent === grp) return;
    if (A.sky && o === A.sky) return;
    solids.push(o);
  });
  const ray = new THREE.Raycaster();
  const hit = (origin, dir, far) => {
    ray.set(origin, dir); ray.far = far;
    let hs; try { hs = ray.intersectObjects(solids, false); } catch (e) { return Infinity; }
    for (const h of hs) if (!h.object.isSprite) return h.distance;
    return Infinity;
  };
  const clearRadius = (p, need) => {
    let min = need;
    for (const h of [0.25, 1.2]) {
      const o = new THREE.Vector3(p.x, p.y + h, p.z);
      for (let a = 0; a < 16; a++) {
        const t = (a / 16) * Math.PI * 2;
        const d = hit(o, new THREE.Vector3(Math.cos(t), 0, Math.sin(t)), need);
        if (d < min) min = d;
      }
    }
    return min;
  };
  let seatSit = 0, openFloorSit = 0, badOpenFloor = 0;
  const detail = [];
  for (const c of grp.children) {
    const ud = c.userData || {};
    if (ud.staffageKind && ud.staffageKind !== 'people') continue;
    if (!ud.interior) continue;
    if (ud.sitAnchorIfc) { seatSit++; continue; }         // real-seat anchored — PR #898 exempt
    if (ud.sitOpenFloor) {
      openFloorSit++;
      const cr = clearRadius(c.position, 0.45);
      if (cr < 0.4) { badOpenFloor++; detail.push(`openFloor inMesh clear=${cr.toFixed(2)}m`); }
    }
  }
  return { seatSit, openFloorSit, badOpenFloor, detail };
}

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--enable-unsafe-swiftshader'],
    protocolTimeout: 300000,
  });
  let allPass = true;

  for (const kase of CASES) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    const logs = [];
    page.on('console', m => { const t = m.text(); if (/§|Error/.test(t)) logs.push(t); });
    page.on('pageerror', e => logs.push('PAGEERROR ' + e.message));

    console.log(`\n${'='.repeat(78)}\n${kase.name}\n${'='.repeat(78)}`);
    await page.goto(`http://localhost:${PORT}/viewer/viewer.html?db=${kase.db}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => {
      const A = window.APP;
      try { const r = A.dbQuery('SELECT COUNT(*) FROM element_transforms'); return r && r.length && r[0][0] > 0; }
      catch (e) { return false; }
    }, { timeout: 90000, polling: 2000 });
    await new Promise(r => setTimeout(r, 15000));

    const cam = await page.evaluate((frac) => {
      const A = window.APP, THREE = window.THREE;
      const r = A.dbQuery('SELECT MIN(center_x),MAX(center_x),MIN(center_y),MAX(center_y),MIN(center_z),MAX(center_z) FROM element_transforms WHERE center_x IS NOT NULL');
      const [x0, x1, y0, y1, z0] = r[0];
      const eyeIfc = [x0 + (x1 - x0) * frac, (y0 + y1) / 2, z0 + 1.7];
      const tgtIfc = [x0 + (x1 - x0) * (frac + 0.55), (y0 + y1) / 2, z0 + 1.7];
      const e = A.ifc2three(eyeIfc[0], eyeIfc[1], eyeIfc[2]);
      const t = A.ifc2three(tgtIfc[0], tgtIfc[1], tgtIfc[2]);
      A.camera.position.set(e.x, e.y, e.z);
      A.camera.lookAt(new THREE.Vector3(t.x, t.y, t.z));
      A.camera.updateMatrixWorld(true);
      if (A.controls) { A.controls.target.set(t.x, t.y, t.z); A.controls.update(); }
      return { eyeIfc };
    }, kase.frac);
    console.log('  camera: ' + JSON.stringify(cam));

    const before = logs.length;
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.APP.togglePopulate());
      await new Promise(r => setTimeout(r, 6000));
    }
    await new Promise(r => setTimeout(r, 3000));
    const tail = logs.slice(before);
    tail.filter(l => /STAFFAGE_SEAT_CLASS|STAFFAGE_SIT_FALLBACK|PHOTO_STAFFAGE_INTERIOR/.test(l)).forEach(l => console.log('    ' + l));

    const audit = await page.evaluate(auditInPage);
    console.log('  audit: ' + JSON.stringify(audit));

    const sitTotalLines = tail.filter(l => l.startsWith('§PHOTO_STAFFAGE_INTERIOR'));
    const sitCounts = sitTotalLines.map(l => { const m = l.match(/sit=(\d+)/); return m ? parseInt(m[1], 10) : 0; });
    const maxSitSeen = sitCounts.length ? Math.max(...sitCounts) : 0;

    const checks = [
      ['at least one §PHOTO_STAFFAGE_INTERIOR line logged', sitTotalLines.length > 0],
      ['seated pax placed (sit>0) at least once across 3 presses — the reported defect was sit=0 every time', maxSitSeen > 0],
      ['audit found open-floor seated figures (openFloorSit>0)', !audit.err && audit.openFloorSit > 0],
      ['ZERO in-mesh violations among open-floor seated figures (independent BVH re-derivation)', !audit.err && audit.badOpenFloor === 0],
    ];
    checks.forEach(([label, ok]) => { console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${label}`); if (!ok) allPass = false; });

    const errs = logs.filter(l => l.startsWith('PAGEERROR'));
    if (errs.length) { console.log('  PAGEERRORS: ' + errs.join(' | ')); allPass = false; }
    await page.close();
  }

  console.log(`\n${'='.repeat(78)}\nVERDICT: ${allPass ? 'PASS — open-floor seated pax now place, none in-mesh' : 'FAIL'}\n`);
  await browser.close();
  process.exit(allPass ? 0 : 1);
})();
