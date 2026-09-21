// Extract 240 real cinema-path poses (t=10s..20s @ 24fps) for HHS_Office_Federated in ONE headless
// app session — same method as probe_hospital_pose.js, just looped in-page instead of relaunching.
// Real duration confirmed: viewer/effects.js:5510 CINEMA_N_FRAMES=576, CINEMA_FPS=24 -> 24s total.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const fs = require('fs'), path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const DUR = 24, FPS = 24, T0 = 0, NFRAMES = 576;
const OUT = path.join(__dirname, 'out', 'poses_hhs_t0_24_full.json');
(async () => {
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage(); await p.setViewport({ width: 1280, height: 720 });
  const logs = []; p.on('console', m => logs.push(m.text())); p.on('pageerror', e => logs.push('PAGEERROR ' + e.message));
  await p.goto('http://127.0.0.1:8402/viewer/viewer.html?db=/buildings/HHS_Office_Federated_extracted.db', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForFunction(() => window.APP && window.APP.cinemaPathPlan, { timeout: 180000 });
  await sleep(12000);
  await p.waitForFunction(() => { try { const r = window.APP.dbQuery('SELECT COUNT(*) FROM element_transforms'); return r && r[0][0] > 0; } catch (e) { return false; } }, { timeout: 120000, polling: 2000 });
  const want = await p.evaluate(() => (window.APP.dbQuery('SELECT DISTINCT building FROM elements_meta') || []).map(r => r[0]));
  for (const bb of want) {
    await p.evaluate(x => { try { window.APP.streamBuilding(x); } catch (e) {} }, bb);
    let prev = -1; for (let i = 0; i < 60; i++) { const n = await p.evaluate(() => Object.keys(window.APP.guidMap).length); if (n === prev && n > 0) break; prev = n; await sleep(2000); }
  }
  const poses = await p.evaluate((dur, fps, t0, n) => {
    const plan = window.APP.cinemaPathPlan(dur);
    const out = [];
    for (let k = 0; k < n; k++) {
      const t = t0 + k / fps, tNorm = t / dur;
      const q = plan.poseAt(tNorm);
      out.push({ t: +t.toFixed(5), tNorm: +tNorm.toFixed(6), x: q.x, y: q.y, z: q.z, tx: q.tx, ty: q.ty, tz: q.tz });
    }
    return out;
  }, DUR, FPS, T0, NFRAMES);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(poses));
  console.log('§HHS_SEQ_POSES_FULL frames=' + poses.length + ' first=' + JSON.stringify(poses[0]) + ' last=' + JSON.stringify(poses[poses.length - 1]) + ' savedTo=' + OUT);
  console.log(logs.filter(l => /error|ERROR/i.test(l)).slice(0, 20).join('\n'));
  await b.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
