// HEADLESS DRIVER for the live Alt+S bounce still (red1-84, 2026-09-23).
// Drives the ALREADY-RUNNING serve_gi_live.js on 127.0.0.1:8600 with puppeteer, so gi_still.js can
// be measured without asking red1 to sit in front of a hanging tab.
//
// It reports, with numbers, the three things the brief asks for:
//   1. per-stage timing of the shot (from the §GI_STILL stage lines, node-side timestamped);
//   2. the longest main-thread block during the shot (rAF + setInterval heartbeats installed
//      before the page's own scripts, so a frozen tab shows up as a gap, not as a guess);
//   3. mean luminance of the composited still, of the app's own frame, and the mean absolute
//      difference between them — blank or identical both fail.
// Usage: node run_gi_still_headless.js [--port 8600] [--w 1280] [--h 720] [--tag name] [--skip-still]
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const fs = require('fs'), path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const arg = (k, d) => process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d;
const PORT = +arg('--port', 8600);
const W = +arg('--w', 1280), H = +arg('--h', 720);
const TAG = arg('--tag', 'base');
const SKIP_STILL = process.argv.includes('--skip-still');
const DB = '/buildings/HHS_Office_Federated_silent.db';
const OUT = path.join(__dirname, 'out', 'gi_still_headless');
fs.mkdirSync(OUT, { recursive: true });
const LOG = path.join(OUT, 'log_' + TAG + '.txt');
const lines = [];
const T0 = Date.now();
function say(s) { const t = '+' + ((Date.now() - T0) / 1000).toFixed(1) + 's ' + s; lines.push(t); console.log(t); fs.writeFileSync(LOG, lines.join('\n')); }

const HEARTBEAT = `
window.__hb = { rafMax: 0, rafLast: 0, rafN: 0, rafLong: [], tmrMax: 0, tmrLast: 0, tmrN: 0, tmrLong: [] };
window.__hbReset = function () { const h = window.__hb; h.rafMax = 0; h.rafLong = []; h.tmrMax = 0; h.tmrLong = []; h.rafLast = 0; h.tmrLast = 0; };
(function raf() { const t = performance.now(), h = window.__hb;
  if (h.rafLast) { const d = t - h.rafLast; if (d > h.rafMax) h.rafMax = d; if (d > 50 && h.rafLong.length < 400) h.rafLong.push(+d.toFixed(0)); }
  h.rafLast = t; h.rafN++; requestAnimationFrame(raf); })();
setInterval(function () { const t = performance.now(), h = window.__hb;
  if (h.tmrLast) { const d = t - h.tmrLast; if (d > h.tmrMax) h.tmrMax = d; if (d > 50 && h.tmrLong.length < 400) h.tmrLong.push(+d.toFixed(0)); }
  h.tmrLast = t; h.tmrN++; }, 16);
`;

// Downsample a canvas on the GPU into a small grid and hand back its pixels — never a full
// getImageData of a 1280x720 frame, which is 3.7 MB per probe and would itself stall what we measure.
const PROBE = `
window.__probe = function (cv, sw, sh) {
  const c = document.createElement('canvas'); c.width = sw; c.height = sh;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.clearRect(0, 0, sw, sh); x.drawImage(cv, 0, 0, sw, sh);
  return Array.from(x.getImageData(0, 0, sw, sh).data);
};
// Independent orientation check: the DRIVER's own score of the finished composite against the app
// frame, as-is and vertically flipped. It does not read gi_still's decision, so it can contradict it.
window.__orientCheck = function (ap) {
  const ov = document.getElementById('gi-still-overlay'), cv = ov && ov.querySelector('canvas');
  if (!cv) return { err: 'no overlay canvas' };
  const px = window.__probe(cv, 128, 72);
  let same = 0, flip = 0, n = 0;
  for (let j = 0; j < 72; j++) for (let i = 0; i < 128; i++) {
    const k = (j * 128 + i) * 4, kf = ((71 - j) * 128 + i) * 4;
    const l = (px[k] + px[k + 1] + px[k + 2]) / 3;
    same += Math.abs(l - (ap[k] + ap[k + 1] + ap[k + 2]) / 3);
    flip += Math.abs(l - (ap[kf] + ap[kf + 1] + ap[kf + 2]) / 3);
    n++;
  }
  return { same: +(same / n).toFixed(2), flipped: +(flip / n).toFixed(2), upright: same < flip };
};
window.__stats = function (px) {
  let s = 0, n = 0, mn = 999, mx = -1;
  for (let i = 0; i < px.length; i += 4) { const l = (px[i] + px[i + 1] + px[i + 2]) / 3; s += l; n++; if (l < mn) mn = l; if (l > mx) mx = l; }
  let v = 0; const m = s / n;
  for (let i = 0; i < px.length; i += 4) { const l = (px[i] + px[i + 1] + px[i + 2]) / 3; v += (l - m) * (l - m); }
  return { mean: +m.toFixed(2), stdev: +Math.sqrt(v / n).toFixed(2), min: mn, max: mx, n: n };
};
`;

