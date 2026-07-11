// ⚠ DO NOT REMOVE — Scope guard
// Scope: bim-compiler prompts/FIND_PANEL_ISOLATE_NO_CAMERA_ZOOM.md — Find panel isolate-tap
// (Parts/Stairway/Lift/Plant Room leaves, Room-group, Material-group, Type-leaf) only ever called
// A.filterByGuids(set) (visibility) — never reframed the camera, so "isolate" looked like a zoom
// only by accident when the target already happened to be on-screen. Fix: navigate_find.js's
// shared _emitIsolate(set, by) (~line 2527) now also calls the SAME group-fit primitive
// _drillSelect/focusElement already use (_zoomToGroup(set), ~line 1786) right after the filter,
// and logs whether it actually fired: '[RP-A1] §FILTER ... zoom=fit|none'.
// This witness proves, on a REAL loaded building (Duplex — small/fast, has both Stairway (IfcStair)
// and Room data):
//   1. Real user path to open Find: #pill-navigate rail pill -> Navigate drawer -> #drawer-row-find
//      (fires A.openFindPanel('')) — same convention as
//      witness_find_panel_hidden_onload_2026-07-11.js, do not invent a different open path.
//   2. Camera is deliberately displaced far from the model (the exact "off to the side" condition
//      the bug report describes) BEFORE the isolate-tap, so a passing zoom=fit is not an accident
//      of the element already being on-screen.
//   3. Parts axis -> Stairway group -> LEAF tap -> [RP-A1] §FILTER line has zoom=fit.
//   4. Room axis -> top-level GROUP tap -> whatever the log shows (regression check — Task 2 of the
//      spec doc found Room's GROUP-header goes through the SAME _emitIsolate ONLY when the DB lacks
//      room bbox columns; Duplex HAS bbox columns, so Room's group tap takes the pre-existing
//      _drillSelect/_roomGroupSelect path instead, unaffected either way by this fix — reported
//      factually below, not forced).
// §-log first — READ tests/witness_isolate_zoom_2026-07-12.log before any conclusion.
// Run:  node viewer/tests/witness_isolate_zoom_2026-07-12.js
'use strict';
const { chromium } = require(process.env.PW || (require('os').homedir() + '/bim-ootb/tests/node_modules/playwright'));
const http = require('http'), fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.db': 'application/octet-stream', '.png': 'image/png', '.css': 'text/css', '.wasm': 'application/wasm',
  '.bin': 'application/octet-stream' };
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

async function tap(page, id) {
  // dispatch-click via evaluate — same convention as witness_find_panel_hidden_onload_2026-07-11.js.
  const hit = await page.evaluate((eid) => {
    const el = document.getElementById(eid);
    if (!el) return false;
    el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    return true;
  }, id);
  await page.waitForTimeout(400);
  return hit;
}

// Dispatch pointerup on a specific child (0=arrow/expand, 1=text/onTap) of a .find-tree-row
// matched by data-find-parent (group header) or, when parentLabel is null, the Nth leaf row
// found as a sibling of the group's row (leaf rows carry no data-find-parent attribute).
async function tapTreeGroup(page, label, childIdx) {
  return page.evaluate(([lbl, idx]) => {
    const row = document.querySelector('.find-tree-row[data-find-parent="' + lbl + '"]');
    if (!row) return false;
    const child = row.children[idx];
    if (!child) return false;
    child.dispatchEvent(new PointerEvent('pointerup', { bubbles: false }));
    return true;
  }, [label, childIdx]);
}
// Pick a leaf with RESOLVABLE geometry, not just "the first one". §BUILDING-PARTS-TAXONOMY's own
// comment in navigate_find.js documents that an IfcStair ASSEMBLY PARENT frequently carries no
// transform of its own — only its child IfcStairFlight does (existence-only match is correct for
// "does this building have a stair", not "does this exact node have a resolvable bbox"). Ground
// truth, not a label-pattern guess: query element_transforms directly via APP.dbQuery to find which
// element_name among the STAIRWAY-matched rows actually has a resolvable transform, then tap the
// DOM leaf whose text matches that exact name.
async function tapFirstLeafUnderGroup(page, groupLabel) {
  return page.evaluate((lbl) => {
    const row = document.querySelector('.find-tree-row[data-find-parent="' + lbl + '"]');
    if (!row) return { hit: false, reason: 'group row not found' };
    const container = row.nextElementSibling; // childContainer div, sibling of the group's row
    if (!container) return { hit: false, reason: 'no childContainer sibling' };
    const leaves = Array.from(container.querySelectorAll('.find-tree-row:not([data-find-parent])'));
    if (!leaves.length) return { hit: false, reason: 'no leaf rows inside childContainer' };
    const allLabels = leaves.map(l => l.textContent);
    let targetName = null;
    try {
      const rows = window.APP.dbQuery(
        "SELECT em.element_name FROM elements_meta em JOIN element_transforms et ON et.guid = em.guid" +
        " WHERE (em.ifc_class LIKE 'IfcStair%' OR em.ifc_class LIKE 'IfcRamp%') AND et.center_x IS NOT NULL");
      if (rows && rows.length) targetName = rows[0][0];
    } catch (e) { /* fall through to first leaf */ }
    var leaf = null;
    if (targetName) leaf = leaves.find(l => l.textContent.indexOf(targetName) === 0) || null;
    if (!leaf) leaf = leaves[0];
    const text = leaf.children[1]; // [arrow, text, badge] — text fires onTap (isolate)
    if (!text) return { hit: false, reason: 'leaf has no text child', allLabels: allLabels };
    const label = leaf.textContent;
    text.dispatchEvent(new PointerEvent('pointerup', { bubbles: false }));
    return { hit: true, label: label, targetName: targetName, allLabels: allLabels };
  }, groupLabel);
}

