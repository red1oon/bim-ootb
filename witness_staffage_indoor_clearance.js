#!/usr/bin/env node
/**
 * §STAFFAGE_CLEARANCE witness — prompts/STAFFAGE_WALKABLE_PLACEMENT.md (bim-compiler)
 *
 * Proves, numerically and BEFORE vs AFTER, the two defects the user reported live on Terminal:
 *   (1) "car and trees cannot appear in Terminal hall when not sufficient open space of a big
 *       potting space to contain it"  -> badIndoor = trees/cars standing under a real roof.
 *   (2) "indoors should only be pax stand and sit - not clashing with any prop ie not inside a
 *       mesh"                          -> badInMesh = figures whose body volume intersects geometry.
 *
 * NON-TAUTOLOGICAL BY CONSTRUCTION: the counts below are re-derived in-page from the FINAL world
 * positions of the placed objects, raycast against the rendered building meshes. The harness never
 * asks the placement code whether it thinks it did the right thing (same discipline as
 * §STAFFAGE_WALK_CLEAR / the PR #898 badSit witness).
 *
 * Exit 0 = PASS (before > 0 and after == 0), 2 = INCONCLUSIVE (defect did not reproduce before the
 * fix — a run where both sides are zero must never be reportable as a pass), 1 = FAIL.
 *
 * Usage: node witness_staffage_indoor_clearance.js
 */
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');

const CASES = [
  // Camera placed INSIDE the building, the framing the user reported from.
  // NOTE: the ?db= param must be the *_extracted.db name even for a split model — scene.js's
  // §DB_SPLIT_DETECT derives `<stem>_meta.db`/`<stem>_geo.db` from it. Passing Terminal_meta.db
  // directly makes it look for `Terminal_meta_meta.db` (404) and NO geometry ever streams.
  { name: 'Terminal-hall', db: 'buildings/Terminal_extracted.db', bld: 'TerminalMerged',
    settle: 300000, presses: 3 },
  { name: 'HHS-interior', db: 'buildings/HHS_Office_Federated_extracted.db', bld: 'HHS_Office_Federated',
    settle: 90000, presses: 3 },
];
const PORTS = { before: 8491, after: 8492 };

