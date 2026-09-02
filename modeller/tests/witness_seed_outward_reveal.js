#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-SEED-OUTWARD-REVEAL scope (read this block first)
 * SCOPE: RESUME_MODELLER_WALK_SUBSTRATE.md §CAMPAIGN M4 — "the animation: MEP genuinely walking into the scene."
 *   M1 (routePattern bridge) + M2/M3 (joint STR+MEP clash gate, priority-order guard) + FOLLOW-UP (clash-clean
 *   network) are DONE. M4 wires the SAME construction-reveal mechanism seed_trunk.js's T1/T2 already ships
 *   (_renderSeedTrunk's BufferGeometry.drawRange, seed-outward ordered, easeOutCubic, prefers-reduced-motion
 *   safe, gate-asserted to end EXACTLY on the full proven geometry) over M1's PLB pattern-bridge network —
 *   NOT a second animation system. The instancing analogue of drawRange is InstancedMesh.count (modeller.html
 *   _renderDiscChains). ORDERING DESIGN NOTE (measured, not assumed — a BFS-over-the-segment-graph first design
 *   was tried and found wrong by THIS witness's own first run: on real Duplex data the FOLLOW-UP fix's envelope
 *   clash-filter removes the anchor-adjacent pairs, leaving a mostly-DISCONNECTED set of short fragments, not a
 *   walkable backbone like SeedTrunk's polylines — a graph BFS had nothing to walk). Current _seedOutwardChainOrder
 *   orders by straight-line distance from each segment's own real METER(CW)/STACK(SP) anchor instead — still
 *   invents no order beyond distances the pattern-bridge's own topology encodes, just measured point-to-point.
 *   A real nn-chain network (routeChains, no patternBridge) is UNCHANGED (instant, as before) — this gate proves
 *   the reveal engages ONLY for the pattern-bridged network, not for LANDED real chains.
 *
 * CLAIMS (Duplex PLB — residential, ARC-only, routePattern-bridged per M1):
 *   R1 REVEAL-ENGAGED   — the walk's patternBridge carries a real seed anchor; _seedOutwardChainOrder covers
 *                         every segment (unreached === 0, every segment had a real anchor to measure against).
 *   R2 SEED-OUTWARD     — INDEPENDENT check (not a re-run of the same distance calc): recomputing each ordered
 *                         segment's own min-endpoint distance to its real anchor directly from the RAW seg data
 *                         (not via the function under test) confirms the sequence is non-decreasing — the
 *                         literal "grows outward from the seed" property, not just "some order exists".
 *   R3 ANIMATED         — driving the SAME _renderDiscChains the live walk calls (opts default = animated):
 *                         sampled mid-flight count < full, §DW-CHAIN-ANIM logs mode=animated ... EXACT==net,
 *                         frames > 1 (matches _renderSeedTrunk's own P7 shape).
 *   R4 REDUCED-MOTION   — prefers-reduced-motion:reduce → instant fallback, frames=0, still ends on full net.
 *   R5 INSTANT-OPT      — opts.instant (the redraw-after-scrub path) → same instant fallback, no animation.
 *   R6 REAL-CHAIN UNCHANGED — a network with NO patternBridge (real nn-chain shape, simulated with meta=null)
 *                         renders the FULL count immediately (no reveal engaged) — proves the M4 change is
 *                         scoped to the pattern-bridged network only, not a blanket behaviour change.
 *   R7 PAINTED          — canvas non-blank after the full reveal (framebuffer actually received the tubes).
 *   R8 NO-ERROR.
 * REGRESSION — W-ROUTE-PATTERN-BRIDGE / W-E2E-WALK / W-E2E-WALK-ALL / W-E2E-WALK-IFCOPEN / W-SEED-TRUNK-RENDER
 *   must stay green (run separately; this gate does not perturb their own paths — real nn-chains skip reveal).
 */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.db': 'application/octet-stream', '.data': 'application/octet-stream' };
// same modeller/mep_rw.db-404 fixture-serve precedent as witness_route_pattern_bridge.js (separate, pre-existing,
// unrelated regression — the live isolated modeller only ships viewer/mep_rw.db today, not modeller/mep_rw.db)
const server = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/modeller/modeller.html';
  let fp = path.join(ROOT, p);
  if (p === '/modeller/mep_rw.db' && !fs.existsSync(fp)) fp = path.join(ROOT, 'viewer', 'mep_rw.db');
  fs.readFile(fp, (e, b) => { if (e) { r.writeHead(404); r.end('404'); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Accept-Ranges': 'bytes' }); r.end(b); }); });

(async () => {
  await new Promise(r => server.listen(0, r)); const port = server.address().port;
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const pg = await br.newPage(); await pg.setViewport({ width: 1100, height: 800 });
  const logs = []; pg.on('console', m => { const t = m.text(); if (/^§(DW-CHAIN-ANIM|DW-TUBE|DISC-WALK)/.test(t)) logs.push(t); });
  const errs = []; pg.on('pageerror', e => errs.push(String(e).slice(0, 200)));

  console.log('═══ W-SEED-OUTWARD-REVEAL — M4 construction reveal over M1\'s PLB pattern-bridge network (Duplex, headless) ═══');
  await pg.goto(`http://localhost:${port}/modeller/modeller.html`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('window.__sceneReady === true && !!window.Bonsai && typeof window.discWalk==="function" && !!window.__dwChainRender && !!window.__dwChainOrder',
    { timeout: 30000 }).catch(() => {});
  await pg.click('#b-open'); await sleep(200);
  await pg.click('#m-open-panel .mo-row[data-key="Duplex"]');
  await pg.waitForFunction(() => !!window.__dwBuf, { timeout: 30000 }).catch(() => {});
  await sleep(1000);
  // Same pre-priming witness_route_pattern_bridge.js's own "engine" evaluate does before its production-path
  // call — dwInit/_dwEnsureBorrow/rwInit are each idempotent, so this just establishes the same warmed state a
  // real session reaches after its first interactions (not a special-case for this witness).
  await pg.evaluate(async () => {
    await window.DiscWalker.dwInit(window.SQL, './', window._dwRules(window.__dwName));
    await window._dwEnsureBorrow();
    await window.rwInit(window.SQL, './');
  });

  // REAL PRODUCTION WALK (window.discWalk — the Outliner "Walk" handler) to get a genuine patternBridge network.
  await pg.evaluate(() => window.discWalk('PLB', { building: window.__dwName }));
  const chainCommitted = await pg.waitForFunction(() => window.__dwLastChainDisc === 'PLB', { timeout: 25000, polling: 250 }).then(() => true).catch(() => false);
  await sleep(2600);   // let the FIRST (live) reveal finish before we re-drive it deterministically below

  const walked = await pg.evaluate(() => ({
    n: (window.__dwChains && window.__dwChains.PLB && window.__dwChains.PLB.length) || 0,
    meta: window.__dwChainMeta && window.__dwChainMeta.PLB
  }));

  // R1/R2 — order, computed ONCE off the real walked network (independent of the render's own timing). R2 is an
  // INDEPENDENT recomputation of each segment's own distance directly from raw from/to + the real anchor points
  // (not calling _seedOutwardChainOrder's internals again) — a real check the function's OUTPUT order matches
  // what "distance from the real anchor" actually means, not a tautological re-run of the same code.
  const order = await pg.evaluate(() => {
    const segs = window.__dwChains.PLB, meta = window.__dwChainMeta.PLB;
    if (!segs || !meta || !meta.seed) return { skip: true };
    const info = window.__dwChainOrder(segs, meta);
    const ordered = info.ordered;
    function dist3(p, a) { return Math.hypot(p[0] - a.x, p[1] - a.y, p[2] - a.z); }
    function realDist(s) {
      const anchor = (s.from_kind === 'RW_SP') ? meta.riser : meta.seed;
      return Math.min(dist3(s.from, anchor), dist3(s.to, anchor));
    }
    let violations = 0, prev = -Infinity;
    ordered.forEach(s => { const d = realDist(s); if (d < prev - 1e-9) violations++; prev = d; });
    return { violations, checked: ordered.length, unreached: info.unreached, n: segs.length };
  });

  // R3/R4/R5/R6 — re-drive _renderDiscChains DETERMINISTICALLY via the exposed witness seam, isolating each mode.
  logs.length = 0;
  await pg.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
  await pg.evaluate(() => { window.__dwChainRender('PLB', window.__dwChains.PLB, { patternBridge: window.__dwChainMeta.PLB }); });
  await sleep(250);
  const midCount = await pg.evaluate(() => {
    const g = window.Bonsai.group(); const root = g.children.find(o => o.userData && o.userData.dwRoot);
    const inst = root.children.find(o => o.isInstancedMesh && o.userData.dwChain === 'PLB');
    return inst ? inst.count : -1;
  });
  await sleep(2600);
  const animLog = logs.find(l => /§DW-CHAIN-ANIM PLB mode=animated/.test(l)) || '';
  const animSegs = (animLog.match(/finalSegs=(\d+)/) || [])[1];
  const animFrames = +((animLog.match(/frames=(\d+)/) || [])[1] || 0);
  const fullCount = await pg.evaluate(() => {
    const g = window.Bonsai.group(); const root = g.children.find(o => o.userData && o.userData.dwRoot);
    const inst = root.children.find(o => o.isInstancedMesh && o.userData.dwChain === 'PLB');
    return inst ? inst.count : -1;
  });

  logs.length = 0;
  await pg.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await pg.evaluate(() => { window.__dwChainRender('PLB', window.__dwChains.PLB, { patternBridge: window.__dwChainMeta.PLB }); });
  await sleep(200);
  const rmLog = logs.find(l => /§DW-CHAIN-ANIM PLB mode=reduced-motion/.test(l)) || '';
  const rmSegs = (rmLog.match(/finalSegs=(\d+)/) || [])[1];

  logs.length = 0;
  await pg.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
  await pg.evaluate(() => { window.__dwChainRender('PLB', window.__dwChains.PLB, { patternBridge: window.__dwChainMeta.PLB, instant: true }); });
  await sleep(200);
  const instLog = logs.find(l => /§DW-CHAIN-ANIM PLB mode=instant/.test(l)) || '';
  const instSegs = (instLog.match(/finalSegs=(\d+)/) || [])[1];

  // R6 — a network with NO patternBridge (meta=null, the real-nn-chain shape) must render FULL count immediately,
  // no §DW-CHAIN-ANIM line at all (the "if (!reveal) {...; return;}" early-out branch).
  logs.length = 0;
  const noRevealCount = await pg.evaluate(() => {
    const segs = window.__dwChains.PLB;
    window.__dwChainRender('PLB', segs, { patternBridge: null });
    const g = window.Bonsai.group(); const root = g.children.find(o => o.userData && o.userData.dwRoot);
    const inst = root.children.find(o => o.isInstancedMesh && o.userData.dwChain === 'PLB');
    return inst ? inst.count : -1;
  });
  const noRevealAnimLog = logs.find(l => /§DW-CHAIN-ANIM PLB/.test(l));

  // R7 — restore the real reveal (full, instant) and confirm the canvas painted.
  const paint = await pg.evaluate(() => {
    window.__dwChainRender('PLB', window.__dwChains.PLB, { patternBridge: window.__dwChainMeta.PLB, instant: true });
    const r = window.A.renderer; r.render(window.A.scene, window.A.camera); const gl = r.getContext();
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px); let lit = 0;
    for (let i = 0; i < px.length; i += 4) { if (px[i] > 40 || px[i + 1] > 44 || px[i + 2] > 52) lit++; }
    return +(100 * lit / (w * h)).toFixed(2);
  });

  await br.close(); server.close();

  console.log('  §WALKED ' + JSON.stringify(walked));
  console.log('  §ORDER ' + JSON.stringify(order));
  console.log('  §MID(250ms) count=' + midCount);
  console.log('  ' + (animLog || '(no animated §DW-CHAIN-ANIM)') + ' fullCount=' + fullCount);
  console.log('  ' + (rmLog || '(no reduced-motion §DW-CHAIN-ANIM)'));
  console.log('  ' + (instLog || '(no instant §DW-CHAIN-ANIM)'));
  console.log('  §NOREVEAL count=' + noRevealCount + ' animLog=' + (noRevealAnimLog || '(none, expected)'));
  console.log('  §PAINT litPct=' + paint + '%');

  let pass = 0, fail = 0;
  const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };
  chk('R1 REVEAL-ENGAGED (real seed anchor, every segment has a real anchor to measure against)', walked.n > 0 && !!(walked.meta && walked.meta.seed) && order.unreached === 0, JSON.stringify(walked.meta) + ' unreached=' + order.unreached);
  chk('R2 SEED-OUTWARD (independent recompute: distance-from-anchor is non-decreasing along the order)', order.checked === walked.n && order.violations === 0, JSON.stringify(order));
  chk('R3 ANIMATED (mid < full, ends EXACT==net, >1 frame)', midCount >= 0 && midCount < walked.n && animSegs === String(walked.n) && fullCount === walked.n && animFrames > 1,
    'mid=' + midCount + ' n=' + walked.n + ' animSegs=' + animSegs + ' fullCount=' + fullCount + ' frames=' + animFrames);
  chk('R4 REDUCED-MOTION instant fallback', rmSegs === String(walked.n), 'finalSegs=' + rmSegs + ' n=' + walked.n);
  chk('R5 opts.instant fallback (redraw-after-scrub path)', instSegs === String(walked.n), 'finalSegs=' + instSegs + ' n=' + walked.n);
  chk('R6 no-patternBridge network renders FULL immediately, no reveal log', noRevealCount === walked.n && !noRevealAnimLog, 'count=' + noRevealCount + ' n=' + walked.n);
  chk('R7 PAINTED (canvas non-blank)', paint > 0, 'litPct=' + paint + '%');
  chk('R8 NO-ERROR', errs.length === 0, errs.slice(0, 2).join(' | '));
  chk('R0 chain commit completed (real walk, not a stub)', chainCommitted, 'chainCommitted=' + chainCommitted);

  console.log('W-SEED-OUTWARD-REVEAL: ' + pass + ' PASS / ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
})();
