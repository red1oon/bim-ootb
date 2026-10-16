// WITNESS — §CPE_BUILDUP_TOPOUT: the ending beats dwell on the FINISHED building.
// Spec: bim-compiler prompts/CINEMA_PATH_EDITOR.md §CPE_BUILDUP_TOPOUT (2026-08-02).
//
// THE DEFECT THIS PROVES OR DISPROVES (user, on the 1761-frame Hospital bake of 2026-08-02:
// "the top roof solar panels never gets to be shown - it stops shy of the last task"):
//   §CPE_BUILDUP frame=1740/1761 t=0.989 placed=62700/63421
//   §CPE_BUILDUP frame=1760/1761 t=1.000 placed=63421/63421
// The buildup rode the film fraction 1:1, so 100% completion coincided with the film's LAST FRAME by
// construction — the final 721 elements (the solar panels among them) landed inside the closing
// orbit's last ~1.4s. No pacing tweak can fix a completion point pinned to the final frame; the
// completion point itself must move to the closing-orbit boundary (plan.beats.rise).
//
//   G-BT-1  RED by construction on the old mapping (identity: t=1 is the only completion point);
//           GREEN: buildupTAt(beats.rise) === 1 — the buildup is COMPLETE when the orbit begins,
//           and stays complete to the end (monotone, clamped).
//   G-BT-2  work pacing survives: the remap is linear on [0, rise] — buildupTAt(rise/2) ≈ 0.5, so
//           §CPE_BUILDUP_WORK_PACED's even element rate is compressed, not distorted.
//   G-BT-3  DEGRADE, DON'T DISABLE: a plan with no beats (older cache / re-opened authored path)
//           gets the fallback topout 0.92 — never 1.0, so the dwell survives a stale plan.
//   G-BT-4  one implementation: the same APP.buildupTAt the bake uses is what the preview calls —
//           asserted by exposure + by remapping THE REAL PLAN's rise to exactly 1.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');

const PORT = process.env.PORT || 8443;
const BLD = process.env.BLD || 'Hospital';
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new', protocolTimeout: 900000,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 700 });
  const logs = [];
  page.on('console', m => logs.push(m.text()));
  await page.goto(`http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db`,
    { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.APP && window.APP.dbQuery, { timeout: 300000 });
  await sleep(9000);
  await page.waitForFunction(() => {
    try { const r = window.APP.dbQuery('SELECT COUNT(*) FROM element_transforms'); return r && r[0][0] > 0; }
    catch (e) { return false; }
  }, { timeout: 300000, polling: 3000 });

  const res = await page.evaluate(async () => {
    const A = window.APP, out = { err: null };
    try {
      if (typeof A.loadNavigate === 'function' && !A._navigateLoaded) { try { await A.loadNavigate(); } catch (e) {} }
      out.exposed = typeof A.buildupTAt === 'function' && typeof A.buildupTopoutU === 'function';
      if (!out.exposed) return out;
      const plan = A.cinemaPathPlan(40);
      out.beats = plan.beats;
      out.top = A.buildupTopoutU(plan);
      out.atRise = A.buildupTAt(plan.beats.rise, plan);
      out.atEnd = A.buildupTAt(1, plan);
      out.atHalfRise = A.buildupTAt(plan.beats.rise / 2, plan);
      out.monotone = true;
      let prev = -1;
      for (let i = 0; i <= 100; i++) {
        const v = A.buildupTAt(i / 100, plan);
        if (v < prev - 1e-12) out.monotone = false;
        prev = v;
      }
      out.noPlanTop = A.buildupTopoutU(null);
      out.noPlanAtTop = A.buildupTAt(out.noPlanTop.u, null);
      out.noPlanAtEnd = A.buildupTAt(1, null);
    } catch (e) { out.err = String(e && e.message); }
    return out;
  });

  let all = true;
  const P = (name, ok, detail) => {
    all = all && ok;
    console.log(`${ok ? '✅' : '❌'} ${name}  ${detail}`);
  };
  if (res.err || !res.exposed) {
    console.log('❌ setup: ' + (res.err || 'APP.buildupTAt / buildupTopoutU not exposed (RED on main)'));
    await browser.close(); process.exit(1);
  }
  P('G-BT-1 the buildup is COMPLETE at the closing-orbit boundary and stays complete',
    Math.abs(res.atRise - 1) < 1e-9 && Math.abs(res.atEnd - 1) < 1e-9 && res.monotone,
    `beats.rise=${res.beats.rise.toFixed(3)} -> buildupT=${res.atRise} · t=1 -> ${res.atEnd} · monotone=${res.monotone}` +
    ` (old mapping completes only at t=1.000 — the defect, by construction)`);
  P('G-BT-2 work pacing is compressed, not distorted (linear on [0, rise])',
    Math.abs(res.atHalfRise - 0.5) < 1e-9,
    `buildupTAt(rise/2)=${res.atHalfRise}`);
  P('G-BT-3 a plan with no beats degrades to the 0.92 fallback, never to 1.0',
    res.noPlanTop.u === 0.92 && /fallback/.test(res.noPlanTop.src) &&
      Math.abs(res.noPlanAtTop - 1) < 1e-9 && Math.abs(res.noPlanAtEnd - 1) < 1e-9,
    `topout=${res.noPlanTop.u} src=${res.noPlanTop.src}`);
  P('G-BT-4 the real plan resolves its topout from its own beats (src=plan.beats.rise)',
    res.top.src === 'plan.beats.rise' && Math.abs(res.top.u - res.beats.rise) < 1e-9,
    `topoutU=${res.top.u.toFixed(3)} src=${res.top.src}`);

  console.log(all ? 'ALL GATES PASS' : 'GATES FAILED');
  await browser.close();
  process.exit(all ? 0 : 1);
})().catch(e => { console.error('witness crashed: ' + e.message); process.exit(1); });
