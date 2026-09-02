#!/usr/bin/env node
/**
 * # ⚠ DO NOT REMOVE — GUIDE-SHOT PROBE (diagnosis only, DISC_WALKER_BRANCH_CLOSEOUT.md Task 2)
 * Discriminates (a) capture-script camera/styling bug vs (b) rendering defect for SHOT 1
 * (duplex_elec_lod400_walk.png). Same boot+walk as guide_shots_combined.js, then 3 frames:
 *   P1 wide shot, NO xray override      — is the content renderable under a sane camera?
 *   P2 wide shot, WITH the xray override — does the wash-out follow the override, not the camera?
 *   P3 close-up of the same hood, NO xray — is the tight framing itself usable without the override?
 * Read the log after every run.
 */
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require(path.join(process.env.HOME, 'bim-ootb', 'tests', 'node_modules', 'playwright'));
const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(__dirname, 'guide_shots');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.wasm': 'application/wasm',
  '.json': 'application/json', '.css': 'text/css', '.db': 'application/octet-stream', '.data': 'application/octet-stream' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

function serve() {
  return new Promise(resolve => {
    const srv = http.createServer((req, res) => {
      const p = decodeURIComponent(req.url.split('?')[0]);
      let fp = path.join(ROOT, p === '/' ? 'modeller/modeller.html' : p);
      if ((p === '/modeller/dagevu_catalog.json' || p === '/modeller/dagevu_geometries.json') && !fs.existsSync(fp)) fp = path.join(ROOT, 'viewer', path.basename(p));
      fs.readFile(fp, (e, buf) => {
        if (e) { console.log('  §SRV-404 ' + p); res.statusCode = 404; return res.end('nf'); }
        res.setHeader('Content-Type', MIME[path.extname(fp)] || 'application/octet-stream');
        res.end(buf);
      });
    });
    srv.listen(0, () => resolve(srv));
  });
}

async function frame(pg, box, opts) {
  await pg.evaluate(([b, o]) => {
    const { camera, controls, renderer, scene } = window.A;
    const cx = (b.min[0] + b.max[0]) / 2, cy = (b.min[1] + b.max[1]) / 2, cz = (b.min[2] + b.max[2]) / 2;
    const sx = b.max[0] - b.min[0], sy = b.max[1] - b.min[1], sz = b.max[2] - b.min[2];
    const dist = o.dist || Math.max(sx, sy, sz, 1) * (o.pad || 0.75) * 2.2;
    const d = o.dir || [1, -1, 0.7];
    const dl = Math.hypot(d[0], d[1], d[2]);
    controls.target.set(cx, cy, cz);
    camera.position.set(cx + dist * d[0] / dl, cy + dist * d[1] / dl, cz + dist * d[2] / dl);
    camera.near = 0.05; camera.far = 4000; camera.updateProjectionMatrix();
    controls.update();
    renderer.render(scene, camera);
  }, [box, opts || {}]);
  await sleep(400);
}

async function shootCanvas(pg, file) {
  const r = await pg.evaluate(() => { const c = document.querySelector('canvas'); const b = c.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; });
  await pg.screenshot({ path: file, clip: r, timeout: 15000 });
  console.log('  §SHOT ' + path.basename(file));
}

