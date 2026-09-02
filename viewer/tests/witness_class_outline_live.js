// ⚠ DO NOT REMOVE — Scope guard
// Scope: real-browser proof for the §2026-07-06 fix to `_drawOutlines()` (viewer/hba_lens.js) — the Unit Class
// lens's room-outline box, which the user reported rendering OUTSIDE the building on HHS_Office_Federated
// (mobile mode). Root cause: `lines.position.set(fp.cx, fp.cy, fp.cz)` used the RAW spatial_structure footprint
// center directly, skipping A.ifc2three (subtract A.modelOffset, swap Y/Z) — the exact transform EVERY other
// rendered element goes through (scene.js:370). Fixed to `A.ifc2three(fp.cx, fp.cy, fp.cz)` + a matching
// BoxGeometry axis swap. This test drives the REAL viewer.html against the REAL HHS_Office_Federated_extracted.db
// (no stub/mock), clicking through the ACTUAL user path (pill → drawer → "Unit class" row) at BOTH desktop and
// mobile viewports (the user specifically saw this in mobile mode), then proves — numerically, not by eye —
// that the rendered outline box sits at ifc2three(footprint-center) and is positioned near a REAL member
// element's own (independently DB-queried, independently ifc2three'd) world position in the SAME room.
// §-log first — READ tests/witness_class_outline_live.log before any conclusion (exit code is NOT evidence).
// Run:  node viewer/tests/witness_class_outline_live.js
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

