// ⚠ DO NOT REMOVE — Scope guard
// SCOPE: user-reported live testing (2026-07-26, real console capture on Hospital) — tapping "Hall /
// Corridor" lit 59 brown doors but the log itself proved zero shells brightened:
//   [RP-TA] §CATEGORY_REVEAL on gk="Hall / Corridor" rooms=0 doors=59
// Root cause (navigate_find.js _revealCategoryGroup): a "Hall / Corridor" group can be made ENTIRELY
// of §CORRIDOR-ROOM-BACKPROP synthetic `CORRIDOR_ROOM::*` guids — real, door+wall-verified hallway
// buckets with NO spatial_structure row, so _allRoomVolumes() never gave them a shell in _roomBoxes.
// _revealCategoryGroup only brightened EXISTING _roomBoxes entries, so a corridor bucket with no real
// rooms at all (Hospital's case) brightened nothing, while _doorPositionsForRooms (reads the room
// GRAPH directly, which DOES have these nodes) still found doors fine — hence doors>0, rooms=0.
// Fix: for any group member whose guid is unmatched AND starts with CORRIDOR_ROOM::, draw a FRESH
// shell via _corridorRoomBBox() (the same helper _roomSelect's single-room path already uses for
// this exact guid shape) in the corridor category color, tagged userData._revealAdded so
// _clearCategoryReveal() disposes it (never lets it leak as a phantom box after toggle-off).
// This witness proves, on Hospital (the user's own real fixture, real corridor backprop count):
//   1. Real user path to open Find -> Room axis -> Type sub-toggle -> tap "Hall / Corridor" headline.
//   2. §CATEGORY_REVEAL log line now shows rooms>=1 (not 0) and addedShells>=1.
//   3. The scene contains mesh(es) tagged userData._revealAdded, colored the corridor blue 0x0277bd
//      (ROOM_CATEGORY_COLORS.corridor.fill) — reads the real running scene, not a guess.
//   4. Tapping the SAME headline again (toggle off) removes every _revealAdded mesh — no leak.
// §-log first — READ tests/witness_corridor_reveal_shell_2026-07-26.log before any conclusion.
// Run:  timeout 180 node viewer/tests/witness_corridor_reveal_shell_2026-07-26.js
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

