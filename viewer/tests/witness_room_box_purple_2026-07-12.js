// ⚠ DO NOT REMOVE — Scope guard
// Scope: bim-compiler prompts/Modeller/DISC_Walker/VIEWER_FIND_PANEL_ROOM_ACCURACY.md §8 — a room
// tap in the Find panel's Room axis used to default to the real-bounding-element yellow-silhouette
// highlight (_drillSelect(bound,...)), which read as fragmented "cut" seams where adjacent real
// wall/floor/ceiling elements meet. Fix: navigate_find.js's _roomSelect() (~line 1793) now makes the
// abstract single-box cuboid (_drawRoomCuboid, ~line 1517) the PRIMARY highlight whenever the room's
// volume (zoomBox) is known, recolored from yellow (0xffd400/0xffe83a) to soft purple
// (0x9c6ade fill / 0xc77dff wire). The real-element lookup (_roomBoundingGuids) still runs and still
// drives the storey-dim/zoom-to-fit side effects via _drillSelect, just with its own per-element
// highlight suppressed (opts.suppressHighlight) so only the purple cuboid reads as the selection.
// This witness proves, on the Duplex building (small/fast, single-box rooms, real bounding walls —
// exercises the room-bounding-element path cleanly):
//   1. Real user path to open Find: #pill-navigate rail pill -> Navigate drawer -> #drawer-row-find,
//      same convention as witness_isolate_zoom_2026-07-12.js — do not invent a different open path.
//   2. Room axis reachable via #find-axis-toggle.
//   3. A room LEAF tap (not the group header) fires _roomSelect -> the console shows
//      '[RP-TA] §ROOM_HIGHLIGHT mode=cuboid' (NOT mode=bounding-elements) — proves the swapped
//      priority actually fired for a room WITH real bounding elements found (bound=N>0 in the line).
//   4. The scene actually contains a purple cuboid fill+wire mesh (userData._roomShell), not yellow —
//      reads real THREE.js material.color hex directly out of the running page, not a guess.
//   5. One screenshot of the selected room for visual confirmation.
// §-log first — READ tests/witness_room_box_purple_2026-07-12.log before any conclusion.
// Run:  timeout 120 node viewer/tests/witness_room_box_purple_2026-07-12.js
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
  const hit = await page.evaluate((eid) => {
    const el = document.getElementById(eid);
    if (!el) return false;
    el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    return true;
  }, id);
  await page.waitForTimeout(400);
  return hit;
}

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

