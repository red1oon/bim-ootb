// WITNESS — §CPE_PREVIEW_AFTER: you get to see the film you edited, before it bakes.
// Spec: bim-compiler prompts/CINEMA_PATH_EDITOR.md ask 5.
//
// THE DEFECT THIS PROVES OR DISPROVES (user's own console, 2026-07-27, and their ask):
// The 10s rehearsal ran ONCE, BEFORE the editor opened — so it showed the DERIVED path, the one film
// you already knew you did not want, which is why you opened the editor at all. The film you then
// authored went straight into a ten-minute bake completely unseen. Their log shows the gap exactly:
//     §CPE_CLOSE -> §CPE_APPLIED -> §MAXQ_FRAME i=0        (no second §MAXQ_PREVIEW anywhere)
//
//   G-PA-1  a second preview exists, and it is in the right place — §MAXQ_PREVIEW phase=edited
//           strictly AFTER §CPE_APPLIED and strictly BEFORE the first §MAXQ_FRAME. RED on
//           origin/main by construction: there is only one preview there.
//   G-PA-2  it flies the EDITED film, not a re-run of the derived one. Both previews are sampled
//           from the LIVE camera at matched tNorm; after a real edit the two streams must separate.
//           A second preview that merely replayed the old path would pass G-PA-1 and fail here.
//   G-PA-3  it flies the same poseAt the BAKE does. The bake's first frame is poseAt(0); the edited
//           preview's first sample is poseAt(0) of whatever plan it flew. Same plan => same point.
//           This is the §CPE_PREVIEW_DIVERGENCE property, re-asserted for the new preview.
//   G-PA-4  guardrail 2 is intact: an UNTOUCHED OK gets exactly ONE preview. The promise is "the
//           default cost of this feature is one click and nothing else" — a second 10s rehearsal
//           proving nothing changed would break it, so this gate fails if the preview is
//           unconditional rather than edit-only.
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
  try { await page.evaluate(() => { window.APP.cancelMaxQualityOrbit && window.APP.cancelMaxQualityOrbit(); }); } catch (e) {}
  await sleep(300);
  await page.close();
  return { logs, samples };
}

async function gates(browser, BLD) {
  const checks = [];
  const P = (n, ok, d) => checks.push({ n, ok, d });

  const { logs, samples } = await run(browser, BLD, true);

  const iApplied = idx(logs, /§CPE_APPLIED total=/);
  const iFrame0  = idx(logs, /§MAXQ_FRAME i=/);
  const previews = logs.filter(isPreviewStart);
  const iEdited  = idx(logs, /§MAXQ_PREVIEW start phase=edited/);

  P('G-PA-1 a second preview runs, after §CPE_APPLIED and before the first baked frame',
    iEdited > 0 && iApplied > 0 && iEdited > iApplied && (iFrame0 < 0 || iEdited < iFrame0),
    `previews=${previews.length} [${previews.map(phaseOf).join(', ')}]  ` +
    `§CPE_APPLIED@${iApplied}  §MAXQ_PREVIEW(edited)@${iEdited}  §MAXQ_FRAME i=0@${iFrame0}`);

  // Cut the two preview windows out of the sample stream using the phase log lines as boundaries.
  const at = re => { const h = logs.find(l => re.test(l.text)); return h ? h.t : null; };
  const dStart = at(/§MAXQ_PREVIEW start/), dEnd = at(/§MAXQ_PREVIEW done/);
  const eStart = at(/§MAXQ_PREVIEW start phase=edited/),  eEnd = at(/§MAXQ_PREVIEW done phase=edited/);
  const D = dStart && dEnd ? resample(between(samples, dStart, dEnd), 20) : null;
  const E = eStart && eEnd ? resample(between(samples, eStart, eEnd), 20) : null;

  let maxSep = null, dLen = null, eLen = null;
  if (D && E) {
    maxSep = Math.max(...D.map((d, i) => dist(d, E[i])));
    const pathLen = s => s.slice(1).reduce((a, p, i) => a + dist(p, s[i]), 0);
    dLen = pathLen(D); eLen = pathLen(E);
  }
  P('G-PA-2 the second preview flies the EDITED film, not a replay of the derived one',
    maxSep !== null && maxSep > 1.0 && eLen > 1.0,
    `derived preview ${D ? D.length : 0} samples, travelled ${dLen === null ? 'n/a' : dLen.toFixed(1) + 'm'}\n` +
    `          edited  preview ${E ? E.length : 0} samples, travelled ${eLen === null ? 'n/a' : eLen.toFixed(1) + 'm'}\n` +
    `          max separation at matched tNorm = ${maxSep === null ? 'n/a' : maxSep.toFixed(2) + 'm'} (must be > 1.0m after a 12m band edit)`);

  // The bake's first frame is poseAt(0). The edited preview's first sample is poseAt(0) of whatever
  // plan IT flew. Same number => one plan, which is the §CPE_PREVIEW_DIVERGENCE property.
  const tFrame0 = iFrame0 >= 0 ? logs[iFrame0].t : null;
  const bakeFirst = tFrame0 ? between(samples, eEnd || 0, tFrame0 + 1200)[0] : null;
  const editFirst = E ? E[0] : null;
  const gap = bakeFirst && editFirst ? dist(bakeFirst, editFirst) : null;
  // If the bake never reached frame 0 inside the wait, say so — an unobserved bake is not evidence
  // either way, and reporting it as a failed comparison would be a false accusation against the code.
  P('G-PA-3 the edited preview and the bake fly the same plan (poseAt(0) agrees)' +
    (tFrame0 === null ? ' — INCONCLUSIVE, no bake frame observed' : ''),
    tFrame0 === null ? false : (gap !== null && gap < 2.0),
    `edited preview started at (${editFirst ? [editFirst.x, editFirst.y, editFirst.z].map(v => v.toFixed(1)).join(',') : 'n/a'}), ` +
    `bake's first frame at (${bakeFirst ? [bakeFirst.x, bakeFirst.y, bakeFirst.z].map(v => v.toFixed(1)).join(',') : 'n/a'}) ` +
    `— ${gap === null ? 'n/a' : gap.toFixed(2) + 'm apart'}`);

  // Guardrail 2: OK with no edit must not cost a second 10 seconds.
  const r2 = await run(browser, BLD, false);
  const prev2 = r2.logs.filter(isPreviewStart);
  P('G-PA-4 an untouched OK still gets exactly ONE preview (guardrail 2: one click, nothing else)',
    prev2.length === 1 && phaseOf(prev2[0]) === 'derived',
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
