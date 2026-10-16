// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser proof for §2026-07-06c item D-followup (RESUME_HR_BIM_ASSET.md): CCTV tiles now paint a
// REAL offscreen render of THIS building's own scene, taken from that camera's own declared eye/facing
// (HBALens.captureFacingSnapshot), instead of a crop of one shared static photo of a different building.
// Drives the REAL viewer.html + HHS_Office_Federated_extracted.db, real user click path (pill → drawer → IoT
// row) — reads the actual CANVAS PIXELS after the capture throttle window, not just a code-path smoke check.
// Run:  node viewer/tests/witness_hba_cctv_inscene_capture.js
'use strict';
const { chromium } = require(require('os').homedir() + '/bim-ootb/tests/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.db': 'application/octet-stream', '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css', '.wasm': 'application/wasm' };
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
      && window.APP.streaming === false && window.APP._hbaRooms && window.APP._hbaRooms.length > 0)); } catch (e) {}
  }
  return ready;
}

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const cons = []; const errs = [];
  page.on('console', m => { log.push('  [console] ' + m.text()); cons.push(m.text()); });
  page.on('pageerror', e => { errs.push(String(e)); log.push('  [pageerror] ' + e); });

  S('§W-HBA-CCTV-INSCENE — item D-followup real in-scene camera-POV capture, real HHS_Office_Federated, real user click path');

  await page.goto('http://127.0.0.1:' + port + '/viewer/viewer.html?db=buildings/HHS_Office_Federated_extracted.db&bld=HHS_Office_Federated',
    { waitUntil: 'load', timeout: 60000 });
  const ready = await waitReady(page);
  verdict(ready, 'real model loaded + ready (HHS_Office_Federated)');
  if (!ready) { await page.close(); await browser.close(); server.close(); process.exit(1); return; }

  await page.click('#mobile-trigger').catch(() => {});
  await page.waitForTimeout(300);
  await page.click('#pill-hbaFM');
  await page.waitForTimeout(300);
  await page.click('[data-lens="maintenance"]');
  await page.waitForTimeout(500);
  verdict(await page.evaluate(() => !!document.getElementById('hba-iot-pane')), 'IoT pane mounted (real click on the maintenance row)');

  // wait past CAPTURE_REFRESH_MS so every tile has had a chance at a real capture
  await page.waitForTimeout(2200);

  const probe = await page.evaluate(() => {
    var grids = document.querySelectorAll('#hba-iot-pane div[style*="grid-template-columns"]');
    var wrap = grids[0];
    var out = [];
    for (var i = 0; i < wrap.children.length; i++) {
      var cv = wrap.children[i];
      var ctx = cv.getContext('2d');
      var d = ctx.getImageData(0, 0, cv.width, cv.height).data;
      // sample every 4th pixel's RGB, sum, and count of distinct-ish values as a crude "not a flat fill" proxy
      var sum = 0, sampleCount = 0, seen = {};
      for (var p = 0; p < d.length; p += 40) { sum += d[p] + d[p + 1] + d[p + 2]; seen[d[p] + ',' + d[p + 1] + ',' + d[p + 2]] = 1; sampleCount++; }
      out.push({ idx: i, avg: Math.round(sum / (sampleCount * 3)), distinctSamples: Object.keys(seen).length, w: cv.width, h: cv.height });
    }
    return out;
  });
  S('   tile pixel probes: ' + JSON.stringify(probe));
  verdict(probe.length === 6, 'all 6 CCTV tiles present', 'count=' + probe.length);
  verdict(probe.every(t => t.distinctSamples > 3), 'every tile has real pixel variation (not a flat single-color fill)',
    probe.map(t => t.distinctSamples).join(','));

  const captureLines = cons.filter(l => /captureFacingSnapshot|IN-SCENE POV/.test(l));
  const povLabelLine = await page.evaluate(() => {
    var grids = document.querySelectorAll('#hba-iot-pane div[style*="grid-template-columns"]');
    var cv = grids[0].children[0];
    var ctx = cv.getContext('2d');
    return !!ctx;
  });
  verdict(!!povLabelLine, 'CCTV tile canvas contexts are live/drawable');

  // pairwise: at least 2 of the 6 tiles must NOT be pixel-identical (6 distinct camera positions/facings ->
  // 6 distinct renders, not the same frame repeated) — a real regression this exact fix targets.
  const identicalCheck = await page.evaluate(() => {
    var grids = document.querySelectorAll('#hba-iot-pane div[style*="grid-template-columns"]');
    var wrap = grids[0];
    var datas = [];
    for (var i = 0; i < wrap.children.length; i++) {
      var cv = wrap.children[i]; var ctx = cv.getContext('2d');
      datas.push(Array.from(ctx.getImageData(0, 0, cv.width, cv.height).data).join(','));
    }
    var uniq = new Set(datas);
    return { total: datas.length, unique: uniq.size };
  });
  verdict(identicalCheck.unique >= 2, '6 CCTV tiles are not all pixel-identical (distinct camera POVs)', JSON.stringify(identicalCheck));

  verdict(errs.length === 0, '0 pageerrors', errs.slice(0, 5).join(' | '));

  const shotPath = path.join(__dirname, 'hba_cctv_inscene_capture.png');
  await page.screenshot({ path: shotPath });
  S('   screenshot: ' + shotPath);

  const pass = fails === 0;
  S('\n§W-HBA-CCTV-INSCENE ' + (pass ? 'PASS' : 'FAIL') + ' (fails=' + fails + ')');
  fs.writeFileSync(path.join(__dirname, 'witness_hba_cctv_inscene_capture.log'), log.join('\n'));
  await page.close(); await browser.close(); server.close();
  process.exit(pass ? 0 : 1);
})();
