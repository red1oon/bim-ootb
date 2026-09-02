// W-BOM-MESH — DAGeVu modeller: insert lands a box proxy instantly, then LAZILY upgrades to the real library
// mesh (MODELLER_BOM_CATALOG_SPEC.md L3 "last mile"). CLAIM: each curated product carries a geometry_hash (gh)
// matched NON-INVENT from component_library.db; the real mesh store is fetched ONLY on the first insert (never
// at boot — lazy), and the placed signed row refines from the 12-tri box to the real detailed mesh (tris ≫ 12)
// in place (op_hash/chain unchanged). 3D draw is GPU-gated → triangle counts + lazy-load timing are the asserts.
const http = require('http'), fs = require('fs'), path = require('path');
const VIEWER = path.join(__dirname, '..');
const puppeteer = require(path.join(process.env.HOME, 'bim-compiler', 'node_modules', 'puppeteer'));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm',
  '.json': 'application/json', '.css': 'text/css', '.map': 'application/json' };
const server = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p === '/') p = '/modeller.html';
  fs.readFile(path.join(VIEWER, p), (e, b) => {
    if (e) { r.writeHead(404); r.end('404 ' + p); return; }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' }); r.end(b);
  });
});
(async () => {
  await new Promise(r => server.listen(0, r)); const port = server.address().port;
  const br = await puppeteer.launch({ headless: 'new',
    args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const pg = await br.newPage();
  pg.on('console', m => { const t = m.text(); if (/^§(LIBRARY|MODELLER mesh-upgrade)/.test(t)) console.log('  ' + t); });
  pg.on('pageerror', e => console.log('  ERR ' + String(e).slice(0, 160)));
  await pg.goto(`http://localhost:${port}/modeller.html`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction("window.Bonsai && window.Bonsai.library && window.Bonsai.library.ready", { timeout: 30000 }).catch(() => {});
  await pg.evaluate(() => window.Bonsai.library.ready());

  // LAZY: geometries must NOT be loaded at boot.
  const lazyBefore = await pg.evaluate(() => window.Bonsai.library._geom === null);
  // every curated product carries a matched geometry_hash
  const ghCoverage = await pg.evaluate(() => {
    const all = window.Bonsai.library.catalog();
    const db = all.filter(c => !/^[0-9a-f]{16}$/.test(c.hash) && c.group !== 'asm');   // curated BOM browse products (not 3 legacy, not assembly-only leaves)
    return { total: db.length, withGh: db.filter(c => window.Bonsai.library.get(c.hash).gh).length };
  });

  // Insert a furniture part (real detailed mesh). Box (12 tris) lands first, then lazy upgrade.
  const tris = await pg.evaluate(async () => {
    window.Bonsai.grid.define({ xs: [0, 4, 8], ys: [0, 3] });
    window.Bonsai.oplog.clear();
    document.getElementById('b-insert').click();
    await window.Bonsai.library.ready();
    const desk = [...document.querySelectorAll('#ins-body .ins-c')].find(b => /desk/i.test(b.textContent + b.title))
              || [...document.querySelectorAll('#ins-body .ins-c')].find(b => /bed/i.test(b.textContent + b.title));
    desk.click();
    const picked = desk.getAttribute('data-hash');
    const canvas = document.getElementById('c'), rect = canvas.getBoundingClientRect();
    const v = new THREE.Vector3(4, 3, 0).project(window.A.camera);
    canvas.dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientX: rect.left + (v.x + 1) / 2 * rect.width, clientY: rect.top + (1 - v.y) / 2 * rect.height, bubbles: true }));
    for (let i = 0; i < 60 && window.Bonsai.oplog.length < 1; i++) await new Promise(r => setTimeout(r, 50));
    const meshOf = () => { const g = window.Bonsai.group(); const m = g.children.find(o => o.isMesh && o.userData.featureId === 1); return m && m.geometry.index ? m.geometry.index.count / 3 : -1; };
    const boxTris = meshOf();                                       // 12 = box proxy right after insert
    // wait for the lazy mesh-upgrade re-fold
    for (let i = 0; i < 80 && meshOf() <= 12; i++) await new Promise(r => setTimeout(r, 50));
    return { picked, boxTris, realTris: meshOf(), geomLoaded: !!window.Bonsai.library._geom,
             realMeshTris: (window.Bonsai.library.meshArrays(picked).indices.length / 3) | 0 };
  });

  // QUALITY GUARD: every curated product must resolve to a DETAILED mesh (>12 tris) — no degenerate box
  // matches (the Bed_King-matched-a-box regression). Geometries are loaded by now (the insert fetched them).
  const quality = await pg.evaluate(() => {
    const L = window.Bonsai.library;
    // curated browse products that HAVE a detailed library part. boxOnly = the library's best part for it is
    // itself a box (≤12 faces, e.g. Wardrobe — the only Wardrobe in component_library is 12 faces) → an HONEST
    // box, not a degenerate mismatch; excluded from the detailed-mesh guard (same honesty as W-LOD300).
    const all = L.catalog().filter(c => !/^[0-9a-f]{16}$/.test(c.hash) && c.group !== 'asm');
    const db = all.filter(c => !c.boxOnly);
    let boxy = [], min = 1e9;
    db.forEach(c => { const t = L.meshArrays(c.hash).indices.length / 3; if (t <= 12) boxy.push(c.hash); if (t < min) min = t; });
    const bed = L.catalog().find(c => /bed king/i.test(c.name));
    return { total: db.length, honestBoxes: all.length - db.length, boxy: boxy.length, boxyIds: boxy.slice(0, 8),
             minTris: min, bedKingTris: bed ? L.meshArrays(bed.hash).indices.length / 3 : -1 };
  });

  await br.close(); server.close();
  console.log('  §LIBRARY lazyBefore=' + lazyBefore + ' ghCoverage=' + JSON.stringify(ghCoverage) + ' insert=' + JSON.stringify(tris));
  console.log('  §LIBRARY quality=' + JSON.stringify(quality));
  const checks = {
    lazyAtBoot:   lazyBefore === true,                       // store not fetched until needed
    fullGhMatch:  ghCoverage.withGh === ghCoverage.total && ghCoverage.total >= 80,
    allDetailed:  quality.boxy === 0 && quality.minTris > 12 && quality.bedKingTris > 12,  // no degenerate box matches
    boxFirst:     tris.boxTris === 12,                       // box proxy lands instantly
    lazyLoaded:   tris.geomLoaded === true,                  // fetched on the insert
    realUpgrade:  tris.realTris > 12 && tris.realTris === tris.realMeshTris   // refined to the real detailed mesh
  };
  const pass = Object.values(checks).every(Boolean);
  console.log('  §LIBRARY-MESH VERDICT ' + (pass ? 'PASS' : 'FAIL') + ' — ' +
    Object.entries(checks).map(([k, v]) => k + '=' + v).join(' ') + '  (3D draw GPU-gated 🟡)');
  process.exit(pass ? 0 : 1);
})();
