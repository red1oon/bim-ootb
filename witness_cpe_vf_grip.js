// WITNESS — §CPE_VF_GRIP. The POV inset's border does not "grip" the picture it frames.
// Spec: bim-compiler prompts/CINEMA_PATH_EDITOR.md §CPE_VF_GRIP.
//
// USER REPORT (2026-08-06, verbatim): "The pov original frame size has always been wrong. Now it
// tries to redraw its borders rather flimsy and not aware of the bit larger inset screen. I think
// this has to be look at holistically why it is not gripping." — explicitly NOT the subject-too-
// small/composition issue (user: "Subject playing screen is bit larger that is fine").
//
// WHAT THIS PROVES OR DISPROVES — the mismatch is plain rect arithmetic, NOT the deferred
// full-canvas post-processing issue (§CPE_VF_PLAIN_FRAME's recorded root cause, which needs B to own
// a WebGLRenderer). `_vfComputeRect` derives the scissor rect from `panel.getBoundingClientRect()`,
// which is the OUTER BORDER BOX. Three consequences, each its own gate:
//
//   G-GRIP-BLEED   the scissor rect must lie INSIDE the panel's visible picture box, not spill under
//                  the 1px border on every side. Pre-fix the render reaches the outer edge, so the
//                  border paints ON TOP of the outermost ring of the picture instead of around it —
//                  the frame sits in the image rather than holding it. This is the "not gripping".
//   G-GRIP-TITLE   the 22px opaque #cpe-vf-title header is absolutely positioned INSIDE the same
//                  rect the camera renders into, so the top band of the framed image is painted over
//                  and never seen. The picture the user composes is not the picture they get.
//   G-GRIP-ASPECT  vfCam.aspect must equal the aspect of the VISIBLE picture box. Pre-fix the camera
//                  is set to the outer-box aspect (300/190=1.579) while the visible area is
//                  298x165 (1.806) — the framing is computed for a box 25px taller than exists, so
//                  the composed centre sits above the centre the user actually sees.
//   G-GRIP-CORNER  the scissor rect has square corners; the frame is border-radius:12px. Unless the
//                  rect is inset by at least r*(1-1/sqrt2) the square picture pokes out through the
//                  four rounded corners — the other half of "flimsy".
//
// EVIDENCE DISCIPLINE: every gate is a measured number (getBoundingClientRect / getComputedStyle /
// the REAL _vfComputeRect via _vfRectForTest), never a screenshot — CLAUDE.md FUNDAMENTAL LAW.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');

const PORT = process.env.PORT || 8460;
const BUILDINGS = (process.env.BLDS || 'Duplex').split(',');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const TOL = 0.51;   // sub-pixel slack: the rect is integer device-px, the boxes are fractional CSS px

