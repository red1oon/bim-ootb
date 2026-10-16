// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser proof for §2026-07-06c items A + B (RESUME_HR_BIM_ASSET.md):
//   (A) UnitClass room-outline now shines through occluding geometry (depthTest:false on the
//       LineBasicMaterial in viewer/hba_lens.js's _drawOutlines).
//   (B) The 6 HBA side panels (dashboard/bom/leave/tenancy/payslip/iot) now cascade to distinct
//       right offsets instead of all sharing top:54px;right:12px — verify 2 opened at once (BOM +
//       IoT, the user's own named example) do not pairwise-overlap.
// Drives the REAL viewer.html + HHS_Office_Federated_extracted.db, real user click path (pill →
// drawer → row clicks) — not a seam/unit test. Read the log after the run, not just the exit code.
// Run:  node viewer/tests/witness_hba_outline_panel_fixes.js
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

  S('§W-HBA-OUTLINE-PANEL-FIX — item A (outline shine-through) + item B (panel cascade), real HHS_Office_Federated, real user click path');

  await page.goto('http://127.0.0.1:' + port + '/viewer/viewer.html?db=buildings/HHS_Office_Federated_extracted.db&bld=HHS_Office_Federated',
    { waitUntil: 'load', timeout: 60000 });
  const ready = await waitReady(page);
  verdict(ready, 'real model loaded + ready (HHS_Office_Federated)');
  if (!ready) { await page.close(); await browser.close(); server.close(); process.exit(1); return; }

  await page.click('#mobile-trigger').catch(() => {});
  await page.waitForTimeout(300);
  await page.click('#pill-hbaFM');
  await page.waitForTimeout(300);
  verdict(await page.evaluate(() => !!document.getElementById('hba-fm-drawer')), 'Human-Asset drawer opened');

  // ── item A: Unit Class outline material must be depthTest:false + high renderOrder ──────────────
  await page.click('[data-lens="class"]');
  await page.waitForTimeout(500);
  const outlineProbe = await page.evaluate(() => {
    var grp = window.APP && window.APP.scene && window.APP.scene.children.filter(function (c) { return c.name === 'hba-class-outlines'; })[0];
    if (!grp || !grp.children.length) return null;
    var l = grp.children[0];
    return { count: grp.children.length, depthTest: l.material.depthTest, renderOrder: l.renderOrder, transparent: l.material.transparent };
  });
  verdict(!!outlineProbe, 'Unit Class outline group drawn with >=1 room outline', JSON.stringify(outlineProbe));
  if (outlineProbe) {
    verdict(outlineProbe.depthTest === false, 'outline material has depthTest:false (shines through occluding geometry)', JSON.stringify(outlineProbe));
    verdict(outlineProbe.renderOrder >= 999, 'outline renderOrder is high enough to draw on top', 'renderOrder=' + outlineProbe.renderOrder);
  }
  // turn Unit Class back off (one-mode-at-a-time convention) before moving to item B
  await page.click('[data-lens="class"]');
  await page.waitForTimeout(300);

  // ── item B: open BOM + IoT (the user's own named pair) simultaneously, confirm no pairwise overlap ──
  await page.click('[data-lens="bom"]');
  await page.waitForTimeout(500);
  await page.click('[data-lens="maintenance"]');
  await page.waitForTimeout(500);
  const rects = await page.evaluate(() => {
    var bom = document.getElementById('hba-bom-pane');
    var iot = document.getElementById('hba-iot-pane');
    function r(el) { if (!el) return null; var b = el.getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top, bottom: b.bottom }; }
    return { bom: r(bom), iot: r(iot) };
  });
  verdict(!!rects.bom, 'BOM pane mounted', JSON.stringify(rects.bom));
  verdict(!!rects.iot, 'IoT pane mounted', JSON.stringify(rects.iot));
  if (rects.bom && rects.iot) {
    const overlapX = rects.bom.left < rects.iot.right && rects.iot.left < rects.bom.right;
    const overlapY = rects.bom.top < rects.iot.bottom && rects.iot.top < rects.bom.bottom;
    const overlaps = overlapX && overlapY;
    verdict(!overlaps, 'BOM pane and IoT pane do NOT pairwise-overlap (were byte-identical position before this fix)',
      'bom=' + JSON.stringify(rects.bom) + ' iot=' + JSON.stringify(rects.iot));
  }

  verdict(errs.length === 0, '0 pageerrors', errs.slice(0, 5).join(' | '));

  const shotPath = path.join(__dirname, 'hba_outline_panel_fixes.png');
  await page.screenshot({ path: shotPath });
  S('   screenshot: ' + shotPath);

  const pass = fails === 0;
  S('\n§W-HBA-OUTLINE-PANEL-FIX ' + (pass ? 'PASS' : 'FAIL') + ' (fails=' + fails + ')');
  fs.writeFileSync(path.join(__dirname, 'witness_hba_outline_panel_fixes.log'), log.join('\n'));
  await page.close(); await browser.close(); server.close();
  process.exit(pass ? 0 : 1);
})();