(async () => {
  const b = await puppeteer.launch({
    headless: 'new', protocolTimeout: 900000,
    args: ['--no-sandbox', '--hide-crash-restore-bubble', '--enable-unsafe-webgpu', '--enable-features=Vulkan',
           '--ignore-gpu-blocklist', '--use-angle=gl-egl', '--window-size=' + (W + 20) + ',' + (H + 180)]
  });
  const p = await b.newPage();
  await p.setViewport({ width: W, height: H });
  const clog = [];
  p.on('console', m => { const t = '+' + ((Date.now() - T0) / 1000).toFixed(1) + 's [page] ' + m.text(); clog.push(t); if (/§GI_STILL|PAGEERROR|§GI_LIVE|Error|error/i.test(m.text())) say(t); });
  p.on('pageerror', e => { const t = 'PAGEERROR ' + e.message; clog.push(t); say(t); });
  await p.evaluateOnNewDocument(HEARTBEAT + PROBE);
  say('goto');
  await p.goto('http://127.0.0.1:' + PORT + '/viewer/viewer.html?db=' + DB, { waitUntil: 'domcontentloaded', timeout: 60000 });
  let booted = true;
  try { await p.waitForFunction(() => window.APP && window.APP.cinemaPathPlan, { timeout: 180000 }); } catch (e) { booted = false; }
  say('booted=' + booted + ' three=' + JSON.stringify(await p.evaluate(() => ({ rev: window.THREE && window.THREE.REVISION, wgpu: !!(window.THREE && window.THREE.WebGPURenderer), gpu: !!navigator.gpu })).catch(() => null)));
  if (!booted) { fs.writeFileSync(path.join(OUT, 'console_' + TAG + '.txt'), clog.join('\n')); await b.close(); process.exit(2); }
  await sleep(10000);
  try { await p.waitForFunction(() => { try { const r = window.APP.dbQuery('SELECT COUNT(*) FROM element_transforms'); return r && r[0][0] > 0; } catch (e) { return false; } }, { timeout: 120000, polling: 2000 }); } catch (e) { say('DB_WAIT_TIMEOUT'); }
  const blds = await p.evaluate(() => (window.APP.dbQuery('SELECT DISTINCT building FROM elements_meta') || []).map(r => r[0]));
  say('buildings=' + JSON.stringify(blds));
  for (const bb of blds) {
    await p.evaluate(x => { try { window.APP.streamBuilding(x); } catch (e) { console.log('§STREAM_FAIL ' + e.message); } }, bb);
    let prev = -1;
    for (let i = 0; i < 60; i++) { const n = await p.evaluate(() => Object.keys(window.APP.guidMap).length); if (n === prev && n > 0) break; prev = n; await sleep(2000); }
    say('streamed ' + bb + ' guids=' + prev);
  }
  const inv = await p.evaluate(() => { let m = 0, bm = 0, im = 0, l = 0; window.APP.scene.traverse(o => { if (o.isBatchedMesh) bm++; else if (o.isInstancedMesh) im++; else if (o.isMesh) m++; if (o.isLight) l++; }); return { mesh: m, batched: bm, instanced: im, lights: l, children: window.APP.scene.children.length }; });
  say('scene ' + JSON.stringify(inv));

  if (!SKIP_STILL) {
    say('toggleStillRefine');
    await p.evaluate(() => window.APP.toggleStillRefine());
    let stillOk = false;
    for (let i = 0; i < 120; i++) { const s = await p.evaluate(() => ({ a: !!window.APP._stillRefineActive, b: !!window.APP._stillRefineBusy })); if (s.a && !s.b) { stillOk = true; break; } await sleep(1000); }
    say('app still ready=' + stillOk + ' after ' + ((Date.now() - T0) / 1000).toFixed(0) + 's');
    await sleep(1500);
  } else say('SKIPPED the app still (--skip-still)');

  // Reference: the app's own finished frame, rendered and copied in the SAME task.
  const appRef = await p.evaluate(() => {
    const A = window.APP;
    try { if (A.markDirty) A.markDirty(); } catch (e) {}
    try { if (A._composer) A._composer.render(); else A.renderer.render(A.scene, A.camera); } catch (e) { return { err: String(e && e.message) }; }
    const px = window.__probe(A.renderer.domElement, 128, 72);
    return { stats: window.__stats(px), px: px };
  });
  say('APP FRAME ' + JSON.stringify(appRef.stats || appRef));
  const inv2 = await p.evaluate(() => { let n = 0; window.APP.scene.traverse(() => n++); return { traversed: n, children: window.APP.scene.children.length, override: !!window.APP.scene.overrideMaterial }; });
  say('scene after still ' + JSON.stringify(inv2));

  // FIRE. Kicked off without awaiting, so a frozen main thread shows as poll timeouts rather than
  // one opaque protocol error, and the heartbeat records how long it was actually blocked.
  async function fire(opts, label) {
    await p.evaluate((o) => { window.__hbReset(); window.__shot = { t0: performance.now(), done: null, err: null, r: null }; window.__giStillShoot(o).then(r => { window.__shot.r = r; window.__shot.done = performance.now() - window.__shot.t0; }, e => { window.__shot.err = String(e && e.stack || e); }); }, opts || {});
    say('SHOOT fired ' + label + ' ' + JSON.stringify(opts || {}));
    const tS = Date.now();
    let shot = null, worstGap = 0, prev = Date.now();
    for (let i = 0; i < 300; i++) {
      let r = null;
      try { r = await Promise.race([p.evaluate(() => window.__shot), sleep(20000).then(() => ({ __timeout: true }))]); } catch (e) { r = { __evalerr: String(e && e.message) }; }
      const gap = Date.now() - prev; prev = Date.now(); if (gap > worstGap) worstGap = gap;
      if (r && r.__timeout) say('poll ' + i + ' TIMED OUT (>20s) — main thread is blocked');
      else if (r && (r.done != null || r.err)) { shot = r; break; }
      await sleep(1000);
    }
    const wall = (Date.now() - tS) / 1000;
    say('SHOT[' + label + '] ' + JSON.stringify(shot) + ' wallSec=' + wall.toFixed(1) + ' worstPollGapMs=' + worstGap);
    const hb = await p.evaluate(() => window.__hb).catch(() => null);
    if (hb) say('HEARTBEAT[' + label + '] rafMaxMs=' + (hb.rafMax || 0).toFixed(0) + ' rafBlocks>50ms=' + hb.rafLong.length +
                ' worst5raf=' + JSON.stringify(hb.rafLong.slice().sort((a, c) => c - a).slice(0, 5)) +
                ' tmrMaxMs=' + (hb.tmrMax || 0).toFixed(0) + ' tmrBlocks>50ms=' + hb.tmrLong.length +
                ' worst5tmr=' + JSON.stringify(hb.tmrLong.slice().sort((a, c) => c - a).slice(0, 5)));
    return shot;
  }
  async function measure(label, appPx) {
    const res = await p.evaluate((ap) => {
      const ov = document.getElementById('gi-still-overlay');
      const cv = ov && ov.querySelector('canvas');
      if (!cv) return { err: 'no overlay canvas' };
      const px = window.__probe(cv, 128, 72);
      const st = window.__stats(px);
      let d = 0, n = 0, same = 0;
      for (let i = 0; i < px.length; i += 4) {
        const a = (px[i] + px[i + 1] + px[i + 2]) / 3, c = (ap[i] + ap[i + 1] + ap[i + 2]) / 3;
        d += Math.abs(a - c); n++; if (Math.abs(a - c) < 1) same++;
      }
      return { stats: st, meanAbsDiff: +(d / n).toFixed(2), pctIdentical: +(100 * same / n).toFixed(1), w: cv.width, h: cv.height, inPage: window.__giStillDebug || null };
    }, appPx);
    say('MEASURE[' + label + '] ' + JSON.stringify(res));
    return res;
  }
  async function savePngs(label) {
    const shots = await p.evaluate(() => {
      const ov = document.getElementById('gi-still-overlay'), cv = ov && ov.querySelector('canvas');
      const o = {};
      if (cv) o.composite = cv.toDataURL('image/png');
      const dbg = window.__giStillDebugCanvas;
      if (dbg) for (const k of Object.keys(dbg)) { try { o[k] = dbg[k].toDataURL('image/png'); } catch (e) {} }
      return o;
    }).catch(() => ({}));
    for (const k of Object.keys(shots)) {
      fs.writeFileSync(path.join(OUT, TAG + '_' + label + '_' + k + '.png'), Buffer.from(shots[k].split(',')[1], 'base64'));
      say('wrote ' + TAG + '_' + label + '_' + k + '.png');
    }
  }

  // ── 1. the real shot ──────────────────────────────────────────────────────────────────────────
  await fire({}, 'normal');
  await measure('normal', appRef.px);
  say('ORIENT[normal] driver-side ' + JSON.stringify(await p.evaluate(ap => window.__orientCheck(ap), appRef.px)));
  await savePngs('normal');

  // ── 2. §GI_STILL_DOUBLE witness: glazed vs opaque, with a measured glass mask ──────────────────
  say('GLASS WITNESS ' + JSON.stringify(await p.evaluate(async () => { try { return await window.__giStillGlassMask(); } catch (e) { return { err: String(e && e.stack || e) }; } })));

  // ── 3. state restoration ──────────────────────────────────────────────────────────────────────
  const after = await p.evaluate((ap) => {
    const A = window.APP;
    const ov = document.getElementById('gi-still-overlay'); if (ov) ov.remove();
    try { if (A.markDirty) A.markDirty(); } catch (e) {}
    try { if (A._composer) A._composer.render(); else A.renderer.render(A.scene, A.camera); } catch (e) { return { err: String(e && e.message) }; }
    const px = window.__probe(A.renderer.domElement, 128, 72);
    let d = 0, n = 0;
    for (let i = 0; i < px.length; i += 4) { d += Math.abs((px[i] + px[i + 1] + px[i + 2]) / 3 - (ap[i] + ap[i + 1] + ap[i + 2]) / 3); n++; }
    let mats = 0, shared = 0; A.scene.traverse(o => { if (o.material) { mats++; if (o.material.name === 'GI_STILL_GEOM') shared++; } });
    return { stats: window.__stats(px), meanAbsDiffVsBefore: +(d / n).toFixed(3),
             overrideMaterial: String(A.scene.overrideMaterial), background: String(A.scene.background),
             skyVisible: A._sky ? A._sky.visible : 'no-sky', children: A.scene.children.length,
             materialObjects: mats, stillHoldingOurMaterial: shared,
             stillActive: !!A._stillRefineActive, stillBusy: !!A._stillRefineBusy };
  }, appRef.px);
  say('APP AFTER ' + JSON.stringify(after));

  // ── 4. ORIENTATION RECOVERY — simulate a platform whose readback rows run the other way, which is
  //      the fault red1 saw on Hospital. The search must find it and the picture must come back
  //      upright anyway. Fresh renderer, so the decision is made from scratch.
  say('release -> ' + await p.evaluate(() => window.__giStillRelease()));
  await p.evaluate(() => { window.__GI_STILL_INJECT_READBACK_FLIP = true; });
  await fire({}, 'injected_flip');
  await measure('injected_flip', appRef.px);
  say('ORIENT[injected_flip] driver-side ' + JSON.stringify(await p.evaluate(ap => window.__orientCheck(ap), appRef.px)));
  await savePngs('injected_flip');
  await p.evaluate(() => { window.__GI_STILL_INJECT_READBACK_FLIP = false; });

  // ── 5. transfer witness ───────────────────────────────────────────────────────────────────────
  await fire({ mode: 'coloronly', passes: 1, encode: 'oetf' }, 'coloronly_oetf');
  await measure('coloronly_oetf', appRef.px);

  const stages = clog.filter(l => /§GI_STILL/.test(l));
  say('--- §GI_STILL lines (' + stages.length + ') ---\n' + stages.join('\n'));
  fs.writeFileSync(path.join(OUT, 'console_' + TAG + '.txt'), clog.join('\n'));
  say('full page console -> ' + path.join(OUT, 'console_' + TAG + '.txt') + ' (' + clog.length + ' lines)');
  await b.close();
})().catch(e => { say('FATAL ' + (e && e.stack || e)); process.exit(1); });
