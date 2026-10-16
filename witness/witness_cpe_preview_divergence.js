// WITNESS — §CPE_PREVIEW_DIVERGENCE: the film you edit is the film that bakes.
// Spec: bim-compiler prompts/CINEMA_PATH_EDITOR.md §CPE_PREVIEW_DIVERGENCE.
//
// THE DEFECT THIS PROVES OR DISPROVES (measured live by the user, Hospital, 2026-07-27):
// _cinemaPathPlan reads A.camera.position / A.controls.target directly, so the plan silently depends
// on where the user happens to be LOOKING FROM. While editing (orbited in) their log showed
// targetOffCam=16.7 — under envelope*0.25=36.9 — so §CINEMA_PIVOT stayed `arc-bbox-centre`:
// diveDist=14.2m, spin 0.0deg. On OK the editor restores the pose it captured at open, targetOffCam
// became 54.0, the threshold flipped, and the SAME building planned `controls-target(plausible)`:
// diveDist=77.2m, spin 118.1deg. They previewed a film with no spin and baked one that turns 118deg.
//
//   P1 the report — the LAST plan the editor showed and the plan the bake uses must agree on
//      §CINEMA_PIVOT src, pivot coords, diveDist and finalSpinDeg. RED on origin/main by
//      construction: this witness dollies the camera in mid-edit, exactly as orbiting does.
//   P2 the invariant that makes P1 true — merely LOOKING from somewhere else must not change the
//      film. Every §CINEMA_PIVOT emitted while the editor is open must be identical, before and
//      after a large camera move. Pivot is used because it depends ONLY on camera/target/bbox and
//      not at all on the bands, so it isolates the camera basis from the edit itself.
//   P3 no-move regression — a session where the camera never moves must be unaffected (the basis
//      then IS the live camera). Same three numbers, editor vs bake, on an untouched camera.
//
// §CPE_BASIS_HALF_PIN — P4, THE ROTATION GATE (2026-07-27). P1-P3 were 3/3 both BEFORE and AFTER
// the half-pin fix, so they could not see it: they only ever DOLLY the camera, and the half pin
// pinned POSITION and TARGET correctly. What it never pinned was the camera's ROTATION, and
// yaw0/pitch0 come from A.camera.getWorldDirection(). A dolly along the view axis leaves the
// rotation alone, so the blind spot is exactly "the user ORBITED while the editor was open" — the
// gesture they actually make. Measured in their Hospital log, one session, one edit:
//     editing: yaw0=-88.9 pitch0=-16.9  exit facingDot=+0.456  spin  -35.3 deg
//     baking : yaw0=+91.5 pitch0=-81.0  exit facingDot=-0.450  spin +504.3 deg class=behind(full-lap)
// A different exit door and a full extra lap.
//   P4 orbit (not dolly) mid-edit, then compare the editor's LAST plan with the BAKE's on the four
//      quantities the rotation actually drives: yaw0, pitch0, the chosen exit GUID, finalSpinDeg.
//      RED without the `c.lookAt(basis)` half of the pin, GREEN with it.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');

const PORT = process.env.PORT || 8402;
const BUILDINGS = (process.env.BLDS || 'Duplex,Terminal').split(',');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const pivotOf = l => { const m = l && l.match(/src=(\S+) pivot=\(([^)]*)\)/); return m ? m[1] + ' @' + m[2] : null; };
const diveOf  = l => { const m = l && l.match(/diveDist=([\d.]+)m/); return m ? m[1] : null; };
const spinOf  = l => { const m = l && l.match(/finalSpinDeg=([\d.-]+)/); return m ? m[1] : null; };
// P4's four: the quantities a ROTATION drives and a dolly does not.
const yawOf   = l => { const m = l && l.match(/yaw0=(-?[\d.]+)°/);   return m ? m[1] : null; };
const pitchOf = l => { const m = l && l.match(/pitch0=(-?[\d.]+)°/); return m ? m[1] : null; };
const exitOf  = l => { const m = l && l.match(/§CINEMA_EXIT chosen=(\S+)/); return m ? m[1] : null; };
const last = (logs, re) => { const h = logs.filter(l => re.test(l)); return h.length ? h[h.length - 1] : null; };

async function openViewer(browser, BLD) {
  const page = await browser.newPage();
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
  return { page, logs };
}

