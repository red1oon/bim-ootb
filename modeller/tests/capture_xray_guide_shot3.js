#!/usr/bin/env node
// Final guide-shot capture. DW_FIXTURE_DOUBLE_RENDER_FINDING.md G1/G5: every DiscWalker fixture folds BOTH
// as an individual top-level mesh (generic op-log fold — a pre-existing, separately-filed bug: some of
// these fall back to cat[0], a full-height column-sized box, instead of the real measured fixture size)
// AND as a correctly-sized instance in its discipline's InstancedMesh bucket under dwRoot. Hiding the
// individual duplicates for THIS screenshot only (not a data/code change — screenshot framing only) leaves
// the correctly-sized, correctly-glowing fixtures visible, which is what X-ray is actually supposed to show.
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ROOT = path.join(__dirname, '..', '..');
const SHOTS = path.join(__dirname, 'e2e_shots');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.db': 'application/octet-stream', '.data': 'application/octet-stream' };
const server = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/modeller/modeller.html';
  fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { r.writeHead(404); r.end('404'); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Accept-Ranges': 'bytes' }); r.end(b); }); });

(async () => {
  await new Promise(r => server.listen(0, r)); const port = server.address().port;
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const pg = await br.newPage(); await pg.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 2 });
  pg.on('pageerror', e => console.log('  ERR ' + String(e).slice(0, 200)));
  await pg.goto(`http://localhost:${port}/modeller/modeller.html`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('window.__sceneReady === true && !!window.Bonsai && typeof window.discWalk==="function"', { timeout: 30000 }).catch(() => {});

  await pg.click('#b-open'); await sleep(200);
  await pg.click('#m-open-panel .mo-row[data-key="SampleCastle"]');
  await pg.waitForFunction('window.__sceneReady === true && !!window.Bonsai', { timeout: 60000 }).catch(() => {});
  await sleep(4000);
  await pg.evaluate(() => window.discWalk('ELEC', { building: 'SampleCastle' }));
  await pg.waitForFunction(() => window.__dwLastCommitDisc === 'ELEC', { timeout: 180000, polling: 250 }).catch(() => {});
  await sleep(1000);

  const info = await pg.evaluate(() => window.__xrayReveal(true));
  console.log('  xray on:', JSON.stringify(info));

  const hideInfo = await pg.evaluate(() => {
    const g = window.Bonsai.group();
    const O = window.Bonsai.oplog;
    const dwRoot = g.children.find(o => o.userData && o.userData.dwRoot);
    const dwOpIds = new Set();
    O._geomOps().forEach(o => { if (o.op_type === 'GEOM_INSERT' && o.parameters && o.parameters._dw != null) dwOpIds.add(o.id); });
    let hidden = 0;
    g.children.forEach(o => {
      if (o === dwRoot || !o.isMesh) return;
      if (dwOpIds.has(o.userData.featureId)) { o.visible = false; hidden++; }
    });
    window.A.requestRender && window.A.requestRender();
    return { hidden };
  });
  console.log('  hid duplicate fold-copies:', JSON.stringify(hideInfo));

  await pg.click('#b-fit').catch(() => {});
  await sleep(500);
  await pg.screenshot({ path: path.join(SHOTS, 'walk-fixtures-samplecastle-clean-wide.png') });

  await pg.mouse.move(950, 500);
  for (let i = 0; i < 5; i++) { await pg.mouse.wheel({ deltaY: -220 }); await sleep(120); }
  await sleep(300);
  await pg.screenshot({ path: path.join(SHOTS, 'walk-fixtures-samplecastle-clean-closer.png') });

  await br.close(); server.close();
})();
