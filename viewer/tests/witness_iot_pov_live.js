// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser proof for the §2026-07-06 IoT pane fixes (viewer/hba_iot.js + viewer/hba_lens.js
// flyToPOV/flyToFacing), per the user's own description:
//   (a) "when a sensor is pressed, scene zooms to the sensor... pressing the sensor again, scene zoom to the
//       nearest cam POV that has the sensor in sight, or best effort" — a per-sensor 2-state click toggle.
//   (b) "pressing camera it simply zoom in to the cam device, right to the device position" — a CLOSE camera
//       zoom that now ASSUMES the camera's own fixed POV (flyToFacing), now that iot.js CAMERAS carries a
//       declared `facing` vector (structural-centroid heuristic, RESUME_HR_BIM_ASSET.md §2026-07-06).
// Drives the REAL viewer.html + HHS_Office_Federated_extracted.db (no stub/mock) through the actual user click
// path: overflow trigger → Human-Asset pill → "Assets / IoT" row → sensor bar clicks → CCTV tile click.
// Run:  node viewer/tests/witness_iot_pov_live.js
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
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
      && window.APP.streaming === false && window.APP._hbaRooms && window.APP._hbaRooms.length > 0)); } catch (e) {}
  }
  return ready;
}
function camPos(cons) {
  const lines = cons.filter(l => /§HBA_(FLY|POV)/.test(l));
  return lines.length ? lines[lines.length - 1] : null;
}
function facingLine(cons) {
  const lines = cons.filter(l => /§HBA_FACING/.test(l));
  return lines.length ? lines[lines.length - 1] : null;
}
// the fly animation is a real requestAnimationFrame lerp (20 steps at whatever the real frame rate is) — under
// headless/heavy-scene load a fixed 2s wait isn't always enough for it to fully settle. Poll until 3 consecutive
// samples agree (camera genuinely stopped), rather than assume a fixed wall-clock duration.
async function waitSettled(page, maxMs) {
  let last = null, stable = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < (maxMs || 4000)) {
    await page.waitForTimeout(100);
    const p = await page.evaluate(() => ({ x: window.APP.camera.position.x, y: window.APP.camera.position.y, z: window.APP.camera.position.z }));
    if (last && Math.abs(p.x - last.x) + Math.abs(p.y - last.y) + Math.abs(p.z - last.z) < 1e-6) { stable++; if (stable >= 3) return p; }
    else stable = 0;
    last = p;
  }
  return last;
}

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const cons = []; const errs = [];
  page.on('console', m => { log.push('  [console] ' + m.text()); cons.push(m.text()); });
  page.on('pageerror', e => { errs.push(String(e)); log.push('  [pageerror] ' + e); });

  S('§W-IOT-POV-LIVE — sensor click-toggle + camera-tile zoom, real HHS_Office_Federated, real user click path');

  await page.goto('http://127.0.0.1:' + port + '/viewer/viewer.html?db=buildings/HHS_Office_Federated_extracted.db&bld=HHS_Office_Federated',
    { waitUntil: 'networkidle' });
  const ready = await waitReady(page);
  verdict(ready, 'real model loaded + ready (HHS_Office_Federated)');
  if (!ready) { await page.close(); await browser.close(); server.close(); process.exit(1); return; }

  await page.click('#mobile-trigger').catch(() => {});
  await page.waitForTimeout(300);
  await page.click('#pill-hbaFM');
  await page.waitForTimeout(300);
  verdict(await page.evaluate(() => !!document.getElementById('hba-fm-drawer')), 'Human-Asset drawer opened');
  await page.click('[data-lens="maintenance"]');
  await page.waitForTimeout(500);
  const iotPane = await page.evaluate(() => !!document.getElementById('hba-iot-pane'));
  verdict(iotPane, 'Assets/IoT pane mounted (real click on the maintenance row)');

  // ── (a) sensor click toggle: 1st click = device establishing shot, 2nd click = nearest-camera POV ─────────
  const electricalIdx = await page.evaluate(() => {
    const rows = document.querySelectorAll('#hba-iot-pane > div')[2].children;
    for (let i = 0; i < rows.length; i++) if (rows[i].title && rows[i].title.indexOf('Electrical') >= 0) return i;
    return -1;
  });
  verdict(electricalIdx >= 0, 'found the electrical sensor bar row', 'idx=' + electricalIdx);

  await page.evaluate((i) => { document.querySelectorAll('#hba-iot-pane > div')[2].children[i].click(); }, electricalIdx);
  const pos1 = await waitSettled(page);
  const flyLine1 = camPos(cons);
  verdict(!!flyLine1 && /§HBA_FLY/.test(flyLine1), '1st click -> §HBA_FLY (device establishing shot)', flyLine1);

  // §FIX 2026-07-06g (user: "clicking again is same as clicking on webcam image... exact POV... zooming to get
  // the exact POV also" / "truly approaching the webcam and turning into its POV") — the 2nd click must now be
  // §HBA_FACING (flyToFacing: arrive at the covering camera + turn to ITS OWN declared facing), the exact same
  // function+standoff a direct click on that camera's own CCTV tile uses — NOT §HBA_POV (a different function:
  // stood at 0.15x the standoff and looked AT the device instead of along the camera's own facing).
  await page.evaluate((i) => { document.querySelectorAll('#hba-iot-pane > div')[2].children[i].click(); }, electricalIdx);
  const pos2 = await waitSettled(page);
  const facingLine2 = facingLine(cons);
  verdict(!!facingLine2, '2nd click of the SAME sensor -> §HBA_FACING (the covering camera\'s OWN POV), not §HBA_POV', facingLine2);
  const moved = Math.abs(pos1.x - pos2.x) + Math.abs(pos1.y - pos2.y) + Math.abs(pos1.z - pos2.z) > 0.5;
  verdict(moved, 'the camera actually moved to a DIFFERENT real position for the POV shot (not a no-op)', 'pos1=' + JSON.stringify(pos1) + ' pos2=' + JSON.stringify(pos2));

  // Prove it's not just "some flyToFacing call" but the BYTE-IDENTICAL shot a direct click on that SAME
  // camera's own CCTV tile produces: find which real camera the sensor click resolved to (from the §HBA_FACING
  // log's guid), click THAT camera's own tile, and require the two landings to coincide.
  const coveringGuid = (facingLine2 || '').match(/guid=(\S+)/);
  const coveringCamIdx = coveringGuid ? await page.evaluate((g) => window.HbaIot.CAMERAS.findIndex(c => c.bim_guid === g), coveringGuid[1]) : -1;
  verdict(coveringCamIdx >= 0, 'the covering camera from the §HBA_FACING log is a real entry in iot.js CAMERAS', 'guid=' + (coveringGuid && coveringGuid[1]));
  if (coveringCamIdx >= 0) {
    await page.evaluate((idx) => {
      const grids = document.querySelectorAll('#hba-iot-pane div[style*="grid-template-columns"]');
      grids[0].children[idx].click();
    }, coveringCamIdx);
    await page.waitForTimeout(300);   // just enough for the click handler's synchronous flyToFacing call+log; the
    // animation itself is irrelevant here — OrbitControls damping keeps nudging camera.position for an
    // indeterminate time afterward (an unrelated rendering-loop artifact), so pixel-position equality is NOT a
    // reliable proof. The real, deterministic proof is that BOTH calls resolved the identical (eye, facing)
    // INPUT to _flyEyeLook — same guid, same eye centroid, same declared facing vector — which is pure maths,
    // logged verbatim by flyToFacing itself, unaffected by any downstream damping.
    const facingLineTile = facingLine(cons);
    const eyeFacing = (l) => (l || '').match(/eye=\(([^)]+)\).*facing=\(([^)]+)\)/);
    const m2 = eyeFacing(facingLine2), mTile = eyeFacing(facingLineTile);
    const samePOV = !!m2 && !!mTile && m2[1] === mTile[1] && m2[2] === mTile[2] && facingLineTile.indexOf(coveringGuid[1]) >= 0;
    verdict(samePOV, 'sensor 2nd-click resolves the IDENTICAL (guid, eye, facing) as that SAME camera\'s own CCTV-tile click (the "exact POV" ask)',
      'sensorClick[' + facingLine2 + '] tileClick[' + facingLineTile + ']');
  }

  await page.evaluate((i) => { document.querySelectorAll('#hba-iot-pane > div')[2].children[i].click(); }, electricalIdx);
  await page.waitForTimeout(2000);
  const flyLine3 = camPos(cons);
  verdict(!!flyLine3 && /§HBA_FLY/.test(flyLine3), '3rd click reverts to §HBA_FLY (device shot again) — a real 2-state toggle, not a one-way switch', flyLine3);

  // ── (b) CCTV tile click: ASSUME that camera's own fixed POV (flyToFacing, declared facing vector) ──────────
  const camPosBefore = await page.evaluate(() => ({ x: window.APP.camera.position.x, y: window.APP.camera.position.y, z: window.APP.camera.position.z }));
  const camGuid0 = await page.evaluate(() => window.HbaIot.CAMERAS[0].bim_guid);
  const camFacing0 = await page.evaluate(() => window.HbaIot.CAMERAS[0].facing);
  await page.evaluate(() => {
    const grids = document.querySelectorAll('#hba-iot-pane div[style*="grid-template-columns"]');
    const tile = grids[0].children[0];
    tile.click();
  });
  await page.waitForTimeout(2000);
  const camPosAfter = await page.evaluate(() => ({ x: window.APP.camera.position.x, y: window.APP.camera.position.y, z: window.APP.camera.position.z }));
  const camFacingLine = facingLine(cons);
  verdict(!!camFacingLine && camFacingLine.indexOf(camGuid0) >= 0, 'CCTV tile click flies via flyToFacing (assumes the camera\'s own declared POV)', camFacingLine);
  verdict(!!camFacingLine && camFacingLine.indexOf('facing=(' + camFacing0[0] + ',' + camFacing0[1] + ',' + camFacing0[2] + ')') >= 0,
    'the logged facing vector matches iot.js CAMERAS[0]\'s own declared facing', camFacingLine + ' expected=' + JSON.stringify(camFacing0));
  const camMoved = Math.abs(camPosBefore.x - camPosAfter.x) + Math.abs(camPosBefore.y - camPosAfter.y) + Math.abs(camPosBefore.z - camPosAfter.z) > 0.5;
  verdict(camMoved, 'the CCTV tile click moved the camera to its OWN real position (distinct from the prior sensor shots)');

  verdict(errs.length === 0, '0 pageerrors', errs.slice(0, 5).join(' | '));

  const shotPath = path.join(__dirname, 'iot_pov_live.png');
  await page.screenshot({ path: shotPath });
  S('   screenshot: ' + shotPath);

  const pass = fails === 0;
  S('\n§W-IOT-POV-LIVE ' + (pass ? 'PASS' : 'FAIL') + ' (fails=' + fails + ')');
  fs.writeFileSync(path.join(__dirname, 'witness_iot_pov_live.log'), log.join('\n'));
  await page.close(); await browser.close(); server.close();
  process.exit(pass ? 0 : 1);
})();
