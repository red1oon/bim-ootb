// W-ROUTEWALK-FIXTURES-COLOUR-LIVE — the 23 SH MEP fixtures render in DISCIPLINE colour, IN the real modeller.
// CLAIM: driving ?routewalk=sh, autoRouteMEP places the 23 fixtures as signed GEOM_INSERT box proxies, each with a
// persisted parameters.color = rgbaHex(f.rgba). After the authoritative scrubTo re-fold, every fixture MESH in the
// BonsaiAuthored group carries its discipline colour (NOT the grey default) — proving the colour survives the DB
// round-trip + history-replay fold. Reads window.__routewalkShResult (page self-test) + a GL pixel-lit sanity.
const http = require('http'), fs = require('fs'), path = require('path');
const VIEWER = path.resolve(__dirname, '..');   // this file lives in <viewer>/tests/ → serve its parent
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.map': 'application/json',
  '.db': 'application/octet-stream' };
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
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
           '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const pg = await br.newPage();
  pg.on('console', m => { const t = m.text(); if (/^§(RW|MODELLER|OPLOG)/.test(t)) console.log('  ' + t); });
  pg.on('pageerror', e => console.log('  ERR ' + String(e).slice(0, 300)));
  await pg.goto(`http://localhost:${port}/modeller.html?routewalk=sh`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('window.__routewalkShDone === true', { timeout: 180000 })
    .catch(() => console.log('  ✗ timeout waiting for __routewalkShDone'));

  const probe = await pg.evaluate(() => {
    const res = window.__routewalkShResult || {};
    // pull the actual material colours of the fixture meshes for the §-log (independent of the page self-test)
    const O = window.Bonsai.oplog, grp = window.Bonsai.group();
    const meshByFid = {}; if (grp) grp.children.forEach(m => { if (m.userData && m.userData.featureId != null) meshByFid[m.userData.featureId] = m; });
    const fxOps = O._geomOps().filter(o => o.op_type === 'GEOM_INSERT' && o.parameters && o.parameters.color != null);
    const hexes = {}; let grey = 0;
    fxOps.forEach(o => { const m = meshByFid[o.id]; const h = (m && m.material && m.material.color) ? m.material.color.getHex() : -1; hexes[h] = (hexes[h] || 0) + 1; if (h === 0x9fb4c8) grey++; });
    let litPct = 0;
    try { const r = window.A.renderer; r.render(window.A.scene, window.A.camera); const gl = r.getContext();
      const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight; const px = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px); let lit = 0;
      for (let i = 0; i < px.length; i += 4) { if (px[i] > 40 || px[i + 1] > 44 || px[i + 2] > 52) lit++; }
      litPct = +(100 * lit / (w * h)).toFixed(1); } catch (e) {}
    return { res, meshHexes: Object.keys(hexes).map(k => (k < 0 ? 'none' : (+k).toString(16)) + ':' + hexes[k]).join(' '), greyFixtures: grey, litPct };
  }).catch(e => ({ err: String(e) }));

  const x = probe.res || {};
  console.log('  §SH fixtures=' + x.fixtures + ' fixtureOps=' + x.fixtureOps + ' hasELEC=' + x.hasELEC + ' hasACMV=' + x.hasACMV +
    ' noWetRoom=' + x.noWetRoom + ' verify=' + x.verify + ' coloured=' + x.colouredFixtures + ' miscoloured=' + x.miscolouredFixtures +
    ' distinctColours=' + x.distinctColours + (x.error ? ' ERROR=' + x.error : ''));
  console.log('  §SH-MESH meshHexes=[' + probe.meshHexes + '] greyFixtures=' + probe.greyFixtures + ' litPixels=' + probe.litPct + '%');

  await br.close(); server.close();

  const placed = x.fixtures === 23 && x.fixtureOps === 23;
  const coloured = x.colouredFixtures === 23 && x.miscolouredFixtures === 0;   // every fixture mesh carries its colour
  const readable = x.distinctColours >= 3 && probe.greyFixtures === 0;          // ≥3 disciplines distinct, none left grey
  const chainOK = x.verify === true;
  const drew = probe.litPct > 0.5;
  const pass = placed && coloured && readable && chainOK && drew && x.pass === true;
  console.log('  §SH VERDICT ' + (pass ? 'PASS' : 'FAIL') + ' — placed=' + placed + ' allColoured=' + coloured +
    ' readableDistinct=' + readable + ' chainVerifies=' + chainOK + ' drew=' + drew + ' pageSelfTest=' + x.pass);
  console.log('── W-ROUTEWALK-FIXTURES-COLOUR-LIVE ' + (pass ? 'PASS' : 'FAIL') + ' ──');
  process.exit(pass ? 0 : 1);
})();