// Tap the FIRST leaf row (not a group header) under the given group's childContainer.
async function tapFirstLeafUnderGroup(page, groupLabel) {
  return page.evaluate((lbl) => {
    const row = document.querySelector('.find-tree-row[data-find-parent="' + lbl + '"]');
    if (!row) return { hit: false, reason: 'group row not found' };
    const container = row.nextElementSibling;
    if (!container) return { hit: false, reason: 'no childContainer sibling' };
    const leaves = Array.from(container.querySelectorAll('.find-tree-row:not([data-find-parent])'));
    if (!leaves.length) return { hit: false, reason: 'no leaf rows inside childContainer' };
    const leaf = leaves[0];
    const text = leaf.children[1]; // [arrow, text, badge] — text fires onTap
    if (!text) return { hit: false, reason: 'leaf has no text child' };
    const label = leaf.textContent;
    text.dispatchEvent(new PointerEvent('pointerup', { bubbles: false }));
    return { hit: true, label: label, allLabels: leaves.map(l => l.textContent) };
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

(async () => {
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  const cons = [];
  page.on('console', m => { cons.push(m.text()); });

  S('── witness_room_box_purple (Duplex) ──');
  await page.goto('http://127.0.0.1:' + server.address().port +
    '/viewer/viewer.html?db=buildings/Duplex_extracted.db',
    { waitUntil: 'networkidle' });
  const ready = await waitReady(page);
  verdict(ready, 'real model loaded + ready (Duplex)');
  if (!ready) {
    S('\n❌ ABORT — model never became ready');
    fs.writeFileSync(path.join(__dirname, 'witness_room_box_purple_2026-07-12.log'), log.join('\n') + '\n');
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

  // 2. Room axis.
  const axisRoom = await cycleAxisTo(page, 'room');
  verdict(axisRoom === 'room', 'Room axis reachable via toggle', 'axis=' + axisRoom);
  if (axisRoom !== 'room') {
    S('\n❌ ABORT — Room axis not reachable');
    fs.writeFileSync(path.join(__dirname, 'witness_room_box_purple_2026-07-12.log'), log.join('\n') + '\n');
    await page.close(); await ctx.close(); await browser.close(); server.close(); process.exit(1);
  }

  // 3. Find the first Room top-level group, expand it, tap the first LEAF (a real room, not the header).
  const roomGroupLabel = await page.evaluate(() => {
    const row = document.querySelector('.find-tree-row[data-find-parent]');
    return row ? row.getAttribute('data-find-parent') : null;
  });
  verdict(!!roomGroupLabel, 'a Room top-level group row exists', 'label=' + roomGroupLabel);

  if (roomGroupLabel) {
    const expanded = await tapTreeGroup(page, roomGroupLabel, 0); // child 0 = arrow (expand)
    verdict(expanded, 'Room group arrow found + tapped (expand)', 'label="' + roomGroupLabel + '"');
    await page.waitForTimeout(300);

    cons.length = 0;
    const leafTap = await tapFirstLeafUnderGroup(page, roomGroupLabel);
    verdict(leafTap.hit, 'Room leaf found + tapped (fires _roomSelect)',
      leafTap.hit ? 'label="' + leafTap.label + '"' : leafTap.reason);
    if (leafTap.allLabels) S('     [info] all leaves under "' + roomGroupLabel + '": ' + JSON.stringify(leafTap.allLabels));
    await page.waitForTimeout(600);

    // 4. § log — which highlight mode fired.
    const hlLines = cons.filter(t => t.indexOf('[RP-TA] §ROOM_HIGHLIGHT') === 0);
    verdict(hlLines.length >= 1, '§ROOM_HIGHLIGHT line emitted for the room tap', 'lines=' + hlLines.length);
    hlLines.forEach(l => S('     [console] ' + l));
    const cuboidMode = hlLines.some(l => l.indexOf('mode=cuboid') === 0 || l.indexOf(' mode=cuboid ') >= 0);
    verdict(cuboidMode, 'highlight mode=cuboid fired (the abstract box is PRIMARY, not bounding-elements)');
    const boundedRoom = hlLines.some(l => /mode=cuboid guid=\S+ bound=([1-9]\d*)/.test(l));
    S('     [info] real bounding elements WERE found for this room (bound>0) — proves the swap actually ' +
      'overrides the old real-element-highlight branch, not just the no-bound fallback: ' + boundedRoom);

    // 5. Read the actual THREE.js material colors straight out of the running scene — direct proof
    // the rendered box is purple, not yellow (0xffd400/0xffe83a).
    const sceneColors = await page.evaluate(() => {
      const out = [];
      if (window.APP && window.APP.scene) {
        window.APP.scene.traverse((o) => {
          if (o.userData && o.userData._roomShell && o.material && o.material.color) {
            out.push({ type: o.type, hex: '#' + o.material.color.getHexString(), opacity: o.material.opacity });
          }
        });
      }
      return out;
    });
    S('     [info] scene _roomShell meshes: ' + JSON.stringify(sceneColors));
    // Distinguish the selected-room CUBOID fill (opacity 0.10, added by _drawRoomCuboid) from the
    // dimmed OVERVIEW room-map shells (_drawRoomShell, opacity 0.04, also tagged _roomShell) — every
    // room in the building gets one of the latter, dimmed to 0.04 by _roomSelect right before the tap.
    const fillMesh = sceneColors.find(c => c.type === 'Mesh' && Math.abs(c.opacity - 0.10) < 0.005);
    const wireMesh = sceneColors.find(c => c.type === 'LineSegments');
    verdict(!!fillMesh && fillMesh.hex === '#9c6ade', 'cuboid FILL mesh color is soft purple 0x9c6ade (not yellow 0xffd400)',
      fillMesh ? fillMesh.hex : 'no Mesh with _roomShell found');
    verdict(!!wireMesh && wireMesh.hex === '#c77dff', 'cuboid WIRE mesh color is brighter purple 0xc77dff (not yellow 0xffe83a)',
      wireMesh ? wireMesh.hex : 'no LineSegments with _roomShell found');

    // 6. Screenshot for visual confirmation — give the camera lerp (_lerpCam, RAF-driven) time to
    // settle, then close the Find/Navigate panels so the purple box itself isn't occluded.
    await page.waitForTimeout(1200);
    await page.evaluate(() => {
      const fp = document.getElementById('find-panel'); if (fp) fp.style.display = 'none';
      document.querySelectorAll('.bim-panel').forEach(p => { if (p.id !== 'find-panel') p.style.display = 'none'; });
    });
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(__dirname, 'witness_room_box_purple_2026-07-12.png') });
    S('     screenshot: witness_room_box_purple_2026-07-12.png');
  }

  await page.close(); await ctx.close();
  await browser.close();
  server.close();

  S('\n' + (fails === 0 ? '✅ ALL PASS' : '❌ ' + fails + ' FAILED'));
  fs.writeFileSync(path.join(__dirname, 'witness_room_box_purple_2026-07-12.log'), log.join('\n') + '\n');
  process.exit(fails === 0 ? 0 : 1);
})();
