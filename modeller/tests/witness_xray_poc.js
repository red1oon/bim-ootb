#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — W-XRAY-POC scope (read the log after every run)
 * SCOPE: prompts/Modeller/DISC_Walker/XRAY_FIXTURE_CLASSIFICATION_FIX.md §POC GATE.
 * Measures, on real op-log/mesh data (SampleCastle primary, Duplex regression-control), whether the
 * proposed discriminator (mesh.userData.dwDisc != null) actually separates authored ARC elements (walls)
 * from walked MEP fixtures — BEFORE any code change to xrayReveal()/_fixtureColorMap(). Logs one
 * §XRAYPOC line per sampled fid: fid, hasColorParam, hasDwDisc, class. For Duplex, additionally logs each
 * wall's resolved PALETTE hex to settle G3 (coincidence vs correct classification).
 */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ROOT = path.join(__dirname, '..', '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.css': 'text/css', '.db': 'application/octet-stream', '.data': 'application/octet-stream' };
const server = http.createServer((q, r) => { let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/modeller/modeller.html';
  fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { r.writeHead(404); r.end('404'); return; } r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Accept-Ranges': 'bytes' }); r.end(b); }); });

async function measure(pg, key, walkDisc) {
  console.log(`\n═══ ${key} ═══`);
  await pg.click('#b-open'); await sleep(200);
  await pg.click(`#m-open-panel .mo-row[data-key="${key}"]`);
  await pg.waitForFunction('window.__sceneReady === true && !!window.Bonsai', { timeout: 60000 }).catch(() => {});
  await sleep(4000);

  if (walkDisc) {
    const dwName = await pg.evaluate(() => window.__dwName);
    console.log(`  __dwName=${dwName}`);
    await pg.evaluate((d, b) => window.discWalk(d, { building: b }), walkDisc, key);
    const ok = await pg.waitForFunction((d) => window.__dwLastCommitDisc === d, { timeout: 180000, polling: 250 }, walkDisc).then(() => true).catch(() => false);
    console.log(`  walk-commit-seen=${ok}`);
    await sleep(1000);
  }

  const result = await pg.evaluate((walkDisc) => {
    const g = window.Bonsai.group && window.Bonsai.group();
    const O = window.Bonsai.oplog;
    const colorMap = {}, classMap = {};
    if (O) O._geomOps().forEach(o => {
      if (o.op_type !== 'GEOM_INSERT' || !o.parameters) return;
      if (o.parameters.color != null) colorMap[o.id] = o.parameters;
      if (o.parameters.ifc_class != null) classMap[o.id] = o.parameters.ifc_class;
    });

    const walls = [];
    const fixtures = [];
    const dwRoot = g ? g.children.find(o => o.userData && o.userData.dwRoot) : null;
    // top-level g.children = authored ARC elements (the population xrayReveal()'s forEach actually visits today)
    if (g) g.children.forEach(o => {
      if (!o.isMesh || o === dwRoot) return;
      const ud = o.userData || {};
      const fid = ud.featureId;
      if (fid != null && classMap[fid] === 'IfcWall' && walls.length < 10) {
        const cp = colorMap[fid];
        walls.push({ fid: fid, hasDwDisc: ud.dwDisc != null || ud.dwAsm != null, hasColorParam: cp != null, paletteHex: cp && cp.color != null ? '0x' + (cp.color >>> 0).toString(16).padStart(6, '0') : null, ifc_class: classMap[fid] });
      }
    });
    // walked-fixture InstancedMesh buckets live ONE LEVEL DEEPER, under dwRoot — NOT direct children of g
    if (dwRoot) dwRoot.children.forEach(o => {
      if (fixtures.length >= 10) return;
      const ud = o.userData || {};
      const fid = ud.featureId;   // measured: InstancedMesh buckets carry dwDisc/dwSub, NOT featureId (see modeller.html:3694)
      fixtures.push({ fid: fid, hasDwDisc: ud.dwDisc != null || ud.dwAsm != null, dwDisc: ud.dwDisc || ud.dwAsm, hasColorParam: fid != null && colorMap[fid] != null, isInstancedMesh: !!o.isInstancedMesh, count: o.count || null });
    });
    return { walls: walls, fixtures: fixtures, totalChildren: g ? g.children.length : 0, dwRootChildCount: dwRoot ? dwRoot.children.length : -1,
      reachableByShallowLoop: g ? g.children.filter(o => o.isMesh).length : 0 };
  }, walkDisc);

  result.walls.forEach(w => console.log(`§XRAYPOC building=${key} kind=wall fid=${w.fid} hasColorParam=${w.hasColorParam} hasDwDisc=${w.hasDwDisc} class=${w.ifc_class} paletteHex=${w.paletteHex}`));
  result.fixtures.forEach(f => console.log(`§XRAYPOC building=${key} kind=fixture fid=${f.fid} hasColorParam=${f.hasColorParam} hasDwDisc=${f.hasDwDisc} disc=${f.dwDisc} isInstancedMesh=${f.isInstancedMesh} count=${f.count}`));
  console.log(`§XRAYPOC building=${key} summary walls=${result.walls.length} fixtures=${result.fixtures.length} totalChildren=${result.totalChildren} dwRootChildCount=${result.dwRootChildCount} reachableByShallowLoop(g.children.forEach)=${result.reachableByShallowLoop}`);
  return result;
}

(async () => {
  await new Promise(r => server.listen(0, r)); const port = server.address().port;
  const br = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const pg = await br.newPage(); await pg.setViewport({ width: 1200, height: 850, deviceScaleFactor: 1 });
  const errs = []; pg.on('pageerror', e => errs.push(String(e).slice(0, 200)));
  pg.on('console', m => { const t = m.text(); if (t.indexOf('§') !== -1 || /disc.?walk/i.test(t)) console.log('  [page] ' + t.slice(0, 300)); });
  await pg.goto(`http://localhost:${port}/modeller/modeller.html`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('window.__sceneReady === true && !!window.Bonsai && typeof window.discWalk==="function"', { timeout: 30000 }).catch(() => {});

  const sc = await measure(pg, 'SampleCastle', 'ELEC');
  // fresh reload before Duplex to avoid state bleed between residents
  await pg.goto(`http://localhost:${port}/modeller/modeller.html`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('window.__sceneReady === true && !!window.Bonsai && typeof window.discWalk==="function"', { timeout: 30000 }).catch(() => {});
  const dx = await measure(pg, 'Duplex', 'ELEC');

  console.log('\n§XRAYPOC errors=' + errs.length + (errs.length ? ' ' + JSON.stringify(errs) : ''));

  const scOk = sc.walls.length > 0 && sc.walls.every(w => w.hasColorParam && !w.hasDwDisc) &&
               sc.fixtures.length > 0 && sc.fixtures.every(f => f.hasDwDisc);
  const dxOk = dx.walls.length > 0 && dx.fixtures.length > 0 && dx.fixtures.every(f => f.hasDwDisc);
  console.log(`§XRAYPOC GATE sampleCastleOk=${scOk} duplexFixturesOk=${dxOk}`);

  await br.close(); server.close();
  process.exit(scOk && dxOk && errs.length === 0 ? 0 : 1);
})();
