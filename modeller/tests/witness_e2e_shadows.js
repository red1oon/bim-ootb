#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-E2E-SHADOWS scope (read this block first)
 * SCOPE: real-user witness for §POLISH3 §V6 (prompts/RESUME_MODELLER_POLISH3.md) — real shadow mapping.
 *   Open Duplex through the production chooser, then read back the renderer/scene state + framebuffer
 *   checksums with shadows on vs off, and trip the Terminal-scale perf guard. Read the log after every run.
 *
 * Issues under test:
 *   H1 PIPELINE-ON   — renderer.shadowMap.enabled === true with PCFSoftShadowMap, the key light casts, and a
 *                      ShadowMaterial ground catcher exists at z≈0 (was: shadowMap never touched anywhere).
 *   H2 FLAGS-APPLIED — after the real Open, ≥1 authored mesh has castShadow===true (event-driven apply works).
 *   H3 VISIBLE       — the framebuffer checksum with shadows ON differs from setShadows(false) (the user
 *                      actually sees shading, not just a flag).
 *   H4 PERF-GUARD    — SHADOW_MAX_ELEMENTS below the scene count + setShadows('auto') → shadows auto-OFF with
 *                      the honest §SHADOW guard log (Terminal-scale never pays a per-frame shadow pass).
 *   H5 NO-ERROR      — no pageerror across the whole sequence.
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
  const slog = []; pg.on('console', m => { const t = m.text(); if (/§SHADOW/.test(t)) slog.push(t); });

  console.log('═══ W-E2E-SHADOWS — §V6 real shadow mapping + perf guard (Duplex) ═══');
  await pg.goto(`http://localhost:${port}/modeller/modeller.html`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('window.__sceneReady === true && !!window.THREE && !!window.A && !!window.Bonsai', { timeout: 30000 }).catch(() => {});

  await pg.click('#b-open'); await sleep(200);
  await pg.click('#m-open-panel .mo-row[data-key="Duplex"]');
  await pg.waitForFunction(() => !!window.__arcFidByGuid && Object.keys(window.__arcFidByGuid).length > 0, { timeout: 45000 }).catch(() => {});
  await sleep(2000);
  const fit = await pg.$('#b-fit'); if (fit) { await fit.click(); await sleep(600); }

  const pixsum = () => pg.evaluate(() => { const r = window.A.renderer; r.render(window.A.scene, window.A.camera); const gl = r.getContext();
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px); let s = 0; for (let i = 0; i < px.length; i += 257) s = (s + px[i]) >>> 0; return s; });

  // H1/H2 — pipeline + flags state after a real open
  const h1 = await pg.evaluate(() => {
    const r = window.A.renderer, sc = window.A.scene;
    const key = sc.children.find(o => o.isDirectionalLight);
    const ground = sc.children.find(o => o.userData && o.userData.shadowGround);
    const g = window.Bonsai.group();
    const cast = g ? g.children.filter(o => o.isMesh && o.userData.featureId != null && o.castShadow === true).length : 0;
    const total = g ? g.children.filter(o => o.isMesh && o.userData.featureId != null).length : 0;
    // r184 deprecated PCFSoftShadowMap (setter coerces to PCFShadowMap) — PCF is the soft path here.
    return { enabled: r.shadowMap.enabled, type: r.shadowMap.type, pcfSoft: r.shadowMap.type === window.THREE.PCFShadowMap,
      keyCasts: !!(key && key.castShadow), ground: !!(ground && ground.material && ground.material.isShadowMaterial),
      groundZ: ground ? ground.position.z : null, cast, total };
  });

  // H3 — shadows on vs off framebuffer
  const pxOn = await pixsum();
  await pg.evaluate(() => window.Bonsai.setShadows(false)); await sleep(300);
  const pxOff = await pixsum();
  const backOn = await pg.evaluate(() => window.Bonsai.setShadows(true)); await sleep(300);

  // H4 — perf guard: cap below the real element count → auto mode must refuse shadows
  const h4 = await pg.evaluate(() => {
    window.SHADOW_MAX_ELEMENTS = 1;
    const on = window.Bonsai.setShadows('auto');
    return { on, enabled: window.A.renderer.shadowMap.enabled };
  });
  await sleep(200);

  await br.close(); server.close();

  console.log('  §H1 ' + JSON.stringify(h1));
  console.log('  §H3 pxOn=' + pxOn + ' pxOff=' + pxOff + ' backOn=' + backOn);
  console.log('  §H4 ' + JSON.stringify(h4));
  slog.slice(0, 10).forEach(l => console.log('  ' + l));

  let pass = 0, fail = 0;
  const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };
  chk('H1 PIPELINE-ON shadowMap+PCFSoft+key casts+ShadowMaterial ground at z≈0',
    h1.enabled && h1.pcfSoft && h1.keyCasts && h1.ground && Math.abs(h1.groundZ + 0.02) < 1e-6, JSON.stringify(h1));
  chk('H2 FLAGS-APPLIED every authored mesh casts (' + h1.cast + '/' + h1.total + ')',
    h1.total > 0 && h1.cast === h1.total, h1.cast + '/' + h1.total);
  chk('H3 VISIBLE shadows on≠off framebuffer, and setShadows(true) re-enables',
    pxOn !== pxOff && backOn === true, pxOn + ' vs ' + pxOff);
  chk('H4 PERF-GUARD auto+low cap → OFF with §SHADOW guard log',
    h4.on === false && h4.enabled === false && slog.some(l => /§SHADOW guard/.test(l)), JSON.stringify(h4));
  chk('H5 NO-ERROR', errs.length === 0, errs.slice(0, 2).join(' | '));

  console.log('W-E2E-SHADOWS: ' + pass + ' PASS / ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
})();
