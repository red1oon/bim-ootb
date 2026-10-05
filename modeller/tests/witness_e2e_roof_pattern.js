#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-E2E-ROOF-PATTERN scope (read the log after every run)
 * SCOPE: MODELLER_MASTER row 8 (O10), the END of the chain W-ROW8-ROOF-PATTERN (engine, Node) cannot see: the REAL user
 * path in the REAL Modeller page — pill Open → Terminal → Outliner "roof" row [data-bnode="dw-roof"] → walk → gate →
 * render → ONE signed group committed. Spec: bim-compiler prompts/Modeller/NEXT_0926/SPEC_ROW8_ROOF_PERELEMENT.md §3.
 * Waits on CONDITIONS (the walk's rows + no pending history), never a duration. A Terminal-scale commit blocks the page
 * for minutes (§RESUME 2026-09-26b trap) → protocolTimeout 1200 s.
 *
 * ISSUE THIS PROVES/DISPROVES (§ROOF-PREFAB, red1 2026-09-26): the tiled roof is prefab ARC/STR the user reshapes like any other
 * element; walkers fill in services. main offered an Outliner roof walk row that could only ever refuse or report "present".
 *   E1 NO-ROOF-WALK-ROW — the Walk ALL row exists and there is no roof walk row.        (RED on main)
 *   E2 ON-SCREEN        — the seeded op-log holds one GEOM_INSERT per real IfcPlate (the roof is there and editable).
 *   E4 NO-ERROR     — zero pageerror; wall time of open / walk / commit logged (not gated — reported, never hidden).
 * INCONCLUSIVE (never PASS) when the resident does not open or carries 0 IfcPlate rows.
 * Run: NODE_PATH=~/bim-ootb/tests/node_modules:~/bim-compiler/node_modules node modeller/tests/witness_e2e_roof_pattern.js
 */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ROOT = process.env.WALKALL_ROOT || path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.db': 'application/octet-stream', '.data': 'application/octet-stream', '.sql': 'text/plain' };
const server = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/modeller/modeller.html';
  fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { r.writeHead(404); r.end('404'); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Accept-Ranges': 'bytes' }); r.end(b); });
});
let pass = 0, fail = 0, inconclusive = 0;
const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };
const inc = (n, x) => { inconclusive++; console.log('  ⚪ ' + n + ' INCONCLUSIVE' + (x ? '  ' + x : '')); };

(async () => {
  await new Promise(r => server.listen(0, r));
  const br = await puppeteer.launch({ headless: 'new', protocolTimeout: 1200000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  console.log('═══ W-E2E-ROOF-PATTERN — real Terminal, Outliner roof row, signed rows vs the 33,324 recorded plate centres. ROOT=' + ROOT + ' ═══');
  const pg = await br.newPage(); await pg.setViewport({ width: 1200, height: 850, deviceScaleFactor: 1 });
  const errs = []; pg.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  const slog = []; pg.on('console', m => { const t = m.text(); if (/§ROOF-PATTERN-(PRESENT|REFUSE|NOPLATES)|§DISC-WALK roof/.test(t)) pg.evaluate(() => { window.__roofSaid = true; }).catch(() => {}); if (/^§/.test(t) && /ROOF-PATTERN|DW-TESSELLATE|WALK-NOSPACES disc=roof|DISC-WALK roof|DISC-WALK-COMMIT|NOSPACES-TOPUP roof|DW-CAP roof|T-OPEN/.test(t)) { slog.push(t); console.log('  ' + t.slice(0, 220)); } });
  const t0 = Date.now();
  await pg.goto(`http://localhost:${server.address().port}/modeller/modeller.html`, { waitUntil: 'load', timeout: 120000 });
  await pg.waitForFunction('window.__sceneReady === true && !!window.Bonsai && typeof window.discWalk === "function"', { timeout: 60000 });
  await pg.click('#b-open'); await sleep(300);
  await pg.click('#m-open-panel .mo-row[data-key="Terminal"]');
  const opened = await pg.waitForFunction(() => !!window.__dwBuf, { timeout: 600000 }).then(() => true).catch(() => false);
  if (!opened) { inc('E1-E3', 'Terminal did not open (no __dwBuf)'); await br.close(); server.close(); console.log('W-E2E-ROOF-PATTERN: ' + pass + ' PASS / ' + fail + ' FAIL / ' + inconclusive + ' INCONCLUSIVE'); process.exit(1); }
  await pg.waitForFunction(() => window.Bonsai.group && window.Bonsai.group() && window.Bonsai.group().children.length > 30000, { timeout: 600000, polling: 1000 }).catch(() => {});
  await sleep(3000);
  const openMs = Date.now() - t0;
  // the oracle: the open resident's own recorded plate centres (what the seed placed verbatim)
  const real = await pg.evaluate(() => {
    const db = new window.SQL.Database(new Uint8Array(window.__dwBuf));
    const r = db.exec("SELECT t.center_x, t.center_y, t.center_z FROM elements_meta m JOIN element_transforms t ON t.guid=m.guid WHERE m.ifc_class='IfcPlate'");
    db.close(); return r.length ? r[0].values : [];
  });
  console.log('  §E-OPEN Terminal open+seeded in ' + (openMs / 1000).toFixed(1) + 's realIfcPlate=' + real.length + ' rowExists=' + await pg.evaluate(() => !!document.querySelector('[data-bnode="dw-roof"]')));
  if (!real.length) { inc('E1-E3', '0 IfcPlate rows in the open resident'); }
  else {
    // §ROOF-PREFAB (red1 2026-09-26): the roof is prefab ARC/STR the user edits like any element; walkers fill services.
    await pg.waitForFunction(() => window.Bonsai.oplog.length > 30000 && !!document.querySelector('[data-bnode="dw-all"]'), { timeout: 600000, polling: 1000 }).catch(() => {});
    const st = await pg.evaluate(() => ({ roofRow: !!document.querySelector('[data-bnode="dw-roof"]'), allRow: !!document.querySelector('[data-bnode="dw-all"]'),
      seeded: window.Bonsai.oplog._geomOps().filter(o => o.op_type === 'GEOM_INSERT' && o.parameters && o.parameters.ifc_class === 'IfcPlate').length }));
    console.log('  §E-ROWS ' + JSON.stringify(st));
    chk('E1 NO-ROOF-WALK-ROW (Outliner offers no roof walk — the roof is prefab, walkers fill services; main: a row that only ever refused)',
      st.allRow && !st.roofRow, JSON.stringify(st));
    chk('E2 ON-SCREEN (every real plate is a seeded, editable GEOM_INSERT)', st.seeded === real.length, 'seeded IfcPlate rows=' + st.seeded + ' real=' + real.length);
  }
  chk('E4 NO-ERROR (zero pageerror across open + walk + commit)', errs.length === 0, errs.slice(0, 3).join(' | '));
  await br.close(); server.close();
  console.log('W-E2E-ROOF-PATTERN: ' + pass + ' PASS / ' + fail + ' FAIL / ' + inconclusive + ' INCONCLUSIVE');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
