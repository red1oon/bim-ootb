#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-DW-PIXELPROBE scope (read this block first)
 * SCOPE: roadmap #4 — a headless readPixels WIRING gate that the disc-walk render actually PAINTS, and that the
 *   §3c ASSEMBLE render (connector hookup edges) is wired LIVE in the deployed modeller — not just §-log/engine-
 *   proven. Drives a REAL FP walk on SampleCastle (the live 151-sprinkler case) via the engine API, renders it
 *   through the SAME module functions the live walk calls (window.__dwRender seam), then window.__dwPixelProbe('FP'):
 *   a scene-graph census of the dwRoot group (fixture box InstancedMesh + §3c connector-edge LineSegments +
 *   routed tubes + assembled parts) and a whole-canvas readPixels litPct.
 *
 *   ⚠ Drives the render via dwOpen/dwBorrow with PLAIN-FETCHED rules DBs + the window.__dwRender seam, NOT the
 *   production discWalk() path — the latter caches rules in bim_ootb_cache IndexedDB, which is unreliable under
 *   puppeteer+swiftshader (fine in real browsers; verified live by curl in the §3c deploy). The RENDER functions
 *   exercised here are byte-for-byte the ones discWalk() invokes; this isolates the render from the IDB cache.
 *
 *   WIRING/deploy check (TestArchitecture §Browser Testing) — the VALUES (counts/positions/Ø) are proven by the
 *   node witnesses (W-RULE-CONNECTOR 4/4, W-ASSEMBLE-CONNECT 6/6, §DW-PRIM). Read the §-log; exit ≠ evidence.
 *
 * CLAIMS (FP walk on SampleCastle):
 *   P1 FIXTURE-BOXES   — dwRoot carries ≥1 FP fixture InstancedMesh with instances>0 (the §PRIM boxes rendered).
 *   P2 CONNECTOR-EDGES — dwRoot carries the §3c connector-edge LineSegments (edges>0) → the hookup render is WIRED.
 *   P3 CONNECT-LOG     — §DW-CONNECT fired with hookups == the enriched-fixture count (>0): the projected
 *                        connectorEnrich + edge render covered every enriched sprinkler. (COUNT is a value proven
 *                        by the node witnesses on the canonical extracted.db — here we only assert log==render, not a magic number.)
 *   P4 PAINTED         — litPixels > 0 after render (the frame is non-blank; geometry reached the framebuffer).
 *   P5 ASSEMBLE-HONEST — assemble('FP', SC) REFUSES (no routed network) → parts=0, no fabricated assembly.
 *   P6 NO-ERROR        — no pageerror / script load failure.
 */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const sleep = ms => new Promise(r => setTimeout(r, ms));

const ROOT = path.join(__dirname, '..', '..');   // repo root → ../modeller/<db> + rules DBs resolve
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm',
  '.json': 'application/json', '.css': 'text/css', '.db': 'application/octet-stream', '.data': 'application/octet-stream' };

const server = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/modeller/modeller.html';
  fs.readFile(path.join(ROOT, p), (e, b) => {
    if (e) { r.writeHead(404); r.end('404 ' + p); return; }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Accept-Ranges': 'bytes' });
    r.end(b);
  });
});