async function openEditor(browser, BLD) {
  const page = await browser.newPage();
  // The viewer registers a service worker that precaches viewer/*.js. On a local witness run it
  // happily serves a PREVIOUS run's cinema_path_editor.js, so a brand-new witness hook reads as
  // "is not a function" against a tree that plainly defines it (hit live writing this witness:
  // _vfRectForTest existed in the file, absent in the page). Bypass at the network layer rather
  // than unregistering — no page state is mutated, and every run reads the tree on disk.
  const cdp = await page.createCDPSession();
  await cdp.send('Network.enable');
  await cdp.send('Network.setBypassServiceWorker', { bypass: true });
  await page.setViewport({ width: 1200, height: 700 });
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

// Everything the four gates need, measured in ONE page evaluation so no gate can read a different
// frame's geometry than another.
async function measure(page) {
  return page.evaluate(() => {
    const A = window.APP, cpe = A.cinemaPathEditor;
    const panel = document.getElementById('cpe-vf-panel');
    const title = document.getElementById('cpe-vf-title');
    if (!panel) return { err: 'no #cpe-vf-panel' };
    const pr = (A.renderer.getPixelRatio && A.renderer.getPixelRatio()) || 1;
    const canvasR = A.canvas.getBoundingClientRect();
    const panelR = panel.getBoundingClientRect();
    const titleR = title ? title.getBoundingClientRect() : null;
    const cs = getComputedStyle(panel);
    const rect = cpe._vfRectForTest();          // the REAL scissor rect, device px, bottom-left origin
    const bw = {
      l: parseFloat(cs.borderLeftWidth) || 0, r: parseFloat(cs.borderRightWidth) || 0,
      t: parseFloat(cs.borderTopWidth) || 0, b: parseFloat(cs.borderBottomWidth) || 0
    };
    // The scissor rect back in CSS px, page coordinates — the same space the DOM boxes live in.
    const render = {
      left: canvasR.left + rect.x / pr,
      top: canvasR.top + (rect.canvasH - rect.y - rect.h) / pr,
      width: rect.w / pr,
      height: rect.h / pr
    };
    render.right = render.left + render.width;
    render.bottom = render.top + render.height;
    // The box the user can actually SEE the picture in: inside the border, below the header.
    const visible = {
      left: panelR.left + bw.l,
      right: panelR.right - bw.r,
      top: titleR ? titleR.bottom : panelR.top + bw.t,
      bottom: panelR.bottom - bw.b
    };
    visible.width = visible.right - visible.left;
    visible.height = visible.bottom - visible.top;
    return {
      pr, panelR: { left: panelR.left, top: panelR.top, width: panelR.width, height: panelR.height },
      titleH: titleR ? titleR.height : 0, bw, radius: parseFloat(cs.borderTopLeftRadius) || 0,
      rect, render, visible,
      vfCamAspect: cpe._probeVF().vfCamAspect
    };
  });
}

async function gates(browser, BLD) {
  const checks = [];
  const P = (n, ok, d) => checks.push({ n, ok, d });
  const { page } = await openEditor(browser, BLD);

  // B's panel only exists while the eye is on (§CPE_SCRUB_EYE_GATED) — turn it on before measuring.
  const vfOn = await page.evaluate(() => window.APP.cinemaPathEditor._vfToggle());
  await sleep(600);
  const m = await measure(page);
  if (m.err) {
    P('G-GRIP-MEASURABLE B\'s panel and scissor rect are readable', false, `vfOn=${vfOn} err=${m.err}`);
    await page.close();
    return checks;
  }
  const f = n => n.toFixed(2);

  // ── G-GRIP-BLEED — the picture must sit inside the frame, not under it.
  const over = {
    l: m.visible.left - m.render.left,        // >0 = render spills left of the visible box
    r: m.render.right - m.visible.right,
    t: m.visible.top - m.render.top,
    b: m.render.bottom - m.visible.bottom
  };
  const worst = Math.max(over.l, over.r, over.t, over.b);
  P('G-GRIP-BLEED the scissor rect lies INSIDE the visible picture box — the border frames the picture, it does not paint over it',
    worst <= TOL,
    `overflow px  left=${f(over.l)} right=${f(over.r)} top=${f(over.t)} bottom=${f(over.b)}  worst=${f(worst)} (tol ${TOL}) | ` +
    `render ${f(m.render.left)},${f(m.render.top)} ${f(m.render.width)}x${f(m.render.height)} vs ` +
    `visible ${f(m.visible.left)},${f(m.visible.top)} ${f(m.visible.width)}x${f(m.visible.height)} | ` +
    `panel ${f(m.panelR.width)}x${f(m.panelR.height)} border ${m.bw.t}px pr=${m.pr}`);

  // ── G-GRIP-TITLE — nothing the camera frames may be hidden behind the header.
  const hidden = Math.max(0, m.visible.top - m.render.top);
  P('G-GRIP-TITLE no part of the framed image is painted over by the opaque #cpe-vf-title header',
    hidden <= TOL,
    `hiddenPx=${f(hidden)} of ${f(m.render.height)} (${f(100 * hidden / m.render.height)}% of the frame) | ` +
    `titleH=${f(m.titleH)} renderTop=${f(m.render.top)} visibleTop=${f(m.visible.top)}`);

  // ── G-GRIP-ASPECT — the camera must be composing for the box that is actually seen.
  const visAspect = m.visible.width / m.visible.height;
  const err = Math.abs(m.vfCamAspect - visAspect) / visAspect;
  P('G-GRIP-ASPECT vfCam.aspect matches the VISIBLE picture box\'s aspect, not the outer border box\'s',
    err <= 0.005,
    `vfCam.aspect=${m.vfCamAspect.toFixed(4)} visibleAspect=${visAspect.toFixed(4)} err=${(err * 100).toFixed(2)}% (tol 0.5%) | ` +
    `outerAspect=${(m.panelR.width / m.panelR.height).toFixed(4)} rectAspect=${(m.rect.w / m.rect.h).toFixed(4)}`);

  // ── G-GRIP-CORNER — a square picture inside a rounded frame pokes out unless it is inset enough.
  const needInset = m.radius * (1 - 1 / Math.SQRT2);
  const gotInset = Math.min(over.l < 0 ? -over.l : 0, over.t < 0 ? -over.t : 0,
                            over.r < 0 ? -over.r : 0, over.b < 0 ? -over.b : 0);
  P('G-GRIP-CORNER the square scissor rect is inset enough not to poke through the rounded corners',
    gotInset + TOL >= needInset,
    `radius=${f(m.radius)}px needInset=${f(needInset)}px gotInset=${f(gotInset)}px ` +
    `(max radial poke pre-fix = ${f(Math.max(0, needInset - gotInset))}px per corner)`);

  await page.close();
  return checks;
}

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    protocolTimeout: 900000,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  let allPass = true;
  const summary = [];
  for (const BLD of BUILDINGS) {
    console.log(`\n${'='.repeat(78)}\n${BLD}\n${'='.repeat(78)}`);
    const checks = await gates(browser, BLD);
    checks.forEach(c => { if (!c.ok) allPass = false; console.log(`  ${c.ok ? 'PASS' : 'FAIL'}  ${c.n}\n          ${c.d}`); });
    summary.push({ BLD, pass: checks.every(c => c.ok), n: checks.filter(c => c.ok).length, t: checks.length });
  }
  await browser.close();
  console.log(`\n${'='.repeat(78)}`);
  summary.forEach(s => console.log(`${s.pass ? 'PASS' : 'FAIL'}  ${s.BLD}  (${s.n}/${s.t})`));
  console.log(allPass ? '\nWITNESS PASS' : '\nWITNESS FAIL');
  process.exit(allPass ? 0 : 1);
})();
