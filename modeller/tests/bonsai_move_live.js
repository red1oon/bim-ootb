// W-BONSAI-MOVE — direct-manipulation MOVE witness (P1; MODELLER_DIRECT_MANIPULATION.md §0-RESULTS).
// CLAIM: the modeller can now MOVE a placed object — the disqualifying gap vs any competitor is closed. Select an
// INSERTED Door, enter Move mode (a custom XYZ axis-handle gizmo — NOT THREE.TransformControls), DRAG its X handle
// +1.04m via REAL pointer down→move→up on the gizmo: the candidate centre SNAPS to the nearest gridline (→ +1.00),
// and RELEASE commits EXACTLY ONE signed GEOM_MOVE {parent,dx:1,dy:0,dz:0}. The insert re-folds HOST-side (PATH B,
// zero occt rebuild), its bbox centre moves by the snapped delta, the chain verifies + is signed, the Components
// Outliner row reflects the move, scrub replays deterministically, and undo restores the prior placement. A kernel
// cross-check then moves a WALL +1.0 X and CUTs it — proving PATH A translated the occt SHAPE (hole at the new pos).
const http = require('http'), fs = require('fs'), path = require('path');
const VIEWER = path.join('/tmp/wt-move', 'viewer');
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
  pg.on('console', m => { const t = m.text(); if (/^§(OPLOG|MODELLER|MOVE|LIBRARY|BONSAI)/.test(t)) console.log('  ' + t); });
  pg.on('pageerror', e => console.log('  ERR ' + String(e).slice(0, 300)));
  await pg.goto(`http://localhost:${port}/modeller.html?move=demo`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('window.__moveDone === true', { timeout: 120000 })
    .catch(() => console.log('  ✗ timeout waiting for __moveDone'));

  const probe = await pg.evaluate(() => {
    const res = window.__moveResult || {};
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
  const b = x.before || {}, a = x.after || {}, au = x.afterUndo || {}, mp = x.moveParams || {};
  console.log('  §MOVE select target=' + x.target + ' isInsert=' + x.isInsert + ' selected=' + x.selected +
    ' entered=' + x.entered + ' gizmo=' + x.gizmo + ' grabbedAxis=' + x.grabbedAxis);
  console.log('  §MOVE before centre=(' + b.x + ',' + b.y + ',' + b.z + ')  drag raw dx=' + x.dragRawDx +
    ' snapX=' + x.snapX + ' snapRef=' + x.snapRef);
  console.log('  §MOVE commit moveOps=' + x.moveOps + ' params=' + JSON.stringify(mp) + ' signed=' + x.signed +
    ' verify=' + x.verify + ' regenRebuilt=' + x.regenRebuilt);
  console.log('  §MOVE after centre=(' + a.x + ',' + a.y + ',' + a.z + ')  outlinerRow="' + x.componentRow + '"');
  console.log('  §MOVE replay before.x=' + x.replayBeforeX + ' after.x=' + x.replayAfterX +
    ' | undoId=' + x.undoId + ' afterUndo.x=' + au.x + ' verifyAfterUndo=' + x.verifyAfterUndo);
  console.log('  §MOVE kernel-xcheck wallBeforeX=' + x.wallBeforeX + ' wallAfterX=' + x.wallAfterX +
    ' cutVerify=' + x.wallCutVerify + ' wallMaxX=' + x.wallMaxX + ' litPixels=' + probe.litPct + '%' +
    (x.error ? '  ERROR=' + x.error : ''));

  await br.close(); server.close();

  const armed = x.isInsert === true && x.selected === true && x.entered === true && x.gizmo === true && x.grabbedAxis === 'x';
  const dragged = Math.abs((x.dragRawDx || 0) - 1.04) < 0.2;                       // real pointer drag produced ~+1.04
  const snapped = Math.abs((x.snapX || 0) - 2.0) < 0.01 && /C/.test(x.snapRef || '');   // candidate centre snapped to gridline C (x=2)
  const oneSignedMove = x.moveOps === 1 && x.signed === 2 && x.verify === true;    // EXACTLY one move, insert+move signed, chain ok
  const deltaIsSnapped = mp.parent === x.target && Math.abs((mp.dx || 0) - 1.0) < 0.02 && mp.dy === 0 && mp.dz === 0;
  const placementMoved = Math.abs((a.x - b.x) - 1.0) < 0.05 && Math.abs(a.y - b.y) < 0.02 && Math.abs(a.z - b.z) < 0.02;
  const pureHostReplace = x.regenRebuilt === 0;                                    // PATH B: insert move added ZERO occt rebuilds
  const outlinerReflects = /moved/.test(x.componentRow || '');                     // the moved insert's row shows it moved
  const replayDeterministic = Math.abs((x.replayBeforeX) - b.x) < 0.05 && Math.abs((x.replayAfterX) - a.x) < 0.05;
  const undoRestores = x.undoId != null && Math.abs(au.x - b.x) < 0.05 && x.verifyAfterUndo === true;   // prior placement restored
  const kernelMoved = Math.abs((x.wallAfterX - x.wallBeforeX) - 1.0) < 0.15 && x.wallCutVerify === true && Math.abs((x.wallMaxX || 0) - 3.0) < 0.3;
  const drew = probe.litPct > 0.5;

  const pass = armed && dragged && snapped && oneSignedMove && deltaIsSnapped && placementMoved && pureHostReplace &&
    outlinerReflects && replayDeterministic && undoRestores && kernelMoved && drew;
  console.log('  §MOVE VERDICT ' + (pass ? 'PASS' : 'FAIL') +
    ' — armedGizmo=' + armed + ' dragged=' + dragged + ' snapped=' + snapped + ' oneSignedMove=' + oneSignedMove +
    ' deltaIsSnapped=' + deltaIsSnapped + ' placementMoved=' + placementMoved + ' pureHostReplace=' + pureHostReplace +
    ' outlinerReflects=' + outlinerReflects + ' replayDeterministic=' + replayDeterministic +
    ' undoRestores=' + undoRestores + ' kernelMoved=' + kernelMoved + ' drew=' + drew);
  console.log('── W-BONSAI-MOVE ' + (pass ? 'PASS' : 'FAIL') + ' ──');
  process.exit(pass ? 0 : 1);
})();
