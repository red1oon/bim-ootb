// ⚠ DO NOT REMOVE — witness for §DLOD_STILL_OWNERSHIP (bim-compiler PHOTOREAL_STILL_RENDER.md). Read the log after every run.
// Issue it proves/disproves: during Alt+S, DLOD zero-scales instances (incl. roof casters) outside the view, so
// the sun shines through the roof. Counts zero-scaled InstancedMesh slots by IFC class in nav, during the app
// still, right before the bounce pass, and after exit. Before-tree: DLOD stays on through the still (on 2026-09-24 it zeroed
// 38,924 by the end of the bounce; headless it had not ticked yet at still-ready); after-tree: paused=1 and 0 throughout.
// Usage: node viewer/tests/witness_dlod_still_ownership.js --port 8600 --tag after [--defer]   (serve the tree first; OUT=dir for logs/PNGs)
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const fs = require('fs'), path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const arg = (k, d) => process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d;
const PORT = +arg('--port', 8600), TAG = arg('--tag', 'x'), W = 1666, H = 864;
const DB = '/buildings/Terminal_extracted.db';
const OUT = process.env.OUT || '/tmp/witness_dlod_still'; fs.mkdirSync(OUT, { recursive: true });
const LOG = path.join(OUT, 'log_' + TAG + '.txt');
const lines = []; const T0 = Date.now();
function say(s) { const t = '+' + ((Date.now() - T0) / 1000).toFixed(1) + 's ' + s; lines.push(t); console.log(t); fs.writeFileSync(LOG, lines.join('\n')); }

const COUNT = `window.__dlodCount = function () {
  const A = window.APP, m4 = new THREE.Matrix4(); let total = 0, zero = 0; const byCls = {};
  for (const id in A._instanceMeta) {
    const obj = A.scene.getObjectById(+id); if (!obj || !obj.isInstancedMesh) continue;
    for (const m of A._instanceMeta[id]) {
      if (m.instanceIndex == null) continue; total++;
      obj.getMatrixAt(m.instanceIndex, m4);
      if (Math.abs(m4.determinant()) < 1e-12) { zero++; const c = m.ifcClass || '?'; byCls[c] = (byCls[c] || 0) + 1; }
    }
  }
  return { dlodEnabled: !!A._dlodEnabled, tmOn: !!A._tmOn, total: total, zero: zero, zeroByClass: byCls };
};`;

