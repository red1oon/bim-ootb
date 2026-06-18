// W-BOM-CATALOG — DAGeVu modeller BOM-hierarchy INSERT catalog (prompts/MODELLER_BOM_CATALOG_SPEC.md L1+L2).
// CLAIM: the INSERT panel is a practical BOM catalog extracted NON-INVENT from BOM.db — a search box + an
// ⭐cheat-sheet quick-pick rail + group filter chips + a collapsible category tree (Structure/Openings/
// Furniture). Browsing + inserting need NO 220MB/httpvfs (LOD-200 box proxies from w/d/h dims). A picked part
// commits a signed GEOM_INSERT that renders. 3D draw GPU-gated → DOM structure + oplog length + mesh count assert it.
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
  pg.on('console', m => { const t = m.text(); if (/^§LIBRARY/.test(t)) console.log('  ' + t); });
  pg.on('pageerror', e => console.log('  ERR ' + String(e).slice(0, 160)));
  await pg.goto(`http://localhost:${port}/modeller.html`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction("window.Bonsai && window.Bonsai.library && window.Bonsai.library.ready", { timeout: 30000 }).catch(() => {});
  await pg.evaluate(() => window.Bonsai.library.ready());

  const cat = await pg.evaluate(() => {
    const L = window.Bonsai.library;
    return { products: L.catalog().length, groups: L.groups().length, cheat: L.cheatsheet().length,
             groupLabels: L.groups().map(g => g.label + ':' + g.categories.length),
             searchBed: L.search('bed').length };
  });

  // Open the panel + exercise the UI: chips, category expand, search, then pick a cheat item + place it.
  const ui = await pg.evaluate(async () => {
    document.getElementById('b-insert').click();              // enterInsert → renderCatalog
    await window.Bonsai.library.ready();
    const panel = document.getElementById('ins-panel');
    const out = { panel: !!panel, search: !!document.getElementById('ins-search'),
      chips: document.querySelectorAll('.ins-chip').length, cheatBtns: 0, catRows: document.querySelectorAll('.ins-cat').length };
    // cheat rail buttons live above the tree (count .ins-c before any cat expand)
    out.cheatBtns = document.querySelectorAll('#ins-body .ins-c').length;
    // expand the Door category → product buttons appear
    const doorCat = [...document.querySelectorAll('.ins-cat')].find(d => /Door/.test(d.textContent));
    if (doorCat) doorCat.click();
    out.afterExpand = document.querySelectorAll('#ins-body .ins-c').length;
    // search narrows
    const s = document.getElementById('ins-search'); s.value = 'bed'; s.dispatchEvent(new Event('input'));
    out.searchResults = document.querySelectorAll('#ins-body .ins-c').length;
    out.searchAllBed = [...document.querySelectorAll('#ins-body .ins-c')].every(b => /bed/i.test(b.textContent + b.title));
    s.value = ''; s.dispatchEvent(new Event('input'));
    return out;
  });

  // INSERT a real catalog part (a Wall from the cheat sheet) → signed GEOM_INSERT renders.
  const ins = await pg.evaluate(async () => {
    window.Bonsai.grid.define({ xs: [0, 4, 8], ys: [0, 3], xlabels: ['A', 'B', 'C'], ylabels: ['1', '2'] });
    window.Bonsai.oplog.clear();
    // pick a Wall cheat item
    const wallBtn = [...document.querySelectorAll('#ins-body .ins-c')].find(b => /wall/i.test(b.textContent + b.title));
    if (wallBtn) wallBtn.click();
    const picked = wallBtn ? wallBtn.getAttribute('data-hash') : null;
    const canvas = document.getElementById('c'); const rect = canvas.getBoundingClientRect();
    const THREE = window.THREE, cam = window.A.camera;
    const v = new THREE.Vector3(4, 3, 0).project(cam);
    canvas.dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientX: rect.left + (v.x + 1) / 2 * rect.width, clientY: rect.top + (1 - v.y) / 2 * rect.height, bubbles: true }));
    for (let i = 0; i < 80 && window.Bonsai.oplog.length < 1; i++) await new Promise(r => setTimeout(r, 50));
    const g = window.Bonsai.group(); const meshes = g ? g.children.filter(o => o.isMesh).length : 0;
    const op = window.Bonsai.oplog._geomOps().find(o => o.op_type === 'GEOM_INSERT');
    return { picked, length: window.Bonsai.oplog.length, meshes, insertedHash: op ? op.parameters.hash : null };
  });

  await br.close(); server.close();
  console.log('  §LIBRARY catalog=' + JSON.stringify(cat));
  console.log('  §LIBRARY ui=' + JSON.stringify(ui));
  console.log('  §LIBRARY insert=' + JSON.stringify(ins));
  const checks = {
    catalogLoaded: cat.products >= 80 && cat.groups === 3 && cat.cheat >= 12,
    searchEngine:  cat.searchBed >= 1,
    panelBuilt:    ui.panel && ui.search && ui.chips === 5 && ui.catRows >= 8,   // chips: All/Struct/Open/Furn/Sets
    cheatRail:     ui.cheatBtns >= 12,
    expandWorks:   ui.afterExpand > ui.cheatBtns,
    searchNarrows: ui.searchResults >= 1 && ui.searchAllBed,
    insertRenders: ins.picked && ins.length === 1 && ins.meshes === 1 && ins.insertedHash === ins.picked
  };
  const pass = Object.values(checks).every(Boolean);
  console.log('  §LIBRARY VERDICT ' + (pass ? 'PASS' : 'FAIL') + ' — ' +
    Object.entries(checks).map(([k, v]) => k + '=' + v).join(' ') + '  (3D draw GPU-gated 🟡)');
  process.exit(pass ? 0 : 1);
})();
