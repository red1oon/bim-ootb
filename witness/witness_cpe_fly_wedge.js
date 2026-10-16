// WITNESS — §CPE_FLY_WEDGE. Preview must survive pause → band-row click → play.
// Spec: bim-compiler prompts/CINEMA_PATH_EDITOR.md §CPE_FLY_WEDGE.
//
// THE DEFECT (user, 2026-08-07): "sometimes it hangs after some round 2 of setting stick, when going
// back to preview it does not play, workaround is easy just refresh and reopen the saved path."
// `_frameBand` (row-click fly-to-band ease) bumped ++_state.flyId — the SAME generation counter the
// rehearsal's step() checks — so a PAUSED rehearsal was killed dead by any row click, while
// flying/flyPaused stayed true. Every later play click took the "resume" branch, whose stale-flyId
// guard silently no-ops. Logs said "resumed"; nothing moved; only a refresh recovered.
//
//   G-WEDGE-PLAY     play starts: scrubTn advances within 1.5s of the first play click.
//   G-WEDGE-REVIVE   pause → band-row click (the killer) → play: scrubTn ADVANCES again within
//                    1.5s. Pre-fix this FAILS: state says flying+paused, playhead frozen.
//   G-WEDGE-STATE    after the revive, _flyState() reports flying && !paused (an honest machine,
//                    not a wedged one).
//
// EVIDENCE: _flyState() test hook + _state.scrubTn motion + §-logs. No screenshots (FUNDAMENTAL LAW).
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');

const PORT = process.env.PORT || 8470;
const BLD = process.env.BLD || 'Duplex';
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new', protocolTimeout: 900000,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage();
  const cdp = await page.createCDPSession();
  await cdp.send('Network.enable');
  await cdp.send('Network.setBypassServiceWorker', { bypass: true });
  await page.setViewport({ width: 1483, height: 769, deviceScaleFactor: 1.25 });
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

  // eye ON — the scrub transport (play button) is the Eye's widget
  await page.click('#cpe-vf-toggle');
  await sleep(800);

  const checks = [];
  const P = (n, ok, d) => checks.push({ n, ok, d });
  const scrubTn = () => page.evaluate(() => window.APP.cinemaPathEditor._flyState()
    ? (window.APP.cinemaPathEditor._scrubTnForTest ? window.APP.cinemaPathEditor._scrubTnForTest() : null) : null);
  // scrubTn via DOM playhead if no hook: read _state through _flyState's u + the scrub head position
  const headPct = () => page.evaluate(() => {
    const h = document.getElementById('cpe-scrub-head');
    const t = document.getElementById('cpe-scrub-track');
    if (!h || !t) return null;
    const hr = h.getBoundingClientRect(), tr = t.getBoundingClientRect();
    return (hr.left + hr.width / 2 - tr.left) / Math.max(1, tr.width);
  });
  const flySt = () => page.evaluate(() => window.APP.cinemaPathEditor._flyState());

  // ── G-WEDGE-PLAY: first play advances the playhead
  const h0 = await headPct();
  await page.click('#cpe-scrub-play');
  await sleep(1500);
  const h1 = await headPct();
  P('G-WEDGE-PLAY first play advances the playhead',
    h0 != null && h1 != null && h1 > h0 + 0.008,
    `head ${h0?.toFixed(3)} -> ${h1?.toFixed(3)} state=${JSON.stringify(await flySt())}`);

  // ── pause, then the killer: click band row 1 (frame=true -> _frameBand)
  await page.click('#cpe-scrub-play');   // pause
  await sleep(300);
  await page.evaluate(() => { document.querySelectorAll('#cpe-rows > div')[1].click(); });
  await sleep(700);                       // let the 420ms frame-fly finish

  // ── G-WEDGE-REVIVE: play again — must move
  const h2 = await headPct();
  await page.click('#cpe-scrub-play');
  await sleep(2500);
  const h3 = await headPct();
  const st3 = await flySt();
  P('G-WEDGE-REVIVE play after pause + band-row click advances the playhead (pre-fix: frozen forever)',
    h2 != null && h3 != null && h3 > h2 + 0.008,   // frozen = +0.000 exactly; headless swiftshader plays a buildup rehearsal slowly, so the bar is 'strictly moving', not 'fast'
    `head ${h2?.toFixed(3)} -> ${h3?.toFixed(3)} state=${JSON.stringify(st3)} ` +
    `wedgeLog=${logs.some(l => l.indexOf('§CPE_FLY_WEDGE') === 0)} ` +
    `resumeLogs=${logs.filter(l => l.indexOf('§CPE_SCRUB_PLAY') === 0).length}`);

  // ── G-WEDGE-STATE: machine is honest after revive
  P('G-WEDGE-STATE after revive the state machine says flying && !paused',
    !!(st3 && st3.flying && !st3.paused),
    `state=${JSON.stringify(st3)}`);

  await browser.close();
  console.log('--- transport §-log sequence ---');
  logs.filter(l => /§CPE_SCRUB_PLAY|§CPE_SCRUB_INPUT_TRACE|§CPE_PREVIEW |§CPE_SELECT|§CPE_FLY_WEDGE|§CPE_PREVIEW done/.test(l))
    .forEach(l => console.log('  ' + l));
  let allPass = true;
  console.log(`\n${'='.repeat(78)}\n${BLD}  §CPE_FLY_WEDGE\n${'='.repeat(78)}`);
  checks.forEach(c => { if (!c.ok) allPass = false; console.log(`  ${c.ok ? 'PASS' : 'FAIL'}  ${c.n}\n          ${c.d}`); });
  console.log(allPass ? '\nWITNESS PASS' : '\nWITNESS FAIL');
  process.exit(allPass ? 0 : 1);
})();
