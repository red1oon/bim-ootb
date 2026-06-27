// W-BONSAI-PLACE — placement correctness witness (operability leg 1). prompts/BONSAI_KERNEL_RESEARCH.md.
// CLAIM: an inserted library component now lands CORRECTLY — SEATED on the ground (its bbox bottom at the
// placement elevation, not half-buried), ROTATABLE before placing (R / Rotate button yaws it 90°, footprint
// turns), and ELEVATABLE (placed at a chosen Z) — each a signed GEOM_INSERT, with a live ghost preview while
// aiming. Fixes the "door won't stand right / can't aim it" operability gap. Drives the REAL UI handlers.
const http = require('http'), fs = require('fs'), path = require('path');
const VIEWER = path.join('/tmp/wt-bonsai', 'viewer');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.map': 'application/json' };
const server = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/modeller.html';
  fs.readFile(path.join(VIEWER, p), (e, b) => {
    if (e) { r.writeHead(404); r.end('404 ' + p); return; }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); r.end(b);
  });
});
(async () => {
  await new Promise(r => server.listen(0, r)); const port = server.address().port;
  const br = await puppeteer.launch({ headless: 'new',
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const pg = await br.newPage();
  pg.on('console', m => { const t = m.text(); if (/^§(OPLOG|MODELLER|LIBRARY|KRN|BONSAI)/.test(t)) console.log('  ' + t); });
  pg.on('pageerror', e => console.log('  ERR ' + String(e).slice(0, 200)));
  await pg.goto(`http://localhost:${port}/modeller.html?place=demo`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('window.__placeDone === true', { timeout: 120000 }).catch(() => console.log('  ✗ timeout'));

  const x = await pg.evaluate(() => window.__placeResult || {}).catch(e => ({ err: String(e) }));
  const J = o => JSON.stringify(o);
  console.log('  §BONSAI-PLACE ghost=' + x.ghost + ' seated=' + J(x.seated) + ' rotDeg=' + x.rotDeg + ' rotated=' + J(x.rotated) +
    ' elevated=' + J(x.elevated) + ' inserts=' + x.inserts + ' signed=' + x.signed + ' verify=' + x.verify + (x.error ? ' ERROR=' + x.error : ''));
  await br.close(); server.close();

  const S = x.seated || {}, R = x.rotated || {}, E = x.elevated || {};
  const seated = S.zmin != null && Math.abs(S.zmin) <= 0.02 && S.zmax > 2.0 && S.zmax < 2.2;   // sits ON ground, full height (NOT -1.05..1.05)
  const footprintWideX = S.xext > S.yext + 0.5;                                                // door faces +X by default (W=1.78 >> T=0.15)
  const rotated = x.rotDeg === 90 && R.yext > R.xext + 0.5;                                     // after 90° yaw the footprint turns (now wide in Y)
  const elevated = E.zmin != null && Math.abs(E.zmin - 3) <= 0.02 && E.zmax > 5.0 && E.zmax < 5.2;  // seated at elevation 3m
  const allSigned = x.inserts === 3 && x.signed === 3 && x.verify === true;
  const ghost = x.ghost === true;
  const pass = seated && footprintWideX && rotated && elevated && allSigned && ghost;
  console.log('  §BONSAI-PLACE VERDICT ' + (pass ? 'PASS' : 'FAIL') +
    ' — groundSeated=' + seated + ' correctFootprint=' + footprintWideX + ' rotateBeforePlace=' + rotated +
    ' elevation=' + elevated + ' threeSignedInserts=' + allSigned + ' ghostPreview=' + ghost);
  console.log('── W-BONSAI-PLACE ' + (pass ? 'PASS' : 'FAIL') + ' ──');
  process.exit(pass ? 0 : 1);
})();
