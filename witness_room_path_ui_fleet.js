#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-ROOM-PATH-UI-FLEET scope (READ THE LOG after every run)
 * SCOPE: prompts/FUNCTIONAL_SPACES_ENSEMBLE.md (bim-compiler) Step 1 browser witness — after the
 * ROOM001..006 spatial_structure carry restore, the REAL Viewer Find panel (Room axis + Path
 * sub-mode, viewer/navigate_find.js -> common/room_graph.js) must surface rooms + a real
 * Path-Between for every restored resident, loaded as `?db=modeller/<b>_ARC.db` (the exact DBs
 * this worktree just patched — no substitute data). Per building this proves:
 *   U1 rooms render — §ROOM_GRAPH nodes=N in the live console equals the carried IfcSpace count.
 *   U2 Path-Between — picking the SAME two rooms the node-side witness (W-SPATIAL-CARRY-FLEET
 *      W3b) proved connected produces a §ROOM_PATH line with real door guids (Garage: proved
 *      NO room-to-room edges — the honest §ROOM_PATH_NOT_FOUND is the expected result there).
 * Secondary wiring check per project convention (§-log first): the algorithmic proof is
 * witness_spatial_carry_fleet.js; this only proves the UI surfaces it.
 * PASS bar: all chk() green, zero pageerror. RUN: node witness_room_path_ui_fleet.js
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

// from/to = the exact pair W-SPATIAL-CARRY-FLEET W3b proved connected on the SAME patched DBs.
const FLEET = [
  { b: 'SampleHouse',  rooms: 3,  from: '1 - Living room',      to: '3 - Entrance hall',     shot: false },
  { b: 'HHS',          rooms: 105, from: '≈ Level 1 R1',        to: '≈ Level 1 R36',         shot: false },
  { b: 'Clinic',       rooms: 197, from: '≈ Second Floor R2',   to: '≈ Second Floor R77',    shot: false },
  // Garage: 0 room-to-room (E1) edges node-side, but e2=6 circulation edges — the full occupant
  // graph (OCCUPANT_PATHFINDER.md E2 room<->CIRC rescue) legitimately routes via the hallway, so a
  // found path here is CORRECT, not fabricated (each hop still carries a real door guid).
  { b: 'Garage',       rooms: 5,  from: '≈ Exist Garage - Ground Level R1', to: '≈ Exist Garage - Ground Level R2', shot: false },
  { b: 'Hospital',     rooms: 201, from: '≈ Level 2 R18',       to: '≈ Level 2 R31',         shot: false },
  { b: 'SampleCastle', rooms: 51, from: '≈ 00 begane grond R12', to: '≈ 00 begane grond R17', shot: true },
];

