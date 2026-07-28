// WITNESS — §CPE_PREVIEW_AFTER_RETIRED: OK records. It does not preview first.
// Spec: bim-compiler prompts/CINEMA_PATH_EDITOR.md §CPE_PREVIEW_AFTER_RETIRED.
//
// ⚠ RE-AIMED 2026-07-29. This file used to prove the OPPOSITE — that a second 10s rehearsal ran
// after OK (§CPE_PREVIEW_AFTER). The user removed that feature: "when OK, do not run preview again
// as there is already a Preview button." A witness left asserting a deleted feature is worse than no
// witness, so the gates are re-pointed rather than deleted, and each still names its property.
//
// THE DEFECT THIS PROVES OR DISPROVES:
// Cutting the post-OK rehearsal must remove the WAIT and nothing else. The failure mode that would
// look identical from the outside is a cut that also loses the EDIT — a bake that quietly reverts to
// the derived plan prints no edited preview either, and would pass a naive "no preview" check. So
// G-PA-2/3 assert the authored path still reaches the flown film, numerically.
//
//   G-PA-1  no rehearsal runs between §CPE_APPLIED and the first §MAXQ_FRAME after an EDITED OK —
//           and none anywhere in an editor run (§CPE_PREVIEW_REDUNDANT already removed the
//           pre-editor one). RED on a build that still has §CPE_PREVIEW_AFTER by construction.
//   G-PA-2  the edit still reaches the flown path. Measured on the PLANS, not on a camera: the
//           derived plan and the plan built from the override OK actually handed the bake are
//           sampled at matched tNorm and must separate after a 12m band edit. This is the gate that
//           catches "the removal ate the edit", which G-PA-1 alone cannot see.
//   G-PA-3  §CPE_PREVIEW_DIVERGENCE survives: the bake's first frame is the EDITED plan's poseAt(0).
//           The bake is now the only flight, so this reads the live camera at frame 0 and compares
//           it against poseAt(0) recomputed under the pinned §CPE_CAM_BASIS pose.
//
// ⚠ TWO INSTRUMENT CORRECTIONS, both measured while re-aiming, both worth keeping in mind before
// trusting any future gate here (each one first read as a product failure and was not):
//   1. A._getCinemaPathEdit() is NULL after a plain OK — stageCinemaPath() is wired to "Save this
//      path" only. Reading the staged copy measures the SAVE path, not the OK path. Tap open()'s
//      resolve instead (below).
//   2. The plan reads A.camera/A.controls DIRECTLY and the editor PINS that basis at open. Re-planning
//      with the live mid-bake camera gave 33.80m of disagreement at poseAt(0) — the witness had moved
//      the goalposts, not the code. Restore §CPE_CAM_BASIS before any comparison plan.
//   G-PA-4  an UNTOUCHED OK runs ZERO previews and re-uses the plan object (§CPE_APPLIED none).
//           ⚠ Previously asserted exactly ONE (phase=derived) — already stale when re-aimed, since
//           §CPE_PREVIEW_REDUNDANT deleted that pre-editor rehearsal the day before.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');

const PORT = process.env.PORT || 8402;
const BUILDINGS = (process.env.BLDS || 'Duplex,Terminal').split(',');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const idx = (logs, re) => logs.findIndex(l => re.test(l.text));
// A build predating §CPE_PREVIEW_AFTER logs '§MAXQ_PREVIEW start 10s ...' with no phase= at all.
// Read that as the derived phase rather than as "no preview": the RED must name the property that
// is genuinely missing (there is no EDITED preview) and must not also fail gates the old build
// actually satisfies — guardrail 2 was already intact there, and a gate that lies about which
// property broke is worse than no gate.
const phaseOf = l => { const m = l.text.match(/phase=(\w+)/); return m ? m[1] : 'derived'; };
const isPreviewStart = l => /§MAXQ_PREVIEW start/.test(l.text);

