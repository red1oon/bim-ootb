// W-BONSAI-ROTATE — free-rotate witness (H3; MODELLER_DIRECT_MANIPULATION.md L4 / minimum-bar rotate handle).
// CLAIM: a placed object can now be ROTATED post-placement. The move gizmo carries a yaw RING; grabbing it and
// dragging 90° (15°-snapped) commits EXACTLY ONE signed GEOM_ROTATE {parent,drot:90}. The insert SPINS about its
// bbox CENTRE (PATH B host re-place via library.foldInsert): its world bbox X/Y extents SWAP, the centre stays
// put, the chain verifies + is signed (insert+rotate), scrub replays deterministically, and undo restores the
// prior yaw. (Solid/group rotation = follow-ups; the worker carries a tolerant GEOM_ROTATE no-op branch.)
const http = require('http'), fs = require('fs'), path = require('path');
const VIEWER = path.join(__dirname, '..');
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
  pg.on('console', m => { const t = m.text(); if (/^§(OPLOG|MODELLER|ROTATE|LIBRARY|BONSAI)/.test(t)) console.log('  ' + t); });
  pg.on('pageerror', e => console.log('  ERR ' + String(e).slice(0, 300)));
  await pg.goto(`http://localhost:${port}/modeller.html?rotate=demo`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('window.__rotateDone === true', { timeout: 120000 })
    .catch(() => console.log('  ✗ timeout waiting for __rotateDone'));

  const probe = await pg.evaluate(() => {
    const res = window.__rotateResult || {};
    let litPct = 0;
    try { const r = window.A.renderer; r.render(window.A.scene, window.A.camera);
      const gl = r.getContext(); const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
      const px = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let lit = 0; for (let i = 0; i < px.length; i += 4) { if (px[i] > 40 || px[i + 1] > 44 || px[i + 2] > 52) lit++; }
      litPct = +(100 * lit / (w * h)).toFixed(1);
    } catch (e) {}
    return { res, litPct };
  }).catch(e => ({ err: String(e) }));

  const x = probe.res || {};
  const b = x.before || {}, a = x.after || {}, au = x.afterUndo || {}, rp = x.rotParams || {};
  console.log('  §ROTATE target=' + x.target + ' asymmetric=' + x.asymmetric + ' entered=' + x.entered + ' hasRing=' + x.hasRing + ' grabbedAxis=' + x.grabbedAxis + ' dragDeg=' + x.dragDeg);
  console.log('  §ROTATE before ex=' + b.ex + ' ey=' + b.ey + ' c=(' + b.cx + ',' + b.cy + ')  after ex=' + a.ex + ' ey=' + a.ey + ' c=(' + a.cx + ',' + a.cy + ')');
  console.log('  §ROTATE rotOps=' + x.rotOps + ' params=' + JSON.stringify(rp) + ' signed=' + x.signed + ' verify=' + x.verify);
  console.log('  §ROTATE replay before.ex=' + (x.replayBefore || {}).ex + ' after.ex=' + (x.replayAfter || {}).ex +
    ' | undoId=' + x.undoId + ' afterUndo ex=' + au.ex + ' ey=' + au.ey + ' verifyAfterUndo=' + x.verifyAfterUndo +
    ' | solidRing=' + x.solidRing + ' litPixels=' + probe.litPct + '%' + (x.error ? '  ERROR=' + x.error : ''));

  await br.close(); server.close();

  const armed = x.asymmetric === true && x.entered === true && x.hasRing === true && x.grabbedAxis === 'rotZ';
  const dragged = Math.abs((x.dragDeg || 0) - 90) < 0.5;                                   // ring drag produced a 90° (snapped) yaw
  const oneSignedRotate = x.rotOps === 1 && rp.parent === x.target && Math.abs((rp.drot || 0) - 90) < 0.5 && x.signed === 2 && x.verify === true;
  const extentsSwapped = Math.abs((a.ex || 0) - (b.ey || 0)) < 0.03 && Math.abs((a.ey || 0) - (b.ex || 0)) < 0.03;   // 90° yaw → X/Y extents swap
  const centreFixed = Math.abs((a.cx || 0) - (b.cx || 0)) < 0.03 && Math.abs((a.cy || 0) - (b.cy || 0)) < 0.03;       // spins in place
  const replayDeterministic = Math.abs(((x.replayBefore || {}).ex) - b.ex) < 0.03 && Math.abs(((x.replayAfter || {}).ex) - a.ex) < 0.03;
  const undoRestores = x.undoId != null && Math.abs((au.ex || 0) - (b.ex || 0)) < 0.03 && Math.abs((au.ey || 0) - (b.ey || 0)) < 0.03 && x.verifyAfterUndo === true;
  const solidHasRing = x.solidRing === true;                                                 // a solid NOW carries a yaw ring (worker spins its B-rep) — W-BONSAI-ROTATE-SOLID
  const drew = probe.litPct > 0.5;

  const pass = armed && dragged && oneSignedRotate && extentsSwapped && centreFixed && replayDeterministic && undoRestores && solidHasRing && drew;
  console.log('  §ROTATE VERDICT ' + (pass ? 'PASS' : 'FAIL') +
    ' — armed=' + armed + ' dragged=' + dragged + ' oneSignedRotate=' + oneSignedRotate + ' extentsSwapped=' + extentsSwapped +
    ' centreFixed=' + centreFixed + ' replayDeterministic=' + replayDeterministic + ' undoRestores=' + undoRestores + ' solidHasRing=' + solidHasRing + ' drew=' + drew);
  console.log('── W-BONSAI-ROTATE ' + (pass ? 'PASS' : 'FAIL') + ' ──');
  process.exit(pass ? 0 : 1);
})();
