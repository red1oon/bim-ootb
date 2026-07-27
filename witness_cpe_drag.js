// WITNESS — §CPE_DRAG_TELEPORT + §CPE_DRAG_REACH: the band goes where the gesture says, and no further.
// Spec: bim-compiler prompts/CINEMA_PATH_EDITOR.md §CPE_DRAG_TELEPORT.
//
// THE DEFECT (user, Hospital, 2026-07-27: "went off to a spot user didnt put. Draging it back, still
// flew back"). h.move assigned the projected cursor point ABSOLUTELY, so the centre became wherever
// the grab ray met the view plane; any depth error in p0 became permanent and compounded on the next
// drag. `_state.drag.c0` was captured and never read — the delta form was intended and never wired.
//
//   G-DRAG-1 zero-pixel drag => centre unchanged. This is the invariant the absolute form breaks:
//            with `b.c = p`, merely pressing on a handle moves the band.
//   G-DRAG-2 a known pixel delta => the centre moves by the SAME world vector the view plane implies,
//            and by ZERO along the camera's view normal (a translate must not change depth).
//   G-DRAG-3 drag out and back to the same pixel => the centre RETURNS. Literally the user's report,
//            and the gate that would have caught this before they hit it.
//   G-DRAG-4 a huge drag stays exactly 1:1 with the cursor (same m/px as G-DRAG-2, same direction).
//            The §CPE_DRAG_REACH cap this once asserted was REMOVED — it broke G-DRAG-3.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');

const PORT = process.env.PORT || 8402;
const BUILDINGS = (process.env.BLDS || 'Duplex,Terminal').split(',');
const sleep = ms => new Promise(r => setTimeout(r, ms));

// A real pointer drag through the browser's own input pipeline, in steps — the editor only treats it
// as a drag after real movement, so a teleport-to-target would not exercise the same code.
async function drag(page, x0, y0, x1, y1) {
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(x0 + (x1 - x0) * i / 8, y0 + (y1 - y0) * i / 8);
  await page.mouse.up();
  await sleep(150);
}

