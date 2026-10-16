// WITNESS — §CPE_GRAB_WYSIWYG: after a real preview, a click ON the drawn handle still grabs it.
// Spec: bim-compiler prompts/CINEMA_PATH_EDITOR.md §CPE_STICK_ANCHOR ("what you grab is what you
// see") — dispatched 2026-08-06 as "stick drag dead after preview, click falls through to the
// model picker".
//
// THE DEFECT (user, big building, 2026-08-06): before a preview, a canvas click on a band handle
// logs `§CPE_DRAG_SCALE grab band=0 zone=mid`; after `§CPE_PREVIEW done ... buildup=1` the SAME
// gesture on the SAME handle logs `§PICK hits=71 ...` + `§BATCHED_PICK ...` + `§FOCUS_ELEM` — the
// viewer's model picker consumed it, no §CPE line at all. Root cause measured, not guessed:
// `_hitTest`'s tolerance was a FIXED `GRAB_PX` (18px) around the handle CENTRE while the drawn
// sphere is HANDLE_R x drawScale METRES — at the user's real editing range (their own §PICK
// d=11.89 proves ~12m; 57.7 px/m there) a HELD handle renders 21px of radius, 37px at the
// selection pulse's 1.8x peak, so MOST of the visible blob was a dead zone. The first drag of a
// session grabs an UNHELD 15.6px blob (fits inside 18px) and leaves the band HELD+pulsing; the
// next grab — after the rehearsal, in the user's edit→preview→edit loop — aims at blob pixels
// that were never grabbable and falls through to the picker.
//
//   G-SAP-0  (sanity, both worlds) centre-click on the unheld handle grabs — proves the wiring
//            and this harness, and puts the band in the HELD state the defect needs.
//   G-SAP-1  (THE gate) after a REAL preview (`#cpe-preview` click → §CPE_PREVIEW done), a tap
//            landing ON the drawn held blob but outside the legacy 18px zone produces
//            `§CPE_DRAG_SCALE grab`. FAILS on unfixed main (no §CPE line), PASSES with
//            §CPE_GRAB_WYSIWYG.
//   G-SAP-2  the same tap must be CLAIMED from the picker: `§PICK_GUARD blocked` must appear for
//            it (CPE stopPropagation'd the pointerdown, so picking.js never saw it) and no
//            `§PICK hits=` may fire in that window. FAILS on unfixed main — this is literally the
//            user's console shape.
//   G-SAP-3  far-pose behaviour unchanged: at the handle's projected radius << 18px, the grab
//            tolerance the fix computes stays exactly GRAB_PX (asserted via the same maths on the
//            live camera state), so nothing loosens for normal outside-the-building editing.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');

