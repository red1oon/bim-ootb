// W-BONSAI-SNAPGEOM — snap-to-geometry witness (H2; MODELLER_DIRECT_MANIPULATION.md L3 / minimum-bar item ③).
// CLAIM: while moving, the selection snaps to the vertices / edge-mids / face-centres of OTHER features — read from
// their REAL world bboxes (non-invent) — with a visual marker, taking precedence over the grid. Author wall A (unit
// cube at origin) + static wall B whose near corner sits OFF the integer grid at (5.2,5.2). Drag A's XY hub so its
// far corner lands ~0.18m from B's corner: snap PULLS A's corner exactly onto B's vertex (5.2,5.2), a marker shows
// mid-drag, and it BEATS the active grid (lands on 5.2, NOT the 5.0 gridline). Exactly ONE signed GEOM_MOVE; chain ok.
const http = require('http'), fs = require('fs'), path = require('path');
const VIEWER = path.join('/tmp/wt-snapgeom', 'viewer');
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
  pg.on('console', m => { const t = m.text(); if (/^§(OPLOG|MODELLER|SNAPGEOM|MOVE|BONSAI)/.test(t)) console.log('  ' + t); });
  pg.on('pageerror', e => console.log('  ERR ' + String(e).slice(0, 300)));
  await pg.goto(`http://localhost:${port}/modeller.html?snapgeom=demo`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('window.__snapgeomDone === true', { timeout: 120000 })
    .catch(() => console.log('  ✗ timeout waiting for __snapgeomDone'));

  const probe = await pg.evaluate(() => {
    const res = window.__snapgeomResult || {};
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
  const ab = x.aBefore || {}, aa = x.aAfter || {}, bb = x.bBox || {}, sn = x.snap || {}, mk = sn.marker || {}, dl = x.delta || {};
  console.log('  §SNAPGEOM target=' + x.target + ' selected=' + x.selected + ' entered=' + x.entered + ' gizmo=' + x.gizmo + ' grabbedAxis=' + x.grabbedAxis);
  console.log('  §SNAPGEOM A.before=[' + ab.minx + ',' + ab.miny + '..' + ab.maxx + ',' + ab.maxy + '] B=[' + bb.minx + ',' + bb.miny + '..]  markerShownDuringDrag=' + x.markerShownDuringDrag);
  console.log('  §SNAPGEOM snap.kind=' + sn.kind + ' marker=(' + mk.x + ',' + mk.y + ',' + mk.z + ') delta=' + JSON.stringify(dl) + ' moveOps=' + x.moveOps + ' verify=' + x.verify);
  const x2 = x.x2 || {}, x2a = x2.aAfter || {};
  console.log('  §SNAPGEOM A.after=[' + aa.minx + ',' + aa.miny + '..' + aa.maxx + ',' + aa.maxy + ']  litPixels=' + probe.litPct + '%' + (x.error ? '  ERROR=' + x.error : ''));
  console.log('  §SNAPGEOM leg2(X-axis,far-Y) axis=' + x.x2Axis + ' kind=' + x2.kind + ' dx=' + x2.dx + ' dy=' + x2.dy +
    ' A2.maxx=' + x2a.maxx + ' A2.maxy=' + x2a.maxy + ' verify=' + x2.verify);

  await br.close(); server.close();

  const armed = x.selected === true && x.entered === true && x.gizmo === true && x.grabbedAxis === 'xy';
  const markerShown = x.markerShownDuringDrag === true;
  const snapKind = sn.kind === 'geom';
  const markerOnVertex = Math.abs((mk.x || 0) - 5.2) < 0.02 && Math.abs((mk.y || 0) - 5.2) < 0.02;        // marker sat on B's real vertex
  const oneMove = x.moveOps === 1 && x.verify === true;
  const cornerMet = Math.abs((aa.maxx || 0) - 5.2) < 0.02 && Math.abs((aa.maxy || 0) - 5.2) < 0.02;       // A's far corner landed on B's vertex
  const beatGrid = Math.abs((aa.maxx || 0) - 5.0) > 0.1;                                                  // NOT the 5.0 gridline → geom beat grid
  const pulled = Math.abs((dl.dx || 0) - 4.2) < 0.03 && Math.abs((dl.dy || 0) - 4.2) < 0.03;              // raw 4.05/4.08 pulled to 4.2/4.2
  const drew = probe.litPct > 0.5;
  // leg 2 — X-axis-constrained snap to a target 1.5m away in Y: free-axis selection lands X on 5.2 (NOT the 5.0
  // gridline the old 3D-distance code would have fallen to), and does NOT drag Y. This case fails under the bug.
  const x2FreeAxis = x2.kind === 'geom' && x.x2Axis === 'x' &&
    Math.abs((x2a.maxx || 0) - 5.2) < 0.02 && Math.abs((x2a.maxy || 0) - 1.0) < 0.02 &&
    Math.abs((x2.dy || 0)) < 0.001 && x2.verify === true;

  const pass = armed && markerShown && snapKind && markerOnVertex && oneMove && cornerMet && beatGrid && pulled && drew && x2FreeAxis;
  console.log('  §SNAPGEOM VERDICT ' + (pass ? 'PASS' : 'FAIL') +
    ' — armed=' + armed + ' markerShown=' + markerShown + ' snapKind=' + snapKind + ' markerOnVertex=' + markerOnVertex +
    ' oneMove=' + oneMove + ' cornerMet=' + cornerMet + ' beatGrid=' + beatGrid + ' pulled=' + pulled + ' drew=' + drew + ' x2FreeAxis=' + x2FreeAxis);
  console.log('── W-BONSAI-SNAPGEOM ' + (pass ? 'PASS' : 'FAIL') + ' ──');
  process.exit(pass ? 0 : 1);
})();