const bandsOf = page => page.evaluate(() => window.__cpeBands ? window.__cpeBands() : null);

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  let allPass = true;
  const summary = [];

  for (const BLD of BUILDINGS) {
    console.log(`\n${'='.repeat(78)}\n${BLD}\n${'='.repeat(78)}`);
    const checks = [];
    const P = (n, ok, d) => { checks.push({ n, ok, d }); if (!ok) allPass = false; };

    const page = await browser.newPage();
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

    // Block body: a concise arrow would return the bake promise and evaluate() would await the cook.
    await page.evaluate(() => { window.APP.startMaxQualityOrbit({ preview: false, fps: 1 }); });
    await page.waitForSelector('#cpe-rows', { timeout: 120000 });
    await sleep(600);

    // Read band centres straight off the panel inputs — the editor's own state, not a private handle.
    const centres = () => page.evaluate(() => {
      const out = [];
      document.querySelectorAll('#cpe-rows > div').forEach(row => {
        const i = row.querySelectorAll('input');
        out.push({ x: parseFloat(i[0].value), z: parseFloat(i[1].value), y: parseFloat(i[2].value) });
      });
      return out;
    });
    // Where band 0's centre projects on screen, and the camera basis at that instant.
    const proj = await page.evaluate(() => {
      const A = window.APP, c = A.camera;
      const row = document.querySelectorAll('#cpe-rows > div')[0].querySelectorAll('input');
      const p = new THREE.Vector3(parseFloat(row[0].value), parseFloat(row[2].value), parseFloat(row[1].value));
      const v = p.clone().project(c);
      const r = A.canvas.getBoundingClientRect();
      const n = new THREE.Vector3(); c.getWorldDirection(n);
      const right = new THREE.Vector3().crossVectors(n, c.up).normalize();
      const up = new THREE.Vector3().crossVectors(right, n).normalize();
      return {
        sx: r.left + (v.x + 1) / 2 * r.width, sy: r.top + (1 - v.y) / 2 * r.height,
        n: { x: n.x, y: n.y, z: n.z }, right: { x: right.x, y: right.y, z: right.z },
        up: { x: up.x, y: up.y, z: up.z },
        dist: c.position.distanceTo(p), baseLen: null,
      };
    });

    const c0 = await centres();

    // ── G-DRAG-1: press and release with no movement at all.
    await page.mouse.move(Math.round(proj.sx), Math.round(proj.sy));
    await page.mouse.down(); await page.mouse.up();
    await sleep(300);
    const cZero = await centres();
    const moved0 = Math.hypot(cZero[0].x - c0[0].x, cZero[0].y - c0[0].y, cZero[0].z - c0[0].z);
    P('G-DRAG-1 a zero-pixel press leaves the band exactly where it was',
      moved0 < 1e-6,
      `centre moved ${moved0.toExponential(2)}m on a press with no motion ` +
      `(${c0[0].x.toFixed(3)},${c0[0].y.toFixed(3)},${c0[0].z.toFixed(3)} -> ` +
      `${cZero[0].x.toFixed(3)},${cZero[0].y.toFixed(3)},${cZero[0].z.toFixed(3)})`);

    // ── G-DRAG-2: a modest, known pixel delta.
    const DX = 60, DY = 40;
    await drag(page, Math.round(proj.sx), Math.round(proj.sy), Math.round(proj.sx + DX), Math.round(proj.sy + DY));
    const c1 = await centres();
    const mv = { x: c1[0].x - cZero[0].x, y: c1[0].y - cZero[0].y, z: c1[0].z - cZero[0].z };
    const alongN = mv.x * proj.n.x + mv.y * proj.n.y + mv.z * proj.n.z;
    const mag = Math.hypot(mv.x, mv.y, mv.z);
    P('G-DRAG-2 the move is IN the view plane — zero component along the view normal',
      Math.abs(alongN) < 0.02 && mag > 0.01,
      `moved ${mag.toFixed(3)}m for a (${DX},${DY})px drag at ${proj.dist.toFixed(1)}m ` +
      `(~${(mag / Math.hypot(DX, DY)).toFixed(3)} m/px); along view normal = ${alongN.toExponential(2)}m (must be ~0)`);

    // ── G-DRAG-3: out and back to the same pixel.
    await drag(page, Math.round(proj.sx + DX), Math.round(proj.sy + DY), Math.round(proj.sx + DX + 150), Math.round(proj.sy + DY - 90));
    await drag(page, Math.round(proj.sx + DX + 150), Math.round(proj.sy + DY - 90), Math.round(proj.sx + DX), Math.round(proj.sy + DY));
    const c2 = await centres();
    const back = Math.hypot(c2[0].x - c1[0].x, c2[0].y - c1[0].y, c2[0].z - c1[0].z);
    P('G-DRAG-3 drag out and back to the same pixel returns the band to where it was',
      back < 0.05,
      `returned within ${back.toFixed(4)}m — the user's "draging it back, still flew back" case`);

    // ── G-DRAG-4: a HUGE drag stays exactly 1:1 with the cursor — same metres-per-pixel as the
    // modest drag G-DRAG-2 measured, and the same direction. This gate was originally written to
    // assert the §CPE_DRAG_REACH cap; the cap was removed because G-DRAG-3 measured it breaking
    // out-and-back (a capped band stops under a cursor that has moved on, so the return drag grabs
    // nothing). So the gate is re-aimed at what direct manipulation actually requires: the thing you
    // grabbed stays under the cursor no matter how far you throw it. A re-introduced cap fails here.
    const mpp = mag / Math.hypot(DX, DY);          // metres per pixel at the grab depth, measured
    const x4 = Math.round(proj.sx + DX), y4 = Math.round(proj.sy + DY), tx4 = 20, ty4 = 780;
    const pdx = tx4 - x4, pdy = ty4 - y4, pxDist = Math.hypot(pdx, pdy);
    const before4 = await centres();
    await drag(page, x4, y4, tx4, ty4);
    const after4 = await centres();
    const mv4 = { x: after4[0].x - before4[0].x, y: after4[0].y - before4[0].y, z: after4[0].z - before4[0].z };
    const reach = Math.hypot(mv4.x, mv4.y, mv4.z);
    const want = pxDist * mpp;
    const ratio = reach / want;
    // Direction the pixels asked for, in world: screen-right * dx + screen-up * (-dy).
    const ex = proj.right.x * pdx - proj.up.x * pdy;
    const ey = proj.right.y * pdx - proj.up.y * pdy;
    const ez = proj.right.z * pdx - proj.up.z * pdy;
    const eL = Math.hypot(ex, ey, ez);
    const cos = (mv4.x * ex + mv4.y * ey + mv4.z * ez) / (reach * eL || 1);
    const angErr = Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI;
    P('G-DRAG-4 a huge drag is still exactly 1:1 with the cursor — no reach cap, direction preserved',
      Math.abs(ratio - 1) < 0.03 && angErr < 2,
      `reach ${reach.toFixed(2)}m vs ${want.toFixed(2)}m asked (${pxDist.toFixed(0)}px x ${mpp.toFixed(3)} m/px) ` +
      `= ${ratio.toFixed(4)}x 1:1; direction off by ${angErr.toFixed(2)}deg`);

    try { await page.evaluate(() => document.getElementById('cpe-cancel').click()); } catch (e) {}
    console.log(`  INFO  ${logs.filter(l => /§CPE_LOADED/.test(l))[0] || '(no §CPE_LOADED)'}`);
    checks.forEach(c => console.log(`  ${c.ok ? 'PASS' : 'FAIL'}  ${c.n}\n          ${c.d}`));
    summary.push({ BLD, pass: checks.every(c => c.ok), n: checks.filter(c => c.ok).length, t: checks.length });
    await page.close();
  }

  await browser.close();
  console.log(`\n${'='.repeat(78)}`);
  summary.forEach(s => console.log(`${s.pass ? 'PASS' : 'FAIL'}  ${s.BLD}  (${s.n}/${s.t})`));
  console.log(allPass ? '\nWITNESS PASS' : '\nWITNESS FAIL');
  process.exit(allPass ? 0 : 1);
})();