async function openViewer(browser, BLD) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 700 });
  const logs = [];
  page.on('console', m => logs.push({ t: Date.now(), text: m.text() }));
  page.on('pageerror', e => logs.push({ t: Date.now(), text: 'PAGEERROR ' + e.message }));
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

// The live camera, in Node time, so samples and console lines share one clock and the phases can be
// cut apart afterwards. This is the real object state the FUNDAMENTAL LAW asks for — position read
// off the camera itself, never a picture of it.
function startSampling(page, out) {
  let stop = false;
  (async () => {
    while (!stop) {
      try {
        const p = await page.evaluate(() => {
          const c = window.APP.camera, t = window.APP.controls.target;
          return { x: c.position.x, y: c.position.y, z: c.position.z, tx: t.x, ty: t.y, tz: t.z };
        });
        out.push({ t: Date.now(), p });
      } catch (e) { /* page busy inside a blocking plan — skip this tick */ }
      await sleep(110);
    }
  })();
  return () => { stop = true; };
}

const between = (samples, t0, t1) => samples.filter(s => s.t >= t0 && s.t <= t1).map(s => s.p);
// Resample a pose stream onto n evenly spaced points so two runs of unequal sample count compare.
function resample(stream, n) {
  if (stream.length < 2) return null;
  const out = [];
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1) * (stream.length - 1);
    const a = stream[Math.floor(u)], b = stream[Math.min(stream.length - 1, Math.ceil(u))], f = u - Math.floor(u);
    out.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, z: a.z + (b.z - a.z) * f });
  }
  return out;
}
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

