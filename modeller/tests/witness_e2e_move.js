#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-E2E-MOVE scope (read this block first)
 * SCOPE: a USER-EMULATING, MATHS-ASSERTED, ATOMIC end-to-end test of the MOVE authoring tool — the standard the
 *   user set: "a test suite must emulate a user series of actions that confirms each function works completely,
 *   perfectly and atomically." This drives the REAL production path with REAL mouse input (puppeteer pg.mouse →
 *   Chrome pointer events), NOT an engine seam: open a building from the chooser, PICK an element by clicking it,
 *   enter Move, DRAG the X gizmo handle, RELEASE to commit, then UNDO via the real history slider. Every claim is a
 *   number read back from the live op-log + scene graph + framebuffer — no eyeballing, no magic constants.
 *
 * THE WORKING SWIFTSHADER FLAGS: --use-gl=angle --use-angle=swiftshader (precedent witness_dw_pixelprobe.js).
 *
 * CLAIMS (Duplex, a real picked element):
 *   A1 OPEN-REAL      — clicking Open → Duplex loads the building as editable meshes (group has ≥1 featureId mesh).
 *   A2 PICK-REAL      — a real mouse click on an element SELECTS it (window.Bonsai._selSet gains exactly that fid).
 *   A3 MOVE-ENTER     — clicking the Move pill enters move mode (b-move 'on') and builds the XYZ gizmo in the scene.
 *   A4 DRAG-COMMITS   — a real X-handle drag+release commits EXACTLY ONE GEOM_MOVE op for the selected fid (op-log +1).
 *   A5 ATOMIC         — the moved mesh's bbox-centre displacement == the committed op delta within 1e-3m
 *                       (what is committed IS what is rendered — one coherent result, no drift).
 *   A6 AXIS-PERFECT   — an X drag moves ONLY X: op dy==0 and dz==0, |dx|>0.01 (the axis constraint held).
 *   A7 VISIBLE        — the framebuffer changed after the move (readPixels checksum differs → the user SEES it move).
 *   A8 REVERSIBLE     — UNDO via the real history slider restores the bbox-centre to the original within 1e-3m and
 *                       drops the op cursor by 1 (the action is atomic + perfectly reversible).
 *   A9 NO-ERROR       — no pageerror across the whole sequence.
 */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ROOT = path.join(__dirname, '..', '..');
