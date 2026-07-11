#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-ROOM-PATH-UI scope (READ THE LOG after every run)
 * SCOPE: VIEWER_FIND_PANEL_ROOM_ACCURACY.md §7 — the Find panel's Room axis "Path" sub-mode
 * (viewer/navigate_find.js `_buildPathPanel`/`_findRoomPath`/`_drawPathHighlight`), driven through
 * the REAL user path in a real headless browser: open a building, open Find, cycle to the Room
 * axis, click the "Path" pill, pick two real rooms, click "Find Path". This is the SECONDARY,
 * wiring-only check (project convention: §-log-first is primary — see witness_room_graph_path.js
 * for the load-bearing graph/pathfinding correctness proof, driven node-side against the same
 * common/room_graph.js module). This witness only proves the UI actually surfaces that module's
 * result as a usable feature, not a second copy of the algorithmic proof.
 *
 * DATA: buildings/Duplex_extracted.db here is a LOCAL, UNTRACKED copy of the real 21-room/14-door
 * Duplex extraction (copied from ~/bim-compiler/deploy/buildings/Duplex_extracted.db for this
 * session's local testing only — matches modeller/Duplex_ARC.db's real data, see spec doc §7 for
 * why the worktree's own buildings/ dir doesn't ship this file by default: OCI-only per the DB
 * Storage Policy). Not committed (buildings/*.db stays gitignored except HHS/warehouse).
 * PASS bar: all chk() green, zero pageerror.
 * RUN: node witness_room_path_ui.js
 */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ROOT = __dirname;

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css',
  '.db': 'application/octet-stream', '.data': 'application/octet-stream', '.sql': 'text/plain' };
function makeServer(root) {
  return http.createServer((q, r) => {
    let p = decodeURIComponent(q.url.split('?')[0]);
    fs.readFile(path.join(root, p), (e, b) => {
      if (e) { r.writeHead(404); r.end('404'); return; }
      r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Accept-Ranges': 'bytes' });
      r.end(b);
    });
  });
}

let pass = 0, fail = 0;
const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };

(async () => {
  if (!fs.existsSync(path.join(ROOT, 'buildings', 'Duplex_extracted.db'))) {
    console.log('§W-ROOM-PATH-UI SKIP — buildings/Duplex_extracted.db not present locally (OCI-only file, see header)');
    process.exit(0);
  }
  const server = makeServer(ROOT);
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const pg = await br.newPage();
  await pg.setViewport({ width: 1280, height: 850, deviceScaleFactor: 1 });
  const logs = [], errs = [];
  pg.on('console', m => logs.push(m.text()));
  pg.on('pageerror', e => errs.push(String(e).slice(0, 400)));
  const url = `http://localhost:${port}/viewer/viewer.html?db=${encodeURIComponent('buildings/Duplex_extracted.db')}`;
  await pg.goto(url, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('!!window.APP && !!window.APP.db', { timeout: 30000 }).catch(() => {});
  await sleep(1800);

  await pg.evaluate(() => { if (window.APP && window.APP.openFindPanel) window.APP.openFindPanel(); });
  await pg.waitForSelector('#find-axis-toggle', { timeout: 15000 }).catch(() => {});
  await sleep(400);
  for (let i = 0; i < 8; i++) {
    const cur = await pg.evaluate(() => { const b = document.getElementById('find-axis-toggle'); return b ? b.getAttribute('data-axis') : null; });
    if (cur === 'room') break;
    await pg.evaluate(() => { const b = document.getElementById('find-axis-toggle'); if (b) b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); });
    await sleep(400);
  }
  const finalAxis = await pg.evaluate(() => { const b = document.getElementById('find-axis-toggle'); return b ? b.getAttribute('data-axis') : null; });
  chk('reached Room axis', finalAxis === 'room', 'finalAxis=' + finalAxis);
  await sleep(500);

  // Click the "Path" sub-toggle pill (3rd pill in the Storey|Type|Path row).
  const clickedPath = await pg.evaluate(() => {
    const btns = document.querySelectorAll('#find-tree button');
    for (const b of btns) { if ((b.textContent || '').trim() === 'Path') { b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); return true; } }
    return false;
  });
  chk('Path sub-toggle pill found and clicked', clickedPath);
  await sleep(400);

  chk('§ROOM_GRAPH log line present (module loaded + graph built on entering Path sub-mode — lazy, not on every Room-axis open)',
    logs.some(l => l.indexOf('§ROOM_GRAPH nodes=') >= 0),
    logs.filter(l => l.indexOf('§ROOM_GRAPH') >= 0).slice(-1)[0] || 'none found');

  const selectsPresent = await pg.evaluate(() => !!document.getElementById('find-path-from') && !!document.getElementById('find-path-to'));
  chk('From/To room selects rendered', selectsPresent);

  // Pick real rooms by NAME text (A202 Bedroom 1 -> A205 Utility, the same pair the node-side
  // witness proves a real 3-hop through-the-hub path for) — select by matching option text so this
  // stays correct even if guids change on re-extraction.
  const picked = await pg.evaluate(() => {
    function pickByName(selId, namePrefix) {
      const sel = document.getElementById(selId);
      if (!sel) return false;
      for (const o of sel.options) { if (o.textContent.indexOf(namePrefix) === 0) { sel.value = o.value; sel.dispatchEvent(new Event('change', { bubbles: true })); return true; } }
      return false;
    }
    const a = pickByName('find-path-from', 'A202');
    const b = pickByName('find-path-to', 'A205');
    return a && b;
  });
  chk('picked real From=A202(Bedroom1) / To=A205(Utility) by option text', picked);

  const clickedFind = await pg.evaluate(() => {
    const btns = document.querySelectorAll('#find-tree button');
    for (const b of btns) { if ((b.textContent || '').trim() === 'Find Path') { b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); return true; } }
    return false;
  });
  chk('Find Path button found and clicked', clickedFind);
  await sleep(600);

  const pathLogLine = logs.filter(l => l.indexOf('§ROOM_PATH from=') >= 0).slice(-1)[0] || '';
  console.log('  ' + pathLogLine);
  chk('§ROOM_PATH log line shows the real A202->A205 route with door guids',
    /§ROOM_PATH from=A202 to=A205 hops=\d+ rooms=\[.*\] doors=\[.*\]/.test(pathLogLine), pathLogLine || 'not found');

  const treeText = await pg.evaluate(() => { const t = document.getElementById('find-tree'); return t ? t.textContent : ''; });
  chk('result list renders the path rooms as tappable rows (Bedroom 1 ... Utility text present)',
    treeText.indexOf('Bedroom 1') >= 0 && treeText.indexOf('Utility') >= 0);
  chk('result list shows a door hint between hops ("door:" text present)', treeText.indexOf('door:') >= 0);

  // Honest-disconnection UI check: Kitchen (A103) has 0 real doors in this building (open-plan —
  // confirmed by witness_room_graph_path.js's G4a) — the UI must show "no path", not crash or
  // fabricate a route.
  const pickedDisconnected = await pg.evaluate(() => {
    function pickByName(selId, namePrefix) {
      const sel = document.getElementById(selId);
      if (!sel) return false;
      for (const o of sel.options) { if (o.textContent.indexOf(namePrefix) === 0) { sel.value = o.value; sel.dispatchEvent(new Event('change', { bubbles: true })); return true; } }
      return false;
    }
    return pickByName('find-path-from', 'A103') && pickByName('find-path-to', 'A104');
  });
  chk('picked the known-disconnected pair From=A103(Kitchen) / To=A104(Bathroom1)', pickedDisconnected);
  await pg.evaluate(() => {
    const btns = document.querySelectorAll('#find-tree button');
    for (const b of btns) { if ((b.textContent || '').trim() === 'Find Path') { b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); break; } }
  });
  await sleep(500);
  const notFoundLine = logs.filter(l => l.indexOf('§ROOM_PATH_NOT_FOUND') >= 0).slice(-1)[0] || '';
  console.log('  ' + notFoundLine);
  chk('§ROOM_PATH_NOT_FOUND logged for the disconnected pair (honest, not silently retried/faked)',
    /§ROOM_PATH_NOT_FOUND from=A103 to=A104/.test(notFoundLine), notFoundLine || 'not found');
  const treeText2 = await pg.evaluate(() => { const t = document.getElementById('find-tree'); return t ? t.textContent : ''; });
  chk('UI shows the honest "no door-connected path" message for the disconnected pair',
    treeText2.indexOf('disconnected parts of the building') >= 0);

  chk('zero pageerror across the whole flow', errs.length === 0, errs.join(' | '));

  fs.writeFileSync(path.join(ROOT, 'w_room_path_ui_console.log'), logs.join('\n'));
  await server.close();
  await br.close();
  console.log(`\n§W-ROOM-PATH-UI DONE pass=${pass} fail=${fail}`);
  process.exit(fail === 0 ? 0 : 1);
})();
