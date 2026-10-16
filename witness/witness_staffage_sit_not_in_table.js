// WITNESS — §STAFFAGE_SEAT_CLASS: seated staffage figures must never be placed inside a table.
//
// ISSUE PROVEN/DISPROVEN (user report 2026-07-20: "sitting figures are being placed INSIDE tables"):
//   _updateInFrameInterior() selected seat anchors with
//     WHERE em.ifc_class IN ('IfcFurniture','IfcFurnishingElement')
//   — no chair-vs-table discrimination at all — and dropped the seated sprite at the chosen
//   element's own center_x/center_y. A table, desk, counter or nurse station IS furniture, so a
//   sit pick could anchor a figure at the geometric centre of a table, i.e. inside it.
//
// THE INVARIANT THIS TEST MEASURES (re-derived from the DB, independent of the placement search —
// it does not ask the code "did you think this was a seat", it re-tests the FINAL world positions):
//   badSit = # of placed SITTING sprites whose IFC (x,y) falls inside the plan bbox of a furniture
//            element that is NOT a seat, AND which have no seat element within 0.4m.
//   The 0.4m seat-adjacency exemption matters and is not a fudge: Hospital's dining chairs ring a
//   `M_Table-Dining Round w Chairs` element whose bbox spans the whole setting, so 159/160 chair
//   centres legitimately fall inside a table bbox. A person seated AT a table is supposed to
//   overlap it. A figure anchored to a seat is 0.0m from that seat; a figure anchored to a table
//   centre is ~0.7-0.9m from the nearest chair. 0.4m separates the two cleanly.
//
// PASS BAR: before-fix badSit > 0 (the bug is real and this test can see it);
//           after-fix  badSit = 0 on every building tested.
// A run where both are 0 proves NOTHING and must be reported as an inconclusive test, not a pass.
//
// Serves two trees: :8482 = origin/main (before), :8481 = the fix (after). Same DBs, same camera,
// same presses — the ONLY difference is viewer/effects.js.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');

const AFTER = 'http://localhost:8481';
const BEFORE = 'http://localhost:8482';

// Buildings with real furniture. Hospital is the discriminating case (160 chairs + 37 tables +
// 4 nurse stations). Clinic is the zero-seat control (118 furniture, all casework, no chairs).
const CASES = [
  // Dining hall: 8 `M_Table-Dining Round w Chairs` (1.5m) each ringed by 6 M_Chair-Breuer. Mixed
  // seats + tables in one frame — the realistic case.
  { bld: 'Hospital-dining', dbBld: 'Hospital', db: 'buildings/Hospital_extracted.db', camIfc: [37.7, 115.6, 173.6], lookIfc: [40.9, 115.0, 172.4] },
  // ED nurse stations: the ONLY furniture in this neighbourhood is 3 nurse stations (18-25m wide,
  // zero chairs). Any sit figure placed here is necessarily anchored to a non-seat.
  { bld: 'Hospital-station', dbBld: 'Hospital', db: 'buildings/Hospital_extracted.db', camIfc: [60.0, 65.2, 174.5], lookIfc: [64.9, 65.2, 172.9] },
  // Clinic: 118 furniture rows, ZERO seats (all cabinets/countertops). Every sit figure the old
  // code places here is by definition on a non-seat; the fix must place none at all.
  { bld: 'Clinic', dbBld: 'Clinic', db: 'buildings/Clinic_extracted.db', camIfc: [-33.0, 44.0, 2.0], lookIfc: [-29.0, 44.0, 0.9] },
];

// The seat rule, re-implemented here on purpose so the witness does not import the code under test.
function isSeat(name, bx, by) {
  const fam = String(name || '').split(':')[0];
  const s = /chair|seat|stool|sofa|bench|couch|settee|\bstol/i.exec(fam);
  if (!s) return false;
  const n = /table|desk|counter|station|cabinet|shelv|shelf|\bbed\b|bord|sk[aå]p|bokhyll|worktop|\btbl\b|entertainment|\btop\b/i.exec(fam);
  if (n && n.index < s.index) return false;
  return (bx == null || bx <= 1.2) && (by == null || by <= 1.2);
}