async function waitReady(page, maxSec) {
  let ready = false;
  for (let i = 0; i < maxSec && !ready; i++) {
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

async function clickButtonByText(page, containerSelector, text) {
  return page.evaluate(([sel, t]) => {
    const container = document.querySelector(sel);
    if (!container) return false;
    const btns = Array.from(container.querySelectorAll('button'));
    const btn = btns.find(b => b.textContent.trim() === t);
    if (!btn) return false;
    btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    return true;
  }, [containerSelector, text]);
}

async function tapTreeGroupHeadline(page, label) {
  return page.evaluate((lbl) => {
    const row = document.querySelector('.find-tree-row[data-find-parent="' + lbl + '"]');
    if (!row) return false;
    const text = row.children[1];
    if (!text) return false;
    text.dispatchEvent(new PointerEvent('pointerup', { bubbles: false }));
    return true;
  }, label);
}

function revealAddedMeshes(page) {
  return page.evaluate(() => {
    const out = [];
    if (window.APP && window.APP.scene) {
      window.APP.scene.traverse((o) => {
        if (o.userData && o.userData._revealAdded && o.material && o.material.color) {
          out.push({ hex: '#' + o.material.color.getHexString(), opacity: o.material.opacity });
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

  const DB = process.env.WITNESS_DB || 'buildings/HHS_Office_Federated_extracted.db';
  S('── witness_corridor_reveal_shell (' + DB + ') ──');
  await page.goto('http://127.0.0.1:' + server.address().port +
    '/viewer/viewer.html?db=' + DB,
    { waitUntil: 'load', timeout: 60000 });
  const ready = await waitReady(page, 150); // large split-DB fixtures need real time
  verdict(ready, 'real model loaded + ready (Hospital)');
  if (!ready) {
    S('\n❌ ABORT — model never became ready');
    fs.writeFileSync(path.join(__dirname, 'witness_corridor_reveal_shell_2026-07-26.log'), log.join('\n') + '\n');
    await browser.close(); server.close(); process.exit(1);
  }

  await page.waitForFunction(() => window._mainPillActions && window._mainPillActions.length > 0, { timeout: 15000 }).catch(() => {});
  await page.click('#mobile-trigger', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(300);

  verdict(await tap(page, 'pill-navigate'), 'Navigate rail pill tapped');
  verdict(await tap(page, 'drawer-row-find'), 'Find drawer row tapped');
  await page.waitForTimeout(500);
  verdict((await cycleAxisTo(page, 'room')) === 'room', 'Room axis reachable');
  verdict(await clickButtonByText(page, '#find-tree', 'Type'), 'Type sub-toggle clicked');
  await page.waitForTimeout(500);
  const hasCorridorGroup = await page.evaluate(() =>
    !!document.querySelector('.find-tree-row[data-find-parent="Hall / Corridor"]'));
  verdict(hasCorridorGroup, 'a "Hall / Corridor" group row exists in Type mode');
  if (!hasCorridorGroup) {
    S('\n❌ ABORT — no Hall / Corridor group found');
    fs.writeFileSync(path.join(__dirname, 'witness_corridor_reveal_shell_2026-07-26.log'), log.join('\n') + '\n');
    await page.close(); await ctx.close(); await browser.close(); server.close(); process.exit(1);
  }

  cons.length = 0;
  verdict(await tapTreeGroupHeadline(page, 'Hall / Corridor'), 'Hall / Corridor headline tapped (fires _revealCategoryGroup)');
  await page.waitForTimeout(800);
  const revealLine = cons.find(l => l.indexOf('[RP-TA] §CATEGORY_REVEAL on') === 0);
  S('     [console] ' + (revealLine || '(none)'));
  const roomsM = revealLine && /rooms=(\d+)/.exec(revealLine);
  const addedM = revealLine && /addedShells=(\d+)/.exec(revealLine);
  const roomsN = roomsM ? parseInt(roomsM[1], 10) : -1;
  const addedN = addedM ? parseInt(addedM[1], 10) : -1;
  verdict(roomsN >= 1, '§CATEGORY_REVEAL now reports rooms>=1 (was rooms=0 on the user\'s live capture)', 'rooms=' + roomsN);
  verdict(addedN >= 1, '§CATEGORY_REVEAL reports addedShells>=1 (the new backprop-corridor shell draw fired)', 'addedShells=' + addedN);

  const meshes = await revealAddedMeshes(page);
  S('     [info] scene _revealAdded meshes: ' + JSON.stringify(meshes));
  verdict(meshes.length === addedN, 'scene mesh count matches the §-logged addedShells count', 'scene=' + meshes.length + ' logged=' + addedN);
  verdict(meshes.length > 0 && meshes.every(m => m.hex === '#0277bd'), 'every added shell is the corridor blue 0x0277bd', JSON.stringify(meshes.map(m => m.hex)));
  verdict(meshes.length > 0 && meshes.every(m => Math.abs(m.opacity - 0.55) < 0.01), 'every added shell starts already brightened (0.55), not dim-then-skipped');

  // Toggle off — same headline tap again — must dispose every _revealAdded mesh.
  verdict(await tapTreeGroupHeadline(page, 'Hall / Corridor'), 'Hall / Corridor headline tapped again (toggle off)');
  await page.waitForTimeout(500);
  const meshesAfter = await revealAddedMeshes(page);
  S('     [info] scene _revealAdded meshes after toggle-off: ' + meshesAfter.length);
  verdict(meshesAfter.length === 0, 'zero _revealAdded shells remain after toggling the reveal off — no leak');

  await page.close(); await ctx.close();
  await browser.close();
  server.close();

  S('\n' + (fails === 0 ? '✅ ALL PASS' : '❌ ' + fails + ' FAILED'));
  fs.writeFileSync(path.join(__dirname, 'witness_corridor_reveal_shell_2026-07-26.log'), log.join('\n') + '\n');
  process.exit(fails === 0 ? 0 : 1);
})();
