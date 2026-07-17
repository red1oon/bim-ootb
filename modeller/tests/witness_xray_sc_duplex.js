#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-XRAY-SC-LIVE (primary) + W-XRAY-DUPLEX-REGRESSION
 * SCOPE: prompts/Modeller/DISC_Walker/XRAY_FIXTURE_CLASSIFICATION_FIX.md, post-fix verification.
 * Real discWalk('ELEC', {building}) → xrayReveal(true) → in-scene assertion (no screenshot judgment):
 *   - top-level g.children (ARC-authored structure, excluding the dwRoot marker): glow must be 0 (every
 *     ARC element, wall included, has no _dw/_rw fixture tag) and glass must equal every authored mesh.
 *   - dwRoot.children (DiscWalker's batched InstancedMesh fixture buckets): every bucket must glow
 *     (opacity 0.97, dwDisc set) — this is the population the ORIGINAL bug never even reached.
 * Then xrayReveal(false) → re-fold restore, assert structure opaque again.
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

async function runOne(pg, key, shots) {
  console.log(`\n═══ ${key} ═══`);
  await pg.click('#b-open'); await sleep(200);
  await pg.click(`#m-open-panel .mo-row[data-key="${key}"]`);
  await pg.waitForFunction('window.__sceneReady === true && !!window.Bonsai', { timeout: 60000 }).catch(() => {});
  await sleep(4000);
  await pg.evaluate((b) => window.discWalk('ELEC', { building: b }), key);
  const walked = await pg.waitForFunction((d) => window.__dwLastCommitDisc === d, { timeout: 180000, polling: 250 }, 'ELEC').then(() => true).catch(() => false);
  await sleep(1000);

  // snapshot material state BEFORE xray touches anything — real buildings legitimately have transparent
  // glass/windows (arc_editable.js §MAT-PARITY), so "restored" must mean "matches its own pre-xray state",
  // not "universally opaque"
  const before = await pg.evaluate(() => {
    const g = window.Bonsai.group();
    const dwRoot = g.children.find(o => o.userData && o.userData.dwRoot);
    const snap = {};
    g.children.forEach(o => { if (o === dwRoot || !o.isMesh || !o.material) return;
      snap[o.userData.featureId] = { transparent: o.material.transparent, opacity: +o.material.opacity.toFixed(4), color: o.material.color.getHex() }; });
    return snap;
  });

  const onR = await pg.evaluate(() => window.__xrayReveal(true));
  await pg.click('#b-fit').catch(() => {});
  await sleep(500);
  if (shots) await pg.screenshot({ path: path.join(SHOTS, 'W-XRAY-' + key + '-on.png') }).catch(() => {});

  // §DW_FIXTURE_DOUBLE_RENDER_FINDING.md (filed separately, out of this fix's scope): DiscWalker fixtures
  // fold BOTH as individual top-level meshes (standard op-log path, own featureId — legitimately eligible
  // via their own _dw-tagged op) AND as InstancedMesh buckets under dwRoot. Both are real fixtures and
  // should BOTH glow; only meshes with NEITHER a fixture op tag NOR a dwDisc bucket tag are structure.
  const scene = await pg.evaluate(() => {
    const g = window.Bonsai.group();
    const O = window.Bonsai.oplog;
    const fixtureOpIds = new Set();
    O._geomOps().forEach(o => { if (o.op_type === 'GEOM_INSERT' && o.parameters && (o.parameters._dw != null || (o.parameters._rw && o.parameters._rw.fixture === true))) fixtureOpIds.add(o.id); });
    const dwRoot = g.children.find(o => o.userData && o.userData.dwRoot);
    let structureGlassOK = 0, structureLeaked = [], fixtureGlowOK = 0, fixtureGlowBad = [];
    g.children.forEach(o => {
      if (o === dwRoot || !o.isMesh || !o.material) return;
      const isFixture = fixtureOpIds.has(o.userData.featureId);
      const op = o.material.opacity;
      if (isFixture) { if (op > 0.5) fixtureGlowOK++; else fixtureGlowBad.push(o.userData.featureId); }
      else { if (op <= 0.5) structureGlassOK++; else structureLeaked.push(o.userData.featureId); }
    });
    let bucketGlow = 0, bucketTotal = 0, bucketBad = [];
    if (dwRoot) dwRoot.children.forEach(o => {
      if (!o.isMesh) return;
      bucketTotal++;
      const op = o.material.opacity, dt = o.material.depthTest;
      if (op > 0.9 && dt === false) bucketGlow++; else bucketBad.push({ dwDisc: o.userData.dwDisc, opacity: op, depthTest: dt });
    });
    return { structureGlassOK, structureLeaked, fixtureGlowOK, fixtureGlowBad, fixtureOpCount: fixtureOpIds.size, bucketGlow, bucketTotal, bucketBad, dwRootFound: !!dwRoot };
  });
  console.log(`  §XRAY-ASSERT ${key} structureGlassOK=${scene.structureGlassOK} structureLeaked=${scene.structureLeaked.length} fixtureGlowOK=${scene.fixtureGlowOK}/${scene.fixtureOpCount} bucketGlow=${scene.bucketGlow}/${scene.bucketTotal} dwRootFound=${scene.dwRootFound}`);
  if (scene.structureLeaked.length) console.log('  ✗ leaked structure fids: ' + JSON.stringify(scene.structureLeaked.slice(0, 20)));
  if (scene.fixtureGlowBad.length) console.log('  ✗ fixtures not glowing: ' + JSON.stringify(scene.fixtureGlowBad.slice(0, 20)));
  if (scene.bucketBad.length) console.log('  ✗ non-glowing buckets: ' + JSON.stringify(scene.bucketBad));

  const offR = await pg.evaluate(() => window.__xrayReveal(false));
  await sleep(500);
  const restored = await pg.evaluate((beforeSnap) => {
    const g = window.Bonsai.group();
    const dwRoot = g.children.find(o => o.userData && o.userData.dwRoot);
    let matched = 0, total = 0, mismatched = [];
    g.children.forEach(o => { if (o === dwRoot || !o.isMesh || !o.material) return; total++;
      const b = beforeSnap[o.userData.featureId];
      const now = { transparent: o.material.transparent, opacity: +o.material.opacity.toFixed(4), color: o.material.color.getHex() };
      if (b && b.transparent === now.transparent && Math.abs(b.opacity - now.opacity) < 1e-3 && b.color === now.color) matched++;
      else mismatched.push(o.userData.featureId);
    });
    return { matched, total, mismatched };
  }, before);
  console.log(`  §XRAY-RESTORE ${key} matchedPreXrayState=${restored.matched}/${restored.total}`);
  if (restored.mismatched.length) console.log('  ✗ restore mismatch fids: ' + JSON.stringify(restored.mismatched.slice(0, 20)));

  const pass = walked && scene.structureLeaked.length === 0 && scene.fixtureGlowBad.length === 0 && scene.fixtureOpCount > 0 &&
    scene.bucketGlow === scene.bucketTotal && scene.bucketTotal > 0 && restored.matched === restored.total;
  console.log(`  §XRAY-VERDICT ${key} ${pass ? 'PASS' : 'FAIL'} walked=${walked} onR.glass=${onR.glass} onR.glow=${onR.glow}`);
  return pass;
}

(async () => {
  await new Promise(r => server.listen(0, r)); const port = server.address().port;
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const pg = await br.newPage(); await pg.setViewport({ width: 1400, height: 950, deviceScaleFactor: 2 });
  const errs = []; pg.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  await pg.goto(`http://localhost:${port}/modeller/modeller.html`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('window.__sceneReady === true && !!window.Bonsai && typeof window.discWalk==="function"', { timeout: 30000 }).catch(() => {});

  const scPass = await runOne(pg, 'SampleCastle', true);   // primary — dramatic 325-fixture case, screenshot for guide-quality confirmation

  await pg.goto(`http://localhost:${port}/modeller/modeller.html`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('window.__sceneReady === true && !!window.Bonsai && typeof window.discWalk==="function"', { timeout: 30000 }).catch(() => {});
  const dxPass = await runOne(pg, 'Duplex', false);        // regression-only

  console.log('\nerrors=' + errs.length + (errs.length ? ' ' + JSON.stringify(errs) : ''));
  console.log('W-XRAY-SC-LIVE=' + (scPass ? 'PASS' : 'FAIL') + '  W-XRAY-DUPLEX-REGRESSION=' + (dxPass ? 'PASS' : 'FAIL'));
  await br.close(); server.close();
  process.exit(scPass && dxPass && errs.length === 0 ? 0 : 1);
})();
