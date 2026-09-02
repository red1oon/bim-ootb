// W-BOM-ORIENT — DAGeVu modeller: objects STAND upright AND the background grid READS AS A FLOOR. The earlier
// rounds (#389/#390/#391) fixed up-vector + GridHelper yet the user still saw it wrong, because the witness
// asserted the WRONG invariant (`gridAxisDeg<28` rewarded an axis-aligned camera — exactly what grazes the floor
// edge-on into a backdrop). Holistic fix: ONE Z-up convention (THREE DEFAULT_UP=Z, level orbit) + a classic-iso
// camera (~43° incidence onto z=0, ~45° azimuth) so BOTH grid families are oblique = a readable diamond floor.
// Verified by MATH (screen projection), calibrated once vs a real render: world +Z projects screen-UP, a door's
// top vertex lands above its base, FLOOR INCIDENCE ∈ [38,60]°, BOTH grid families project oblique (not edge-on).
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
    // GRID READS AS A FLOOR — the two invariants the old `gridAxisDeg<28` check MISSED (and inverted: that check
    // rewarded an axis-aligned camera, which is exactly what grazes the floor edge-on). Both calibrated against a
    // real render (shot_empty.png) so this is now verified by MATH, no eyeballs:
    const aspect = cam.aspect || (window.innerWidth / window.innerHeight);
    // (1) FLOOR INCIDENCE — angle the view ray makes with the z=0 grid plane. ~30° = grazing (grid reads as a
    //     backdrop wall); 38-60° = you look DOWN onto a floor. classic iso ≈ 43°.
    const vd = new THREE.Vector3().subVectors(window.A.controls.target, cam.position);
    const floorIncidenceDeg = +(Math.asin(Math.abs(vd.z) / vd.length()) * 180 / Math.PI).toFixed(1);
    // (2) BOTH GRID FAMILIES OBLIQUE — project a unit X-edge and a unit Y-edge of the floor; for a readable
    //     diamond floor both have substantial on-screen length and are well-separated in angle. A grazing
    //     axis-aligned view collapses one family to ~0 on screen (edge-on) → tiny length or near-parallel.
    const prj = (x, y) => { const p = new THREE.Vector3(x, y, 0).project(cam); return [p.x * aspect, p.y]; };
    const o2 = prj(2, 1.5), xs = prj(3, 1.5), ys = prj(2, 2.5);
    const vx = [xs[0] - o2[0], xs[1] - o2[1]], vy = [ys[0] - o2[0], ys[1] - o2[1]];
    const lx = Math.hypot(...vx), ly = Math.hypot(...vy);
    const famAngleDeg = +(Math.acos(Math.max(-1, Math.min(1, (vx[0] * vy[0] + vx[1] * vy[1]) / (lx * ly)))) * 180 / Math.PI).toFixed(1);
    const bothFamiliesVisible = Math.min(lx, ly) > 0.02;   // neither family edge-on (NDC units)

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

    return { up0, zUpDefault, topZ: +topZ.toFixed(2), botZ: +botZ.toFixed(2), doorUpright, upTop, upIso,
             floorIncidenceDeg, famAngleDeg, bothFamiliesVisible, lx: +lx.toFixed(3), ly: +ly.toFixed(3) };
  });

  await br.close(); server.close();
  console.log('  §ORIENT ' + JSON.stringify(r));
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const checks = {
    initZup:     eq(r.up0, [0, 0, 1]),                 // camera up is Z at load
    zIsScreenUp: r.zUpDefault === true,                // world +Z projects up on screen (iso)
    doorStands:  r.doorUpright === true,               // door top above base on screen (tall in Z)
    floorReads:  r.floorIncidenceDeg >= 38 && r.floorIncidenceDeg <= 60,  // look DOWN onto a floor, not graze it
    diamond:     r.bothFamiliesVisible && r.famAngleDeg >= 35,            // both grid families oblique = readable floor
    topIsYup:    eq(r.upTop, [0, 1, 0]),               // Top/plan view flips to Y-up
    isoBackZup:  eq(r.upIso, [0, 0, 1])                // returning to Iso restores Z-up
  };
  const pass = Object.values(checks).every(Boolean);
  console.log('  §ORIENT VERDICT ' + (pass ? 'PASS' : 'FAIL') + ' — ' +
    Object.entries(checks).map(([k, v]) => k + '=' + v).join(' ') + '  (3D draw GPU-gated 🟡)');
  process.exit(pass ? 0 : 1);
})();
