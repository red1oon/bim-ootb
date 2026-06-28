// W-BONSAI-SCALE — DAGeVu modeller: a placed catalog INSERT can be NON-UNIFORMLY scaled via the gizmo's cube handles.
// A net GEOM_SCALE folds host-side on the insert's LOCAL geometry, EDGE-ANCHORED at the local bbox min per axis (the
// opposite face stays put, the grabbed side stretches — the user-chosen anchor). Pure JS (bonsai_library.foldInsert +
// the bonsai_kernel net-factor accumulator) — NO occt → deterministic + composes exactly. Driven PURELY through the
// signed op-log (no canvas pointer). Proves: (A) a component scaled ×2 in X has its X-extent DOUBLE with the −X (min)
// edge FIXED, Y/Z unchanged; exactly one signed GEOM_SCALE; chain verifies; scrub replays deterministically. (B) a 2nd
// ×1.5 COMPOSES to net ×3 with Y/Z STILL unchanged (no cross-axis leak); undo restores the ×2 state. (C) a Y scale
// touches ONLY Y (axis independence). Solid B-rep scale is DEFERRED (#3b, occt-wasm Copy=false). RESUME_MODELLER_POLISH.md #3.
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
  pg.on('console', m => { const t = m.text(); if (/SCALE/.test(t)) console.log('  ' + t); });
  await pg.goto(`http://localhost:${port}/modeller.html`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction("window.Bonsai && window.Bonsai.library && window.Bonsai.library.ready && window.Bonsai.oplog", { timeout: 30000 }).catch(() => {});
  await pg.evaluate(() => window.Bonsai.library.ready());

  const r = await pg.evaluate(async () => {
    const O = window.Bonsai.oplog, L = window.Bonsai.library, out = {};
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const meshOf = fid => { const g = window.Bonsai.group(); return g && g.children.find(o => o.isMesh && o.userData.featureId === fid); };
    const dims = fid => { const m = meshOf(fid); if (!m) return null; m.geometry.computeBoundingBox(); const b = m.geometry.boundingBox;
      return { ex: +(b.max.x - b.min.x).toFixed(3), ey: +(b.max.y - b.min.y).toFixed(3), ez: +(b.max.z - b.min.z).toFixed(3),
        xmin: +b.min.x.toFixed(3), ymin: +b.min.y.toFixed(3) }; };
    const near = (a, b, t) => Math.abs(a - b) <= (t || 0.03);
    const settle = async (fid, pred) => { for (let i = 0; i < 100; i++) { const d = dims(fid); if (d && pred(d)) return d; await sleep(50); } return dims(fid); };
    try {
      window.Bonsai.grid.show(false); O.clear(); await sleep(50);
      const cat = L.catalog() || []; out.catN = cat.length; const hash = cat[0] && cat[0].hash;
      // ── PART A: a catalog component scaled ×2 in X about its −X (min) edge
      const I = await O.commit({ op_type: 'GEOM_INSERT', parameters: { hash, placement: { x: 0, y: 0, z: 0, rot: 0 }, lod: '200' } });
      await O.scrubTo(O.length); await settle(I.id, () => true);
      out.before = dims(I.id);
      await O.commit({ op_type: 'GEOM_SCALE', parameters: { parent: I.id, fx: 2, fy: 1, fz: 1 } });
      await O.scrubTo(O.length);
      out.afterX2 = await settle(I.id, d => near(d.ex, out.before.ex * 2));
      out.xDoubled  = near(out.afterX2.ex, out.before.ex * 2);
      out.yzFixed   = near(out.afterX2.ey, out.before.ey) && near(out.afterX2.ez, out.before.ez);
      out.minEdgeFixed = near(out.afterX2.xmin, out.before.xmin);              // EDGE-ANCHOR: −X face stays put
      out.scaleOps  = O._geomOps().filter(o => o.op_type === 'GEOM_SCALE').length;
      out.signed    = O.db.exec("SELECT COUNT(*) FROM kernel_ops WHERE sig IS NOT NULL")[0].values[0][0];
      out.verifyA   = (await O.verify()).ok;
      // determinism: scrub back (restores) then forward (doubled returns)
      const n = O.length;
      await O.scrubTo(n - 1); out.replayBefore = dims(I.id);
      await O.scrubTo(n);     out.replayAfter  = dims(I.id);
      out.deterministic = near(out.replayBefore.ex, out.before.ex) && near(out.replayAfter.ex, out.afterX2.ex);
      // ── PART B: compose ×1.5 → net ×3, Y/Z MUST stay unchanged (no cross-axis leak)
      await O.commit({ op_type: 'GEOM_SCALE', parameters: { parent: I.id, fx: 1.5, fy: 1, fz: 1 } });
      await O.scrubTo(O.length);
      out.afterX3 = await settle(I.id, d => near(d.ex, out.before.ex * 3, 0.05));
      out.composes = near(out.afterX3.ex, out.before.ex * 3, 0.05) && near(out.afterX3.xmin, out.before.xmin) &&
        near(out.afterX3.ey, out.before.ey) && near(out.afterX3.ez, out.before.ez);   // y/z UNCHANGED = leak-free
      // undo restores the ×2 state
      const u = await O.undo(); await O.scrubTo(O.length);
      out.afterUndo = await settle(I.id, d => near(d.ex, out.afterX2.ex));
      out.undoRestores = u.undone != null && near(out.afterUndo.ex, out.afterX2.ex) && (await O.verify()).ok;
      // ── PART C: a fresh insert scaled ×2 in Y touches ONLY Y (axis independence)
      O.clear(); await sleep(50);
      const J = await O.commit({ op_type: 'GEOM_INSERT', parameters: { hash, placement: { x: 0, y: 0, z: 0, rot: 0 }, lod: '200' } });
      await O.scrubTo(O.length); const jb = await settle(J.id, () => true);
      await O.commit({ op_type: 'GEOM_SCALE', parameters: { parent: J.id, fx: 1, fy: 2, fz: 1 } });
      await O.scrubTo(O.length);
      const ja = await settle(J.id, d => near(d.ey, jb.ey * 2));
      out.yOnly = near(ja.ey, jb.ey * 2) && near(ja.ex, jb.ex) && near(ja.ez, jb.ez) && near(ja.ymin, jb.ymin);
      out.verifyC = (await O.verify()).ok;
    } catch (e) { out.error = String(e && e.message || e); console.warn('§MODELLER scale fail ' + e); }
    return out;
  });

  await br.close(); server.close();
  console.log('  §SCALE ' + JSON.stringify(r));
  const checks = {
    xDoubled:        r.xDoubled === true,
    yzUnchanged:     r.yzFixed === true,
    minEdgeAnchored: r.minEdgeFixed === true,        // the user-chosen edge-anchor: −X face fixed
    oneSignedScale:  r.scaleOps === 1 && r.signed >= 2,
    chainVerifies:   r.verifyA === true,
    deterministic:   r.deterministic === true,
    composesX3:      r.composes === true,            // net ×3, NO cross-axis leak (y/z unchanged)
    undoRestores:    r.undoRestores === true,
    yAxisIndependent: r.yOnly === true,              // a Y scale touches only Y
    verifiesC:       r.verifyC === true
  };
  const pass = Object.values(checks).every(Boolean);
  console.log('  §SCALE VERDICT ' + (pass ? 'PASS' : 'FAIL') + ' — ' +
    Object.entries(checks).map(([k, v]) => k + '=' + v).join(' '));
  process.exit(pass ? 0 : 1);
})().catch(e => { console.log('FATAL ' + e); process.exit(1); });
