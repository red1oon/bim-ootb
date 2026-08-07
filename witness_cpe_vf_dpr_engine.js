// WITNESS — §CPE_VF_DPR_DOUBLE. The pixel ratio is applied EXACTLY ONCE, proven against the ENGINE.
// Spec: bim-compiler prompts/CINEMA_PATH_EDITOR.md §CPE_VF_DPR_DOUBLE.
//
// THE DEFECT (one bug, two symptoms): three.js's setViewport/setScissor take CSS px and multiply by
// the renderer's pixelRatio THEMSELVES. `_vfComputeRect` multiplied by pr as well, so the ratio
// landed TWICE: (1) B's picture rendered 1.25x oversized, spilling right+up past its own drawn frame
// ("screen slightly larger then the frame"); (2) `_vfRender`'s RESTORE left the renderer's viewport
// at css*pr, applied as css*pr^2 on every subsequent main render while the eye was ON — the whole
// scene drawn displaced from where `_hitTest` computes the handles, so taps on the DRAWN stick
// missed ("the grip stick only returns when the pov eye is switched OFF").
//
// WHY EVERY PRIOR WITNESS STAYED GREEN: they compared the computed rect against the CSS box through
// the same *pr arithmetic the bug lived in — self-referential. Rule this witness enforces: gate a
// viewport/scissor rect against what the ENGINE reports (raw gl.viewport calls,
// gl.getParameter(gl.VIEWPORT)), never against your own derivation of it.
//
//   G-DPR-RESTORE   engine truth: with the eye ON, after a rendered frame, gl.getParameter(VIEWPORT)
//                   equals the PRISTINE baseline read before the eye ever turned on. (Not "equals
//                   the drawing buffer": three.js itself ROUNDS the viewport (css*ratio) while it
//                   FLOORS the buffer size, so a pristine 1483-css canvas at 1.25 is buffer 1853 /
//                   viewport 1854 — a 1px engine-native overshoot. The gate is restore == pristine;
//                   pre-fix it is baseline*1.25, grows right+up.)
//   G-DPR-B-ONCE    engine truth: a raw gl.viewport call for B's render has width = picture-box CSS
//                   width * dpr (ratio once). No call has width = css * dpr^2 (ratio twice).
//                   Only meaningful at dpr != 1 — at 1.0 the two coincide, which is how this
//                   survived every dpr=1 witness run.
//   G-DPR-GRAB-ON   WYSIWYG: with the eye ON, a real tap at the handle's DRAWN position — computed
//                   by mapping the handle's NDC through the viewport the engine ACTUALLY has, not
//                   through _screenOf's assumption — logs §CPE_DRAG_SCALE grab. Pre-fix the drawn
//                   and hit positions differ by ~hundreds of px, so the tap misses: the literal
//                   user report, gated.
//   G-DPR-GRAB-OFF  same tap with the eye OFF, after a window resize event (the universal viewport
//                   reset: scene.js's resize handler re-runs renderer.setSize; the user's own
//                   recovery was the §CPE_VF_DPR_GUARD ratio-drop, which only arms on buildings
//                   streaming >5000 elements) must grab on BOTH builds. The user's decisive clue —
//                   "the grip stick only returns when the pov eye is switched OFF" — reproduced.
//
// EXPECT=prefix inverts G-DPR-RESTORE / G-DPR-B-ONCE / G-DPR-GRAB-ON: run against the PRE-FIX tree
// they must FAIL (pass = "the defect is visible to this witness"), while G-DPR-GRAB-OFF still
// passes. If the eye-ON gates PASS on the pre-fix tree, the witness is blind and the theory wrong.
//
// EVIDENCE DISCIPLINE: every gate is a number read from gl or a console log emitted by the editor's
// own grab path — no screenshots (CLAUDE.md FUNDAMENTAL LAW).
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');