async function run(base, label, c) {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1000, height: 700 });
  const logs = [];
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => logs.push('PAGEERROR ' + e.message));

  const url = `${base}/viewer/viewer.html?db=${c.db}&bld=${c.dbBld}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => window.APP && window.APP.dbQuery && window.APP.camera && window.APP.togglePopulate, { timeout: 120000 });
  await new Promise(r => setTimeout(r, 12000)); // let the DB open + some geometry stream

  // Park the camera inside, looking at a real furniture cluster (IFC coords measured from the DB).
  if (c.camIfc) {
    await page.evaluate((cam, look) => {
      const A = window.APP;
      const p = A.ifc2three(cam[0], cam[1], cam[2]);
      const l = A.ifc2three(look[0], look[1], look[2]);
      A.camera.position.set(p.x, p.y, p.z);
      A.camera.lookAt(l.x, l.y, l.z);
      A.camera.updateMatrixWorld(true);
      if (A.controls) { A.controls.target.set(l.x, l.y, l.z); A.controls.update(); }
    }, c.camIfc, c.lookIfc);
    await new Promise(r => setTimeout(r, 1500));
  }

  // Three Alt+P presses — additive, so this samples more placements than a single press.
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => window.APP.togglePopulate());
    await new Promise(r => setTimeout(r, 2500));
  }

  // Pull the FINAL placed positions + the real furniture table straight from the running page.
  const data = await page.evaluate(() => {
    const A = window.APP;
    const rows = (A._getStaffageInstances && A._getStaffageInstances()) || [];
    const furn = A.dbQuery(
      "SELECT em.element_name, et.center_x, et.center_y, et.bbox_x, et.bbox_y " +
      "FROM element_transforms et JOIN elements_meta em ON et.guid=em.guid " +
      "WHERE em.ifc_class IN ('IfcFurniture','IfcFurnishingElement') AND et.center_x IS NOT NULL") || [];
    return { rows, furn };
  });

  // rows: [kind, file, ifcX, ifcY, ifcZ, rotY]
  const sit = data.rows.filter(r => /sitting/i.test(r[1] || ''));
  const seats = data.furn.filter(f => isSeat(f[0], f[3], f[4]));
  const nonSeats = data.furn.filter(f => !isSeat(f[0], f[3], f[4]));

  let bad = 0;
  const badDetail = [];
  for (const s of sit) {
    const x = s[2], y = s[3];
    const hit = nonSeats.find(b => Math.abs(x - b[1]) <= (b[3] || 0) / 2 && Math.abs(y - b[2]) <= (b[4] || 0) / 2);
    if (!hit) continue;
    const nearSeat = seats.some(q => Math.hypot(x - q[1], y - q[2]) <= 0.4);
    if (!nearSeat) { bad++; badDetail.push(`(${x.toFixed(2)},${y.toFixed(2)}) inside "${String(hit[0]).split(':')[0]}"`); }
  }

  const errs = logs.filter(l => l.startsWith('PAGEERROR'));
  const seatClass = logs.filter(l => l.includes('§STAFFAGE_SEAT_CLASS'));
  const interior = logs.filter(l => l.includes('§PHOTO_STAFFAGE_INTERIOR'));

  console.log(`\n--- ${c.bld} / ${label} ---`);
  console.log(`  furniture=${data.furn.length} seats=${seats.length} nonSeats=${nonSeats.length}`);
  console.log(`  placedSitFigures=${sit.length}   badSit(inside a non-seat bbox, no seat within 0.4m)=${bad}`);
  badDetail.slice(0, 6).forEach(d => console.log(`    BAD ${d}`));
  seatClass.slice(0, 3).forEach(l => console.log(`  [page] ${l}`));
  interior.slice(0, 3).forEach(l => console.log(`  [page] ${l}`));
  if (errs.length) errs.slice(0, 5).forEach(e => console.log(`  ${e}`));
  else console.log('  pageerrors=0');

  await browser.close();
  return { bld: c.bld, label, sit: sit.length, bad, errs: errs.length };
}

(async () => {
  const results = [];
  for (const c of CASES) {
    results.push(await run(BEFORE, 'BEFORE (origin/main)', c));
    results.push(await run(AFTER, 'AFTER  (fix)', c));
  }

  console.log('\n================ VERDICT ================');
  let pass = true, sawBug = false;
  for (const c of CASES) {
    const b = results.find(r => r.bld === c.bld && r.label.startsWith('BEFORE'));
    const a = results.find(r => r.bld === c.bld && r.label.startsWith('AFTER'));
    console.log(`${c.bld.padEnd(10)} BEFORE sit=${b.sit} bad=${b.bad}   |   AFTER sit=${a.sit} bad=${a.bad}`);
    if (b.bad > 0) sawBug = true;
    if (a.bad !== 0) pass = false;
    if (a.errs > 0) pass = false;
  }
  if (!sawBug) {
    console.log('INCONCLUSIVE — no building reproduced badSit>0 before the fix; this test proved nothing.');
    process.exit(2);
  }
  console.log(pass ? 'PASS — bug reproduced before, zero after, no page errors.' : 'FAIL');
  process.exit(pass ? 0 : 1);
})();
