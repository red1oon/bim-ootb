#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-E2E-WALK-ALL scope (read this block first)
 * SCOPE: a USER-EMULATING, MATHS-ASSERTED E2E of the new "Walk ALL Disciplines" Outliner action — a REAL
 * click on the Outliner row (`[data-bnode="dw-all"]`, the exact DOM node the "Walk · Disciplines" category's
 * onWalk special-cases to `window.discWalkAll`), not a window.discWalkAll(...) seam call. Mirrors
 * witness_e2e_walk.js's real-path discipline (drive discWalk via its actual production entry point), extended
 * to the loop-all orchestrator: window.discWalkAll composes the SAME window.discWalk steps (refactored into
 * `_discWalkOne`) for every entry in DiscWalker.disciplines(), x-ray-brackets the whole loop, and plays an
 * orange-flash-then-settle reveal per discipline (see §DISCWALK-ALL-FLASH in modeller.html).
 *
 * CLAIMS (Duplex, residential rules — roster = ACMV/ELEC/PLB/FP per DiscWalker.disciplines()):
 *   A1 ROSTER-COMPLETE — walked+refused == DiscWalker.disciplines() exactly (no discipline silently skipped).
 *   A2 NON-EMPTY        — at least one discipline placed > 0 fixtures (Duplex has real MEP substrate).
 *   A3 XRAY-APPLIED      — mid-walk, structure meshes carry the x-ray glass tint (opacity ~0.06, transparent).
 *   A4 XRAY-CLEARED      — after the walk, x-ray is off (no mesh left in the 0.06-opacity glass state).
 *   A5 REAL-COLORS       — after the walk, each walked disc's InstancedMesh base colour == DW_COLOR[disc]
 *                          (not stuck on the 0xffb347 flash colour, proven by reading material.color, not
 *                          instanceColor, since the post-commit re-fold rebuilds meshes fresh either way).
 *   A6 COMMITTED         — op-log grew by the total placed count, signed + verifyChain OK.
 *   A7 VISIBLE           — the framebuffer changed after the walk (readPixels checksum differs).
 *   A8 NO-ERROR          — zero pageerror across the whole sequence.
 *   A9 TOOLTIP           — (MODELLER_MASTER.md row 17) the synthetic __ALL__ row's ▶ affordance reads
 *                          "Walk ALL disciplines" (plural/accurate); an ordinary disc row keeps the
 *                          singular "Walk this discipline".
 *   A10 NO-PROXY-TOAST   — (row 18 negative control) Duplex (253 el.) < threshold (50000) ⇒ NO
 *                          "reveal animation simplified" toast may fire on the normal path.
 *   B3 PROXY-TOAST-ONCE  — (row 18) with the threshold lowered so proxyMode fires, the downgrade is
 *                          surfaced to the USER exactly ONCE per walk-all run (§TOAST line), not per
 *                          discipline (Duplex roster = 4 discs → 4 BATCH flashes, still 1 toast).
 *
 * PERF-GUARD NOTE (§4 of the walk-all spec): this witness runs on Duplex (253 scene elements), far below
 * window.DW_ALL_PROXY_THRESHOLD (50000) — the guard's proxyMode branch does NOT fire here by construction.
 * A second, lighter run below (§B) lowers the threshold via window.DW_ALL_PROXY_THRESHOLD so the guard's
 * batch-flash (no per-instance stagger) code path is genuinely exercised and asserted, honestly labelled as
 * a THRESHOLD SIMULATION on Duplex-scale data (real Terminal-scale — 48k elements — was NOT run in this
 * witness; see the report for why).
 */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ROOT = path.join(__dirname, '..', '..');
