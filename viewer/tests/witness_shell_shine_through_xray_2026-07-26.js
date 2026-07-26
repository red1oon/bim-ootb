// ⚠ DO NOT REMOVE — Scope guard
// SCOPE: user-reported live testing (2026-07-26) — "the blue only shows when in bbxes mode.. if in
// x-ray no... that goes with the others too so check them as not all shines thru." Root cause:
// _drawRoomShell() (navigate_find.js, draws every Room-Lens shell — habitable/corridor/restroom/
// kitchen/bedroom/utilities alike) never set `depthTest` on its MeshBasicMaterial, so it defaulted
// to `true` — a real wall/floor dimmed-but-still-rendered by X-Ray still occludes it. The
// large-building bbox-ghost path (_isLargeBuilding()) never showed this because it HIDES real
// geometry outright, leaving nothing to occlude the shell — so the bug only appeared on
// small/medium buildings that use the normal X-Ray-dim path instead. Same root cause
// §FILL-SHINE-THROUGH already fixed for the single-selected-room cuboid 11 days earlier
// (_drawRoomCuboid) — this just extends the same one-line idea to the whole-building shell.
// This witness proves, on Duplex (small — confirmed NOT large, uses the X-Ray-dim path, never the
// bbox-ghost path the bug was hiding behind):
//   1. Real user path: open Find -> Room axis (mode=volume draws every room's shell immediately,
//      no category tap needed — habitable/corridor/etc. shells all go through _drawRoomShell).
//   2. Confirms this building is NOT on the bbox-ghost path (§ROOM_LENS_BBOX_DEFAULT does not fire) —
//      i.e. this run genuinely exercises the branch the bug was invisible on the OTHER branch for.
//   3. Every scene mesh tagged userData._roomShell (excluding the single-selection cuboid pieces,
//      which use a different, already-correct code path) has material.depthTest === false — a
//      direct, deterministic material-property check, not a pixel/screenshot judgment call.
// §-log first — READ tests/witness_shell_shine_through_xray_2026-07-26.log before any conclusion.
// Run:  node viewer/tests/witness_shell_shine_through_xray_2026-07-26.js
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

(async () => {
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  const cons = [];
  page.on('console', m => { cons.push(m.text()); });

  S('── witness_shell_shine_through_xray (Duplex, X-Ray-dim path, not bbox-ghost) ──');
  await page.goto('http://127.0.0.1:' + server.address().port +
    '/viewer/viewer.html?db=buildings/Duplex_extracted.db',
    { waitUntil: 'load', timeout: 30000 });
  const ready = await waitReady(page);
  verdict(ready, 'real model loaded + ready (Duplex)');
  if (!ready) {
    S('\n❌ ABORT — model never became ready');
    fs.writeFileSync(path.join(__dirname, 'witness_shell_shine_through_xray_2026-07-26.log'), log.join('\n') + '\n');
    await browser.close(); server.close(); process.exit(1);
  }

  await page.waitForFunction(() => window._mainPillActions && window._mainPillActions.length > 0, { timeout: 15000 }).catch(() => {});
  await page.click('#mobile-trigger', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(300);

  cons.length = 0;
  verdict(await tap(page, 'pill-navigate'), 'Navigate rail pill tapped');
  verdict(await tap(page, 'drawer-row-find'), 'Find drawer row tapped');
  await page.waitForTimeout(500);
  verdict((await cycleAxisTo(page, 'room')) === 'room', 'Room axis reachable (draws every room shell immediately)');
  await page.waitForTimeout(500);

  const bboxLine = cons.find(l => l.indexOf('§ROOM_LENS_BBOX_DEFAULT') >= 0);
  verdict(!bboxLine, 'this run did NOT take the bbox-ghost path — genuinely exercises the X-Ray-dim branch the bug hid on', bboxLine || '(no bbox line, as expected)');
  const shellLine = cons.find(l => l.indexOf('[RP-TA] §ROOM_LENS mode=shell') === 0);
  S('     [console] ' + (shellLine || '(none)'));
  verdict(!!shellLine, 'Room Lens drew shells');

  const shells = await page.evaluate(() => {
    const out = [];
    if (window.APP && window.APP.scene) {
      window.APP.scene.traverse((o) => {
        if (o.userData && o.userData._roomShell && o.material) {
          out.push({ depthTest: o.material.depthTest, opacity: o.material.opacity, hex: o.material.color ? '#' + o.material.color.getHexString() : null });
        }
      });
    }
    return out;
  });
  S('     [info] _roomShell mesh count=' + shells.length + ' sample=' + JSON.stringify(shells.slice(0, 5)));
  verdict(shells.length > 0, 'at least one _roomShell mesh exists to check', 'count=' + shells.length);
  verdict(shells.length > 0 && shells.every(s => s.depthTest === false), 'every _roomShell mesh has depthTest===false (the actual shine-through fix)', JSON.stringify(shells.map(s => s.depthTest)));

  await page.close(); await ctx.close();
  await browser.close();
  server.close();

  S('\n' + (fails === 0 ? '✅ ALL PASS' : '❌ ' + fails + ' FAILED'));
  fs.writeFileSync(path.join(__dirname, 'witness_shell_shine_through_xray_2026-07-26.log'), log.join('\n') + '\n');
  process.exit(fails === 0 ? 0 : 1);
})();