async function cycleAxisTo(page, targetAxis) {
  for (let i = 0; i < 6; i++) {
    const cur = await page.evaluate(() => {
      const b = document.getElementById('find-axis-toggle');
      return b ? b.getAttribute('data-axis') : null;
    });
    if (cur === targetAxis) return cur;
    const clicked = await page.evaluate(() => {
      const b = document.getElementById('find-axis-toggle');
      if (!b) return false;
      b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      return true;
    });
    if (!clicked) return null;
    await page.waitForTimeout(300);
  }
  return page.evaluate(() => {
    const b = document.getElementById('find-axis-toggle');
    return b ? b.getAttribute('data-axis') : null;
  });
}

async function displaceCameraFarAway(page) {
  await page.evaluate(() => {
    const A = window.APP;
    const cam = A.camera;
    cam.position.set(5000, 5000, 5000);
    cam.lookAt(4999, 4999, 4999);
    if (A.controls) { A.controls.target.set(4999, 4999, 4999); A.controls.update(); }
    if (A.markDirty) A.markDirty();
  });
  await page.waitForTimeout(200);
}

(async () => {
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  const cons = [];
  page.on('console', m => { const t = m.text(); cons.push(t); });

  S('── witness_isolate_zoom (Duplex) ──');
  await page.goto('http://127.0.0.1:' + server.address().port +
    '/viewer/viewer.html?db=buildings/Duplex_extracted.db',
    { waitUntil: 'networkidle' });
  const ready = await waitReady(page);
  verdict(ready, 'real model loaded + ready (Duplex)');
  if (!ready) {
    S('\n❌ ABORT — model never became ready');
    fs.writeFileSync(path.join(__dirname, 'witness_isolate_zoom_2026-07-12.log'), log.join('\n') + '\n');
    await browser.close(); server.close(); process.exit(1);
  }

  // 1. Real user path: rail pill Navigate -> drawer row Find -> A.openFindPanel('')
  await page.waitForFunction(() => window._mainPillActions && window._mainPillActions.length > 0, { timeout: 15000 }).catch(() => {});
  await page.click('#mobile-trigger', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(300);
  const railHit = await tap(page, 'pill-navigate');
  verdict(railHit, 'Navigate rail pill (#pill-navigate) present + tapped');
  const rowHit = await tap(page, 'drawer-row-find');
  verdict(rowHit, 'Find drawer row (#drawer-row-find) present + tapped (fires A.openFindPanel(""))');
  await page.waitForTimeout(500);

  // 2. Parts axis -> Stairway group -> LEAF tap, camera deliberately displaced first.
  const axisParts = await cycleAxisTo(page, 'parts');
  verdict(axisParts === 'parts', 'Parts axis reachable via toggle', 'axis=' + axisParts);

  if (axisParts === 'parts') {
    await displaceCameraFarAway(page);
    const camAway = await page.evaluate(() => window.APP.camera.position.x > 4000);
    verdict(camAway, 'camera deliberately displaced far from model (off-screen precondition)');

    // Expand the Stairway group so its leaves render.
    const expanded = await tapTreeGroup(page, 'Stairway', 0); // child 0 = arrow (expand)
    verdict(expanded, 'Stairway group arrow found + tapped (expand)');
    await page.waitForTimeout(300);

    cons.length = 0;
    const leafTap = await tapFirstLeafUnderGroup(page, 'Stairway');
    verdict(leafTap.hit, 'Stairway leaf found + tapped',
      leafTap.hit ? 'label="' + leafTap.label + '" (targetName=' + leafTap.targetName + ')' : leafTap.reason);
    if (leafTap.allLabels) S('     [info] all Stairway leaves: ' + JSON.stringify(leafTap.allLabels));
    await page.waitForTimeout(500);

    const filterLines = cons.filter(t => t.indexOf('[RP-A1] §FILTER') === 0);
    verdict(filterLines.length >= 1, '[RP-A1] §FILTER line emitted for the leaf tap', 'lines=' + filterLines.length);
    filterLines.forEach(l => S('     [console] ' + l));
    const zoomFit = filterLines.some(l => l.indexOf('zoom=fit') >= 0);
    verdict(zoomFit, 'Stairway leaf isolate reframed the camera (zoom=fit) on an off-screen target');

    await page.screenshot({ path: path.join(__dirname, 'witness_isolate_zoom_2026-07-12_stairway.png') });
    S('     screenshot: witness_isolate_zoom_2026-07-12_stairway.png');

    // 2b. Also tap the Stairway GROUP HEADER itself (all 4 guids — 2 IfcStair parents + 2
    // IfcStairFlight children — via _isolatePartsGroup(pg.label, guids), the SAME _emitIsolate
    // path). This is the robust proof: at least one guid in a multi-element group set almost
    // always has a resolvable transform, so this is the primary "does the fix work" assertion.
    await displaceCameraFarAway(page);
    cons.length = 0;
    const groupTap = await tapTreeGroup(page, 'Stairway', 1); // child 1 = text (onTap = group isolate)
    verdict(groupTap, 'Stairway GROUP header tapped (text/onTap, all 4 guids)');
    await page.waitForTimeout(500);
    const groupFilterLines = cons.filter(t => t.indexOf('[RP-A1] §FILTER') === 0);
    verdict(groupFilterLines.length >= 1, '[RP-A1] §FILTER line emitted for the GROUP tap', 'lines=' + groupFilterLines.length);
    groupFilterLines.forEach(l => S('     [console] ' + l));
    const groupZoomFit = groupFilterLines.some(l => l.indexOf('zoom=fit') >= 0);
    verdict(groupZoomFit, 'Stairway GROUP isolate reframed the camera (zoom=fit) on an off-screen target');
  }

  // 3. Room axis -> top-level GROUP tap (regression check for the pre-existing _emitIsolate
  // callers). Report whatever the log actually shows — do not force a result.
  const axisRoom = await cycleAxisTo(page, 'room');
  verdict(axisRoom === 'room', 'Room axis reachable via toggle', 'axis=' + axisRoom);

  if (axisRoom === 'room') {
    await displaceCameraFarAway(page);
    await page.waitForTimeout(200);
    const roomGroupLabel = await page.evaluate(() => {
      const row = document.querySelector('.find-tree-row[data-find-parent]');
      return row ? row.getAttribute('data-find-parent') : null;
    });
    verdict(!!roomGroupLabel, 'a Room top-level group row exists', 'label=' + roomGroupLabel);
    if (roomGroupLabel) {
      cons.length = 0;
      const groupTap = await tapTreeGroup(page, roomGroupLabel, 1); // child 1 = text (onTap)
      verdict(groupTap, 'Room group header tapped (text/onTap)', 'label="' + roomGroupLabel + '"');
      await page.waitForTimeout(500);
      const roomFilterLines = cons.filter(t => t.indexOf('[RP-A1] §FILTER') === 0);
      S('     [info] Room GROUP tap produced ' + roomFilterLines.length + ' [RP-A1] §FILTER line(s) ' +
        '(0 is EXPECTED+OK when Duplex has room bbox columns: that routes through _roomGroupSelect/' +
        '_drillSelect, a DIFFERENT, already-zooming, pre-existing path unaffected by this fix — not the ' +
        '_emitIsolate path this witness is scoped to; see spec doc Task 2).');
      roomFilterLines.forEach(l => S('     [console] ' + l));
      const roomZoomLines = cons.filter(t => t.indexOf('zoom=') >= 0 && (t.indexOf('§GROUP_ZOOM') >= 0 || t.indexOf('ROOM_GROUP') >= 0));
      roomZoomLines.forEach(l => S('     [console, drillSelect path] ' + l));
      // No verdict() call here — this branch is informational (Task 2 already answered which
      // path Room takes; forcing a pass/fail on a path this fix doesn't touch would be gigo).
    }
  }

  await page.close(); await ctx.close();
  await browser.close();
  server.close();

  S('\n' + (fails === 0 ? '✅ ALL PASS' : '❌ ' + fails + ' FAILED'));
  fs.writeFileSync(path.join(__dirname, 'witness_isolate_zoom_2026-07-12.log'), log.join('\n') + '\n');
  process.exit(fails === 0 ? 0 : 1);
})();
