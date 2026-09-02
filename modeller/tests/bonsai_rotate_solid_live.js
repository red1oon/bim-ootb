// W-BONSAI-ROTATE-SOLID — DAGeVu modeller: a placed B-rep SOLID (not just an insert) can be rotated. The worker's
// GEOM_ROTATE branch now applies a REAL occt rotation about the shape's bbox-centre Z (was a tolerant no-op). Driven
// PURELY through the signed op-log (no canvas pointer dispatch → dodges the headless OrbitControls.setPointerCapture
// flake that hangs the gizmo-drag witnesses). Proves: (A) a non-square wall rotated 90° has its B-rep X/Y extents
// SWAP with the centre fixed; one signed GEOM_ROTATE; chain verifies; scrub replays deterministically; a 2nd +90
// COMPOSES back to the original extents; undo restores. (B) move→rotate→cut is honest — a void that only intersects
// the MOVED+ROTATED shape removes material, proving the cut reads the transformed solid. RESUME_MODELLER_POLISH.md #1.
const http = require('http'), fs = require('fs'), path = require('path');
const VIEWER = path.join(__dirname, '..');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm',
  '.json': 'application/json', '.css': 'text/css', '.map': 'application/json' };
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
  pg.on('pageerror', e => console.log('  ERR ' + String(e).slice(0, 200)));
  pg.on('console', m => { const t = m.text(); if (/rotate-solid/.test(t)) console.log('  ' + t); });
  await pg.goto(`http://localhost:${port}/modeller.html`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction("window.Bonsai && window.Bonsai.library && window.Bonsai.library.ready && window.Bonsai.oplog", { timeout: 30000 }).catch(() => {});
  await pg.evaluate(() => window.Bonsai.library.ready());

  const r = await pg.evaluate(async () => {
    const O = window.Bonsai.oplog, out = {};
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const meshOf = fid => { const g = window.Bonsai.group(); return g && g.children.find(o => o.isMesh && o.userData.featureId === fid); };
    const dims = fid => { const m = meshOf(fid); if (!m) return null; m.geometry.computeBoundingBox(); const b = m.geometry.boundingBox;
      return { ex: +(b.max.x - b.min.x).toFixed(3), ey: +(b.max.y - b.min.y).toFixed(3),
        cx: +((b.min.x + b.max.x) / 2).toFixed(3), cy: +((b.min.y + b.max.y) / 2).toFixed(3),
        nv: m.geometry.attributes.position ? m.geometry.attributes.position.count : 0 }; };
    const near = (a, b, t) => Math.abs(a - b) <= (t || 0.06);
    const settle = async (fid, pred) => { for (let i = 0; i < 100; i++) { const d = dims(fid); if (d && pred(d)) return d; await sleep(50); } return dims(fid); };
    try {
      window.Bonsai.grid.show(false); O.clear(); await sleep(50);
      // ── PART A: a non-square wall (footprint 3.0 × 0.4) rotated 90° about its centre
      const W = await O.commit({ op_type: 'GEOM_EXTRUDE_POLY', parameters: { profile: { points: [[0, 0], [3, 0], [3, 0.4], [0, 0.4]] }, depth: 2.5 } });
      await settle(W.id, () => true);
      out.before = dims(W.id);
      await O.commit({ op_type: 'GEOM_ROTATE', parameters: { parent: W.id, drot: 90 } });
      await O.scrubTo(O.length);
      out.after90 = await settle(W.id, d => near(d.ex, out.before.ey));
      out.swapped = near(out.after90.ex, out.before.ey) && near(out.after90.ey, out.before.ex);   // X/Y extents swap
      out.centreFixed = near(out.after90.cx, out.before.cx) && near(out.after90.cy, out.before.cy);
      out.rotOps = O._geomOps().filter(o => o.op_type === 'GEOM_ROTATE').length;                  // exactly 1 signed rotate
      out.signed = O.db.exec("SELECT COUNT(*) FROM kernel_ops WHERE sig IS NOT NULL")[0].values[0][0];
      out.verifyA = (await O.verify()).ok;
      // determinism: scrub back (extents restore) then forward (swap returns)
      const n = O.length;
      await O.scrubTo(n - 1); out.replayBefore = dims(W.id);
      await O.scrubTo(n); out.replayAfter = dims(W.id);
      out.deterministic = near(out.replayBefore.ex, out.before.ex) && near(out.replayAfter.ex, out.after90.ex);
      // compose: a 2nd +90 → 180 total → extents return to the original
      await O.commit({ op_type: 'GEOM_ROTATE', parameters: { parent: W.id, drot: 90 } });
      await O.scrubTo(O.length);
      out.after180 = await settle(W.id, d => near(d.ex, out.before.ex));
      out.composes = near(out.after180.ex, out.before.ex) && near(out.after180.ey, out.before.ey);
      // undo restores the 90° state
      const u = await O.undo(); await O.scrubTo(O.length);
      out.afterUndo = await settle(W.id, d => near(d.ex, out.after90.ex));
      out.undoRestores = u.undone != null && near(out.afterUndo.ex, out.after90.ex) && (await O.verify()).ok;

      // ── PART B: move → rotate → cut honesty. Wall moved +4 in X then spun 90° spans y∈[-1.3,1.7]; a void at
      // y∈[1.0,1.5] only intersects the MOVED+ROTATED shape (the un-rotated wall maxed at y=0.4) → if the cut lands
      // (mesh vertex count changes) it proves GEOM_CUT read the transformed solid.
      O.clear(); await sleep(50);
      const W2 = await O.commit({ op_type: 'GEOM_EXTRUDE_POLY', parameters: { profile: { points: [[0, 0], [3, 0], [3, 0.4], [0, 0.4]] }, depth: 2.5 } });
      await settle(W2.id, () => true);
      await O.commit({ op_type: 'GEOM_MOVE', parameters: { parent: W2.id, dx: 4, dy: 0, dz: 0 } });
      await O.commit({ op_type: 'GEOM_ROTATE', parameters: { parent: W2.id, drot: 90 } });
      await O.scrubTo(O.length);
      const beforeCut = await settle(W2.id, () => true);
      await O.commit({ op_type: 'GEOM_CUT', parameters: { parent: W2.id, void: { c1: [5.2, 1.0, 0.4], c2: [5.8, 1.5, 1.6] } } });
      await O.scrubTo(O.length); await sleep(200);
      const afterCut = dims(W2.id);
      out.beforeCutNv = beforeCut ? beforeCut.nv : 0; out.afterCutNv = afterCut ? afterCut.nv : 0;
      out.cutLanded = !!(afterCut && beforeCut && afterCut.nv !== beforeCut.nv);
      out.verifyB = (await O.verify()).ok;
    } catch (e) { out.error = String(e && e.message || e); console.warn('§MODELLER rotate-solid fail ' + e); }
    return out;
  });

  await br.close(); server.close();
  console.log('  §ROTATE-SOLID ' + JSON.stringify(r));
  const checks = {
    extentsSwap:    r.swapped === true,
    centreFixed:    r.centreFixed === true,
    oneSignedRotate: r.rotOps === 1 && r.signed >= 2,
    chainVerifies:  r.verifyA === true,
    deterministic:  r.deterministic === true,
    composes:       r.composes === true,
    undoRestores:   r.undoRestores === true,
    cutHonest:      r.cutLanded === true,         // move→rotate→cut: the void carved the transformed solid
    cutVerifies:    r.verifyB === true
  };
  const pass = Object.values(checks).every(Boolean);
  console.log('  §ROTATE-SOLID VERDICT ' + (pass ? 'PASS' : 'FAIL') + ' — ' +
    Object.entries(checks).map(([k, v]) => k + '=' + v).join(' '));
  process.exit(pass ? 0 : 1);
})().catch(e => { console.log('FATAL ' + e); process.exit(1); });