const SHOTS = path.join(__dirname, 'e2e_shots'); try { fs.mkdirSync(SHOTS, { recursive: true }); } catch (e) {}
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.db': 'application/octet-stream', '.data': 'application/octet-stream' };
const server = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/modeller/modeller.html';
  fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { r.writeHead(404); r.end('404 ' + p); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Accept-Ranges': 'bytes' }); r.end(b); }); });

(async () => {
  await new Promise(r => server.listen(0, r)); const port = server.address().port;
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const pg = await br.newPage(); await pg.setViewport({ width: 1200, height: 850, deviceScaleFactor: 2 });
  const errs = []; pg.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  const slog = []; pg.on('console', m => { const t = m.text(); if (/^§(MOVE|SDG|GATE)/.test(t)) slog.push(t); });
  // F4: capture real guide frames at the asserted moments (2× DPR; non-invent — these ARE the app frames)
  const shot = (label) => pg.screenshot({ path: path.join(SHOTS, 'W-E2E-MOVE-' + label + '.png') }).catch(() => {});

  console.log('═══ W-E2E-MOVE — real user: open → pick → move gizmo drag → commit → undo (maths-asserted, atomic) ═══');
  await pg.goto(`http://localhost:${port}/modeller/modeller.html`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('window.__sceneReady === true && !!window.THREE && !!window.A && !!window.Bonsai', { timeout: 30000 }).catch(() => {});

  // A1 — real Open → Duplex
  await pg.click('#b-open'); await sleep(200);
  await pg.click('#m-open-panel .mo-row[data-key="Duplex"]');
  await pg.waitForFunction(() => !!window.__dwBuf, { timeout: 30000 }).catch(() => {});
  await sleep(2500);
  const fit = await pg.$('#b-fit'); if (fit) { await fit.click(); await sleep(600); }

  const editable = await pg.evaluate(() => {
    const g = window.Bonsai.group(); return g.children.filter(o => o.isMesh && o.userData && o.userData.featureId != null).length;
  });

  // in-page helper: project a world point → client px (THREE is global, camera = window.A.camera)
  await pg.evaluate(() => {
    window.__e2e = {
      proj(x, y, z) { const v = new window.THREE.Vector3(x, y, z).project(window.A.camera);
        const cv = window.A.renderer.domElement, r = cv.getBoundingClientRect();
        return [(v.x * 0.5 + 0.5) * r.width + r.left, (-v.y * 0.5 + 0.5) * r.height + r.top, v.z]; },
      centre(fid) { const g = window.Bonsai.group(); const m = g.children.find(o => o.isMesh && o.userData.featureId === fid);
        if (!m) return null; m.geometry.computeBoundingBox(); const b = new window.THREE.Box3().setFromObject(m);
        const c = new window.THREE.Vector3(); b.getCenter(c); return [c.x, c.y, c.z]; },
      pixsum() { const r = window.A.renderer; r.render(window.A.scene, window.A.camera); const gl = r.getContext();
        const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, px = new Uint8Array(w * h * 4);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px); let s = 0; for (let i = 0; i < px.length; i += 257) s = (s + px[i]) >>> 0; return s; },
      // candidate elements with the largest projected screen footprint → most reliable to click
      candidates() { const g = window.Bonsai.group(); const out = [];
        for (const m of g.children) { if (!m.isMesh || m.userData.featureId == null) continue;
          const b = new window.THREE.Box3().setFromObject(m); if (!isFinite(b.min.x)) continue;
          const c = new window.THREE.Vector3(); b.getCenter(c); const p = this.proj(c.x, c.y, c.z);
          const cv = window.A.renderer.domElement, r = cv.getBoundingClientRect();
          if (p[0] < r.left + 20 || p[0] > r.right - 20 || p[1] < r.top + 20 || p[1] > r.bottom - 20 || p[2] > 1) continue;
          const sz = new window.THREE.Vector3(); b.getSize(sz);
          out.push({ fid: m.userData.featureId, sx: p[0], sy: p[1], vol: sz.x * sz.y * sz.z }); }
        out.sort((a, b) => b.vol - a.vol); return out.slice(0, 12); }
    };
    return true;
  });

  // A2 — real pick: click candidates until one selects
  const cands = await pg.evaluate(() => window.__e2e.candidates());
  let fid = null;
  for (const c of cands) {
    await pg.mouse.move(c.sx, c.sy); await sleep(40); await pg.mouse.click(c.sx, c.sy); await sleep(120);
    const sel = await pg.evaluate(() => Array.from(window.Bonsai._selSet || []));
    if (sel.length === 1) { fid = sel[0]; break; }
  }
  // §ZOOM-SEL: the pick auto-flew the camera (zoomToSelection) — wait it out before computing any drag
  // coordinates, or they are stale mid-fly (a real user drags on the settled frame)
  { const t0 = Date.now(); while (Date.now() - t0 < 15000 && await pg.evaluate(() => !!window.__flyLive)) await sleep(120); }
  await sleep(300);
  const c0 = fid != null ? await pg.evaluate(f => window.__e2e.centre(f), fid) : null;
  const oplog0 = await pg.evaluate(() => ({ len: window.Bonsai.oplog.length, cur: window.Bonsai.oplog.cursor }));
  const pix0 = await pg.evaluate(() => window.__e2e.pixsum());

  // A3 — enter Move
  await pg.click('#b-move'); await sleep(300);
  const moveState = await pg.evaluate(() => {
    const giz = window.A.scene.children.find(o => o.name === 'MoveGizmo');
    let handle = null;
    if (giz) { giz.updateMatrixWorld(true); giz.traverse(o => { if (o.isMesh && o.userData.moveAxis === 'x' && !handle) handle = o; }); }
    const wp = handle ? handle.getWorldPosition(new window.THREE.Vector3()) : null;
    return { on: document.getElementById('b-move').classList.contains('on'), hasGizmo: !!giz,
      handleWorld: wp ? [wp.x, wp.y, wp.z] : null };
  });
  await shot('gizmo');   // guide frame: the XYZ transform gizmo raised on the selected element (A3 asserted)

  // A4/A5/A6 — real drag of the X handle: down on the shaft, move +1.0m along world-X, release
  let dragErr = '';
  if (moveState.handleWorld) {
    const Wh = moveState.handleWorld, DELTA = 1.0;
    const down = await pg.evaluate(w => window.__e2e.proj(w[0], w[1], w[2]), Wh);
    const up = await pg.evaluate((w, d) => window.__e2e.proj(w[0] + d, w[1], w[2]), Wh, DELTA);
    await pg.mouse.move(down[0], down[1]); await sleep(40);
    await pg.mouse.down(); await sleep(40);
    await pg.mouse.move((down[0] + up[0]) / 2, (down[1] + up[1]) / 2, { steps: 4 }); await sleep(40);
    await pg.mouse.move(up[0], up[1], { steps: 6 }); await sleep(60);
    await pg.mouse.up(); await sleep(500);
  } else { dragErr = 'no X handle found on gizmo'; }

  const after = await pg.evaluate(f => {
    const ops = window.Bonsai.oplog._geomOps();
    const last = ops[ops.length - 1] || null;
    return { len: window.Bonsai.oplog.length, cur: window.Bonsai.oplog.cursor,
      lastType: last && last.op_type, lastParent: last && last.parameters && last.parameters.parent,
      d: last && last.parameters ? [last.parameters.dx, last.parameters.dy, last.parameters.dz] : null,
      centre: window.__e2e.centre(f) };
  }, fid);
  const pix1 = await pg.evaluate(() => window.__e2e.pixsum());
  await shot('moved');   // guide frame: the element after the committed X-axis GEOM_MOVE (A5/A7 asserted)

  // A8 — UNDO via the real history slider (range input → scrubToShared → oplog.scrubTo)
  await pg.evaluate(() => { const s = document.getElementById('hist-slider'); s.value = Math.max(0, (window.Bonsai.oplog.cursor - 1)); s.dispatchEvent(new Event('input', { bubbles: true })); });
  await sleep(600);
  const undo = await pg.evaluate(f => ({ cur: window.Bonsai.oplog.cursor, centre: window.__e2e.centre(f) }), fid);

  await br.close(); server.close();

  const disp = (a, b) => a && b ? [b[0] - a[0], b[1] - a[1], b[2] - a[2]] : null;
  const d_move = disp(c0, after.centre);            // bbox-centre displacement vs committed op delta
  const d_undo = disp(c0, undo.centre);             // residual after undo
  const norm = v => v ? Math.hypot(v[0], v[1], v[2]) : Infinity;
  const opd = after.d || [0, 0, 0];
  const atomicErr = (d_move && after.d) ? Math.hypot(d_move[0] - opd[0], d_move[1] - opd[1], d_move[2] - opd[2]) : Infinity;

  console.log('  §OPEN editableMeshes=' + editable + ' picked fid=' + fid + ' c0=' + JSON.stringify(c0));
  console.log('  §MOVE-STATE ' + JSON.stringify(moveState) + (dragErr ? ' ERR=' + dragErr : ''));
  console.log('  §AFTER op=' + after.lastType + ' parent=' + after.lastParent + ' delta=' + JSON.stringify(after.d) +
    ' centreDisp=' + JSON.stringify(d_move ? d_move.map(x => +x.toFixed(4)) : null) + ' atomicErr=' + atomicErr.toExponential(2) + 'm');
  console.log('  §PIX before=' + pix0 + ' afterMove=' + pix1 + ' (changed=' + (pix0 !== pix1) + ')');
  console.log('  §UNDO cursor ' + after.cur + '→' + undo.cur + ' residual=' + norm(d_undo).toExponential(2) + 'm');
  slog.forEach(l => console.log('  ' + l));

  let pass = 0, fail = 0;
  const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };
  chk('A1 OPEN-REAL (editable meshes)', editable > 0, 'meshes=' + editable);
  chk('A2 PICK-REAL (one element selected)', fid != null, 'fid=' + fid);
  chk('A3 MOVE-ENTER (mode on + gizmo)', moveState.on === true && moveState.hasGizmo === true, JSON.stringify({ on: moveState.on, gizmo: moveState.hasGizmo }));
  chk('A4 DRAG-COMMITS exactly one GEOM_MOVE', after.lastType === 'GEOM_MOVE' && after.lastParent === fid && after.len === oplog0.len + 1, 'type=' + after.lastType + ' parent=' + after.lastParent + ' len ' + oplog0.len + '→' + after.len);
  chk('A5 ATOMIC (render delta == committed delta)', atomicErr < 1e-3, 'atomicErr=' + atomicErr.toExponential(2) + 'm');
  chk('A6 AXIS-PERFECT (X-only)', after.d != null && Math.abs(opd[0]) > 0.01 && Math.abs(opd[1]) < 1e-6 && Math.abs(opd[2]) < 1e-6, 'delta=' + JSON.stringify(after.d));
  chk('A7 VISIBLE (framebuffer changed)', pix0 !== pix1, 'pixsum ' + pix0 + '→' + pix1);
  chk('A8 REVERSIBLE (undo restores ≤1e-3m, cursor−1)', norm(d_undo) < 1e-3 && undo.cur === after.cur - 1, 'residual=' + norm(d_undo).toExponential(2) + 'm cursor ' + after.cur + '→' + undo.cur);
  chk('A9 NO-ERROR', errs.length === 0 && !dragErr, (dragErr || '') + ' ' + errs.slice(0, 2).join(' | '));

  console.log('W-E2E-MOVE: ' + pass + ' PASS / ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
})();