(async () => {
  const b = await puppeteer.launch({ headless: 'new', protocolTimeout: 900000,
    args: ['--no-sandbox', '--enable-unsafe-webgpu', '--enable-features=Vulkan', '--ignore-gpu-blocklist', '--use-angle=gl-egl', '--window-size=' + (W + 20) + ',' + (H + 180)] });
  const p = await b.newPage(); await p.setViewport({ width: W, height: H });
  const clog = [];
  p.on('console', m => { const t = m.text(); clog.push(t); if (/§DLOD_STILL_OWNERSHIP|§DLOD_(ENABLE|DISABLE|SKIP)|PAGEERROR|§GI_STILL_OFF|§LOAD_FAIL/.test(t)) say('[page] ' + t.slice(0, 220)); });
  p.on('pageerror', e => say('PAGEERROR ' + e.message));
  await p.evaluateOnNewDocument(COUNT);
  await p.goto('http://127.0.0.1:' + PORT + '/viewer/viewer.html?db=' + DB, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForFunction(() => window.APP && window.APP.cinemaPathPlan, { timeout: 180000 });
  await sleep(10000);
  try { await p.waitForFunction(() => { try { const r = window.APP.dbQuery('SELECT COUNT(*) FROM element_transforms'); return r && r[0][0] > 0; } catch (e) { return false; } }, { timeout: 120000, polling: 2000 }); } catch (e) { say('DB_WAIT_TIMEOUT'); }
  const blds = await p.evaluate(() => (window.APP.dbQuery('SELECT DISTINCT building FROM elements_meta') || []).map(r => r[0]));
  say('buildings=' + JSON.stringify(blds));
  for (const bb of blds) {
    await p.evaluate(x => { try { window.APP.streamBuilding(x); } catch (e) {} }, bb);
    let prev = -1, stable = 0;
    for (let i = 0; i < 90 && stable < 3; i++) { const n = await p.evaluate(() => Object.keys(window.APP.guidMap).length); stable = (n === prev && n > 0) ? stable + 1 : 0; prev = n; await sleep(2000); }
    say('streamed ' + bb + ' guids=' + prev);
  }
  // Wait until the stream is complete AND dlod.js has switched itself on (the state red1's nav has).
  for (let i = 0; i < 90; i++) { if (await p.evaluate(() => !!window.APP._dlodEnabled)) break; await sleep(1000); }
  say('dlod on before pose=' + await p.evaluate(() => !!window.APP._dlodEnabled));
  // Pose from the building's own elements (instance positions, 5th-95th percentile), not scene bounds:
  // a ground/sky mesh spans +-50 km and put the first attempt underground.
  const pose = await p.evaluate(() => {
    const A = window.APP, m4 = new THREE.Matrix4(), v = new THREE.Vector3(), xs = [], ys = [], zs = [];
    for (const id in A._instanceMeta) { const o = A.scene.getObjectById(+id); if (!o || !o.isInstancedMesh) continue;
      for (const m of A._instanceMeta[id]) { if (m.instanceIndex == null) continue; o.getMatrixAt(m.instanceIndex, m4); o.updateMatrixWorld(); v.setFromMatrixPosition(m4).applyMatrix4(o.matrixWorld); xs.push(v.x); ys.push(v.y); zs.push(v.z); } }
    const q = (a, f) => { a = a.slice().sort((x, y) => x - y); return a[Math.floor(f * (a.length - 1))]; };
    const x0 = q(xs, .05), x1 = q(xs, .95), y0 = q(ys, .02), y1 = q(ys, .98), z0 = q(zs, .05), z1 = q(zs, .95);
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const pos = new THREE.Vector3(cx - (x1 - x0) * 0.1, y0 + 2, cz), tgt = new THREE.Vector3(cx + (x1 - x0) * 0.25, y1, cz);
    A.camera.position.copy(pos); if (A.controls) { A.controls.target.copy(tgt); A.controls.update(); } else A.camera.lookAt(tgt);
    try { A.markDirty && A.markDirty(); } catch (e) {}
    return { n: xs.length, x: [x0, x1].map(v => +v.toFixed(1)), y: [y0, y1].map(v => +v.toFixed(1)), z: [z0, z1].map(v => +v.toFixed(1)), pos: pos.toArray().map(v => +v.toFixed(2)), tgt: tgt.toArray().map(v => +v.toFixed(2)) };
  });
  say('POSE ' + JSON.stringify(pose));
  await sleep(8000);  // let dlodTick evaluate the new camera (EVAL_EVERY frames after a camera move)
  say('NAV ' + JSON.stringify(await p.evaluate(() => window.__dlodCount())));
  await p.evaluate(() => window.APP.toggleStillRefine());
  let ok = false;
  for (let i = 0; i < 180; i++) { const s = await p.evaluate(() => ({ a: !!window.APP._stillRefineActive, b: !!window.APP._stillRefineBusy })); if (s.a && !s.b) { ok = true; break; } await sleep(1000); }
  say('still ready=' + ok);
  say('DURING_STILL ' + JSON.stringify(await p.evaluate(() => window.__dlodCount())));
  const png = await p.evaluate(() => { const A = window.APP; try { A._composer ? A._composer.render() : A.renderer.render(A.scene, A.camera); } catch (e) {} return A.renderer.domElement.toDataURL('image/png'); });
  fs.writeFileSync(path.join(OUT, 'still_' + TAG + '.png'), Buffer.from(png.split(',')[1], 'base64')); say('wrote still_' + TAG + '.png');
  // --defer: the deferred-enable path. A dlodEnable() arriving while staging holds DLOD off (e.g. a stream
  // completing mid-still) must NOT switch it on, and teardown must honour it. Skips the bounce.
  const DEFER = process.argv.includes('--defer');
  if (DEFER) {
    const r = await p.evaluate(() => { const A = window.APP; A.dlodEnable(); return { heldBefore: !!A._dlodStillHold, dlodEnabledAfterCall: !!A._dlodEnabled, wanted: !!A._dlodStillWanted }; });
    say('DEFER_CALL ' + JSON.stringify(r) + ' (expect dlodEnabledAfterCall=false wanted=true)');
    await sleep(3000);
    say('DEFER_HELD ' + JSON.stringify(await p.evaluate(() => window.__dlodCount())));
  }
  // The bounce pass renders the same scene objects; count right before it runs.
  const hasGi = !DEFER && await p.evaluate(() => typeof window.__giStillShoot === 'function');
  if (hasGi) {
    say('BEFORE_BOUNCE ' + JSON.stringify(await p.evaluate(() => window.__dlodCount())));
    const r = await p.evaluate(async () => { try { const r = await window.__giStillShoot({}); return { ok: true, secs: r && r.secs }; } catch (e) { return { err: String(e && e.message) }; } });
    say('BOUNCE ' + JSON.stringify(r));
    say('AFTER_BOUNCE ' + JSON.stringify(await p.evaluate(() => window.__dlodCount())));
    const ov = await p.evaluate(() => { const o = document.getElementById('gi-still-overlay'), c = o && o.querySelector('canvas'); return c ? c.toDataURL('image/png') : null; });
    if (ov) { fs.writeFileSync(path.join(OUT, 'bounce_' + TAG + '.png'), Buffer.from(ov.split(',')[1], 'base64')); say('wrote bounce_' + TAG + '.png'); }
    await p.evaluate(() => { const o = document.getElementById('gi-still-overlay'); if (o) o.remove(); });
  } else say('BOUNCE not available in this browser');
  await p.evaluate(() => window.APP.toggleStillRefine());
  await sleep(6000);
  say('AFTER_EXIT ' + JSON.stringify(await p.evaluate(() => window.__dlodCount())));
  fs.writeFileSync(path.join(OUT, 'console_' + TAG + '.txt'), clog.join('\n'));
  await b.close();
})().catch(e => { say('FATAL ' + (e && e.stack || e)); process.exit(1); });
