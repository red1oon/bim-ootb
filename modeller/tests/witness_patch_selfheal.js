#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-PATCH-SELFHEAL scope (READ THE LOG after every run)
 * SCOPE: modeller/patches/*.sql self-heal loader wired into str_walker_outliner.js
 * (_applyPendingPatch / openResident / _fetchGeoDb) — ported from bim-compiler
 * migration/MDB001_livewire_device_meshes.sql + prompts/Modeller/DISC_Walker/embed8_scripts/
 * ROOM001-007_*.sql (ROOM_INJECTION_HYBRID.md Task 4 follow-up). Driven through the REAL user
 * path (open resident in the live modeller), §-log-first (whitebox), zero manual sqlite3 step.
 *
 * ISSUES THIS WITNESS EXPOSES:
 *   P1 STALE-ARC   — 6 residents ship main's actual, real 0-row spatial_structure gap (no table
 *                    at all) and Duplex ships the unfiltered 26th (Roof) row — genuinely stale on
 *                    this checkout, not simulated. Opening each LIVE must self-heal to the correct
 *                    row count with zero manual step.
 *   P2 NOPATCH-OK  — Terminal ships no patch file (already byte-identical to source) — the loader
 *                    must 404-skip it silently, never error, never block the open.
 *   P3 MESH-IDEMPOTENT — mesh.db.sql's 26 INSERT OR IGNORE rows already resolve on this checkout's
 *                    real mesh.db (re-applying costs nothing, proves no corruption/duplication).
 *   P4 MESH-FALSIFIER — a deliberately-staled mesh.db copy (the 26 rows stripped, reproducing the
 *                    real pre-670bf0f/stale-browser-cache shape MDB001's own header describes) must
 *                    self-heal live to 26/26 resolved — this is the mechanical proof the loader
 *                    actually DOES something for mesh.db, not just a no-op on already-good data.
 * PASS bar: all chk() green, zero pageerror on every page.
 */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const Database = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'better-sqlite3'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ROOT = path.join(__dirname, '..', '..');
const OUT = process.env.PATCH_SELFHEAL_OUT || path.join(ROOT, 'logs');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.db': 'application/octet-stream', '.data': 'application/octet-stream', '.sql': 'text/plain' };

