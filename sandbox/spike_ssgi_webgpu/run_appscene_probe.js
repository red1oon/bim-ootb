// Driver for gi_appscene_probe.js — boots the real viewer on HHS, injects the probe, waits for it
// to finish, prints its report. Renders nothing to disk. No shipped file touched.
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const fs = require('fs'), path = require('path'), http = require('http');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const DB_FILE = '/buildings/HHS_Office_Federated_silent.db';
const ROOT = path.resolve(__dirname, '..', '..');
const MAIN_BUILDINGS = '/home/red1/bim-ootb/buildings';
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.wasm': 'application/wasm', '.db': 'application/octet-stream', '.json': 'application/json' };
const PORT = 8870 + Math.floor(Math.random() * 20);
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  let p2 = path.join(ROOT, u);
  if (u.startsWith('/buildings/') && !fs.existsSync(p2)) p2 = path.join(MAIN_BUILDINGS, u.slice('/buildings/'.length));
  fs.stat(p2, (e, st) => {
    if (e || !st.isFile()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p2)] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-store' });
    fs.createReadStream(p2).pipe(res);
  });
});
(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000,
    args: ['--no-sandbox', '--hide-crash-restore-bubble', '--enable-unsafe-webgpu', '--enable-features=Vulkan',
           '--ignore-gpu-blocklist', '--use-angle=gl-egl', '--window-size=1300,900'] });
  const p = await b.newPage(); await p.setViewport({ width: 1280, height: 720 });
  const logs = []; p.on('console', m => logs.push(m.text())); p.on('pageerror', e => logs.push('PAGEERROR ' + e.message));
  await p.evaluateOnNewDocument(fs.readFileSync(path.join(__dirname, 'gi_appscene_probe.js'), 'utf8'));
  await p.goto(`http://127.0.0.1:${PORT}/viewer/viewer.html?db=${DB_FILE}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForFunction(() => window.APP && window.APP.cinemaPathPlan, { timeout: 180000 });
  await sleep(12000);
  await p.waitForFunction(() => { try { const r = window.APP.dbQuery('SELECT COUNT(*) FROM element_transforms'); return r && r[0][0] > 0; } catch (e) { return false; } }, { timeout: 120000, polling: 2000 });
  for (const bb of await p.evaluate(() => (window.APP.dbQuery('SELECT DISTINCT building FROM elements_meta') || []).map(r => r[0]))) {
    await p.evaluate(x => { try { window.APP.streamBuilding(x); } catch (e) {} }, bb);
    let prev = -1; for (let i = 0; i < 60; i++) { const n = await p.evaluate(() => Object.keys(window.APP.guidMap).length); if (n === prev && n > 0) break; prev = n; await sleep(2000); }
  }
  // put the camera on a real interior pose of the authored path, so the GI number is comparable
  await p.evaluate(() => { try { const a = window.APP; a.cinemaPathPlan(60); const st = a._getCinemaPathEdit(); const pl = a.cinemaPathPlan(st._total, st); const q = pl.poseAt(10 / st._total); a.camera.position.set(q.x, q.y, q.z); a.controls.target.set(q.tx, q.ty, q.tz); a.controls.update(); } catch (e) { console.log('§POSE_FAIL ' + e.message); } });
  // release the probe only now: scene streamed AND camera posed (see the probe's own note)
  const inv = await p.evaluate(() => { let m=0,b=0,i=0,l=0; window.APP.scene.traverse(o=>{ if(o.isBatchedMesh)b++; else if(o.isInstancedMesh)i++; else if(o.isMesh)m++; if(o.isLight)l++; }); return {m,b,i,l}; });
  console.log('§APPSCENE_PRE_GO sceneInventory=' + JSON.stringify(inv));
  await p.evaluate(() => { window.__giProbeGo = true; });
  let r = null;
  for (let i = 0; i < 240; i++) { r = await p.evaluate(() => window.__giAppSceneProbe || null); if (r && (r.phase === 'done' || /fail|timeout|blocked/i.test(r.phase))) break; await sleep(1000); }
  console.log('§APPSCENE_REPORT ' + JSON.stringify(r, null, 1));
  console.log(logs.filter(l => /GI_APPSCENE|PAGEERROR|POSE_FAIL/i.test(l)).slice(0, 40).join('\n'));
  await b.close(); server.close();
})().catch(e => { console.error('FATAL', e); try { server.close(); } catch (e2) {} process.exit(1); });
