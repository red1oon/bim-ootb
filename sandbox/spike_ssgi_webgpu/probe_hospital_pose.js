// One-shot probe: extract the REAL app's cinemaPathPlan(realDuration).poseAt(tNorm) camera poses
// for Hospital at t=22/36/48s. Same pattern as probe_night_still.js (repo root) — real app, real
// function, no reimplemented math. Reads bim-ootb read-only via the already-running static server
// on :8402. Real duration confirmed from viewer/effects.js: CINEMA_N_FRAMES=576, CINEMA_FPS=24 -> 24s.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const DUR = 24; // CINEMA_N_FRAMES/CINEMA_FPS = 576/24, confirmed in effects.js:5510
const TS = [22, 36, 48];
(async () => {
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage(); await p.setViewport({ width: 1280, height: 720 });
  const logs = []; p.on('console', m => logs.push(m.text())); p.on('pageerror', e => logs.push('PAGEERROR ' + e.message));
  await p.goto('http://127.0.0.1:8402/viewer/viewer.html?db=/buildings/Hospital_extracted.db', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForFunction(() => window.APP && window.APP.cinemaPathPlan, { timeout: 180000 });
  await sleep(12000);
  await p.waitForFunction(() => { try { const r = window.APP.dbQuery('SELECT COUNT(*) FROM element_transforms'); return r && r[0][0] > 0; } catch (e) { return false; } }, { timeout: 120000, polling: 2000 });
  const want = await p.evaluate(() => (window.APP.dbQuery('SELECT DISTINCT building FROM elements_meta') || []).map(r => r[0]));
  for (const bb of want) {
    await p.evaluate(x => { try { window.APP.streamBuilding(x); } catch (e) {} }, bb);
    let prev = -1; for (let i = 0; i < 60; i++) { const n = await p.evaluate(() => Object.keys(window.APP.guidMap).length); if (n === prev && n > 0) break; prev = n; await sleep(2000); }
  }
  const out = {};
  for (const t of TS) {
    const tNorm = t / DUR;
    const pose = await p.evaluate((dur, tn) => { const q = window.APP.cinemaPathPlan(dur).poseAt(tn); return { x: q.x, y: q.y, z: q.z, tx: q.tx, ty: q.ty, tz: q.tz }; }, DUR, tNorm);
    out[t] = { tNorm: +tNorm.toFixed(4), pose };
  }
  console.log('§HOSPITAL_POSES ' + JSON.stringify(out));
  console.log(logs.filter(l => /error|ERROR/i.test(l)).slice(0, 20).join('\n'));
  await b.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
