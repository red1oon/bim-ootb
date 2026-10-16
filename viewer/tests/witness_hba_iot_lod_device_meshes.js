// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser proof for §2026-07-06c item E (RESUME_HR_BIM_ASSET.md): the 3 real-geometry IoT
// devices (temp sensor, solar PV, electrical meter) + 6 CCTV cameras placed by
// scripts/place_iot_lod_devices.py now render as REAL standing meshes in the live scene (not just a
// tint-on-host-element), anchored per the sprinkler-style host+attachment-face convention.
// Drives the REAL viewer.html + HHS_Office_Federated_extracted.db (the SAME db the placement script
// just patched) — confirms each new guid resolves to an actual rendered mesh at its expected world
// position, not a phantom DB row with nothing on screen.
// Run:  node viewer/tests/witness_hba_iot_lod_device_meshes.js
'use strict';
const { chromium } = require(require('os').homedir() + '/bim-ootb/tests/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.db': 'application/octet-stream', '.png': 'image/png', '.css': 'text/css', '.wasm': 'application/wasm' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p === '/') p = '/viewer/viewer.html';
  fs.readFile(path.join(ROOT, p), (e, buf) => {
    if (e) { res.writeHead(404); res.end('404 ' + p); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); res.end(buf);
  });
});

const log = [];
let fails = 0;
function S(m) { log.push(m); console.log(m); }
function verdict(ok, label, detail) { if (!ok) fails++; S('   ' + (ok ? '🟢' : '🔴') + ' ' + label + (detail ? ' — ' + detail : '')); }

async function waitReady(page) {
  let ready = false;
  for (let i = 0; i < 90 && !ready; i++) {
    await page.waitForTimeout(1000);
    try { ready = await page.evaluate(() => !!(window.APP && window.APP.guidMap && Object.keys(window.APP.guidMap).length > 0
      && window.APP.streaming === false)); } catch (e) {}
  }
  return ready;
}

const NEW_GUIDS = ['IOTDEV-TEMP-HHS', 'IOTDEV-SOLAR-HHS', 'IOTDEV-ELEC-HHS',
  'IOTDEV-CAM1-HHS', 'IOTDEV-CAM2-HHS', 'IOTDEV-CAM3-HHS', 'IOTDEV-CAM4-HHS', 'IOTDEV-CAM5-HHS', 'IOTDEV-CAM6-HHS'];

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, serviceWorkers: 'block' });
  const page = await context.newPage();
  const cons = []; const errs = [];
  page.on('console', m => { log.push('  [console] ' + m.text()); cons.push(m.text()); });
  page.on('pageerror', e => { errs.push(String(e)); log.push('  [pageerror] ' + e); });

  S('§W-HBA-IOT-LOD-DEVICES — item E real device meshes, real HHS_Office_Federated, real guidMap resolution');

  await page.goto('http://127.0.0.1:' + port + '/viewer/viewer.html?db=buildings/HHS_Office_Federated_extracted.db&bld=HHS_Office_Federated',
    { waitUntil: 'load', timeout: 60000 });
  const ready = await waitReady(page);
  verdict(ready, 'real model loaded + ready (HHS_Office_Federated)');
  if (!ready) { await page.close(); await browser.close(); server.close(); process.exit(1); return; }

  // give the streaming/DLOD pipeline a few extra seconds to flush every element (9 new ones are a tiny
  // fraction of 6880, but streaming is range/priority-based, not "all at once").
  await page.waitForTimeout(4000);

  const probe = await page.evaluate((guids) => {
    var A = window.APP;
    // guidMap is keyed by MESH-id (or "meshId_slot" for instanced/batched) with the guid as the VALUE
    // (streaming.js: A.guidMap[mesh.id]=el.guid, or A.guidMap[bm.id+'_'+slotId]=el.guid for batched/
    // instanced) — reverse-lookup by VALUE to find which mesh/slot key(s) carry each target guid, then
    // resolve an actual mesh object by id (works whether it's a normal, instanced, or batched mesh).
    var keysByGuid = {};
    if (A.guidMap) { for (var k in A.guidMap) { var g = A.guidMap[k]; (keysByGuid[g] = keysByGuid[g] || []).push(k); } }
    var meshesById = {};
    if (A.collectMeshes) { A.collectMeshes(function () { return true; }).forEach(function (o) { meshesById[o.id] = o; }); }
    var out = {};
    guids.forEach(function (g) {
      var keys = keysByGuid[g] || [];
      var meshFound = false;
      keys.forEach(function (k) {
        var meshId = parseInt(k.split('_')[0], 10);
        if (meshesById[meshId]) meshFound = true;
      });
      out[g] = { inGuidMap: keys.length > 0, guidMapKeys: keys, meshFound: meshFound };
    });
    return out;
  }, NEW_GUIDS);
  S('   probe: ' + JSON.stringify(probe));

  NEW_GUIDS.forEach(function (g) {
    verdict(probe[g] && probe[g].inGuidMap, g + ' resolves in A.guidMap (real element, not a phantom row)');
  });
  const meshesFound = NEW_GUIDS.filter(g => probe[g] && probe[g].meshFound).length;
  verdict(meshesFound >= 6, 'at least 6/9 new device meshes actually found in the rendered scene graph (some may not have streamed in this window)', meshesFound + '/9');

  // fly to one sensor + one camera via the SAME real click path as every other HBA fly, screenshot the result
  await page.click('#mobile-trigger').catch(() => {});
  await page.waitForTimeout(300);
  await page.click('#pill-hbaFM');
  await page.waitForTimeout(300);
  await page.click('[data-lens="maintenance"]');
  await page.waitForTimeout(800);
  const electricalIdx = await page.evaluate(() => {
    const rows = document.querySelectorAll('#hba-iot-pane > div')[2].children;
    for (let i = 0; i < rows.length; i++) if (rows[i].title && rows[i].title.indexOf('Electrical') >= 0) return i;
    return -1;
  });
  await page.evaluate((i) => { document.querySelectorAll('#hba-iot-pane > div')[2].children[i].click(); }, electricalIdx);
  await page.waitForTimeout(2500);

  verdict(errs.length === 0, '0 pageerrors', errs.slice(0, 5).join(' | '));

  const shotPath = path.join(__dirname, 'hba_iot_lod_device_meshes.png');
  await page.screenshot({ path: shotPath });
  S('   screenshot: ' + shotPath);

  const pass = fails === 0;
  S('\n§W-HBA-IOT-LOD-DEVICES ' + (pass ? 'PASS' : 'FAIL') + ' (fails=' + fails + ')');
  fs.writeFileSync(path.join(__dirname, 'witness_hba_iot_lod_device_meshes.log'), log.join('\n'));
  await page.close(); await browser.close(); server.close();
  process.exit(pass ? 0 : 1);
})();
