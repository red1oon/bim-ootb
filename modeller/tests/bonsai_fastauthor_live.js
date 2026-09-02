// W-BONSAI-FASTAUTHOR — responsiveness witness (prompts/BONSAI_KERNEL_RESEARCH.md §NEXT, user feedback 2026-06-18:
// "not that instant responsiveness when clicking a door, extrude etc"). CLAIM: adding a LEAF feature renders via
// an O(1) optimistic-append (commit returns appended=true; the new mesh is authored + appended, NOT a clear-and-
// re-fold of EVERY feature through occt = the felt O(N) lag), the appended mesh is pick-selectable (featureId
// tagged, so a 3D pick / Outliner row still resolves it), a GEOM_CUT still takes the authoritative full fold
// (appended falsy, because it mutates a referenced parent), and the signed chain + history scrub stay correct
// (verify ok, signed counts all ops, scrub folds the authoritative prefix). Proves the lag is fixed with NO
// correctness regression. Console proof: leaf adds emit "§BONSAI author" (single-op) not "§BONSAI chain" (refold-all).
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
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
           '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const pg = await br.newPage();
  // Track which fold path each interaction took: single-op "author" (O(1) append) vs "chain" (refold-all).
  let authorLines = 0, chainLines = 0;
  pg.on('console', m => {
    const t = m.text();
    if (/^§BONSAI author /.test(t)) authorLines++;
    if (/^§BONSAI chain /.test(t)) chainLines++;
    if (/^§(OPLOG|MODELLER|BONSAI)/.test(t)) console.log('  ' + t);
  });
  pg.on('pageerror', e => console.log('  ERR ' + String(e).slice(0, 300)));
  await pg.goto(`http://localhost:${port}/modeller.html?fastauthor=demo`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('window.__fastDone === true', { timeout: 120000 })
    .catch(() => console.log('  ✗ timeout waiting for __fastDone'));

  const probe = await pg.evaluate(() => {
    const res = window.__fastResult || {};
    const g = window.A && window.A.scene && window.A.scene.getObjectByName('BonsaiAuthored');
    const meshes = g ? g.children.filter(o => o.isMesh).length : 0;
    const r = window.A.renderer; r.render(window.A.scene, window.A.camera);
    const gl = r.getContext(); const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const px = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let lit = 0; for (let i = 0; i < px.length; i += 4) { if (px[i] > 40 || px[i + 1] > 44 || px[i + 2] > 52) lit++; }
    return { res, meshes, litPct: +(100 * lit / (w * h)).toFixed(1) };
  }).catch(e => ({ err: String(e) }));

  const x = probe.res || {};
  console.log('  §BONSAI-FASTAUTHOR w1Appended=' + x.w1Appended + ' w2Appended=' + x.w2Appended +
    ' cutAppended=' + x.cutAppended + ' picked=' + x.picked + ' signed=' + x.signed +
    ' scrub1=' + x.scrub1 + ' scrub3=' + x.scrub3 + ' meshes=' + probe.meshes + ' litPixels=' + probe.litPct + '%' +
    ' authorLines=' + authorLines + ' chainLines=' + chainLines);

  await br.close(); server.close();

  const leafAppended = x.w1Appended === true && x.w2Appended === true;      // leaf adds took the O(1) append path
  const cutFolded = x.cutAppended !== true;                                 // cut took the authoritative full fold
  const selectable = x.picked === 1;                                        // appended mesh resolved by select (featureId tagged)
  const signedOK = x.signed === 3 && x.w1Verify !== false && x.w2Verify !== false && x.cutVerify === true;
  const scrubOK = x.scrub1 === 1 && x.scrub3 === 2;                         // authoritative prefix fold still correct
  const incrementalAdds = authorLines >= 2;                                 // each leaf add ran a single-op author, not a refold-all
  const drew = probe.meshes === 2 && probe.litPct > 0.5;
  const pass = leafAppended && cutFolded && selectable && signedOK && scrubOK && incrementalAdds && drew;
  console.log('  §BONSAI-FASTAUTHOR VERDICT ' + (pass ? 'PASS' : 'FAIL') +
    ' — leafAppendedO1=' + leafAppended + ' cutAuthoritativeFold=' + cutFolded + ' selectable=' + selectable +
    ' signed=' + signedOK + ' scrub=' + scrubOK + ' incrementalAdds=' + incrementalAdds + ' drew=' + drew);
  console.log('── W-BONSAI-FASTAUTHOR ' + (pass ? 'PASS' : 'FAIL') + ' ──');
  process.exit(pass ? 0 : 1);
})();
