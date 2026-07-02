#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-ANCHOR-SWEEP scope (READ THE LOG after every run)
 * SCOPE: §ARC-ANCHOR post-fix re-verify of EVERY ARC-seeded resident, visual + by maths
 * (RESUME_MODELLER_ARC_ANCHOR_PLACEMENT.md §Fix design point 5: "witness-green ≠ looks-right").
 * For each resident (SampleHouse / Duplex / SampleCastle / SampleCastle-ARC / Terminal):
 *   1. open it through the REAL user path (#b-open → mo-row click), wait for the seed to settle,
 *   2. MATHS: per rendered ARC element (featureId → kernel_ops.output_guid), live world-AABB centre
 *      vs the ANCHOR-SEMANTICS truth computed INDEPENDENTLY in node (better-sqlite3):
 *          expected centre = center_xyz + AABBcentre( R · rawBlobVerts )
 *      with R = the modeller's own rotation per element (yaw RZ(rz) when rx=ry=0 — which IS the proven
 *      extractor/Viewer convention for upright elements — else the §ARC-3AXIS Euler R = RX(rx)·RY(rz)·RZ(−ry)).
 *      Tilted elements are counted SEPARATELY: for them this asserts fold self-consistency (offset rides the
 *      rotation rigidly); whether the modeller's 3-axis convention equals the Viewer's is the parked
 *      rotation-gap item, NOT this witness's claim. Upright rows are a TRUE ground-truth check.
 *   3. VISUAL: #b-fit then a screenshot per resident → logs/shot_<key>.png (eyeball against the Viewer).
 * PASS bar: per resident, upright maxDC ≤ 1e-3 m (same pinned spatial standard as W-MV-PARITY) and
 * tilted maxDC ≤ 1e-3 m vs the modeller-convention truth; NO-ERROR; screenshot written.
 */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const Database = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'better-sqlite3'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ROOT = path.join(__dirname, '..', '..');
const OUT = process.env.SWEEP_OUT || path.join(ROOT, 'logs');
const TOL = 1e-3;

const RESIDENTS = [
  { key: 'SampleHouse', db: 'SampleHouse_extracted.db', minChildren: 30, deadline: 120000 },
  { key: 'Duplex', db: 'Duplex_extracted.db', minChildren: 200, deadline: 120000 },
  { key: 'SampleCastle', db: 'SampleCastle_extracted.db', minChildren: 2000, deadline: 180000 },
  { key: 'SampleCastle-ARC', db: 'SampleCastle_ARC_extracted.db', minChildren: 2000, deadline: 180000 },
  { key: 'Terminal', db: 'Terminal_meta.db', geoDb: 'Terminal_geo.db', minChildren: 100, deadline: 240000 }
];

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.db': 'application/octet-stream', '.data': 'application/octet-stream' };
const server = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/modeller/modeller.html';
  fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { r.writeHead(404); r.end('404'); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Accept-Ranges': 'bytes' }); r.end(b); });
});

let pass = 0, fail = 0;
const chk = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n + (x ? '  ' + x : '')); } else { fail++; console.log('  ❌ ' + n + (x ? '  ' + x : '')); } };
const fmt = v => (v == null || !isFinite(v)) ? String(v) : (Math.abs(v) < 1e-2 && v !== 0 ? v.toExponential(3) : v.toFixed(4));

// ── 3×3 rotation helpers (Z-up DB space, the modeller's DIRECT convention) ──
function m3mul(a, b) { const o = [[0,0,0],[0,0,0],[0,0,0]]; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) o[i][j] = a[i][0]*b[0][j] + a[i][1]*b[1][j] + a[i][2]*b[2][j]; return o; }
function RX(a) { const c = Math.cos(a), s = Math.sin(a); return [[1,0,0],[0,c,-s],[0,s,c]]; }
function RY(a) { const c = Math.cos(a), s = Math.sin(a); return [[c,0,s],[0,1,0],[-s,0,c]]; }
function RZ(a) { const c = Math.cos(a), s = Math.sin(a); return [[c,-s,0],[s,c,0],[0,0,1]]; }

