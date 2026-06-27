// W-XRAY-REVEAL-LIVE — step D X-ray highlight-through reveal, IN the real modeller.
// CLAIM: driving ?routewalk=xray, dropping SH places structure + 23 colour-coded MEP fixtures, then toggling X-ray
// turns the structural shell to GLASS (near-zero opacity) while every MEP fixture GLOWS through it in its discipline
// colour (emissive == colour, depthTest off, renderOrder on top). Toggling OFF re-folds the signed log → true
// materials restored (structure opaque, fixtures keep their colour, no emissive). Mirror of the Viewer ghostglass
// glass→glow doctrine, applied to the op-log-native authored group. GL pixel-lit confirms it actually draws.
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
  pg.on('console', m => { const t = m.text(); if (/^§(RW|MODELLER)/.test(t)) console.log('  ' + t); });
  pg.on('pageerror', e => console.log('  ERR ' + String(e).slice(0, 300)));
  await pg.goto(`http://localhost:${port}/modeller.html?routewalk=xray`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('window.__xrayDone === true', { timeout: 180000 })
    .catch(() => console.log('  ✗ timeout waiting for __xrayDone'));

  // Re-apply X-ray ON for the pixel probe (the page self-test left it OFF after the restore check).
  const probe = await pg.evaluate(async () => {
    const res = window.__xrayResult || {};
    let litPct = 0;
    try { await window.__xrayReveal(true);
      const r = window.A.renderer; r.render(window.A.scene, window.A.camera); const gl = r.getContext();
      const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight; const px = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px); let lit = 0;
      for (let i = 0; i < px.length; i += 4) { if (px[i] > 40 || px[i + 1] > 44 || px[i + 2] > 52) lit++; }
      litPct = +(100 * lit / (w * h)).toFixed(1); } catch (e) {}
    return { res, litPct };
  }).catch(e => ({ err: String(e) }));

  const x = probe.res || {};
  console.log('  §XRAY fixtures=' + x.fixtures + ' glass=' + x.glass + ' glow=' + x.glow +
    ' glassOK=' + x.glassOK + ' glowOK=' + x.glowOK + ' glowColourOK=' + x.glowColourOK + ' shineThrough=' + x.shineThrough +
    ' structureRestored=' + x.structureRestored + ' stillGlowing=' + x.stillGlowing +
    ' fixturesColouredAfter=' + x.fixturesColouredAfter + ' verify=' + x.verify +
    ' litPixels=' + probe.litPct + '%' + (x.error ? ' ERROR=' + x.error : ''));

  await br.close(); server.close();

  const placed = x.fixtures === 23;
  const glassed = x.glass >= 50 && x.glassOK === x.glass;                       // shell went to glass
  const glowing = x.glow === 23 && x.glowOK === 23 && x.glowColourOK === 23;     // every fixture glows in its colour
  const through = x.shineThrough === 23;                                         // glow shines through (depthTest off, on top)
  const restored = x.structureRestored === x.glass && x.stillGlowing === 0 && x.fixturesColouredAfter === 23;
  const chainOK = x.verify === true;
  const drew = probe.litPct > 0.5;
  const pass = placed && glassed && glowing && through && restored && chainOK && drew && x.pass === true;
  console.log('  §XRAY VERDICT ' + (pass ? 'PASS' : 'FAIL') + ' — placed=' + placed + ' shellGlass=' + glassed +
    ' fixturesGlow=' + glowing + ' shineThrough=' + through + ' restoredOnOff=' + restored + ' chainVerifies=' + chainOK +
    ' drew=' + drew + ' pageSelfTest=' + x.pass);
  console.log('── W-XRAY-REVEAL-LIVE ' + (pass ? 'PASS' : 'FAIL') + ' ──');
  process.exit(pass ? 0 : 1);
})();
