// WITNESS — §CPE_BUILDUP_EVEN_TEMPO. The buildup's calendar must advance at an even rate.
// Spec: bim-compiler prompts/CINEMA_PATH_EDITOR.md §CPE_BUILDUP_EVEN_TEMPO.
//
// USER REPORT (2026-08-06, verbatim): "why does the movie baking makes the first few seconds or
// during the dive in jumps days too fast tempo? Should be even throughout - separation of concern.
// Let the user plays with the sticks and timings to catch this linear buildup."
//
// WHAT THESE GATES PROVE OR DISPROVE — §CPE_BUILDUP_WORK_PACED (cinema_maxq.js `_workCursorAt`)
// deliberately made the film advance by WORK rather than by calendar: film fraction t maps to the
// k-th ELEMENT PLACED, k = round(t * total). Even element rate is uneven DAY rate by construction —
// wherever the 4D schedule is sparse in elements (site/substructure, typically the opening of the
// film, which is exactly where the dive-in happens) the date cursor must sprint through weeks to
// find the next element, and wherever elements cluster it crawls. That sprint is the reported
// symptom, and it is the design working as written, not a defect in it.
//
//   G-TEMPO-EVEN    the per-step calendar advance is CONSTANT across the whole buildup —
//                   max(days per step) / min(days per step) ~ 1. Pre-fix this ratio is the size of
//                   the schedule's own element clustering, and it is the number the user is seeing.
//   G-TEMPO-DIVEIN  the first 10% of the buildup consumes ~10% of the project calendar — the
//                   specific "first few seconds / during the dive in jumps days too fast" claim,
//                   measured rather than eyeballed.
//   G-TEMPO-LINEAR  cursor(u) is the straight line projectStart + u*span to within 0.5% of span —
//                   the whole curve, not just its endpoints (which matched even pre-fix).
//
// SEPARATION OF CONCERN (the user's own framing, and why this is not just "revert work pacing"):
// the buildup engine's job is one predictable thing — linear days. Dwelling on a phase is the PATH
// EDITOR's job, via sticks and their timings. Two mechanisms competing to set dramatic pacing is
// what produced a tempo nobody asked for and nobody could steer.
//
// EVIDENCE DISCIPLINE: sampled numbers off the REAL exposed APP.buildupCursorAt against the REAL
// armed Time Machine schedule — never a screenshot, never "looks even" — CLAUDE.md FUNDAMENTAL LAW.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');

const PORT = process.env.PORT || 8460;
const BUILDINGS = (process.env.BLDS || 'Duplex').split(',');
const N = 100;                       // samples across the buildup
const sleep = ms => new Promise(r => setTimeout(r, ms));
const DAY = 86400000;

async function openEditor(browser, BLD) {
  const page = await browser.newPage();
  // See witness_cpe_vf_grip.js — the viewer's service worker will otherwise serve a previous run's
  // JS and a fresh hook reads as undefined against a tree that defines it.
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

async function gates(browser, BLD) {
  const checks = [];
  const P = (n, ok, d) => checks.push({ n, ok, d });
  const { page, logs } = await openEditor(browser, BLD);

  const s = await page.evaluate(async (N) => {
    const A = window.APP;
    if (typeof window.tmGenerateTimeline === 'function') { try { window.tmGenerateTimeline(); } catch (e) {} }
    let ok = false;
    try { ok = await window.tmActivateForBake(); } catch (e) { return { err: 'tmActivateForBake: ' + e.message }; }
    if (!ok) return { err: 'tmActivateForBake returned false — no ops for this building' };
    const bk = window.tmFollowTimeline();
    if (!bk) return { err: 'no timeline to follow' };
    if (typeof A.buildupCursorAt !== 'function') return { err: 'APP.buildupCursorAt missing' };
    // Sample the BUILDUP fraction directly. buildupTAt is linear in film time on [0, topout], so an
    // even calendar rate per unit u IS an even calendar rate per film second — this isolates
    // _workCursorAt, the one function that decides the tempo.
    const cur = [];
    for (let i = 0; i <= N; i++) cur.push(A.buildupCursorAt(i / N, bk));
    const plan = A.cinemaPathEditor._probePlanRef();
    return {
      cur, projectStart: bk.projectStart, projectEnd: bk.projectEnd, ops: bk.ops,
      topout: plan && plan.beats ? plan.beats.rise : null
    };
  }, N);

  if (s.err) {
    P('G-TEMPO-ARMED the buildup schedule is readable', false, s.err);
    await page.close();
    return checks;
  }
  const span = s.projectEnd - s.projectStart;
  const step = [];
  for (let i = 1; i < s.cur.length; i++) step.push((s.cur[i] - s.cur[i - 1]) / DAY);
  const maxD = Math.max(...step), minD = Math.min(...step);
  const ratio = minD > 0 ? maxD / minD : Infinity;
  const at = step.indexOf(maxD);
  const pacing = logs.filter(l => l.indexOf('§CPE_BUILDUP_PACING') >= 0).slice(-1)[0] || '(no §CPE_BUILDUP_PACING line)';

  // ── G-TEMPO-EVEN
  P('G-TEMPO-EVEN the calendar advances at a CONSTANT rate across the whole buildup',
    ratio <= 1.05,
    `maxStep=${maxD.toFixed(2)}d minStep=${minD.toFixed(2)}d ratio=${ratio === Infinity ? 'Inf (a step advanced 0 days)' : ratio.toFixed(2) + 'x'} ` +
    `(tol 1.05x) worst at u=${(at / N).toFixed(2)}-${((at + 1) / N).toFixed(2)} | spanDays=${(span / DAY).toFixed(0)} ops=${s.ops} | ${pacing}`);

  // ── G-TEMPO-DIVEIN — the reported symptom, as a number.
  const firstTenth = (s.cur[Math.round(N * 0.1)] - s.cur[0]) / span;
  P('G-TEMPO-DIVEIN the first 10% of the buildup consumes ~10% of the project calendar (the dive-in does not sprint through days)',
    Math.abs(firstTenth - 0.1) <= 0.01,
    `first10%OfFilm=${(firstTenth * 100).toFixed(2)}% of the calendar (expect 10.00%, tol +/-1.00pt) = ` +
    `${((s.cur[Math.round(N * 0.1)] - s.cur[0]) / DAY).toFixed(1)}d of ${(span / DAY).toFixed(0)}d`);

  // ── G-TEMPO-LINEAR — the whole curve, not just the endpoints.
  let worst = 0, worstAt = 0;
  for (let i = 0; i <= N; i++) {
    const dev = Math.abs(s.cur[i] - (s.projectStart + (i / N) * span));
    if (dev > worst) { worst = dev; worstAt = i / N; }
  }
  P('G-TEMPO-LINEAR cursor(u) is the straight line projectStart + u*span across the whole buildup',
    worst <= 0.005 * span,
    `maxDeviation=${(worst / DAY).toFixed(1)}d = ${(100 * worst / span).toFixed(2)}% of span (tol 0.50%) at u=${worstAt.toFixed(2)} | ` +
    `topout=${s.topout == null ? 'n/a' : s.topout.toFixed(3)}`);

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
