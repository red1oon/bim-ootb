// W-BOM-ORIENT — DAGeVu modeller: placed components STAND upright (Z-up world rendered Z-up). CLAIM: the
// geometry was always correct Z-up; the bug was camera.up=Y laying the 3D view back. Fix = view-dependent up
// (Iso/3D = Z-up so objects stand; Top/sketch = Y-up plan). Verified by MATH (screen projection), no visuals:
// world +Z projects to screen-UP in the iso view, a door's top vertex lands ABOVE its base on screen, and the
// top/sketch views flip to Y-up. (3D draw GPU-gated → projection math is the assertion.)
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
  pg.on('pageerror', e => console.log('  ERR ' + String(e).slice(0, 160)));
  await pg.goto(`http://localhost:${port}/modeller.html`, { waitUntil: 'load', timeout: 60000 });
  await pg.waitForFunction("window.Bonsai && window.Bonsai.library && window.Bonsai.library.ready && window.A && window.A.camera", { timeout: 30000 }).catch(() => {});
  await pg.evaluate(() => window.Bonsai.library.ready());

  const r = await pg.evaluate(async () => {
    const cam = window.A.camera, THREE = window.THREE;
    const ndcY = (x, y, z) => new THREE.Vector3(x, y, z).project(cam).y;   // +1 top of screen, −1 bottom
    const up0 = cam.up.toArray().map(n => +n.toFixed(2));
    // default iso view: a higher world-Z point must project HIGHER on screen than a lower one (Z = screen-up)
    const zUpDefault = ndcY(2, 1, 3) > ndcY(2, 1, 1);

    // insert a real door, frame it (iso), then its TOP (max world-Z) must land above its BASE on screen
    window.Bonsai.grid.define({ xs: [0, 4], ys: [0, 3] }); window.Bonsai.oplog.clear();
    document.getElementById('b-insert').click(); await window.Bonsai.library.ready();
    const door = [...document.querySelectorAll('#ins-body .ins-c')].find(b => /door/i.test(b.textContent + b.title));
    door.click();
    const c = document.getElementById('c'), rect = c.getBoundingClientRect();
    const v = new THREE.Vector3(2, 1.5, 0).project(cam);
    c.dispatchEvent(new PointerEvent('pointerdown', { button: 0, clientX: rect.left + (v.x + 1) / 2 * rect.width, clientY: rect.top + (1 - v.y) / 2 * rect.height, bubbles: true }));
    for (let i = 0; i < 80 && window.Bonsai.oplog.length < 1; i++) await new Promise(r => setTimeout(r, 50));
    // wait for the lazy real-mesh refold
    const meshOf = () => { const g = window.Bonsai.group(); return g.children.find(o => o.isMesh && o.userData.featureId === 1); };
    for (let i = 0; i < 80 && (!meshOf() || meshOf().geometry.index.count / 3 <= 12); i++) await new Promise(r => setTimeout(r, 50));
    document.getElementById('b-fit').click(); await new Promise(r => setTimeout(r, 200));   // iso fit
    const m = meshOf(); const pos = m.geometry.attributes.position; let topZ = -1e9, botZ = 1e9, topNdc = null, botNdc = null;
    for (let i = 0; i < pos.count; i++) { const z = pos.getZ(i); if (z > topZ) { topZ = z; topNdc = ndcY(pos.getX(i), pos.getY(i), z); } if (z < botZ) { botZ = z; botNdc = ndcY(pos.getX(i), pos.getY(i), z); } }
    const doorUpright = topNdc > botNdc && (topZ - botZ) > 1.0;   // a tall door, top above base on screen

    // Top view → Y-up plan
    document.getElementById('b-view').click(); await new Promise(r => setTimeout(r, 100));   // Iso → Top
    const upTop = cam.up.toArray().map(n => +n.toFixed(2));
    document.getElementById('b-view').click(); await new Promise(r => setTimeout(r, 100));   // back to Iso
    const upIso = cam.up.toArray().map(n => +n.toFixed(2));

    return { up0, zUpDefault, topZ: +topZ.toFixed(2), botZ: +botZ.toFixed(2), doorUpright, upTop, upIso };
  });

  await br.close(); server.close();
  console.log('  §ORIENT ' + JSON.stringify(r));
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const checks = {
    initZup:     eq(r.up0, [0, 0, 1]),                 // camera up is Z at load
    zIsScreenUp: r.zUpDefault === true,                // world +Z projects up on screen (iso)
    doorStands:  r.doorUpright === true,               // door top above base on screen (tall in Z)
    topIsYup:    eq(r.upTop, [0, 1, 0]),               // Top/plan view flips to Y-up
    isoBackZup:  eq(r.upIso, [0, 0, 1])                // returning to Iso restores Z-up
  };
  const pass = Object.values(checks).every(Boolean);
  console.log('  §ORIENT VERDICT ' + (pass ? 'PASS' : 'FAIL') + ' — ' +
    Object.entries(checks).map(([k, v]) => k + '=' + v).join(' ') + '  (3D draw GPU-gated 🟡)');
  process.exit(pass ? 0 : 1);
})();