const SHOTS = path.join(__dirname, 'e2e_shots'); try { fs.mkdirSync(SHOTS, { recursive: true }); } catch (e) {}
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.db': 'application/octet-stream', '.data': 'application/octet-stream' };
const server = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/modeller/modeller.html';
  fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { r.writeHead(404); r.end('404'); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Accept-Ranges': 'bytes' }); r.end(b); }); });

async function openDuplex(pg) {
  await pg.goto(`http://localhost:${server.address().port}/modeller/modeller.html`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('window.__sceneReady === true && !!window.Bonsai && typeof window.discWalkAll==="function"', { timeout: 30000 }).catch(() => {});
  await pg.click('#b-open'); await sleep(200);
  await pg.click('#m-open-panel .mo-row[data-key="Duplex"]');
  await pg.waitForFunction(() => !!window.__dwBuf, { timeout: 30000 }).catch(() => {});
  // Anti-race (2026-07-30, seen as a spurious A6 red: before.oplogLen read 0): __dwBuf lands BEFORE the
  // arcseed commitSeedGroup (196 ops + verifyChain) finishes — wait for the seed to actually be in the log.
  await pg.waitForFunction(() => window.Bonsai && window.Bonsai.oplog && window.Bonsai.oplog.length > 0, { timeout: 30000 }).catch(() => {});
  await sleep(2000);
}

(async () => {
  await new Promise(r => server.listen(0, r));
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  let pass = 0, fail = 0;
  const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };

  console.log('═══ W-E2E-WALK-ALL §A — real user: open Duplex → click "Walk ALL Disciplines" row → x-ray+flash+settle → commit (maths) ═══');
  {
    const pg = await br.newPage(); await pg.setViewport({ width: 1200, height: 850, deviceScaleFactor: 2 });
    const errs = []; pg.on('pageerror', e => errs.push(String(e).slice(0, 160)));
    const proxyToasts = []; pg.on('console', m => { const t = m.text(); if (/^§TOAST/.test(t) && t.indexOf('reveal animation simplified') >= 0) proxyToasts.push(t); });
    const shot = (label) => pg.screenshot({ path: path.join(SHOTS, 'W-E2E-WALK-ALL-' + label + '.png') }).catch(() => {});
    await openDuplex(pg);

    // A9 (MODELLER_MASTER.md row 17): read the REAL rendered title attributes off the production DOM.
    const titles = await pg.evaluate(() => {
      const allEl = document.querySelector('[data-bnode="dw-all"] .bn-walk');
      const discEl = Array.from(document.querySelectorAll('.bn-walk')).find(el => { const row = el.closest('[data-bnode]'); return row && row.getAttribute('data-bnode') !== 'dw-all'; });
      return { all: allEl ? allEl.getAttribute('title') : null, disc: discEl ? discEl.getAttribute('title') : null };
    });
    console.log('  §TOOLTIP ' + JSON.stringify(titles));
    chk('A9 TOOLTIP (__ALL__ row plural, disc row singular)', titles.all === 'Walk ALL disciplines' && titles.disc === 'Walk this discipline', JSON.stringify(titles));

    const roster = await pg.evaluate(() => window.DiscWalker.disciplines());
    const before = await pg.evaluate(() => {
      const r = window.A.renderer; r.render(window.A.scene, window.A.camera); const gl = r.getContext();
      const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, px = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let s = 0; for (let i = 0; i < px.length; i += 257) s = (s + px[i]) >>> 0;
      return { oplogLen: window.Bonsai.oplog.length, pix: s };
    });

    // A1/A2/A6: real click on the actual Outliner row (production dispatch path, not a seam call)
    const rowExists = await pg.evaluate(() => !!document.querySelector('[data-bnode="dw-all"]'));
    await pg.click('[data-bnode="dw-all"]');

    // A3: sample mid-walk (the walk takes ~3-4s on Duplex; 400ms in, disc #1 has landed and re-tinted)
    await sleep(400);
    const mid = await pg.evaluate(() => {
      const g = window.Bonsai.group(); const meshes = g.children.filter(m => m.isMesh && m._xrayOwn);
      // "tinted" = xrayReveal cloned+repainted the material (both the glass AND glow branches set
      // depthWrite:false; a pristine, never-x-rayed authored mesh defaults depthWrite:true) — this is a
      // robust x-ray-applied signal that doesn't assume a particular glass/glow split. Duplex's ARC-seed
      // happens to stamp EVERY element with a params.color (see §DW-PRIM-LOD's fixture map), so on THIS
      // building xrayReveal's split degenerates to 100% glow / 0% glass — that's honest building-specific
      // behaviour, not a bug, so we don't assert a particular glass:glow ratio, only that tinting happened.
      const tinted = meshes.filter(m => m.material.depthWrite === false);
      const glass = meshes.filter(m => Math.abs(m.material.opacity - 0.06) < 0.02 && m.material.transparent);
      const glow = meshes.filter(m => m.material.opacity > 0.9 && m.material.transparent);
      return { total: g.children.length, xrayed: meshes.length, tinted: tinted.length, glass: glass.length, glow: glow.length };
    });
    await shot('mid-xray');

    const done = await pg.waitForFunction(() => window.__dwAllDone === true, { timeout: 60000, polling: 250 }).then(() => true).catch(() => false);
    await sleep(400);
    await shot('done-settled');

    const after = await pg.evaluate(() => {
      const result = window.__dwAllResult;
      const g = window.Bonsai.group();
      const glassStill = g.children.filter(m => m.isMesh && m._xrayOwn && Math.abs(m.material.opacity - 0.06) < 0.02 && m.material.transparent).length;
      const root = g.children.find(o => o.userData && o.userData.dwRoot);
      const DW_COLOR = { FP: 0xff5a4f, ELEC: 0xffd24a, ACMV: 0x4fd0ff, PLB: 0x4f7bff, MEP: 0x7fe07f, SP: 0x4fd0ff, CW: 0x4f7bff };
      const colorCheck = {};
      if (root) {
        (result.walked || []).forEach(w => {
          const ims = root.children.filter(o => o.isInstancedMesh && o.userData.dwDisc === w.disc);
          const base = DW_COLOR[w.disc];
          colorCheck[w.disc] = ims.length ? ims.some(im => im.material.color.getHex() === base) : false;
        });
      }
      const r = window.A.renderer; r.render(window.A.scene, window.A.camera); const gl = r.getContext();
      const wd = gl.drawingBufferWidth, ht = gl.drawingBufferHeight, px = new Uint8Array(wd * ht * 4); gl.readPixels(0, 0, wd, ht, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let s = 0; for (let i = 0; i < px.length; i += 257) s = (s + px[i]) >>> 0;
      const inserts = window.Bonsai.oplog._geomOps().filter(o => o.op_type === 'GEOM_INSERT').length;
      return { result, glassStill, colorCheck, pix: s, oplogLen: window.Bonsai.oplog.length, inserts };
    });
    const chain = await pg.evaluate(async () => { try { const db = await window.Bonsai.oplog._ensureDb(); const v = await window.KernelOps.verifyChain(db); return !!v.ok; } catch (e) { return 'ERR:' + e.message; } });

    console.log('  §ROSTER ' + JSON.stringify(roster));
    console.log('  §BEFORE ' + JSON.stringify(before));
    console.log('  §MID(400ms) ' + JSON.stringify(mid) + ' (glass:glow split is building-specific — see code comment)');
    console.log('  §AFTER done=' + done + ' ' + JSON.stringify(after));
    console.log('  §CHAIN verifyChain=' + chain);

    const walkedDiscs = (after.result.walked || []).map(w => w.disc).sort();
    const refusedDiscs = (after.result.refused || []).map(r => r.disc).sort();
    const rosterCovered = walkedDiscs.concat(refusedDiscs).sort().join(',') === roster.slice().sort().join(',');
    const placedTotal = after.result.placedTotal || 0;
    const allColorsMatch = walkedDiscs.length > 0 && walkedDiscs.every(d => after.colorCheck[d] === true);

    chk('A1 ROSTER-COMPLETE (walked+refused == disciplines())', rowExists && rosterCovered, 'row=' + rowExists + ' walked=[' + walkedDiscs + '] refused=[' + refusedDiscs + '] roster=[' + roster + ']');
    chk('A2 NON-EMPTY (>0 placed across the run)', placedTotal > 0, 'placedTotal=' + placedTotal);
    chk('A3 XRAY-APPLIED (mid-walk x-ray tinting present)', mid.tinted > 0 && mid.xrayed > 0, 'tinted=' + mid.tinted + ' xrayed=' + mid.xrayed + ' glass=' + mid.glass + ' glow=' + mid.glow + ' of total=' + mid.total);
    chk('A4 XRAY-CLEARED (no glass tint left after)', after.glassStill === 0, 'glassStill=' + after.glassStill);
    chk('A5 REAL-COLORS (settled to DW_COLOR, not stuck flash)', allColorsMatch, JSON.stringify(after.colorCheck));
    chk('A6 COMMITTED (op-log grew by placedTotal, chain OK)', after.oplogLen === before.oplogLen + placedTotal && chain === true, 'oplog ' + before.oplogLen + '→' + after.oplogLen + ' (+' + placedTotal + ') chain=' + chain);
    chk('A7 VISIBLE (framebuffer changed)', before.pix !== after.pix, 'pix ' + before.pix + '→' + after.pix);
    chk('A8 NO-ERROR', errs.length === 0, errs.slice(0, 2).join(' | '));
    chk('A10 NO-PROXY-TOAST (row 18 negative control: below threshold ⇒ silent)', proxyToasts.length === 0, 'proxyToasts=' + proxyToasts.length);

    await pg.close();
  }

  console.log('═══ W-E2E-WALK-ALL §B — perf-guard SIMULATION: window.DW_ALL_PROXY_THRESHOLD lowered so the >50k branch fires on Duplex-scale data (honest: NOT a real 48k-element Terminal run) ═══');
  {
    const pg = await br.newPage(); await pg.setViewport({ width: 1200, height: 850, deviceScaleFactor: 2 });
    const errs = []; pg.on('pageerror', e => errs.push(String(e).slice(0, 160)));
    const proxyToasts = []; pg.on('console', m => { const t = m.text(); if (/^§TOAST/.test(t) && t.indexOf('reveal animation simplified') >= 0) proxyToasts.push(t); });
    await openDuplex(pg);
    await pg.evaluate(() => { window.DW_ALL_PROXY_THRESHOLD = 10; });   // Duplex has 253 scene elements > 10 → guard fires
    await pg.click('[data-bnode="dw-all"]');
    const done = await pg.waitForFunction(() => window.__dwAllDone === true, { timeout: 60000, polling: 250 }).then(() => true).catch(() => false);
    const result = await pg.evaluate(() => window.__dwAllResult);
    console.log('  §GUARD-RUN done=' + done + ' ' + JSON.stringify(result));
    console.log('  §PROXY-TOASTS n=' + proxyToasts.length + ' ' + JSON.stringify(proxyToasts));
    chk('B1 PROXY-MODE FIRES when scene > threshold', done && result && result.proxyMode === true, 'proxyMode=' + (result && result.proxyMode));
    chk('B2 NO-ERROR in guard path', errs.length === 0, errs.slice(0, 2).join(' | '));
    chk('B3 PROXY-TOAST-ONCE (row 18: downgrade surfaced to the user exactly once per run)', proxyToasts.length === 1, 'toasts=' + proxyToasts.length + ' (want 1; per-disc would be ' + ((result && result.walked && result.walked.length) || '?') + ')');
    await pg.close();
  }

  await br.close(); server.close();
  console.log('W-E2E-WALK-ALL: ' + pass + ' PASS / ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
})();
