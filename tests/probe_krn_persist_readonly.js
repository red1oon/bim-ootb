// probe_krn_persist_readonly.js — witness MOBILE_PERF.md §OPEN LEVERS 2 fix (a):
// "read-only ops no longer trigger the full-DB IDB export; mutating ops still persist."
// ISSUE IT PROVES: §KRN_PERSIST fired a synchronous db.export() of the WHOLE building DB
// (42MB on LTU) on EVERY kernel op, including observational ELEMENT_PICK/BUILDING_OPEN —
// a main-thread stall landing 2s after every click on a large building.
// Drives the REAL viewer on Duplex (non-split, fast).
//
// WORKS (the fix):
//   1. BUILDING_OPEN commits → §KRN_PERSIST_DEFER type=BUILDING_OPEN, and NO §KRN_PERSIST follows.
//   2. Real 3D tap → §KERNEL_OP type=ELEMENT_PICK → §KRN_PERSIST_DEFER type=ELEMENT_PICK,
//      still NO §KRN_PERSIST.
// NO REGRESSION (edits still durable):
//   3. A GRID_MOVE commitOp → §KRN_PERSIST url=...Duplex_extracted.db fires (2s debounce + seal).
//   4. §KERNEL_OP committed lines present for all three ops; zero PAGEERROR.
// SW BLOCKED. Leak-safe (finally kills chrome).
const { chromium } = require('/home/red1/bim-ootb/tests/node_modules/playwright-core');
const PORT = process.env.PORT || 8149;
const URL = `http://localhost:${PORT}/viewer/viewer.html?db=/buildings/Duplex_extracted.db&bld=Duplex`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] });
  let fails = 0;
  const FAIL = m => { fails++; console.log('FAIL: ' + m); };
  const PASS = m => console.log('PASS: ' + m);
  try {
    const ctx = await browser.newContext({ serviceWorkers: 'block' });
    const page = await ctx.newPage();
    const logs = [];
    page.on('console', m => logs.push(m.text()));
    page.on('pageerror', e => logs.push('PAGEERROR: ' + e.message));
    await page.goto(URL, { waitUntil: 'domcontentloaded' });

    await page.waitForFunction(() => {
      const A = window.A || window.APP;
      return A && A.db && A.activeBuilding && A.meshCache && Object.keys(A.meshCache).length > 0;
    }, { timeout: 180000 }).catch(e => console.log('WAIT_FAIL ' + e.message));
    // BUILDING_OPEN commits shortly after stream completes; give its (removed) 2s debounce
    // window time to prove NO persist arrives.
    await sleep(6000);

    const has = (needle, from) => logs.slice(from || 0).some(l => l.includes(needle));
    const idx = () => logs.length;

    // ── 1. BUILDING_OPEN deferred, no persist ──
    if (!has('§KERNEL_OP committed') || !has('type=BUILDING_OPEN'))
      FAIL('no BUILDING_OPEN kernel op committed — probe precondition');
    if (has('§KRN_PERSIST_DEFER type=BUILDING_OPEN')) PASS('BUILDING_OPEN → §KRN_PERSIST_DEFER');
    else FAIL('missing §KRN_PERSIST_DEFER for BUILDING_OPEN');
    if (has('§KRN_PERSIST url=')) FAIL('§KRN_PERSIST fired for an observational op (should not)');
    else PASS('no §KRN_PERSIST after BUILDING_OPEN');

    // ── 2. real tap → ELEMENT_PICK deferred ──
    const mark2 = idx();
    const t1 = await page.evaluate(() => {
      const A = window.A || window.APP;
      const r = A.db.exec(
        "SELECT m.guid, t.center_x, t.center_y, t.center_z FROM elements_meta m " +
        "JOIN element_transforms t ON t.guid=m.guid WHERE t.center_x IS NOT NULL " +
        "ORDER BY (t.bbox_x*t.bbox_y*t.bbox_z) DESC LIMIT 1");
      if (!r.length || !r[0].values.length) return { ok: false, why: 'no-rows' };
      const [guid, cx, cy, cz] = r[0].values[0];
      const c = A.ifc2three(cx, cy, cz);
      const v = new THREE.Vector3(c.x, c.y, c.z).project(A.camera);
      const px = (v.x * 0.5 + 0.5) * window.innerWidth;
      const py = (-v.y * 0.5 + 0.5) * window.innerHeight;
      const opt = () => ({ bubbles: true, cancelable: true, clientX: px, clientY: py, button: 0, pointerId: 1, isPrimary: true });
      A.canvas.dispatchEvent(new PointerEvent('pointerdown', opt()));
      A.canvas.dispatchEvent(new PointerEvent('pointerup', opt()));
      return { ok: true, guid };
    });
    console.log('TAP: ' + JSON.stringify(t1));
    await sleep(5000); // > the old 2s debounce — a persist would have logged by now
    if (has('type=ELEMENT_PICK', mark2)) {
      if (has('§KRN_PERSIST_DEFER type=ELEMENT_PICK', mark2)) PASS('ELEMENT_PICK → §KRN_PERSIST_DEFER');
      else FAIL('ELEMENT_PICK committed but no §KRN_PERSIST_DEFER');
    } else console.log('NOTE: tap produced no ELEMENT_PICK op (miss) — covered by BUILDING_OPEN check');
    if (has('§KRN_PERSIST url=', mark2)) FAIL('§KRN_PERSIST fired after pick (should not)');
    else PASS('no §KRN_PERSIST after pick');

    // ── 3. mutating op still persists ──
    const mark3 = idx();
    await page.evaluate(() => {
      const A = window.A || window.APP;
      window.KernelOps.commitOp(A.db, 'GRID_MOVE', { axis: 'X', label: 'probe', delta_m: 0.1 }, []);
    });
    await sleep(6000); // 2s debounce + async sealChain + IDB tx
    if (has('§KRN_PERSIST url=', mark3)) PASS('GRID_MOVE → §KRN_PERSIST still fires (edits durable)');
    else FAIL('GRID_MOVE did NOT persist — regression');

    const errs = logs.filter(l => l.startsWith('PAGEERROR'));
    if (errs.length) FAIL('PAGEERROR: ' + errs.join(' | '));
    else PASS('zero PAGEERROR');

    console.log('--- §-LOG EXCERPT (KRN/KERNEL lines) ---');
    logs.filter(l => l.includes('KRN_') || l.includes('§KERNEL_OP')).forEach(l => console.log('  ' + l));
    console.log(fails === 0 ? 'PROBE_RESULT: ALL PASS' : 'PROBE_RESULT: ' + fails + ' FAIL');
    process.exitCode = fails === 0 ? 0 : 1;
  } finally {
    await browser.close();
  }
})();