(async () => {
  const srv = await serve(); const port = srv.address().port;
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const logs = [], errs = [];
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
  const pg = await ctx.newPage();
  pg.on('console', m => { logs.push(m.text()); if (m.type() === 'error') errs.push('CONSOLE-ERROR ' + m.text().slice(0, 200)); });
  pg.on('pageerror', e => errs.push('PAGEERROR ' + String(e).slice(0, 200)));
  await pg.goto(`http://localhost:${port}/modeller/modeller.html`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction('window.__sceneReady === true && !!window.SQL && !!window.Bonsai', null, { timeout: 30000 });
  await pg.click('#b-open'); await sleep(200);
  await pg.click('#m-open-panel .mo-row[data-key="Duplex"]');
  let lastN = -1, stable = 0, n = -1;
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    n = await pg.evaluate(() => { const g = window.Bonsai.group && window.Bonsai.group(); return g ? g.children.length : -1; }).catch(() => -1);
    if (n === lastN && n > 0) stable++; else stable = 0;
    lastN = n;
    if (stable >= 8) break;
    await sleep(500);
  }
  console.log(`  §OPEN Duplex children=${n}`);
  await pg.waitForFunction('window.DiscWalker && window.DiscWalker._ready()', null, { timeout: 25000 }).catch(() => {});
  const before = logs.length;
  await pg.evaluate(() => { window.discWalk('ELEC'); });
  const dl2 = Date.now() + 60000;
  while (Date.now() < dl2) {
    if (logs.slice(before).some(l => l.indexOf('§DISC-WALK ELEC placed=') >= 0)) break;
    await sleep(500);
  }
  await sleep(1200);
  console.log('  ' + (logs.find(l => l.indexOf('§DW-PRIM-LOD disc=ELEC') >= 0) || 'NO §DW-PRIM-LOD').slice(0, 140));
  await pg.evaluate(() => { const t = document.getElementById('ol-collapse'); if (t) t.click(); });
  await sleep(250);
  // same densest-hood derivation as guide_shots_combined.js SHOT 1
  const box = await pg.evaluate(() => {
    const g = window.Bonsai.group(); const root = g.children.find(o => o.userData && o.userData.dwRoot);
    const pts = [];
    root.children.forEach(o => { if (o.userData && o.userData.dwDisc === 'ELEC' && Array.isArray(o.userData.dwSub)) o.userData.dwSub.forEach(p => pts.push([p.x, p.y, p.z])); });
    const zs = pts.map(p => p[2]).sort((a, b) => a - b); const zmed = zs[Math.floor(zs.length / 2)];
    const st = pts.filter(p => Math.abs(p[2] - zmed) < 1.6);
    let best = st[0], bestN = -1;
    st.forEach(a => { const nn = st.filter(b => Math.hypot(a[0] - b[0], a[1] - b[1]) < 4).length; if (nn > bestN) { bestN = nn; best = a; } });
    const hood = st.filter(b => Math.hypot(best[0] - b[0], best[1] - b[1]) < 4.5);
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    hood.forEach(p => { for (let i = 0; i < 3; i++) { if (p[i] < min[i]) min[i] = p[i]; if (p[i] > max[i]) max[i] = p[i]; } });
    return { min, max, n: hood.length, total: pts.length };
  });
  console.log(`  §HOOD n=${box.n}/${box.total} min=${box.min.map(v => v.toFixed(1))} max=${box.max.map(v => v.toFixed(1))}`);
  // whole-building box for the wide frames
  const bldg = await pg.evaluate(() => {
    const b = new window.THREE.Box3().setFromObject(window.Bonsai.group());
    return { min: [b.min.x, b.min.y, b.min.z], max: [b.max.x, b.max.y, b.max.z] };
  });
  // P1 — wide, NO xray
  await frame(pg, bldg, { dir: [1, -1, 0.55] });
  await shootCanvas(pg, path.join(OUT, 'probe_P1_wide_noxray.png'));
  // P2 — same wide frame, WITH the combined-script xray override
  await pg.click('#b-xray'); await sleep(600);
  await pg.evaluate(() => {
    const g = window.Bonsai.group();
    g.traverse(o => {
      if (!o.isMesh || !o.material || o.renderOrder === 999) return;
      if (o.userData && (o.userData.dwDisc || o.userData.dwChain || o.userData.dwAsm || o.userData.dwSub)) return;
      if (!o._xrayOwn) { o.material = o.material.clone(); o._xrayOwn = true; }
      const m = o.material;
      m.transparent = true; m.opacity = 0.05; m.color.setHex(0xaabbcc);
      if (m.emissive) { m.emissive.setHex(0x000000); m.emissiveIntensity = 0; }
      m.depthWrite = false; m.needsUpdate = true;
    });
    window.A.renderer.render(window.A.scene, window.A.camera);
  });
  await sleep(400);
  await shootCanvas(pg, path.join(OUT, 'probe_P2_wide_xray.png'));
  // P3 — close-up of the same hood, xray OFF again (toggle back + restore materials is not trivial;
  // reload-free: just set opacity back on the cloned materials)
  await pg.click('#b-xray'); await sleep(600);
  await pg.evaluate(() => {
    window.Bonsai.group().traverse(o => {
      if (!o.isMesh || !o.material || !o._xrayOwn) return;
      const m = o.material; m.transparent = false; m.opacity = 1; m.color.setHex(0xd8dee6); m.depthWrite = true; m.needsUpdate = true;
    });
    window.A.renderer.render(window.A.scene, window.A.camera);
  });
  await frame(pg, box, { dir: [1, -1, 0.55], dist: 12 });
  await shootCanvas(pg, path.join(OUT, 'probe_P3_hood_noxray.png'));
  console.log('PROBE: done, consoleErrors=' + errs.length + (errs.length ? ' | ' + errs.slice(0, 2).join(' | ') : ''));
  await ctx.close(); await browser.close(); srv.close();
  process.exit(0);
})().catch(e => { console.log('❌ UNCAUGHT ' + String(e && e.message || e).split('\n')[0]); process.exit(1); });
