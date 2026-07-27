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
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');

const PORT = process.env.PORT || 8402;
const BUILDINGS = (process.env.BLDS || 'Duplex,Terminal').split(',');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const pivotOf = l => { const m = l && l.match(/src=(\S+) pivot=\(([^)]*)\)/); return m ? m[1] + ' @' + m[2] : null; };
const diveOf  = l => { const m = l && l.match(/diveDist=([\d.]+)m/); return m ? m[1] : null; };
const spinOf  = l => { const m = l && l.match(/finalSpinDeg=([\d.-]+)/); return m ? m[1] : null; };
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

// One editor session. `dolly` true → move the camera hard toward the target mid-edit, which is what
// orbiting/zooming in to inspect a band does, and what flipped the user's plausibility test.
async function session(browser, BLD, dolly) {
  const { page, logs } = await openViewer(browser, BLD);
  // BLOCK body: a concise arrow would return the bake promise and evaluate() would await the cook.
  await page.evaluate(() => { window.APP.startMaxQualityOrbit({ preview: false, fps: 1 }); });
  await page.waitForSelector('#cpe-ok', { timeout: 120000 });
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
  if (dolly) {
    camMoved = await page.evaluate(() => {
      const A = window.APP, c = A.camera, t = A.controls.target;
      const before = Math.hypot(c.position.x - t.x, c.position.y - t.y, c.position.z - t.z);
      // 75% of the way to the target — a big, unambiguous "I orbited in to look at this band".
      c.position.set(c.position.x + (t.x - c.position.x) * 0.75,
                     c.position.y + (t.y - c.position.y) * 0.75,
                     c.position.z + (t.z - c.position.z) * 0.75);
      A.controls.update();
      const after = Math.hypot(c.position.x - t.x, c.position.y - t.y, c.position.z - t.z);
      return { before: before.toFixed(1), after: after.toFixed(1) };
    });
    await sleep(200);
    await keyY(1.0);            // re-plan WITH the moved camera
    await sleep(500);
  }

  const editPivot = last(logs, /§CINEMA_PIVOT/);
  const editDive  = last(logs, /§CINEMA_DIVE /);
  const editSpin  = last(logs, /§CINEMA_SPIN /);
  const pivotsWhileEditing = logs.filter(l => /§CINEMA_PIVOT/.test(l)).slice(pivotsAtOpen - 1);

  await page.evaluate(() => document.getElementById('cpe-ok').click());
  await page.waitForFunction(() => !document.getElementById('cpe-ok'), { timeout: 30000 });
  // The bake's plan is the one printed AFTER the editor closed.
  const closeIdx = logs.findIndex(l => /§CPE_CLOSE/.test(l));
  const afterClose = logs.slice(closeIdx + 1);
  const bakePivot = last(afterClose, /§CINEMA_PIVOT/);
  const bakeDive  = last(afterClose, /§CINEMA_DIVE /);
  const bakeSpin  = last(afterClose, /§CINEMA_SPIN /);

  try { await page.evaluate(() => { window.APP.startMaxQualityOrbit(); }); } catch (e) {}
  await sleep(400);
  await page.close();
  return { logs, camMoved, editPivot, editDive, editSpin, bakePivot, bakeDive, bakeSpin, pivotsWhileEditing };
}

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

    const r = await session(browser, BLD, true);

    const same = (a, b, f) => f(a) !== null && f(a) === f(b);
    const p1 = same(r.editPivot, r.bakePivot, pivotOf) &&
               same(r.editDive, r.bakeDive, diveOf) &&
               same(r.editSpin, r.bakeSpin, spinOf);
    P('P1 the last EDITED plan and the BAKED plan agree on pivot, diveDist and spin',
      p1,
      `camera dollied ${r.camMoved ? r.camMoved.before + 'm -> ' + r.camMoved.after + 'm from target' : '(not moved)'} mid-edit\n` +
      `          editor: pivot=${pivotOf(r.editPivot)} dive=${diveOf(r.editDive)}m spin=${spinOf(r.editSpin)}deg\n` +
      `          bake:   pivot=${pivotOf(r.bakePivot)} dive=${diveOf(r.bakeDive)}m spin=${spinOf(r.bakeSpin)}deg`);

    const uniq = [...new Set(r.pivotsWhileEditing.map(pivotOf))];
    P('P2 looking from somewhere else does not change the film (every editing pivot identical)',
      uniq.length === 1,
      `${r.pivotsWhileEditing.length} re-plans while the editor was open, ${uniq.length} distinct pivot(s):\n` +
      `          ${uniq.join('\n          ')}\n` +
      `          ${last(r.logs, /§CPE_CAM_BASIS/) || '(no §CPE_CAM_BASIS line — unpatched build)'}`);

    const r2 = await session(browser, BLD, false);
    P('P3 no-move regression: an untouched camera still agrees editor-vs-bake',
      same(r2.editPivot, r2.bakePivot, pivotOf) && same(r2.editDive, r2.bakeDive, diveOf) &&
        same(r2.editSpin, r2.bakeSpin, spinOf),
      `editor: pivot=${pivotOf(r2.editPivot)} dive=${diveOf(r2.editDive)}m spin=${spinOf(r2.editSpin)}deg\n` +
      `          bake:   pivot=${pivotOf(r2.bakePivot)} dive=${diveOf(r2.bakeDive)}m spin=${spinOf(r2.bakeSpin)}deg`);

    checks.forEach(c => console.log(`  ${c.ok ? 'PASS' : 'FAIL'}  ${c.n}\n          ${c.d}`));
    summary.push({ BLD, pass: checks.every(c => c.ok), n: checks.filter(c => c.ok).length, t: checks.length });
  }

  await browser.close();
  console.log(`\n${'='.repeat(78)}`);
  summary.forEach(s => console.log(`${s.pass ? 'PASS' : 'FAIL'}  ${s.BLD}  (${s.n}/${s.t})`));
  console.log(allPass ? '\nWITNESS PASS' : '\nWITNESS FAIL');
  process.exit(allPass ? 0 : 1);
})();