const PORT = process.env.PORT || 8470;
const BLD = process.env.BLD || 'Duplex';
const EXPECT = process.env.EXPECT || 'postfix';   // 'prefix' = eye-ON gates must FAIL
const DPR = +(process.env.DPR || 1.25);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function openEditor(browser) {
  const page = await browser.newPage();
  const cdp = await page.createCDPSession();
  await cdp.send('Network.enable');
  await cdp.send('Network.setBypassServiceWorker', { bypass: true });
  // The user's own live geometry: canvas 1483x769 at devicePixelRatio 1.25 (their log: 1853x961 bake).
  await page.setViewport({
    width: +(process.env.VW || 1483), height: +(process.env.VH || 769), deviceScaleFactor: DPR
  });
  const logs = [];
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => logs.push('PAGEERROR ' + e.message));
  await page.goto(`http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db`,
    { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(
    () => window.APP && window.APP.cinemaPathEditor && window.APP.startMaxQualityOrbit && window.APP._composer,
    { timeout: 120000 });
  await sleep(9000);
  await page.waitForFunction(() => {
    try { const r = window.APP.dbQuery('SELECT COUNT(*) FROM element_transforms'); return r && r[0][0] > 0; }
    catch (e) { return false; }
  }, { timeout: 60000, polling: 2000 });
  await page.evaluate(() => { window.APP.startMaxQualityOrbit({ preview: false, fps: 1, editor: true }); });
  await page.waitForSelector('#cpe-ok', { timeout: 300000 });
  await sleep(800);
  return { page, logs };
}

// The handle's DRAWN screen position: band-0's centre (the panel's own inputs) projected through the
// camera, then through the viewport rect the ENGINE actually holds — NOT through _screenOf, whose
// canvas-rect assumption is exactly what the stale viewport violates pre-fix.
const drawnPos = page => page.evaluate(() => {
  const A = window.APP, gl = A.renderer.getContext();
  const row = document.querySelectorAll('#cpe-rows > div')[0].querySelectorAll('input');
  const p = new THREE.Vector3(parseFloat(row[0].value), parseFloat(row[2].value), parseFloat(row[1].value));
  const v = p.clone().project(A.camera);
  const r = A.canvas.getBoundingClientRect();
  const vp = Array.from(gl.getParameter(gl.VIEWPORT));
  const dpr = window.devicePixelRatio;
  const dx = vp[0] + (v.x + 1) / 2 * vp[2];       // device px, bottom-left origin
  const dy = vp[1] + (v.y + 1) / 2 * vp[3];
  const x = r.left + dx / dpr;                     // back to CSS, top-left origin
  const y = r.top + r.height - dy / dpr;
  const el = document.elementFromPoint(Math.round(x), Math.round(y));
  const s = { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height }; // _screenOf's belief
  return { x, y, vp, behind: v.z > 1, hitTestAt: s, offBy: Math.hypot(x - s.x, y - s.y),
           under: el ? (el.id || el.tagName) : 'none' };
});

async function tap(page, logs, x, y) {
  logs.length = 0;
  await page.mouse.move(Math.round(x), Math.round(y));
  await page.mouse.down();
  await sleep(150);
  await page.mouse.up();
  await sleep(250);
  return {
    grab: logs.some(l => l.indexOf('§CPE_DRAG_SCALE grab') === 0),
    pick: logs.some(l => l.indexOf('§PICK ') === 0 || l.indexOf('§PICK hits') === 0)
  };
}

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    protocolTimeout: 900000,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  const checks = [];
  const P = (n, ok, d) => checks.push({ n, ok, d });
  const f = v => (typeof v === 'number' ? v.toFixed(2) : String(v));

  const { page, logs } = await openEditor(browser);

  // Record every raw gl.viewport call from here on — the engine's own account of what it was told.
  await page.evaluate(() => {
    const gl = window.APP.renderer.getContext();
    window.__vpCalls = [];
    const ov = gl.viewport.bind(gl);
    gl.viewport = function (x, y, w, h) { window.__vpCalls.push([x, y, w, h]); return ov(x, y, w, h); };
  });

  // Pristine baseline: what the engine holds after a normal render, before the eye ever turns on.
  await page.evaluate(() => { window.APP.markDirty && window.APP.markDirty(); });
  await sleep(400);
  const base = await page.evaluate(() => {
    const gl = window.APP.renderer.getContext();
    return Array.from(gl.getParameter(gl.VIEWPORT));
  });

  // ── eye ON, let frames render
  await page.click('#cpe-vf-toggle');
  await sleep(400);
  await page.evaluate(() => { window.APP.markDirty && window.APP.markDirty(); });
  await sleep(600);

  const st = await page.evaluate(() => {
    const A = window.APP, gl = A.renderer.getContext();
    const panel = document.getElementById('cpe-vf-panel');
    const cs = panel ? getComputedStyle(panel) : null;
    const pw = panel ? panel.getBoundingClientRect().width -
      (parseFloat(cs.borderLeftWidth) || 0) - (parseFloat(cs.borderRightWidth) || 0) : 0;
    return {
      dpr: window.devicePixelRatio, pr: A.renderer.getPixelRatio(),
      dbW: gl.drawingBufferWidth, dbH: gl.drawingBufferHeight,
      vp: Array.from(gl.getParameter(gl.VIEWPORT)),
      calls: window.__vpCalls.slice(), pictureCssW: pw, hook: !!A._cpeViewfinderRender
    };
  });

  // ±1 device px vs baseline: three.js itself FLOORS css*ratio on its render path but ROUNDS it in
  // an immediate setViewport (1483 css * 1.25 = 1853.75 -> 1853 vs 1854, both from the same correct
  // CSS rect). Engine-native rounding noise, categorically different from the defect, which scales
  // the whole rect by ratio (+25% = ~370 px here) — the second clause pins that down separately.
  const restoreOk = st.vp.length === 4 && st.vp.every((v, i) => Math.abs(v - base[i]) <= 1) &&
    st.vp[2] < base[2] * (1 + (st.pr - 1) / 2);
  P('G-DPR-RESTORE gl.getParameter(VIEWPORT) equals the pristine pre-eye baseline after _vfRender restores, eye ON',
    EXPECT === 'prefix' ? !restoreOk : restoreOk,
    `gl.VIEWPORT=[${st.vp}] baseline=[${base}] drawingBuffer=${st.dbW}x${st.dbH} dpr=${st.dpr} pr=${st.pr} ` +
    `hookInstalled=${st.hook} (${EXPECT === 'prefix' ? 'pre-fix build: MUST mismatch — pass means the defect is visible' : 'must match exactly'})`);

  const once = st.calls.some(c => Math.abs(c[2] - st.pictureCssW * st.pr) <= 2);
  const twice = st.calls.some(c => Math.abs(c[2] - st.pictureCssW * st.pr * st.pr) <= 2);
  const bOnceOk = st.pr === 1 ? true : (once && !twice);
  P('G-DPR-B-ONCE a raw gl.viewport call carries picture-box css*dpr (once), none css*dpr^2 (twice)',
    EXPECT === 'prefix' ? !bOnceOk : bOnceOk,
    `pictureCssW=${f(st.pictureCssW)} expectOnce=${f(st.pictureCssW * st.pr)} ` +
    `expectTwice=${f(st.pictureCssW * st.pr * st.pr)} sawOnce=${once} sawTwice=${twice} ` +
    `(${st.calls.length} calls recorded; widths=${JSON.stringify([...new Set(st.calls.map(c => c[2]))])})`);

  // ── G-DPR-GRAB-ON: tap where the handle is DRAWN, eye still ON
  const dOn = await drawnPos(page);
  const rOn = await tap(page, logs, dOn.x, dOn.y);
  P('G-DPR-GRAB-ON tap at the DRAWN handle position grabs (§CPE_DRAG_SCALE), eye ON',
    EXPECT === 'prefix' ? !rOn.grab : rOn.grab,
    `drawn=(${f(dOn.x)},${f(dOn.y)}) hitTestBelieves=(${f(dOn.hitTestAt.x)},${f(dOn.hitTestAt.y)}) ` +
    `offBy=${f(dOn.offBy)}px under=${dOn.under} grab=${rOn.grab} pickFallthrough=${rOn.pick} ` +
    `glVP=[${dOn.vp}] (${EXPECT === 'prefix' ? 'pre-fix: MUST miss — the user tapping what they see' : 'drawn == grabbable, WYSIWYG'})`);

  // ── eye OFF + a window resize event, the universal renderer.setSize viewport reset
  await page.click('#cpe-vf-toggle');
  await sleep(300);
  await page.evaluate(() => {
    window.dispatchEvent(new Event('resize'));
    window.APP.markDirty && window.APP.markDirty();
  });
  await sleep(500);
  const dOff = await drawnPos(page);
  const rOff = await tap(page, logs, dOff.x, dOff.y);
  P('G-DPR-GRAB-OFF same tap with the eye OFF grabs on ANY build — the user\'s decisive clue',
    rOff.grab,
    `drawn=(${f(dOff.x)},${f(dOff.y)}) offBy=${f(dOff.offBy)}px under=${dOff.under} ` +
    `grab=${rOff.grab} glVP=[${dOff.vp}]`);

  await page.close();
  await browser.close();

  let allPass = true;
  console.log(`\n${'='.repeat(78)}\n${BLD}  dpr=${DPR}  EXPECT=${EXPECT}\n${'='.repeat(78)}`);
  checks.forEach(c => { if (!c.ok) allPass = false; console.log(`  ${c.ok ? 'PASS' : 'FAIL'}  ${c.n}\n          ${c.d}`); });
  console.log(allPass ? '\nWITNESS PASS' : '\nWITNESS FAIL');
  process.exit(allPass ? 0 : 1);
})();
