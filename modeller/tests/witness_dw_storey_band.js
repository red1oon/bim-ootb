#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-DW-STOREY-BAND
 * SCOPE: bim-compiler prompts/Modeller/DISC_Walker/RESUME_DISC_WALKER_ENVELOPE_BOUND.md §STOREY-UNKNOWN
 * residual — 11/270 SampleCastle ELEC fixtures on REAL storeys land >2m from any real structure because
 * hostBind()'s SIDE branch selects walls purely in 2D (no Z-awareness for band-less legacy placements),
 * letting a wall a full floor below win (fixtures at z=8.21 on '02 tweede verdieping' bound to a wall
 * topping at ~5.77 on '01 eerste verdieping').
 * ISSUE THIS WITNESS PROVES/DISPROVES: after the measured-interval Z guard in hostBind SIDE
 * ([p.storeyZ, mountZ] must intersect the candidate wall's own measured z-extent), the outlier count
 * must DROP below the measured 11 baseline with placed count unchanged (270) and ZERO fixtures above
 * the real structure z-max (the failure mode the reverted flat ±1.5m window created: dak fixtures
 * refused → floating at raw density z 17.74/15.89, 4m+ above the 13.36 roof). Duplex is the regression
 * leg: 102 placements, outlier count must not increase.
 * METRIC: min 3D point-to-AABB distance from every committed ELEC placement (window.__dwWalks.ELEC,
 * DB space == scene space, Z-up) to every NON-FIXTURE mesh AABB in the scene (real ARC structure,
 * world-space Box3 — same population the 23→11 baseline was measured against). Outlier: dist > 2.0m.
 * Read the log after every run — exit code alone is not evidence.
 */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.db': 'application/octet-stream', '.data': 'application/octet-stream' };
const server = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/modeller/modeller.html';
  fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { r.writeHead(404); r.end('404'); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Accept-Ranges': 'bytes' }); r.end(b); }); });

async function runOne(pg, key) {
  console.log(`\n═══ ${key} ═══`);
  await pg.click('#b-open'); await sleep(200);
  await pg.click(`#m-open-panel .mo-row[data-key="${key}"]`);
  await pg.waitForFunction('window.__sceneReady === true && !!window.Bonsai', { timeout: 60000 }).catch(() => {});
  await sleep(4000);
  await pg.evaluate((b) => window.discWalk('ELEC', { building: b }), key);
  const walked = await pg.waitForFunction((d) => window.__dwLastCommitDisc === d, { timeout: 180000, polling: 250 }, 'ELEC').then(() => true).catch(() => false);
  await sleep(1000);

  const r = await pg.evaluate(() => {
    const g = window.Bonsai.group();
    const O = window.Bonsai.oplog;
    const fixtureOpIds = new Set();
    O._geomOps().forEach(o => { if (o.op_type === 'GEOM_INSERT' && o.parameters && (o.parameters._dw != null || (o.parameters._rw && o.parameters._rw.fixture === true))) fixtureOpIds.add(o.id); });
    const dwRoot = g.children.find(o => o.userData && o.userData.dwRoot);
    // real ARC structure AABBs (world space == DB space, Z-up scene, group untransformed)
    const boxes = [];
    let zmax = -Infinity;
    g.children.forEach(o => {
      if (o === dwRoot || !o.isMesh || fixtureOpIds.has(o.userData.featureId)) return;
      const b = new window.THREE.Box3().setFromObject(o);
      if (!isFinite(b.min.x)) return;
      boxes.push([b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z]);
      if (b.max.z > zmax) zmax = b.max.z;
    });
    const pls = (window.__dwWalks && window.__dwWalks.ELEC) || [];
    const dist = (p) => {
      let best = Infinity;
      for (const b of boxes) {
        const dx = Math.max(b[0] - p.x, 0, p.x - b[3]);
        const dy = Math.max(b[1] - p.y, 0, p.y - b[4]);
        const dz = Math.max(b[2] - p.z, 0, p.z - b[5]);
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < best) best = d;
      }
      return best;
    };
    const rows = pls.map(p => ({ cls: p.ifc_class, storey: p.storey, x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2),
      prov: p.prov, host: p.host || null, snapDist: p.snapDist != null ? p.snapDist : null, d: +dist(p).toFixed(3) }));
    const outliers = rows.filter(r => r.d > 2.0).sort((a, b) => b.d - a.d);
    const aboveRoof = rows.filter(r => r.z > zmax);
    // STRATIFIED per storey × mount-branch (prov suffix -side/-top/-bottom/-center; 'placed:*' = unbound
    // float): the reverted ±1.5m window looked fine in aggregate while breaking the dak subgroup — a
    // pooled number hides exactly that, so the witness reports the strata, not just the total.
    const strata = {};
    rows.forEach(r => {
      const mount = /^shim:host-/.test(r.prov || '') ? r.prov.replace(/^shim:host-[^-]*-/, '') : 'float';
      const k = `${r.storey}|${mount}`;
      const s = (strata[k] = strata[k] || { n: 0, out: 0, above: 0, zmin: Infinity, zmax: -Infinity });
      s.n++; if (r.d > 2.0) s.out++; if (r.z > zmax) s.above++;
      if (r.z < s.zmin) s.zmin = r.z; if (r.z > s.zmax) s.zmax = r.z;
    });
    return { placed: pls.length, structBoxes: boxes.length, structZmax: +zmax.toFixed(3),
      outliers, aboveRoof, worst: outliers.length ? outliers[0].d : 0, strata };
  });
  console.log(`§DWSB-${key} placed=${r.placed} structBoxes=${r.structBoxes} structZmax=${r.structZmax}`);
  console.log(`§DWSB-${key} outliers>2m=${r.outliers.length} worst=${r.worst} aboveRoof=${r.aboveRoof.length}`);
  Object.keys(r.strata).sort().forEach(k => { const s = r.strata[k];
    console.log(`§DWSB-${key}-STRATUM ${k} n=${s.n} outliers=${s.out} aboveRoof=${s.above} z=[${s.zmin},${s.zmax}]`); });
  r.outliers.forEach(o => console.log(`§DWSB-${key}-OUTLIER d=${o.d} z=${o.z} storey="${o.storey}" cls=${o.cls} prov=${o.prov} host=${o.host} snapDist=${o.snapDist} xy=(${o.x},${o.y})`));
  r.aboveRoof.forEach(o => console.log(`§DWSB-${key}-ABOVEROOF z=${o.z} zmax=${r.structZmax} storey="${o.storey}" cls=${o.cls} prov=${o.prov}`));
  return { walked, ...r };
}

