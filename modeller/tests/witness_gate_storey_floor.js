#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-GATE-STOREY-FLOOR: the clash gate never "resolves" a clash by sinking a fixture out of its storey.
 * SCOPE: disc_walker.js §GATE-STOREY-FLOOR (2026-09-25). Drives the real Open → "Walk ALL Services" row, then reads every
 * walked placement's final z against THIS building's real storey floors (DiscWalker.storeyFloors on the open building,
 * each = the lowest element bottom of a storey). Waits on conditions. Read the log after every run.
 * ISSUES proved or disproved:
 *   F1 NO-SINK     — no fixture ends below the floor of the storey it started in. RED before the fix on Duplex: 20 fixtures
 *                    sunk 1.0–3.5 m to about -1 m, once FP's foundation-level sprinklers (z0 -1.257) dragged the global floor down.
 *   (info) FLAGGED — the count of placements the gate could not resolve (clash=true) = fixtures a human must review,
 *                    printed per discipline. Not a gate: once F1 holds, the flag is the honest outcome by construction.
 *   F2 NO-ERROR    — 0 pageerror, op-log verifies.
 * Usage: node witness_gate_storey_floor.js [Duplex,SampleCastle,…]   (default Duplex,SampleCastle)
 */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const ROOT = path.join(__dirname, '..', '..');
const RES = (process.argv[2] || 'Duplex,SampleCastle').split(',');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.db': 'application/octet-stream', '.sql': 'text/plain' };
const server = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/modeller/modeller.html';
  fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { r.writeHead(404); r.end('404'); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); r.end(b); }); });
(async () => {
  await new Promise(r => server.listen(0, r)); const port = server.address().port;
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  let pass = 0, fail = 0; const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + '  ' + x); } else { fail++; console.log('  ❌ ' + n + '  ' + x); } };
  console.log('═══ W-GATE-STOREY-FLOOR — the gate never sinks a fixture below its storey (' + RES.join(',') + ') ═══');
  for (const B of RES) {
    const pg = await br.newPage(); await pg.setViewport({ width: 1200, height: 850 });
    const errs = []; pg.on('pageerror', e => errs.push(String(e).slice(0, 200)));
    await pg.goto(`http://localhost:${port}/modeller/modeller.html`, { waitUntil: 'load', timeout: 60000 });
    await pg.waitForFunction('window.__sceneReady === true && typeof window.discWalkAll==="function"', { timeout: 60000 });
    await pg.click('#b-open'); await pg.waitForSelector(`#m-open-panel .mo-row[data-key="${B}"]`); await pg.click(`#m-open-panel .mo-row[data-key="${B}"]`);
    await pg.waitForFunction(b => window.__dwName === b && window.Bonsai.oplog.length > 0 && window.DiscWalker && window.DiscWalker._ready() && !!document.querySelector('[data-bnode="dw-all"]'), { timeout: 180000, polling: 300 }, B);
    await pg.evaluate(() => { window.__dwAllDone = false; });
    await pg.click('[data-bnode="dw-all"]');
    await pg.waitForFunction(() => window.__dwAllDone === true, { timeout: 600000, polling: 500 });
    const r = await pg.evaluate(() => {
      const db = new window.SQL.Database(new Uint8Array(window.__dwBuf));
      let floors; try { floors = window.DiscWalker.storeyFloors ? window.DiscWalker.storeyFloors(db) : null; } finally { db.close(); }
      if (!floors) {   // baseline build has no storeyFloors export: derive the same thing here (instrument, same SQL)
        const d2 = new window.SQL.Database(new Uint8Array(window.__dwBuf));
        const q = d2.exec("SELECT MIN(t.center_z - t.bbox_z / 2.0) FROM elements_meta m JOIN element_transforms t ON m.guid=t.guid WHERE m.storey IS NOT NULL AND m.storey <> 'Unknown' AND t.bbox_z IS NOT NULL GROUP BY m.storey");
        floors = q.length ? q[0].values.map(v => v[0]).filter(f => f != null).sort((a, b) => a - b) : []; d2.close();
      }
      const floorOf = z0 => { let f = floors[0]; floors.forEach(v => { if (v <= z0 + 1e-6) f = v; }); return f; };
      const all = []; Object.keys(window.__dwWalks).forEach(d => (window.__dwWalks[d] || []).forEach(p => all.push(p)));
      const sunk = all.filter(p => p._z0 != null && p.z < floorOf(p._z0) - 1e-6);
      const worst = sunk.map(p => ({ disc: p.disc, z0: +p._z0.toFixed(3), z: +p.z.toFixed(3), floor: +floorOf(p._z0).toFixed(3) })).sort((a, b) => (a.z - a.floor) - (b.z - b.floor)).slice(0, 3);
      return { n: all.length, floors: floors.map(f => +f.toFixed(3)), sunk: sunk.length, worst, flagged: all.filter(p => p.clash).length,
        byDisc: Object.fromEntries(Object.keys(window.__dwWalks).map(d => [d, (window.__dwWalks[d] || []).filter(p => p.clash).length])) };
    });
    const chain = await pg.evaluate(async () => { try { const db = await window.Bonsai.oplog._ensureDb(); return !!(await window.KernelOps.verifyChain(db)).ok; } catch (e) { return 'ERR:' + e.message; } });
    console.log('--- ' + B + ' fixtures=' + r.n + ' storeyFloors=' + JSON.stringify(r.floors));
    chk('F1 NO-SINK ' + B + ' (no fixture below its own storey floor)', r.sunk === 0, 'sunk=' + r.sunk + (r.worst.length ? ' worst=' + JSON.stringify(r.worst) : ''));
    console.log('  ℹ FLAGGED ' + B + ' flaggedForReview=' + r.flagged + ' ' + JSON.stringify(r.byDisc) + ' (unresolved clashes a human reviews; measured, not a gate)');
    chk('F2 NO-ERROR ' + B, errs.length === 0 && chain === true, 'errs=' + errs.length + ' chain=' + chain);
    await pg.close();
  }
  console.log('W-GATE-STOREY-FLOOR: ' + pass + ' PASS / ' + fail + ' FAIL');
  await br.close(); server.close(); process.exit(fail ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
