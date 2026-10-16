// W-BONSAI-MULTISELECT — direct-manipulation MULTI-SELECT witness (P3; MODELLER_DIRECT_MANIPULATION.md L2).
// CLAIM: the modeller can now select MANY objects and transform them as a group — the 3rd direct-manipulation
// blocker is closed. Place 3 Doors on a grid; a REAL shift+drag MARQUEE box over 2 of them selects EXACTLY those
// 2 (the 3rd, far at gridline E, untouched). A shift-CLICK then ADDS the 3rd and a second shift-CLICK REMOVES it
// (set 3→2). Entering Move builds ONE gizmo at the group centroid; dragging its X handle and releasing commits
// EXACTLY 2 signed GEOM_MOVE by the SAME snapped delta — both selected centres move by it, the control door has
// ZERO move-ops, the chain verifies + is signed (3 inserts + 2 moves), and Escape clears the set to 0.
const http = require('http'), fs = require('fs'), path = require('path');
// 2026-07-08: was hardcoded to a long-dead worktree (/tmp/wt-multiselect/viewer) — serve THIS checkout instead.
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
  pg.on('console', m => { const t = m.text(); if (/^§(OPLOG|MODELLER|MOVE|MARQUEE|LIBRARY|BONSAI)/.test(t)) console.log('  ' + t); });
  pg.on('pageerror', e => console.log('  ERR ' + String(e).slice(0, 300)));
  await pg.goto(`http://localhost:${port}/modeller.html?multiselect=demo`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('window.__multiDone === true', { timeout: 120000 })
    .catch(() => console.log('  ✗ timeout waiting for __multiDone'));

  const probe = await pg.evaluate(() => {
    const res = window.__multiResult || {};
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
  const d = x.doors || [], cb = x.centresBefore || {}, ca = x.centresAfter || {};
  console.log('  §MULTI doors=[' + d.join(',') + '] startSel=' + x.startSel + ' d2OutsideBox=' + x.d2OutsideBox +
    ' controlsFrozen=' + x.controlsFrozen + ' controlsRestored=' + x.controlsRestored);
  console.log('  §MULTI marqueeSel=[' + (x.marqueeSel || []).join(',') + '] afterAdd=' + x.afterAdd +
    ' afterRemove=[' + (x.afterRemove || []).join(',') + ']');
  console.log('  §MULTI move entered=' + x.entered + ' gizmo=' + x.gizmo + ' grabbedAxis=' + x.grabbedAxis +
    ' centroid=' + JSON.stringify(x.groupCentroid) + ' expectDelta=' + x.expectDelta);
  console.log('  §MULTI moveOps=' + x.moveOps + ' parents=[' + (x.moveParents || []).join(',') + '] deltas=' +
    JSON.stringify(x.moveDeltas) + ' d2MoveOps=' + x.d2MoveOps + ' signed=' + x.signed + ' verify=' + x.verify);
  console.log('  §MULTI centresBefore d0.x=' + (cb.d0 || {}).x + ' d1.x=' + (cb.d1 || {}).x + ' d2.x=' + (cb.d2 || {}).x +
    '  centresAfter d0.x=' + (ca.d0 || {}).x + ' d1.x=' + (ca.d1 || {}).x + ' d2.x=' + (ca.d2 || {}).x);
  console.log('  §MULTI afterEsc1=' + x.afterEsc1 + ' exitedMove=' + x.exitedMove + ' afterEsc=' + x.afterEsc +
    ' litPixels=' + probe.litPct + '%' + (x.error ? '  ERROR=' + x.error : ''));

  await br.close(); server.close();

  const placed = d.length === 3;
  const cleanStart = x.startSel === 0 && x.d2OutsideBox === true;
  const froze = x.controlsFrozen === true && x.controlsRestored === true;                    // capture-phase controls-off idiom
  const marqueeExact = Array.isArray(x.marqueeSel) && x.marqueeSel.length === 2 &&
    x.marqueeSel[0] === d[0] && x.marqueeSel[1] === d[1];                                     // EXACTLY the 2 boxed, control excluded
  const toggleAdds = x.afterAdd === 3;
  const toggleRemoves = Array.isArray(x.afterRemove) && x.afterRemove.length === 2 &&
    x.afterRemove[0] === d[0] && x.afterRemove[1] === d[1];                                   // back to the 2-set
  const armedGizmo = x.entered === true && x.gizmo === true && x.grabbedAxis === 'x';
  const delta = x.expectDelta;
  const twoMoves = x.moveOps === 2 && Array.isArray(x.moveParents) &&
    x.moveParents[0] === d[0] && x.moveParents[1] === d[1];                                   // EXACTLY 2, the selected pair
  const sameDelta = Array.isArray(x.moveDeltas) && x.moveDeltas.length === 2 &&
    x.moveDeltas.every(m => Math.abs(m.dx - delta) < 0.02 && m.dy === 0 && m.dz === 0) && Math.abs(delta) > 0.1;
  const controlUntouched = x.d2MoveOps === 0 &&
    Math.abs(((ca.d2 || {}).x) - ((cb.d2 || {}).x)) < 0.02;                                   // 3rd door never moved
  const bothMoved = Math.abs(((ca.d0 || {}).x - (cb.d0 || {}).x) - delta) < 0.05 &&
    Math.abs(((ca.d1 || {}).x - (cb.d1 || {}).x) - delta) < 0.05;                             // both selected moved by delta
  const signedChain = x.signed === 5 && x.verify === true;                                    // 3 inserts + 2 moves, all signed
  const escClears = x.afterEsc1 === 2 && x.exitedMove === true && x.afterEsc === 0;   // Esc#1 exits mode (sel kept), Esc#2 clears
  const drew = probe.litPct > 0.5;

  const pass = placed && cleanStart && froze && marqueeExact && toggleAdds && toggleRemoves && armedGizmo &&
    twoMoves && sameDelta && controlUntouched && bothMoved && signedChain && escClears && drew;
  console.log('  §MULTI VERDICT ' + (pass ? 'PASS' : 'FAIL') +
    ' — placed=' + placed + ' cleanStart=' + cleanStart + ' froze=' + froze + ' marqueeExact=' + marqueeExact +
    ' toggleAdds=' + toggleAdds + ' toggleRemoves=' + toggleRemoves + ' armedGizmo=' + armedGizmo +
    ' twoMoves=' + twoMoves + ' sameDelta=' + sameDelta + ' controlUntouched=' + controlUntouched +
    ' bothMoved=' + bothMoved + ' signedChain=' + signedChain + ' escClears=' + escClears + ' drew=' + drew);
  console.log('── W-BONSAI-MULTISELECT ' + (pass ? 'PASS' : 'FAIL') + ' ──');
  process.exit(pass ? 0 : 1);
})();
