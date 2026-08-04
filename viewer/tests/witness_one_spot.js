#!/usr/bin/env node
// One spot, one phase, one process — avoids whatever caused repeated in-process browser
// relaunches to hang (2nd+ puppeteer.launch() in the same node process reliably stalled).
// Usage: node witness_one_spot.js <before|after> <A|B|C>
const puppeteer = require('/home/red1/bim-compiler/node_modules/puppeteer');
const fs = require('fs');
const path = require('path');
const PORT = 8493;
const EFFECTS = path.join(__dirname, '..', '..', 'viewer/effects.js');
const DD_FIXED = '    for (var dd = 1.5; dd <= 13; dd += 2.875) {';
const DD_OLD = '    for (var dd = 4; dd <= 13; dd += 3) {';
const LAT_FIXED = '      var _latMax = dd * (4.5 / 13);\n      for (var lat = -_latMax; lat <= _latMax; lat += Math.max(_latMax * 0.66, 0.1)) {';
const LAT_OLD = '      for (var lat = -4.5; lat <= 4.5; lat += 3) {';

const HHS_SPOTS = {
  A: { eye3: [-6.65, -4.82, 15.82], target3: [3.35, -4.82, 15.82] },
  B: { eye3: [-6.65, -4.82, 20.78], target3: [-6.65, -4.82, 10.78] },
  C: { eye3: [-12.78, -4.82, 17.47], target3: [-12.78, -4.82, 27.47] },
};

const phase = process.argv[2], spotName = process.argv[3];
if (!['before', 'after'].includes(phase) || !HHS_SPOTS[spotName]) {
  console.error('usage: node witness_one_spot.js <before|after> <A|B|C>'); process.exit(1);
}
const spot = HHS_SPOTS[spotName];

function ensurePhase(target) {
  const src = fs.readFileSync(EFFECTS, 'utf8');
  const isFixed = src.includes(DD_FIXED) && src.includes(LAT_FIXED);
  const isOld = src.includes(DD_OLD) && src.includes(LAT_OLD);
  if (!isFixed && !isOld) throw new Error('file in neither known state — drifted, aborting');
  if (target === 'before' && isFixed) {
    fs.writeFileSync(EFFECTS, src.replace(DD_FIXED, DD_OLD).replace(LAT_FIXED, LAT_OLD));
  } else if (target === 'after' && isOld) {
    fs.writeFileSync(EFFECTS, src.replace(DD_OLD, DD_FIXED).replace(LAT_OLD, LAT_FIXED));
  }
}

(async () => {
  ensurePhase(phase);
  console.log('on-disk: ' + fs.readFileSync(EFFECTS, 'utf8').split('\n').filter(l => l.includes('for (var dd') || l.includes('for (var lat')).join(' | '));

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox',
           '--enable-unsafe-swiftshader', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  const lines = [];
  page.on('console', m => { const t = m.text(); if (/§/.test(t)) lines.push(t); });
  page.on('pageerror', e => lines.push('PAGEERROR ' + e.message));

  const url = `http://localhost:${PORT}/viewer/viewer.html?db=buildings/HHS_Office_Federated_extracted.db&bld=HHS_Office_Federated&cb=${Date.now()}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  const streamed = await page.waitForFunction(() => {
    const A = window.APP || window.A;
    if (!A || !A.scene) return false;
    let n = 0; A.scene.traverse(o => { if (o.isMesh || o.isInstancedMesh || o.isBatchedMesh) n++; });
    return n > 50 ? n : false;
  }, { timeout: 90000, polling: 3000 }).then(h => h.jsonValue()).catch(() => 0);
  console.log('streamed: ' + streamed);
  if (!streamed) { await browser.close(); console.log('RESULT err=no geometry streamed'); process.exit(1); }
  await new Promise(r => setTimeout(r, 12000));

  await page.evaluate((spot) => {
    const A = window.APP || window.A, THREE = window.THREE;
    A.camera.position.set(...spot.eye3);
    A.camera.lookAt(new THREE.Vector3(...spot.target3));
    A.camera.updateMatrixWorld(true);
    if (A.controls) { A.controls.target.set(...spot.target3); A.controls.update(); }
  }, spot);

  await page.evaluate(() => { const A = window.APP || window.A; A.togglePopulate(); });
  await new Promise(r => setTimeout(r, 6000));

  const distances = await page.evaluate(() => {
    const A = window.APP || window.A;
    const camPos = A.camera.position;
    const ds = [];
    A.scene.traverse(o => { if (o.userData && o.userData.interior === true) ds.push(+camPos.distanceTo(o.position).toFixed(2)); });
    return ds.sort((a, b) => a - b);
  });

  await browser.close();
  const interiorLine = lines.filter(l => /§PHOTO_STAFFAGE_INTERIOR/.test(l)).pop() || null;
  console.log('interiorLine: ' + interiorLine);
  console.log('distances: ' + JSON.stringify(distances));
  console.log(`RESULT phase=${phase} spot=${spotName} ${interiorLine} distances=${JSON.stringify(distances)}`);
  process.exit(0);
})().catch(e => { console.error('SCRIPT ERROR', e); process.exit(1); });