// One full run: open the editor, optionally edit, OK, and watch what happens next.
async function run(browser, BLD, edit) {
  const { page, logs } = await openViewer(browser, BLD);
  const samples = [];
  const stopSampling = startSampling(page, samples);

  // Tap the editor's RESOLVE, not A._cinemaPathEdit. Measured 2026-07-29: _getCinemaPathEdit()
  // returns null after a plain OK, because A.stageCinemaPath() is wired to "Save this path" ONLY —
  // OK hands its override straight to cinema_maxq.js and never stages it. A gate that read the
  // staged copy was therefore measuring the SAVE path while claiming to measure the OK path.
  // Wrapping open() keeps the product untouched and captures exactly what OK handed the bake.
  await page.evaluate(() => {
    const cpe = window.APP.cinemaPathEditor, orig = cpe.open.bind(cpe);
    cpe.open = async function(a) {
      const r = await orig(a);
      window.__W_OV = (r && r.override) || null;
      window.__W_DUR = r && r.durationSec;
      return r;
    };
  });

  // fps:1 keeps the bake cheap — this witness only needs its first frames, not a finished film.
  await page.evaluate(() => { window.APP.startMaxQualityOrbit({ preview: true, fps: 1 }); });
  await page.waitForSelector('#cpe-ok', { timeout: 300000 });
  await sleep(500);

  if (edit) {
    // A big, unmistakable edit on the walk band: +12m of x. Small nudges can leave the re-derived
    // film close enough to the original that G-PA-2 could not tell a real preview from a replay.
    await page.evaluate(() => {
      const xIn = document.querySelectorAll('#cpe-rows > div')[1].querySelectorAll('input')[0];
      xIn.value = (parseFloat(xIn.value) + 12).toFixed(2);
      xIn.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await sleep(1200);
  }

  await page.evaluate(() => document.getElementById('cpe-ok').click());
  await page.waitForFunction(() => !document.getElementById('cpe-ok'), { timeout: 60000 });
  // Long enough for a whole 10s preview plus the first bake frames to land.
  await page.waitForFunction(() => true, { timeout: 5000 }).catch(() => {});
  // Terminal-sized buildings take well past 60s to stage and converge their first frame under
  // swiftshader; a short wait made G-PA-3 report a product failure when the bake simply had not
  // reached frame 0 yet (observed 2026-07-27, Terminal, iFrame0=-1).
  for (let i = 0; i < 300 && idx(logs, /§MAXQ_FRAME i=/) < 0; i++) await sleep(1000);
  await sleep(1500);

  stopSampling();

  // The numeric half of this witness. With the rehearsal gone there is no second flight to sample, so
  // the "did the edit survive?" property is read off the PLANS: the derived plan and the plan built
  // from the staged override (A._getCinemaPathEdit(), the same object the plan wrapper re-applies),
  // sampled through the bake's own poseAt. Same function the bake steps frame by frame — not a
  // re-implementation. Only meaningful on the edited run; the untouched run has no override.
  let planCmp = null;
  if (edit) {
    const total = (logs.find(l => /§CPE_APPLIED total=/.test(l.text)) || { text: '' })
      .text.match(/total=([\d.]+)s/);
    const durSec = total ? parseFloat(total[1]) : 30;
    // §CPE_PREVIEW_DIVERGENCE is load-bearing for this comparison: _cinemaPathPlan reads
    // A.camera.position / A.controls.target DIRECTLY, and the editor PINS that basis to the pose it
    // opened with. Re-planning here with the live camera (mid-bake, parked on frame 0's pose) plans a
    // different dive and pivot entirely — measured 33.80m of disagreement at poseAt(0), which read as
    // a product failure and was the witness moving the goalposts. Restore the pinned basis, which the
    // editor already prints, so the plan computed here is the plan the bake is flying.
    const cb = (logs.find(l => /§CPE_CAM_BASIS/.test(l.text)) || { text: '' }).text
      .match(/cam=\(([-\d.]+),([-\d.]+),([-\d.]+)\) target=\(([-\d.]+),([-\d.]+),([-\d.]+)\)/);
    const basis = cb ? { px: +cb[1], py: +cb[2], pz: +cb[3], tx: +cb[4], ty: +cb[5], tz: +cb[6] } : null;
    try {
      planCmp = await page.evaluate((dur, N, b) => {
        const A = window.APP;
        const ov = window.__W_OV || null;
        if (!ov) return { err: 'the editor resolved no override — OK returned override:null' };
        if (!b) return { err: 'no §CPE_CAM_BASIS line — cannot reproduce the plan basis' };
        A.camera.position.set(b.px, b.py, b.pz);
        A.controls.target.set(b.tx, b.ty, b.tz);
        A.controls.update();
        const d = A.cinemaPathPlan(dur, null);   // explicit null = derived, no db load
        const e = A.cinemaPathPlan(dur, ov);
        if (!d || !d.poseAt || !e || !e.poseAt) return { err: 'a plan came back without poseAt' };
        const D = [], E = [];
        for (let i = 0; i < N; i++) { const t = i / (N - 1); D.push(d.poseAt(t)); E.push(e.poseAt(t)); }
        const dst = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
        const len = s => s.slice(1).reduce((a, p, i) => a + dst(p, s[i]), 0);
        let maxSep = 0;
        for (let i = 0; i < N; i++) maxSep = Math.max(maxSep, dst(D[i], E[i]));
        const p0 = E[0];
        return { maxSep: maxSep, dLen: len(D), eLen: len(E), n: N,
                 pose0: { x: p0.x, y: p0.y, z: p0.z } };
      }, durSec, 200, basis);
    } catch (e) { planCmp = { err: 'page.evaluate failed: ' + e.message }; }
  }

  try { await page.evaluate(() => { window.APP.cancelMaxQualityOrbit && window.APP.cancelMaxQualityOrbit(); }); } catch (e) {}
  await sleep(300);
  await page.close();
  return { logs, samples, planCmp };
}

async function gates(browser, BLD) {
  const checks = [];
  const P = (n, ok, d) => checks.push({ n, ok, d });

  const { logs, samples, planCmp } = await run(browser, BLD, true);

  const iApplied = idx(logs, /§CPE_APPLIED total=/);
  const iFrame0  = idx(logs, /§MAXQ_FRAME i=/);
  const previews = logs.filter(isPreviewStart);

  // The window the deleted rehearsal used to occupy. Nothing may fly in it, and — because
  // §CPE_PREVIEW_REDUNDANT already removed the pre-editor one — nothing may fly before it either.
  const inWindow = previews.filter(p => {
    const i = logs.indexOf(p);
    return iApplied > 0 && i > iApplied && (iFrame0 < 0 || i < iFrame0);
  });
  P('G-PA-1 OK records without a rehearsal — no §MAXQ_PREVIEW between §CPE_APPLIED and frame 0',
    iApplied > 0 && inWindow.length === 0 && previews.length === 0,
    `previews in whole run=${previews.length} [${previews.map(phaseOf).join(', ')}], ` +
    `in the OK→bake window=${inWindow.length}  ` +
    `§CPE_APPLIED@${iApplied}  §MAXQ_FRAME i=0@${iFrame0}`);

  // G-PA-2 — the property G-PA-1 alone cannot see: a bake that quietly reverted to the derived plan
  // ALSO prints no preview. Measured on the plans themselves (real object state, per the FUNDAMENTAL
  // LAW), not on a camera: derived poseAt(t) vs staged-override poseAt(t) at matched tNorm.
  P('G-PA-2 the edit still reaches the flown path (derived vs authored plans separate)',
    planCmp !== null && !planCmp.err && planCmp.maxSep > 1.0,
    planCmp === null || planCmp.err
      ? `could not compare plans: ${planCmp ? planCmp.err : 'no override staged — A._getCinemaPathEdit() returned null'}`
      : `derived pathLen ${planCmp.dLen.toFixed(1)}m, authored pathLen ${planCmp.eLen.toFixed(1)}m, ` +
        `max separation over ${planCmp.n} matched tNorm = ${planCmp.maxSep.toFixed(2)}m ` +
        `(must be > 1.0m after a 12m band edit)`);

  // §CPE_PREVIEW_DIVERGENCE, re-asserted against the only flight left: the bake's first frame must be
  // the EDITED plan's poseAt(0), computed from the same staged override the plan wrapper re-applies.
  const tFrame0 = iFrame0 >= 0 ? logs[iFrame0].t : null;
  const bakeFirst = tFrame0 ? between(samples, tFrame0 - 400, tFrame0 + 1200)[0] : null;
  const editFirst = planCmp && !planCmp.err ? planCmp.pose0 : null;
  const gap = bakeFirst && editFirst ? dist(bakeFirst, editFirst) : null;
  // If the bake never reached frame 0 inside the wait, say so — an unobserved bake is not evidence
  // either way, and reporting it as a failed comparison would be a false accusation against the code.
  P('G-PA-3 the bake flies the EDITED plan (frame 0 == authored poseAt(0))' +
    (tFrame0 === null ? ' — INCONCLUSIVE, no bake frame observed' : ''),
    tFrame0 === null ? false : (gap !== null && gap < 2.0),
    `authored poseAt(0) = (${editFirst ? [editFirst.x, editFirst.y, editFirst.z].map(v => v.toFixed(1)).join(',') : 'n/a'}), ` +
    `bake's first frame at (${bakeFirst ? [bakeFirst.x, bakeFirst.y, bakeFirst.z].map(v => v.toFixed(1)).join(',') : 'n/a'}) ` +
    `— ${gap === null ? 'n/a' : gap.toFixed(2) + 'm apart'}`);

  // Guardrail 2: OK with no edit costs one click and nothing else — now literally zero rehearsals.
  const r2 = await run(browser, BLD, false);
  const prev2 = r2.logs.filter(isPreviewStart);
  P('G-PA-4 an untouched OK runs ZERO previews (guardrail 2: one click, nothing else)',
    prev2.length === 0 && r2.logs.some(l => /§CPE_APPLIED none/.test(l.text)),
    `${prev2.length} preview(s): [${prev2.map(phaseOf).join(', ')}]  ` +
    `— ${r2.logs.some(l => /§CPE_APPLIED none/.test(l.text)) ? '§CPE_APPLIED none (plan object re-used)' : 'no §CPE_APPLIED none line'}`);

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