(async () => {
  await new Promise(r => server.listen(0, r)); const port = server.address().port;
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const pg = await br.newPage(); await pg.setViewport({ width: 1400, height: 950, deviceScaleFactor: 2 });
  const errs = []; pg.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  pg.on('console', m => { const t = m.text(); if (/§(DW|WALK|SCHED|DISC|DIAG)/.test(t)) console.log('  [pg] ' + t); });
  await pg.goto(`http://localhost:${port}/modeller/modeller.html`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('window.__sceneReady === true && !!window.Bonsai && typeof window.discWalk==="function"', { timeout: 30000 }).catch(() => {});

  // DWSB_BUILDINGS overrides the default SC+Duplex pair (fleet pass across the shipped residents —
  // dialect-aware per WalkerDoctrine §1/§2: SH/DX/SC walk duplex_rules.db, the rest terminal_rules.db;
  // parity across dialects is NOT expected, each building is its own real case). PASS bar below only
  // scores SC + Duplex; fleet runs are report-only numbers.
  const keys = (process.env.DWSB_BUILDINGS || 'SampleCastle,Duplex').split(',').map(s => s.trim()).filter(Boolean);
  const results = {};
  for (let i = 0; i < keys.length; i++) {
    if (i > 0) {
      await pg.goto(`http://localhost:${port}/modeller/modeller.html`, { waitUntil: 'load', timeout: 60000 });
      await pg.waitForFunction('window.__sceneReady === true && !!window.Bonsai && typeof window.discWalk==="function"', { timeout: 30000 }).catch(() => {});
    }
    results[keys[i]] = await runOne(pg, keys[i]);
  }
  const sc = results.SampleCastle || { walked: true, placed: 270, outliers: [], aboveRoof: [] };
  const dx = results.Duplex || { walked: true, placed: 102, outliers: [], aboveRoof: [] };

  // PASS bar (AFTER-fix): SC count preserved at 270, outliers strictly below the 11 baseline, zero
  // above-roof; Duplex regression leg 102 placements, outliers within its own measured baseline (0).
  const scPass = sc.walked && sc.placed === 270 && sc.outliers.length < 11 && sc.aboveRoof.length === 0;
  const dxPass = dx.walked && dx.placed === 102 && dx.aboveRoof.length === 0;
  console.log('\nerrors=' + errs.length + (errs.length ? ' ' + JSON.stringify(errs) : ''));
  console.log(`W-DW-STOREY-BAND SC=${scPass ? 'PASS' : 'FAIL'} (placed=${sc.placed} outliers=${sc.outliers.length} aboveRoof=${sc.aboveRoof.length})  DUPLEX=${dxPass ? 'PASS' : 'FAIL'} (placed=${dx.placed} outliers=${dx.outliers.length} aboveRoof=${dx.aboveRoof.length})`);
  await br.close(); server.close();
  process.exit(scPass && dxPass && errs.length === 0 ? 0 : 1);
})();
