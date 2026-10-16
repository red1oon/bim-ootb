// ⚠ DO NOT REMOVE — Scope guard
// SCOPE: user-reported live testing (2026-07-26) — "the doors also got left behind when we exit
// Find Panel. Path is also not cleaned up upon exit." Root cause: closeFindPanel() (navigate_find.js)
// called _roomLensReset()+_highlightLensReset() but neither of those touches _revealDoorMeshes (the
// Hall/Corridor-etc category-reveal's brown door meshes, a module-level array separate from
// _roomBoxes) or _pathExtraMeshes (the Path sub-mode's orange line+markers) — both leaked into the
// scene forever after close. Fix: closeFindPanel() (and openFindPanel()'s fresh-open reset, for the
// same reason) now also call _clearCategoryReveal() and _clearPathHighlight().
// This witness proves, on Duplex (small/fast, real rooms+doors, real corridor connectivity):
//   1. Real user path to open Find -> Room axis -> Type sub-toggle -> tap "Hall / Corridor" headline
//      (fires _revealCategoryGroup) -> brown door marker(s) appear in the scene.
//   2. Closing the panel (the real #find-close button, same as a user click) leaves ZERO
//      userData._doorMarker meshes in the scene — proves the category-reveal leak is gone.
//   3. Re-opening Find -> Room axis -> Path sub-toggle -> pick two connected rooms -> Find Path ->
//      an orange (0xff9100) path line/marker appears in the scene.
//   4. Closing the panel again leaves ZERO 0xff9100-colored meshes — proves the Path leak is gone.
// §-log first — READ tests/witness_find_close_no_leak_2026-07-26.log before any conclusion.
// Run:  timeout 120 node viewer/tests/witness_find_close_no_leak_2026-07-26.js
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
  // The headline row's onTap fires from the TEXT child (children[1]), same convention as a leaf tap
  // — arrow (children[0]) only expands.
  return page.evaluate((lbl) => {
    const row = document.querySelector('.find-tree-row[data-find-parent="' + lbl + '"]');
    if (!row) return false;
    const text = row.children[1];
    if (!text) return false;
    text.dispatchEvent(new PointerEvent('pointerup', { bubbles: false }));
    return true;
  }, label);
}

function markersOfColor(page, hex) {
  return page.evaluate((h) => {
    const out = [];
    if (window.APP && window.APP.scene) {
      window.APP.scene.traverse((o) => {
        if (o.material && o.material.color && ('#' + o.material.color.getHexString()) === h) out.push(o.type);
      });
    }
    return out;
  }, hex);
}

function doorMarkerCount(page) {
  return page.evaluate(() => {
    let n = 0;
    if (window.APP && window.APP.scene) {
      window.APP.scene.traverse((o) => { if (o.userData && o.userData._doorMarker) n++; });
    }
    return n;
  });
}

async function pathRoomOptions(page) {
  return page.evaluate(() => {
    const sel = document.getElementById('find-path-from');
    if (!sel) return [];
    return Array.from(sel.options).map(o => o.value).filter(v => v);
  });
}

async function trySetPathAndFind(page, fromGuid, toGuid) {
  return page.evaluate(([f, t]) => {
    const selFrom = document.getElementById('find-path-from');
    const selTo = document.getElementById('find-path-to');
    if (!selFrom || !selTo) return false;
    selFrom.value = f; selFrom.dispatchEvent(new Event('change', { bubbles: true }));
    selTo.value = t; selTo.dispatchEvent(new Event('change', { bubbles: true }));
    const wrap = selTo.closest('div').parentElement;
    const btn = wrap ? Array.from(wrap.querySelectorAll('button')).find(b => b.textContent.trim().length > 0) : null;
    if (!btn) return false;
    btn.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    return true;
  }, [fromGuid, toGuid]);
}