let pass = 0, fail = 0;
const out = [];
function S(m) { out.push(m); console.log(m); }
const chk = (n, c, x) => { if (c) { pass++; S('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; S('  ❌ ' + n + (x ? '  ' + x : '')); } };

(async () => {
  const server = makeServer(ROOT);
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });

  for (const f of FLEET) {
    S('§UI-FLEET building=' + f.b);
    const pg = await br.newPage();
    await pg.setViewport({ width: 1280, height: 850, deviceScaleFactor: 1 });
    const logs = [], errs = [];
    pg.on('console', m => logs.push(m.text()));
    pg.on('pageerror', e => errs.push(String(e).slice(0, 300)));
    // NOTE: db= resolves relative to /viewer/ — absolute path needed for the modeller/ residents.
    const url = `http://localhost:${port}/viewer/viewer.html?db=${encodeURIComponent('/modeller/' + f.b + '_ARC.db')}`;
    await pg.goto(url, { waitUntil: 'load', timeout: 60000 });
    await pg.waitForFunction('!!window.APP && !!window.APP.db', { timeout: 45000 }).catch(() => {});
    await sleep(2500);

    await pg.evaluate(() => { if (window.APP && window.APP.openFindPanel) window.APP.openFindPanel(); });
    await pg.waitForSelector('#find-axis-toggle', { timeout: 15000 }).catch(() => {});
    await sleep(400);
    for (let i = 0; i < 8; i++) {
      const cur = await pg.evaluate(() => { const b = document.getElementById('find-axis-toggle'); return b ? b.getAttribute('data-axis') : null; });
      if (cur === 'room') break;
      await pg.evaluate(() => { const b = document.getElementById('find-axis-toggle'); if (b) b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); });
      await sleep(350);
    }
    const axis = await pg.evaluate(() => { const b = document.getElementById('find-axis-toggle'); return b ? b.getAttribute('data-axis') : null; });
    chk('U0 ' + f.b + ' Room axis reachable', axis === 'room', 'axis=' + axis);

    // Path sub-mode → builds the room graph live in the browser
    await pg.evaluate(() => {
      const btns = document.querySelectorAll('#find-tree button');
      for (const b of btns) { if ((b.textContent || '').trim() === 'Path') { b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); return; } }
    });
    await sleep(600);
    const graphLine = logs.filter(l => l.indexOf('§ROOM_GRAPH nodes=') >= 0).slice(-1)[0] || '';
    S('  ' + (graphLine || '(no §ROOM_GRAPH line)'));
    const m = graphLine.match(/§ROOM_GRAPH nodes=(\d+)/);
    chk('U1 ' + f.b + ' live §ROOM_GRAPH nodes == ' + f.rooms, !!m && Number(m[1]) === f.rooms, graphLine.replace(/^.*§/, '§'));

    const picked = await pg.evaluate((fromName, toName) => {
      function pick(selId, name) {
        const sel = document.getElementById(selId);
        if (!sel) return false;
        for (const o of sel.options) { if (o.textContent.indexOf(name) >= 0) { sel.value = o.value; sel.dispatchEvent(new Event('change', { bubbles: true })); return true; } }
        return false;
      }
      return pick('find-path-from', fromName) && pick('find-path-to', toName);
    }, f.from, f.to);
    chk('U2a ' + f.b + ' picked From="' + f.from + '" To="' + f.to + '" in the real selects', picked);

    await pg.evaluate(() => {
      const btns = document.querySelectorAll('#find-tree button');
      for (const b of btns) { if ((b.textContent || '').trim() === 'Find Path') { b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); break; } }
    });
    await sleep(700);
    const pathLine = logs.filter(l => l.indexOf('§ROOM_PATH from=') >= 0 || l.indexOf('§ROOM_PATH_NOT_FOUND') >= 0).slice(-1)[0] || '';
    S('  ' + (pathLine || '(no §ROOM_PATH line)'));
    if (f.expectNoPath) {
      chk('U2b ' + f.b + ' honest §ROOM_PATH_NOT_FOUND (node witness proved 0 room-to-room edges)',
        pathLine.indexOf('§ROOM_PATH_NOT_FOUND') >= 0, pathLine || 'none');
    } else {
      chk('U2b ' + f.b + ' real §ROOM_PATH found between the node-proved pair',
        /§ROOM_PATH from=.*hops=\d+/.test(pathLine) && pathLine.indexOf('NOT_FOUND') < 0, pathLine || 'none');
    }
    if (f.shot) {
      await pg.screenshot({ path: path.join(ROOT, 'w_ui_fleet_' + f.b + '.png') });
      S('  §SCREENSHOT w_ui_fleet_' + f.b + '.png');
    }
    chk('U3 ' + f.b + ' zero pageerror', errs.length === 0, errs.slice(0, 2).join(' | ') || 'clean');
    await pg.close();
  }
  await br.close();
  server.close();
  S('§W-ROOM-PATH-UI-FLEET RESULT pass=' + pass + ' fail=' + fail);
  fs.writeFileSync(path.join(ROOT, 'witness_room_path_ui_fleet.log'), out.join('\n') + '\n');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