// expected world AABB centre per guid: center + AABBcentre(R·rawVerts). Exact (per-vertex), so it is valid
// for ARBITRARY rotations — no "AABB centre commutes with R" shortcut (it doesn't, off-axis).
function anchorTruthExact(metaPath, geoPath) {
  const db = new Database(metaPath, { readonly: true });
  const gdb = geoPath ? new Database(geoPath, { readonly: true }) : db;
  const geoTable = (d => {
    const has = t => d.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t);
    return has('component_geometries') ? 'component_geometries' : has('base_geometries') ? 'base_geometries' : null;
  })(gdb);
  if (!geoTable) { db.close(); if (gdb !== db) gdb.close(); return { truth: {}, geoTable: null }; }
  const blob = {};   // hash -> Float32Array raw verts (decoded lazily below)
  const truth = {}; let tilted = 0;
  const rows = db.prepare(
    'SELECT t.guid g, t.center_x cx, t.center_y cy, t.center_z cz, t.rotation_x rx, t.rotation_y ry, t.rotation_z rz, i.geometry_hash h ' +
    'FROM element_transforms t JOIN element_instances i ON i.guid = t.guid').all();
  const getBlob = gdb.prepare(`SELECT vertices v FROM ${geoTable} WHERE geometry_hash = ?`);
  const cache = {};  // (hash|rx|ry|rz) -> rotated AABB centre (instances share hash+rotation constantly)
  for (const r of rows) {
    if (r.cx == null) continue;
    const rx = r.rx || 0, ry = r.ry || 0, rz = r.rz || 0;
    const isTilted = !!(rx || ry); if (isTilted) tilted++;
    const ck = r.h + '|' + rx + '|' + ry + '|' + rz;
    let oc = cache[ck];
    if (!oc) {
      if (!(r.h in blob)) {
        const b = getBlob.get(r.h);
        blob[r.h] = b && b.v ? new Float32Array(b.v.buffer, b.v.byteOffset, b.v.byteLength / 4) : null;
      }
      const f = blob[r.h]; if (!f || f.length < 9) continue;
      const R = isTilted ? m3mul(m3mul(RX(rx), RY(rz)), RZ(-ry)) : RZ(rz);   // modeller's own two fold paths
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (let i = 0; i < f.length; i += 3) {
        const x = f[i], y = f[i+1], z = f[i+2];
        const wx = R[0][0]*x + R[0][1]*y + R[0][2]*z, wy = R[1][0]*x + R[1][1]*y + R[1][2]*z, wz = R[2][0]*x + R[2][1]*y + R[2][2]*z;
        if (wx < x0) x0 = wx; if (wx > x1) x1 = wx; if (wy < y0) y0 = wy; if (wy > y1) y1 = wy; if (wz < z0) z0 = wz; if (wz > z1) z1 = wz;
      }
      oc = cache[ck] = [(x0+x1)/2, (y0+y1)/2, (z0+z1)/2];
    }
    truth[r.g] = { x: r.cx + oc[0], y: r.cy + oc[1], z: r.cz + oc[2], tilted: isTilted };
  }
  db.close(); if (gdb !== db) gdb.close();
  return { truth, geoTable, tilted };
}

