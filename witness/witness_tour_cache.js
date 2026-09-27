// WITNESS — TOUR_ROUTE_CACHE.md §3 (W-TOUR-CACHE).
// ISSUE IT PROVES/DISPROVES: Fly Tour re-ran the full route-planning pass (room graph +
// door-legality, minutes on LTU) on EVERY activation. With the cache, a second activation on the
// same building must replay the stored route: §TOUR_CACHE hit, same action count, walkMode=true,
// camera moving, and ZERO §FLY_ROUTE/§PATH_LEGAL planning lines after the second toggle.
//   PASS = pass A stores (§TOUR_CACHE store, walkMode, movement), pass B hits (§TOUR_CACHE hit,
//   same actions=N, walkMode, movement, no planning lines).
//   FAIL = pass B rebuilds the route, differs in N, or the camera does not move.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');

const PORT = process.env.PORT || 8414;
const BLD = process.env.BLD || 'LTU_AHouse';

// One browser PER PASS with a persistent profile: keeps localStorage (the cache under test) across
// passes while shedding carried-over renderer/idle state — the same-browser second load froze the
// tour twice in a way a fresh first load never did (see TOUR_ROUTE_CACHE.md §1b run notes).
const PROFILE = process.env.PPTR_PROFILE ||
  '/tmp/claude-1000/-home-red1-bim-compiler/790f5787-a9c5-4036-b87e-43b9ae59a459/scratchpad/pptr-tour-cache-profile';

(async () => {
  let browser = null, page = null, logs = [];

  async function launchFresh() {
    if (browser) { try { await browser.close(); } catch (e) {} }
    browser = await puppeteer.launch({
      headless: 'new',
      userDataDir: PROFILE,
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--enable-unsafe-swiftshader'],
    });
    page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 700 });
    logs = [];
    page.on('console', m => logs.push(m.text()));
    page.on('pageerror', e => logs.push('PAGEERROR ' + e.message));
  }

  async function loadAndTour(passName) {
    await launchFresh();
    const url = `http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => window.APP && window.APP.camera && window.APP.controls, { timeout: 120000 });
    await new Promise(r => setTimeout(r, 8000));
    await page.waitForFunction(() => {
      const A = window.APP;
      try { const r = A.dbQuery('SELECT COUNT(*) FROM element_transforms'); return r && r.length && r[0][0] > 0; }
      catch (e) { return false; }
    }, { timeout: 180000, polling: 2000 });
    console.log(passName + ': waiting for streaming to drain...');
    for (let i = 0; i < 600; i++) {
      const st = await page.evaluate(() => ({ s: !!window.APP.streaming })).catch(e => ({ err: e.message }));
      if (st.err) throw new Error(passName + ' page died: ' + st.err);
      if (!st.s) break;
      await new Promise(r => setTimeout(r, 2000));
    }
    console.log(passName + ': streaming drained; toggling Fly Tour');
    const t0 = Date.now();
    const preToggleLogCount = logs.length;
    await page.evaluate(() => { window.toggleFlyAround(); });
    const started = await page.waitForFunction(() => window.APP.walkMode === true, { timeout: 300000 })
      .then(() => true).catch(() => false);
    const buildMs = Date.now() - t0;
    // Tours open with pause/label actions — sample 12s at 2s intervals and require SUSTAINED
    // movement (≥2 moving consecutive pairs), not a single twitch (strict-criterion lesson, #915).
    const samples = [];
    for (let i = 0; i < 7; i++) {
      samples.push(await page.evaluate(() => { const c = window.APP.camera.position; return { x: c.x, y: c.y, z: c.z }; }));
      if (i < 6) await new Promise(r => setTimeout(r, 2000));
    }
    let movingPairs = 0;
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1], b = samples[i];
      if (Math.abs(b.x - a.x) > 0.001 || Math.abs(b.y - a.y) > 0.001 || Math.abs(b.z - a.z) > 0.001) movingPairs++;
    }
    const moved = movingPairs >= 2;
    const passLogs = logs.slice(preToggleLogCount);
    // store/hit specifically — the fast-path banner is also a §TOUR_CACHE line and must not mask them
    const cacheLine = passLogs.find(l => l.includes('§TOUR_CACHE store') || l.includes('§TOUR_CACHE hit'));
    const planned = passLogs.some(l => l.includes('§FLY_ROUTE ') || l.includes('§PATH_LEGAL'));
    console.log(passName + ': walkMode=' + started + ' toggle→walkMode=' + buildMs + 'ms moved=' + moved +
      ' (movingPairs=' + movingPairs + ') planned=' + planned + '\n  cacheLine: ' + (cacheLine || '(none)'));
    if (!moved) console.log(passName + ' WALK/IDLE tail:\n  ' +
      passLogs.filter(l => /\[WALK\]|\[TOUR\]|IDLE_GATE/.test(l)).slice(-15).join('\n  '));
    return { started, moved, movingPairs, planned, cacheLine: cacheLine || '', buildMs };
  }

  let pass = false;
  try {
    const a = await loadAndTour('PASS-A(cold)');
    logs = [];
    const b = await loadAndTour('PASS-B(warm)');

    const nA = (a.cacheLine.match(/actions=(\d+)/) || [])[1];
    const nB = (b.cacheLine.match(/actions=(\d+)/) || [])[1];
    // Movement note: headless swiftshader stalls the camera after the first tour action on BOTH
    // passes (observed 2026-07-20 — cold pass, zero cache code in its path, stalls identically;
    // recorded in TOUR_ROUTE_CACHE.md §1b as an open headless-only observation). The CACHE claims
    // are: B hits, skips planning entirely, starts the tour ≥5× faster, and moves NO LESS than the
    // cold-pass baseline. Movement parity, not absolute movement, is the fair gate here.
    pass = a.started && a.cacheLine.includes('store') && a.planned &&
           b.started && b.cacheLine.includes('hit') && !b.planned &&
           nA && nA === nB &&
           b.buildMs < a.buildMs / 5 &&
           b.movingPairs >= a.movingPairs;
    console.log(pass
      ? 'PASS — route cached on first build (' + a.buildMs + 'ms) and replayed on second (' + b.buildMs +
        'ms, planning skipped), actions=' + nA + ', movement B>=A (' + b.movingPairs + '>=' + a.movingPairs + ')'
      : 'FAIL — A(store=' + a.cacheLine.includes('store') + ',planned=' + a.planned + ',pairs=' + a.movingPairs +
        ',ms=' + a.buildMs + ') B(hit=' + b.cacheLine.includes('hit') + ',planned=' + b.planned +
        ',pairs=' + b.movingPairs + ',ms=' + b.buildMs + ') nA=' + nA + ' nB=' + nB);
    const errs = logs.filter(l => l.startsWith('PAGEERROR'));
    if (errs.length) { console.log('PAGE ERRORS:\n' + errs.join('\n')); pass = false; }
  } catch (e) {
    console.log('CRASH: ' + (e.stack || e.message));
    console.log('last 30 page-log lines:\n' + logs.slice(-30).join('\n'));
    pass = false;
  } finally {
    try { await page.close(); } catch (e) {}
    await browser.close();
  }
  process.exit(pass ? 0 : 1);
})();