const PORT = process.env.PORT || 8491;
const BLD = process.env.BLD || 'Duplex';
const GRAB_PX = 18, HELD_SCALE = 1.2, PULSE_MAX = 1.8, HANDLE_R = 0.30;
const CAM_DIST = 12;   // the user's own close-in editing range (§PICK d=11.89 in their log)
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  const checks = [];
  let allPass = true;
  const P = (n, ok, d) => { checks.push({ n, ok, d }); if (!ok) allPass = false; };

  const page = await browser.newPage();
  // Service-worker landmine: without the bypass this witness can run a PREVIOUS build's JS.
  const cdp = await page.createCDPSession();
  await cdp.send('Network.enable');
  await cdp.send('Network.setBypassServiceWorker', { bypass: true });
  await page.setViewport({ width: 1280, height: 800 });
  const logs = [];
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => logs.push('PAGEERROR ' + e.message));
  await page.goto(`http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db`,
    { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.APP && window.APP.cinemaPathEditor && window.APP.startMaxQualityOrbit
    && window.APP._composer, { timeout: 120000 });
  await sleep(9000);
  await page.waitForFunction(() => {
    try { const r = window.APP.dbQuery('SELECT COUNT(*) FROM element_transforms'); return r && r[0][0] > 0; }
    catch (e) { return false; }
  }, { timeout: 60000, polling: 2000 });

  await page.evaluate(() => { window.APP.startMaxQualityOrbit({ preview: false, fps: 1 }); });
  await page.waitForSelector('#cpe-rows', { timeout: 120000 });
  await sleep(800);

  // ── G-SAP-3 first, from the UNTOUCHED far open pose: the projected blob is tiny, the effective
  //    zone must still be exactly GRAB_PX (the floor). Same formula the fix uses, on live state.
  const far = await page.evaluate((HANDLE_R) => {
    const A = window.APP, hs = A.cinemaPathEditor._probeHandles();
    const m = hs.find(h => h.b === 0 && h.z === 'mid');
    const D = Math.hypot(m.x - A.camera.position.x, m.y - A.camera.position.y, m.z3 - A.camera.position.z);
    const r = A.canvas.getBoundingClientRect();
    const pxPerM = r.height / (2 * D * Math.tan(A.camera.fov * Math.PI / 360));
    return { D, blobPx: HANDLE_R * 0.9 * pxPerM };
  }, HANDLE_R);
  P('G-SAP-3 far pose: projected blob << 18px, so the zone stays the GRAB_PX floor (nothing loosens)',
    far.blobPx < GRAB_PX,
    `open pose D=${far.D.toFixed(1)}m, unheld blob radius ${far.blobPx.toFixed(1)}px vs GRAB_PX=${GRAB_PX} ` +
    `-> max(GRAB_PX, blob) == GRAB_PX`);

  // ── Move the camera to the user's real editing range: 12m from band 0's mid handle.
  await page.evaluate((CAM_DIST) => {
    const A = window.APP, hs = A.cinemaPathEditor._probeHandles();
    const m = hs.find(h => h.b === 0 && h.z === 'mid');
    const p = new THREE.Vector3(m.x, m.y, m.z3);
    const dir = new THREE.Vector3().subVectors(A.camera.position, p).normalize();
    A.camera.position.copy(p.clone().add(dir.multiplyScalar(CAM_DIST)));
    A.controls.target.copy(p);
    A.controls.update();
    if (A.markDirty) A.markDirty();
  }, CAM_DIST);
  await sleep(600);

  const probe = () => page.evaluate(() => {
    const A = window.APP, hs = A.cinemaPathEditor._probeHandles();
    const m = hs.find(h => h.b === 0 && h.z === 'mid');
    const D = Math.hypot(m.x - A.camera.position.x, m.y - A.camera.position.y, m.z3 - A.camera.position.z);
    const r = A.canvas.getBoundingClientRect();
    return { px: m.px, py: m.py, D, pxPerM: r.height / (2 * D * Math.tan(A.camera.fov * Math.PI / 360)) };
  });

  // A TAP (2px of travel — under picking.js's own 5px tap-vs-drag test, so an unclaimed tap PICKS,
  // exactly the user's gesture), through the browser's real input pipeline.
  async function tap(x, y) {
    const n0 = logs.length;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 2, y + 1);
    await page.mouse.up();
    await sleep(400);
    return logs.slice(n0);
  }

  // ── G-SAP-0: centre tap on the UNHELD handle — grabs, and leaves band 0 HELD (pulse on).
  let m = await probe();
  let seg = await tap(m.px, m.py);
  P('G-SAP-0 sanity: centre tap on the unheld handle grabs (and holds band 0)',
    seg.some(l => /§CPE_DRAG_SCALE grab band=0/.test(l)),
    `tap at centre (${m.px},${m.py}) D=${m.D.toFixed(1)}m -> ` +
    (seg.find(l => /§CPE_DRAG_SCALE grab/.test(l)) || 'NO GRAB LINE').slice(0, 90));

  // ── The REAL preview, via the real button, to §CPE_PREVIEW done.
  const nPrev = logs.length;
  await page.evaluate(() => document.getElementById('cpe-preview').click());
  const t0 = Date.now();
  while (Date.now() - t0 < 90000) {
    if (logs.slice(nPrev).some(l => /§CPE_PREVIEW done/.test(l))) break;
    await sleep(500);
  }
  const prevDone = logs.slice(nPrev).find(l => /§CPE_PREVIEW done/.test(l));
  P('PRECOND a real preview ran to completion', !!prevDone, prevDone || 'NO §CPE_PREVIEW done within 90s');
  await sleep(800);

  // ── G-SAP-1/2: tap ON the drawn held blob, outside the legacy 18px zone.
  m = await probe();
  const heldBlobPx = HANDLE_R * HELD_SCALE * PULSE_MAX * m.pxPerM;   // the breathing blob's outer envelope
  const offset = Math.round(Math.min(heldBlobPx - 4, GRAB_PX + 10)); // on the blob, past the old zone
  P('PRECOND the drawn held blob extends past the legacy zone (the gesture is ON the visible sphere)',
    heldBlobPx > offset && offset > GRAB_PX,
    `held blob radius ${heldBlobPx.toFixed(1)}px (pulse peak) at D=${m.D.toFixed(1)}m ` +
    `(${m.pxPerM.toFixed(1)} px/m), tap offset ${offset}px, legacy GRAB_PX=${GRAB_PX}`);

  seg = await tap(m.px + offset, m.py);
  const grabbed = seg.some(l => /§CPE_DRAG_SCALE grab band=0/.test(l));
  const picked = seg.some(l => /§PICK hits=|§BATCHED_PICK/.test(l));
  const guarded = seg.some(l => /§PICK_GUARD blocked/.test(l));
  P('G-SAP-1 after the preview, a tap ON the drawn handle still grabs it',
    grabbed,
    `tap at (${m.px + offset},${m.py}) — ${offset}px off-centre, on the blob -> ` +
    (seg.find(l => /§CPE_DRAG_SCALE grab/.test(l)) || 'NO GRAB LINE — gesture fell through').slice(0, 90));
  P('G-SAP-2 that tap is CLAIMED from the model picker (guard blocked, no §PICK)',
    guarded && !picked,
    `§PICK_GUARD blocked=${guarded} §PICK/§BATCHED_PICK fired=${picked}` +
    (picked ? ' — the picker consumed the gesture, the user\'s exact console shape' : ''));

  await browser.close();
  console.log(`\n${'='.repeat(78)}`);
  checks.forEach(c => console.log(`  ${c.ok ? 'PASS' : 'FAIL'}  ${c.n}\n          ${c.d}`));
  console.log(`${checks.filter(c => c.ok).length}/${checks.length} gates`);
  console.log(allPass ? '\nWITNESS PASS' : '\nWITNESS FAIL');
  process.exit(allPass ? 0 : 1);
})();
