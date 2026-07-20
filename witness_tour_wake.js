// WITNESS — TOUR_WALKMODE_IDLE_PARK_STUCK.md fix verification.
// ISSUE IT PROVES/DISPROVES: _startFlyTour() sets A.walkMode=true but never called markDirty()
// after the async route-planning gap, so a self-parked render loop never restarted and the camera
// never moved despite a fully-built tour. Fix adds markDirty() right after walkMode=true.
//   PASS = starting from a genuinely idle (parked) loop, after toggling Fly Tour, the camera's world
//   position differs across samples taken a few seconds apart.
//   FAIL = camera position is identical across all samples (frozen, reproducing the reported bug).
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');

// §7 lesson (TOUR_WALKMODE_IDLE_PARK_STUCK.md): Hospital lacks the room-graph data buildTour()
// needs — it silently falls into the orbit-fly branch and never tests the walkMode path this fix
// targets. LTU_AHouse is the ONLY building with direct evidence of reaching that path. Default it.
const PORT = process.env.PORT || 8410;
const BLD = process.env.BLD || 'LTU_AHouse';

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 700 });
  const logs = [];
  page.on('console', m => logs.push(m.text()));
  page.on('pageerror', e => logs.push('PAGEERROR ' + e.message));

  let pass = false;
  try {
    const url = `http://localhost:${PORT}/viewer/viewer.html?db=/buildings/${BLD}_extracted.db`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => window.APP && window.APP.camera && window.APP.controls, { timeout: 120000 });
    await new Promise(r => setTimeout(r, 8000));
    await page.waitForFunction(() => {
      const A = window.APP;
      try { const r = A.dbQuery('SELECT COUNT(*) FROM element_transforms'); return r && r.length && r[0][0] > 0; }
      catch (e) { return false; }
    }, { timeout: 180000, polling: 2000 });

    // LTU streams 122k elements — the loop cannot park while APP.streaming keeps _awake true.
    // Drain streaming FIRST (long timeout: swiftshader is slow), THEN wait for a genuine park.
    // Poll from Node (not waitForFunction) so a mid-stream page death surfaces as a real error
    // with the last §PROGRESSIVE_FLUSH line, not a bare "Waiting failed".
    console.log('waiting for streaming to drain...');
    let drained = false;
    for (let i = 0; i < 600; i++) {                                  // up to 20 min
      const st = await page.evaluate(() => ({ s: !!window.APP.streaming })).catch(e => ({ err: e.message }));
      if (st.err) throw new Error('page died during streaming: ' + st.err);
      if (!st.s) { drained = true; break; }
      if (i % 15 === 0) {
        const fl = logs.filter(l => l.includes('§PROGRESSIVE_FLUSH')).slice(-1)[0];
        console.log('  [streaming] ' + (fl || '(no flush lines yet)'));
      }
      await new Promise(r => setTimeout(r, 2000));
    }
    if (!drained) throw new Error('streaming never drained in 20min');
    console.log('streaming drained');

    // Force genuine idle: wait for the render loop to actually self-park (reproduces the bug
    // precondition — testing while the loop happens to still be awake would be a false pass).
    console.log('waiting for §IDLE_GATE park...');
    let parked = false;
    for (let i = 0; i < 60; i++) {
      if (logs.some(l => l.includes('§IDLE_GATE park'))) { parked = true; break; }
      await new Promise(r => setTimeout(r, 1000));
    }
    console.log('observed idle-park in logs: ' + parked);
    if (!parked) await new Promise(r => setTimeout(r, 4000)); // still likely idle by now regardless

    const p0 = await page.evaluate(() => {
      const c = window.APP.camera.position;
      return { x: c.x, y: c.y, z: c.z };
    });
    console.log('camera before tour start: ' + JSON.stringify(p0));

    await page.evaluate(() => { window.toggleFlyAround(); });

    // The tour build is async (room-graph + route planning) — wait for walkMode to actually flip
    // true. LTU route-planning (90-pt graph route, door-legality checks) is slow under swiftshader
    // + shared-machine load: give it a long leash, and surface §FLY/§TOUR progress while waiting.
    let lastLogged = 0;
    const progress = setInterval(() => {
      const fresh = logs.slice(lastLogged).filter(l => /TOUR|WALK|FLY/i.test(l));
      lastLogged = logs.length;
      if (fresh.length) console.log('  [progress] ' + fresh.join('\n  [progress] '));
    }, 10000);
    const started = await page.waitForFunction(() => window.APP.walkMode === true, { timeout: 300000 })
      .then(() => true).catch(() => false);
    clearInterval(progress);
    if (!started) {
      console.log('TOUR/WALK/FLY related logs since toggle:\n' +
        logs.filter(l => /TOUR|WALK|FLY|flyActive|walkMode/i.test(l)).slice(-30).join('\n'));
      console.log('flyActive=' + await page.evaluate(() => !!window.APP.flyActive) +
        ' walkMode=' + await page.evaluate(() => !!window.APP.walkMode));
    }
    console.log('walkMode became true: ' + started);

    const samples = [p0];
    for (let i = 0; i < 4; i++) {
      await new Promise(r => setTimeout(r, 2000));
      samples.push(await page.evaluate(() => {
        const c = window.APP.camera.position;
        return { x: c.x, y: c.y, z: c.z };
      }));
    }
    console.log('camera samples: ' + JSON.stringify(samples));

    const moved = samples.some((s, i) => i > 0 &&
      (Math.abs(s.x - samples[0].x) > 0.001 || Math.abs(s.y - samples[0].y) > 0.001 || Math.abs(s.z - samples[0].z) > 0.001));

    pass = started && moved;
    console.log(pass ? 'PASS — camera moved after Fly Tour toggle from an idle state'
                      : 'FAIL — camera never moved (' + JSON.stringify(samples) + ')');

    const errs = logs.filter(l => l.startsWith('PAGEERROR'));
    if (errs.length) { console.log('PAGE ERRORS:\n' + errs.join('\n')); pass = false; }
  } catch (e) {
    console.log('CRASH: ' + (e.stack || e.message));
    console.log('last 40 page-log lines:\n' + logs.slice(-40).join('\n'));
    pass = false;
  } finally {
    try { await page.close(); } catch (e) {}
    await browser.close();
  }
  process.exit(pass ? 0 : 1);
})();
