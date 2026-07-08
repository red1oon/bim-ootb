#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-E2E-SELOUTLINE scope (read this block first)
 * SCOPE: real-user witness for §POLISH3 §V5 (prompts/RESUME_MODELLER_POLISH3.md) — the selection edge outline.
 *   Real production path: open Duplex, real canvas click + shift-click, read back the scene graph (outline
 *   LineSegments per selected mesh, primary/secondary colours) + framebuffer checksums + disposal on clear.
 *   Read the log after every run; exit code is not evidence.
 *
 * Issues under test:
 *   O1 OUTLINE-ON-PICK — a real click grows the scene by exactly ONE selOutline LineSegments for that fid,
 *                        with real edge geometry (>0 segments) and the primary colour 0x4fc3f7. Was: flat
 *                        emissive tint only, the single most "off" visual next to Revit/SketchUp.
 *   O2 VISIBLE         — the framebuffer changes when the outline lands (user sees a crisp edge highlight).
 *   O3 PRIMARY/SECONDARY — shift-click a second element → two outlines; the NEW primary is bright, the other
 *                        drops to the dimmer secondary colour 0x2b6a9c (matches _paintSel's tint hierarchy).
 *   O4 DISPOSED-ON-CLEAR — clearing the selection removes BOTH outlines from the scene AND disposes them
 *                        (window.__selOutlineCount === 0; no leak: repeated select/clear stays at 0/1/2).
 *   O5 NO-ERROR        — no pageerror across the whole sequence.
 */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.db': 'application/octet-stream', '.data': 'application/octet-stream' };
const server = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/modeller/modeller.html';
  fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { r.writeHead(404); r.end('404 ' + p); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Accept-Ranges': 'bytes' }); r.end(b); }); });

(async () => {
  await new Promise(r => server.listen(0, r)); const port = server.address().port;
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const pg = await br.newPage(); await pg.setViewport({ width: 1200, height: 850, deviceScaleFactor: 1 });
  const errs = []; pg.on('pageerror', e => errs.push(String(e).slice(0, 160)));

  console.log('═══ W-E2E-SELOUTLINE — §V5 edge outline on selection (real clicks, Duplex) ═══');
  await pg.goto(`http://localhost:${port}/modeller/modeller.html`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('window.__sceneReady === true && !!window.THREE && !!window.A && !!window.Bonsai', { timeout: 30000 }).catch(() => {});

  await pg.click('#b-open'); await sleep(200);
  await pg.click('#m-open-panel .mo-row[data-key="Duplex"]');
  await pg.waitForFunction(() => !!window.__arcFidByGuid && Object.keys(window.__arcFidByGuid).length > 0, { timeout: 45000 }).catch(() => {});
  await sleep(2000);
  const fit = await pg.$('#b-fit'); if (fit) { await fit.click(); await sleep(600); }

  await pg.evaluate(() => {
    window.__e2e = {
      proj(x, y, z) { const v = new window.THREE.Vector3(x, y, z).project(window.A.camera);
        const cv = window.A.renderer.domElement, r = cv.getBoundingClientRect();
        return [(v.x * 0.5 + 0.5) * r.width + r.left, (-v.y * 0.5 + 0.5) * r.height + r.top, v.z]; },
      pixsum() { const r = window.A.renderer; r.render(window.A.scene, window.A.camera); const gl = r.getContext();
        const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, px = new Uint8Array(w * h * 4);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px); let s = 0; for (let i = 0; i < px.length; i += 257) s = (s + px[i]) >>> 0; return s; },
      candidates() { const g = window.Bonsai.group(); const out = [];
        for (const m of g.children) { if (!m.isMesh || m.userData.featureId == null) continue;
          const b = new window.THREE.Box3().setFromObject(m); if (!isFinite(b.min.x)) continue;
          const c = new window.THREE.Vector3(); b.getCenter(c); const p = this.proj(c.x, c.y, c.z);
          const cv = window.A.renderer.domElement, r = cv.getBoundingClientRect();
          if (p[0] < r.left + 30 || p[0] > r.right - 30 || p[1] < r.top + 30 || p[1] > r.bottom - 30 || p[2] > 1) continue;
          const sz = new window.THREE.Vector3(); b.getSize(sz);
          out.push({ fid: m.userData.featureId, sx: p[0], sy: p[1], vol: sz.x * sz.y * sz.z }); }
        out.sort((a, b) => b.vol - a.vol); return out.slice(0, 16); },
      outlines() { const g = window.Bonsai.group();
        return g.children.filter(o => o.userData && o.userData.selOutline).map(o => ({
          for: o.userData.outlineFor, color: o.material.color.getHex(),
          segs: o.geometry.attributes.position ? o.geometry.attributes.position.count / 2 : 0 })); }
    };
    return true;
  });

  // O1/O2 — real pick
  const cands = await pg.evaluate(() => window.__e2e.candidates());
  const px0 = await pg.evaluate(() => window.__e2e.pixsum());
  let fidA = null;
  for (const c of cands) {
    await pg.mouse.click(c.sx, c.sy); await sleep(150);
    const sel = await pg.evaluate(() => Array.from(window.Bonsai._selSet || []));
    if (sel.length === 1 && sel[0] === c.fid) { fidA = c.fid; break; }
  }
  const o1 = await pg.evaluate(() => ({ outlines: window.__e2e.outlines(), count: window.__selOutlineCount, px: window.__e2e.pixsum() }));

  // §ZOOM-SEL: the O1 pick auto-flew the camera (zoomToSelection) — wait it out and RECOMPUTE the candidate
  // screen coords on the settled frame (a real user re-aims after the camera arrives); the precomputed
  // cands coords are stale mid-fly.
  { const t0 = Date.now(); while (Date.now() - t0 < 15000 && await pg.evaluate(() => !!window.__flyLive)) await sleep(120); }
  await sleep(300);
  // O3 — shift-click a second element (fresh candidates every attempt: each toggle/re-select flies again)
  let fidB = null, o3 = null;
  const tried = new Set([fidA]);
  for (let attempt = 0; attempt < 6 && fidB == null; attempt++) {
    const c = (await pg.evaluate(() => window.__e2e.candidates())).find(x => !tried.has(x.fid));
    if (!c) break;
    tried.add(c.fid);
    await pg.keyboard.down('Shift'); await pg.mouse.click(c.sx, c.sy); await pg.keyboard.up('Shift'); await sleep(150);
    const sel = await pg.evaluate(() => Array.from(window.Bonsai._selSet || []));
    if (sel.length === 2 && sel.includes(c.fid)) { fidB = c.fid; break; }
    if (sel.length !== 1 || sel[0] !== fidA) { await pg.evaluate(f => window.Bonsai.select(f), fidA); await sleep(80); }
    { const t0 = Date.now(); while (Date.now() - t0 < 15000 && await pg.evaluate(() => !!window.__flyLive)) await sleep(120); }
    await sleep(300);
  }
  if (fidB != null) o3 = await pg.evaluate(() => window.__e2e.outlines());

  // O4 — clear the selection → outlines removed + disposed (count oracle), then re-select once (no leak)
  await pg.evaluate(() => window.Bonsai.selectMany([]));
  await sleep(150);
  const o4 = await pg.evaluate(() => ({ count: window.__selOutlineCount, inScene: window.__e2e.outlines().length }));
  await pg.evaluate(f => window.Bonsai.select(f), fidA); await sleep(150);
  const o4b = await pg.evaluate(() => ({ count: window.__selOutlineCount, inScene: window.__e2e.outlines().length }));

  await br.close(); server.close();

  console.log('  §O1 fidA=' + fidA + ' ' + JSON.stringify(o1) + ' px0=' + px0);
  console.log('  §O3 fidB=' + fidB + ' ' + JSON.stringify(o3));
  console.log('  §O4 cleared=' + JSON.stringify(o4) + ' reselected=' + JSON.stringify(o4b));

  let pass = 0, fail = 0;
  const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };
  chk('O1 OUTLINE-ON-PICK one selOutline for the picked fid, real edges, primary 0x4fc3f7',
    fidA != null && o1.count === 1 && o1.outlines.length === 1 && o1.outlines[0].for === fidA &&
    o1.outlines[0].segs > 0 && o1.outlines[0].color === 0x4fc3f7, JSON.stringify(o1.outlines));
  chk('O2 VISIBLE framebuffer changed when the outline landed', px0 !== o1.px, px0 + '→' + o1.px);
  chk('O3 PRIMARY/SECONDARY two outlines, new primary bright, old drops to 0x2b6a9c',
    !!o3 && o3.length === 2 &&
    o3.find(o => o.for === fidB) && o3.find(o => o.for === fidB).color === 0x4fc3f7 &&
    o3.find(o => o.for === fidA) && o3.find(o => o.for === fidA).color === 0x2b6a9c, JSON.stringify(o3));
  chk('O4 DISPOSED-ON-CLEAR count 2→0 in scene AND oracle; re-select is exactly 1 (no leak)',
    o4.count === 0 && o4.inScene === 0 && o4b.count === 1 && o4b.inScene === 1, JSON.stringify({ o4, o4b }));
  chk('O5 NO-ERROR', errs.length === 0, errs.slice(0, 2).join(' | '));

  console.log('W-E2E-SELOUTLINE: ' + pass + ' PASS / ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
})();
