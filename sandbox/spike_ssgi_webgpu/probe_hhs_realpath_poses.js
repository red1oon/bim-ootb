// Extract the REAL authored cinema_path poses for HHS_Office_Federated — the gap §133 names: the
// saved path (61.04 s, 4 bands, cinema_path table in HHS_Office_Federated_silent.db) has only ever
// been sampled at 4 poses (t=0/10/30/61). out/hhs_full_t0_24.mp4 used the GENERIC 24 s formula, not
// this path.
//
// Method — no re-implementation of the loader anywhere:
//   1. load the real viewer on _silent.db (the ONLY db with a cinema_path table; geometry identical
//      to _extracted.db — 6839 joined rows, same AVG centre to 2 cm, verified 2026-09-22),
//   2. a.cinemaPathPlan(60) once to make _cpeLoadFromDb (effects.js:9180) stage the authored ov,
//   3. read it back with a._getCinemaPathEdit(),
//   4. plan ONCE at its own _total and sample poseAt(tNorm) for every frame — one plan for all
//      frames, so §CPE_PREVIEW_DIVERGENCE (the plan reads the live camera/controls.target) cannot
//      make frame k and frame k+1 disagree.
// poseAt takes tNorm in 0..1 (effects.js:8187), NOT seconds.
// Usage: node probe_hhs_realpath_poses.js [--fps 24]
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const fs = require('fs'), path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const argv = process.argv.slice(2);
const FPS = +((argv.indexOf('--fps') >= 0 && argv[argv.indexOf('--fps') + 1]) || 24);
const DBFILE = 'HHS_Office_Federated_silent.db';
(async () => {
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage(); await p.setViewport({ width: 1280, height: 720 });
  const logs = []; p.on('console', m => logs.push(m.text())); p.on('pageerror', e => logs.push('PAGEERROR ' + e.message));
  await p.goto('http://127.0.0.1:8402/viewer/viewer.html?db=/buildings/' + DBFILE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForFunction(() => window.APP && window.APP.cinemaPathPlan, { timeout: 180000 });
  await sleep(12000);
  await p.waitForFunction(() => { try { const r = window.APP.dbQuery('SELECT COUNT(*) FROM element_transforms'); return r && r[0][0] > 0; } catch (e) { return false; } }, { timeout: 120000, polling: 2000 });
  const want = await p.evaluate(() => (window.APP.dbQuery('SELECT DISTINCT building FROM elements_meta') || []).map(r => r[0]));
  for (const bb of want) {
    await p.evaluate(x => { try { window.APP.streamBuilding(x); } catch (e) {} }, bb);
    let prev = -1; for (let i = 0; i < 60; i++) { const n = await p.evaluate(() => Object.keys(window.APP.guidMap).length); if (n === prev && n > 0) break; prev = n; await sleep(2000); }
  }
  const res = await p.evaluate((fps) => {
    const a = window.APP;
    try { a.cinemaPathPlan(60); } catch (e) {}          // lazy-triggers _cpeLoadFromDb, same as cinema_maxq.js:2583
    const st = (a._getCinemaPathEdit && a._getCinemaPathEdit()) || null;
    if (!st) return { error: 'no staged cinema path — _cpeLoadFromDb found no cinema_path table' };
    const total = st._total;
    const n = Math.round(total * fps);
    const plan = a.cinemaPathPlan(total, st);           // ONE plan, sampled n times
    const poses = [];
    for (let k = 0; k < n; k++) {
      const t = k / fps, tNorm = Math.min(1, t / total);
      const q = plan.poseAt(tNorm);
      poses.push({ t: +t.toFixed(5), tNorm: +tNorm.toFixed(6), x: q.x, y: q.y, z: q.z, tx: q.tx, ty: q.ty, tz: q.tz });
    }
    return { total: total, bands: st.bands ? st.bands.length : 0,
             diveSec: st.diveSec, spinSec: st.spinSec, outSec: st.outSec, riseSec: st.riseSec,
             modelOffset: { x: a.modelOffset.x, y: a.modelOffset.y, z: a.modelOffset.z },
             camAtPlan: { x: a.camera.position.x, y: a.camera.position.y, z: a.camera.position.z },
             poses: poses };
  }, FPS);
  if (res.error) { console.log('§HHS_REALPATH_POSES FAIL ' + res.error); await b.close(); process.exit(3); }
  const OUT = path.join(__dirname, 'out', 'poses_hhs_realpath_' + FPS + 'fps.json');
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(res.poses));
  console.log('§HHS_REALPATH_POSES frames=' + res.poses.length + ' fps=' + FPS + ' total=' + res.total.toFixed(4) + 's bands=' + res.bands +
    ' dive=' + res.diveSec.toFixed(2) + ' spin=' + res.spinSec.toFixed(2) + ' out=' + res.outSec.toFixed(2) + ' rise=' + res.riseSec.toFixed(2) +
    ' modelOffset=' + JSON.stringify(res.modelOffset) + ' camAtPlan=' + JSON.stringify(res.camAtPlan) +
    ' first=' + JSON.stringify(res.poses[0]) + ' last=' + JSON.stringify(res.poses[res.poses.length - 1]) + ' savedTo=' + OUT);
  console.log(logs.filter(l => /CINEMA_PATH_RESTORE|CPE_|error|ERROR/i.test(l)).slice(0, 20).join('\n'));
  await b.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