// ---- the independent re-derivation, run in the page ----------------------------------------
function auditInPage() {
  const A = window.APP || window.A;
  const THREE = window.THREE;
  const grp = A._photoStaffageGroup || (function () {
    let g = null;
    A.scene.traverse(o => { if (!g && o.isGroup && o.children.length &&
      o.children.some(c => c.userData && (c.userData.staffageFile || c.userData.staffageKind))) g = o; });
    return g;
  })();
  if (!grp) return { err: 'no staffage group found' };

  // Real building geometry only — staffage, sky and ground excluded, exactly like a human would
  // judge "is this thing inside the building".
  const solids = [];
  A.scene.traverse(o => {
    if (!(o.isMesh || o.isInstancedMesh || o.isBatchedMesh)) return;
    if (!o.visible) return;
    if (o.userData && o.userData.staffageKind !== undefined) return;
    if (o.parent === grp) return;
    if (A.sky && o === A.sky) return;
    if (A.ground && o === A.ground) return;
    solids.push(o);
  });

  const ray = new THREE.Raycaster();
  const hit = (origin, dir, far) => {
    ray.set(origin, dir); ray.far = far;
    let hs; try { hs = ray.intersectObjects(solids, false); } catch (e) { return Infinity; }
    for (const h of hs) if (!h.object.isSprite) return h.distance;
    return Infinity;
  };
  const ceilingAbove = p => {
    const d = hit(new THREE.Vector3(p.x, p.y + 0.3, p.z), new THREE.Vector3(0, 1, 0), 120);
    return d === Infinity ? Infinity : d + 0.3;
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

  const out = { solids: solids.length, total: 0, people: 0, trees: 0, cars: 0,
                badIndoor: 0, badInMesh: 0, detail: [] };
  for (const c of grp.children) {
    const ud = c.userData || {};
    let kind = ud.staffageKind;
    if (!kind && ud.staffageFile) kind = /tree/i.test(ud.staffageFile) ? 'tree' : 'people';
    if (!kind) continue;
    out.total++;
    const p = c.position;

    if (kind === 'people') {
      out.people++;
      // Seated figures are EXEMPT: a person seated at a table is SUPPOSED to overlap it by
      // construction (PR #898 established this; 159/160 Hospital chair centres fall inside a table
      // bbox). Only standing/walking figures must be clear of geometry.
      if (ud.sitAnchorIfc) continue;
      const cr = clearRadius(p, 0.45);
      if (cr < 0.45) { out.badInMesh++; out.detail.push(`pax inMesh clear=${cr.toFixed(2)}m`); }
    } else if (kind === 'tree') {
      out.trees++;
      const ce = ceilingAbove(p);
      if (ce !== Infinity) { out.badIndoor++; out.detail.push(`tree indoor ceiling=${ce.toFixed(1)}m`); }
    } else if (kind === 'car') {
      out.cars++;
      const ce = ceilingAbove(p);
      // A car under a LOW deck (car park / loading bay / porte-cochere) is legitimate; a car under a
      // high concourse roof is the reported defect.
      if (ce !== Infinity && ce > 4.5) { out.badIndoor++; out.detail.push(`car indoor-hall ceiling=${ce.toFixed(1)}m`); }
    }
  }
  return out;
}

async function runCase(port, kase, tag) {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox',
           '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  const lines = [];
  page.on('console', m => { const t = m.text(); if (/§|Error/.test(t)) lines.push(t); });
  page.on('pageerror', e => lines.push('PAGEERROR ' + e.message));

  const url = `http://localhost:${port}/viewer/viewer.html?db=${kase.db}&bld=${kase.bld}`;
  console.log(`  [${tag}/${kase.name}] ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });

  // Wait for real geometry — the probes are meaningless against an empty scene.
  const streamed = await page.waitForFunction(() => {
    const A = window.APP || window.A;
    if (!A || !A.scene) return false;
    let n = 0;
    A.scene.traverse(o => { if (o.isMesh || o.isInstancedMesh || o.isBatchedMesh) n++; });
    return n > 50 ? n : false;
  }, { timeout: kase.settle, polling: 3000 }).then(h => h.jsonValue()).catch(() => 0);
  console.log(`  [${tag}/${kase.name}] meshes streamed: ${streamed}`);
  if (!streamed) { await browser.close(); return { err: 'no geometry streamed', lines }; }
  await new Promise(r => setTimeout(r, 15000));   // let the stream settle further

  // Put the camera INSIDE the building, mid-height, looking along the long axis — the reported
  // framing ("Terminal hall"). Derived from the model's own bbox, not hardcoded coordinates.
  const cam = await page.evaluate(() => {
    // Camera derived from the model's OWN IFC bbox in the DB, not THREE.Box3.expandByObject —
    // that returned NaN here (BatchedMesh/InstancedMesh without computed bounds), which silently
    // NaN'd the whole first witness run.
    const A = window.APP || window.A, THREE = window.THREE;
    const r = A.dbQuery('SELECT MIN(center_x),MAX(center_x),MIN(center_y),MAX(center_y),MIN(center_z),MAX(center_z) FROM element_transforms WHERE center_x IS NOT NULL');
    if (!r || !r.length) return { err: 'no bbox' };
    const [x0, x1, y0, y1, z0] = r[0];
    // Stand INSIDE, 30% into the plan on the long axis, mid-span on the short axis, eye height
    // 1.7m above the lowest element — i.e. a person standing in the concourse.
    const eyeIfc = [x0 + (x1 - x0) * 0.30, (y0 + y1) / 2, z0 + 1.7];
    const tgtIfc = [x0 + (x1 - x0) * 0.85, (y0 + y1) / 2, z0 + 1.7];
    const e = A.ifc2three(eyeIfc[0], eyeIfc[1], eyeIfc[2]);
    const t = A.ifc2three(tgtIfc[0], tgtIfc[1], tgtIfc[2]);
    if (![e.x, e.y, e.z].every(Number.isFinite)) return { err: 'non-finite camera' };
    A.camera.position.set(e.x, e.y, e.z);
    A.camera.lookAt(new THREE.Vector3(t.x, t.y, t.z));
    A.camera.updateMatrixWorld(true);
    if (A.controls) { A.controls.target.set(t.x, t.y, t.z); A.controls.update(); }
    return { eyeIfc: eyeIfc.map(v => +v.toFixed(1)), eye3: [e.x, e.y, e.z].map(v => +v.toFixed(1)),
             ifcBBox: r[0].map(v => +v.toFixed(1)) };
  });
  console.log(`  [${tag}/${kase.name}] camera: ${JSON.stringify(cam)}`);
  if (cam.err) { await browser.close(); return { err: "camera: " + cam.err, lines }; }

  for (let i = 0; i < kase.presses; i++) {
    await page.evaluate(() => { const A = window.APP || window.A; A.togglePopulate(); });
    await new Promise(r => setTimeout(r, 6000));
  }
  await new Promise(r => setTimeout(r, 4000));

  const audit = await page.evaluate(auditInPage);
  await browser.close();
  return { audit, lines };
}

(async () => {
  const results = {};
  for (const kase of CASES) {
    results[kase.name] = {};
    for (const tag of ['before', 'after']) {
      console.log(`\n=== ${tag.toUpperCase()} / ${kase.name} ===`);
      const r = await runCase(PORTS[tag], kase, tag);
      results[kase.name][tag] = r;
      console.log(`  audit: ${JSON.stringify(r.audit || r.err)}`);
      for (const l of r.lines.filter(l => /STAFFAGE|PAGEERROR/.test(l)).slice(-40)) console.log('    | ' + l);
    }
  }

  console.log('\n================ VERDICT ================');
  let reproduced = false, stillBad = false;
  for (const [name, r] of Object.entries(results)) {
    const b = r.before.audit, a = r.after.audit;
    if (!b || !a) { console.log(`${name}: NO DATA (${r.before.err || ''} ${r.after.err || ''})`); continue; }
    console.log(`${name}:`);
    console.log(`  BEFORE  total=${b.total} people=${b.people} trees=${b.trees} cars=${b.cars}  badIndoor=${b.badIndoor} badInMesh=${b.badInMesh}`);
    b.detail.slice(0, 8).forEach(d => console.log(`          - ${d}`));
    console.log(`  AFTER   total=${a.total} people=${a.people} trees=${a.trees} cars=${a.cars}  badIndoor=${a.badIndoor} badInMesh=${a.badInMesh}`);
    a.detail.slice(0, 8).forEach(d => console.log(`          - ${d}`));
    if (b.badIndoor + b.badInMesh > 0) reproduced = true;
    if (a.badIndoor + a.badInMesh > 0) stillBad = true;
  }
  if (!reproduced) {
    console.log('\nINCONCLUSIVE — the defect did not reproduce on the BEFORE tree. A run where both');
    console.log('sides are zero proves nothing and must not be reported as a pass.');
    process.exit(2);
  }
  if (stillBad) { console.log('\nFAIL — defect still present after the fix.'); process.exit(1); }
  console.log('\nPASS — before > 0, after = 0 on every case that reproduced.');
  process.exit(0);
})();