async function runViewport(browser, port, label, viewport) {
  S('\n── viewport=' + label + ' ' + JSON.stringify(viewport) + ' ──');
  const page = await browser.newPage({ viewport });
  const cons = []; const errs = [];
  page.on('console', m => { log.push('  [console] ' + m.text()); cons.push(m.text()); });
  page.on('pageerror', e => { errs.push(String(e)); log.push('  [pageerror] ' + e); });
  await page.goto('http://127.0.0.1:' + port + '/viewer/viewer.html?db=buildings/HHS_Office_Federated_extracted.db&bld=HHS_Office_Federated',
    { waitUntil: 'networkidle' });
  const ready = await waitReady(page);
  verdict(ready, 'real model loaded + ready (HHS_Office_Federated)');
  if (!ready) { await page.close(); return; }

  // ── real user path: click the ACTUAL Human-Asset pill, then the ACTUAL "Unit class" row ──────────────────
  // The Human-Asset pill lives inside the toolbar's overflow drawer (#mobile-pill, revealed by #mobile-trigger
  // — present at BOTH viewport sizes here, not just on phones) — a real user opens that drawer first.
  let triggerClicked = true;
  try { await page.click('#mobile-trigger', { timeout: 5000 }); } catch (e) { triggerClicked = false; log.push('  [trigger-click-err] ' + e.message); }
  verdict(triggerClicked, 'clicked the REAL #mobile-trigger to reveal the overflow pill drawer');
  await page.waitForTimeout(300);
  // §icon() wires onClick via a 'pointerup' listener (viewer/panels.js A.icon), not 'click' — use Playwright's
  // real mouse-driven page.click() (full pointerdown/move/up sequence), not a synthetic .click() DOM call.
  let pillClicked = true;
  try { await page.click('#pill-hbaFM', { timeout: 5000 }); } catch (e) { pillClicked = false; log.push('  [pill-click-err] ' + e.message); }
  verdict(pillClicked, 'clicked the REAL #pill-hbaFM pill (actual mouse pointerdown/up, not a synthetic DOM .click())');
  await page.waitForTimeout(300);
  const drawerOpen = await page.evaluate(() => !!document.getElementById('hba-fm-drawer'));
  verdict(drawerOpen, 'Human-Asset drawer opened');
  let rowClicked = true;
  try { await page.click('[data-lens="class"]', { timeout: 5000 }); } catch (e) { rowClicked = false; log.push('  [row-click-err] ' + e.message); }
  verdict(rowClicked, 'clicked the REAL "Unit class" row (data-lens="class")');
  await page.waitForTimeout(500);
  verdict(cons.some(l => /§HBA_LENS on mode=class/.test(l)), 'the real click fired §HBA_LENS on mode=class (not a stubbed call)');

  // ── numeric proof: outline box position vs ifc2three(footprint) vs a REAL member element's own position ──
  const check = await page.evaluate(() => {
    const A = window.APP;
    const fpMap = A._hbaRoomFootprint || {};
    const guid = Object.keys(fpMap)[0];
    if (!guid) return { error: 'no footprinted room in this building' };
    const fp = fpMap[guid];
    const expected = A.ifc2three(fp.cx, fp.cy, fp.cz);
    let group = null;
    A.scene.traverse(o => { if (o.name === 'hba-class-outlines') group = o; });
    const box = group && group.children[0] ? group.children[0].position : null;
    // an independent, real member element's own world position — queried FRESH from the DB (the same tables
    // streaming.js reads), never re-derived from the fix under test.
    let memberWorld = null, memberGuid = null;
    const members = (A._hbaRoomMembers && A._hbaRoomMembers[guid]) || [];
    if (members.length) {
      memberGuid = members[0];
      const rows = A.dbQuery("SELECT center_x, center_y, center_z FROM element_transforms WHERE guid = ?", [memberGuid]);
      if (rows && rows.length) memberWorld = A.ifc2three(rows[0][0], rows[0][1], rows[0][2]);
    }
    return { guid, fp, modelOffset: { x: A.modelOffset.x, y: A.modelOffset.y, z: A.modelOffset.z },
      expected, box, memberGuid, memberWorld };
  });
  S('   §CHECK ' + JSON.stringify(check));
  if (check.error) { verdict(false, 'a footprinted+linked room exists to check', check.error); }
  else {
    const eps = 1e-6;
    const posOk = check.box && Math.abs(check.box.x - check.expected.x) < eps
      && Math.abs(check.box.y - check.expected.y) < eps && Math.abs(check.box.z - check.expected.z) < eps;
    verdict(posOk, 'rendered outline box position === A.ifc2three(footprint-center) — real non-zero modelOffset=' + JSON.stringify(check.modelOffset),
      'box=' + JSON.stringify(check.box) + ' expected=' + JSON.stringify(check.expected));
    if (check.memberWorld) {
      const half = { x: check.fp.sx / 2, y: check.fp.sz / 2, z: check.fp.sy / 2 };
      const within = check.box
        && Math.abs(check.memberWorld.x - check.box.x) <= half.x + 0.5   // +0.5m slack for member-vs-room-centre offset
        && Math.abs(check.memberWorld.y - check.box.y) <= half.y + 0.5
        && Math.abs(check.memberWorld.z - check.box.z) <= half.z + 0.5;
      verdict(within, 'outline box CONTAINS/overlaps a REAL member element\'s own (independently DB-queried) world position — proves alignment with actual rendered geometry, not just internal self-consistency',
        'member=' + check.memberGuid + ' memberWorld=' + JSON.stringify(check.memberWorld) + ' box=' + JSON.stringify(check.box) + ' half=' + JSON.stringify(half));
    } else {
      S('   ⚪ no rendered member found in room ' + check.guid + ' to cross-check against (room has a footprint but no contained members bound) — position-vs-transform check above still stands');
    }
  }
  verdict(errs.length === 0, '0 pageerrors', errs.slice(0, 3).join(' | '));

  const shotPath = path.join(__dirname, 'class_outline_' + label + '.png');
  await page.screenshot({ path: shotPath });
  S('   screenshot: ' + shotPath);
  await page.close();
}

(async () => {
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const browser = await chromium.launch();

  S('§W-CLASS-OUTLINE-LIVE — Unit Class outline box sits on the real HHS_Office_Federated room, not outside the building');

  await runViewport(browser, port, 'desktop', { width: 1280, height: 900 });
  await runViewport(browser, port, 'mobile', { width: 390, height: 844 });

  const pass = fails === 0;
  S('\n§W-CLASS-OUTLINE-LIVE ' + (pass ? 'PASS' : 'FAIL') + ' (fails=' + fails + ')');
  fs.writeFileSync(path.join(__dirname, 'witness_class_outline_live.log'), log.join('\n'));
  await browser.close(); server.close();
  process.exit(pass ? 0 : 1);
})();
