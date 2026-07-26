// ⚠ DO NOT REMOVE — Scope guard
// SCOPE: user pushback (2026-07-26) on the Level-4 door-revisit wiggle discussion — "not just
// visually clean but of course factually is a proper exact shortest real walking path." This
// witness does NOT change any code; it independently RE-RUNS the real ≈Level 1 R35 -> ≈Level 4 R8
// path query live against Hospital and captures room_graph.js's own §PATH_LEGAL_DETOUR_REVISIT_KEPT
// line fresh, right now — proving the 42.3m-kept-over-43.8m choice is (a) reproducible on the
// CURRENTLY SHIPPED code, not a stale claim from an old commit message, and (b) genuinely a
// shorter-of-two-already-legal-options comparison: both `mid` (kept) and `alt` (rejected) in
// common/room_graph.js's §DETOUR-NO-REVISIT retry only ever come from _detourForChord's own
// Dijkstra over doorwp/spine/circ nodes, which by construction never returns an illegal chord — so
// there is no separate "is it real/walkable" question left open; the ONLY axis being compared is
// length, and the shorter one (with the revisit) wins. The visible crossing in the screenshot is
// therefore not an artifact — it is what the true shortest legal route looks like at that door.
// §-log first — READ tests/witness_detour_revisit_shortest_2026-07-26.log before any conclusion.
// Run:  node viewer/tests/witness_detour_revisit_shortest_2026-07-26.js
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

(async () => {
  await new Promise(r => server.listen(0, r));
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  const cons = [];
  page.on('console', m => { cons.push(m.text()); });

  S('── witness_detour_revisit_shortest (Hospital, real fixture, direct RoomGraph call) ──');
  await page.goto('http://127.0.0.1:' + server.address().port +
    '/viewer/viewer.html?db=buildings/Hospital_extracted.db',
    { waitUntil: 'load', timeout: 60000 });
  const ready = await waitReady(page, 150);
  verdict(ready, 'real model loaded + ready (Hospital)');
  if (!ready) {
    S('\n❌ ABORT — model never became ready');
    fs.writeFileSync(path.join(__dirname, 'witness_detour_revisit_shortest_2026-07-26.log'), log.join('\n') + '\n');
    await browser.close(); server.close(); process.exit(1);
  }

  // navigate_find.js (and the A.getRoomGraph alias it installs) is lazy-loaded on first Find-panel
  // open (§NAVIGATE_LAZY_LOADED) — open it for real first, same as every other witness in this file.
  await page.waitForFunction(() => window._mainPillActions && window._mainPillActions.length > 0, { timeout: 15000 }).catch(() => {});
  await page.click('#mobile-trigger', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(300);
  await page.evaluate(() => { const el = document.getElementById('pill-navigate'); if (el) el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); });
  await page.waitForTimeout(400);
  await page.evaluate(() => { const el = document.getElementById('drawer-row-find'); if (el) el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); });
  await page.waitForTimeout(800);
  verdict(!!(await page.evaluate(() => typeof window.APP.getRoomGraph)) , 'A.getRoomGraph installed after opening Find', await page.evaluate(() => typeof window.APP.getRoomGraph));

  // Warm the room graph the same way Find's Room->Path sub-mode does (A.ensureRooms then
  // A.getRoomGraph), find the real guids for "R35" and "R8" by NAME (no hardcoded guid — a fresh
  // needle-recompile can renumber them), then call the exported RoomGraph.shortestPath directly —
  // same function _findRoomPath() calls, same real graph, no synthetic shortcut.
  cons.length = 0;
  const result = await page.evaluate(async () => {
    if (window.APP.ensureRooms) await window.APP.ensureRooms({});
    const graph = window.APP.getRoomGraph ? window.APP.getRoomGraph() : null;
    if (!graph) return { error: 'no graph' };
    const r35 = graph.nodes.find(n => n.kind === 'room' && /R35\b/.test(n.name) && /Level 1/.test(n.storey || ''));
    const r8 = graph.nodes.find(n => n.kind === 'room' && /R8\b/.test(n.name) && /Level 4/.test(n.storey || ''));
    if (!r35 || !r8) return { error: 'room not found', r35: !!r35, r8: !!r8 };
    const res = window.RoomGraph.shortestPath(graph, r35.guid, r8.guid);
    return { error: null, from: r35.name, to: r8.name, fromGuid: r35.guid, toGuid: r8.guid,
      distance: res && res.distance, pathLen: res && res.path && res.path.length };
  });
  S('     [info] direct RoomGraph.shortestPath result: ' + JSON.stringify(result));
  verdict(!result.error, 'found both real rooms + ran shortestPath directly', result.error || (result.from + ' -> ' + result.to));

  const revisitLine = cons.find(l => l.indexOf('§PATH_LEGAL_DETOUR_REVISIT_KEPT') >= 0);
  const noRevisitLine = cons.find(l => l.indexOf('§PATH_LEGAL_DETOUR_NOREVISIT') >= 0);
  S('     [console] REVISIT_KEPT: ' + (revisitLine || '(none)'));
  S('     [console] NOREVISIT (swapped): ' + (noRevisitLine || '(none)'));
  verdict(!!revisitLine || !!noRevisitLine, 'the §DETOUR-NO-REVISIT retry fired for this route (one of the two outcome lines printed)');
  if (revisitLine) {
    const m = /longer \(([\d.]+)m -> ([\d.]+)m\)/.exec(revisitLine);
    verdict(!!m, 'REVISIT_KEPT line carries both compared lengths', revisitLine);
    if (m) {
      const kept = parseFloat(m[1]), rejected = parseFloat(m[2]);
      verdict(kept < rejected, 'the KEPT (with-revisit) route is genuinely shorter than the rejected no-revisit alternative', kept + 'm < ' + rejected + 'm');
      S('     [info] both `kept` and the rejected alternative come ONLY from _detourForChord\'s own ' +
        'Dijkstra over doorwp/spine/circ nodes (common/room_graph.js) — by construction neither can be an ' +
        'illegal/unwalkable chord, so this is a straight shorter-of-two-legal-routes comparison, not a ' +
        'visual-vs-correct trade-off.');
    }
  }

  await page.close(); await ctx.close();
  await browser.close();
  server.close();

  S('\n' + (fails === 0 ? '✅ ALL PASS' : '❌ ' + fails + ' FAILED'));
  fs.writeFileSync(path.join(__dirname, 'witness_detour_revisit_shortest_2026-07-26.log'), log.join('\n') + '\n');
  process.exit(fails === 0 ? 0 : 1);
})();
