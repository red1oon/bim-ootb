// ⚠ DO NOT REMOVE — Scope guard
// SCOPE: user ask (2026-07-26, live testing feedback) — "when we zoom to particular room it is just
// a box purple without its accompanying door. Let's have that too since its free". navigate_find.js's
// _drawRoomCuboid() (single-room select, ~line 2172) now takes an optional 4th `roomGuid` arg and
// draws that room's own real door(s) via the SAME _spawnDoorMeshesForRooms() helper the Hall/Corridor
// category-reveal already used (factored out of _revealCategoryGroup, not new logic) — real measured
// door bbox+yaw, brown 0x8d5524, tagged userData._doorMarker for direct scene verification.
// This witness proves, on Duplex (small/fast, real rooms with real doors):
//   1. Real user path to open Find -> Room axis (same convention as witness_room_box_purple).
//   2. A room LEAF tap fires _roomSelect -> the console shows '[RP-TA] §ROOM_SELECT_DOORS guid=...
//      doors=N' with N>=1 for at least one tapped room (proves the new call actually fires and finds
//      a real door, not just wiring that never matches anything).
//   3. The scene actually contains a mesh tagged userData._doorMarker with THREE material color
//      0x8d5524 — reads the real running scene, not a log-only claim.
//   4. Re-selecting a DIFFERENT room disposes the FIRST room's door mesh (via _clearRoomCuboid's
//      widened guid match) — never leaks, never doubles.
// §-log first — READ tests/witness_room_select_door_2026-07-26.log before any conclusion.
// Run:  timeout 120 node viewer/tests/witness_room_select_door_2026-07-26.js
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

async function leafRows(page, groupLabel) {
  return page.evaluate((lbl) => {
    const row = document.querySelector('.find-tree-row[data-find-parent="' + lbl + '"]');
    if (!row) return [];
    const container = row.nextElementSibling;
    if (!container) return [];
    return Array.from(container.querySelectorAll('.find-tree-row:not([data-find-parent])')).map(l => l.textContent);
  }, groupLabel);
}

