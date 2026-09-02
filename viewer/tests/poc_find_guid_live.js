// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser §-witness for the §2026-07-04c reverse Zoom-Across's "vice versa, precisely" proof —
//   the ACTUAL "would land you on the right BUILDING, never the right ELEMENT" gap fixed. Against the REAL
//   viewer.html + HHS_Office_Federated_extracted.db (the only building with a seeded warehouse/attendance
//   fixture) + the REAL viewer/hba_lens.js _consumeFindGuid boot consumer (no mock/stub). PROVES:
//     - ?find=<room guid> flies the REAL camera/controls to that room's OWN centroid (not the whole building) —
//       asserted against the SAME §HBA_FLY center=(x,y,z) log line the engine itself emits, cross-checked
//       against the actual live `controls.target`, not just "a log line appeared".
//     - ?find=<employee code with an OPEN attendance session> resolves via that session's zone and flies there
//       too — the genuinely new path this session's build order added (erp/idempiere.html's ad_user/s_resource
//       branches can only pass a code, never the person's own current room; the Viewer does that resolution).
//     - a baseline load (no ?find=) does NOT fly anywhere (camera stays at its default framing) — the fly is
//       driven BY the param, not by coincidence.
//     - 0 pageerrors on every load.
//   §-log first — READ tests/poc_find_guid_live.log before any conclusion (exit code is NOT evidence).
// Run:  node viewer/tests/poc_find_guid_live.js
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
function parseFlyCenter(consoleLines, guid) {
  const re = new RegExp('§HBA_FLY guid=' + guid + ' center=\\(([\\-0-9.]+),([\\-0-9.]+),([\\-0-9.]+)\\)');
  for (const l of consoleLines) { const m = re.exec(l); if (m) return { x: Number(m[1]), y: Number(m[2]), z: Number(m[3]) }; }
  return null;
}

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch();

  S('§W-FIND-GUID-LIVE — reverse Zoom-Across lands the Viewer on the SAME element, not just the building (HHS_Office_Federated)');

  // ── 0. baseline — no ?find= at all → no fly, camera stays at default framing ────────────────────────────────
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const cons = []; const errs = [];
    page.on('console', m => { log.push('  [console] ' + m.text()); cons.push(m.text()); });
    page.on('pageerror', e => { errs.push(String(e)); log.push('  [pageerror] ' + e); });
    await page.goto('http://127.0.0.1:' + port + '/viewer/viewer.html?db=buildings/HHS_Office_Federated_extracted.db&bld=HHS_Office_Federated',
      { waitUntil: 'networkidle' });
    const ready = await waitReady(page);
    verdict(ready, 'baseline load ready (no ?find=)');
    await page.waitForTimeout(2000);
    verdict(!cons.some(l => /§HBA_FIND_GUID/.test(l)), 'NO §HBA_FIND_GUID log line when no ?find= param is present (silent on the common path)');
    verdict(!cons.some(l => /§HBA_FLY/.test(l)), 'NO fly triggered — camera stays at its default framing');
    verdict(errs.length === 0, '0 pageerrors (baseline)', errs.slice(0, 3).join(' | '));
    await page.close();
  }

  // ── 1. direct guid — ?find=RM_Level_1_1 flies straight to that room's own centroid ─────────────────────────
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const cons = []; const errs = [];
    page.on('console', m => { log.push('  [console] ' + m.text()); cons.push(m.text()); });
    page.on('pageerror', e => { errs.push(String(e)); log.push('  [pageerror] ' + e); });
    await page.goto('http://127.0.0.1:' + port + '/viewer/viewer.html?db=buildings/HHS_Office_Federated_extracted.db&bld=HHS_Office_Federated&find=RM_Level_1_1',
      { waitUntil: 'networkidle' });
    const ready = await waitReady(page);
    verdict(ready, 'direct-guid load ready (?find=RM_Level_1_1)');
    await page.waitForTimeout(2500);   // let the rAF fly-lerp settle
    verdict(cons.some(l => /§HBA_FIND_GUID flew directly guid=RM_Level_1_1/.test(l)), '§HBA_FIND_GUID flew directly (a rendered room guid, no attendance lookup)');
    const center = parseFlyCenter(cons, 'RM_Level_1_1');
    verdict(!!center, '§HBA_FLY logged a REAL (non-fabricated) centroid for RM_Level_1_1', center ? JSON.stringify(center) : 'missing');
    const target = await page.evaluate(() => window.APP.controls ? { x: window.APP.controls.target.x, y: window.APP.controls.target.y, z: window.APP.controls.target.z } : null);
    verdict(!!target && !!center && Math.abs(target.x - center.x) < 0.05 && Math.abs(target.y - center.y) < 0.05 && Math.abs(target.z - center.z) < 0.05,
      'the ACTUAL live camera controls.target matches the logged centroid (not just a log line — the canvas really moved there)',
      'target=' + JSON.stringify(target) + ' center=' + JSON.stringify(center));
    verdict(errs.length === 0, '0 pageerrors (direct guid)', errs.slice(0, 3).join(' | '));
    await page.close();
  }

  // ── 2. employee code — ?find=EMP001 (open attendance session) resolves via that session's zone, flies there ─
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const cons = []; const errs = [];
    page.on('console', m => { log.push('  [console] ' + m.text()); cons.push(m.text()); });
    page.on('pageerror', e => { errs.push(String(e)); log.push('  [pageerror] ' + e); });
    await page.goto('http://127.0.0.1:' + port + '/viewer/viewer.html?db=buildings/HHS_Office_Federated_extracted.db&bld=HHS_Office_Federated&find=EMP001',
      { waitUntil: 'networkidle' });
    const ready = await waitReady(page);
    verdict(ready, 'employee-code load ready (?find=EMP001)');
    await page.waitForTimeout(2500);
    // independently derive EMP001's OPEN zone via the SAME real attendance log the boot consumer reads — not a
    // re-implementation of the resolution logic, just the public sessions() reader, cross-checking the result.
    const expected = await page.evaluate(() => {
      const sess = window.HbaAttendance.sessions(window.APP._hbaAttendanceLog, window.APP._hbaPeriod ||
        (new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0')));
      const open = sess.filter(s => s.employee === 'EMP001' && s.open)[0];
      return open ? open.zone : null;
    });
    verdict(!!expected, 'EMP001 has a REAL open attendance session in the live model (zone=' + expected + ')');
    verdict(cons.some(l => new RegExp('§HBA_FIND_GUID employee=EMP001 → open session zone=' + expected + ' flew=true').test(l)),
      'the boot consumer resolved the SAME zone independently derived above, and flew there', 'zone=' + expected);
    const center2 = expected ? parseFlyCenter(cons, expected) : null;
    verdict(!!center2, '§HBA_FLY logged a REAL centroid for the resolved zone', center2 ? JSON.stringify(center2) : 'missing');
    const target2 = await page.evaluate(() => window.APP.controls ? { x: window.APP.controls.target.x, y: window.APP.controls.target.y, z: window.APP.controls.target.z } : null);
    verdict(!!target2 && !!center2 && Math.abs(target2.x - center2.x) < 0.05 && Math.abs(target2.y - center2.y) < 0.05 && Math.abs(target2.z - center2.z) < 0.05,
      'the ACTUAL live camera controls.target matches EMP001\'s resolved-zone centroid — the person\'s room, not just the building',
      'target=' + JSON.stringify(target2) + ' center=' + JSON.stringify(center2));
    verdict(errs.length === 0, '0 pageerrors (employee code)', errs.slice(0, 3).join(' | '));
    await page.close();
  }

  const pass = fails === 0;
  S('\n§W-FIND-GUID-LIVE ' + (pass ? 'PASS' : 'FAIL') + ' (fails=' + fails + ')');
  fs.writeFileSync(path.join(__dirname, 'poc_find_guid_live.log'), log.join('\n'));
  await browser.close(); server.close();
  process.exit(pass ? 0 : 1);
})();