// One editor session. `move` is the gesture made mid-edit:
//   'dolly'  → drive the camera hard toward the target (zooming in to inspect a band). Changes
//              POSITION only — what P1/P2/P3 exercise, and what the half pin already covered.
//   'orbit'  → swing the camera around the target and re-aim it, i.e. a real orbit drag. Changes
//              the camera's ROTATION, which is what P4 exists to catch.
//   'none'   → the camera is never touched (P3's regression control).
async function session(browser, BLD, move) {
  const { page, logs } = await openViewer(browser, BLD);
  // BLOCK body: a concise arrow would return the bake promise and evaluate() would await the cook.
  await page.evaluate(() => { window.APP.startMaxQualityOrbit({ preview: false, fps: 1 }); });
  // Hospital's first plan (room graph + raycast fan) does not finish inside 120s under swiftshader.
  await page.waitForSelector('#cpe-ok', { timeout: 300000 });
  await sleep(500);

  const pivotsAtOpen = logs.filter(l => /§CINEMA_PIVOT/.test(l)).length;

  // A real edit, so a re-plan definitely happens (keyed y — the same state a drag mutates).
  const keyY = (d) => page.evaluate(dd => {
    const yIn = document.querySelectorAll('#cpe-rows > div')[0].querySelectorAll('input')[2];
    yIn.value = (parseFloat(yIn.value) + dd).toFixed(2);
    yIn.dispatchEvent(new Event('change', { bubbles: true }));
  }, d);

  await keyY(1.0);
  await sleep(500);

  let camMoved = null;
  if (move === 'dolly') {
    camMoved = await page.evaluate(() => {
      const A = window.APP, c = A.camera, t = A.controls.target;
      const before = Math.hypot(c.position.x - t.x, c.position.y - t.y, c.position.z - t.z);
      // 75% of the way to the target — a big, unambiguous "I zoomed in to look at this band".
      c.position.set(c.position.x + (t.x - c.position.x) * 0.75,
                     c.position.y + (t.y - c.position.y) * 0.75,
                     c.position.z + (t.z - c.position.z) * 0.75);
      A.controls.update();
      const after = Math.hypot(c.position.x - t.x, c.position.y - t.y, c.position.z - t.z);
      return { what: 'dollied', before: before.toFixed(1) + 'm', after: after.toFixed(1) + 'm from target' };
    });
  } else if (move === 'orbit') {
    camMoved = await page.evaluate(() => {
      const A = window.APP, c = A.camera, t = A.controls.target;
      const deg = d => (d * 180 / Math.PI).toFixed(1);
      // Reuse the camera's own vector class rather than reaching for a global THREE, which the
      // viewer does not necessarily expose on window.
      const V3 = c.position.constructor;
      const d0 = c.getWorldDirection(new V3());
      const before = deg(Math.atan2(d0.z, d0.x)) + '°/' + deg(Math.asin(Math.max(-1, Math.min(1, d0.y)))) + '°';
      // A 140° azimuth swing plus a big elevation change, about the orbit target — exactly what
      // dragging with the left mouse button does. Distance to target is preserved.
      const dx = c.position.x - t.x, dy = c.position.y - t.y, dz = c.position.z - t.z;
      const a = 140 * Math.PI / 180;
      const nx = dx * Math.cos(a) - dz * Math.sin(a);
      const nz = dx * Math.sin(a) + dz * Math.cos(a);
      c.position.set(t.x + nx, t.y + dy * 0.25, t.z + nz);
      A.controls.update();      // OrbitControls re-aims the camera at the target — the ROTATION changes
      const d1 = c.getWorldDirection(new V3());
      const after = deg(Math.atan2(d1.z, d1.x)) + '°/' + deg(Math.asin(Math.max(-1, Math.min(1, d1.y)))) + '°';
      return { what: 'orbited', before: 'yaw/pitch ' + before, after: after };
    });
  }
  if (camMoved) {
    await sleep(200);
    await keyY(1.0);            // re-plan WITH the moved camera
    await sleep(500);
  }

  const editPivot = last(logs, /§CINEMA_PIVOT/);
  const editDive  = last(logs, /§CINEMA_DIVE /);
  const editSpin  = last(logs, /§CINEMA_SPIN /);
  const editExit  = last(logs, /§CINEMA_EXIT chosen=/);
  const pivotsWhileEditing = logs.filter(l => /§CINEMA_PIVOT/.test(l)).slice(pivotsAtOpen - 1);

  await page.evaluate(() => document.getElementById('cpe-ok').click());
  await page.waitForFunction(() => !document.getElementById('cpe-ok'), { timeout: 30000 });
  // The bake's plan is the one printed AFTER the editor closed.
  const closeIdx = logs.findIndex(l => /§CPE_CLOSE/.test(l));
  const afterClose = logs.slice(closeIdx + 1);
  const bakePivot = last(afterClose, /§CINEMA_PIVOT/);
  const bakeDive  = last(afterClose, /§CINEMA_DIVE /);
  const bakeSpin  = last(afterClose, /§CINEMA_SPIN /);
  const bakeExit  = last(afterClose, /§CINEMA_EXIT chosen=/);

  try { await page.evaluate(() => { window.APP.startMaxQualityOrbit(); }); } catch (e) {}
  await sleep(400);
  await page.close();
  return { logs, camMoved, editPivot, editDive, editSpin, editExit,
           bakePivot, bakeDive, bakeSpin, bakeExit, pivotsWhileEditing };
}

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    // Hospital blocks the JS thread far longer than puppeteer's 180s default while it plans, and a
    // blown protocolTimeout aborts the run mid-gate — which reads as a product failure and is not one.
    protocolTimeout: 900000,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  let allPass = true;
  const summary = [];

  for (const BLD of BUILDINGS) {
    console.log(`\n${'='.repeat(78)}\n${BLD}\n${'='.repeat(78)}`);
    const checks = [];
    const P = (n, ok, d) => { checks.push({ n, ok, d }); if (!ok) allPass = false; };

    const r = await session(browser, BLD, 'dolly');

    const same = (a, b, f) => f(a) !== null && f(a) === f(b);
    const p1 = same(r.editPivot, r.bakePivot, pivotOf) &&
               same(r.editDive, r.bakeDive, diveOf) &&
               same(r.editSpin, r.bakeSpin, spinOf);
    P('P1 the last EDITED plan and the BAKED plan agree on pivot, diveDist and spin',
      p1,
      `camera ${r.camMoved ? r.camMoved.what + ' ' + r.camMoved.before + ' -> ' + r.camMoved.after : '(not moved)'} mid-edit\n` +
      `          editor: pivot=${pivotOf(r.editPivot)} dive=${diveOf(r.editDive)}m spin=${spinOf(r.editSpin)}deg\n` +
      `          bake:   pivot=${pivotOf(r.bakePivot)} dive=${diveOf(r.bakeDive)}m spin=${spinOf(r.bakeSpin)}deg`);

    const uniq = [...new Set(r.pivotsWhileEditing.map(pivotOf))];
    P('P2 looking from somewhere else does not change the film (every editing pivot identical)',
      uniq.length === 1,
      `${r.pivotsWhileEditing.length} re-plans while the editor was open, ${uniq.length} distinct pivot(s):\n` +
      `          ${uniq.join('\n          ')}\n` +
      `          ${last(r.logs, /§CPE_CAM_BASIS/) || '(no §CPE_CAM_BASIS line — unpatched build)'}`);

    const r2 = await session(browser, BLD, 'none');
    P('P3 no-move regression: an untouched camera still agrees editor-vs-bake',
      same(r2.editPivot, r2.bakePivot, pivotOf) && same(r2.editDive, r2.bakeDive, diveOf) &&
        same(r2.editSpin, r2.bakeSpin, spinOf),
      `editor: pivot=${pivotOf(r2.editPivot)} dive=${diveOf(r2.editDive)}m spin=${spinOf(r2.editSpin)}deg\n` +
      `          bake:   pivot=${pivotOf(r2.bakePivot)} dive=${diveOf(r2.bakeDive)}m spin=${spinOf(r2.bakeSpin)}deg`);

    // P4 — the rotation gate. Same comparison, but the mid-edit gesture is an ORBIT, and the four
    // quantities compared are the ones a rotation drives. P1's three (pivot/dive/spin) are blind to
    // it because the half pin already held position and target.
    const r4 = await session(browser, BLD, 'orbit');
    const fmt4 = (dv, ex, sp) =>
      `yaw0=${yawOf(dv)}° pitch0=${pitchOf(dv)}° exit=${exitOf(ex)} spin=${spinOf(sp)}deg`;
    const p4 = same(r4.editDive, r4.bakeDive, yawOf) && same(r4.editDive, r4.bakeDive, pitchOf) &&
               same(r4.editExit, r4.bakeExit, exitOf) && same(r4.editSpin, r4.bakeSpin, spinOf);
    P('P4 ORBITING mid-edit does not change the film (yaw0, pitch0, exit GUID, finalSpinDeg agree)',
      p4,
      `camera ${r4.camMoved ? r4.camMoved.what + ' ' + r4.camMoved.before + ' -> ' + r4.camMoved.after : '(not moved)'} mid-edit\n` +
      `          editor: ${fmt4(r4.editDive, r4.editExit, r4.editSpin)}\n` +
      `          bake:   ${fmt4(r4.bakeDive, r4.bakeExit, r4.bakeSpin)}`);

    checks.forEach(c => console.log(`  ${c.ok ? 'PASS' : 'FAIL'}  ${c.n}\n          ${c.d}`));
    summary.push({ BLD, pass: checks.every(c => c.ok), n: checks.filter(c => c.ok).length, t: checks.length });
  }

  await browser.close();
  console.log(`\n${'='.repeat(78)}`);
  summary.forEach(s => console.log(`${s.pass ? 'PASS' : 'FAIL'}  ${s.BLD}  (${s.n}/${s.t})`));
  console.log(allPass ? '\nWITNESS PASS' : '\nWITNESS FAIL');
  process.exit(allPass ? 0 : 1);
})();