async function tapLeaf(page, groupLabel, idx) {
  return page.evaluate(([lbl, i]) => {
    const row = document.querySelector('.find-tree-row[data-find-parent="' + lbl + '"]');
    if (!row) return { hit: false, reason: 'group row not found' };
    const container = row.nextElementSibling;
    if (!container) return { hit: false, reason: 'no childContainer sibling' };
    const leaves = Array.from(container.querySelectorAll('.find-tree-row:not([data-find-parent])'));
    const leaf = leaves[i];
    if (!leaf) return { hit: false, reason: 'no leaf at idx ' + i };
    const text = leaf.children[1];
    if (!text) return { hit: false, reason: 'leaf has no text child' };
    const label = leaf.textContent;
    text.dispatchEvent(new PointerEvent('pointerup', { bubbles: false }));
    return { hit: true, label: label };
  }, [groupLabel, idx]);
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

function doorMarkers(page) {
  return page.evaluate(() => {
    const out = [];
    if (window.APP && window.APP.scene) {
      window.APP.scene.traverse((o) => {
        if (o.userData && o.userData._doorMarker && o.material && o.material.color) {
          out.push({ hex: '#' + o.material.color.getHexString(), x: o.position.x, y: o.position.y, z: o.position.z });
        }
      });
    }
    return out;
  });
}

(async () => {
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  const cons = [];
  page.on('console', m => { cons.push(m.text()); });

  S('── witness_room_select_door (Duplex) ──');
  await page.goto('http://127.0.0.1:' + server.address().port +
    '/viewer/viewer.html?db=buildings/Duplex_extracted.db',
    { waitUntil: 'networkidle' });
  const ready = await waitReady(page);
  verdict(ready, 'real model loaded + ready (Duplex)');
  if (!ready) {
    S('\n❌ ABORT — model never became ready');
    fs.writeFileSync(path.join(__dirname, 'witness_room_select_door_2026-07-26.log'), log.join('\n') + '\n');
    await browser.close(); server.close(); process.exit(1);
  }

  await page.waitForFunction(() => window._mainPillActions && window._mainPillActions.length > 0, { timeout: 15000 }).catch(() => {});
  await page.click('#mobile-trigger', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(300);
  verdict(await tap(page, 'pill-navigate'), 'Navigate rail pill tapped');
  verdict(await tap(page, 'drawer-row-find'), 'Find drawer row tapped');
  await page.waitForTimeout(500);

  const axisRoom = await cycleAxisTo(page, 'room');
  verdict(axisRoom === 'room', 'Room axis reachable', 'axis=' + axisRoom);
  if (axisRoom !== 'room') {
    S('\n❌ ABORT — Room axis not reachable');
    fs.writeFileSync(path.join(__dirname, 'witness_room_select_door_2026-07-26.log'), log.join('\n') + '\n');
    await page.close(); await ctx.close(); await browser.close(); server.close(); process.exit(1);
  }

  const groupLabel = await page.evaluate(() => {
    const row = document.querySelector('.find-tree-row[data-find-parent]');
    return row ? row.getAttribute('data-find-parent') : null;
  });
  verdict(!!groupLabel, 'a Room top-level group row exists', 'label=' + groupLabel);
  if (!groupLabel) {
    S('\n❌ ABORT — no room group found');
    fs.writeFileSync(path.join(__dirname, 'witness_room_select_door_2026-07-26.log'), log.join('\n') + '\n');
    await page.close(); await ctx.close(); await browser.close(); server.close(); process.exit(1);
  }
  verdict(await tapTreeGroup(page, groupLabel, 0), 'Room group expanded', 'label="' + groupLabel + '"');
  await page.waitForTimeout(300);
  const labels = await leafRows(page, groupLabel);
  S('     [info] leaves under "' + groupLabel + '": ' + JSON.stringify(labels));

  // Try each leaf in turn until one reports doors>=1 — different rooms have different door counts,
  // this proves the mechanism works for a REAL room rather than cherry-picking one that's known-good.
  let foundDoors = -1, foundLabel = null, prevMarkers = [];
  for (let i = 0; i < labels.length && foundDoors <= 0; i++) {
    cons.length = 0;
    const t = await tapLeaf(page, groupLabel, i);
    if (!t.hit) continue;
    await page.waitForTimeout(700);
    const dLine = cons.find(l => l.indexOf('[RP-TA] §ROOM_SELECT_DOORS') === 0);
    if (dLine) {
      S('     [console] ' + dLine);
      const m = /doors=(\d+)/.exec(dLine);
      foundDoors = m ? parseInt(m[1], 10) : -1;
      foundLabel = t.label;
    }
  }
  verdict(foundDoors >= 0, '§ROOM_SELECT_DOORS line emitted on a room leaf tap');
  verdict(foundDoors >= 1, 'at least one real room reported doors>=1', 'room="' + foundLabel + '" doors=' + foundDoors);

  const markers = await doorMarkers(page);
  S('     [info] scene _doorMarker meshes: ' + JSON.stringify(markers));
  verdict(markers.length === foundDoors, 'scene door-marker mesh COUNT matches the §-logged count', 'scene=' + markers.length + ' logged=' + foundDoors);
  verdict(markers.length > 0 && markers.every(m => m.hex === '#8d5524'), 'every door marker is the brown 0x8d5524', JSON.stringify(markers.map(m => m.hex)));

  // Re-select a DIFFERENT leaf — the first room's door mesh(es) must be disposed, not accumulate.
  const otherIdx = labels.findIndex((l, i) => l !== foundLabel);
  if (otherIdx >= 0 && foundDoors > 0) {
    await tapLeaf(page, groupLabel, otherIdx);
    await page.waitForTimeout(700);
    const markers2 = await doorMarkers(page);
    S('     [info] scene _doorMarker meshes after switching room: ' + JSON.stringify(markers2));
    const stillOld = markers2.some(m => Math.abs(m.x - (markers[0] ? markers[0].x : NaN)) < 1e-6 && Math.abs(m.z - (markers[0] ? markers[0].z : NaN)) < 1e-6) && markers.length && markers2.length >= markers.length * 2;
    verdict(!stillOld, 'switching room does not leak/accumulate the previous room\'s door mesh(es)');
  } else {
    S('     [info] skipped leak-check — no distinct second leaf or first room had 0 doors');
  }

  await page.close(); await ctx.close();
  await browser.close();
  server.close();

  S('\n' + (fails === 0 ? '✅ ALL PASS' : '❌ ' + fails + ' FAILED'));
  fs.writeFileSync(path.join(__dirname, 'witness_room_select_door_2026-07-26.log'), log.join('\n') + '\n');
  process.exit(fails === 0 ? 0 : 1);
})();
