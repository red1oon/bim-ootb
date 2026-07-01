#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-E2E-WALK scope (read this block first)
 * SCOPE: a USER-EMULATING, MATHS-ASSERTED E2E of the generative WALK tool through the REAL production path
 *   (window.discWalk — the exact handler the Outliner "Walk · <disc>" row's onWalk calls), NOT the engine seam
 *   (dwOpen/dwWalk) the older witnesses used. The seam HID two real defects this gate exists to lock out:
 *     (1) discWalk awaited _dwEnsureBorrow before rendering, and the rules-DB IDB cache HUNG under transaction
 *         contention → the Walk tool rendered NOTHING for the user (nondeterministic). FIX: timeout-guarded IDB
 *         cache in disc_walker.js (a stalled IDB op falls back to a bare fetch).
 *     (2) _commitDiscWalk committed N placements as N separate sealed op-log commits (~0.4s each) → a 267-fixture
 *         ELEC walk FROZE the UI for 112s. FIX: one batched commitSeedGroup (~1s).
 *   This gate drives the real path and asserts — by NUMBERS off the op-log + scene graph + framebuffer — that the
 *   Walk completes promptly, renders every fixture, lands in the signed log, verifies, paints, and reverses.
 *
 * THE WORKING SWIFTSHADER FLAGS: --use-gl=angle --use-angle=swiftshader (precedent witness_dw_pixelprobe.js).
 *
 * CLAIMS (Duplex ELEC, residential rules):
 *   W1 COMPLETES-FAST  — the real discWalk user action finishes (commit done) in < 15s (was STALL-forever, then 112s).
 *   W2 RENDERED        — dwRoot carries ELEC InstancedMesh(es) whose instances == the walked fixture count (all painted).
 *   W3 NON-EMPTY       — the walk placed > 0 fixtures (honest non-refuse on a real residential building).
 *   W4 COMMITTED       — the op-log grew by the placement count as GEOM_INSERT (the walk is in the signed log).
 *   W5 CHAIN-OK        — verifyChain passes after the batched commit (the signed hash-chain is intact).
 *   W6 REVERSIBLE      — scrubbing the history slider back to pre-walk clears the ELEC fixtures (cursor restored).
 *   W7 VISIBLE         — the framebuffer changed after the walk (readPixels checksum differs → the user SEES it).
 *   W8 NO-ERROR        — no pageerror across the sequence.
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

(async () => {
  await new Promise(r => server.listen(0, r)); const port = server.address().port;
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const pg = await br.newPage(); await pg.setViewport({ width: 1200, height: 850, deviceScaleFactor: 2 });
  const errs = []; pg.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  // F4: capture the real Walk guide frame at the asserted moment (2× DPR; non-invent — the actual app frame)
  const shot = (label) => pg.screenshot({ path: path.join(SHOTS, 'W-E2E-WALK-' + label + '.png') }).catch(() => {});

  console.log('═══ W-E2E-WALK — real user: open → Walk ELEC (production discWalk) → render+commit → undo (maths) ═══');
  await pg.goto(`http://localhost:${port}/modeller/modeller.html`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('window.__sceneReady === true && !!window.Bonsai && typeof window.discWalk==="function"', { timeout: 30000 }).catch(() => {});
  await pg.click('#b-open'); await sleep(200);
  await pg.click('#m-open-panel .mo-row[data-key="Duplex"]');
  await pg.waitForFunction(() => !!window.__dwBuf, { timeout: 30000 }).catch(() => {});
  await sleep(2000);

  const before = await pg.evaluate(() => {
    const census = () => { const g = window.Bonsai.group(); const root = g && g.children.find(o => o.userData && o.userData.dwRoot);
      const kids = root ? root.children : []; const e = kids.filter(o => o.userData && o.userData.dwDisc === 'ELEC');
      return { elecObjs: e.length, instances: e.reduce((s, o) => s + (o.isInstancedMesh ? (o.count || 0) : 0), 0) }; };
    const r = window.A.renderer; r.render(window.A.scene, window.A.camera); const gl = r.getContext();
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, px = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let s = 0; for (let i = 0; i < px.length; i += 257) s = (s + px[i]) >>> 0;
    return { oplogLen: window.Bonsai.oplog.length, cur: window.Bonsai.oplog.cursor, pix: s, ...census() };
  });

  // W1 — fire the REAL production Walk handler (what the Outliner "Walk · ELEC" row's onWalk calls) + time to commit-done
  const t0 = Date.now();
  await pg.evaluate(() => window.discWalk('ELEC', { building: 'Duplex' }));
  const completed = await pg.waitForFunction(() => window.__dwLastCommitDisc === 'ELEC', { timeout: 25000, polling: 250 }).then(() => true).catch(() => false);
  const walkMs = Date.now() - t0;
  await sleep(300);

  const after = await pg.evaluate(() => {
    const g = window.Bonsai.group(); const root = g && g.children.find(o => o.userData && o.userData.dwRoot);
    const kids = root ? root.children : []; const e = kids.filter(o => o.userData && o.userData.dwDisc === 'ELEC');
    let chainOk = false; try { chainOk = !!(window.__lastGate || true); } catch (x) {}
    const inserts = window.Bonsai.oplog._geomOps().filter(o => o.op_type === 'GEOM_INSERT').length;
    const r = window.A.renderer; r.render(window.A.scene, window.A.camera); const gl = r.getContext();
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, px = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let s = 0; for (let i = 0; i < px.length; i += 257) s = (s + px[i]) >>> 0;
    return { n: (window.__dwWalks && window.__dwWalks.ELEC || []).length, elecObjs: e.length,
      instances: e.reduce((a, o) => a + (o.isInstancedMesh ? (o.count || 0) : 0), 0),
      oplogLen: window.Bonsai.oplog.length, cur: window.Bonsai.oplog.cursor, inserts, pix: s };
  });
  // W5 — verifyChain on the live kernel_ops db
  const chain = await pg.evaluate(async () => { try { const db = await window.Bonsai.oplog._ensureDb(); const v = await window.KernelOps.verifyChain(db); return !!v.ok; } catch (e) { return 'ERR:' + e.message; } });

  // capture the REAL status-bar line the Walk emits (before Fit overwrites it) — for truthful guide copy
  const statusLine = await pg.evaluate(() => (document.getElementById('stat') || {}).textContent || '');
  // guide frame: the walked ELEC fixtures rendered across the Duplex (W2/W7 asserted). Fit first to frame them.
  const fitB = await pg.$('#b-fit'); if (fitB) { await fitB.click(); await sleep(600); }
  await shot('fixtures');

  // W6 — UNDO via the real history slider back to pre-walk cursor
  await pg.evaluate(c => { const s = document.getElementById('hist-slider'); s.value = c; s.dispatchEvent(new Event('input', { bubbles: true })); }, before.cur);
  await sleep(800);
  const undo = await pg.evaluate(() => { const g = window.Bonsai.group(); const root = g && g.children.find(o => o.userData && o.userData.dwRoot);
    const kids = root ? root.children : []; const e = kids.filter(o => o.userData && o.userData.dwDisc === 'ELEC');
    return { cur: window.Bonsai.oplog.cursor, elecObjs: e.length, elecInstances: e.reduce((a, o) => a + (o.isInstancedMesh ? (o.count || 0) : 0), 0) }; });

  await br.close(); server.close();

  console.log('  §BEFORE ' + JSON.stringify(before));
  console.log('  §WALK completed=' + completed + ' walkMs=' + walkMs + ' ' + JSON.stringify(after));
  console.log('  §CHAIN verifyChain=' + chain);
  console.log('  §STATUS ' + JSON.stringify(statusLine));
  console.log('  §UNDO ' + JSON.stringify(undo));

  let pass = 0, fail = 0;
  const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };
  chk('W1 COMPLETES-FAST (<15s, no hang/freeze)', completed && walkMs < 15000, 'completed=' + completed + ' walkMs=' + walkMs);
  chk('W2 RENDERED (instances == walked count)', after.elecObjs > 0 && after.instances === after.n && after.n > 0, 'objs=' + after.elecObjs + ' instances=' + after.instances + ' n=' + after.n);
  chk('W3 NON-EMPTY (real placement, not refuse)', after.n > 0, 'n=' + after.n);
  chk('W4 COMMITTED (op-log grew by n GEOM_INSERT)', after.oplogLen === before.oplogLen + after.n && after.inserts >= after.n, 'oplog ' + before.oplogLen + '→' + after.oplogLen + ' (+' + after.n + ') inserts=' + after.inserts);
  chk('W5 CHAIN-OK (verifyChain after batch)', chain === true, 'verifyChain=' + chain);
  chk('W6 REVERSIBLE (undo clears ELEC, cursor back)', undo.elecInstances === 0 && undo.cur === before.cur, 'elecInstances=' + undo.elecInstances + ' cursor ' + after.cur + '→' + undo.cur + ' (want ' + before.cur + ')');
  chk('W7 VISIBLE (framebuffer changed)', before.pix !== after.pix, 'pix ' + before.pix + '→' + after.pix);
  chk('W8 NO-ERROR', errs.length === 0, errs.slice(0, 2).join(' | '));

  console.log('W-E2E-WALK: ' + pass + ' PASS / ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
})();
