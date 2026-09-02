#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-E2E-OLEYE scope (read this block first)
 * SCOPE: real-user witness for §POLISH3 §V1 (prompts/RESUME_MODELLER_POLISH3.md) — the Outliner eye toggle.
 *   Real production path: open Duplex, click a leaf row's eye glyph, click a walked discipline's eye.
 *   Claims are mesh.visible flags + framebuffer checksums + raycast behaviour — maths, not eyes.
 *   Read the log after every run; exit code is not evidence.
 *
 * Issues under test:
 *   E1 LEAF-HIDE     — clicking an ARC leaf's eye sets THAT mesh visible=false and the framebuffer CHANGES
 *                      (the user actually sees it disappear). Was: no visibility control existed at all.
 *   E2 LEAF-SHOW     — clicking the eye again restores visible=true (reversible lens).
 *   E3 HIDDEN-UNPICKABLE — a hidden mesh no longer answers a canvas click at its old screen position
 *                      (THREE skips invisible in raycast — hide means hide, not just invisible-but-clickable).
 *   E4 BUCKET-HIDE   — after a REAL discipline walk (production discWalk, the Outliner ▶ handler), the disc
 *                      node's eye hides EVERY dwDisc bucket of that discipline (whole-bucket per §DECISIONS-2).
 *   E5 NO-ERROR      — no pageerror across the whole sequence.
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
  const slog = []; pg.on('console', m => { const t = m.text(); if (/§(OLEYE|DISCWALK|DW-PRIM)/.test(t)) slog.push(t); });

  console.log('═══ W-E2E-OLEYE — §V1 eye toggle: leaf mesh + walked bucket (real user, Duplex) ═══');
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
      vis(fid) { const g = window.Bonsai.group(); const m = g.children.find(o => o.isMesh && o.userData.featureId === fid);
        return m ? m.visible : null; },
      // a big on-screen ARC leaf whose row (guid) is in the DOM with an eye
      target() { const g = window.Bonsai.group(); const out = [];
        for (const m of g.children) { if (!m.isMesh || m.userData.featureId == null) continue;
          const guid = (window.__arcGuidByFid || {})[m.userData.featureId]; if (guid == null) continue;
          const row = document.querySelector('[data-bnode="' + guid + '"]'); if (!row || !row.querySelector('.bn-eye')) continue;
          const b = new window.THREE.Box3().setFromObject(m); if (!isFinite(b.min.x)) continue;
          const c = new window.THREE.Vector3(); b.getCenter(c); const p = this.proj(c.x, c.y, c.z);
          const cv = window.A.renderer.domElement, r = cv.getBoundingClientRect();
          if (p[0] < r.left + 30 || p[0] > r.right - 30 || p[1] < r.top + 30 || p[1] > r.bottom - 30 || p[2] > 1) continue;
          const sz = new window.THREE.Vector3(); b.getSize(sz);
          out.push({ fid: m.userData.featureId, guid, sx: p[0], sy: p[1], vol: sz.x * sz.y * sz.z }); }
        out.sort((a, b) => b.vol - a.vol); return out[0] || null; }
    };
    return true;
  });

  const t = await pg.evaluate(() => window.__e2e.target());
  let e1 = null, e2 = null, e3 = null;
  if (t) {
    // make sure the row is scrolled into view, then click ITS eye glyph (the real user gesture)
    await pg.evaluate(g => { const d = document.querySelector('[data-bnode="' + g + '"]'); if (d) d.scrollIntoView({ block: 'center' }); }, t.guid);
    const px0 = await pg.evaluate(() => window.__e2e.pixsum());
    await pg.click('[data-bnode="' + t.guid + '"] .bn-eye'); await sleep(300);
    e1 = await pg.evaluate((f) => ({ vis: window.__e2e.vis(f), px: window.__e2e.pixsum() }), t.fid);
    e1.px0 = px0;

    // E3 — click the hidden mesh's old screen spot: the selection must NOT land on it
    await pg.evaluate(() => window.Bonsai.selectMany([]));
    await pg.mouse.click(t.sx, t.sy); await sleep(200);
    e3 = await pg.evaluate(f => { const s = Array.from(window.Bonsai._selSet || []); return { hitHidden: s.includes(f), sel: s }; }, t.fid);

    // E2 — eye again (row re-rendered by _paint; same selector) → restored
    await pg.evaluate(g => { const d = document.querySelector('[data-bnode="' + g + '"]'); if (d) d.scrollIntoView({ block: 'center' }); }, t.guid);
    await pg.click('[data-bnode="' + t.guid + '"] .bn-eye'); await sleep(300);
    e2 = await pg.evaluate((f) => ({ vis: window.__e2e.vis(f), px: window.__e2e.pixsum() }), t.fid);
  }

  // E4 — REAL discipline walk (the production discWalk the ▶ row calls), then the disc row's eye
  let e4 = null;
  await pg.evaluate(() => window.discWalk('ELEC', { building: 'Duplex' }));
  await pg.waitForFunction(() => {
    const g = window.Bonsai.group(); const root = g && g.children.find(o => o.userData && o.userData.dwRoot);
    return !!(root && root.children.some(o => o.userData && o.userData.dwDisc === 'ELEC'));
  }, { timeout: 60000 }).catch(() => {});
  await sleep(500);
  const discRow = await pg.evaluate(() => {
    const d = document.querySelector('[data-bnode][data-disc="ELEC"]');
    if (d) d.scrollIntoView({ block: 'center' });
    return d && d.querySelector('.bn-eye') ? true : false;
  });
  if (discRow) {
    await pg.click('[data-bnode][data-disc="ELEC"] .bn-eye'); await sleep(300);
    const hidden = await pg.evaluate(() => {
      const g = window.Bonsai.group(); const root = g.children.find(o => o.userData && o.userData.dwRoot);
      const b = root.children.filter(o => o.userData && o.userData.dwDisc === 'ELEC');
      return { buckets: b.length, allHidden: b.length > 0 && b.every(o => o.visible === false) };
    });
    await pg.click('[data-bnode][data-disc="ELEC"] .bn-eye'); await sleep(300);
    const restored = await pg.evaluate(() => {
      const g = window.Bonsai.group(); const root = g.children.find(o => o.userData && o.userData.dwRoot);
      const b = root.children.filter(o => o.userData && o.userData.dwDisc === 'ELEC');
      return b.length > 0 && b.every(o => o.visible === true);
    });
    e4 = { buckets: hidden.buckets, allHidden: hidden.allHidden, restored };
  }

  await br.close(); server.close();

  console.log('  §TARGET ' + JSON.stringify(t));
  console.log('  §E1 ' + JSON.stringify(e1) + '  §E2 ' + JSON.stringify(e2) + '  §E3 ' + JSON.stringify(e3));
  console.log('  §E4 ' + JSON.stringify(e4) + ' discRowEye=' + discRow);
  slog.slice(0, 10).forEach(l => console.log('  ' + l));

  let pass = 0, fail = 0;
  const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };
  chk('E1 LEAF-HIDE eye → mesh.visible=false + framebuffer changed',
    !!e1 && e1.vis === false && e1.px !== e1.px0, e1 ? 'px ' + e1.px0 + '→' + e1.px : 'no target');
  chk('E2 LEAF-SHOW eye again → visible=true + framebuffer restored-ish (differs from hidden)',
    !!e2 && e2.vis === true && !!e1 && e2.px !== e1.px, e2 ? 'px=' + e2.px : '');
  chk('E3 HIDDEN-UNPICKABLE canvas click at old spot does NOT select the hidden mesh',
    !!e3 && e3.hitHidden === false, JSON.stringify(e3));
  chk('E4 BUCKET-HIDE disc eye hides EVERY ELEC bucket, eye again restores',
    !!e4 && e4.buckets > 0 && e4.allHidden && e4.restored, JSON.stringify(e4));
  chk('E5 NO-ERROR', errs.length === 0, errs.slice(0, 2).join(' | '));

  console.log('W-E2E-OLEYE: ' + pass + ' PASS / ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
})();