function makeServer(root) {
  return http.createServer((q, r) => {
    let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/modeller/modeller.html';
    fs.readFile(path.join(root, p), (e, b) => { if (e) { r.writeHead(404); r.end('404'); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Accept-Ranges': 'bytes' }); r.end(b); });
  });
}

let pass = 0, fail = 0;
const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };

// ── P1 ground truth (node-side, exact, real files on this checkout — not inferred) ──
function groundTruth() {
  const before = {};
  for (const f of ['SampleHouse_ARC.db', 'HHS_ARC.db', 'Clinic_ARC.db', 'Garage_ARC.db', 'Hospital_ARC.db', 'SampleCastle_ARC.db', 'Duplex_ARC.db', 'Terminal_ARC.db']) {
    const db = new Database(path.join(ROOT, 'modeller', f), { readonly: true });
    let n = 0;
    try { n = db.prepare('SELECT COUNT(*) c FROM spatial_structure').get().c; } catch (e) { n = -1; } // -1 == table missing
    db.close();
    before[f] = n;
  }
  const mdb = new Database(path.join(ROOT, 'modeller', 'mesh.db'), { readonly: true });
  const hashes = fs.readFileSync(path.join(ROOT, 'modeller', 'patches', 'mesh.db.sql'), 'utf8').match(/VALUES \('[0-9a-f]{16}'/g).map(s => s.slice(9, -1));
  const already = hashes.filter(h => mdb.prepare('SELECT 1 FROM component_geometries WHERE geometry_hash=?').get(h)).length;
  mdb.close();
  console.log('  §GROUND-TRUTH spatial_structure (pre-patch, real checkout): ' + JSON.stringify(before));
  console.log('  §GROUND-TRUTH mesh.db 26 §LIVEWIRE hashes already-resolved: ' + already + '/26');
  return { before, hashes, already };
}

async function openResident(br, root, key, minChildren, deadlineMs) {
  const server = makeServer(root);
  await new Promise(r => server.listen(0, r));
  const pg = await br.newPage(); await pg.setViewport({ width: 1280, height: 850, deviceScaleFactor: 1 });
  const logs = [], errs = [];
  pg.on('console', m => logs.push(m.text()));
  pg.on('pageerror', e => errs.push(String(e).slice(0, 300)));
  await pg.goto(`http://localhost:${server.address().port}/modeller/modeller.html`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('window.__sceneReady === true && !!window.Bonsai', { timeout: 30000 }).catch(() => {});
  await pg.click('#b-open'); await sleep(200);
  await pg.click(`#m-open-panel .mo-row[data-key="${key}"]`);
  const deadline = Date.now() + deadlineMs;
  let lastN = -1, stable = 0, n = -1;
  while (Date.now() < deadline) {
    n = await pg.evaluate(() => { const g = window.Bonsai && window.Bonsai.group ? window.Bonsai.group() : null; return g ? g.children.length : -1; }).catch(() => -1);
    if (n === lastN && n > 0) stable++; else stable = 0;
    lastN = n;
    if (stable >= 6 && n >= minChildren) break;
    await sleep(500);
  }
  console.log(`  §SELFHEAL-OPEN ${key} children=${n}`);
  return { pg, logs, errs, server };
}

(async () => {
  console.log('W-PATCH-SELFHEAL — modeller/patches/ self-heal loader\n');
  const gt = groundTruth();

  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

  const RESIDENTS = [
    { key: 'SampleHouse', db: 'SampleHouse_ARC.db', expectSpatial: 6, minChildren: 2 },
    { key: 'Duplex', db: 'Duplex_ARC.db', expectSpatial: 25, minChildren: 20 },
    { key: 'SampleCastle', db: 'SampleCastle_ARC.db', expectSpatial: 55, minChildren: 20 },
    { key: 'HHS', db: 'HHS_ARC.db', expectSpatial: 109, minChildren: 20 },
    { key: 'Clinic', db: 'Clinic_ARC.db', expectSpatial: 200, minChildren: 20 },
    { key: 'Hospital', db: 'Hospital_ARC.db', expectSpatial: 208, minChildren: 20 },
    { key: 'HospitalGarage', db: 'Garage_ARC.db', expectSpatial: 6, minChildren: 2 },
    { key: 'Terminal', db: 'Terminal_ARC.db', expectSpatial: gt.before['Terminal_ARC.db'], minChildren: 20, noPatch: true },
  ];

  for (const r of RESIDENTS) {
    const { pg, logs, errs, server } = await openResident(br, ROOT, r.key, r.minChildren, 180000);

    const applyLine = logs.find(l => l.indexOf('§PATCH-APPLY ' + r.db + ' applied') >= 0);
    if (r.noPatch) {
      chk(`${r.key} P2 NOPATCH-OK — no patch file, loader 404-skips silently`, !applyLine, applyLine || 'no §PATCH-APPLY line (expected)');
    } else {
      chk(`${r.key} P1 STALE-ARC — §PATCH-APPLY ${r.db} fired live`, !!applyLine, applyLine || 'MISSING §PATCH-APPLY line');
    }
    const meshApply = logs.find(l => l.indexOf('§PATCH-APPLY mesh.db applied') >= 0);
    chk(`${r.key} mesh.db patch fired live (geoDb path)`, !!meshApply, meshApply || 'MISSING §PATCH-APPLY mesh.db line');

    // Live, in-browser row count read straight off the PATCHED buffer the walker actually opened
    // (window.__dwBuf — set by _openBuffer to whatever buffer openResident handed it, i.e. POST-patch).
    const liveCount = await pg.evaluate(() => {
      try {
        if (!window.__dwBuf || !window.SQL) return -2;
        const d = new window.SQL.Database(new Uint8Array(window.__dwBuf));
        const res = d.exec("SELECT COUNT(*) FROM spatial_structure");
        d.close();
        return res.length ? res[0].values[0][0] : -1;
      } catch (e) { return -1; }
    });
    chk(`${r.key} live spatial_structure row count = ${r.expectSpatial}`, liveCount === r.expectSpatial, `got ${liveCount}`);

    // Live, in-browser mesh-hash resolve off the PATCHED geoDb buffer (window.__dwGeoBuf).
    const liveResolved = await pg.evaluate((hashes) => {
      try {
        if (!window.__dwGeoBuf || !window.SQL) return -2;
        const d = new window.SQL.Database(new Uint8Array(window.__dwGeoBuf));
        let n = 0;
        for (const h of hashes) { const res = d.exec("SELECT 1 FROM component_geometries WHERE geometry_hash='" + h + "'"); if (res.length) n++; }
        d.close();
        return n;
      } catch (e) { return -1; }
    }, gt.hashes);
    chk(`${r.key} live mesh 26/26 §LIVEWIRE hashes resolved`, liveResolved === 26, `resolved ${liveResolved}/26`);

    chk(`${r.key} page zero pageerror`, errs.length === 0, errs[0] || '');
    await pg.close(); server.close();
  }

  // ── P4 MESH-FALSIFIER: deliberately stale a scratch copy of mesh.db (strip the 26 §LIVEWIRE rows,
  // reproducing the real pre-670bf0f / stale-browser-cache shape MDB001's own header describes) and
  // confirm the SAME live open path heals it 0/26 → 26/26. This is the mechanical proof the loader
  // does something for mesh.db, not just a no-op replay on already-current data (P3, covered above). ──
  {
    const scratch = fs.mkdtempSync(path.join(require('os').tmpdir(), 'patch-selfheal-'));
    fs.cpSync(path.join(ROOT, 'modeller'), path.join(scratch, 'modeller'), { recursive: true, filter: (src) => !/(^|\/)(logs|node_modules)(\/|$)/.test(src) });
    fs.mkdirSync(path.join(scratch, 'viewer'), { recursive: true });
    fs.cpSync(path.join(ROOT, 'viewer'), path.join(scratch, 'viewer'), { recursive: true, filter: (src) => !/(^|\/)(logs|node_modules)(\/|$)/.test(src) });
    const staleDb = new Database(path.join(scratch, 'modeller', 'mesh.db'));
    const del = staleDb.prepare('DELETE FROM component_geometries WHERE geometry_hash=?');
    let stripped = 0;
    for (const h of gt.hashes) stripped += del.run(h).changes;
    staleDb.close();
    const preCheck = new Database(path.join(scratch, 'modeller', 'mesh.db'), { readonly: true });
    const preResolved = gt.hashes.filter(h => preCheck.prepare('SELECT 1 FROM component_geometries WHERE geometry_hash=?').get(h)).length;
    preCheck.close();
    console.log(`  §FALSIFIER-SETUP stripped=${stripped} pre-open resolved=${preResolved}/26 (expect 0)`);

    const { pg, logs, errs, server } = await openResident(br, scratch, 'SampleHouse', 2, 60000);
    const meshApply = logs.find(l => l.indexOf('§PATCH-APPLY mesh.db applied') >= 0);
    chk('P4 FALSIFIER §PATCH-APPLY mesh.db fired on deliberately-staled copy', !!meshApply, meshApply || 'MISSING line');
    const liveResolved = await pg.evaluate((hashes) => {
      const d = new window.SQL.Database(new Uint8Array(window.__dwGeoBuf));
      let n = 0;
      for (const h of hashes) { const res = d.exec("SELECT 1 FROM component_geometries WHERE geometry_hash='" + h + "'"); if (res.length) n++; }
      d.close();
      return n;
    }, gt.hashes);
    chk('P4 FALSIFIER live mesh healed 0/26 → 26/26', preResolved === 0 && liveResolved === 26, `pre=${preResolved} post=${liveResolved}`);
    chk('P4 FALSIFIER page zero pageerror', errs.length === 0, errs[0] || '');
    await pg.close(); server.close();
    fs.rmSync(scratch, { recursive: true, force: true });
  }

  await br.close();
  console.log(`\nW-PATCH-SELFHEAL: ${pass}/${pass + fail} PASS${fail ? ' — ' + fail + ' FAIL' : ''}`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('W-PATCH-SELFHEAL crashed:', e); process.exit(1); });