(async () => {
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  const cons = [];
  page.on('console', m => { cons.push(m.text()); });

  // Part 1 needs a building with a real "Hall / Corridor" Type-tree group — Duplex (used for Part 2's
  // path check) is too small to have one (its rooms don't hallway-backbone-classify as corridors).
  // HHS_Office_Federated is the building the corridor-category work was proven against originally
  // (ROOM_LENS_VISUAL_HIGHLIGHT_SPEC.md), and it's already an LFS-tracked fixture in this repo.
  S('── witness_find_close_no_leak Part 1 (HHS_Office_Federated) ──');
  await page.goto('http://127.0.0.1:' + server.address().port +
    '/viewer/viewer.html?db=buildings/HHS_Office_Federated_extracted.db',
    { waitUntil: 'networkidle' });
  const ready = await waitReady(page);
  verdict(ready, 'real model loaded + ready (HHS_Office_Federated)');
  if (!ready) {
    S('\n❌ ABORT — model never became ready');
    fs.writeFileSync(path.join(__dirname, 'witness_find_close_no_leak_2026-07-26.log'), log.join('\n') + '\n');
    await browser.close(); server.close(); process.exit(1);
  }

  await page.waitForFunction(() => window._mainPillActions && window._mainPillActions.length > 0, { timeout: 15000 }).catch(() => {});
  await page.click('#mobile-trigger', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(300);

  // ── Part 1: category reveal (Hall/Corridor) doors must not survive close ──
  verdict(await tap(page, 'pill-navigate'), 'Navigate rail pill tapped');
  verdict(await tap(page, 'drawer-row-find'), 'Find drawer row tapped');
  await page.waitForTimeout(500);
  verdict((await cycleAxisTo(page, 'room')) === 'room', 'Room axis reachable');
  verdict(await clickButtonByText(page, '#find-tree', 'Type'), 'Type sub-toggle clicked');
  await page.waitForTimeout(400);
  const hasCorridorGroup = await page.evaluate(() =>
    !!document.querySelector('.find-tree-row[data-find-parent="Hall / Corridor"]'));
  verdict(hasCorridorGroup, 'a "Hall / Corridor" group row exists in Type mode');
  if (hasCorridorGroup) {
    cons.length = 0;
    verdict(await tapTreeGroupHeadline(page, 'Hall / Corridor'), 'Hall / Corridor headline tapped (fires _revealCategoryGroup)');
    await page.waitForTimeout(600);
    const revealLine = cons.find(l => l.indexOf('[RP-TA] §CATEGORY_REVEAL on') === 0);
    S('     [console] ' + (revealLine || '(none)'));
    const beforeClose = await doorMarkerCount(page);
    S('     [info] door markers BEFORE close: ' + beforeClose);
    verdict(beforeClose >= 1, 'category reveal produced at least one door marker before close');

    // §find-close is bound via elClose.onclick (a native 'click' handler, not 'pointerup' like the
    // rail/drawer pills above) — a synthetic pointerup wouldn't fire it. page.click() dispatches the
    // real mouse event sequence, same as an actual user click.
    await page.click('#find-close');
    verdict(true, 'Find panel closed (#find-close, real close button)');
    await page.waitForTimeout(400);
    const afterClose = await doorMarkerCount(page);
    S('     [info] door markers AFTER close: ' + afterClose);
    verdict(afterClose === 0, 'zero door markers remain after closing Find — category-reveal leak is fixed');
  }

  // ── Part 2: Path sub-mode line/markers must not survive close (Duplex — small/fast, real
  // corridor-connected rooms, same building the room-select-door witness already uses) ──
  S('── witness_find_close_no_leak Part 2 (Duplex) ──');
  await page.goto('http://127.0.0.1:' + server.address().port +
    '/viewer/viewer.html?db=buildings/Duplex_extracted.db',
    { waitUntil: 'networkidle' });
  const ready2 = await waitReady(page);
  verdict(ready2, 'real model loaded + ready (Duplex)');
  if (!ready2) {
    S('\n❌ ABORT — Duplex never became ready');
    fs.writeFileSync(path.join(__dirname, 'witness_find_close_no_leak_2026-07-26.log'), log.join('\n') + '\n');
    await page.close(); await ctx.close(); await browser.close(); server.close(); process.exit(1);
  }
  await page.waitForFunction(() => window._mainPillActions && window._mainPillActions.length > 0, { timeout: 15000 }).catch(() => {});
  await page.click('#mobile-trigger', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(300);
  verdict(await tap(page, 'pill-navigate'), 'Navigate rail pill tapped (reopen)');
  verdict(await tap(page, 'drawer-row-find'), 'Find drawer row tapped (reopen)');
  await page.waitForTimeout(500);
  verdict((await cycleAxisTo(page, 'room')) === 'room', 'Room axis reachable (2nd open)');
  verdict(await clickButtonByText(page, '#find-tree', 'Path'), 'Path sub-toggle clicked');
  await page.waitForTimeout(400);
  const opts = await pathRoomOptions(page);
  S('     [info] path room options: ' + JSON.stringify(opts));
  let pathDrawn = false;
  for (let i = 0; i < opts.length - 1 && !pathDrawn; i++) {
    await trySetPathAndFind(page, opts[i], opts[i + 1]);
    await page.waitForTimeout(500);
    const orangeNow = markersOfColor(page, '#ff9100');
    const found = (await orangeNow).length > 0;
    if (found) { pathDrawn = true; S('     [info] path drawn using pair (' + i + ',' + (i + 1) + ')'); }
  }
  verdict(pathDrawn, 'an orange (0xff9100) path line/marker appeared in the scene for some room pair');
  if (pathDrawn) {
    await page.click('#find-close');
    verdict(true, 'Find panel closed again (#find-close)');
    await page.waitForTimeout(400);
    const orangeAfter = await markersOfColor(page, '#ff9100');
    S('     [info] orange path meshes AFTER close: ' + orangeAfter.length);
    verdict(orangeAfter.length === 0, 'zero orange path meshes remain after closing Find — Path leak is fixed');
  }

  await page.close(); await ctx.close();
  await browser.close();
  server.close();

  S('\n' + (fails === 0 ? '✅ ALL PASS' : '❌ ' + fails + ' FAILED'));
  fs.writeFileSync(path.join(__dirname, 'witness_find_close_no_leak_2026-07-26.log'), log.join('\n') + '\n');
  process.exit(fails === 0 ? 0 : 1);
})();