(async () => {
  await new Promise(r => server.listen(0, r)); const port = server.address().port;
  const br = await puppeteer.launch({ headless: 'new',
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const pg = await br.newPage(); await pg.setViewport({ width: 1100, height: 800 });
  const logs = [];
  pg.on('console', m => { const t = m.text(); if (/^§(DISC-WALK|DW-|WALK-HOSTBIND)/.test(t)) logs.push(t); });
  const errs = [];
  pg.on('pageerror', e => errs.push(String(e).slice(0, 200)));

  console.log('═══ W-DW-PIXELPROBE — disc-walk render paints + §3c connector edges wired (headless, SC FP) ═══');
  await pg.goto(`http://localhost:${port}/modeller/modeller.html`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('window.__sceneReady === true && !!window.SQL && !!window.__dwRender && !!window.__dwPixelProbe', { timeout: 30000 }).catch(() => {});

  // open SampleCastle (sets window.__dwBuf = the open building)
  await pg.click('#b-open'); await sleep(200);
  await pg.click('#m-open-panel .mo-row[data-key="SampleCastle"]');
  await pg.waitForFunction(() => !!window.__dwBuf, { timeout: 30000 }).catch(() => {});
  await sleep(500);

  const before = await pg.evaluate(() => window.__dwPixelProbe('FP'));

  // Drive the FP walk via the IDB-FREE engine API + the render seam (same render fns discWalk uses).
  logs.length = 0;
  const walk = await pg.evaluate(async () => {
    try {
      const SQL = window.SQL, DW = window.DiscWalker;
      const dxBuf = await (await fetch('./duplex_rules.db')).arrayBuffer();
      const teBuf = await (await fetch('./terminal_rules.db')).arrayBuffer();
      DW.dwOpen(new SQL.Database(new Uint8Array(dxBuf)));               // residential primary
      DW.dwBorrow('FP', new SQL.Database(new Uint8Array(teBuf)));       // borrow FP/sprinkler from terminal
      const bdb = new SQL.Database(new Uint8Array(window.__dwBuf));
      const w = DW.dwWalk('FP', bdb, 'SampleCastle');
      DW.connectorEnrich(w.placements);                                // projected rule_connector → hookups
      window.__dwWalks = window.__dwWalks || {};
      window.__dwRender.walk('FP', w.placements);                      // the SAME render the live walk calls
      const asm = DW.assemble('FP', bdb);                              // routed-network assemble (SC FP → refuse)
      bdb.close(); DW.dwBorrow('FP', null);
      return { placed: w.placed, n: w.placements.length,
        enriched: w.placements.filter(p => p.connector).length,
        asmRefused: !!asm.refused, asmReason: asm.reason || '', asmParts: (asm.parts || []).length };
    } catch (e) { return { err: String(e && e.message) + ' | ' + ((e.stack || '').split('\n')[1] || '') }; }
  });
  await sleep(300);

  const after = await pg.evaluate(() => window.__dwPixelProbe('FP'));
  await br.close(); server.close();

  const connectLog = logs.find(l => /§DW-CONNECT disc=FP/.test(l)) || '';
  const hookups = (connectLog.match(/hookups=(\d+)/) || [])[1];

  console.log('  §WALK ' + JSON.stringify(walk));
  console.log('  §PROBE before: boxes=' + before.boxes + ' edges=' + before.edges + ' litPixels=' + before.litPct + '%');
  console.log('  §PROBE after : ' + JSON.stringify(after));
  console.log('  ' + (connectLog || '(no §DW-CONNECT)'));

  let pass = 0, fail = 0;
  const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };
  chk('P1 FIXTURE-BOXES rendered', after.boxes > 0 && after.instances > 0, 'boxes=' + after.boxes + ' instances=' + after.instances);
  chk('P2 §3c CONNECTOR-EDGES wired', after.edges > 0, 'connectorEdges=' + after.edges);
  chk('P3 §DW-CONNECT hookups == enriched (>0)', walk.enriched > 0 && hookups === String(walk.enriched), 'hookups=' + hookups + ' enriched=' + walk.enriched);
  chk('P4 PAINTED (canvas non-blank)', after.litPct > 0, 'litPixels=' + after.litPct + '%');
  chk('P5 ASSEMBLE honest-REFUSE (no network)', walk.asmRefused === true && walk.asmParts === 0, 'refused=' + walk.asmRefused + ' reason="' + walk.asmReason + '" parts=' + walk.asmParts);
  chk('P6 no pageerror / walk error', errs.length === 0 && !walk.err, (walk.err || '') + ' ' + errs.slice(0, 2).join(' | '));

  console.log('W-DW-PIXELPROBE: ' + pass + ' PASS / ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
})();
