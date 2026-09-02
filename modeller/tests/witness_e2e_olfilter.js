#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-E2E-OLFILTER scope (read this block first)
 * SCOPE: real-user witness for §POLISH3 §V2 (prompts/RESUME_MODELLER_POLISH3.md) — the find box reaching the
 *   SCENE (dim semantic). Real production path: open Duplex, TYPE into #bo-find, read back material opacity
 *   values + framebuffer checksums. Read the log after every run; exit code is not evidence.
 *
 * Issues under test:
 *   F1 DIM-ON-TYPE   — typing a term that matches ONE leaf keeps that mesh at its original opacity and drops a
 *                      non-matching mesh to 0.15/transparent (was: DOM list filtered, scene showed everything).
 *   F2 VISIBLE       — the framebuffer checksum changes when the dim lands (the user SEES the filter).
 *   F3 RESTORE       — clearing the box restores BOTH meshes' opacity/transparent EXACTLY (pre-dim snapshot).
 *   F4 NO-ERROR      — no pageerror across the whole sequence.
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
  const slog = []; pg.on('console', m => { const t = m.text(); if (/§(OLFILTER)/.test(t)) slog.push(t); });

  console.log('═══ W-E2E-OLFILTER — §V2 find box dims the scene (real typing, Duplex) ═══');
  await pg.goto(`http://localhost:${port}/modeller/modeller.html`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('window.__sceneReady === true && !!window.THREE && !!window.A && !!window.Bonsai', { timeout: 30000 }).catch(() => {});

  await pg.click('#b-open'); await sleep(200);
  await pg.click('#m-open-panel .mo-row[data-key="Duplex"]');
  await pg.waitForFunction(() => !!window.__arcFidByGuid && Object.keys(window.__arcFidByGuid).length > 0, { timeout: 45000 }).catch(() => {});
  await sleep(2000);
  const fit = await pg.$('#b-fit'); if (fit) { await fit.click(); await sleep(600); }

  // pick a target guid (its Outliner leaf label is shortGuid = first 10 chars) + a control mesh that won't match
  const t = await pg.evaluate(() => {
    const byFid = window.__arcGuidByFid || {};
    const g = window.Bonsai.group();
    const meshes = g.children.filter(o => o.isMesh && o.userData.featureId != null && byFid[o.userData.featureId] != null);
    if (meshes.length < 2) return null;
    const pick = meshes[0], term = String(byFid[pick.userData.featureId]).slice(0, 8).toLowerCase();
    // control = a mesh whose guid does NOT contain the term (label match is on the shortGuid label)
    const ctrl = meshes.find(m => m !== pick && !String(byFid[m.userData.featureId]).toLowerCase().includes(term));
    if (!ctrl) return null;
    return { fid: pick.userData.featureId, guid: byFid[pick.userData.featureId], term,
      ctrlFid: ctrl.userData.featureId,
      pickOp0: pick.material.opacity, pickT0: pick.material.transparent,
      ctrlOp0: ctrl.material.opacity, ctrlT0: ctrl.material.transparent };
  });

  let dim = null, restored = null, px0 = 0, px1 = 0;
  if (t) {
    px0 = await pg.evaluate(() => { const r = window.A.renderer; r.render(window.A.scene, window.A.camera); const gl = r.getContext();
      const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, px = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px); let s = 0; for (let i = 0; i < px.length; i += 257) s = (s + px[i]) >>> 0; return s; });
    await pg.click('#bo-find'); await pg.type('#bo-find', t.term, { delay: 30 }); await sleep(400);
    dim = await pg.evaluate((a, b) => {
      const g = window.Bonsai.group();
      const pick = g.children.find(o => o.isMesh && o.userData.featureId === a);
      const ctrl = g.children.find(o => o.isMesh && o.userData.featureId === b);
      return { pickOp: pick.material.opacity, pickT: pick.material.transparent,
        ctrlOp: ctrl.material.opacity, ctrlT: ctrl.material.transparent };
    }, t.fid, t.ctrlFid);
    px1 = await pg.evaluate(() => { const r = window.A.renderer; r.render(window.A.scene, window.A.camera); const gl = r.getContext();
      const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, px = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px); let s = 0; for (let i = 0; i < px.length; i += 257) s = (s + px[i]) >>> 0; return s; });
    // clear with real keystrokes (select-all + delete fires the same input event a user does)
    await pg.click('#bo-find', { clickCount: 3 }); await pg.keyboard.press('Backspace'); await sleep(400);
    restored = await pg.evaluate((a, b) => {
      const g = window.Bonsai.group();
      const pick = g.children.find(o => o.isMesh && o.userData.featureId === a);
      const ctrl = g.children.find(o => o.isMesh && o.userData.featureId === b);
      return { pickOp: pick.material.opacity, pickT: pick.material.transparent,
        ctrlOp: ctrl.material.opacity, ctrlT: ctrl.material.transparent };
    }, t.fid, t.ctrlFid);
  }

  await br.close(); server.close();

  console.log('  §TARGET ' + JSON.stringify(t));
  console.log('  §DIM ' + JSON.stringify(dim) + ' px ' + px0 + '→' + px1);
  console.log('  §RESTORE ' + JSON.stringify(restored));
  slog.slice(0, 8).forEach(l => console.log('  ' + l));

  let pass = 0, fail = 0;
  const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };
  chk('F1 DIM-ON-TYPE match keeps opacity, non-match ghosts to 0.15/transparent',
    !!t && !!dim && dim.pickOp === t.pickOp0 && dim.ctrlOp === 0.15 && dim.ctrlT === true, JSON.stringify(dim));
  chk('F2 VISIBLE framebuffer changed when the dim landed', !!t && px0 !== px1, px0 + '→' + px1);
  chk('F3 RESTORE clearing the box restores both materials EXACTLY',
    !!t && !!restored && restored.pickOp === t.pickOp0 && restored.pickT === t.pickT0 &&
    restored.ctrlOp === t.ctrlOp0 && restored.ctrlT === t.ctrlT0, JSON.stringify(restored));
  chk('F4 NO-ERROR', errs.length === 0, errs.slice(0, 2).join(' | '));

  console.log('W-E2E-OLFILTER: ' + pass + ' PASS / ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
})();