(async () => {
  await new Promise(r => server.listen(0, r));
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  fs.mkdirSync(OUT, { recursive: true });

  for (const R of RESIDENTS) {
    console.log(`═══ W-ANCHOR-SWEEP ${R.key} ═══`);
    const t = anchorTruthExact(path.join(ROOT, 'modeller', R.db), R.geoDb ? path.join(ROOT, 'modeller', R.geoDb) : null);
    console.log(`  §SWEEP-TRUTH ${R.key} geoTable=${t.geoTable} truthGuids=${Object.keys(t.truth).length} tiltedRows=${t.tilted || 0}`);

    const pg = await br.newPage(); await pg.setViewport({ width: 1280, height: 850, deviceScaleFactor: 1 });
    const errs = []; pg.on('pageerror', e => errs.push(String(e).slice(0, 200)));
    await pg.goto(`http://localhost:${server.address().port}/modeller/modeller.html`, { waitUntil: 'load', timeout: 60000 });
    await pg.waitForFunction('window.__sceneReady === true && !!window.Bonsai', { timeout: 30000 }).catch(() => {});
    await pg.click('#b-open'); await sleep(200);
    await pg.click(`#m-open-panel .mo-row[data-key="${R.key}"]`);
    // settle: child count stable for 8 consecutive 500ms polls (same doctrine as witness_e2e_terminal_open)
    const deadline = Date.now() + R.deadline;
    let lastN = -1, stable = 0, n = -1;
    while (Date.now() < deadline) {
      n = await pg.evaluate(() => { const g = window.Bonsai && window.Bonsai.group ? window.Bonsai.group() : null; return g ? g.children.length : -1; }).catch(() => -1);
      if (n === lastN && n > 0) stable++; else stable = 0;
      lastN = n;
      if (stable >= 8 && n >= R.minChildren) break;
      await sleep(500);
    }
    console.log(`  §SWEEP-OPEN ${R.key} children=${n} (min=${R.minChildren})`);

    // per-element rendered world-AABB centre, keyed by guid (featureId → kernel_ops.output_guid)
    const live = await pg.evaluate(async () => {
      const THREE = window.THREE;
      const odb = window.Bonsai.oplog.db || await window.Bonsai.oplog._ensureDb();
      const f2g = {}; const kr = odb.exec('SELECT id, output_guid FROM kernel_ops WHERE output_guid IS NOT NULL');
      if (kr.length) kr[0].values.forEach(r => { f2g[r[0]] = r[1]; });
      window.A.scene.updateMatrixWorld(true);
      const box = new THREE.Box3(), v = new THREE.Vector3(), per = {};
      let rendered = 0;
      for (const m of window.Bonsai.group().children) {
        if (!m.isMesh || !m.userData || m.userData.featureId == null) continue;
        rendered++;
        const guid = f2g[m.userData.featureId]; if (!guid) continue;
        box.setFromObject(m); const c = box.getCenter(v);
        per[guid] = { x: c.x, y: c.y, z: c.z };
      }
      return { rendered, per };
    });

    let upN = 0, upMax = 0, upSum = 0, tiN = 0, tiMax = 0, tiSum = 0, joined = 0;
    const offenders = [];
    for (const g in live.per) {
      const T = t.truth[g]; if (!T) continue;
      joined++;
      const p = live.per[g];
      const dc = Math.sqrt((p.x - T.x) ** 2 + (p.y - T.y) ** 2 + (p.z - T.z) ** 2);
      if (T.tilted) { tiN++; tiSum += dc; if (dc > tiMax) tiMax = dc; }
      else { upN++; upSum += dc; if (dc > upMax) upMax = dc; }
      if (dc > TOL) offenders.push({ g, dc, tilted: T.tilted });
    }
    offenders.sort((a, b) => b.dc - a.dc);
    console.log(`  §SWEEP-MATHS ${R.key} rendered=${live.rendered} joined=${joined} upright n=${upN} maxDC=${fmt(upMax)} meanDC=${fmt(upN ? upSum / upN : 0)} | tilted n=${tiN} maxDC=${fmt(tiMax)} meanDC=${fmt(tiN ? tiSum / tiN : 0)} offenders>${TOL}m=${offenders.length}`);
    offenders.slice(0, 5).forEach(o => console.log(`  §SWEEP-OFFENDER ${R.key} guid=${o.g} dc=${fmt(o.dc)} tilted=${o.tilted}`));

    chk(`${R.key} UPRIGHT ≡ ANCHOR GROUND TRUTH (n=${upN}, maxDC ≤ ${TOL} m)`, joined > 0 && upN > 0 && upMax <= TOL, `maxDC=${fmt(upMax)}`);
    if (tiN > 0) chk(`${R.key} TILTED self-consistent (offset rides the 3-axis rotation rigidly, maxDC ≤ ${TOL} m)`, tiMax <= TOL, `n=${tiN} maxDC=${fmt(tiMax)}`);
    chk(`${R.key} NO-ERROR`, errs.length === 0, errs.slice(0, 2).join(' | '));

    await pg.click('#b-fit').catch(() => {});
    await sleep(700);
    const shot = path.join(OUT, `shot_${R.key.replace(/[^A-Za-z0-9_-]/g, '_')}.png`);
    await pg.screenshot({ path: shot });
    const okShot = fs.existsSync(shot) && fs.statSync(shot).size > 10000;
    console.log(`  §SWEEP-SHOT ${R.key} ${shot} bytes=${okShot ? fs.statSync(shot).size : 0}`);
    chk(`${R.key} SCREENSHOT written`, okShot, shot);
    await pg.close();
  }

  await br.close(); server.close();
  console.log('W-ANCHOR-SWEEP: ' + pass + ' PASS / ' + fail + ' FAIL');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('W-ANCHOR-SWEEP FATAL', e); server.close(); process.exit(1); });
